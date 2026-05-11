/**
 * server/routers/low-follower.ts
 * ═══════════════════════════════════════════════════════════════
 * 低粉爆款库 tRPC 路由
 *
 * 接口：
 * 1. list — 分页查询低粉爆款列表（支持筛选、排序）
 * 2. stats — 低粉爆款库统计信息（总数、更新时间等）
 * 3. detail — 单条低粉爆款详情
 * 4. scoreHistory — 某条样本的评分历史
 * 5. thresholds — 当前动态阈值配置
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import { buildValidSampleConditions, buildValidSampleClause } from "../legacy/low-follower-source-rules";

// ─────────────────────────────────────────────
// 输入 Schema
// ─────────────────────────────────────────────

const listInputSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(50).default(20),
  /**
   * 排序键：
   *   - viral_score / weighted_interaction / fan_efficiency_ratio / created_at /
   *     author_followers：直接对应 low_follower_samples 列
   *   - recent_view_delta：作品级飙升排序，基于 video_stats_history 算每条样本
   *     "最近一次采集 - 上一次采集"的播放增量。没有时间序列数据的样本沉到末尾，
   *     此时按 viral_score 兜底排。
   */
  sortBy: z
    .enum([
      "viral_score",
      "weighted_interaction",
      "fan_efficiency_ratio",
      "created_at",
      "author_followers",
      "recent_view_delta",
    ])
    .default("viral_score"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  platform: z.string().optional(),
  contentForm: z.string().optional(),
  seedTopic: z.string().optional(),
  minViralScore: z.number().min(0).max(100).optional(),
  strictOnly: z.boolean().optional(),
  search: z.string().optional(),
  /** Personalization signals from onboarding context */
  userNiches: z.array(z.string()).optional(),
  userStage: z.enum(["starter", "growing", "breakout", "monetizing"]).optional(),
  /**
   * 新鲜度时间窗（天）。仅保留 `video_published_at` 或 `last_refreshed_at`
   * 在最近 N 天内的样本，用于过滤"陈旧"的爆款。不传则不约束（向后兼容）。
   */
  windowDays: z.number().min(1).max(365).optional(),
});

// Map account stage to follower count range. "none" (no account yet) is
// intentionally excluded — when users have no account they shouldn't be
// constrained to any tier.
const STAGE_FOLLOWER_RANGES: Record<string, [number, number]> = {
  starter: [1, 999],
  growing: [1000, 9999],
  breakout: [10000, 99999],
  monetizing: [100000, Number.MAX_SAFE_INTEGER],
};

// ─────────────────────────────────────────────
// 路由定义
// ─────────────────────────────────────────────

