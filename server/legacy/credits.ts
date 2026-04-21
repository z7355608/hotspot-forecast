/**
 * Credits — 积分扣减与查询模块
 * ═══════════════════════════════════════════════════════════════
 * 提供面向 LLM 网关的积分操作接口：
 *   - getUserCredits()     — 查询用户当前积分和会员等级
 *   - deductCredits()      — 原子扣减积分并写入流水
 *   - refundCredits()      — 退还积分（调用失败时使用）
 *   - canAfford()          — 检查用户是否有足够积分
 *   - recordLLMUsage()     — 记录一次 LLM 调用的完整流水
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("Credits");
import { randomUUID } from "node:crypto";
import { execute, queryOne } from "./database.js";
import type { RowDataPacket } from "./database.js";
import type { AIModelId } from "../../client/src/app/store/app-data-core.js";
import { calcChargedCredits } from "./llm-gateway.js";

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

export interface UserCreditInfo {
  userId: string;
  credits: number;
  membershipPlan: string;
  totalSpent: number;
  totalEarned: number;
}

export interface DeductResult {
  success: boolean;
  /** 扣减后余额 */
  balanceAfter: number;
  /** 本次实际扣减积分 */
  deducted: number;
  /** 流水 ID */
  transactionId: string;
  /** 失败原因（仅 success=false 时有值） */
  reason?: string;
}

export interface LLMUsageRecord {
  userId: string;
  modelId: AIModelId;
  /** 任务类型描述，如 "爆款拆解-借鉴建议" */
  taskLabel: string;
  /** 基础积分消耗（不含倍率） */
  baseCost: number;
  /** 实际扣减积分（含倍率） */
  chargedCost: number;
  /** LLM 返回的 prompt token 数 */
  promptTokens?: number;
  /** LLM 返回的 completion token 数 */
  completionTokens?: number;
}

/* ─────────────────────────────────────────────
   查询用户积分信息
───────────────────────────────────────────── */

interface UserRow extends RowDataPacket {
  id: string;
  credits: number;
  membership_plan: string;
  total_spent: number;
  total_earned: number;
}

export async function getUserCredits(userId: string): Promise<UserCreditInfo | null> {
  const row = await queryOne<UserRow>(
    "SELECT id, credits, membership_plan, total_spent, total_earned FROM user_profiles WHERE id = ?",
    [userId],
  );
  if (!row) return null;
  return {
    userId: row.id,
    credits: row.credits,
    membershipPlan: row.membership_plan,
    totalSpent: row.total_spent,
    totalEarned: row.total_earned,
  };
}

/* ─────────────────────────────────────────────
   检查是否有足够积分
───────────────────────────────────────────── */

export async function canAfford(userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true;
  const info = await getUserCredits(userId);
  if (!info) return false;
  return info.credits >= cost;
}

/* ─────────────────────────────────────────────
   原子扣减积分
───────────────────────────────────────────── */

/**
 * 原子扣减积分，使用 MySQL 行级锁防止并发超扣。
 * 扣减成功后写入 credit_transactions 流水。
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<DeductResult> {
  if (amount <= 0) {
    // 免费操作，直接返回成功
    const info = await getUserCredits(userId);
    return {
      success: true,
      balanceAfter: info?.credits ?? 0,
      deducted: 0,
      transactionId: "free",
    };
  }

  // 使用 UPDATE ... WHERE credits >= amount 保证原子性，防止超扣
  const result = await execute(
    `UPDATE user_profiles
     SET credits = credits - ?,
         total_spent = total_spent + ?
     WHERE id = ? AND credits >= ?`,
    [amount, amount, userId, amount],
  );

  if (result.affectedRows === 0) {
    // 积分不足或用户不存在
    const info = await getUserCredits(userId);
    return {
      success: false,
      balanceAfter: info?.credits ?? 0,
      deducted: 0,
      transactionId: "",
      reason: info ? `积分不足（当前 ${info.credits}，需要 ${amount}）` : "用户不存在",
    };
  }

  // 查询扣减后余额
  const updated = await queryOne<UserRow>(
    "SELECT credits FROM user_profiles WHERE id = ?",
    [userId],
  );
  const balanceAfter = updated?.credits ?? 0;

  // 写入流水
  const txId = randomUUID();
  await execute(
    `INSERT INTO credit_transactions (id, user_id, type, amount, balance_after, reason, operator)
     VALUES (?, ?, 'consume', ?, ?, ?, 'llm_gateway')`,
    [txId, userId, -amount, balanceAfter, reason],
  );

  log.info(`deduct userId=${userId} amount=${amount} balance=${balanceAfter} reason="${reason}"`);

  return {
    success: true,
    balanceAfter,
    deducted: amount,
    transactionId: txId,
  };
}

/* ─────────────────────────────────────────────
   退还积分（调用失败时回滚）
───────────────────────────────────────────── */

