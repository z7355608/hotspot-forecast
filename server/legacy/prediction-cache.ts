/**
 * prediction-cache.ts
 * 预测结果缓存 + 分析耗时记录
 *
 * - buildCacheKey(prompt, platforms) → 生成缓存键
 * - getCachedPrediction(key) → 查询缓存
 * - setCachedPrediction(key, prompt, platforms, result) → 写入缓存
 * - recordAnalysisTiming(data) → 记录耗时
 * - getTimingStats() → 查询统计
 */

import { createHash } from "node:crypto";
import { query, execute, queryOne } from "./database.js";
import { createModuleLogger } from "./logger.js";
import type { RowDataPacket } from "mysql2/promise";

const log = createModuleLogger("PredictionCache");

/** 缓存 TTL：1 小时 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * 生成缓存键：SHA-256(prompt.trim().toLowerCase() + "|" + sortedPlatforms)
 */
export function buildCacheKey(prompt: string, platforms: string[]): string {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  const platformStr = [...platforms].sort().join(",");
  return createHash("sha256")
    .update(`${normalized}|${platformStr}`)
    .digest("hex")
    .slice(0, 64);
}

interface CacheRow extends RowDataPacket {
  cacheKey: string;
  resultJson: string;
  expiresAt: Date;
  hitCount: number;
}

/**
 * 查询缓存，命中则返回解析后的结果对象，同时更新命中计数
 */
export async function getCachedPrediction(
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    const row = await queryOne<CacheRow>(
      "SELECT cacheKey, resultJson, expiresAt, hitCount FROM prediction_cache WHERE cacheKey = ? LIMIT 1",
      [cacheKey],
    );

    if (!row) return null;

    // 检查是否过期
    if (new Date(row.expiresAt) < new Date()) {
      execute("DELETE FROM prediction_cache WHERE cacheKey = ?", [cacheKey]).catch(() => {});
      return null;
    }

    // 更新命中计数（异步，不阻塞）
    execute(
      "UPDATE prediction_cache SET hitCount = hitCount + 1 WHERE cacheKey = ?",
      [cacheKey],
    ).catch(() => {});

    log.info(`缓存命中: ${cacheKey.slice(0, 16)}... (命中次数: ${row.hitCount + 1})`);
    return JSON.parse(row.resultJson) as Record<string, unknown>;
  } catch (err) {
    log.warn({ err }, "缓存查询失败，降级到实时分析");
    return null;
  }
}

/**
 * 写入缓存
 */
export async function setCachedPrediction(
  cacheKey: string,
  prompt: string,
  platforms: string[],
  result: Record<string, unknown>,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    const resultJson = JSON.stringify(result);
    const platformStr = platforms.join(",");

    await execute(
      `INSERT INTO prediction_cache (cacheKey, prompt, platforms, resultJson, hitCount, expiresAt)
       VALUES (?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE resultJson = VALUES(resultJson), expiresAt = VALUES(expiresAt), hitCount = 0`,
      [cacheKey, prompt.slice(0, 1000), platformStr, resultJson, expiresAt],
    );

    log.info(`缓存已写入: ${cacheKey.slice(0, 16)}... (TTL: 1h)`);
  } catch (err) {
    log.warn({ err }, "缓存写入失败，不影响正常流程");
  }
}

/**
 * 清除过期缓存（可定期调用）
 */
export async function cleanExpiredCache(): Promise<number> {
  try {
    const result = await execute("DELETE FROM prediction_cache WHERE expiresAt < NOW()");
    return result.affectedRows ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 记录分析耗时
 */
export interface AnalysisTimingData {
  runId: string;
  userOpenId?: string;
  promptSnippet?: string;
  platforms?: string[];
  totalMs?: number;
  intentMs?: number;
  collectMs?: number;
  llmMs?: number;
  cacheHit?: boolean;
  status?: "success" | "partial_success" | "failed";
  platformTimings?: Record<string, number>;
}

export async function recordAnalysisTiming(data: AnalysisTimingData): Promise<void> {
  try {
    await execute(
      `INSERT INTO analysis_timing
        (runId, userOpenId, promptSnippet, platforms, totalMs, intentMs, collectMs, llmMs, cacheHit, status, platformTimingsJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.runId,
        data.userOpenId ?? null,
        data.promptSnippet?.slice(0, 100) ?? null,
        data.platforms?.join(",") ?? null,
        data.totalMs ?? null,
        data.intentMs ?? null,
        data.collectMs ?? null,
        data.llmMs ?? null,
        data.cacheHit ? 1 : 0,
        data.status ?? "success",
        data.platformTimings ? JSON.stringify(data.platformTimings) : null,
      ],
    );
  } catch (err) {
    log.warn({ err }, "耗时记录写入失败，不影响正常流程");
  }
}

interface TimingRow extends RowDataPacket {
  runId: string;
  promptSnippet: string | null;
  platforms: string | null;
  totalMs: number | null;
  collectMs: number | null;
  llmMs: number | null;
  cacheHit: number;
  status: string;
  createdAt: Date;
}

/**
 * 查询耗时统计（用于监控面板）
 */
export async function getTimingStats(limit = 200) {
  try {
    const rows = await query<TimingRow[]>(
      "SELECT runId, promptSnippet, platforms, totalMs, collectMs, llmMs, cacheHit, status, createdAt FROM analysis_timing ORDER BY createdAt DESC LIMIT ?",
      [limit],
    );

    const total = rows.length;
    const successful = rows.filter((r) => r.status === "success" || r.status === "partial_success");
    const cacheHits = rows.filter((r) => r.cacheHit === 1);

    const validTotals = successful
      .map((r) => r.totalMs)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);

    const p50 = validTotals[Math.floor(validTotals.length * 0.5)] ?? 0;
    const p90 = validTotals[Math.floor(validTotals.length * 0.9)] ?? 0;
    const p99 = validTotals[Math.floor(validTotals.length * 0.99)] ?? 0;
    const avgTotal = validTotals.length
      ? Math.round(validTotals.reduce((a, b) => a + b, 0) / validTotals.length)
      : 0;

    const collectValues = successful
      .map((r) => r.collectMs)
      .filter((v): v is number => v != null);
    const avgCollect = collectValues.length
      ? Math.round(collectValues.reduce((a, b) => a + b, 0) / collectValues.length)
      : 0;

    const llmValues = successful
      .map((r) => r.llmMs)
      .filter((v): v is number => v != null);
    const avgLlm = llmValues.length
      ? Math.round(llmValues.reduce((a, b) => a + b, 0) / llmValues.length)
      : 0;

    return {
      total,
      successRate: total > 0 ? Math.round((successful.length / total) * 100) : 0,
      cacheHitRate: total > 0 ? Math.round((cacheHits.length / total) * 100) : 0,
      p50Ms: p50,
      p90Ms: p90,
      p99Ms: p99,
      avgTotalMs: avgTotal,
      avgCollectMs: avgCollect,
      avgLlmMs: avgLlm,
      recentRuns: rows.slice(0, 50).map((r) => ({
        runId: r.runId,
        promptSnippet: r.promptSnippet,
        platforms: r.platforms,
        totalMs: r.totalMs,
        collectMs: r.collectMs,
        llmMs: r.llmMs,
        cacheHit: r.cacheHit === 1,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    log.warn({ err }, "耗时统计查询失败");
    return null;
  }
}
