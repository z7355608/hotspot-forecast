/**
 * server/trend-api.ts
 * ═══════════════════════════════════════════════════════════════
 * 模块三 HTTP 处理器
 *
 * 路由：
 * POST /api/trend/analyze       — 完整赛道情报分析
 * POST /api/trend/score         — 单独调用 AI 评分引擎
 * POST /api/trend/decision      — 单独生成决策边界与风险提示
 * GET  /api/trend/intelligence/:runId — 获取已缓存的赛道情报
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("TrendAPI");
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { setCorsHeaders } from "./cors.js";
import {
  buildTrendIntelligence,
  buildWhyNowItemsFromIntelligence,
  type TrendIntelligenceResult,
  type EvidenceMetrics,
  type DataQualityReport,
  type IndustryProfile,
  type LowFollowerAnomalySample,
} from "./trend-intelligence.js";
import {
  generateAIScoreBreakdown,
  toScoreBreakdownCompat,
  getScoreLabel,
  getTimingLabel,
  getMomentumLabel,
  type AIScoreBreakdown,
} from "./ai-scoring-engine.js";
import {
  generateDecisionBoundary,
  inferVerdictFromScores,
  type DecisionBoundaryResult,
} from "./decision-boundary.js";

// ─────────────────────────────────────────────
// 内存缓存（简单 Map，生产环境可替换为 Redis）
// ─────────────────────────────────────────────

interface TrendAnalysisCache {
  runId: string;
  createdAt: string;
  intelligence: TrendIntelligenceResult;
  scoreBreakdown: AIScoreBreakdown;
  decisionBoundary: DecisionBoundaryResult;
  verdict: "go_now" | "test_small" | "observe" | "not_now";
  whyNowItems: ReturnType<typeof buildWhyNowItemsFromIntelligence>;
}

const trendCache = new Map<string, TrendAnalysisCache>();

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/** 当前请求对象引用，用于 CORS origin 反射 */
let _trendCurrentRequest: IncomingMessage | null = null;

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (_trendCurrentRequest) {
    setCorsHeaders(_trendCurrentRequest, response);
  }
  response.end(JSON.stringify(payload));
}

/** 设置当前请求引用 */
function setCurrentRequest(req: IncomingMessage) { _trendCurrentRequest = req; }

// ─────────────────────────────────────────────
// 请求类型定义
// ─────────────────────────────────────────────

interface TrendAnalyzeRequest {
  /** 用户输入的 Prompt */
  prompt: string;
  /** 赛道主题（从 Prompt 提取或用户指定） */
  seedTopic: string;
  /** 输入类型 */
  inputKind?: "topic" | "content_url" | "account";
  /** 平台运行结果（从 live-predictions 传入） */
  runs?: Array<{
    platform: "douyin" | "xiaohongshu";
    degradeFlags: string[];
    snapshot: {
      capabilityResults?: Array<{ capability: string; payload: unknown }>;
    };
  }>;
  /** 已有证据缺口（从 live-predictions 传入） */
  evidenceGaps?: string[];
  /** 平台名称列表 */
  platforms?: string[];
}

interface TrendScoreRequest {
  /** 行业档案 */
  industryProfile: IndustryProfile;
  /** 证据指标 */
  evidenceMetrics: EvidenceMetrics;
  /** 数据质量报告 */
  dataQuality: DataQualityReport;
  /** 输入类型 */
  inputKind?: "topic" | "content_url" | "account";
  /** 平台名称列表 */
  platforms?: string[];
}

interface TrendDecisionRequest {
  /** 行业档案 */
  industryProfile: IndustryProfile;
  /** 证据缺口 */
  evidenceGaps: string[];
  /** 评分结果 */
  scoreBreakdown: AIScoreBreakdown;
  /** 证据指标 */
  evidenceMetrics: EvidenceMetrics;
  /** 数据质量报告 */
  dataQuality: DataQualityReport;
  /** 低粉异常样本 */
  lowFollowerAnomalies?: LowFollowerAnomalySample[];
  /** 当前判断 */
  verdict?: "go_now" | "test_small" | "observe" | "not_now";
  /** 输入类型 */
  inputKind?: "topic" | "content_url" | "account";
  /** 平台名称列表 */
  platforms?: string[];
}

