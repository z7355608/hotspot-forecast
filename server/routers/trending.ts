/**
 * server/routers/trending.ts
 * ═══════════════════════════════════════════════════════════════
 * 热榜 / 热词 tRPC 路由
 *
 * 数据源（双轨）：
 *   优先 — TikHub 平台原生热榜（services/native-trending.ts）
 *           抖音 fetch_hot_rise_list / 小红书 fetch_hot_list /
 *           快手 fetch_kuaishou_hot_list_v2
 *   降级 — low_follower_samples 表样本聚合（兜底，保持向后兼容）
 *
 * 接口：
 *   - hotTopics   平台原生热榜，无原生支持时降级到样本聚合
 *   - hotKeywords 仅样本聚合（暂未引入 native，因为各平台"实时热词"
 *                  与"热搜话题"语义不同，接入需要单独设计）
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import {
  fetchNativeTrendingTopics,
  type NativeTrendingTopic,
} from "../services/native-trending";
import { computeTopicSurges } from "../services/surging-analytics";

function safeParseJson(val: unknown): string[] {
  if (!val) return [];
  // mysql2 driver 默认会把 JSON 列解析成 JS 值，这里直接处理已是数组的情况
  if (Array.isArray(val)) return val.map((s) => String(s));
  try {
    const parsed = JSON.parse(String(val));
    return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
  } catch {
    return [];
  }
}

function splitHashtags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[#,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 把 NativeTrendingTopic[] 适配成前端 TrendRow 期待的结构。
 *
 * 字段映射：
 *   - score    ← hotScore（平台原生热度值，远比 viral_score 真实）
 *   - delta    ← rank_diff（排名变化，正数=上升），不存在时给 0
 *   - isNew    ← rank_diff 不存在 + isHotMark 时认为是新热点
 *   - matchesNiche ← topic 是否包含用户 niche
 *
 * 注：抖音 trends[] 时间序列暂不传给前端，第一阶段只用 hotScore + rankDiff。
 *      二阶段如果要展示「过去 7h 热度走势」迷你图再透传。
 */
function nativeToTrendItems(
  topics: NativeTrendingTopic[],
  niche: string | undefined,
): Array<{
  topic: string;
  avgScore: number;
  sampleCount: number;
  delta: number;
  isNew: boolean;
  matchesNiche: boolean;
}> {
  return topics.map((t) => {
    const matchesNiche = !!niche && t.topic.includes(niche);
    return {
      topic: t.topic,
      // 复用前端 TrendRow 的 score 字段位（"均分"位）展示热度值
      avgScore: t.hotScore,
      sampleCount: t.videoCount ?? 0,
      // delta 用 rankDiff（>0 = 排名上升）；不存在则 0
      delta: typeof t.rankDiff === "number" ? t.rankDiff : 0,
      // isNew：平台标记"热"或"飙升信号"且无 rankDiff 信息时
      isNew: !!t.isHotMark && typeof t.rankDiff !== "number",
      matchesNiche,
    };
  });
}

