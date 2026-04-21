import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleAdminRequest } from "./admin-api.js";
import {
  handleGetConnectors,
  handleVerify,
  handleBind,
  handleUnbind,
  handleSync,
  handleCreateLoginSession,
  handleGetLoginSession,
} from "./routes/connector-routes.js";
import {
  handlePreparePredictionRequest,
  handleRunLivePrediction,
  handleRunLivePredictionStream,
  handleGetTimingStats,
  handleClearCache,
} from "./routes/prediction-routes.js";
import {
  handleListResultArtifacts,
  handleGetResultArtifact,
  handleCreateResultArtifact,
  handleCreateWatchForArtifact,
  handleListWatchTasks,
  handleRunWatchTask,
  handleGetWatchTaskRun,
  handleProbeEndpointHealth,
  handleGetEndpointHealth,
} from "./routes/artifact-routes.js";
import {
  handleListNotificationChannels,
  handleVerifyNotificationChannel,
  handleBindNotificationChannel,
  handleUnbindNotificationChannel,
  handleTestSendNotificationChannel,
  handleListFeishuChats,
  handleFeishuStatus,
} from "./routes/notification-routes.js";
import {
  handleLLMHealth,
  handleGetCredits,
  handleLLMChat,
  handleLLMStream,
} from "./routes/llm-routes.js";
import { randomUUID } from "node:crypto";
import { dispatchNotificationEvent } from "./notifications.js";
import { getCapabilities } from "./platforms.js";
import { getTikHub } from "./tikhub.js";
import { handleBreakdownAction, type BreakdownActionRequest } from "./breakdown-agent.js";
import { handleVideoParseRequest, handleVideoTranscribeRequest } from "./video-parser.js";
import { handleIntentClassify } from "./intent-agent.js";
import { handleParseInput } from "./input-parser.js";
import { handleExtractPayload } from "./payload-extractor.js";
import { handleGenerateNextActions } from "./next-action-agent.js";
import {
  handleListTemplates,
  handleGetTemplate,
  handleRenderTemplate,
  handleCallTemplate,
  handleUpsertTemplate,
} from "./prompt-engine.js";
import {
  handleListSkills,
  handleExecuteSkill,
  handleToggleSkill,
  handleSkillStats,
} from "./skill-pipeline.js";
import { chargeLLMCredits, refundCredits, getUserCredits } from "./credits.js";
import {
  handleAnalyzeTrend,
  handleGetTrendScore,
  handleGetDecisionBoundary,
  handleGetTrendIntelligence,
} from "./trend-api.js";
import {
  handleDetectLowFollower,
  handleAnalyzeLowFollower,
  handleGenerateAdvice,
  handleQuerySamples,
  handleGetStats,
  handleReplicabilityAnalysis,
} from "./low-follower-api.js";
import {
  handleCreatorSync,
  handleGetOverview,
  handleGetWorks,
  handleGetFanProfile,
  handleGetTrends,
  handleRunDiagnosis,
  handleGetDiagnosis,
  handleCommentSummary,
  handleSyncAndDiagnose,
  handleGetWorkComments,
  handleFetchComments,
  handleAnalyzeComments,
  handleGetCommentAnalysis,
} from "./creator-center-api.js";
import {
  getTopicStrategySession,
  getDirectionsBySession,
  getPeerBenchmarksBySession,
  getCrossIndustryBySession,
  listUserSessions,
} from "./topic-strategy-db.js";
import {
  runPerformanceCollection,
  computePredictionAccuracy,
} from "./performance-tracker.js";
import { aggregateHistoricalFeedback } from "./strategy-evolution.js";
import { setCorsHeaders, getCorsHeadersObj } from "./cors.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("HttpServer");
const imgLog = createModuleLogger("ImageProxy");
const vidLog = createModuleLogger("VideoProxy");
import { execute, query } from "./database.js";
import type { RowDataPacket } from "./database.js";
import { sdk } from "../_core/sdk.js";
import { COOKIE_NAME } from "../../shared/const.js";
import { parse as parseCookieHeader } from "cookie";
import {
  handleGetSchedulerStatus,
  handleStartScheduler,
  handleStopScheduler,
  handleTriggerTask,
  handleGetTaskDiff,
  handleGetTaskTrend,
  handleGetLatestReport,
  handleListReports,
  handleGenerateReport,
  handleGetDashboard,
  handleGetTaskRunHistory,
} from "./monitor-api.js";
import type {
  StoredConnectorRecord,
  LoginSessionRecord,
  NotificationProvider,
} from "./types.js";
import {
  nowIso,
  sendJson,
  readJsonBody,
  getAuthenticatedUser,
  resolveUserOpenId,
  setCurrentRequest,
} from "./http-server-utils.js";

const PORT = Number(process.env.PORT || 8787);