export async function refundCredits(
  userId: string,
  amount: number,
  reason: string,
  originalTxId: string,
): Promise<void> {
  if (amount <= 0) return;

  await execute(
    `UPDATE user_profiles
     SET credits = credits + ?,
         total_spent = GREATEST(total_spent - ?, 0)
     WHERE id = ?`,
    [amount, amount, userId],
  );

  const updated = await queryOne<UserRow>(
    "SELECT credits FROM user_profiles WHERE id = ?",
    [userId],
  );
  const balanceAfter = updated?.credits ?? 0;

  const txId = randomUUID();
  await execute(
    `INSERT INTO credit_transactions (id, user_id, type, amount, balance_after, reason, operator)
     VALUES (?, ?, 'refund', ?, ?, ?, 'llm_gateway')`,
    [txId, userId, amount, balanceAfter, `退款: ${reason} (原流水: ${originalTxId})`],
  );

  log.info(`refund userId=${userId} amount=${amount} balance=${balanceAfter}`);
}

/* ─────────────────────────────────────────────
   LLM 调用完整积分流程（扣减 + 流水记录）
───────────────────────────────────────────── */

/**
 * 在 LLM 调用前执行积分扣减。
 * 返回 transactionId，供调用失败时退款使用。
 *
 * 用法：
 *   const { success, transactionId } = await chargeLLMCredits(userId, modelId, baseCost, "爆款拆解");
 *   if (!success) throw new Error("积分不足");
 *   try {
 *     const result = await callLLM(...);
 *   } catch {
 *     await refundCredits(userId, chargedCost, "调用失败", transactionId);
 *   }
 */
export async function chargeLLMCredits(
  userId: string,
  modelId: AIModelId,
  baseCost: number,
  taskLabel: string,
): Promise<{ success: boolean; chargedCost: number; transactionId: string; reason?: string }> {
  const chargedCost = calcChargedCredits(baseCost, modelId);

  if (chargedCost <= 0) {
    return { success: true, chargedCost: 0, transactionId: "free" };
  }

  const reason = `${taskLabel}（模型: ${modelId}，基础: ${baseCost}积分）`;
  const result = await deductCredits(userId, chargedCost, reason);

  return {
    success: result.success,
    chargedCost,
    transactionId: result.transactionId,
    reason: result.reason,
  };
}

/* ─────────────────────────────────────────────
   记录 LLM 使用日志（可选，供数据分析）
───────────────────────────────────────────── */

export async function recordLLMUsage(record: LLMUsageRecord): Promise<void> {
  try {
    await execute(
      `INSERT INTO llm_usage_logs
         (id, user_id, model_id, task_label, base_cost, charged_cost, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE id = id`,
      [
        randomUUID(),
        record.userId,
        record.modelId,
        record.taskLabel,
        record.baseCost,
        record.chargedCost,
        record.promptTokens ?? 0,
        record.completionTokens ?? 0,
      ],
    );
  } catch (err) {
    // 日志写入失败不影响主流程
    log.warn({ err: err }, "recordLLMUsage failed");
  }
}
