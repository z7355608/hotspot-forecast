import { createModuleLogger } from "./logger.js";
const log = createModuleLogger("TikHub");
import type { ConnectorPayload, TikHubResult } from "./types.js";
import { execute } from "./database.js";

const BASE_URL = process.env.TIKHUB_BASE_URL || "https://api.tikhub.dev";
// ★ 降低单个请求超时，避免并行请求累计超过生产环境代理60s超时
const REQUEST_TIMEOUT_MS = Number(process.env.TIKHUB_REQUEST_TIMEOUT_MS || 20000);

// ═══════════════════════════════════════════
// API 调用量优化：缓存 + 402 快速失败 + 计数
// ═══════════════════════════════════════════

/** 请求缓存（30分钟 TTL） */
const CACHE_TTL_MS = 30 * 60 * 1000;
const requestCache = new Map<string, { data: unknown; ts: number }>();

function getCacheKey(method: string, path: string, params: unknown): string {
  return `${method}:${path}:${JSON.stringify(params ?? {})}`;
}

function getFromCache<T>(key: string): TikHubResult<T> | null {
  const entry = requestCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    requestCache.delete(key);
    return null;
  }
  return entry.data as TikHubResult<T>;
}

function setCache(key: string, data: unknown): void {
  requestCache.set(key, { data, ts: Date.now() });
  // 定期清理过期缓存（超过500条时清理）
  if (requestCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of requestCache) {
      if (now - v.ts > CACHE_TTL_MS) requestCache.delete(k);
    }
  }
}

/** 402 余额不足快速失败（10分钟冷却） */
let insufficientBalanceUntil = 0;
const BALANCE_COOLDOWN_MS = 10 * 60 * 1000;

export function isBalanceInsufficient(): boolean {
  return Date.now() < insufficientBalanceUntil;
}

export function resetBalanceCooldown(): void {
  insufficientBalanceUntil = 0;
}

/** API 调用计数器（用于监控） */
let apiCallCount = 0;
let apiCallCountResetAt = Date.now();

export function getApiCallStats(): { calls: number; since: string; cacheSize: number; balanceOk: boolean } {
  return {
    calls: apiCallCount,
    since: new Date(apiCallCountResetAt).toISOString(),
    cacheSize: requestCache.size,
    balanceOk: !isBalanceInsufficient(),
  };
}

export function resetApiCallCount(): void {
  apiCallCount = 0;
  apiCallCountResetAt = Date.now();
}

// ═══════════════════════════════════════════
// API 调用上下文（用于数据库日志记录）
// ═══════════════════════════════════════════

/** 当前调用上下文，由调用方在执行前设置 */
const _callContext: {
  taskType?: string;
  userId?: string;
  keyword?: string;
  platform?: string;
} = {};

/**
 * 设置当前 API 调用上下文（在批量调用前设置，调用完成后清除）
 * 用于数据库日志记录，追踪每次调用的来源
 */
export function setApiCallContext(ctx: {
  taskType?: string;
  userId?: string;
  keyword?: string;
  platform?: string;
}): void {
  Object.assign(_callContext, ctx);
}

export function clearApiCallContext(): void {
  delete _callContext.taskType;
  delete _callContext.userId;
  delete _callContext.keyword;
  delete _callContext.platform;
}

/** 异步写入 API 调用日志到数据库（fire-and-forget，不阻塞主流程） */
function logApiCallToDb(params: {
  apiPath: string;
  method: string;
  httpStatus: number;
  success: boolean;
  cacheHit: boolean;
  requestId: string | null;
  errorMsg?: string;
}): void {
  const { apiPath, method, httpStatus, success, cacheHit, requestId, errorMsg } = params;
  // 根据接口路径估算费用（$0.01/次，缓存命中不计费）
  const costUsd = cacheHit ? 0 : 0.01;
  execute(
    `INSERT INTO tikhub_api_calls
      (api_path, method, http_status, success, cache_hit, cost_usd, task_type, user_id, keyword, platform, request_id, error_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      apiPath,
      method,
      httpStatus,
      success ? 1 : 0,
      cacheHit ? 1 : 0,
      costUsd,
      _callContext.taskType ?? null,
      _callContext.userId ?? null,
      _callContext.keyword ?? null,
      _callContext.platform ?? null,
      requestId,
      errorMsg ?? null,
    ],
  ).catch((err: unknown) => {
    log.warn(`[API-LOG] Failed to write API call log: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// 搜索类路径（可缓存）
const CACHEABLE_PATHS = new Set([
  "/api/v1/douyin/search/fetch_general_search_v2",
  "/api/v1/douyin/search/fetch_video_search_v2",
  "/api/v1/xiaohongshu/app/search_notes",
  "/api/v1/kuaishou/app/search_comprehensive",
  "/api/v1/douyin/web/fetch_hot_search_list",
  "/api/v1/xiaohongshu/web/get_hot_topics",
  "/api/v1/kuaishou/web/fetch_hot_search_list",
]);

function getHeaders() {
  const apiKey = process.env.TIKHUB_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TIKHUB_API_KEY for connector backend.");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
}

export function parseBusinessCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.status_code === "number") return record.status_code;
  if (typeof record.code === "number") return record.code;
  return null;
}