export const trendingRouter = router({
  /**
   * 上升话题榜（双轨数据源）
   * ─────────────────────────────────────────────────────────
   * 优先：TikHub 平台原生热榜（services/native-trending.ts）
   *        - 抖音：fetch_hot_rise_list（rank_diff + 7h trends 时间序列）
   *        - 小红书：fetch_hot_list（rank_change + word_type）
   *        - 快手：fetch_kuaishou_hot_list_v2（hotValue + pvSoarSignal）
   *        三平台都按 hotScore 倒序，平台原生排好的顺序就是"热度强弱"
   *
   * 降级：当 native 接口失败 / 平台不支持 / 返回空时，
   *        回退到 low_follower_samples 表的样本聚合 SQL（v2 上升榜逻辑）
   *
   * 排序逻辑（仅样本聚合分支用）：
   *   - 主排序键：effectiveDelta（环比涨幅，已做噪声压平）
   *   - 命中用户赛道：+15 加权
   *   过滤：sample_count >= 3, avgScore >= 50, delta > 0 OR isNew
   *
   * 返回的 source 字段告诉前端这次拿的是 native 还是 sample-aggregation，
   * 让前端可以做对应的语义化展示。
   */
  hotTopics: publicProcedure
    .input(
      z.object({
        platform: z.string().optional(),
        limit: z.number().min(1).max(50).default(7),
        niche: z.string().optional(),
        windowDays: z.number().min(1).max(60).default(7),
      }),
    )
    .query(async ({ input }) => {
      const { platform, limit, niche, windowDays } = input;

      // ── 优先走平台原生热榜 ─────────────────────────────
      const native = await fetchNativeTrendingTopics(platform, limit);
      if (native && native.length > 0) {
        return {
          items: nativeToTrendItems(native, niche),
          windowDays,
          platform: platform ?? null,
          source: "native" as const,
        };
      }

      // ── 降级：样本聚合 SQL（v2 上升榜逻辑） ──────────────
      const platformClause = platform ? "AND platform_id = ?" : "";
      const platformParam = platform ? [platform] : [];

      // 当前周期 [now - windowDays, now)
      const currentRows = await query<RowDataPacket[]>(
        `SELECT seed_topic AS topic, COUNT(*) AS sample_count, AVG(viral_score) AS avg_score
         FROM low_follower_samples
         WHERE seed_topic IS NOT NULL AND seed_topic <> ''
           AND author_followers > 0
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           ${platformClause}
         GROUP BY seed_topic`,
        [windowDays, ...platformParam],
      );

      // 上一周期 [now - 2*windowDays, now - windowDays)
      // 同时拉 sample_count，让"上期数据太薄的话题"按 isNew 处理而非伪 delta
      const previousRows = await query<RowDataPacket[]>(
        `SELECT seed_topic AS topic, COUNT(*) AS sample_count, AVG(viral_score) AS avg_score
         FROM low_follower_samples
         WHERE seed_topic IS NOT NULL AND seed_topic <> ''
           AND author_followers > 0
           AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           ${platformClause}
         GROUP BY seed_topic`,
        [windowDays, windowDays * 2, ...platformParam],
      );

      const previousMap = new Map<string, { avgScore: number; sampleCount: number }>();
      for (const row of previousRows as Record<string, unknown>[]) {
        const topic = String(row.topic ?? "");
        const avgScore = Number(row.avg_score ?? 0);
        const sampleCount = Number(row.sample_count ?? 0);
        if (topic) previousMap.set(topic, { avgScore, sampleCount });
      }

      const items = (currentRows as Record<string, unknown>[])
        .map((row) => {
          const topic = String(row.topic ?? "");
          const avgScore = Number(row.avg_score ?? 0);
          const sampleCount = Number(row.sample_count ?? 0);
          const prev = previousMap.get(topic);
          const previousScore = prev?.avgScore ?? 0;
          const previousSampleCount = prev?.sampleCount ?? 0;

          // 上期样本量 < 2 视作 isNew，避免单条上期样本制造伪 delta
          const isNew = previousScore === 0 || previousSampleCount < 2;

          // 原始 delta：环比涨幅 %
          const rawDelta = previousScore > 0
            ? ((avgScore - previousScore) / previousScore) * 100
            : 0;

          // 噪声压平后的 effectiveDelta（用于排序）
          let effectiveDelta = rawDelta;
          if (isNew) {
            effectiveDelta = 50; // 新话题给中等权重，不让它们垄断也不让沉底
          } else if (previousScore < 20) {
            // 上期分太低（< 20）放大噪声很严重，封顶 80
            effectiveDelta = Math.min(rawDelta, 80);
          }

          // 个性化加权：命中赛道 +15（不抢主位，仅做可见性提升）
          const nicheBoost = niche && topic.includes(niche) ? 15 : 0;

          return {
            topic,
            avgScore,
            sampleCount,
            delta: Math.round(rawDelta * 10) / 10,
            isNew,
            matchesNiche: nicheBoost > 0,
            sortKey: effectiveDelta + nicheBoost,
          };
        })
        // 严格过滤：上升榜只放真正"有上升势头且本身有价值"的话题
        //   - sampleCount >= 3：当期数据稳定
        //   - avgScore >= 50：本身分够才有抄的价值（避免"30→35"被吹成上升)
        //   - delta > 0 OR isNew：必须是上升或新话题，下降的不进榜
        .filter(
          (it) =>
            it.topic &&
            it.sampleCount >= 3 &&
            it.avgScore >= 50 &&
            (it.delta > 0 || it.isNew),
        )
        .sort((a, b) => b.sortKey - a.sortKey)
        .slice(0, limit)
        .map(({ sortKey: _sortKey, ...rest }) => rest);

      return {
        items,
        windowDays,
        platform: platform ?? null,
        source: "sample-aggregation" as const,
      };
    }),

  /**
   * 实时热词（标签 + hashtag 频次聚合）
   */
  hotKeywords: publicProcedure
    .input(
      z.object({
        platform: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
        windowDays: z.number().min(1).max(60).default(7),
      }),
    )
    .query(async ({ input }) => {
      const { platform, limit, windowDays } = input;
      const platformClause = platform ? "AND platform_id = ?" : "";
      const platformParam = platform ? [platform] : [];

      const rows = await query<RowDataPacket[]>(
        `SELECT track_tags, hashtags, viral_score
         FROM low_follower_samples
         WHERE author_followers > 0
           AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           ${platformClause}
         ORDER BY viral_score DESC
         LIMIT 500`,
        [windowDays, ...platformParam],
      );

      const counter = new Map<string, { count: number; sumScore: number }>();
      for (const row of rows as Record<string, unknown>[]) {
        const score = Number(row.viral_score ?? 0);
        const tags = safeParseJson(row.track_tags);
        const hashtags = splitHashtags(row.hashtags ? String(row.hashtags) : null);
        for (const k of [...tags, ...hashtags]) {
          const key = k.trim();
          if (!key) continue;
          const cur = counter.get(key) ?? { count: 0, sumScore: 0 };
          cur.count += 1;
          cur.sumScore += score;
          counter.set(key, cur);
        }
      }

      const items = Array.from(counter.entries())
        .map(([keyword, v]) => ({
          keyword,
          count: v.count,
          avgScore: v.count > 0 ? v.sumScore / v.count : 0,
        }))
        .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore)
        .slice(0, limit);

      return { items, windowDays, platform: platform ?? null };
    }),

  /**
   * 作品级飙升话题榜（基于 video_stats_history 时间序列）
   * ─────────────────────────────────────────────────────────
   * 真实"作品级飙升信号"——把每条视频过去 12h 的播放增量按
   * seed_topic 聚合，赛道总增量倒序。
   *
   * 数据流：
   *   video_stats_history（每天 06:00/18:00 各采一次）
   *     → computeVideoSurges 用 window function 取最新 + 上一次快照对比
   *     → JOIN low_follower_samples 拿 seed_topic
   *     → group by 赛道，计算 totalViewDelta
   *
   * 关键性质：
   *   - 必须有 ≥2 个采集点的视频才会进入；首次部署后第二次采集前为空
   *   - 与 hotTopics 的"上升榜"语义不同：hotTopics 是平台话题级热度变化，
   *     surgingTopics 是"我们追踪的具体视频"播放量增量。surgingTopics
   *     更直接反映"哪条具体作品在飙升"，是用户做选题决策的更强信号。
   *
   * 兜底：
   *   - 没数据时返回空数组，前端可降级显示 hotTopics 结果或简单提示
   */
  surgingTopics: publicProcedure
    .input(
      z.object({
        platform: z.string().optional(),
        niche: z.string().optional(),
        limit: z.number().min(1).max(50).default(7),
        /** 视频级最低复合互动增量阈值，默认 100 */
        minInteractionDelta: z.number().min(0).max(1_000_000).default(100),
      }),
    )
    .query(async ({ input }) => {
      const items = await computeTopicSurges({
        platform: input.platform,
        niche: input.niche,
        minInteractionDelta: input.minInteractionDelta,
        limit: input.limit,
      });
      return {
        items,
        platform: input.platform ?? null,
        source: "video-time-series" as const,
        /** 是否有可用的时间序列数据 */
        hasData: items.length > 0,
      };
    }),
});