export const lowFollowerRouter = router({
  /**
   * 分页查询低粉爆款列表
   */
  list: publicProcedure
    .input(listInputSchema)
    .query(async ({ input }) => {
      const { page, pageSize, sortBy, sortOrder, platform, contentForm, seedTopic, minViralScore, strictOnly, search, userNiches, userStage, windowDays } = input;
      const offset = (page - 1) * pageSize;

      // 构建 WHERE 条件 — 基础"valid sample"过滤抽到 source-field-rules.ts 集中管理
      // (新增 source 只改那里,不改本 router)。详见 [low-follower-source-rules.ts]
      const conditions: string[] = [...buildValidSampleConditions()];
      const params: unknown[] = [];

      if (platform) {
        conditions.push("platform_id = ?");
        params.push(platform);
      }
      if (contentForm) {
        conditions.push("content_form = ?");
        params.push(contentForm);
      }
      if (seedTopic) {
        conditions.push("seed_topic LIKE ?");
        params.push(`%${seedTopic}%`);
      }
      if (minViralScore !== undefined) {
        conditions.push("viral_score >= ?");
        params.push(minViralScore);
      }
      if (strictOnly) {
        conditions.push("is_strict_hit = 1");
      }
      if (search) {
        conditions.push("(video_title LIKE ? OR author_nickname LIKE ? OR seed_topic LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Personalization: niche match (OR over user-selected niches; skip "其他" which carries no signal)
      const meaningfulNiches = (userNiches ?? []).filter((n) => n && n !== "其他");
      if (meaningfulNiches.length > 0) {
        const ors = meaningfulNiches.map(() => "(seed_topic LIKE ? OR track_tags LIKE ?)").join(" OR ");
        conditions.push(`(${ors})`);
        for (const n of meaningfulNiches) {
          params.push(`%${n}%`, `%${n}%`);
        }
      }

      // Personalization: account stage → follower-count range
      if (userStage && STAGE_FOLLOWER_RANGES[userStage]) {
        const [min, max] = STAGE_FOLLOWER_RANGES[userStage];
        conditions.push("author_followers BETWEEN ? AND ?");
        params.push(min, max);
      }

      // 新鲜度时间窗：发布时间或刷新时间任一落在 N 天内即保留
      // OR 兜底：部分爬虫样本 video_published_at 缺失，last_refreshed_at 始终有值
      if (windowDays) {
        conditions.push(
          "(video_published_at >= DATE_SUB(NOW(), INTERVAL ? DAY) OR last_refreshed_at >= DATE_SUB(NOW(), INTERVAL ? DAY))",
        );
        params.push(windowDays, windowDays);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 白名单排序列
      const allowedSortColumns: Record<string, string> = {
        viral_score: "viral_score",
        weighted_interaction: "weighted_interaction",
        fan_efficiency_ratio: "fan_efficiency_ratio",
        created_at: "created_at",
        author_followers: "author_followers",
      };
      const order = sortOrder === "asc" ? "ASC" : "DESC";
      const isSurgeSort = sortBy === "recent_view_delta";

      // 查询总数（不受 sortBy 影响，主表过滤即可）
      const countRows = await query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM low_follower_samples ${whereClause}`,
        [...params],
      );
      const total = Number((countRows[0] as Record<string, unknown>)?.total ?? 0);

      // 查询数据：surge 模式 LEFT JOIN 时间序列表算 12h 增量并按 delta 排
      const sortColumn = allowedSortColumns[sortBy] ?? "viral_score";

      // surge 模式：用复合互动增量（与 surging-analytics.ts 公式一致）
      // Δ = Δview + Δlike + 3Δcomment + 2Δcollect + 4Δshare
      // 抖音 view 永远 0，靠 like/comment/share/collect 主导
      const interactionDeltaExpr = `(
        (latest_v.view_count    - prev_v.view_count)
        + (latest_v.like_count    - prev_v.like_count)    * 1
        + (latest_v.comment_count - prev_v.comment_count) * 3
        + (latest_v.collect_count - prev_v.collect_count) * 2
        + (latest_v.share_count   - prev_v.share_count)   * 4
      )`;
      const dataSql = isSurgeSort
        ? `WITH ranked AS (
             SELECT platform, video_id,
                    view_count, like_count, comment_count, share_count, collect_count,
                    sampled_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY platform, video_id ORDER BY sampled_at DESC
                    ) AS rn
             FROM video_stats_history
             WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
           ),
           latest_v AS (SELECT * FROM ranked WHERE rn = 1),
           prev_v AS (
             SELECT * FROM ranked
             WHERE rn = 2 AND sampled_at <= DATE_SUB(NOW(), INTERVAL 6 HOUR)
           )
           SELECT
             low_follower_samples.id, low_follower_samples.video_id,
             low_follower_samples.author_id, low_follower_samples.author_nickname,
             low_follower_samples.author_avatar, low_follower_samples.author_followers,
             low_follower_samples.video_title, low_follower_samples.video_description,
             low_follower_samples.video_cover, low_follower_samples.video_url, low_follower_samples.video_duration,
             low_follower_samples.video_published_at, low_follower_samples.video_views,
             low_follower_samples.video_likes, low_follower_samples.video_comments,
             low_follower_samples.video_shares, low_follower_samples.video_collects,
             low_follower_samples.platform_id, low_follower_samples.follower_view_ratio,
             low_follower_samples.engagement_rate, low_follower_samples.hashtags, low_follower_samples.music_title,
             low_follower_samples.weighted_interaction, low_follower_samples.fan_efficiency_ratio,
             low_follower_samples.viral_score, low_follower_samples.viral_score_trend,
             low_follower_samples.is_strict_hit, low_follower_samples.content_form,
             low_follower_samples.track_tags, low_follower_samples.burst_reasons,
             low_follower_samples.seed_topic, low_follower_samples.suggestion, low_follower_samples.newbie_friendly,
             low_follower_samples.created_at, low_follower_samples.last_refreshed_at, low_follower_samples.score_updated_at,
             COALESCE(${interactionDeltaExpr}, 0) AS interaction_delta
           FROM low_follower_samples
           LEFT JOIN latest_v ON latest_v.platform = low_follower_samples.platform_id
                              AND latest_v.video_id = low_follower_samples.video_id
           LEFT JOIN prev_v   ON prev_v.platform   = low_follower_samples.platform_id
                              AND prev_v.video_id   = low_follower_samples.video_id
           ${whereClause}
           ORDER BY
             ${interactionDeltaExpr} IS NULL,                              -- 无 delta 沉底（NULL last）
             ${interactionDeltaExpr} ${order},                             -- 按互动增量排
             low_follower_samples.is_strict_hit DESC,
             low_follower_samples.viral_score DESC                         -- 兜底：仍然让严格命中爆款 + 高分靠前
           LIMIT ? OFFSET ?`
        : `SELECT
             id, video_id, author_id, author_nickname, author_avatar, author_followers,
             video_title, video_description, video_cover, video_url, video_duration,
             video_published_at, video_views, video_likes, video_comments, video_shares, video_collects,
             platform_id, follower_view_ratio, engagement_rate, hashtags, music_title,
             weighted_interaction, fan_efficiency_ratio, viral_score, viral_score_trend,
             is_strict_hit, content_form, track_tags, burst_reasons,
             seed_topic, suggestion, newbie_friendly,
             created_at, last_refreshed_at, score_updated_at
           FROM low_follower_samples
           ${whereClause}
           ORDER BY is_strict_hit DESC, ${sortColumn} ${order}
           LIMIT ? OFFSET ?`;

      const dataRows = await query<RowDataPacket[]>(dataSql, [
        ...params,
        pageSize,
        offset,
      ]);

      const items = (dataRows as Record<string, unknown>[]).map(rowToItem);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /**
   * 低粉爆款库统计信息
   */
  stats: publicProcedure.query(async () => {
    // 与 list 查询同源:走 source-field-rules.ts 的 buildValidSampleClause(包含 source 豁免 + expired 过滤)
    const validSampleClause = buildValidSampleClause();

    const [statsRow] = await query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_strict_hit = 1 THEN 1 ELSE 0 END) as strict_count,
        MAX(last_refreshed_at) as last_updated,
        AVG(viral_score) as avg_score,
        MAX(viral_score) as max_score,
        COUNT(DISTINCT platform_id) as platform_count,
        COUNT(DISTINCT seed_topic) as topic_count
      FROM low_follower_samples
      WHERE ${validSampleClause}`,
    );
    const stats = statsRow as Record<string, unknown> | undefined;

    // 获取平台分布
    const platformRows = await query<RowDataPacket[]>(
      `SELECT platform_id, COUNT(*) as count
       FROM low_follower_samples
       WHERE ${validSampleClause}
       GROUP BY platform_id
       ORDER BY count DESC`,
    );

    // 获取评分分布
    const scoreDistRows = await query<RowDataPacket[]>(
      `SELECT
        CASE
          WHEN viral_score >= 80 THEN 'excellent'
          WHEN viral_score >= 60 THEN 'good'
          WHEN viral_score >= 40 THEN 'potential'
          ELSE 'watch'
        END as tier,
        COUNT(*) as count
      FROM low_follower_samples
      WHERE ${validSampleClause}
      GROUP BY tier`,
    );

    return {
      total: Number(stats?.total ?? 0),
      strictCount: Number(stats?.strict_count ?? 0),
      lastUpdated: stats?.last_updated ? String(stats.last_updated) : null,
      avgScore: Number(stats?.avg_score ?? 0),
      maxScore: Number(stats?.max_score ?? 0),
      platformCount: Number(stats?.platform_count ?? 0),
      topicCount: Number(stats?.topic_count ?? 0),
      platformDistribution: (platformRows as Record<string, unknown>[]).map((r) => ({
        platform: String(r.platform_id ?? ""),
        count: Number(r.count ?? 0),
      })),
      scoreDistribution: (scoreDistRows as Record<string, unknown>[]).map((r) => ({
        tier: String(r.tier ?? ""),
        count: Number(r.count ?? 0),
      })),
    };
  }),

  /**
   * 单条低粉爆款详情
   */
  detail: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const rows = await query<RowDataPacket[]>(
        `SELECT * FROM low_follower_samples WHERE id = ?`,
        [input.id],
      );
      if (!rows.length) return null;
      return rowToItem(rows[0] as Record<string, unknown>);
    }),

  /**
   * 某条样本的评分历史
   */
  scoreHistory: publicProcedure
    .input(z.object({ sampleId: z.string() }))
    .query(async ({ input }) => {
      const rows = await query<RowDataPacket[]>(
        `SELECT viral_score, video_likes, video_comments, video_shares, video_collects,
                weighted_interaction, fan_efficiency_ratio, recorded_at
         FROM low_follower_score_history
         WHERE sample_id = ?
         ORDER BY recorded_at DESC
         LIMIT 30`,
        [input.sampleId],
      );
      return (rows as Record<string, unknown>[]).map((r) => ({
        viralScore: Number(r.viral_score ?? 0),
        likes: Number(r.video_likes ?? 0),
        comments: Number(r.video_comments ?? 0),
        shares: Number(r.video_shares ?? 0),
        collects: Number(r.video_collects ?? 0),
        weightedInteraction: Number(r.weighted_interaction ?? 0),
        fanEfficiencyRatio: Number(r.fan_efficiency_ratio ?? 0),
        recordedAt: String(r.recorded_at ?? ""),
      }));
    }),

  /**
   * 当前动态阈值配置
   */
  thresholds: publicProcedure.query(async () => {
    const rows = await query<RowDataPacket[]>(
      `SELECT threshold_key, threshold_value, description, auto_optimized, last_optimized_at
       FROM low_follower_thresholds
       ORDER BY id`,
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      key: String(r.threshold_key ?? ""),
      value: Number(r.threshold_value ?? 0),
      description: String(r.description ?? ""),
      autoOptimized: Number(r.auto_optimized ?? 0) === 1,
      lastOptimizedAt: r.last_optimized_at ? String(r.last_optimized_at) : null,
    }));
  }),
});

// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

/**
 * 构造平台规范、不会过期的视频跳转链接。
 * 数据库里 video_url 来自 TikHub 的 share_url（短链，几小时到几天后失效），
 * 这里按平台 + video_id 拼一条 web 端永久有效的链接覆盖它。
 * video_id 缺失时回退到旧 share_url，保持向后兼容。
 */
function buildCanonicalUrl(platform: string, videoId: string, fallback: string | null): string | null {
  if (!videoId) return fallback;
  switch (platform) {
    case "douyin":
      return `https://www.douyin.com/video/${videoId}`;
    case "xiaohongshu":
      return `https://www.xiaohongshu.com/explore/${videoId}`;
    case "kuaishou":
      return `https://www.kuaishou.com/short-video/${videoId}`;
    case "bilibili":
      return /^BV/i.test(videoId)
        ? `https://www.bilibili.com/video/${videoId}`
        : fallback;
    default:
      return fallback;
  }
}

function rowToItem(row: Record<string, unknown>) {
  const platform = String(row.platform_id ?? "douyin");
  const videoId = String(row.video_id ?? "");
  const fallbackUrl = row.video_url ? String(row.video_url) : null;
  return {
    id: String(row.id ?? ""),
    videoId,
    authorId: String(row.author_id ?? ""),
    authorName: String(row.author_nickname ?? ""),
    authorAvatar: row.author_avatar ? String(row.author_avatar) : null,
    followerCount: Number(row.author_followers ?? 0),
    title: String(row.video_title ?? ""),
    description: row.video_description ? String(row.video_description) : null,
    coverUrl: row.video_cover ? String(row.video_cover) : null,
    contentUrl: buildCanonicalUrl(platform, videoId, fallbackUrl),
    duration: Number(row.video_duration ?? 0),
    publishedAt: row.video_published_at ? String(row.video_published_at) : null,
    platform,
    viewCount: Number(row.video_views ?? 0),
    likeCount: Number(row.video_likes ?? 0),
    commentCount: Number(row.video_comments ?? 0),
    shareCount: Number(row.video_shares ?? 0),
    saveCount: Number(row.video_collects ?? 0),
    followerViewRatio: Number(row.follower_view_ratio ?? 0),
    engagementRate: Number(row.engagement_rate ?? 0),
    weightedInteraction: Number(row.weighted_interaction ?? 0),
    fanEfficiencyRatio: Number(row.fan_efficiency_ratio ?? 0),
    viralScore: Number(row.viral_score ?? 0),
    viralScoreTrend: String(row.viral_score_trend ?? "new"),
    isStrictHit: Number(row.is_strict_hit ?? 0) === 1,
    contentForm: row.content_form ? String(row.content_form) : null,
    trackTags: safeParseJson(row.track_tags),
    burstReasons: safeParseJson(row.burst_reasons),
    hashtags: row.hashtags ? String(row.hashtags) : null,
    musicTitle: row.music_title ? String(row.music_title) : null,
    seedTopic: row.seed_topic ? String(row.seed_topic) : null,
    suggestion: row.suggestion ? String(row.suggestion) : null,
    newbieFriendly: Number(row.newbie_friendly ?? 50),
    createdAt: String(row.created_at ?? ""),
    lastRefreshedAt: row.last_refreshed_at ? String(row.last_refreshed_at) : null,
    scoreUpdatedAt: row.score_updated_at ? String(row.score_updated_at) : null,
    /**
     * 12h 复合互动增量（仅 sortBy=recent_view_delta 时由 SQL 算出来）。
     * 公式：Δview + Δlike + 3Δcomment + 2Δcollect + 4Δshare（与 surging-analytics 一致）
     * 抖音因平台政策 view 永远 0，所以这值由 like/comment/share/collect 主导。
     * 没有时间序列数据的样本是 0；前端 > 0 才展示飙升角标。
     */
    interactionDelta: row.interaction_delta != null ? Number(row.interaction_delta) : 0,
  };
}

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
