/**
 * server/low-follower-api.ts
 * ═══════════════════════════════════════════════════════════════
 * 模块四 HTTP 处理器 — 低粉爆款 API
 *
 * 端点：
 * POST /api/low-follower/detect        — 从 TikHub 原始数据执行低粉爆款检测
 * POST /api/low-follower/analyze       — 从已提取内容执行算法（不需要 TikHub 原始数据）
 * POST /api/low-follower/advice        — 基于算法结果生成个性化建议
 * GET  /api/low-follower/samples       — 查询历史低粉样本库
 * GET  /api/low-follower/stats/:topic  — 查询话题的低粉爆款比例统计
 * POST /api/low-follower/replicability — 批量样本可复制性分析
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LowFollowerAPI");
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { setCorsHeaders } from "./cors.js";
import {
  cleanAndPersistLowFollowerSamples,
  runAlgorithmFromExtractedContents,
  queryLowFollowerSamples,
  queryAnomalyRatioStats,
  type CleanAndPersistInput,
} from "./low-follower-cleaner.js";
import {
  generatePersonalizedAdvice,
  analyzeSampleReplicability,
  type UserContext,
} from "./low-follower-advisor.js";
import {
  runLowFollowerAlgorithm,
  toLowFollowerEvidenceItem,
  type RawContentItem,
  type RawAccountItem,
  type LowFollowerAlgorithmResult,
} from "./low-follower-algorithm.js";

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/** 当前请求对象引用，用于 CORS origin 反射 */
let _lfCurrentRequest: IncomingMessage | null = null;

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (_lfCurrentRequest) {
    setCorsHeaders(_lfCurrentRequest, response, "GET,POST,OPTIONS,PATCH");
  }
  response.end(JSON.stringify(payload));
}

/** 设置当前请求引用（在每个 handler 入口调用） */
function setCurrentRequest(req: IncomingMessage) { _lfCurrentRequest = req; }

