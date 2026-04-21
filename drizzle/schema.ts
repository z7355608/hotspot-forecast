import { int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * P2-8: 内容排期表 —— 用户的 7 天内容计划
 */
export const contentCalendar = mysqlTable("content_calendar", {
  id: int("id").autoincrement().primaryKey(),
  /** 用户 openId */
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 关联的选题策略 session ID */
  strategySessionId: varchar("strategySessionId", { length: 64 }),
  /** 赛道 */
  track: varchar("track", { length: 128 }).notNull(),
  /** 计划发布日期（YYYY-MM-DD） */
  scheduledDate: varchar("scheduledDate", { length: 10 }).notNull(),
  /** 计划发布时间（HH:mm） */
  scheduledTime: varchar("scheduledTime", { length: 5 }),
  /** 选题标题 */
  topicTitle: text("topicTitle").notNull(),
  /** 所属方向 */
  directionName: varchar("directionName", { length: 256 }),
  /** 内容角度 */
  contentAngle: text("contentAngle"),
  /** 钩子类型 */
  hookType: varchar("hookType", { length: 64 }),
  /** 脚本要点（Markdown） */
  scriptNotes: text("scriptNotes"),
  /** 类型：主攻/测试/备用 */
  contentType: mysqlEnum("contentType", ["main", "test", "backup"]).default("main").notNull(),
  /** 状态：待拍/已拍/已发布/已跳过 */
  status: mysqlEnum("status", ["planned", "filmed", "published", "skipped"]).default("planned").notNull(),
  /** 平台 */
  platform: varchar("platform", { length: 32 }),
  /** 排序顺序 */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContentCalendarItem = typeof contentCalendar.$inferSelect;
export type InsertContentCalendarItem = typeof contentCalendar.$inferInsert;

/**
 * P2-9: 已发布内容记录 —— 用户标记某个选题已发布，并关联视频链接
 */
export const publishedContent = mysqlTable("published_content", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 关联的排期表项 ID */
  calendarItemId: int("calendarItemId"),
  /** 关联的选题策略 session ID */
  strategySessionId: varchar("strategySessionId", { length: 64 }),
  /** 方向名称 */
  directionName: varchar("directionName", { length: 256 }),
  /** 平台 */
  platform: varchar("platform", { length: 32 }).notNull(),
  /** 视频/笔记 ID（平台原始 ID） */
  contentId: varchar("contentId", { length: 128 }),
  /** 视频/笔记链接 */
  contentUrl: text("contentUrl"),
  /** 发布标题 */
  publishedTitle: text("publishedTitle"),
  /** 预测验证分（发布时快照） */
  predictedScore: int("predictedScore"),
  /** 发布时间 */
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PublishedContentItem = typeof publishedContent.$inferSelect;
export type InsertPublishedContentItem = typeof publishedContent.$inferInsert;

/**
 * P2-9: 内容效果追踪 —— 定期采集已发布内容的数据
 */
export const contentPerformance = mysqlTable("content_performance", {
  id: int("id").autoincrement().primaryKey(),
  /** 关联的 published_content ID */
  publishedContentId: int("publishedContentId").notNull(),
  /** 采集时间点：1h/6h/24h/72h/7d */
  checkpoint: varchar("checkpoint", { length: 16 }).notNull(),
  /** 播放量 */
  viewCount: int("viewCount").default(0),
  /** 点赞数 */
  likeCount: int("likeCount").default(0),
  /** 评论数 */
  commentCount: int("commentCount").default(0),
  /** 分享数 */
  shareCount: int("shareCount").default(0),
  /** 收藏数 */
  collectCount: int("collectCount").default(0),
  /** 采集时间 */
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
});

export type ContentPerformanceItem = typeof contentPerformance.$inferSelect;
export type InsertContentPerformanceItem = typeof contentPerformance.$inferInsert;

/**
 * P2-10: 每周选题订阅 —— 用户订阅每周自动更新选题推荐
 */
export const weeklyTopicSubscription = mysqlTable("weekly_topic_subscription", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 赛道 */
  track: varchar("track", { length: 128 }).notNull(),
  /** 平台（逗号分隔） */
  platforms: varchar("platforms", { length: 256 }),
  /** 账号阶段 */
  accountStage: varchar("accountStage", { length: 32 }),
  /** 是否启用 */
  enabled: int("enabled").default(1).notNull(),
  /** 上次运行时间 */
  lastRunAt: timestamp("lastRunAt"),
  /** 上次运行结果摘要 */
  lastRunSummary: text("lastRunSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WeeklyTopicSubscriptionItem = typeof weeklyTopicSubscription.$inferSelect;
export type InsertWeeklyTopicSubscriptionItem = typeof weeklyTopicSubscription.$inferInsert;

// ── 通知表 ──────────────────────────────────────────────────────
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 通知类型: analysis_complete, sync_complete, monitor_report, credits_low, system */
  type: varchar("type", { length: 64 }).notNull(),
  /** 通知标题 */
  title: varchar("title", { length: 256 }).notNull(),
  /** 通知正文 */
  body: text("body").notNull(),
  /** 通知色调: blue, green, amber, gray */
  tone: varchar("tone", { length: 16 }).default("blue").notNull(),
  /** 是否已读 */
  isRead: int("isRead").default(0).notNull(),
  /** 关联的资源ID（如分析结果ID、监控任务ID等） */
  relatedId: varchar("relatedId", { length: 128 }),
  /** 关联的跳转路径 */
  actionUrl: varchar("actionUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationItem = typeof notifications.$inferSelect;
export type InsertNotificationItem = typeof notifications.$inferInsert;

/**
 * 预测结果缓存表 —— 相同关键词短时间内复用结果，避免重复调用外部API
 */
export const predictionCache = mysqlTable("prediction_cache", {
  id: int("id").autoincrement().primaryKey(),
  /** 缓存键：SHA-256（prompt + platforms + mode） */
  cacheKey: varchar("cacheKey", { length: 64 }).notNull().unique(),
  /** 原始用户输入的 prompt */
  prompt: text("prompt").notNull(),
  /** 平台列表（逗号分隔） */
  platforms: varchar("platforms", { length: 256 }),
  /** 完整响应 JSON（压缩存储） */
  resultJson: mediumtext("resultJson").notNull(),
  /** 命中次数 */
  hitCount: int("hitCount").default(0).notNull(),
  /** 过期时间 */
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PredictionCacheItem = typeof predictionCache.$inferSelect;
export type InsertPredictionCacheItem = typeof predictionCache.$inferInsert;

/**
 * 分析耗时监控表 —— 记录每次分析各阶段耗时，用于性能优化
 */
export const analysisTiming = mysqlTable("analysis_timing", {
  id: int("id").autoincrement().primaryKey(),
  /** 运行 ID */
  runId: varchar("runId", { length: 64 }).notNull(),
  /** 用户 openId */
  userOpenId: varchar("userOpenId", { length: 64 }),
  /** 输入 prompt（前100字） */
  promptSnippet: varchar("promptSnippet", { length: 100 }),
  /** 平台列表 */
  platforms: varchar("platforms", { length: 256 }),
  /** 整体耗时（毫秒） */
  totalMs: int("totalMs"),
  /** LLM意图识别耗时 */
  intentMs: int("intentMs"),
  /** 平台数据采集耗时 */
  collectMs: int("collectMs"),
  /** LLM分析耗时 */
  llmMs: int("llmMs"),
  /** 是否命中缓存 */
  cacheHit: int("cacheHit").default(0).notNull(),
  /** 执行状态: success / partial_success / failed */
  status: varchar("status", { length: 32 }).default("success").notNull(),
  /** 各平台耗时详情 JSON */
  platformTimingsJson: text("platformTimingsJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalysisTimingItem = typeof analysisTiming.$inferSelect;
export type InsertAnalysisTimingItem = typeof analysisTiming.$inferInsert;

/**
 * 用户订阅表 —— 记录 Plus/Pro 会员订阅
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  /** 用户 openId */
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 套餐类型: plus / pro */
  plan: mysqlEnum("plan", ["plus", "pro"]).notNull(),
  /** 计费周期: monthly_once / monthly_auto / yearly */
  billingCycle: mysqlEnum("billingCycle", ["monthly_once", "monthly_auto", "yearly"]).notNull(),
  /** 订阅状态: active / cancelled / expired */
  status: mysqlEnum("status", ["active", "cancelled", "expired"]).default("active").notNull(),
  /** 订阅开始时间 */
  startAt: timestamp("startAt").notNull(),
  /** 订阅到期时间 */
  endAt: timestamp("endAt").notNull(),
  /** 是否自动续费 */
  autoRenew: int("autoRenew").default(0).notNull(),
  /** 每月赠送积分 */
  monthlyCredits: int("monthlyCredits").default(0).notNull(),
  /** 支付金额（分） */
  amountCents: int("amountCents").default(0).notNull(),
  /** 外部支付订单号 */
  paymentOrderId: varchar("paymentOrderId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubscriptionItem = typeof subscriptions.$inferSelect;
export type InsertSubscriptionItem = typeof subscriptions.$inferInsert;

/**
 * 积分流水表 —— 记录每一笔积分变动
 */
export const creditTransactions = mysqlTable("credit_transactions", {
  id: int("id").autoincrement().primaryKey(),
  /** 用户 openId */
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 变动积分（正=收入，负=支出） */
  amount: int("amount").notNull(),
  /** 变动后余额 */
  balance: int("balance").notNull(),
  /** 类型: purchase/subscription/checkin/consume/refund/admin */
  type: mysqlEnum("type", ["purchase", "subscription", "checkin", "consume", "refund", "admin"]).notNull(),
  /** 描述 */
  description: varchar("description", { length: 256 }).notNull(),
  /** 关联业务ID（如分析runId、订单号等） */
  relatedId: varchar("relatedId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditTransactionItem = typeof creditTransactions.$inferSelect;
export type InsertCreditTransactionItem = typeof creditTransactions.$inferInsert;

/**
 * 每日签到表 —— 防止重复签到
 */
export const dailyCheckins = mysqlTable("daily_checkins", {
  id: int("id").autoincrement().primaryKey(),
  /** 用户 openId */
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  /** 签到日期（YYYY-MM-DD） */
  checkinDate: varchar("checkinDate", { length: 10 }).notNull(),
  /** 获得积分 */
  creditsAwarded: int("creditsAwarded").default(5).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DailyCheckinItem = typeof dailyCheckins.$inferSelect;
export type InsertDailyCheckinItem = typeof dailyCheckins.$inferInsert;
