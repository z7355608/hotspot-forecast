/**
 * prediction-routes.ts
 * ═══════════════════════════════════════════════════════════════
 * 爆款预测路由处理函数
 * 负责：预测请求准备、同步预测、SSE 流式预测、耗时统计、缓存清理
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { nowIso, buildAppLink, notifySafely, readJsonBody, sendJson } from "../http-server-utils.js";
import { readConnectorStore, resolveCookieSecret } from "../storage.js";
import { runLivePrediction, type ProgressEvent } from "../live-predictions.js";
import {
  buildCacheKey,
  getCachedPrediction,
  setCachedPrediction,
  recordAnalysisTiming,
  getTimingStats,
} from "../prediction-cache.js";

export async function handlePreparePredictionRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const internalSecret = process.env.CONNECTOR_SECRET_KEY;
  if (!internalSecret || request.headers["x-internal-connector-secret"] !== internalSecret) {
    sendJson(response, 403, {
      error:
        "This endpoint is internal-only and will not return connector secrets to the browser.",
    });
    return;
  }
  const payload = await readJsonBody<Record<string, unknown>>(request);
  const store = await readConnectorStore();
  const douyinConnector = store.douyin;
  const creatorToken =
    douyinConnector?.authMode === "cookie"
      ? await resolveCookieSecret(douyinConnector.encryptedSecretRef)
      : null;
  const merged = {
    ...payload,
    route_version: payload.route_version || "platform_route.v2",
    cookie_context:
      creatorToken && douyinConnector
        ? {
            enabled: true,
            creator_token: creatorToken,
          }
        : payload.cookie_context,
  };
  sendJson(response, 200, { request: merged });
}

export async function handleRunLivePrediction(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<Record<string, unknown>>(request);
  const userOpenId = (request as unknown as Record<string, unknown>).__userOpenId as
    | string
    | undefined;
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const connectedPlatforms = Array.isArray(payload.connectedPlatforms)
    ? (payload.connectedPlatforms as string[])
    : [];

  // ── 缓存查询 ──
  const cacheKey = buildCacheKey(prompt, connectedPlatforms);
  const cached = await getCachedPrediction(cacheKey);
  if (cached) {
    sendJson(response, 200, { ...cached, _fromCache: true });
    recordAnalysisTiming({
      runId: `cache_${Date.now()}`,
      userOpenId,
      promptSnippet: prompt.slice(0, 100),
      platforms: connectedPlatforms,
      totalMs: 0,
      cacheHit: true,
      status: "success",
    }).catch(() => {});
    return;
  }

  const t0 = Date.now();
  try {
    const result = await runLivePrediction(payload as never);
    const totalMs = Date.now() - t0;
    // ★ 先发送响应，再异步处理后续（避免阻塞响应导致生产环境超时）
    sendJson(response, 200, result);
    // 异步写缓存 + 记录耗时 + 发通知
    Promise.allSettled([
      setCachedPrediction(cacheKey, prompt, connectedPlatforms, result as Record<string, unknown>),
      recordAnalysisTiming({
        runId:
          (result.run as Record<string, unknown> | undefined)?.id as string ??
          `run_${Date.now()}`,
        userOpenId,
        promptSnippet: prompt.slice(0, 100),
        platforms: connectedPlatforms,
        totalMs,
        cacheHit: false,
        status: "success",
      }),
      notifySafely({
        eventType: "prediction_succeeded",
        occurredAt: nowIso(),
        title: "真实分析已完成",
        summary: prompt.trim() ? `已完成实时分析：${prompt.trim()}` : "已完成一轮真实数据分析。",
        statusLabel: result.runtimeMeta.executionStatus,
        platforms: result.runtimeMeta.usedPlatforms,
        degradeFlags: result.degradeFlags,
        link: buildAppLink("/history"),
      }),
    ]).catch(() => {});
  } catch (error) {
    const totalMs = Date.now() - t0;
    const message = error instanceof Error ? error.message : "真实数据分析失败。";
    sendJson(response, 500, { error: message });
    Promise.allSettled([
      recordAnalysisTiming({
        runId: `failed_${Date.now()}`,
        userOpenId,
        promptSnippet: prompt.slice(0, 100),
        platforms: connectedPlatforms,
        totalMs,
        cacheHit: false,
        status: "failed",
      }),
      notifySafely({
        eventType: "prediction_failed",
        occurredAt: nowIso(),
        title: "真实分析失败",
        summary: message,
        statusLabel: "失败",
        platforms: [],
        degradeFlags: [],
        link: buildAppLink("/"),
      }),
    ]).catch(() => {});
  }
}

/**
 * SSE端点：流式返回分析进度，最后返回完整结果
 */