export function parseRequestId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.request_id === "string") return record.request_id;
  if (typeof record.logid === "string") return record.logid;
  const extra = record.extra;
  if (extra && typeof extra === "object" && typeof (extra as Record<string, unknown>).logid === "string") {
    return (extra as Record<string, unknown>).logid as string;
  }
  return null;
}

export function isBusinessSuccess(payload: unknown) {
  const code = parseBusinessCode(payload);
  if (code === null) return true;
  return code === 0 || code === 200;
}

async function requestTikHub<T>(
  method: "GET" | "POST",
  apiPath: string,
  params?: unknown,
  timeoutMs?: number,
): Promise<TikHubResult<T>> {
  // ★ 402 快速失败：余额不足冷却期内直接返回错误
  if (isBalanceInsufficient()) {
    log.warn(`[402-FAST-FAIL] Skipping ${apiPath} — balance insufficient, cooldown until ${new Date(insufficientBalanceUntil).toISOString()}`);
    return {
      ok: false,
      httpStatus: 402,
      businessCode: 402,
      requestId: null,
      payload: { detail: { message: "API余额不足，已跳过请求以节省额度" } } as T,
    };
  }

  // ★ 缓存检查：搜索类请求使用缓存
  const cacheKey = getCacheKey(method, apiPath, params);
  if (CACHEABLE_PATHS.has(apiPath)) {
    const cached = getFromCache<T>(cacheKey);
    if (cached) {
      log.info(`[CACHE-HIT] ${apiPath} — returning cached result`);
      // 记录缓存命中（不计费）
      logApiCallToDb({ apiPath, method, httpStatus: 200, success: true, cacheHit: true, requestId: cached.requestId });
      return cached;
    }
  }

  // 实际请求
  apiCallCount++;
  const url = new URL(`${BASE_URL.replace(/\/$/, "")}${apiPath}`);
  const init: RequestInit = {
    method,
    headers: getHeaders(),
    signal: AbortSignal.timeout(timeoutMs ?? REQUEST_TIMEOUT_MS),
  };
  if (method === "GET" && params && typeof params === "object" && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  if (method === "POST") {
    init.body = JSON.stringify(params ?? {});
  }
  const response = await fetch(url, init);
  const raw = await response.text();
  let payload: T;
  try {
    payload = JSON.parse(raw) as T;
  } catch {
    throw new Error(`TikHub returned non-JSON payload for ${apiPath}: ${raw.slice(0, 200)}`);
  }

  // ★ 检测 402 余额不足，启动冷却
  if (response.status === 402) {
    insufficientBalanceUntil = Date.now() + BALANCE_COOLDOWN_MS;
    log.error(`[402-DETECTED] Balance insufficient! Cooldown activated for 10 minutes. Path: ${apiPath}`);
  }

  const result: TikHubResult<T> = {
    ok: response.ok && isBusinessSuccess(payload),
    httpStatus: response.status,
    businessCode: parseBusinessCode(payload),
    requestId: parseRequestId(payload),
    payload,
  };

  // ★ 缓存成功的搜索结果
  if (result.ok && CACHEABLE_PATHS.has(apiPath)) {
    setCache(cacheKey, result);
    log.info(`[CACHE-SET] ${apiPath} — cached for 30 minutes`);
  }

  // ★ 记录 API 调用到数据库
  logApiCallToDb({
    apiPath,
    method,
    httpStatus: result.httpStatus,
    success: result.ok,
    cacheHit: false,
    requestId: result.requestId,
    errorMsg: result.ok ? undefined : `HTTP ${result.httpStatus}, code ${result.businessCode}`,
  });

  return result;
}

export async function getTikHub<T>(apiPath: string, params?: Record<string, unknown>, timeoutMs?: number) {
  return requestTikHub<T>("GET", apiPath, params, timeoutMs);
}

export async function postTikHub<T>(apiPath: string, params?: unknown) {
  return requestTikHub<T>("POST", apiPath, params);
}

type ProfileIdentifier =
  | { kind: "unique_id"; value: string }
  | { kind: "uid"; value: string }
  | { kind: "sec_user_id"; value: string };

function stripHandle(handle: string | undefined) {
  return handle?.trim().replace(/^@+/, "") || "";
}

function inferIdentifierFromProfileUrl(profileUrl: string | undefined): ProfileIdentifier | null {
  if (!profileUrl) return null;
  try {
    const url = new URL(profileUrl);
    const secUserId = url.searchParams.get("sec_user_id");
    if (secUserId) {
      return { kind: "sec_user_id", value: secUserId };
    }
    const userMatch = url.pathname.match(/\/user\/([^/?]+)/);
    if (userMatch?.[1]) {
      return { kind: "sec_user_id", value: userMatch[1] };
    }
    const uidMatch = url.pathname.match(/\/profile\/(\d+)/);
    if (uidMatch?.[1]) {
      return { kind: "uid", value: uidMatch[1] };
    }
  } catch {
    return null;
  }
  return null;
}

function inferIdentifier(payload: ConnectorPayload): ProfileIdentifier | null {
  const explicit = payload.platformUserId?.trim();
  if (explicit) {
    if (/^\d+$/.test(explicit)) {
      return { kind: "uid", value: explicit };
    }
    if (explicit.startsWith("MS4w")) {
      return { kind: "sec_user_id", value: explicit };
    }
    return { kind: "unique_id", value: explicit };
  }
  const byUrl = inferIdentifierFromProfileUrl(payload.profileUrl);
  if (byUrl) return byUrl;
  const handle = stripHandle(payload.handle);
  return handle ? { kind: "unique_id", value: handle } : null;
}

export function profileSnapshotFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const dicts = [payload as Record<string, unknown>];
  while (dicts.length > 0) {
    const item = dicts.shift()!;
    const nickname =
      item.nickname ||
      item.author_name ||
      (item.user as Record<string, unknown> | undefined)?.nickname;
    const secUid = item.sec_uid || item.secUid;
    const uid = item.uid || item.author_id;
    const uniqueId = item.unique_id || item.short_id;
    if (nickname || secUid || uid || uniqueId) {
      return {
        nickname: typeof nickname === "string" ? nickname : "",
        sec_uid: typeof secUid === "string" ? secUid : undefined,
        uid: typeof uid === "string" || typeof uid === "number" ? String(uid) : undefined,
        unique_id: typeof uniqueId === "string" ? uniqueId : undefined,
        follower_count:
          typeof item.follower_count === "number" ? item.follower_count : undefined,
        aweme_count: typeof item.aweme_count === "number" ? item.aweme_count : undefined,
      };
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === "object") {
              dicts.push(child as Record<string, unknown>);
            }
          }
        } else {
          dicts.push(value as Record<string, unknown>);
        }
      }
    }
  }
  return {};
}

