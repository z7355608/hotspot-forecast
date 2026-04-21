/**
 * connector-routes.ts
 * ═══════════════════════════════════════════════════════════════
 * 账号连接器路由处理函数
 * 负责：连接器列表、验证、绑定、解绑、同步、扫码登录会话
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  nowIso,
  buildAppLink,
  notifySafely,
  readJsonBody,
  sendJson,
  toConnectorResponse,
  toLoginSessionResponse,
  resolveEffectiveCookie,
  buildConnectorRecord,
} from "../http-server-utils.js";
import {
  readConnectorStore,
  writeConnectorStore,
  persistCookieSecret,
  removeCookieSecret,
  resolveCookieSecret,
} from "../storage.js";
import {
  verifyDouyinBinding,
  verifyXiaohongshuBinding,
  verifyKuaishouBinding,
  syncDouyinProfile,
  syncXiaohongshuProfile,
  syncKuaishouProfile,
} from "../tikhub.js";
import { getCapabilities } from "../platforms.js";
import { getLoginSession, startDouyinLoginSession, resolveLoginSessionCookie } from "../login-sessions.js";
import type { ConnectorPayload } from "../types.js";
import { createModuleLogger } from "../logger.js";

const log = createModuleLogger("ConnectorRoutes");

export async function handleGetConnectors(response: ServerResponse) {
  const store = await readConnectorStore();
  sendJson(response, 200, {
    items: Object.values(store).map(toConnectorResponse),
  });
}

export async function handleVerify(
  platformId: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<ConnectorPayload>(request);
  const store = await readConnectorStore();
  const existing = store[platformId];
  const effectivePayload = {
    ...payload,
    cookie: await resolveEffectiveCookie(platformId, payload, existing),
  };
  if (platformId === "douyin") {
    const verified = await verifyDouyinBinding(effectivePayload);
    sendJson(response, 200, {
      ...verified,
      capabilities: getCapabilities(platformId),
    });
    return;
  }
  if (platformId === "xiaohongshu") {
    const verified = await verifyXiaohongshuBinding(effectivePayload);
    sendJson(response, 200, {
      ...verified,
      capabilities: getCapabilities(platformId),
    });
    return;
  }
  if (platformId === "kuaishou") {
    const verified = await verifyKuaishouBinding(effectivePayload);
    sendJson(response, 200, {
      ...verified,
      capabilities: getCapabilities(platformId),
    });
    return;
  }
  // 其他平台：返回空壳 verified
  sendJson(response, 200, {
    verified: true,
    resolvedPlatformUserId: effectivePayload.platformUserId?.trim() || "",
    cookieConfigured: effectivePayload.authMode === "cookie" && !!effectivePayload.cookie?.trim(),
    profileSnapshot: {
      handle: effectivePayload.handle?.trim() || "",
      profileUrl: effectivePayload.profileUrl?.trim() || "",
    },
    capabilities: getCapabilities(platformId),
  });
}

export async function handleBind(
  platformId: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<ConnectorPayload>(request);
  const store = await readConnectorStore();
  const existing = store[platformId];
  const effectivePayload = {
    ...payload,
    cookie: await resolveEffectiveCookie(platformId, payload, existing),
  };
  let verified;
  if (platformId === "douyin") {
    verified = await verifyDouyinBinding(effectivePayload);
  } else if (platformId === "xiaohongshu") {
    verified = await verifyXiaohongshuBinding(effectivePayload);
  } else if (platformId === "kuaishou") {
    verified = await verifyKuaishouBinding(effectivePayload);
  } else {
    verified = {
      verified: true,
      resolvedPlatformUserId: effectivePayload.platformUserId?.trim() || "",
      cookieConfigured: effectivePayload.authMode === "cookie" && !!effectivePayload.cookie?.trim(),
      profileSnapshot: {},
      capabilities: getCapabilities(platformId),
    };
  }
  const next = buildConnectorRecord(platformId, effectivePayload, verified, existing);
  if (effectivePayload.authMode === "cookie" && effectivePayload.cookie?.trim()) {
    const secretRef = existing?.encryptedSecretRef || `${platformId}_${randomUUID()}`;
    await persistCookieSecret(secretRef, effectivePayload.cookie.trim());
    next.encryptedSecretRef = secretRef;
    next.cookieConfigured = true;
  } else {
    await removeCookieSecret(existing?.encryptedSecretRef);
    next.encryptedSecretRef = undefined;
    next.cookieConfigured = false;
  }
  store[platformId] = next;
  await writeConnectorStore(store);
  await notifySafely({
    eventType: "connector_bound",
    occurredAt: nowIso(),
    title: `${platformId} 账号已连接`,
    summary:
      next.handle || next.profileUrl
        ? `内容平台连接已更新：${next.handle || next.profileUrl}`
        : "内容平台连接已完成绑定。",
    statusLabel: "已连接",
    platforms: [platformId],
    degradeFlags: [],
    link: buildAppLink("/connectors"),
  });
  sendJson(response, 200, {
    item: toConnectorResponse(next),
  });
}

export async function handleUnbind(platformId: string, response: ServerResponse) {
  const store = await readConnectorStore();
  const existing = store[platformId];
  if (existing?.encryptedSecretRef) {
    await removeCookieSecret(existing.encryptedSecretRef);
  }
  delete store[platformId];
  await writeConnectorStore(store);
  sendJson(response, 200, { ok: true });
}

export async function handleSync(platformId: string, response: ServerResponse) {
  const store = await readConnectorStore();
  const existing = store[platformId];
  if (!existing) {
    sendJson(response, 404, { error: `Connector ${platformId} is not bound.` });
    return;
  }
  if (platformId !== "douyin" && platformId !== "xiaohongshu" && platformId !== "kuaishou") {
    existing.syncStatus = "verified";
    existing.lastSyncedAt = nowIso();
    existing.lastHealthCheckAt = existing.lastSyncedAt;
    store[platformId] = existing;
    await writeConnectorStore(store);
    sendJson(response, 200, { item: toConnectorResponse(existing) });
    return;
  }
  try {
    const cookie =
      platformId === "douyin"
        ? await resolveCookieSecret(existing.encryptedSecretRef)
        : undefined;
    const syncPayload = {
      authMode: existing.authMode,
      profileUrl: existing.profileUrl,
      handle: existing.handle,
      platformUserId: existing.platformUserId,
      cookie:
        platformId === "douyin" && existing.authMode === "cookie"
          ? cookie || undefined
          : undefined,
    };
    const verified =
      platformId === "douyin"
        ? await syncDouyinProfile(syncPayload)
        : platformId === "kuaishou"
          ? await syncKuaishouProfile(syncPayload)
          : await syncXiaohongshuProfile(syncPayload);
    const refreshed = buildConnectorRecord(platformId, existing, verified, existing);
    refreshed.encryptedSecretRef = existing.encryptedSecretRef;
    refreshed.lastSyncedAt = nowIso();
    refreshed.lastHealthCheckAt = refreshed.lastSyncedAt;
    store[platformId] = refreshed;
    await writeConnectorStore(store);
    sendJson(response, 200, { item: toConnectorResponse(refreshed) });
  } catch (error) {
    const timestamp = nowIso();
    existing.syncStatus = existing.authMode === "cookie" ? "needs_auth" : "stale";
    existing.lastHealthCheckAt = timestamp;
    store[platformId] = existing;
    await writeConnectorStore(store);
    await notifySafely({
      eventType:
        existing.syncStatus === "needs_auth" ? "connector_needs_auth" : "connector_sync_failed",
      occurredAt: timestamp,
      title:
        existing.syncStatus === "needs_auth"
          ? `${platformId} 账号需要重新登录`
          : `${platformId} 同步失败`,
      summary:
        error instanceof Error ? error.message : "内容平台同步失败，请检查后端与平台状态。",
      statusLabel: existing.syncStatus === "needs_auth" ? "需重登" : "同步失败",
      platforms: [platformId],
      degradeFlags: [],
      link: buildAppLink("/connectors"),
    });
    sendJson(response, 500, {
      error:
        existing.syncStatus === "needs_auth"
          ? "当前登录态失效，需要重新登录后再同步。"
          : error instanceof Error
            ? error.message
            : "同步失败，请稍后重试。",
    });
  }
}

export async function handleCreateLoginSession(platformId: string, response: ServerResponse) {
  if (platformId !== "douyin") {
    sendJson(response, 400, {
      error: "Built-in platform login is currently only supported for Douyin.",
    });
    return;
  }
  try {
    const session = await startDouyinLoginSession();
    sendJson(response, 200, {
      session: toLoginSessionResponse(session),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start Douyin login session.";
    log.error({ err: message }, "startDouyinLoginSession failed");
    sendJson(response, 500, {
      error: `抖音登录会话启动失败：${message}`,
    });
  }
}

export async function handleGetLoginSession(
  platformId: string,
  sessionId: string,
  response: ServerResponse,
) {
  const session = getLoginSession(sessionId);
  if (!session || session.platformId !== platformId) {
    sendJson(response, 404, { error: `Login session ${sessionId} was not found.` });
    return;
  }
  sendJson(response, 200, { session: toLoginSessionResponse(session) });
}
