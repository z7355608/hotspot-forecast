/**
 * credits.ts — 积分与会员 tRPC 路由
 * ═══════════════════════════════════════════════════════════════
 * 提供以下功能：
 *   - getBalance()        — 查询当前用户积分余额
 *   - getTransactions()   — 查询积分流水明细
 *   - checkin()           — 每日签到领取积分
 *   - getCheckinStatus()  — 查询今日签到状态
 *   - getSubscription()   — 查询当前订阅状态
 *   - subscribe()         — 购买/升级会员套餐（模拟支付）
 *   - purchaseCredits()   — 购买积分包（模拟支付）
 *   - deductForAnalysis() — 分析时扣减积分
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { execute, query, queryOne } from "../legacy/database.js";
import type { RowDataPacket } from "../legacy/database.js";

/* ── 常量 ── */

/** 新用户注册赠送积分 */
export const NEW_USER_CREDITS = 60;

/** 每日签到积分 */
export const CHECKIN_CREDITS = 5;

/** 分析基础积分消耗 */
export const BASE_ANALYSIS_COST = 20;

/** 每增加一个平台额外消耗积分 */
export const EXTRA_PLATFORM_COST = 10;

/** 积分包配置 */
export const CREDIT_PACKAGES = [
  { id: "pkg_100", credits: 100, price: 12, label: "100积分" },
  { id: "pkg_300", credits: 300, price: 30, label: "300积分" },
  { id: "pkg_800", credits: 800, price: 70, label: "800积分" },
  { id: "pkg_2000", credits: 2000, price: 150, label: "2000积分" },
] as const;

/** 会员套餐配置 */
export const SUBSCRIPTION_PLANS = {
  plus: {
    monthly_once: { price: 19, credits: 200, label: "Plus月付" },
    monthly_auto: { price: 15, credits: 200, label: "Plus连续包月" },
    yearly: { price: 108, credits: 2400, label: "Plus年付（¥9/月）" },
  },
  pro: {
    monthly_once: { price: 49, credits: 600, label: "Pro月付" },
    monthly_auto: { price: 39, credits: 600, label: "Pro连续包月" },
    yearly: { price: 300, credits: 7200, label: "Pro年付（¥25/月）" },
  },
} as const;

/* ── 辅助函数 ── */

interface UserProfileRow extends RowDataPacket {
  id: string;
  credits: number;
  membership_plan: string;
  total_spent: number;
  total_earned: number;
}

/** 获取用户的 user_profiles 记录 */
async function getUserProfile(openId: string): Promise<UserProfileRow | null> {
  return queryOne<UserProfileRow>(
    "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
    [openId]
  );
}

/** 确保用户有 user_profiles 记录，没有则创建（赠送60积分） */
async function ensureUserProfile(openId: string): Promise<{ credits: number }> {
  const existing = await getUserProfile(openId);
  if (existing) return { credits: existing.credits };

  // 新用户：创建 profile 并赠送 60 积分
  await execute(
    `INSERT INTO user_profiles (id, credits, total_earned, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE id = id`,
    [openId, NEW_USER_CREDITS, NEW_USER_CREDITS]
  );

  // 写入赠送流水
  await execute(
    `INSERT INTO credit_transactions (userOpenId, amount, balance, type, description, createdAt)
     VALUES (?, ?, ?, 'admin', '新用户注册赠送', NOW())`,
    [openId, NEW_USER_CREDITS, NEW_USER_CREDITS]
  );

  return { credits: NEW_USER_CREDITS };
}

/** 原子扣减积分 */
async function deductCreditsInternal(
  openId: string,
  amount: number,
  description: string,
  relatedId?: string
): Promise<{ success: boolean; balance: number; reason?: string }> {
  const result = await execute(
    `UPDATE user_profiles
     SET credits = credits - ?,
         total_spent = total_spent + ?
     WHERE id = ? AND credits >= ?`,
    [amount, amount, openId, amount]
  );

  if (result.affectedRows === 0) {
    const profile = await getUserProfile(openId);
    return {
      success: false,
      balance: profile?.credits ?? 0,
      reason: `积分不足（当前 ${profile?.credits ?? 0}，需要 ${amount}）`,
    };
  }

  const profile = await getUserProfile(openId);
  const balance = profile?.credits ?? 0;

  await execute(
    `INSERT INTO credit_transactions (userOpenId, amount, balance, type, description, relatedId, createdAt)
     VALUES (?, ?, ?, 'consume', ?, ?, NOW())`,
    [openId, -amount, balance, description, relatedId ?? null]
  );

  return { success: true, balance };
}

