/**
 * http-server-utils.ts
 * ═══════════════════════════════════════════════════════════════
 * 共享工具函数 — 供各路由模块复用
 * 从 http-server.ts 拆分出来，避免循环依赖
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { setCorsHeaders, getCorsHeadersObj } from "./cors.js";
import { createModuleLogger } from "./logger.js";
import { sdk } from "../_core/sdk.js";
import { COOKIE_NAME } from "../../shared/const.js";
import { getCapabilities } from "./platforms.js";
import {
  persistCookieSecret,
  readConnectorStore,
  removeCookieSecret,
  resolveCookieSecret,
  writeConnectorStore,
} from "./storage.js";
import {
  syncDouyinProfile,
  verifyDouyinBinding,
  verifyXiaohongshuBinding,
  syncXiaohongshuProfile,
  verifyKuaishouBinding,
  syncKuaishouProfile,
} from "./tikhub.js";
import { dispatchNotificationEvent } from "./notifications.js";
import type {
  ConnectorPayload,
  LoginSessionRecord,
  StoredConnectorRecord,
} from "./types.js";
import { getLoginSession, resolveLoginSessionCookie } from "./login-sessions.js";

export { getCorsHeadersObj };

const log = createModuleLogger("HttpServer");

// ── 当前请求引用，供 CORS origin 反射使用 ──
let _currentRequest: IncomingMessage | null = null;

export function setCurrentRequest(req: IncomingMessage | null) {
  _currentRequest = req;
}

export function getCurrentRequest() {
  return _currentRequest;
}

// ── 时间工具 ──

export function nowIso() {
  return new Date().toISOString();
}

export function buildAppLink(targetPath: string) {
  const base = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (!base) return undefined;
  try {
    return new URL(targetPath, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return undefined;
  }
}

// ── 通知工具 ──

export async function notifySafely(params: Parameters<typeof dispatchNotificationEvent>[0]) {
  await dispatchNotificationEvent(params).catch(() => undefined);
}

// ── 认证工具 ──

/** 从 cookie 中解析当前登录用户的 openId */
export async function resolveUserOpenId(request: IncomingMessage): Promise<string> {
  const rawCookie = request.headers.cookie || "";
  const cookies = parseCookieHeader(rawCookie);
  const sessionCookie = cookies[COOKIE_NAME];
  if (!sessionCookie) {
    log.debug(
      { hasCookie: !!rawCookie, cookieKeys: Object.keys(cookies), expected: COOKIE_NAME },
      "resolveUserOpenId: no session cookie found",
    );
  }
  if (sessionCookie) {
    const session = await sdk.verifySession(sessionCookie);
    if (session?.openId) return session.openId;
    log.warn("resolveUserOpenId: session cookie present but verification failed");
  }
  return "anonymous";
}

/**
 * Get the authenticated user's openId from the request.
 * Uses the cached value from the auth middleware if available,
 * otherwise falls back to resolveUserOpenId.
 */
export function getAuthenticatedUser(request: IncomingMessage): string {
  return (request as unknown as Record<string, unknown>).__userOpenId as string || "anonymous";
}

// ── HTTP 响应工具 ──

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (_currentRequest) {
    setCorsHeaders(_currentRequest, response);
  }
  response.end(JSON.stringify(payload));
}

// ── 连接器工具 ──

export function toConnectorResponse(record: StoredConnectorRecord) {
  return {
    platformId: record.platformId,
    authMode: record.authMode,
    profileUrl: record.profileUrl,
    handle: record.handle,
    platformUserId: record.platformUserId,
    cookieConfigured: record.cookieConfigured,
    verifyStatus: record.verifyStatus,
    syncStatus: record.syncStatus,
    lastVerifiedAt: record.lastVerifiedAt,
    lastSyncedAt: record.lastSyncedAt,
    lastHealthCheckAt: record.lastHealthCheckAt,
    capabilities: getCapabilities(record.platformId),
  };
}

export function toLoginSessionResponse(session: LoginSessionRecord) {
  return {
    sessionId: session.sessionId,
    platformId: session.platformId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    error: session.error,
    qrScreenshot: session.qrScreenshot,
  };
}

export async function resolveEffectiveCookie(
  platformId: string,
  payload: ConnectorPayload,
  existing?: StoredConnectorRecord,
) {
  const sessionCookie =
    payload.loginSessionId && platformId === "douyin"
      ? await resolveLoginSessionCookie(payload.loginSessionId)
      : null;
  const storedCookie =
    !sessionCookie && existing?.encryptedSecretRef
      ? await resolveCookieSecret(existing.encryptedSecretRef)
      : null;
  return payload.cookie?.trim() || sessionCookie || storedCookie || undefined;
}