export async function verifyDouyinBinding(payload: ConnectorPayload) {
  const result = {
    verified: false,
    resolvedPlatformUserId: payload.platformUserId?.trim() || "",
    cookieConfigured: false,
    profileSnapshot: {} as Record<string, unknown>,
    capabilities: undefined as unknown,
  };
  const identifier = inferIdentifier(payload);
  if (identifier) {
    let path = "/api/v1/douyin/web/handler_user_profile_v2";
    let params: Record<string, unknown> = { unique_id: identifier.value };
    if (identifier.kind === "uid") {
      path = "/api/v1/douyin/web/handler_user_profile_v3";
      params = { uid: identifier.value };
    } else if (identifier.kind === "sec_user_id") {
      path = "/api/v1/douyin/web/handler_user_profile_v4";
      params = { sec_user_id: identifier.value };
    }
    const profile = await getTikHub(path, params);
    if (!profile.ok) {
      throw new Error(
        `Douyin profile verify failed with HTTP ${profile.httpStatus}, business code ${profile.businessCode}.`,
      );
    }
    const snapshot = profileSnapshotFromPayload(profile.payload);
    result.profileSnapshot = snapshot;
    result.resolvedPlatformUserId =
      (typeof snapshot.sec_uid === "string" && snapshot.sec_uid) ||
      (typeof snapshot.uid === "string" && snapshot.uid) ||
      result.resolvedPlatformUserId;
    result.verified = true;
  }

  if (payload.authMode === "cookie") {
    if (!payload.cookie?.trim()) {
      throw new Error("Cookie mode requires a non-empty Douyin cookie.");
    }
    // 扫码登录模式：先用 cookie 获取用户信息（当没有 identifier 时）
    if (!identifier) {
      try {
        const selfProfile = await postTikHub("/api/v1/douyin/creator_v2/fetch_author_diagnosis", {
          cookie: payload.cookie.trim(),
        });
        if (selfProfile.ok && selfProfile.payload) {
          const snapshot = profileSnapshotFromPayload(selfProfile.payload);
          if (Object.keys(snapshot).length > 0) {
            result.profileSnapshot = snapshot;
            result.resolvedPlatformUserId =
              (typeof snapshot.sec_uid === "string" && snapshot.sec_uid) ||
              (typeof snapshot.uid === "string" && snapshot.uid) ||
              result.resolvedPlatformUserId;
          }
        }
      } catch {
        // 如果从 diagnosis 获取用户信息失败，不影响 cookie 验证流程
      }
    }
    const diagnosis = await postTikHub("/api/v1/douyin/creator_v2/fetch_author_diagnosis", {
      cookie: payload.cookie.trim(),
    });
    if (!diagnosis.ok) {
      throw new Error(
        `Douyin cookie verify failed with HTTP ${diagnosis.httpStatus}, business code ${diagnosis.businessCode}.`,
      );
    }
    result.cookieConfigured = true;
    result.verified = true;
  }

  if (!result.verified) {
    throw new Error("No valid Douyin identifier or cookie probe succeeded during verify.");
  }
  return result;
}