export async function handleRunLivePredictionStream(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<Record<string, unknown>>(request);
  const userOpenId = (request as unknown as Record<string, unknown>).__userOpenId as
    | string
    | undefined;
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const connectedPlatforms = Array.isArray(payload.connectedPlatforms)
    ? (payload.connectedPlatforms as string[])
    : [];

  // ── SSE 响应头 ──
  // 禁用 socket 超时，防止 Node.js 默认 2 分钟超时断开 SSE 连接
  if (request.socket) {
    request.socket.setTimeout(0);
    request.socket.setNoDelay(true);
    request.socket.setKeepAlive(true);
  }
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  // SSE 心跳：每 15 秒发送注释保活，防止反向代理超时断开
  const heartbeatTimer = setInterval(() => {
    if (!response.writableEnded) {
      response.write(": heartbeat\n\n");
    }
  }, 15_000);

  const writeSSEEvent = (event: string, data: unknown) => {
    const ssePayload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    response.write(ssePayload);
    // Ensure data is flushed immediately through any buffering layers
    if (typeof (response as unknown as Record<string, unknown>).flush === "function") {
      (response as unknown as Record<string, () => void>).flush();
    }
  };

  // ── 缓存查询 ──
  const cacheKey = buildCacheKey(prompt, connectedPlatforms);
  const cached = await getCachedPrediction(cacheKey);
  if (cached) {
    writeSSEEvent("cache_hit", { message: "命中缓存，即将返回结果" });
    writeSSEEvent("done", { ...cached, _fromCache: true });
    clearInterval(heartbeatTimer);
    // Small delay to ensure done event is flushed before closing
    await new Promise((r) => setTimeout(r, 50));
    response.end();
    recordAnalysisTiming({
      runId: `cache_${Date.now()}`,
      userOpenId,
      promptSnippet: prompt.slice(0, 100),
      platforms: connectedPlatforms,
      totalMs: 0,
      cacheHit: true,
      status: "success",
    }).catch(() => {});
    return;
  }

  // ── 实时分析 + 进度推送 ──
  const t0 = Date.now();
  const onProgress = (event: ProgressEvent) => {
    writeSSEEvent("progress", event);
  };

  try {
    const result = await runLivePrediction(payload as never, onProgress);
    const totalMs = Date.now() - t0;
    writeSSEEvent("done", result);
    clearInterval(heartbeatTimer);
    // Small delay to ensure done event is flushed before closing
    await new Promise((r) => setTimeout(r, 50));
    response.end();
    // 异步写缓存 + 记录耗时 + 发通知
    Promise.allSettled([
      setCachedPrediction(cacheKey, prompt, connectedPlatforms, result as Record<string, unknown>),
      recordAnalysisTiming({
        runId:
          (result.run as Record<string, unknown> | undefined)?.id as string ??
          `run_${Date.now()}`,
        userOpenId,
        promptSnippet: prompt.slice(0, 100),
        platforms: connectedPlatforms,
        totalMs,
        cacheHit: false,
        status: "success",
      }),
      notifySafely({
        eventType: "prediction_succeeded",
        occurredAt: nowIso(),
        title: "真实分析已完成",
        summary: prompt.trim() ? `已完成实时分析：${prompt.trim()}` : "已完成一轮真实数据分析。",
        statusLabel: result.runtimeMeta.executionStatus,
        platforms: result.runtimeMeta.usedPlatforms,
        degradeFlags: result.degradeFlags,
        link: buildAppLink("/history"),
      }),
    ]).catch(() => {});
  } catch (error) {
    const totalMs = Date.now() - t0;
    const message = error instanceof Error ? error.message : "真实数据分析失败。";
    writeSSEEvent("error", { message });
    clearInterval(heartbeatTimer);
    await new Promise((r) => setTimeout(r, 50));
    response.end();
    Promise.allSettled([
      recordAnalysisTiming({
        runId: `failed_${Date.now()}`,
        userOpenId,
        promptSnippet: prompt.slice(0, 100),
        platforms: connectedPlatforms,
        totalMs,
        cacheHit: false,
        status: "failed",
      }),
      notifySafely({
        eventType: "prediction_failed",
        occurredAt: nowIso(),
        title: "真实分析失败",
        summary: message,
        statusLabel: "失败",
        platforms: [],
        degradeFlags: [],
        link: buildAppLink("/"),
      }),
    ]).catch(() => {});
  }
}

/**
 * GET /api/predictions/timing-stats — 返回分析耗时统计
 */
export async function handleGetTimingStats(response: ServerResponse) {
  const stats = await getTimingStats(200);
  sendJson(response, 200, { stats });
}

/**
 * DELETE /api/predictions/cache — 清除所有缓存
 */
export async function handleClearCache(response: ServerResponse) {
  const { cleanExpiredCache } = await import("../prediction-cache.js");
  const deleted = await cleanExpiredCache();
  sendJson(response, 200, { deleted, message: `已清除 ${deleted} 条过期缓存` });
}
