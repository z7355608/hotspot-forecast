/**
 * server/creator-center-api.ts
 * ═══════════════════════════════════════════════════════════════
 * 模块五：创作中心 HTTP 处理器
 *
 * 端点列表：
 * POST /api/creator/sync          — 同步账号数据（拉取真实数据）
 * GET  /api/creator/overview      — 获取账号概览
 * GET  /api/creator/works         — 获取作品列表
 * GET  /api/creator/fan-profile   — 获取粉丝画像
 * GET  /api/creator/trends        — 获取趋势数据
 * POST /api/creator/diagnose      — 运行账号诊断 Agent
 * GET  /api/creator/diagnosis     — 获取最新诊断报告
 * POST /api/creator/comment-summary — 评论区 AI 摘要
 * GET  /api/creator/work-comments    — 获取作品评论列表
 * POST /api/creator/fetch-comments   — 拉取并存储真实评论
 * POST /api/creator/analyze-comments — AI 深度分析评论
 * GET  /api/creator/comment-analysis — 获取已缓存的评论分析
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("CreatorCenterAPI");
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  syncCreatorData,
  getCachedOverview,
  getCachedWorks,
  getCachedFanProfile,
  getCachedTrends,
} from "./creator-data-sync.js";
import {
  fetchRealComments,
  persistComments,
  getCachedComments,
  getCachedCommentCount,
  analyzeComments,
  getCachedAnalysis,
} from "./comment-service.js";
import { readConnectorStore } from "./storage.js";
import {
  runAccountDiagnosis,
  getLatestDiagnosisReport,
  generateCommentSummary,
} from "./account-diagnosis-agent.js";

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function parseQuery(req: IncomingMessage): Record<string, string> {
  const url = req.url ?? "";
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return {};
  const qs = url.slice(qIdx + 1);
  const result: Record<string, string> = {};
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return result;
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function getUserId(req: IncomingMessage): string {
  // 从请求头或 Cookie 中获取用户 ID（与现有 auth 体系一致）
  const userId = (req.headers["x-user-id"] as string) ?? "demo_user";
  return userId;
}

// ─────────────────────────────────────────────
// 端点处理器
// ─────────────────────────────────────────────

/**
 * POST /api/creator/sync
 * 同步账号数据（调用 TikHub API 拉取真实数据）
 */
export async function handleCreatorSync(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);
    const userId = getUserId(req);

    const {
      platformId,
      days = 30,
      forceRefresh = false,
    } = body as {
      platformId?: string;
      days?: number;
      forceRefresh?: boolean;
    };

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    // 自动从 connector store 读取已绑定的账号信息（扫码登录模式不再依赖前端传参）
    const connectorStore = await readConnectorStore();
    const connector = connectorStore[platformId];
    if (!connector) {
      sendJson(res, 422, { error: `请先在账号连接页面绑定 ${platformId} 账号` });
      return;
    }

    const result = await syncCreatorData({
      userId,
      platformId,
      platformUserId: connector.platformUserId,
      handle: connector.handle,
      profileUrl: connector.profileUrl,
      encryptedSecretRef: connector.encryptedSecretRef,
      days,
      persist: true,
      forceRefresh,
    });

    sendJson(res, result.success ? 200 : 422, result);
  } catch (err) {
    log.error({ err: err }, "handleCreatorSync error");
    sendJson(res, 500, { error: "同步失败，请稍后重试" });
  }
}

/**
 * GET /api/creator/overview?platformId=douyin
 * 获取账号概览（优先从缓存读取）
 */
export async function handleGetOverview(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { platformId } = parseQuery(req);

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    const overview = await getCachedOverview(userId, platformId);
    if (!overview) {
      sendJson(res, 404, { error: "暂无数据，请先同步账号" });
      return;
    }

    sendJson(res, 200, { overview });
  } catch (err) {
    log.error({ err: err }, "handleGetOverview error");
    sendJson(res, 500, { error: "获取数据失败" });
  }
}

/**
 * GET /api/creator/works?platformId=douyin&limit=20&sortBy=views
 * 获取作品列表
 */
export async function handleGetWorks(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { platformId, limit, sortBy } = parseQuery(req);

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    const works = await getCachedWorks(
      userId,
      platformId,
      limit ? parseInt(limit, 10) : 30,
      sortBy ?? "published_at",
    );

    sendJson(res, 200, { works, total: works.length });
  } catch (err) {
    log.error({ err: err }, "handleGetWorks error");
    sendJson(res, 500, { error: "获取作品列表失败" });
  }
}

/**
 * GET /api/creator/fan-profile?platformId=douyin
 * 获取粉丝画像
 */