export async function syncDouyinProfile(record: ConnectorPayload & { cookie?: string }) {
  return verifyDouyinBinding(record);
}

// ─────────────────────────────────────────────
// 小红书标识解析与验证
// ─────────────────────────────────────────────

/**
 * 从小红书 ConnectorPayload 中提取 user_id
 * 支持：
 * 1. platformUserId 直接传入（hex 格式，如 5a5c0e0be8ac2b04da76bca7）
 * 2. profileUrl 中解析 /user/profile/xxx 或 /user/xxx
 * 3. handle 如果是 hex 格式也当作 user_id
 */
export function extractXhsUserIdFromPayload(payload: ConnectorPayload): string | null {
  const pid = payload.platformUserId?.trim();
  if (pid && /^[a-f0-9]{16,}$/i.test(pid)) return pid;
  // 从 profileUrl 中提取
  const url = payload.profileUrl?.trim() || "";
  const match = url.match(/\/user\/(?:profile\/)?([a-f0-9]{16,})/i);
  if (match?.[1]) return match[1];
  // handle 可能就是 user_id
  const handle = payload.handle?.replace(/^@+/, "").trim();
  if (handle && /^[a-f0-9]{16,}$/i.test(handle)) return handle;
  return null;
}

/**
 * 从小红书 API 响应中提取 profile snapshot
 * 支持 web_v2/fetch_user_info_app 和 web/get_user_info 两种格式
 */
export function xhsProfileSnapshotFromPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;

  // web_v2/fetch_user_info_app 格式: { data: { basic_info: { nickname, image, red_id, ip_location }, interactions: [...], tags: [...] } }
  const basicInfo = data.basic_info as Record<string, unknown> | undefined;
  if (basicInfo) {
    const nickname = typeof basicInfo.nickname === "string" ? basicInfo.nickname : "";
    const redId = typeof basicInfo.red_id === "string" ? basicInfo.red_id : undefined;
    const image = basicInfo.image ?? basicInfo.images;
    const avatarUrl = typeof image === "string" ? image
      : (image && typeof image === "object" && typeof (image as Record<string, unknown>).url === "string")
        ? String((image as Record<string, unknown>).url) : undefined;
    const ipLocation = typeof basicInfo.ip_location === "string" ? basicInfo.ip_location : undefined;

    // 解析 interactions 数组
    const interactions = (data.interactions ?? []) as Array<Record<string, unknown>>;
    let followers = 0, following = 0, totalLikesAndCollects = 0;
    for (const item of interactions) {
      const name = String(item.name ?? "");
      const count = Number(item.count ?? 0);
      if (name.includes("粉丝") || item.type === "fans") followers = count;
      else if (name.includes("关注") || item.type === "follows") following = count;
      else if (name.includes("赞") || item.type === "interaction") totalLikesAndCollects = count;
    }

    // 解析 tags 数组
    const tags = (data.tags ?? []) as Array<Record<string, unknown>>;
    const tagNames = tags.map(t => String(t.name ?? "")).filter(Boolean);

    return {
      nickname,
      red_id: redId,
      avatar_url: avatarUrl,
      ip_location: ipLocation,
      follower_count: followers,
      following_count: following,
      total_likes_and_collects: totalLikesAndCollects,
      tags: tagNames,
    };
  }

  // web/get_user_info 降级格式: { data: { nickname, images, desc, follower_count, ... } }
  const nickname = typeof data.nickname === "string" ? data.nickname : "";
  if (nickname) {
    return {
      nickname,
      red_id: typeof data.red_id === "string" ? data.red_id : undefined,
      avatar_url: typeof data.images === "string" ? data.images
        : typeof data.image === "string" ? data.image : undefined,
      follower_count: typeof data.follower_count === "number" ? data.follower_count
        : typeof data.fans_count === "number" ? data.fans_count : undefined,
      following_count: typeof data.following_count === "number" ? data.following_count
        : typeof data.follows_count === "number" ? data.follows_count : undefined,
      total_likes_and_collects: typeof data.interaction_count === "number" ? data.interaction_count : undefined,
    };
  }

  return {};
}

/**
 * 验证小红书账号绑定
 * 降级链：L1 web_v2/fetch_user_info_app → L2 web/get_user_info → L3 app/get_user_info
 */
export async function verifyXiaohongshuBinding(payload: ConnectorPayload) {
  const result = {
    verified: false,
    resolvedPlatformUserId: payload.platformUserId?.trim() || "",
    cookieConfigured: false,
    profileSnapshot: {} as Record<string, unknown>,
    capabilities: undefined as unknown,
  };

  const userId = extractXhsUserIdFromPayload(payload);
  if (!userId) {
    throw new Error("无法从输入中解析小红书 user_id，请提供主页链接或用户ID。");
  }

  // L1: web_v2/fetch_user_info_app（最完整，返回 basic_info + interactions + tags）
  let profilePayload: unknown = null;
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/xiaohongshu/web_v2/fetch_user_info_app",
      { user_id: userId },
    );
    if (res.ok) profilePayload = res.payload;
  } catch { /* fallthrough to L2 */ }

  // L2: web/get_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/xiaohongshu/web/get_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough to L3 */ }
  }

  // L3: app/get_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/xiaohongshu/app/get_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* all levels failed */ }
  }

  if (!profilePayload) {
    throw new Error(
      `小红书用户验证失败：无法获取用户 ${userId} 的信息，请检查用户ID是否正确。`,
    );
  }

  const snapshot = xhsProfileSnapshotFromPayload(profilePayload);
  result.profileSnapshot = snapshot;
  result.resolvedPlatformUserId = userId;
  result.verified = true;

  return result;
}

export async function syncXiaohongshuProfile(record: ConnectorPayload) {
  return verifyXiaohongshuBinding(record);
}

// ─────────────────────────────────────────────
// 快手标识解析与验证
// ─────────────────────────────────────────────

/**
 * 从快手 ConnectorPayload 中提取 user_id
 * 支持：
 * 1. platformUserId 直接传入（纯数字）
 * 2. profileUrl 中解析 /profile/{user_id} 或 /{kwaiId}
 * 3. handle 作为 kwaiId（需要通过搜索接口反查 user_id）
 *
 * 返回 { userId, kwaiId } 其中 userId 可能为 null（需要搜索反查）
 */