export function getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => void {
  return async (request, response) => {
    try {
      // 设置当前请求引用，供 CORS origin 反射使用
      setCurrentRequest(request);

      if (!request.url || !request.method) {
        sendJson(response, 400, { error: "Invalid request." });
        return;
      }
      if (request.method === "OPTIONS") {
        // 对 preflight 请求也设置 CORS 头
        setCorsHeaders(request, response);
        response.writeHead(204);
        response.end();
        return;
      }
      const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
      await _handleApiRequest(request, response, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error.";
      sendJson(response, 500, { error: message });
    }
  };
}

/**
 * Paths that are exempt from authentication.
 * These endpoints are either health checks or public-facing.
 */
const AUTH_EXEMPT_PATHS = new Set([
  "/api/health",
  "/api/endpoint-health",
  "/api/endpoint-health/probe",
]);

/**
 * Path prefixes that have their own authentication (e.g. admin API).
 */
const AUTH_DELEGATED_PREFIXES = [
  "/api/admin",
];

/**
 * Core request routing logic extracted for reuse.
 */
async function _handleApiRequest(request: IncomingMessage, response: ServerResponse, url: URL) {

    /* ── Unified authentication middleware ── */
    const isDelegated = AUTH_DELEGATED_PREFIXES.some(p => url.pathname.startsWith(p));
    if (!isDelegated && !AUTH_EXEMPT_PATHS.has(url.pathname)) {
      const userOpenId = await resolveUserOpenId(request);
      if (userOpenId === "anonymous") {
        sendJson(response, 401, { error: "Unauthorized. Please log in first." });
        return;
      }
      // Attach authenticated user to request for downstream handlers
      (request as any).__userOpenId = userOpenId;
    }

    /* ── Admin API routes (must be checked before C-end routes) ── */
    if (url.pathname.startsWith("/api/admin")) {
      const handled = await handleAdminRequest(request, response, url.pathname);
      if (handled) return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        services: {
          livePrediction: !!process.env.TIKHUB_API_KEY?.trim(),
          notifications: true,
        },
        serverTime: nowIso(),
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/connectors") {
      await handleGetConnectors(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/notification-channels") {
      await handleListNotificationChannels(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/feishu/chats") {
      await handleListFeishuChats(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/feishu/status") {
      await handleFeishuStatus(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/result-artifacts") {
      await handleListResultArtifacts(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/result-artifacts") {
      await handleCreateResultArtifact(request, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/watch-tasks") {
      await handleListWatchTasks(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/endpoint-health") {
      await handleGetEndpointHealth(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/endpoint-health/probe") {
      await handleProbeEndpointHealth(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/predictions/prepare-live-request") {
      await handlePreparePredictionRequest(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/predictions/run-live") {
      await handleRunLivePrediction(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/predictions/run-live-stream") {
      await handleRunLivePredictionStream(request, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/predictions/timing-stats") {
      await handleGetTimingStats(response);
      return;
    }
    if (request.method === "DELETE" && url.pathname === "/api/predictions/cache") {
      await handleClearCache(response);
      return;
    }
    const artifactMatch = url.pathname.match(/^\/api\/result-artifacts\/([^/]+)$/);
    if (artifactMatch) {
      const artifactId = decodeURIComponent(artifactMatch[1]);
      if (request.method === "GET") {
        await handleGetResultArtifact(artifactId, response);
        return;
      }
    }
    const artifactWatchMatch = url.pathname.match(/^\/api\/result-artifacts\/([^/]+)\/watch$/);
    if (artifactWatchMatch) {
      const artifactId = decodeURIComponent(artifactWatchMatch[1]);
      if (request.method === "POST") {
        await handleCreateWatchForArtifact(artifactId, request, response);
        return;
      }
    }
    const watchRunMatch = url.pathname.match(/^\/api\/watch-tasks\/([^/]+)\/run$/);
    if (watchRunMatch) {
      const taskId = decodeURIComponent(watchRunMatch[1]);
      if (request.method === "POST") {
        await handleRunWatchTask(taskId, response);
        return;
      }
    }
    const runMatch = url.pathname.match(/^\/api\/watch-runs\/([^/]+)$/);
    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      if (request.method === "GET") {
        await handleGetWatchTaskRun(runId, response);
        return;
      }
    }
    const loginCreateMatch = url.pathname.match(/^\/api\/connectors\/([^/]+)\/login-session$/);
    if (loginCreateMatch) {
      const platformId = decodeURIComponent(loginCreateMatch[1]);
      if (request.method === "POST") {
        await handleCreateLoginSession(platformId, response);
        return;
      }
    }
    const loginStatusMatch = url.pathname.match(
      /^\/api\/connectors\/([^/]+)\/login-session\/([^/]+)$/,
    );
    if (loginStatusMatch) {
      const platformId = decodeURIComponent(loginStatusMatch[1]);
      const sessionId = decodeURIComponent(loginStatusMatch[2]);
      if (request.method === "GET") {
        await handleGetLoginSession(platformId, sessionId, response);
        return;
      }
    }
    const notificationMatch = url.pathname.match(
      /^\/api\/notification-channels\/([^/]+)\/(verify|bind|unbind|test-send)$/,
    );
    if (notificationMatch) {
      const channelId = decodeURIComponent(notificationMatch[1]) as NotificationProvider;
      const action = notificationMatch[2];
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (action === "verify") {
        await handleVerifyNotificationChannel(channelId, request, response);
        return;
      }
      if (action === "bind") {
        await handleBindNotificationChannel(channelId, request, response);
        return;
      }
      if (action === "unbind") {
        await handleUnbindNotificationChannel(channelId, response);
        return;
      }
      if (action === "test-send") {
        await handleTestSendNotificationChannel(channelId, request, response);
        return;
      }
    }
    const match = url.pathname.match(/^\/api\/connectors\/([^/]+)\/(verify|bind|unbind|sync-profile)$/);
    if (match) {
      const platformId = decodeURIComponent(match[1]);
      const action = match[2];
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (action === "verify") {
        await handleVerify(platformId, request, response);
        return;
      }
      if (action === "bind") {
        await handleBind(platformId, request, response);
        return;
      }
      if (action === "unbind") {
        await handleUnbind(platformId, response);
        return;
      }
      if (action === "sync-profile") {
        await handleSync(platformId, response);
        return;
      }
    }
    /* ── LLM 网关路由 ── */
    if (request.method === "GET" && url.pathname === "/api/llm/health") {
      await handleLLMHealth(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/llm/chat") {
      await handleLLMChat(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/llm/stream") {
      await handleLLMStream(request, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/llm/credits") {
      await handleGetCredits(url, response);
      return;
    }

    // ========== Breakdown Agent ==========
    if (request.method === "POST" && url.pathname === "/api/breakdown/action") {
      const body = await readJsonBody<BreakdownActionRequest>(request);
      await handleBreakdownAction(request, response, body);
      return;
    }

    // ========== 视频解析公共服务 ==========
    /** POST /api/video/parse — 解析视频分享口令/链接，返回视频基础信息 */
    if (request.method === "POST" && url.pathname === "/api/video/parse") {
      const body = await readJsonBody<{ url: string }>(request);
      await handleVideoParseRequest(request, response, body);
      return;
    }

    /** POST /api/video/transcribe — 解析视频 + ASR 语音识别，返回文案文本 */
    if (request.method === "POST" && url.pathname === "/api/video/transcribe") {
      const body = await readJsonBody<{ url: string }>(request);
      await handleVideoTranscribeRequest(request, response, body);
      return;
    }

    /** POST /api/agent/intent — LLM 意图识别，返回 taskIntent + 置信度 + 理由 */
    if (request.method === "POST" && url.pathname === "/api/agent/intent") {
      await handleIntentClassify(request, response);
      return;
    }

    // ========== 多模态输入解析 ==========
    /** POST /api/input/parse — 解析任意输入（URL/图片/文档/口令），返回提取的文本内容 */
    if (request.method === "POST" && url.pathname === "/api/input/parse") {
      const body = await readJsonBody<{ input: string }>(request);
      const result = await handleParseInput(body);
      sendJson(response, result.status, result.data);
      return;
    }

    // ========== 文件上传 ==========
    /** POST /api/file/upload — 上传文件到 S3，返回 URL */
    if (request.method === "POST" && url.pathname === "/api/file/upload") {
      try {
        const contentType = request.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          sendJson(response, 400, { error: "需要 multipart/form-data 格式" });
          return;
        }
        // 简单的 multipart 解析：读取全部 body
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const body = Buffer.concat(chunks);
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) {
          sendJson(response, 400, { error: "缺少 boundary" });
          return;
        }
        const boundary = boundaryMatch[1];
        const parts = body.toString("binary").split(`--${boundary}`);
        let fileName = "upload";
        let fileMime = "application/octet-stream";
        let fileData: Buffer | null = null;
        for (const part of parts) {
          if (part.includes("Content-Disposition") && part.includes('name="file"')) {
            const nameMatch = part.match(/filename="([^"]+)"/);
            if (nameMatch) fileName = nameMatch[1];
            const mimeMatch = part.match(/Content-Type:\s*(.+?)\r?\n/);
            if (mimeMatch) fileMime = mimeMatch[1].trim();
            const headerEnd = part.indexOf("\r\n\r\n");
            if (headerEnd !== -1) {
              const dataStr = part.slice(headerEnd + 4).replace(/\r\n$/, "");
              fileData = Buffer.from(dataStr, "binary");
            }
          }
        }
        if (!fileData) {
          sendJson(response, 400, { error: "未找到文件数据" });
          return;
        }
        const { storagePut } = await import("../storage.js");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `user-uploads/${Date.now()}-${suffix}-${fileName}`;
        const { url: fileUrl } = await storagePut(fileKey, fileData, fileMime);
        sendJson(response, 200, { url: fileUrl, fileName, mimeType: fileMime, size: fileData.length });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "上传失败" });
      }
      return;
    }

    // ========== Task Payload 动态提取 ==========
    /** POST /api/payload/extract — 从 Prompt 中 LLM 结构化提取 keyword/platform/awemeId 等 */
    if (request.method === "POST" && url.pathname === "/api/payload/extract") {
      const body = await readJsonBody<{ prompt: string; useLLM?: boolean }>(request);
      const result = await handleExtractPayload(body);
      sendJson(response, result.status, result.data);
      return;
    }

    // ========== 动态推荐流 ==========
    /** POST /api/agent/next-actions — 基于 Artifact 数据，LLM 生成下一步行动推荐 */
    if (request.method === "POST" && url.pathname === "/api/agent/next-actions") {
      const body = await readJsonBody<Record<string, unknown>>(request);
      const result = await handleGenerateNextActions(body);
      sendJson(response, result.status, result.data);
      return;
    }

    // ── Prompt 模板管理 ──────────────────────────────────────────────────
    /** GET /api/prompt-templates — 获取所有 Prompt 模板列表 */
    if (request.method === "GET" && url.pathname === "/api/prompt-templates") {
      await handleListTemplates(request, response);
      return;
    }

    /** POST /api/prompt-templates/render — 渲染模板（预览，不调用 LLM） */
    if (request.method === "POST" && url.pathname === "/api/prompt-templates/render") {
      await handleRenderTemplate(request, response);
      return;
    }

    /** POST /api/prompt-templates/call — 渲染模板并调用 LLM */
    if (request.method === "POST" && url.pathname === "/api/prompt-templates/call") {
      await handleCallTemplate(request, response);
      return;
    }

    /** PUT /api/prompt-templates/:id — 创建或更新模板 */
    if (request.method === "PUT" && url.pathname.startsWith("/api/prompt-templates/")) {
      await handleUpsertTemplate(request, response);
      return;
    }

    /** GET /api/prompt-templates/:id — 获取单个模板详情 */
    const promptTemplateMatch = url.pathname.match(/^\/api\/prompt-templates\/([^/]+)$/);
    if (request.method === "GET" && promptTemplateMatch) {
      await handleGetTemplate(request, response, promptTemplateMatch[1]);
      return;
    }

    // ── Skills 技能系统 ──────────────────────────────────────────────────
    /** GET /api/skills — 获取所有技能列表 */
    if (request.method === "GET" && url.pathname === "/api/skills") {
      await handleListSkills(request, response);
      return;
    }

    /** GET /api/skills/stats — 技能执行统计（7天） */
    if (request.method === "GET" && url.pathname === "/api/skills/stats") {
      await handleSkillStats(request, response);
      return;
    }

    /** POST /api/skills/execute — 执行技能完整管线 */
    if (request.method === "POST" && url.pathname === "/api/skills/execute") {
      await handleExecuteSkill(request, response);
      return;
    }

    /** PATCH /api/skills/:id/toggle — 启用/停用技能 */
    const skillToggleMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/toggle$/);
     if (request.method === "PATCH" && skillToggleMatch) {
      await handleToggleSkill(request, response, skillToggleMatch[1]);
      return;
    }

    // ── 模块三：赛道情报与 AI 评分 ──────────────────────────────────
    /** POST /api/trend/analyze — 完整赛道情报分析（行业建模 + AI 评分 + 决策边界） */
    if (request.method === "POST" && url.pathname === "/api/trend/analyze") {
      await handleAnalyzeTrend(request, response);
      return;
    }
    /** POST /api/trend/score — 单独调用 AI 评分引擎（传入已有指标） */
    if (request.method === "POST" && url.pathname === "/api/trend/score") {
      await handleGetTrendScore(request, response);
      return;
    }
    /** POST /api/trend/decision — 单独生成决策边界与风险提示 */
    if (request.method === "POST" && url.pathname === "/api/trend/decision") {
      await handleGetDecisionBoundary(request, response);
      return;
    }
    /** GET /api/trend/intelligence/:runId — 获取已缓存的赛道情报结果 */
    const trendIntelligenceMatch = url.pathname.match(/^\/api\/trend\/intelligence\/([^/]+)$/);
    if (request.method === "GET" && trendIntelligenceMatch) {
      await handleGetTrendIntelligence(request, response, trendIntelligenceMatch[1]);
      return;
    }

    // ── 模块四：低粉爆款算法 ──────────────────────────────────────────
    /** POST /api/low-follower/detect — 从 TikHub 原始数据执行低粉爆款检测 + 持久化 */
    if (request.method === "POST" && url.pathname === "/api/low-follower/detect") {
      await handleDetectLowFollower(request, response);
      return;
    }
    /** POST /api/low-follower/analyze — 从已提取内容执行算法（不需要 TikHub 原始数据） */
    if (request.method === "POST" && url.pathname === "/api/low-follower/analyze") {
      await handleAnalyzeLowFollower(request, response);
      return;
    }
    /** POST /api/low-follower/advice — 基于算法结果生成个性化建议 */
    if (request.method === "POST" && url.pathname === "/api/low-follower/advice") {
      await handleGenerateAdvice(request, response);
      return;
    }
    /** GET /api/low-follower/samples — 查询历史低粉样本库 */
    if (request.method === "GET" && url.pathname === "/api/low-follower/samples") {
      await handleQuerySamples(request, response);
      return;
    }
    /** GET /api/low-follower/stats/:topic — 查询话题的低粉爆款比例统计 */
    const lfStatsMatch = url.pathname.match(/^\/api\/low-follower\/stats\/([^/]+)$/);
    if (request.method === "GET" && lfStatsMatch) {
      await handleGetStats(request, response, lfStatsMatch[1]);
      return;
    }
    /** POST /api/low-follower/replicability — 批量样本可复制性分析 */
    if (request.method === "POST" && url.pathname === "/api/low-follower/replicability") {
      await handleReplicabilityAnalysis(request, response);
      return;
    }

    /* ================================================================
     * 模块五：创作中心与账号诊断
     * ================================================================ */

    /** POST /api/creator/sync — 同步账号数据（TikHub 实时拉取） */
    if (request.method === "POST" && url.pathname === "/api/creator/sync") {
      await handleCreatorSync(request, response);
      return;
    }

    /** GET /api/creator/overview — 获取账号概览（缓存读取） */
    if (request.method === "GET" && url.pathname === "/api/creator/overview") {
      await handleGetOverview(request, response);
      return;
    }

    /** GET /api/creator/works — 获取作品列表 */
    if (request.method === "GET" && url.pathname === "/api/creator/works") {
      await handleGetWorks(request, response);
      return;
    }

    /** GET /api/creator/fan-profile — 获取粉丝画像 */
    if (request.method === "GET" && url.pathname === "/api/creator/fan-profile") {
      await handleGetFanProfile(request, response);
      return;
    }

    /** GET /api/creator/trends — 获取近30天趋势数据 */
    if (request.method === "GET" && url.pathname === "/api/creator/trends") {
      await handleGetTrends(request, response);
      return;
    }

    /** POST /api/creator/diagnose — 运行账号诊断 Agent */
    if (request.method === "POST" && url.pathname === "/api/creator/diagnose") {
      await handleRunDiagnosis(request, response);
      return;
    }

    /** GET /api/creator/diagnosis — 获取最新诊断报告 */
    if (request.method === "GET" && url.pathname === "/api/creator/diagnosis") {
      await handleGetDiagnosis(request, response);
      return;
    }

    /** POST /api/creator/comment-summary — 评论区 AI 摘要 */
    if (request.method === "POST" && url.pathname === "/api/creator/comment-summary") {
      await handleCommentSummary(request, response);
      return;
    }

    /** POST /api/creator/sync-and-diagnose — 一键同步+诊断 */
    if (request.method === "POST" && url.pathname === "/api/creator/sync-and-diagnose") {
      await handleSyncAndDiagnose(request, response);
      return;
    }

    /** GET /api/creator/work-comments — 获取作品评论列表 */
    if (request.method === "GET" && url.pathname === "/api/creator/work-comments") {
      await handleGetWorkComments(request, response);
      return;
    }

    /** POST /api/creator/fetch-comments — 拉取并存储真实评论 */
    if (request.method === "POST" && url.pathname === "/api/creator/fetch-comments") {
      await handleFetchComments(request, response);
      return;
    }

    /** POST /api/creator/analyze-comments — AI 深度分析评论 */
    if (request.method === "POST" && url.pathname === "/api/creator/analyze-comments") {
      await handleAnalyzeComments(request, response);
      return;
    }

    /** GET /api/creator/comment-analysis — 获取已缓存的评论分析 */
    if (request.method === "GET" && url.pathname === "/api/creator/comment-analysis") {
      await handleGetCommentAnalysis(request, response);
      return;
    }

    /** GET /api/image-proxy — 图片代理（解决拖音CDN heic格式和跨域问题）+ S3缓存 */
    if (request.method === "GET" && url.pathname === "/api/image-proxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Missing url parameter" }));
        return;
      }

      // 先查 DB 中是否已有 S3 CDN URL
      try {
        const { query: dbQuery } = await import("./database.js");
        const rows = await dbQuery(
          `SELECT cover_cdn_url FROM creator_works WHERE cover_url = ? AND cover_cdn_url IS NOT NULL LIMIT 1`,
          [targetUrl]
        ) as any[];
        const cached = rows?.[0];
        if (cached?.cover_cdn_url) {
          response.writeHead(302, {
            "Location": cached.cover_cdn_url,
            "Cache-Control": "public, max-age=604800",
            ...getCorsHeadersObj(request),
          });
          response.end();
          return;
        }
      } catch (_dbErr) {
        // DB 查询失败，继续从源站获取
      }

      try {
        // 从源站获取图片
        const imgResp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.douyin.com/",
          },
        });
        if (!imgResp.ok) {
          response.writeHead(imgResp.status, { "Content-Type": "text/plain" });
          response.end(`Upstream returned ${imgResp.status}`);
          return;
        }
        const contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
        let buffer = Buffer.from(await imgResp.arrayBuffer());
        let outputType = contentType;

        // Convert HEIC to JPEG for browser compatibility
        if (contentType.includes("heic") || contentType.includes("heif") || targetUrl.includes(".heic")) {
          try {
            const heicConvert = (await import("heic-convert")).default;
            const jpegBuffer = await heicConvert({
              buffer: buffer,
              format: "JPEG",
              quality: 0.85,
            });
            buffer = Buffer.from(jpegBuffer);
            outputType = "image/jpeg";
          } catch (convErr) {
            imgLog.error({ err: convErr }, "HEIC conversion failed, serving raw");
          }
        }

        // 异步上传到 S3 并将 CDN URL 写入 DB（不阻塞响应）
        (async () => {
          try {
            const { storagePut } = await import("../storage.js");
            const crypto = await import("node:crypto");
            const urlHash = crypto.createHash("md5").update(targetUrl).digest("hex");
            const cacheKey = `cover-cache/${urlHash}.jpg`;
            const { url: s3Url } = await storagePut(cacheKey, buffer, outputType);
            imgLog.info({ s3Url }, "Cached to S3");
            // 将 CDN URL 写入 DB
            const { query: dbQ } = await import("./database.js");
            await dbQ(
              `UPDATE creator_works SET cover_cdn_url = ? WHERE cover_url = ?`,
              [s3Url, targetUrl]
            );
            imgLog.debug({ targetUrl: targetUrl.substring(0, 60) }, "DB updated cover_cdn_url");
          } catch (uploadErr) {
            imgLog.error({ err: uploadErr }, "S3 cache upload/DB update failed");
          }
        })();

        response.writeHead(200, {
          "Content-Type": outputType,
          "Cache-Control": "public, max-age=86400",
          ...getCorsHeadersObj(request),
        });
        response.end(buffer);
      } catch (err) {
        imgLog.error({ err }, "Image proxy error");
        response.writeHead(502, { "Content-Type": "text/plain" });
        response.end("Image proxy error");
      }
      return;
    }

    /** GET /api/video-proxy — 视频代理（通过TikHub获取最新播放地址并流式代理） */
    if (request.method === "GET" && url.pathname === "/api/video-proxy") {
      const awemeId = url.searchParams.get("aweme_id");
      if (!awemeId) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Missing aweme_id parameter" }));
        return;
      }
      try {
        // 1. 从 TikHub 获取最新的视频播放地址
        const apiResp = await getTikHub<Record<string, unknown>>(
          "/api/v1/douyin/web/fetch_one_video",
          { aweme_id: awemeId },
        );

        // 递归查找 key
        function findNestedKey(obj: unknown, key: string): unknown {
          if (!obj || typeof obj !== "object") return null;
          const rec = obj as Record<string, unknown>;
          if (key in rec) return rec[key];
          for (const v of Object.values(rec)) {
            const found = findNestedKey(v, key);
            if (found) return found;
          }
          return null;
        }

        const detail = findNestedKey(apiResp, "aweme_detail") as Record<string, unknown> | null;
        const video = (detail?.video ?? {}) as Record<string, unknown>;
        const playAddr = video.play_addr as Record<string, unknown> | undefined;
        const urlList = (playAddr?.url_list ?? []) as string[];
        const playUrl = urlList[0];

        if (!playUrl) {
          response.writeHead(404, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: "No play URL found for this video" }));
          return;
        }

        // 2. 支持 Range 请求（视频 seek）
        const proxyHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.douyin.com/",
        };
        const rangeHeader = request.headers.range;
        if (rangeHeader) {
          proxyHeaders["Range"] = rangeHeader;
        }

        const videoResp = await fetch(playUrl, { headers: proxyHeaders });
        if (!videoResp.ok && videoResp.status !== 206) {
          response.writeHead(videoResp.status, { "Content-Type": "text/plain" });
          response.end(`Video upstream returned ${videoResp.status}`);
          return;
        }

        const respHeaders: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=3600",
          ...getCorsHeadersObj(request),
        };
        const contentLength = videoResp.headers.get("content-length");
        if (contentLength) respHeaders["Content-Length"] = contentLength;
        const contentRange = videoResp.headers.get("content-range");
        if (contentRange) respHeaders["Content-Range"] = contentRange;
        const acceptRanges = videoResp.headers.get("accept-ranges");
        if (acceptRanges) respHeaders["Accept-Ranges"] = acceptRanges;

        response.writeHead(videoResp.status, respHeaders);

        // 流式传输视频数据
        if (videoResp.body) {
          const reader = videoResp.body.getReader();
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              response.write(Buffer.from(value));
            }
            response.end();
          };
          pump().catch((err) => {
            vidLog.error({ err }, "Stream error");
            response.end();
          });
        } else {
          const buf = Buffer.from(await videoResp.arrayBuffer());
          response.end(buf);
        }
      } catch (err) {
        vidLog.error({ err }, "Video proxy error");
        response.writeHead(502, { "Content-Type": "text/plain" });
        response.end("Video proxy error");
      }
      return;
    }

    /* ── 模块六：智能监控系统 ── */
    /** GET /api/monitor/scheduler/status */
    if (request.method === "GET" && url.pathname === "/api/monitor/scheduler/status") {
      await handleGetSchedulerStatus(request, response);
      return;
    }
    /** POST /api/monitor/scheduler/start */
    if (request.method === "POST" && url.pathname === "/api/monitor/scheduler/start") {
      await handleStartScheduler(request, response);
      return;
    }
    /** POST /api/monitor/scheduler/stop */
    if (request.method === "POST" && url.pathname === "/api/monitor/scheduler/stop") {
      await handleStopScheduler(request, response);
      return;
    }
    /** GET /api/monitor/dashboard */
    if (request.method === "GET" && url.pathname === "/api/monitor/dashboard") {
      await handleGetDashboard(request, response);
      return;
    }
    /** POST /api/monitor/tasks/:id/trigger */
    const monitorTriggerMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/trigger$/);
    if (request.method === "POST" && monitorTriggerMatch) {
      await handleTriggerTask(request, response, monitorTriggerMatch[1]);
      return;
    }
    /** GET /api/monitor/tasks/:id/diff */
    const monitorDiffMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/diff$/);
    if (request.method === "GET" && monitorDiffMatch) {
      await handleGetTaskDiff(request, response, monitorDiffMatch[1]);
      return;
    }
    /** GET /api/monitor/tasks/:id/trend */
    const monitorTrendMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/trend$/);
    if (request.method === "GET" && monitorTrendMatch) {
      await handleGetTaskTrend(request, response, monitorTrendMatch[1]);
      return;
    }
    /** GET /api/monitor/tasks/:id/report */
    const monitorReportMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/report$/);
    if (request.method === "GET" && monitorReportMatch) {
      await handleGetLatestReport(request, response, monitorReportMatch[1]);
      return;
    }
    /** POST /api/monitor/tasks/:id/report/generate */
    const monitorReportGenMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/report\/generate$/);
    if (request.method === "POST" && monitorReportGenMatch) {
      await handleGenerateReport(request, response, monitorReportGenMatch[1]);
      return;
    }
    /** GET /api/monitor/tasks/:id/reports */
    const monitorReportsMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/reports$/);
    if (request.method === "GET" && monitorReportsMatch) {
      await handleListReports(request, response, monitorReportsMatch[1]);
      return;
    }
    /** GET /api/monitor/tasks/:id/runs */
    const monitorRunsMatch = url.pathname.match(/^\/api\/monitor\/tasks\/([^/]+)\/runs$/);
    if (request.method === "GET" && monitorRunsMatch) {
      await handleGetTaskRunHistory(request, response, monitorRunsMatch[1]);
      return;
    }

    // ── 模块七：选题策略 V2 ──────────────────────────────────────────
    /** GET /api/topic-strategy/sessions — 获取用户的选题策略会话列表 */
    if (request.method === "GET" && url.pathname === "/api/topic-strategy/sessions") {
      const userId = url.searchParams.get("userId") ?? "anonymous";
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
      try {
        const sessions = await listUserSessions(userId, limit);
        sendJson(response, 200, { sessions });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Failed to list sessions" });
      }
      return;
    }

    /** GET /api/topic-strategy/session/:id — 获取单个会话详情（含方向、同行对标、跨行业灵感） */
    const tsSessionMatch = url.pathname.match(/^\/api\/topic-strategy\/session\/([^/]+)$/);
    if (request.method === "GET" && tsSessionMatch) {
      const sessionId = decodeURIComponent(tsSessionMatch[1]);
      try {
        const session = await getTopicStrategySession(sessionId);
        if (!session) {
          sendJson(response, 404, { error: "Session not found" });
          return;
        }
        const [directions, peerBenchmarks, crossIndustry] = await Promise.all([
          getDirectionsBySession(sessionId),
          getPeerBenchmarksBySession(sessionId),
          getCrossIndustryBySession(sessionId),
        ]);
        sendJson(response, 200, {
          session,
          directions,
          peerBenchmarks,
          crossIndustry,
        });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Failed to get session" });
      }
      return;
    }

    /** POST /api/topic-strategy/validate — 对单个方向重新运行验证（轻量级） */
    if (request.method === "POST" && url.pathname === "/api/topic-strategy/validate") {
      const body = await readJsonBody<{ sessionId: string; directionId: string }>(request);
      if (!body.sessionId || !body.directionId) {
        sendJson(response, 400, { error: "缺少 sessionId 或 directionId" });
        return;
      }
      // FUTURE-1: 真实重验证——重新执行 Stage 5 验证计算
      try {
        const { revalidateSingleDirection } = await import("./topic-strategy-engine.js");
        const result = await revalidateSingleDirection(body.sessionId, body.directionId);
        sendJson(response, 200, {
          ...result,
          message: "重新验证完成",
        });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "Validation failed" });
      }
      return;
    }

    /* ══════════════════════════════════════════════════════════
     *  效果追踪 API — published_content + content_performance
     * ══════════════════════════════════════════════════════════ */

    /** POST /api/published-content — 标记内容已发布 */
    if (request.method === "POST" && url.pathname === "/api/published-content") {
      const body = await readJsonBody<{
        platform: string;
        contentId?: string;
        contentUrl?: string;
        publishedTitle?: string;
        directionName?: string;
        strategySessionId?: string;
        predictedScore?: number;
        publishedAt?: string;
      }>(request);
      if (!body.platform) {
        sendJson(response, 400, { error: "platform 必填" });
        return;
      }
      // 使用中间件已认证的用户
      const userOpenId = getAuthenticatedUser(request);
      // 自动从 contentUrl 中解析 contentId（支持分享文案、短链、完整 URL）
      let resolvedContentId = body.contentId ?? null;
      if (!resolvedContentId && body.contentUrl) {
        const cu = body.contentUrl;
        // 先尝试直接从 URL 中提取 contentId
        // 抖音：匹配 video/7xxxxxxxxxxxxxxxxx 或 aweme_id=7xxxxxxxxxxxxxxxxx
        const douyinMatch = cu.match(/video\/([0-9]{15,20})/) ||
          cu.match(/aweme_id=([0-9]{15,20})/) ||
          cu.match(/\/([0-9]{15,20})[?\s]/);
        // 小红书：匹配 explore/[0-9a-f]{24} 或 item/[0-9a-f]{24}
        const xhsMatch = cu.match(/explore\/([0-9a-f]{24})/) ||
          cu.match(/item\/([0-9a-f]{24})/);
        // 快手：匹配 photo/[0-9]+
        const kuaishouMatch = cu.match(/photo\/([0-9]{10,20})/);
        if (douyinMatch) resolvedContentId = douyinMatch[1];
        else if (xhsMatch) resolvedContentId = xhsMatch[1];
        else if (kuaishouMatch) resolvedContentId = kuaishouMatch[1];
        // 如果还没有，尝试从文案中提取短链并展开
        if (!resolvedContentId) {
          const shortLinkMatch = cu.match(/https?:\/\/v\.douyin\.com\/([A-Za-z0-9_-]+)/) ||
            cu.match(/https?:\/\/xhslink\.com\/([A-Za-z0-9_-]+)/);
          if (shortLinkMatch) {
            try {
              const shortUrl = shortLinkMatch[0];
              const expandResp = await fetch(shortUrl, { method: 'HEAD', redirect: 'manual' });
              const location = expandResp.headers.get('location') || '';
              const expandedDouyinMatch = location.match(/video\/([0-9]{15,20})/) ||
                location.match(/aweme_id=([0-9]{15,20})/);
              const expandedXhsMatch = location.match(/explore\/([0-9a-f]{24})/) ||
                location.match(/item\/([0-9a-f]{24})/);
              if (expandedDouyinMatch) resolvedContentId = expandedDouyinMatch[1];
              else if (expandedXhsMatch) resolvedContentId = expandedXhsMatch[1];
            } catch (_) {
              // 短链展开失败，保持 null
            }
          }
        }
      }
      try {
        const result = await execute(
          `INSERT INTO published_content
           (userOpenId, platform, contentId, contentUrl, publishedTitle, directionName, strategySessionId, predictedScore, publishedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userOpenId,
            body.platform,
            resolvedContentId,
            body.contentUrl ?? null,
            body.publishedTitle ?? null,
            body.directionName ?? null,
            body.strategySessionId ?? null,
            body.predictedScore ?? null,
            body.publishedAt ? new Date(body.publishedAt) : new Date(),
          ]
        );
        sendJson(response, 201, { id: result.insertId, message: "已标记为已发布" });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "标记发布失败" });
      }
      return;
    }

    /** GET /api/published-content — 获取已发布内容列表 */
    if (request.method === "GET" && url.pathname === "/api/published-content") {
      const userOpenId = getAuthenticatedUser(request);
      const limit = Number(url.searchParams.get("limit") || 20);
      try {
        const items = await query<RowDataPacket[]>(
          `SELECT pc.*,
                  (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT('checkpoint', cp.checkpoint, 'viewCount', cp.viewCount,
                      'likeCount', cp.likeCount, 'commentCount', cp.commentCount,
                      'shareCount', cp.shareCount, 'collectCount', cp.collectCount,
                      'collectedAt', cp.collectedAt)
                  ) FROM content_performance cp WHERE cp.publishedContentId = pc.id) as performanceData
           FROM published_content pc
           WHERE pc.userOpenId = ?
           ORDER BY pc.publishedAt DESC
           LIMIT ?`,
          [userOpenId, limit]
        );
        // 解析 performanceData JSON
        const parsed = items.map(item => ({
          ...item,
          performanceData: item.performanceData
            ? (typeof item.performanceData === "string" ? JSON.parse(item.performanceData) : item.performanceData)
            : [],
        }));
        sendJson(response, 200, { items: parsed });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "获取已发布内容失败" });
      }
      return;
    }

    /** DELETE /api/published-content/:id — 删除已发布内容记录 */
    const publishedDeleteMatch = url.pathname.match(/^\/api\/published-content\/(\d+)$/);
    if (publishedDeleteMatch && request.method === "DELETE") {
      const id = Number(publishedDeleteMatch[1]);
      try {
        await execute(`DELETE FROM content_performance WHERE publishedContentId = ?`, [id]);
        await execute(`DELETE FROM published_content WHERE id = ?`, [id]);
        sendJson(response, 200, { message: "已删除" });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "删除失败" });
      }
      return;
    }

    /** GET /api/prediction-accuracy — 获取预测准确率 */
    if (request.method === "GET" && url.pathname === "/api/prediction-accuracy") {
      const userOpenId = getAuthenticatedUser(request);
      try {
        const result = await computePredictionAccuracy(userOpenId);
        sendJson(response, 200, result);
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "计算准确率失败" });
      }
      return;
    }

    /** POST /api/performance-collection/trigger — 手动触发效果采集 */
    if (request.method === "POST" && url.pathname === "/api/performance-collection/trigger") {
      try {
        const result = await runPerformanceCollection();
        sendJson(response, 200, result);
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "采集失败" });
      }
      return;
    }

    /** GET /api/historical-feedback — 获取历史反馈摘要（自进化机制） */
    if (request.method === "GET" && url.pathname === "/api/historical-feedback") {
      try {
        const userOpenId = getAuthenticatedUser(request);
        const track = url.searchParams.get("track") ?? undefined;
        const feedback = await aggregateHistoricalFeedback(userOpenId, track);
        sendJson(response, 200, feedback ?? { totalPublished: 0, directionFeedbacks: [], feedbackContext: "" });
      } catch (err) {
        sendJson(response, 500, { error: err instanceof Error ? err.message : "获取历史反馈失败" });
      }
      return;
    }

  sendJson(response, 404, { error: "Not found." });
}

export function startApiServer() {
  const handler = getRequestHandler();
  const server = createServer(handler);
  server.listen(PORT, "127.0.0.1", () => {
    log.info({ port: PORT }, "Connector server listening");
  });
  return server;
}
