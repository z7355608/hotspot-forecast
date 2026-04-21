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

// ─────────────────────────────────────────────
// 输入 Schema
// ─────────────────────────────────────────────

const listInputSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(50).default(20),
  sortBy: z.enum(["viral_score", "weighted_interaction", "fan_efficiency_ratio", "created_at", "author_followers"]).default("viral_score"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  platform: z.string().optional(),
  contentForm: z.string().optional(),
  seedTopic: z.string().optional(),
  minViralScore: z.number().min(0).max(100).optional(),
  strictOnly: z.boolean().optional(),
  search: z.string().optional(),
});

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
      const { page, pageSize, sortBy, sortOrder, platform, contentForm, seedTopic, minViralScore, strictOnly, search } = input;
      const offset = (page - 1) * pageSize;

      // 构建 WHERE 条件
      // 始终排除粉丝数为 0 的脏数据，防止污染低粉爆款库
      const conditions: string[] = ["author_followers > 0"];
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 白名单排序列
      const allowedSortColumns: Record<string, string> = {
        viral_score: "viral_score",
        weighted_interaction: "weighted_interaction",
        fan_efficiency_ratio: "fan_efficiency_ratio",
        created_at: "created_at",
        author_followers: "author_followers",
      };
      const sortColumn = allowedSortColumns[sortBy] ?? "viral_score";
      const order = sortOrder === "asc" ? "ASC" : "DESC";

      // 查询总数
      const countRows = await query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM low_follower_samples ${whereClause}`,
        [...params],
      );
      const total = Number((countRows[0] as Record<string, unknown>)?.total ?? 0);

      // 查询数据
      const dataRows = await query<RowDataPacket[]>(
        `SELECT 
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
        LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );

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
      WHERE author_followers > 0`,
    );
    const stats = statsRow as Record<string, unknown> | undefined;

    // 获取平台分布
    const platformRows = await query<RowDataPacket[]>(
      `SELECT platform_id, COUNT(*) as count FROM low_follower_samples GROUP BY platform_id ORDER BY count DESC`,
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

function rowToItem(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    videoId: String(row.video_id ?? ""),
    authorId: String(row.author_id ?? ""),
    authorName: String(row.author_nickname ?? ""),
    authorAvatar: row.author_avatar ? String(row.author_avatar) : null,
    followerCount: Number(row.author_followers ?? 0),
    title: String(row.video_title ?? ""),
    description: row.video_description ? String(row.video_description) : null,
    coverUrl: row.video_cover ? String(row.video_cover) : null,
    contentUrl: row.video_url ? String(row.video_url) : null,
    duration: Number(row.video_duration ?? 0),
    publishedAt: row.video_published_at ? String(row.video_published_at) : null,
    platform: String(row.platform_id ?? "douyin"),
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
  };
}

function safeParseJson(val: unknown): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(String(val));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