export function buildConnectorRecord(
  platformId: string,
  payload: ConnectorPayload,
  verified: Awaited<ReturnType<typeof verifyDouyinBinding>>,
  existing?: StoredConnectorRecord,
): StoredConnectorRecord {
  const timestamp = nowIso();
  const snapshot = verified.profileSnapshot as Record<string, unknown> | undefined;

  let resolvedHandle: string | undefined;
  let resolvedProfileUrl: string | undefined;

  if (platformId === "douyin") {
    const snapshotNickname = typeof snapshot?.nickname === "string" ? snapshot.nickname : undefined;
    const snapshotUniqueId = typeof snapshot?.unique_id === "string" ? snapshot.unique_id : undefined;
    const snapshotSecUid = typeof snapshot?.sec_uid === "string" ? snapshot.sec_uid : undefined;
    resolvedHandle = snapshotUniqueId || snapshotNickname || payload.handle?.trim() || existing?.handle;
    resolvedProfileUrl = snapshotSecUid
      ? `https://www.douyin.com/user/${snapshotSecUid}`
      : payload.profileUrl?.trim() || existing?.profileUrl;
  } else if (platformId === "xiaohongshu") {
    const snapshotNickname = typeof snapshot?.nickname === "string" ? snapshot.nickname : undefined;
    const snapshotRedId = typeof snapshot?.red_id === "string" ? snapshot.red_id : undefined;
    const snapshotAvatarUrl = typeof snapshot?.avatar_url === "string" ? snapshot.avatar_url : undefined;
    resolvedHandle = snapshotRedId || snapshotNickname || payload.handle?.trim() || existing?.handle;
    const resolvedUserId = verified.resolvedPlatformUserId || payload.platformUserId?.trim();
    resolvedProfileUrl = resolvedUserId
      ? `https://www.xiaohongshu.com/user/profile/${resolvedUserId}`
      : payload.profileUrl?.trim() || existing?.profileUrl;
    if (snapshotAvatarUrl && snapshot) {
      (snapshot as Record<string, unknown>).avatar_url = snapshotAvatarUrl;
    }
  } else if (platformId === "kuaishou") {
    const snapshotNickname = typeof snapshot?.nickname === "string" ? snapshot.nickname : undefined;
    const snapshotKwaiId = typeof snapshot?.kwaiId === "string" ? snapshot.kwaiId : undefined;
    const snapshotAvatarUrl = typeof snapshot?.avatar_url === "string" ? snapshot.avatar_url : undefined;
    resolvedHandle = snapshotKwaiId || snapshotNickname || payload.handle?.trim() || existing?.handle;
    const resolvedUserId = verified.resolvedPlatformUserId || payload.platformUserId?.trim();
    resolvedProfileUrl = resolvedUserId
      ? `https://www.kuaishou.com/profile/${resolvedUserId}`
      : payload.profileUrl?.trim() || existing?.profileUrl;
    if (snapshotAvatarUrl && snapshot) {
      (snapshot as Record<string, unknown>).avatar_url = snapshotAvatarUrl;
    }
  } else {
    resolvedHandle = payload.handle?.trim() || existing?.handle;
    resolvedProfileUrl = payload.profileUrl?.trim() || existing?.profileUrl;
  }

  return {
    platformId,
    authMode: payload.authMode,
    profileUrl: resolvedProfileUrl,
    handle: resolvedHandle,
    platformUserId: verified.resolvedPlatformUserId || payload.platformUserId?.trim() || existing?.platformUserId,
    cookieConfigured: verified.cookieConfigured,
    encryptedSecretRef: existing?.encryptedSecretRef,
    verifyStatus: "verified",
    syncStatus: "verified",
    lastVerifiedAt: timestamp,
    lastSyncedAt: timestamp,
    lastHealthCheckAt: timestamp,
  };
}

// ── 连接器操作（供 connector-routes 使用） ──

export {
  readConnectorStore,
  writeConnectorStore,
  persistCookieSecret,
  removeCookieSecret,
  resolveCookieSecret,
  getLoginSession,
  resolveLoginSessionCookie,
  verifyDouyinBinding,
  verifyXiaohongshuBinding,
  verifyKuaishouBinding,
  syncDouyinProfile,
  syncXiaohongshuProfile,
  syncKuaishouProfile,
  randomUUID,
};
