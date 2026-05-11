/**
 * surging-analytics.ts
 *
 * 基于 video_stats_history（schema-v12，每天 06:00/18:00 采集 2 次）
 * 计算"作品级飙升信号" — 真正反映"过去 12h 这条作品互动量涨了多少"。
 *
 * 信号公式（与 low-follower-algorithm.computeWeightedInteraction 一致）：
 *   interactionDelta = Δview
 *                    + Δlike    × 1
 *                    + Δcomment × 3
 *                    + Δcollect × 2
 *                    + Δshare   × 4
 *
 * 为什么不直接用 Δview：抖音从 2021 起对外 API 把 play_count 一律返回 0
 * （平台政策，TikHub 也无法绕过）。所以"播放增量"在抖音侧永远是 0，
 * 信号必须靠 like/comment/share/collect 的复合加权。小红书 / 快手 view 是
 * 有数据的，加进公式不影响；权重让 share/comment 这类"强动作"主导。
 *
 * 两层输出：
 *   1. 视频级（computeVideoSurges）：每条视频 12h 互动增量
 *   2. 赛道级（computeTopicSurges）：JOIN low_follower_samples 拿到 seed_topic
 *      后按赛道聚合 totalInteractionDelta，作为"飙升榜"数据源
 *
 * 时间窗：
 *   - "最近一次" vs "≥6h 前最近一次"。06:00/18:00 两次采集刚好相隔 12h，
 *     这个窗口稳定拿到 1 个时间点对
 *   - 必须有 ≥2 个采集点才算
 *   - interactionDelta < 0 过滤（平台数据回滚）
 *   - interactionDelta < minThreshold 过滤（默认 100，小作品小涨不参与排序）
 *
 * 性能：表稳态 row 数 ≤ 9000，全表扫快，主键索引命中。
 */

