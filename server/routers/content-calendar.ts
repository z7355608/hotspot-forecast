/**
 * server/routers/content-calendar.ts
 * ═══════════════════════════════════════════════════════════════
 * 内容排期表 + 已发布内容追踪 + 每周订阅 tRPC 路由
 *
 * P2-8: 排期表 CRUD
 * P2-9: 已发布内容 + 效果追踪
 * P2-10: 每周选题订阅
 * ═══════════════════════════════════════════════════════════════
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { query, execute, queryOne } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import { computePredictionAccuracy, runPerformanceCollection } from "../legacy/performance-tracker";
import { aggregateHistoricalFeedback } from "../legacy/strategy-evolution";

/* ── 排期表 CRUD ── */

const calendarItemSchema = z.object({
  strategySessionId: z.string().optional(),
  track: z.string(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().optional(),
  topicTitle: z.string().min(1),
  directionName: z.string().optional(),
  contentAngle: z.string().optional(),
  hookType: z.string().optional(),
  scriptNotes: z.string().optional(),
  contentType: z.enum(["main", "test", "backup"]).default("main"),
  platform: z.string().optional(),
  sortOrder: z.number().default(0),
});

const publishedContentSchema = z.object({
  calendarItemId: z.number().optional(),
  strategySessionId: z.string().optional(),
  directionName: z.string().optional(),
  platform: z.string(),
  contentId: z.string().optional(),
  contentUrl: z.string().optional(),
  publishedTitle: z.string().optional(),
  predictedScore: z.number().optional(),
});

const subscriptionSchema = z.object({
  track: z.string(),
  platforms: z.string().optional(),
  accountStage: z.string().optional(),
});

export const contentCalendarRouter = router({
  /* ── 排期表 ── */

  /** 创建排期项（支持批量） */
  createItems: protectedProcedure
    .input(z.object({ items: z.array(calendarItemSchema) }))
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      const ids: number[] = [];
      for (const item of input.items) {
        const result = await execute(
          `INSERT INTO content_calendar (userOpenId, strategySessionId, track, scheduledDate, scheduledTime, topicTitle, directionName, contentAngle, hookType, scriptNotes, contentType, platform, sortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userOpenId, item.strategySessionId ?? null, item.track, item.scheduledDate, item.scheduledTime ?? null,
           item.topicTitle, item.directionName ?? null, item.contentAngle ?? null, item.hookType ?? null,
           item.scriptNotes ?? null, item.contentType, item.platform ?? null, item.sortOrder]
        );
        ids.push(result.insertId);
      }
      return { ok: true, ids };
    }),

  /** 获取用户排期列表 */
  listItems: protectedProcedure
    .input(z.object({
      track: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      let sql = `SELECT * FROM content_calendar WHERE userOpenId = ?`;
      const params: unknown[] = [userOpenId];
      if (input.track) {
        sql += ` AND track = ?`;
        params.push(input.track);
      }
      if (input.startDate) {
        sql += ` AND scheduledDate >= ?`;
        params.push(input.startDate);
      }
      if (input.endDate) {
        sql += ` AND scheduledDate <= ?`;
        params.push(input.endDate);
      }
      sql += ` ORDER BY scheduledDate ASC, sortOrder ASC LIMIT ?`;
      params.push(input.limit);
      const rows = await query<RowDataPacket[]>(sql, params);
      return rows;
    }),

  /** 更新排期项状态 */
  updateItemStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["planned", "filmed", "published", "skipped"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      await execute(
        `UPDATE content_calendar SET status = ? WHERE id = ? AND userOpenId = ?`,
        [input.status, input.id, userOpenId]
      );
      return { ok: true };
    }),

  /** 更新排期项内容 */
  updateItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      scheduledDate: z.string().optional(),
      scheduledTime: z.string().optional(),
      topicTitle: z.string().optional(),
      scriptNotes: z.string().optional(),
      contentType: z.enum(["main", "test", "backup"]).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      const updates: string[] = [];
      const params: unknown[] = [];
      if (input.scheduledDate !== undefined) { updates.push("scheduledDate = ?"); params.push(input.scheduledDate); }
      if (input.scheduledTime !== undefined) { updates.push("scheduledTime = ?"); params.push(input.scheduledTime); }
      if (input.topicTitle !== undefined) { updates.push("topicTitle = ?"); params.push(input.topicTitle); }
      if (input.scriptNotes !== undefined) { updates.push("scriptNotes = ?"); params.push(input.scriptNotes); }
      if (input.contentType !== undefined) { updates.push("contentType = ?"); params.push(input.contentType); }
      if (input.sortOrder !== undefined) { updates.push("sortOrder = ?"); params.push(input.sortOrder); }
      if (updates.length === 0) return { ok: true };
      params.push(input.id, userOpenId);
      await execute(
        `UPDATE content_calendar SET ${updates.join(", ")} WHERE id = ? AND userOpenId = ?`,
        params
      );
      return { ok: true };
    }),

  /** 删除排期项 */
  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      await execute(
        `DELETE FROM content_calendar WHERE id = ? AND userOpenId = ?`,
        [input.id, userOpenId]
      );
      return { ok: true };
    }),

  /* ── 已发布内容 ── */

  /** 标记内容已发布 */
  markPublished: protectedProcedure
    .input(publishedContentSchema)
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      const result = await execute(
        `INSERT INTO published_content (userOpenId, calendarItemId, strategySessionId, directionName, platform, contentId, contentUrl, publishedTitle, predictedScore, publishedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [userOpenId, input.calendarItemId ?? null, input.strategySessionId ?? null,
         input.directionName ?? null, input.platform, input.contentId ?? null,
         input.contentUrl ?? null, input.publishedTitle ?? null, input.predictedScore ?? null]
      );
      // 如果关联了排期项，更新其状态为 published
      if (input.calendarItemId) {
        await execute(
          `UPDATE content_calendar SET status = 'published' WHERE id = ? AND userOpenId = ?`,
          [input.calendarItemId, userOpenId]
        );
      }
      return { ok: true, id: result.insertId };
    }),

  /** 获取已发布内容列表 */
  listPublished: protectedProcedure
    .input(z.object({
      strategySessionId: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      let sql = `SELECT pc.*, 
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('checkpoint', cp.checkpoint, 'viewCount', cp.viewCount, 'likeCount', cp.likeCount, 'commentCount', cp.commentCount, 'shareCount', cp.shareCount, 'collectCount', cp.collectCount, 'collectedAt', cp.collectedAt))
         FROM content_performance cp WHERE cp.publishedContentId = pc.id) as performanceData
        FROM published_content pc WHERE pc.userOpenId = ?`;
      const params: unknown[] = [userOpenId];
      if (input.strategySessionId) {
        sql += ` AND pc.strategySessionId = ?`;
        params.push(input.strategySessionId);
      }
      sql += ` ORDER BY pc.publishedAt DESC LIMIT ?`;
      params.push(input.limit);
      const rows = await query<RowDataPacket[]>(sql, params);
      return rows.map(r => ({
        ...r,
        performanceData: r.performanceData ? (typeof r.performanceData === "string" ? JSON.parse(r.performanceData) : r.performanceData) : [],
      }));
    }),

  /** 记录效果数据 */
  recordPerformance: protectedProcedure
    .input(z.object({
      publishedContentId: z.number(),
      checkpoint: z.string(),
      viewCount: z.number().default(0),
      likeCount: z.number().default(0),
      commentCount: z.number().default(0),
      shareCount: z.number().default(0),
      collectCount: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      await execute(
        `INSERT INTO content_performance (publishedContentId, checkpoint, viewCount, likeCount, commentCount, shareCount, collectCount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.publishedContentId, input.checkpoint, input.viewCount, input.likeCount,
         input.commentCount, input.shareCount, input.collectCount]
      );
      return { ok: true };
    }),

  /* ── 每周订阅 ── */

  /** 订阅每周选题推荐 */
  subscribe: protectedProcedure
    .input(subscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      // 检查是否已存在相同赛道的订阅
      const existing = await queryOne<RowDataPacket>(
        `SELECT id FROM weekly_topic_subscription WHERE userOpenId = ? AND track = ?`,
        [userOpenId, input.track]
      );
      if (existing) {
        // 更新已有订阅
        await execute(
          `UPDATE weekly_topic_subscription SET platforms = ?, accountStage = ?, isActive = 1 WHERE id = ?`,
          [input.platforms ?? null, input.accountStage ?? null, existing.id]
        );
        return { ok: true, id: existing.id, action: "updated" as const };
      }
      const result = await execute(
        `INSERT INTO weekly_topic_subscription (userOpenId, track, platforms, accountStage)
         VALUES (?, ?, ?, ?)`,
        [userOpenId, input.track, input.platforms ?? null, input.accountStage ?? null]
      );
      return { ok: true, id: result.insertId, action: "created" as const };
    }),

  /** 取消订阅 */
  unsubscribe: protectedProcedure
    .input(z.object({ track: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      await execute(
        `UPDATE weekly_topic_subscription SET isActive = 0 WHERE userOpenId = ? AND track = ?`,
        [userOpenId, input.track]
      );
      return { ok: true };
    }),

  /** 获取订阅列表 */
  listSubscriptions: protectedProcedure
    .query(async ({ ctx }) => {
      const userOpenId = ctx.user!.openId;
      const rows = await query<RowDataPacket[]>(
        `SELECT * FROM weekly_topic_subscription WHERE userOpenId = ? ORDER BY createdAt DESC`,
        [userOpenId]
      );
      return rows;
    }),

  /** 检查某赛道是否已订阅 */
  isSubscribed: protectedProcedure
    .input(z.object({ track: z.string() }))
    .query(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      const row = await queryOne<RowDataPacket>(
        `SELECT id, isActive FROM weekly_topic_subscription WHERE userOpenId = ? AND track = ?`,
        [userOpenId, input.track]
      );
      return { subscribed: !!row && row.isActive === 1 };
    }),

  /* ── P2-9: 效果追踪 ── */

  /** 获取预测准确率对比数据 */
  predictionAccuracy: protectedProcedure
    .query(async ({ ctx }) => {
      const userOpenId = ctx.user!.openId;
      return computePredictionAccuracy(userOpenId);
    }),

  /** 手动触发效果数据采集 */
  triggerCollection: protectedProcedure
    .mutation(async () => {
      const result = await runPerformanceCollection();
      return result;
    }),

  /** 获取历史反馈摘要（自进化机制） */
  historicalFeedback: protectedProcedure
    .input(z.object({ track: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userOpenId = ctx.user!.openId;
      const feedback = await aggregateHistoricalFeedback(userOpenId, input.track);
      return feedback;
    }),
});