export function extractKuaishouIdentifier(payload: ConnectorPayload): {
  userId: string | null;
  kwaiId: string | null;
} {
  const pid = payload.platformUserId?.trim();
  if (pid) {
    // 纯数字 → user_id
    if (/^\d+$/.test(pid)) return { userId: pid, kwaiId: null };
    // 非数字 → kwaiId
    return { userId: null, kwaiId: pid };
  }

  // 从 profileUrl 中提取
  const url = payload.profileUrl?.trim() || "";
  if (url) {
    try {
      const parsed = new URL(url);
      // kuaishou.com/profile/{user_id}
      const profileMatch = parsed.pathname.match(/\/profile\/(\d+)/);
      if (profileMatch?.[1]) return { userId: profileMatch[1], kwaiId: null };
      // v.kuaishou.com/{kwaiId} 或 kuaishou.com/{kwaiId}
      const pathMatch = parsed.pathname.match(/^\/([a-zA-Z0-9_]+)\/?$/);
      if (pathMatch?.[1] && pathMatch[1] !== "profile") {
        const val = pathMatch[1];
        if (/^\d+$/.test(val)) return { userId: val, kwaiId: null };
        return { userId: null, kwaiId: val };
      }
    } catch { /* not a valid URL */ }
  }

  // handle 作为 kwaiId
  const handle = payload.handle?.replace(/^@+/, "").trim();
  if (handle) {
    if (/^\d+$/.test(handle)) return { userId: handle, kwaiId: null };
    return { userId: null, kwaiId: handle };
  }

  return { userId: null, kwaiId: null };
}

/**
 * 通过搜索接口将快手昵称/kwaiId 反查为 user_id
 * 搜索接口返回的用户对象包含 user_id(纯数字)、user_name(昵称)、fansCount 等字段
 * 优先精确匹配 user_name，其次取第一个结果
 */
async function resolveKuaishouNameToUserId(keyword: string): Promise<{ userId: string; snapshot: Record<string, unknown> } | null> {
  const attempt = async (): Promise<{ userId: string; snapshot: Record<string, unknown> } | null> => {
    try {
      const res = await getTikHub<Record<string, unknown>>(
        "/api/v1/kuaishou/app/search_user_v2",
        { keyword, page: 1 },
        30_000, // 30s timeout for kuaishou search
      );
      if (!res.ok || !res.payload) return null;
      const data = (res.payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
      const users = (data?.users ?? data?.list ?? []) as Array<Record<string, unknown>>;
      if (users.length === 0) return null;

      // 策略 1: 精确匹配 user_name (昵称)
      for (const user of users) {
        const name = String(user.user_name ?? user.userName ?? "");
        if (name && name.toLowerCase() === keyword.toLowerCase()) {
          const uid = user.user_id ?? user.userId ?? user.id;
          if (uid != null) return { userId: String(uid), snapshot: buildSnapshotFromSearchUser(user) };
        }
      }

      // 策略 2: 精确匹配 kwaiId (搜索结果可能包含)
      for (const user of users) {
        const kid = String(user.kwaiId ?? user.kwai_id ?? "");
        if (kid && kid.toLowerCase() === keyword.toLowerCase()) {
          const uid = user.user_id ?? user.userId ?? user.id;
          if (uid != null) return { userId: String(uid), snapshot: buildSnapshotFromSearchUser(user) };
        }
      }

      // 策略 3: 取第一个结果
      const first = users[0];
      const uid = first.user_id ?? first.userId ?? first.id;
      if (uid != null) return { userId: String(uid), snapshot: buildSnapshotFromSearchUser(first) };
      return null;
    } catch {
      return null;
    }
  };

  // 第一次尝试
  const r1 = await attempt();
  if (r1) return r1;
  // 重试一次
  log.info(`搜索 "${keyword}" 第一次失败，1s 后重试...`);
  await new Promise(r => setTimeout(r, 1000));
  return attempt();
}

/** 从搜索结果的用户对象構建 profile snapshot */
function buildSnapshotFromSearchUser(user: Record<string, unknown>): Record<string, unknown> {
  return {
    nickname: String(user.user_name ?? user.userName ?? ""),
    user_id: String(user.user_id ?? user.userId ?? user.id ?? ""),
    avatar_url: String(user.headurl ?? user.headUrl ?? user.head_url ?? ""),
    follower_count: typeof user.fansCount === "number" ? user.fansCount : undefined,
    gender: typeof user.user_sex === "string" ? user.user_sex : undefined,
    bio: typeof user.user_text === "string" ? user.user_text : undefined,
    verified: typeof user.verified === "boolean" ? user.verified : undefined,
  };
}

/**
 * 从快手 API 响应中提取 profile snapshot
 * 支持 app/fetch_one_user_v2 和 web/fetch_user_info 两种格式
 */
export function ksProfileSnapshotFromPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;

  // app/fetch_one_user_v2 格式: { data: { user_name, kwaiId, fansCount, headurl, user_sex, user_text, ... } }
  const userName = data.user_name ?? data.userName;
  const kwaiId = data.kwaiId ?? data.kwai_id;
  const fansCount = data.fansCount ?? data.fans_count ?? data.fan;
  const headUrl = data.headurl ?? data.headUrl ?? data.head_url;
  const userId = data.user_id ?? data.userId;
  const userSex = data.user_sex ?? data.userSex;
  const userText = data.user_text ?? data.userText ?? data.bio ?? data.description;
  const followCount = data.followCount ?? data.follow_count ?? data.following;
  const photoCount = data.photo_count ?? data.photoCount ?? data.photo;
  const verified = data.verified ?? data.isVerified;

  if (userName || kwaiId || userId) {
    return {
      nickname: typeof userName === "string" ? userName : "",
      kwaiId: typeof kwaiId === "string" ? kwaiId : undefined,
      user_id: userId != null ? String(userId) : undefined,
      avatar_url: typeof headUrl === "string" ? headUrl : undefined,
      follower_count: typeof fansCount === "number" ? fansCount : (typeof fansCount === "string" ? parseInt(fansCount, 10) || undefined : undefined),
      following_count: typeof followCount === "number" ? followCount : undefined,
      photo_count: typeof photoCount === "number" ? photoCount : undefined,
      gender: typeof userSex === "string" ? userSex : undefined,
      bio: typeof userText === "string" ? userText : undefined,
      verified: typeof verified === "boolean" ? verified : undefined,
    };
  }

  // 深度搜索：可能嵌套在 user 或 userProfile 对象中
  for (const key of ["user", "userProfile", "ownerInfo", "author"]) {
    const nested = data[key];
    if (nested && typeof nested === "object") {
      const result = ksProfileSnapshotFromPayload(nested);
      if (Object.keys(result).length > 0) return result;
    }
  }

  return {};
}