function getQueryParams(request: IncomingMessage): Record<string, string> {
  const base = `http://localhost${request.url ?? "/"}`;
  const url = new URL(base);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// ─────────────────────────────────────────────
// POST /api/low-follower/detect
// 从 TikHub 原始数据执行低粉爆款检测 + 持久化
// ─────────────────────────────────────────────

export async function handleDetectLowFollower(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  try {
    const body = await readJsonBody<CleanAndPersistInput>(request);
    const { rawRecords, platform, seedTopic, industryName, algorithmConfig, persist = true } = body;

    if (!rawRecords || !Array.isArray(rawRecords)) {
      sendJson(response, 400, { error: "rawRecords 必须是数组" });
      return;
    }
    if (!platform) {
      sendJson(response, 400, { error: "platform 为必填项" });
      return;
    }
    if (!seedTopic) {
      sendJson(response, 400, { error: "seedTopic 为必填项" });
      return;
    }

    const result = await cleanAndPersistLowFollowerSamples({
      rawRecords,
      platform,
      seedTopic,
      industryName,
      algorithmConfig,
      persist,
    });

    sendJson(response, 200, {
      runId: result.runId,
      lowFollowerAnomalyRatio: result.algorithmResult.lowFollowerAnomalyRatio,
      anomalyHitCount: result.algorithmResult.anomalyHitCount,
      totalContentCount: result.algorithmResult.totalContentCount,
      p75Benchmark: result.algorithmResult.p75InteractionBenchmark,
      dynamicFollowerFloor: result.algorithmResult.dynamicFollowerFloor,
      computeNote: result.algorithmResult.computeNote,
      evidenceItems: result.evidenceItems,
      persistedCount: result.persistedCount,
      persistSuccess: result.persistSuccess,
      error: result.error,
    });
  } catch (err) {
    log.error({ err: err }, "/detect error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}

// ─────────────────────────────────────────────
// POST /api/low-follower/analyze
// 从已提取的内容格式执行算法（轻量版，不需要 TikHub 原始数据）
// ─────────────────────────────────────────────

export async function handleAnalyzeLowFollower(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  try {
    const body = await readJsonBody<{
      extractedContents?: Array<{
        contentId: string;
        title: string;
        authorName: string;
        platform: string;
        publishedAt: string;
        viewCount: number | null;
        likeCount: number | null;
        commentCount: number | null;
        shareCount: number | null;
        keywordTokens: string[];
        authorFollowerCount?: number | null;
        authorId?: string;
      }>;
      rawContents?: RawContentItem[];
      rawAccounts?: RawAccountItem[];
      algorithmConfig?: Record<string, unknown>;
    }>(request);

    const { extractedContents, rawContents, rawAccounts, algorithmConfig } = body;

    let result: LowFollowerAlgorithmResult;

    if (extractedContents && Array.isArray(extractedContents)) {
      result = runAlgorithmFromExtractedContents(extractedContents, algorithmConfig);
    } else if (rawContents && rawAccounts) {
      result = runLowFollowerAlgorithm(rawContents, rawAccounts, algorithmConfig);
    } else {
      sendJson(response, 400, { error: "需要提供 extractedContents 或 rawContents+rawAccounts" });
      return;
    }

    const evidenceItems = result.samples
      .filter((s) => s.isStrictAnomaly)
      .concat(result.samples.filter((s) => !s.isStrictAnomaly))
      .slice(0, 8)
      .map(toLowFollowerEvidenceItem);

    sendJson(response, 200, {
      lowFollowerAnomalyRatio: result.lowFollowerAnomalyRatio,
      anomalyHitCount: result.anomalyHitCount,
      totalContentCount: result.totalContentCount,
      p75Benchmark: result.p75InteractionBenchmark,
      dynamicFollowerFloor: result.dynamicFollowerFloor,
      computeNote: result.computeNote,
      evidenceItems,
      config: result.config,
    });
  } catch (err) {
    log.error({ err: err }, "/analyze error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}

// ─────────────────────────────────────────────
// POST /api/low-follower/advice
// 基于算法结果生成个性化建议
// ─────────────────────────────────────────────

export async function handleGenerateAdvice(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  try {
    const body = await readJsonBody<{
      detectionRunId?: string;
      seedTopic: string;
      algorithmResult: LowFollowerAlgorithmResult;
      userContext?: UserContext;
      persist?: boolean;
    }>(request);

    const { detectionRunId, seedTopic, algorithmResult, userContext, persist = true } = body;

    if (!seedTopic) {
      sendJson(response, 400, { error: "seedTopic 为必填项" });
      return;
    }
    if (!algorithmResult) {
      sendJson(response, 400, { error: "algorithmResult 为必填项" });
      return;
    }

    const advice = await generatePersonalizedAdvice({
      detectionRunId: detectionRunId ?? `manual_${Date.now()}`,
      seedTopic,
      algorithmResult,
      userContext,
      persist,
    });

    sendJson(response, 200, advice);
  } catch (err) {
    log.error({ err: err }, "/advice error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}

// ─────────────────────────────────────────────
// GET /api/low-follower/samples
// 查询历史低粉样本库
// ─────────────────────────────────────────────

export async function handleQuerySamples(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  try {
    const q = getQueryParams(request);

    const samples = await queryLowFollowerSamples({
      seedTopic: q.seedTopic,
      industryName: q.industryName,
      platform: q.platform,
      isStrictOnly: q.isStrictOnly === "true",
      limit: q.limit ? parseInt(q.limit, 10) : 20,
      minAnomalyScore: q.minAnomalyScore ? parseInt(q.minAnomalyScore, 10) : undefined,
    });

    const evidenceItems = samples.map(toLowFollowerEvidenceItem);

    sendJson(response, 200, {
      total: samples.length,
      samples: evidenceItems,
    });
  } catch (err) {
    log.error({ err: err }, "/samples error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}

// ─────────────────────────────────────────────
// GET /api/low-follower/stats/:topic
// 查询话题的低粉爆款比例统计
// ─────────────────────────────────────────────

export async function handleGetStats(
  request: IncomingMessage,
  response: ServerResponse,
  topic?: string,
): Promise<void> {
  setCurrentRequest(request);
  try {
    if (!topic) {
      sendJson(response, 400, { error: "topic 为必填项" });
      return;
    }

    const stats = await queryAnomalyRatioStats(decodeURIComponent(topic));
    sendJson(response, 200, stats);
  } catch (err) {
    log.error({ err: err }, "/stats error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}

// ─────────────────────────────────────────────
// POST /api/low-follower/replicability
// 批量样本可复制性分析
// ─────────────────────────────────────────────

export async function handleReplicabilityAnalysis(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  try {
    const body = await readJsonBody<{
      samples: Parameters<typeof analyzeSampleReplicability>[0];
      seedTopic: string;
    }>(request);

    const { samples, seedTopic } = body;

    if (!samples || !Array.isArray(samples)) {
      sendJson(response, 400, { error: "samples 必须是数组" });
      return;
    }
    if (!seedTopic) {
      sendJson(response, 400, { error: "seedTopic 为必填项" });
      return;
    }

    const analyses = await analyzeSampleReplicability(samples, seedTopic);
    sendJson(response, 200, { analyses });
  } catch (err) {
    log.error({ err: err }, "/replicability error");
    sendJson(response, 500, { error: err instanceof Error ? err.message : "内部错误" });
  }
}