// ─────────────────────────────────────────────
// POST /api/trend/analyze — 完整赛道情报分析
// ─────────────────────────────────────────────

export async function handleAnalyzeTrend(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  let body: TrendAnalyzeRequest;
  try {
    body = await readJsonBody<TrendAnalyzeRequest>(request);
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }

  const { prompt, seedTopic, inputKind = "topic", runs = [], evidenceGaps = [], platforms = [] } = body;

  if (!prompt || !seedTopic) {
    sendJson(response, 400, { error: "prompt 和 seedTopic 是必填字段" });
    return;
  }

  try {
    const runId = `trend_${randomUUID()}`;

    // Step 1: 构建赛道情报（行业建模 + 特征提取 + 低粉异常检测）
    const intelligence = await buildTrendIntelligence(runs, prompt, seedTopic);

    // Step 2: AI 深度评分
    const scoreBreakdown = await generateAIScoreBreakdown(
      intelligence.industryProfile,
      intelligence.evidenceMetrics,
      intelligence.dataQuality,
      inputKind,
      platforms.length > 0 ? platforms : runs.map((r) => r.platform),
    );

    // Step 3: 推断 verdict
    const verdict = inferVerdictFromScores(
      scoreBreakdown,
      intelligence.evidenceMetrics,
      evidenceGaps,
      intelligence.lowFollowerAnomalies.length,
    );

    // Step 4: 决策边界与风险提示
    const decisionBoundary = await generateDecisionBoundary(
      intelligence.industryProfile,
      evidenceGaps,
      scoreBreakdown,
      intelligence.evidenceMetrics,
      intelligence.dataQuality,
      intelligence.lowFollowerAnomalies,
      verdict,
      inputKind,
      platforms.length > 0 ? platforms : runs.map((r) => r.platform),
    );

    // Step 5: 生成 whyNowItems
    const whyNowItems = buildWhyNowItemsFromIntelligence(
      intelligence,
      platforms.length > 0 ? platforms : runs.map((r) => r.platform),
    );

    // 缓存结果
    const cache: TrendAnalysisCache = {
      runId,
      createdAt: new Date().toISOString(),
      intelligence,
      scoreBreakdown,
      decisionBoundary,
      verdict,
      whyNowItems,
    };
    trendCache.set(runId, cache);
    // 保留最近 100 条缓存
    if (trendCache.size > 100) {
      const firstKey = trendCache.keys().next().value;
      if (firstKey) trendCache.delete(firstKey);
    }

    // 创建分析完成通知
    try {
      const { createNotification } = await import("../db.js");
      await createNotification({
        userOpenId: "system",
        type: "analysis_complete",
        title: `赛道分析完成`,
        body: `「${seedTopic}」赛道机会评分: ${scoreBreakdown.opportunity.score}/100，${getScoreLabel(scoreBreakdown.opportunity.score)}。`,
        tone: scoreBreakdown.opportunity.score >= 70 ? "green" : scoreBreakdown.opportunity.score >= 40 ? "blue" : "gray",
        relatedId: runId,
        actionUrl: "/",
      });
    } catch (notifErr) {
      log.warn({ err: notifErr }, "创建通知失败");
    }

    sendJson(response, 200, {
      runId,
      createdAt: cache.createdAt,
      // 赛道情报摘要
      industryProfile: intelligence.industryProfile,
      evidenceMetrics: intelligence.evidenceMetrics,
      dataQuality: intelligence.dataQuality,
      lowFollowerAnomalyCount: intelligence.lowFollowerAnomalies.length,
      contentSampleCount: intelligence.contentFeatures.length,
      accountSampleCount: intelligence.accountFeatures.length,
      // AI 评分结果
      scoreBreakdown: toScoreBreakdownCompat(scoreBreakdown),
      aiScoreBreakdown: scoreBreakdown,
      scoreLabel: getScoreLabel(scoreBreakdown.opportunity.score),
      timingLabel: getTimingLabel(scoreBreakdown.timing.score),
      momentumLabel: getMomentumLabel(
        intelligence.evidenceMetrics.hotSeedCount,
        intelligence.evidenceMetrics.growth7d,
        evidenceGaps.length,
      ),
      // 决策结果
      verdict,
      decisionBoundary,
      // whyNow 信号
      whyNowItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "赛道情报分析失败";
    log.error({ err: err }, "handleAnalyzeTrend 错误");
    sendJson(response, 500, { error: message });
  }
}

// ─────────────────────────────────────────────
// POST /api/trend/score — 单独调用 AI 评分引擎
// ─────────────────────────────────────────────

export async function handleGetTrendScore(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  let body: TrendScoreRequest;
  try {
    body = await readJsonBody<TrendScoreRequest>(request);
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }

  const { industryProfile, evidenceMetrics, dataQuality, inputKind = "topic", platforms = [] } = body;

  if (!industryProfile || !evidenceMetrics || !dataQuality) {
    sendJson(response, 400, { error: "industryProfile、evidenceMetrics、dataQuality 是必填字段" });
    return;
  }

  try {
    const scoreBreakdown = await generateAIScoreBreakdown(
      industryProfile,
      evidenceMetrics,
      dataQuality,
      inputKind,
      platforms,
    );

    sendJson(response, 200, {
      scoreBreakdown,
      scoreBreakdownCompat: toScoreBreakdownCompat(scoreBreakdown),
      scoreLabel: getScoreLabel(scoreBreakdown.opportunity.score),
      timingLabel: getTimingLabel(scoreBreakdown.timing.score),
      scoringMethod: scoreBreakdown.scoringMethod,
      dataQualityNote: scoreBreakdown.dataQualityNote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 评分失败";
    log.error({ err: err }, "handleGetTrendScore 错误");
    sendJson(response, 500, { error: message });
  }
}

// ─────────────────────────────────────────────
// POST /api/trend/decision — 单独生成决策边界与风险提示
// ─────────────────────────────────────────────

export async function handleGetDecisionBoundary(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCurrentRequest(request);
  let body: TrendDecisionRequest;
  try {
    body = await readJsonBody<TrendDecisionRequest>(request);
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }

  const {
    industryProfile,
    evidenceGaps,
    scoreBreakdown,
    evidenceMetrics,
    dataQuality,
    lowFollowerAnomalies = [],
    verdict,
    inputKind = "topic",
    platforms = [],
  } = body;

  if (!industryProfile || !scoreBreakdown || !evidenceMetrics || !dataQuality) {
    sendJson(response, 400, { error: "industryProfile、scoreBreakdown、evidenceMetrics、dataQuality 是必填字段" });
    return;
  }

  // 如果没有传入 verdict，从评分推断
  const effectiveVerdict = verdict ?? inferVerdictFromScores(
    scoreBreakdown,
    evidenceMetrics,
    evidenceGaps ?? [],
    lowFollowerAnomalies.length,
  );

  try {
    const decisionBoundary = await generateDecisionBoundary(
      industryProfile,
      evidenceGaps ?? [],
      scoreBreakdown,
      evidenceMetrics,
      dataQuality,
      lowFollowerAnomalies,
      effectiveVerdict,
      inputKind,
      platforms,
    );

    sendJson(response, 200, {
      verdict: effectiveVerdict,
      decisionBoundary,
      generationMethod: decisionBoundary.generationMethod,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "决策边界生成失败";
    log.error({ err: err }, "handleGetDecisionBoundary 错误");
    sendJson(response, 500, { error: message });
  }
}

// ─────────────────────────────────────────────
// GET /api/trend/intelligence/:runId — 获取已缓存的赛道情报
// ─────────────────────────────────────────────

export async function handleGetTrendIntelligence(
  request: IncomingMessage,
  response: ServerResponse,
  runId: string,
): Promise<void> {
  setCurrentRequest(request);
  const cached = trendCache.get(runId);
  if (!cached) {
    sendJson(response, 404, { error: `赛道情报 ${runId} 不存在或已过期` });
    return;
  }

  sendJson(response, 200, {
    runId: cached.runId,
    createdAt: cached.createdAt,
    intelligence: cached.intelligence,
    scoreBreakdown: cached.scoreBreakdown,
    decisionBoundary: cached.decisionBoundary,
    verdict: cached.verdict,
    whyNowItems: cached.whyNowItems,
  });
}