/**
 * 验证快手账号绑定
 * 降级链：L1 app/fetch_one_user_v2 → L2 web/fetch_user_info → L3 search_user_v2
 */
export async function verifyKuaishouBinding(payload: ConnectorPayload) {
  const result = {
    verified: false,
    resolvedPlatformUserId: payload.platformUserId?.trim() || "",
    cookieConfigured: false,
    profileSnapshot: {} as Record<string, unknown>,
    capabilities: undefined as unknown,
  };

  let { userId, kwaiId } = extractKuaishouIdentifier(payload);

  // 如果只有 kwaiId/昵称，通过搜索反查 user_id
  if (!userId && kwaiId) {
    log.info(`通过搜索接口反查 "${kwaiId}" 的 user_id`);
    const resolved = await resolveKuaishouNameToUserId(kwaiId);
    if (!resolved) {
      throw new Error(`快手用户验证失败：无法通过 "${kwaiId}" 找到对应用户。请检查昵称是否正确，或改用主页链接/数字ID。`);
    }
    userId = resolved.userId;
    // 搜索已经拿到了 snapshot，可以直接使用
    if (Object.keys(resolved.snapshot).length > 0) {
      result.profileSnapshot = resolved.snapshot;
      result.resolvedPlatformUserId = userId;
      result.verified = true;
      return result;
    }
  }

  if (!userId) {
    throw new Error("无法从输入中解析快手用户信息，请提供昵称、主页链接或数字ID。");
  }

  // L1: app/fetch_one_user_v2（最稳定）
  let profilePayload: unknown = null;
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/kuaishou/app/fetch_one_user_v2",
      { user_id: userId },
    );
    if (res.ok) profilePayload = res.payload;
  } catch { /* fallthrough to L2 */ }

  // L2: web/fetch_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/kuaishou/web/fetch_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough to L3 */ }
  }

  // L3: search_user_v2（搜索验证用户存在性）
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/kuaishou/app/search_user_v2",
        { keyword: userId, page: 1 },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* all levels failed */ }
  }

  if (!profilePayload) {
    throw new Error(
      `快手用户验证失败：无法获取用户 ${userId} 的信息，请检查用户ID是否正确。`,
    );
  }

  const snapshot = ksProfileSnapshotFromPayload(profilePayload);
  result.profileSnapshot = snapshot;
  result.resolvedPlatformUserId = userId;
  result.verified = true;

  return result;
}

export async function syncKuaishouProfile(record: ConnectorPayload) {
  return verifyKuaishouBinding(record);
}