export async function handleGetFanProfile(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { platformId } = parseQuery(req);

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    const fanProfile = await getCachedFanProfile(userId, platformId);
    if (!fanProfile) {
      sendJson(res, 404, { error: "暂无粉丝画像数据，请先同步账号" });
      return;
    }

    sendJson(res, 200, { fanProfile });
  } catch (err) {
    log.error({ err: err }, "handleGetFanProfile error");
    sendJson(res, 500, { error: "获取粉丝画像失败" });
  }
}

/**
 * GET /api/creator/trends?platformId=douyin&days=30
 * 获取趋势数据
 */
export async function handleGetTrends(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { platformId, days } = parseQuery(req);

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    const trendData = await getCachedTrends(
      userId,
      platformId,
      days ? parseInt(days, 10) : 30,
    );

    sendJson(res, 200, { trendData });
  } catch (err) {
    log.error({ err: err }, "handleGetTrends error");
    sendJson(res, 500, { error: "获取趋势数据失败" });
  }
}

/**
 * POST /api/creator/diagnose
 * 运行账号诊断 Agent（互动率归因 + 账号打法生成）
 */
export async function handleRunDiagnosis(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);
    const userId = getUserId(req);

    const {
      platformId,
      topicContext,
      userGoal,
    } = body as {
      platformId?: string;
      topicContext?: string;
      userGoal?: string;
    };

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    // 从缓存读取账号数据
    const overview = await getCachedOverview(userId, platformId);
    if (!overview) {
      sendJson(res, 422, {
        error: "请先同步账号数据（POST /api/creator/sync），再运行诊断",
      });
      return;
    }

    const works = await getCachedWorks(userId, platformId, 50);
    const fanProfile = await getCachedFanProfile(userId, platformId);
    const trendData = await getCachedTrends(userId, platformId, 30);

    const report = await runAccountDiagnosis({
      userId,
      platformId,
      overview,
      works,
      fanProfile: fanProfile ?? undefined,
      trendData,
      topicContext,
      userGoal,
    });

    sendJson(res, 200, { report });
  } catch (err) {
    log.error({ err: err }, "handleRunDiagnosis error");
    sendJson(res, 500, { error: "诊断失败，请稍后重试" });
  }
}

/**
 * GET /api/creator/diagnosis?platformId=douyin
 * 获取最新诊断报告
 */
export async function handleGetDiagnosis(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { platformId } = parseQuery(req);

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    const report = await getLatestDiagnosisReport(userId, platformId);
    if (!report) {
      sendJson(res, 404, { error: "暂无诊断报告，请先运行诊断" });
      return;
    }

    sendJson(res, 200, { report });
  } catch (err) {
    log.error({ err: err }, "handleGetDiagnosis error");
    sendJson(res, 500, { error: "获取诊断报告失败" });
  }
}

/**
 * POST /api/creator/comment-summary
 * 评论区 AI 摘要
 */
export async function handleCommentSummary(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);

    const {
      comments = [],
      workTitle = "该作品",
    } = body as {
      comments?: Array<{ content: string; sentiment?: string; likes?: number }>;
      workTitle?: string;
    };

    if (!Array.isArray(comments) || comments.length === 0) {
      sendJson(res, 400, { error: "comments array is required" });
      return;
    }

    const summary = await generateCommentSummary(comments, workTitle);
    sendJson(res, 200, { summary });
  } catch (err) {
    log.error({ err: err }, "handleCommentSummary error");
    sendJson(res, 500, { error: "生成摘要失败" });
  }
}

/**
 * POST /api/creator/sync-and-diagnose
 * 一键同步 + 诊断（组合端点，减少前端调用次数）
 */
export async function handleSyncAndDiagnose(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);
    const userId = getUserId(req);

    const {
      platformId,
      topicContext,
      userGoal,
      days = 30,
      forceRefresh = false,
    } = body as {
      platformId?: string;
      topicContext?: string;
      userGoal?: string;
      days?: number;
      forceRefresh?: boolean;
    };

    if (!platformId) {
      sendJson(res, 400, { error: "platformId is required" });
      return;
    }

    // 自动从 connector store 读取已绑定的账号信息
    const connectorStore = await readConnectorStore();
    const connector = connectorStore[platformId];
    if (!connector) {
      sendJson(res, 422, { error: `请先在账号连接页面绑定 ${platformId} 账号` });
      return;
    }

    // Step 1: 同步数据
    const syncResult = await syncCreatorData({
      userId,
      platformId,
      platformUserId: connector.platformUserId,
      handle: connector.handle,
      profileUrl: connector.profileUrl,
      encryptedSecretRef: connector.encryptedSecretRef,
      days,
      persist: true,
      forceRefresh,
    });

    if (!syncResult.success || !syncResult.overview) {
      sendJson(res, 422, {
        error: syncResult.error ?? "数据同步失败",
        syncResult,
      });
      return;
    }

    // Step 2: 运行诊断
    const report = await runAccountDiagnosis({
      userId,
      platformId,
      overview: syncResult.overview,
      works: syncResult.works ?? [],
      fanProfile: syncResult.fanProfile,
      trendData: syncResult.trendData,
      topicContext,
      userGoal,
    });

    sendJson(res, 200, {
      syncResult,
      report,
    });
  } catch (err) {
    log.error({ err: err }, "handleSyncAndDiagnose error");
    sendJson(res, 500, { error: "同步诊断失败，请稍后重试" });
  }
}