/** 增加积分 */
async function addCreditsInternal(
  openId: string,
  amount: number,
  type: "purchase" | "subscription" | "checkin" | "refund" | "admin",
  description: string,
  relatedId?: string
): Promise<{ balance: number }> {
  await execute(
    `UPDATE user_profiles
     SET credits = credits + ?,
         total_earned = total_earned + ?
     WHERE id = ?`,
    [amount, amount, openId]
  );

  const profile = await getUserProfile(openId);
  const balance = profile?.credits ?? 0;

  await execute(
    `INSERT INTO credit_transactions (userOpenId, amount, balance, type, description, relatedId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [openId, amount, balance, type, description, relatedId ?? null]
  );

  return { balance };
}

/**
 * 检查用户的活跃订阅是否已到期，如果到期则：
 * 1. 将订阅状态改为 expired
 * 2. 将 membership_plan 降级为 free
 */
async function checkAndDowngradeExpiredSubscription(openId: string): Promise<void> {
  interface SubRow extends RowDataPacket {
    id: number;
    plan: string;
    endAt: Date;
    status: string;
  }
  const activeSubs = await query<SubRow[]>(
    `SELECT id, plan, endAt, status FROM subscriptions WHERE userOpenId = ? AND status = 'active' ORDER BY endAt DESC`,
    [openId]
  );

  if (activeSubs.length === 0) return;

  const now = new Date();
  const expiredIds: number[] = [];
  let hasValidSub = false;

  for (const sub of activeSubs) {
    if (new Date(sub.endAt) <= now) {
      expiredIds.push(sub.id);
    } else {
      hasValidSub = true;
    }
  }

  if (expiredIds.length === 0) return;

  // 批量将过期订阅标记为 expired
  await execute(
    `UPDATE subscriptions SET status = 'expired', updatedAt = NOW() WHERE id IN (${expiredIds.map(() => '?').join(',')})`,
    expiredIds
  );

  // 如果没有任何有效订阅，将会员等级降为 free
  if (!hasValidSub) {
    const profile = await getUserProfile(openId);
    if (profile && profile.membership_plan !== 'free') {
      await execute(
        `UPDATE user_profiles SET membership_plan = 'free', updated_at = NOW() WHERE id = ?`,
        [openId]
      );
    }
  }
}

/** 批量扫描并降级所有过期会员（用于定时任务） */
export async function downgradeAllExpiredSubscriptions(): Promise<{ downgraded: number }> {
  interface ExpiredRow extends RowDataPacket {
    id: number;
    userOpenId: string;
  }
  const now = new Date();
  const expiredSubs = await query<ExpiredRow[]>(
    `SELECT id, userOpenId FROM subscriptions WHERE status = 'active' AND endAt <= ?`,
    [now]
  );

  if (expiredSubs.length === 0) return { downgraded: 0 };

  // 批量更新订阅状态
  const ids = expiredSubs.map(s => s.id);
  await execute(
    `UPDATE subscriptions SET status = 'expired', updatedAt = NOW() WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  // 找出需要降级的用户（没有其他活跃订阅的）
  const userIds = [...new Set(expiredSubs.map(s => s.userOpenId))];
  let downgraded = 0;

  for (const userId of userIds) {
    interface ActiveRow extends RowDataPacket { cnt: number; }
    const activeCount = await queryOne<ActiveRow>(
      `SELECT COUNT(*) as cnt FROM subscriptions WHERE userOpenId = ? AND status = 'active'`,
      [userId]
    );
    if (!activeCount || activeCount.cnt === 0) {
      await execute(
        `UPDATE user_profiles SET membership_plan = 'free', updated_at = NOW() WHERE id = ? AND membership_plan != 'free'`,
        [userId]
      );
      downgraded++;
    }
  }

  return { downgraded };
}

/* ── Router ── */

export const creditsRouter = router({
  /** 查询积分余额（含会员到期自动降级检查） */
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const openId = ctx.user.openId;
    await ensureUserProfile(openId);

    // 检查会员是否到期，如果到期则自动降级
    await checkAndDowngradeExpiredSubscription(openId);

    const profile = await getUserProfile(openId);
    return {
      credits: profile?.credits ?? 0,
      membershipPlan: profile?.membership_plan ?? "free",
    };
  }),

  /** 查询积分流水明细 */
  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const openId = ctx.user.openId;

      interface TxRow extends RowDataPacket {
        id: number;
        userOpenId: string;
        amount: number;
        balance: number;
        type: string;
        description: string;
        relatedId: string | null;
        createdAt: Date;
      }
      interface CountRow extends RowDataPacket { cnt: number; }

      const transactions = await query<TxRow[]>(
        `SELECT * FROM credit_transactions WHERE userOpenId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
        [openId, input.limit, input.offset]
      );
      const countRows = await query<CountRow[]>(
        `SELECT COUNT(*) as cnt FROM credit_transactions WHERE userOpenId = ?`,
        [openId]
      );

      return {
        transactions,
        total: countRows[0]?.cnt ?? 0,
      };
    }),

  /** 查询今日签到状态 */
  getCheckinStatus: protectedProcedure.query(async ({ ctx }) => {
    const openId = ctx.user.openId;
    const today = new Date().toISOString().slice(0, 10);

    interface CheckinRow extends RowDataPacket { id: number; }
    const rows = await query<CheckinRow[]>(
      `SELECT id FROM daily_checkins WHERE userOpenId = ? AND checkinDate = ? LIMIT 1`,
      [openId, today]
    );
    return {
      checkedIn: rows.length > 0,
      creditsToday: CHECKIN_CREDITS,
    };
  }),

  /** 每日签到 */
  checkin: protectedProcedure.mutation(async ({ ctx }) => {
    const openId = ctx.user.openId;
    const today = new Date().toISOString().slice(0, 10);

    interface CheckinRow extends RowDataPacket { id: number; }
    const existing = await query<CheckinRow[]>(
      `SELECT id FROM daily_checkins WHERE userOpenId = ? AND checkinDate = ? LIMIT 1`,
      [openId, today]
    );
    if (existing.length > 0) {
      throw new Error("今日已签到");
    }

    await ensureUserProfile(openId);

    await execute(
      `INSERT INTO daily_checkins (userOpenId, checkinDate, creditsAwarded, createdAt)
       VALUES (?, ?, ?, NOW())`,
      [openId, today, CHECKIN_CREDITS]
    );

    const { balance } = await addCreditsInternal(openId, CHECKIN_CREDITS, "checkin", "每日签到奖励");

    return { success: true, creditsAwarded: CHECKIN_CREDITS, balance };
  }),

  /** 查询当前订阅 */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const openId = ctx.user.openId;

    interface SubRow extends RowDataPacket {
      id: number;
      plan: string;
      billingCycle: string;
      status: string;
      startAt: Date;
      endAt: Date;
      autoRenew: number;
      monthlyCredits: number;
      amountCents: number;
    }
    const rows = await query<SubRow[]>(
      `SELECT * FROM subscriptions WHERE userOpenId = ? AND status = 'active' ORDER BY endAt DESC LIMIT 1`,
      [openId]
    );
    return { subscription: rows[0] ?? null };
  }),

  /** 购买/升级会员套餐（模拟支付） */
  subscribe: protectedProcedure
    .input(z.object({
      plan: z.enum(["plus", "pro"]),
      billingCycle: z.enum(["monthly_once", "monthly_auto", "yearly"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const openId = ctx.user.openId;
      const planConfig = SUBSCRIPTION_PLANS[input.plan][input.billingCycle];
      const now = new Date();
      const endAt = new Date(now);

      if (input.billingCycle === "yearly") {
        endAt.setFullYear(endAt.getFullYear() + 1);
      } else {
        endAt.setMonth(endAt.getMonth() + 1);
      }

      const autoRenew = input.billingCycle === "monthly_auto" ? 1 : 0;
      await ensureUserProfile(openId);

      // 取消旧的活跃订阅
      await execute(
        `UPDATE subscriptions SET status = 'cancelled', updatedAt = NOW() WHERE userOpenId = ? AND status = 'active'`,
        [openId]
      );

      // 创建新订阅
      await execute(
        `INSERT INTO subscriptions (userOpenId, plan, billingCycle, status, startAt, endAt, autoRenew, monthlyCredits, amountCents, createdAt, updatedAt)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, NOW(), NOW())`,
        [openId, input.plan, input.billingCycle, now, endAt, autoRenew, planConfig.credits, planConfig.price * 100]
      );

      // 赠送积分
      const { balance } = await addCreditsInternal(
        openId,
        planConfig.credits,
        "subscription",
        `${planConfig.label}订阅赠送积分`
      );

      // 更新用户membership_plan
      const planLabel = input.billingCycle === "yearly" ? `${input.plan}_yearly` : input.plan;
      await execute(
        `UPDATE user_profiles SET membership_plan = ? WHERE id = ?`,
        [planLabel, openId]
      );

      return {
        success: true,
        plan: input.plan,
        billingCycle: input.billingCycle,
        creditsAwarded: planConfig.credits,
        balance,
        endAt: endAt.toISOString(),
        price: planConfig.price,
      };
    }),

  /** 购买积分包（模拟支付） */
  purchaseCredits: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === input.packageId);
      if (!pkg) throw new Error("无效的积分包");

      const openId = ctx.user.openId;
      await ensureUserProfile(openId);

      const { balance } = await addCreditsInternal(
        openId,
        pkg.credits,
        "purchase",
        `购买${pkg.label}（¥${pkg.price}）`
      );

      return { success: true, creditsAdded: pkg.credits, balance, price: pkg.price };
    }),

  /** 分析时扣减积分 */
  deductForAnalysis: protectedProcedure
    .input(z.object({
      platforms: z.array(z.string()),
      runId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const openId = ctx.user.openId;
      await ensureUserProfile(openId);

      const platformCount = input.platforms.length;
      const cost = BASE_ANALYSIS_COST + Math.max(0, platformCount - 1) * EXTRA_PLATFORM_COST;
      const platformNames = input.platforms.join("、");
      const description = `爆款预测分析（${platformNames}，${platformCount}平台）`;

      return deductCreditsInternal(openId, cost, description, input.runId);
    }),

  /** 获取积分包列表 */
  getCreditPackages: protectedProcedure.query(() => {
    return { packages: CREDIT_PACKAGES };
  }),

  /** 获取会员套餐列表 */
  getSubscriptionPlans: protectedProcedure.query(() => {
    return { plans: SUBSCRIPTION_PLANS };
  }),
});