import { query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

/**
 * 单个视频的 12h 飙升数据。
 *
 * `interactionDelta` 是排序主信号（复合加权增量，见文件顶部公式说明）。
 * 各分量 delta 给出来供 UI / 调试展示。
 */
export interface VideoSurge {
  platform: string;
  videoId: string;
  /** 复合互动增量（排序主信号）：Δview + Δlike + 3·Δcomment + 2·Δcollect + 4·Δshare */
  interactionDelta: number;
  viewDelta: number;
  likeDelta: number;
  commentDelta: number;
  collectDelta: number;
  shareDelta: number;
  /** 最近一次采集的播放数（绝对值，用于展示。抖音永远 0） */
  latestViewCount: number;
  /** 最近一次采集时间 */
  latestSampledAt: string;
  /** 上一次采集时间（≥6h 前） */
  previousSampledAt: string;
  /** 实际时间间隔（小时），用于按小时归一化 */
  hoursSpan: number;
}

/**
 * 赛道级飙升聚合（按 seed_topic group by）。
 * 度量单位：复合互动增量（见 VideoSurge.interactionDelta 说明）。
 */
export interface TopicSurge {
  topic: string;
  /** 该赛道下参与计算的视频数 */
  videoCount: number;
  /** 全部视频 12h 互动增量之和 */
  totalInteractionDelta: number;
  /** 平均每条视频的 12h 增量 */
  avgInteractionDelta: number;
  /** 该赛道飙升最猛的那条视频 video_id（前端可展示作"代表作"） */
  topVideoId: string | null;
  /** 该赛道飙升最猛那条视频的 12h 增量 */
  topVideoDelta: number;
}

/**
 * 计算每条视频的 12h 飙升数据（数据库 SQL 用 window function 取最新两个采集点）。
 *
 * @param platform 可选过滤
 * @param minInteractionDelta 最低互动增量阈值，低于此值视为噪声
 * @param limit 返回 top N
 */
export async function computeVideoSurges(options: {
  platform?: string;
  minInteractionDelta?: number;
  limit?: number;
} = {}): Promise<VideoSurge[]> {
  const { platform, minInteractionDelta = 100, limit = 200 } = options;
  const platformClause = platform ? "AND platform = ?" : "";
  const platformParam = platform ? [platform] : [];

  // 拿"每条视频最新一行" + "每条视频 6-36h 之前的最新一行"
  // 用 window function 给每个 video_id 的采集快照打 rn 序号。
  // 排序键直接在 SQL 算复合互动增量，避免拉无关样本。
  const rows = await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id,
              view_count, like_count, comment_count, share_count, collect_count,
              sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id
                ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
         ${platformClause}
     ),
     latest AS (
       SELECT * FROM ranked WHERE rn = 1
     ),
     prev AS (
       SELECT * FROM ranked
       WHERE rn = 2
         AND sampled_at <= DATE_SUB(NOW(), INTERVAL 6 HOUR)
     )
     SELECT
       l.platform,
       l.video_id,
       l.view_count     AS latest_views,    p.view_count     AS prev_views,
       l.like_count     AS latest_likes,    p.like_count     AS prev_likes,
       l.comment_count  AS latest_comments, p.comment_count  AS prev_comments,
       l.share_count    AS latest_shares,   p.share_count    AS prev_shares,
       l.collect_count  AS latest_collects, p.collect_count  AS prev_collects,
       l.sampled_at     AS latest_at,
       p.sampled_at     AS prev_at,
       TIMESTAMPDIFF(MINUTE, p.sampled_at, l.sampled_at) AS minutes_span,
       (
         (l.view_count    - p.view_count)
         + (l.like_count    - p.like_count)    * 1
         + (l.comment_count - p.comment_count) * 3
         + (l.collect_count - p.collect_count) * 2
         + (l.share_count   - p.share_count)   * 4
       ) AS interaction_delta
     FROM latest l
     INNER JOIN prev p
       ON l.platform = p.platform AND l.video_id = p.video_id
     ORDER BY interaction_delta DESC
     LIMIT ?`,
    [...platformParam, limit],
  );

  return (rows as Record<string, unknown>[])
    .map<VideoSurge>((r) => {
      const latestViews = Number(r.latest_views ?? 0);
      const minutesSpan = Number(r.minutes_span ?? 0);
      return {
        platform: String(r.platform ?? ""),
        videoId: String(r.video_id ?? ""),
        interactionDelta: Number(r.interaction_delta ?? 0),
        viewDelta: latestViews - Number(r.prev_views ?? 0),
        likeDelta: Number(r.latest_likes ?? 0) - Number(r.prev_likes ?? 0),
        commentDelta: Number(r.latest_comments ?? 0) - Number(r.prev_comments ?? 0),
        collectDelta: Number(r.latest_collects ?? 0) - Number(r.prev_collects ?? 0),
        shareDelta: Number(r.latest_shares ?? 0) - Number(r.prev_shares ?? 0),
        latestViewCount: latestViews,
        latestSampledAt: String(r.latest_at ?? ""),
        previousSampledAt: String(r.prev_at ?? ""),
        hoursSpan: minutesSpan / 60,
      };
    })
    .filter((s) => s.interactionDelta >= minInteractionDelta);
}

/**
 * 把视频级飙升聚合到赛道级（seed_topic）。
 *
 * 联表 low_follower_samples 拿 seed_topic（这是项目里唯一关联视频→赛道的字段）。
 * 没有匹配 seed_topic 的视频会被丢弃（这部分本来也无法做赛道级聚合）。
 */
export async function computeTopicSurges(options: {
  platform?: string;
  niche?: string;
  minInteractionDelta?: number;
  limit?: number;
} = {}): Promise<TopicSurge[]> {
  const { platform, niche, minInteractionDelta = 100, limit = 7 } = options;

  // 先拿足够多的视频级 surge（top 200），再 join 赛道
  const videoSurges = await computeVideoSurges({
    platform,
    minInteractionDelta,
    limit: 200,
  });
  if (videoSurges.length === 0) return [];

  // 批量查 seed_topic：用 (platform, video_id) 元组做 IN 查询
  const placeholders = videoSurges.map(() => "(?, ?)").join(",");
  const params: unknown[] = [];
  for (const v of videoSurges) {
    params.push(v.platform, v.videoId);
  }
  const seedRows = await query<RowDataPacket[]>(
    `SELECT platform_id AS platform, video_id, seed_topic
     FROM low_follower_samples
     WHERE (platform_id, video_id) IN (${placeholders})
       AND seed_topic IS NOT NULL AND seed_topic <> ''`,
    params,
  );

  const seedMap = new Map<string, string>();
  for (const r of seedRows as Record<string, unknown>[]) {
    const key = `${r.platform}:${r.video_id}`;
    const topic = String(r.seed_topic ?? "").trim();
    if (topic) seedMap.set(key, topic);
  }

  // group by seed_topic
  const groups = new Map<string, { videos: VideoSurge[]; total: number }>();
  for (const v of videoSurges) {
    const topic = seedMap.get(`${v.platform}:${v.videoId}`);
    if (!topic) continue;
    if (niche && !topic.includes(niche)) continue;
    const g = groups.get(topic) ?? { videos: [], total: 0 };
    g.videos.push(v);
    g.total += v.interactionDelta;
    groups.set(topic, g);
  }

  const out: TopicSurge[] = [];
  for (const [topic, g] of groups) {
    const top = g.videos.reduce(
      (best, cur) => (cur.interactionDelta > best.interactionDelta ? cur : best),
      g.videos[0],
    );
    out.push({
      topic,
      videoCount: g.videos.length,
      totalInteractionDelta: g.total,
      avgInteractionDelta: Math.round(g.total / g.videos.length),
      topVideoId: top?.videoId ?? null,
      topVideoDelta: top?.interactionDelta ?? 0,
    });
  }

  return out
    .sort((a, b) => b.totalInteractionDelta - a.totalInteractionDelta)
    .slice(0, limit);
}