/**
 * GET /api/creator/work-comments?workId=xxx&limit=50&sortBy=like_count
 * 获取作品评论列表（优先从缓存读取）
 */
export async function handleGetWorkComments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const { workId, limit, sortBy } = parseQuery(req);

    if (!workId) {
      sendJson(res, 400, { error: "workId is required" });
      return;
    }

    const comments = await getCachedComments(
      workId,
      limit ? parseInt(limit, 10) : 50,
      (sortBy === "created_at" ? "created_at" : "like_count") as "like_count" | "created_at",
    );

    sendJson(res, 200, { comments, total: comments.length });
  } catch (err) {
    log.error({ err: err }, "handleGetWorkComments error");
    sendJson(res, 500, { error: "获取评论失败" });
  }
}

/**
 * POST /api/creator/fetch-comments
 * 从 TikHub 拉取真实评论并存储
 * body: { workId, platformId, cursor?, count? }
 */
export async function handleFetchComments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);
    const userId = getUserId(req);

    const {
      workId,
      platformId = "douyin",
      cursor = 0,
      count = 30,
      page = 1,
      pageSize = 20,
    } = body as {
      workId?: string;
      platformId?: string;
      cursor?: number;
      count?: number;
      page?: number;
      pageSize?: number;
    };

    if (!workId) {
      sendJson(res, 400, { error: "workId is required" });
      return;
    }

    // 从 TikHub 获取真实评论（多平台支持）
    const { comments: rawComments, hasMore } = await fetchRealComments(workId, cursor, count, platformId);

    if (rawComments.length > 0) {
      // 持久化到数据库
      await persistComments(userId, platformId, workId, rawComments);
    }

    // 计算下一个 cursor（用于 TikHub 翻页）
    const nextCursor = hasMore ? cursor + count : null;

    // 从数据库分页读取（按点赞排序）
    const offset = (page - 1) * pageSize;
    const comments = await getCachedComments(workId, pageSize, "like_count", offset);
    const totalInDb = await getCachedCommentCount(workId);
    const hasMorePages = offset + comments.length < totalInDb;

    sendJson(res, 200, {
      comments,
      total: totalInDb,
      fromCache: rawComments.length === 0,
      hasMore: hasMore || hasMorePages,
      nextCursor,
      page,
      pageSize,
      totalPages: Math.ceil(totalInDb / pageSize),
    });
  } catch (err) {
    log.error({ err: err }, "handleFetchComments error");
    sendJson(res, 500, { error: "拉取评论失败" });
  }
}

/**
 * POST /api/creator/analyze-comments
 * AI 深度分析评论
 * body: { workId, platformId, workTitle }
 */
export async function handleAnalyzeComments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await parseBody(req);
    const userId = getUserId(req);

    const {
      workId,
      platformId = "douyin",
      workTitle = "该作品",
    } = body as {
      workId?: string;
      platformId?: string;
      workTitle?: string;
    };

    if (!workId) {
      sendJson(res, 400, { error: "workId is required" });
      return;
    }

    const analysis = await analyzeComments(userId, workId, platformId, workTitle);
    sendJson(res, 200, { analysis });
  } catch (err) {
    log.error({ err: err }, "handleAnalyzeComments error");
    sendJson(res, 500, { error: "分析评论失败" });
  }
}

/**
 * GET /api/creator/comment-analysis?workId=xxx
 * 获取已缓存的评论分析结果
 */
export async function handleGetCommentAnalysis(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const { workId } = parseQuery(req);

    if (!workId) {
      sendJson(res, 400, { error: "workId is required" });
      return;
    }

    const analysis = await getCachedAnalysis(workId);
    if (!analysis) {
      sendJson(res, 404, { error: "暂无分析结果，请先拉取评论并分析" });
      return;
    }

    sendJson(res, 200, { analysis });
  } catch (err) {
    log.error({ err: err }, "handleGetCommentAnalysis error");
    sendJson(res, 500, { error: "获取分析结果失败" });
  }
}
