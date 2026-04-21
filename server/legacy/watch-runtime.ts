import type {
  DegradeFlag,
  EndpointHealthRecord,
  ExecutionStatus,
  StoredWatchTask,
  StoredWatchTaskRun,
  SupportedPlatform,
  WatchTaskType,
} from "./types.js";
import { readEndpointHealthStore, writeEndpointHealthStore } from "./storage.js";
import {
  getTikHub,
  isBusinessSuccess,
  parseBusinessCode,
  parseRequestId,
  postTikHub,
  profileSnapshotFromPayload,
  xhsProfileSnapshotFromPayload,
  ksProfileSnapshotFromPayload,
} from "./tikhub.js";

type HttpMethod = "GET" | "POST";
type RouteTier = "L1" | "L2" | "L3";

interface RuntimeContext {
  platform: SupportedPlatform;
  keyword?: string;
  uniqueId?: string;
  uid?: string;
  secUserId?: string;
  awemeId?: string;
  noteId?: string;
  photoId?: string;
  cookie?: string;
}

interface RouteSpec {
  capability: string;
  tier: RouteTier;
  method: HttpMethod;
  path: string;
  buildParams: (context: RuntimeContext) => unknown | null;
}

interface CapabilityRunResult {
  capability: string;
  required: boolean;
  ok: boolean;
  attempts: number;
  usedPath?: string;
  usedTier?: RouteTier;
  requestId?: string | null;
  httpStatus?: number;
  businessCode?: number | null;
  payload?: unknown;
  error?: string;
}

interface RunWatchTaskResult {
  task: StoredWatchTask;
  run: StoredWatchTaskRun;
}

const DEFAULT_DISABLED_ENDPOINTS = new Set([
  "/api/v1/douyin/billboard/fetch_hot_total_search_list",
  "/api/v1/douyin/billboard/fetch_hot_total_topic_list",
  "/api/v1/douyin/billboard/fetch_hot_total_video_list",
  "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
  "/api/v1/douyin/billboard/fetch_hot_total_high_search_list",
  "/api/v1/douyin/billboard/fetch_hot_total_hot_word_list",
  "/api/v1/douyin/billboard/fetch_hot_rise_list",
  "/api/v1/douyin/billboard/fetch_hot_total_list",
  "/api/v1/douyin/billboard/fetch_hot_item_trends_list",
]);

const BASE_BUDGET: Record<WatchTaskType, number> = {
  account_watch: 3,
  topic_watch: 4,
  validation_watch: 5,
};

function nowIso() {
  return new Date().toISOString();
}

function plusHours(dateIso: string, hours: number) {
  const date = new Date(dateIso);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function buildDouyinSearchPayload(keyword: string) {
  return {
    keyword,
    cursor: 0,
    sort_type: "0",
    publish_time: "7",
    filter_duration: "0",
    content_type: "0",
    search_id: "",
    backtrace: "",
  };
}

function buildXhsKeyword(keyword: string) {
  return keyword.trim();
}

const DOUYIN_ROUTES: RouteSpec[] = [
  {
    capability: "keyword_content_search",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_general_search_v1",
    buildParams: ({ keyword }) => (keyword ? buildDouyinSearchPayload(keyword) : null),
  },
  {
    capability: "keyword_content_search",
    tier: "L2",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_general_search_v2",
    buildParams: ({ keyword }) => (keyword ? buildDouyinSearchPayload(keyword) : null),
  },
  {
    capability: "keyword_content_search",
    tier: "L3",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_video_search_v1",
    buildParams: ({ keyword }) => (keyword ? buildDouyinSearchPayload(keyword) : null),
  },
  {
    capability: "topic_discovery",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_challenge_search_v2",
    buildParams: ({ keyword }) => (keyword ? buildDouyinSearchPayload(keyword) : null),
  },
  {
    capability: "topic_discovery",
    tier: "L2",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_challenge_search_v1",
    buildParams: ({ keyword }) => (keyword ? buildDouyinSearchPayload(keyword) : null),
  },
  {
    capability: "topic_discovery",
    tier: "L3",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_challenge_suggest",
    buildParams: ({ keyword }) => (keyword ? { keyword } : null),
  },
  {
    capability: "user_discovery",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_user_search_v2",
    buildParams: ({ keyword }) => (keyword ? { keyword, cursor: 0 } : null),
  },
  {
    capability: "user_discovery",
    tier: "L2",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_user_search",
    buildParams: ({ keyword }) => (keyword ? { keyword, cursor: 0 } : null),
  },
  {
    capability: "user_discovery",
    tier: "L3",
    method: "GET",
    path: "/api/v1/douyin/creator/fetch_user_search",
    buildParams: ({ keyword }) => (keyword ? { user_name: keyword } : null),
  },
  {
    capability: "hot_seed",
    tier: "L1",
    method: "GET",
    path: "/api/v1/douyin/app/v3/fetch_hot_search_list",
    buildParams: () => ({ board_type: "0", board_sub_type: "" }),
  },
  {
    capability: "hot_seed",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/web/fetch_hot_search_result",
    buildParams: () => ({}),
  },
  {
    capability: "hot_seed",
    tier: "L3",
    method: "POST",
    path: "/api/v1/douyin/search/fetch_search_suggest",
    buildParams: ({ keyword }) => (keyword ? { keyword } : null),
  },
  {
    capability: "account_profile",
    tier: "L1",
    method: "GET",
    path: "/api/v1/douyin/web/handler_user_profile_v2",
    buildParams: ({ uniqueId }) => (uniqueId ? { unique_id: uniqueId } : null),
  },
  {
    capability: "account_profile",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/web/handler_user_profile_v3",
    buildParams: ({ uid }) => (uid ? { uid } : null),
  },
  {
    capability: "account_profile",
    tier: "L3",
    method: "GET",
    path: "/api/v1/douyin/web/handler_user_profile_v4",
    buildParams: ({ secUserId }) => (secUserId ? { sec_user_id: secUserId } : null),
  },
  {
    capability: "creator_posts",
    tier: "L1",
    method: "GET",
    path: "/api/v1/douyin/app/v3/fetch_user_post_videos",
    buildParams: ({ secUserId }) =>
      secUserId ? { sec_user_id: secUserId, max_cursor: 0, count: 20, sort_type: 1 } : null,
  },
  {
    capability: "creator_posts",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/web/fetch_user_post_videos",
    buildParams: ({ secUserId }) =>
      secUserId ? { sec_user_id: secUserId, max_cursor: 0, count: 20, filter_type: "0" } : null,
  },
  {
    capability: "content_detail",
    tier: "L1",
    method: "GET",
    path: "/api/v1/douyin/app/v3/fetch_one_video_v3",
    buildParams: ({ awemeId }) => (awemeId ? { aweme_id: awemeId } : null),
  },
  {
    capability: "content_detail",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/web/fetch_one_video_v2",
    buildParams: ({ awemeId }) => (awemeId ? { aweme_id: awemeId } : null),
  },
  {
    capability: "content_detail",
    tier: "L3",
    method: "GET",
    path: "/api/v1/douyin/web/fetch_one_video_by_share_url",
    buildParams: ({ awemeId }) =>
      awemeId ? { share_url: `https://www.douyin.com/video/${awemeId}` } : null,
  },
  {
    capability: "comments",
    tier: "L1",
    method: "GET",
    path: "/api/v1/douyin/web/fetch_video_comments",
    buildParams: ({ awemeId }) => (awemeId ? { aweme_id: awemeId, cursor: 0, count: 20 } : null),
  },
  {
    capability: "comments",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/app/v3/fetch_video_comments",
    buildParams: ({ awemeId }) => (awemeId ? { aweme_id: awemeId, cursor: 0, count: 20 } : null),
  },
  {
    capability: "trend_growth",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/creator_v2/fetch_item_watch_trend",
    buildParams: ({ awemeId, cookie }) =>
      awemeId && cookie ? { cookie, item_id: awemeId, analysis_type: 1 } : null,
  },
  {
    capability: "trend_growth",
    tier: "L2",
    method: "GET",
    path: "/api/v1/douyin/billboard/fetch_hot_item_trends_list",
    buildParams: ({ awemeId }) =>
      awemeId ? { aweme_id: awemeId, option: 7, date_window: 2 } : null,
  },
  {
    capability: "cookie_enrich",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/creator_v2/fetch_item_overview_data",
    buildParams: ({ awemeId, cookie }) =>
      awemeId && cookie ? { cookie, ids: awemeId, fields: "metrics,play_info" } : null,
  },
  {
    capability: "cookie_enrich",
    tier: "L2",
    method: "POST",
    path: "/api/v1/douyin/creator_v2/fetch_item_play_source",
    buildParams: ({ awemeId, cookie }) =>
      awemeId && cookie ? { cookie, item_id: awemeId } : null,
  },
  {
    capability: "cookie_enrich",
    tier: "L3",
    method: "POST",
    path: "/api/v1/douyin/creator_v2/fetch_item_search_keyword",
    buildParams: ({ awemeId, cookie }) =>
      awemeId && cookie ? { cookie, item_id: awemeId } : null,
  },
  {
    capability: "cookie_verify",
    tier: "L1",
    method: "POST",
    path: "/api/v1/douyin/creator_v2/fetch_author_diagnosis",
    buildParams: ({ cookie }) => (cookie ? { cookie } : null),
  },
];

const XHS_ROUTES: RouteSpec[] = [
  // ===== 热榜 =====
  {
    capability: "hot_seed",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_hot_list",
    buildParams: () => ({}),
  },
  // ===== 用户搜索（替代数据链的关键环节） =====
  {
    capability: "user_discovery",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/app_v2/search_users",
    buildParams: ({ keyword }) =>
      keyword ? { keyword: buildXhsKeyword(keyword), page: 1 } : null,
  },
  {
    capability: "user_discovery",
    tier: "L2",
    method: "GET",
    path: "/api/v1/xiaohongshu/web/search_users",
    buildParams: ({ keyword }) =>
      keyword ? { keyword: buildXhsKeyword(keyword), page: 1 } : null,
  },
  // ===== 创作者作品列表 =====
  {
    capability: "creator_posts",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_home_notes",
    buildParams: ({ uid }) =>
      uid ? { user_id: uid } : null,
  },
  {
    capability: "creator_posts",
    tier: "L2",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_home_notes_app",
    buildParams: ({ uid }) =>
      uid ? { user_id: uid } : null,
  },
  {
    capability: "creator_posts",
    tier: "L3",
    method: "GET",
    path: "/api/v1/xiaohongshu/web/get_user_notes_v2",
    buildParams: ({ uid }) =>
      uid ? { user_id: uid } : null,
  },
  // ===== 笔记详情 =====
  {
    capability: "content_detail",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v2",
    buildParams: ({ noteId }) => (noteId ? { note_id: noteId } : null),
  },
  {
    capability: "content_detail",
    tier: "L2",
    method: "GET",
    path: "/api/v1/xiaohongshu/web/get_note_info_v7",
    buildParams: ({ noteId }) => (noteId ? { note_id: noteId } : null),
  },
  // ===== 评论 =====
  {
    capability: "comments",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_note_comments",
    buildParams: ({ noteId }) => (noteId ? { note_id: noteId, cursor: "" } : null),
  },
  {
    capability: "comments",
    tier: "L2",
    method: "GET",
    path: "/api/v1/xiaohongshu/web/get_note_comments",
    buildParams: ({ noteId }) => (noteId ? { note_id: noteId, cursor: "" } : null),
  },
  // ===== 账号主页 =====
  {
    capability: "account_profile",
    tier: "L1",
    method: "GET",
    path: "/api/v1/xiaohongshu/web_v2/fetch_user_info_app",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
  {
    capability: "account_profile",
    tier: "L2",
    method: "GET",
    path: "/api/v1/xiaohongshu/web/get_user_info",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
  {
    capability: "account_profile",
    tier: "L3",
    method: "GET",
    path: "/api/v1/xiaohongshu/app/get_user_info",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
];

const KUAISHOU_ROUTES: RouteSpec[] = [
  // ===== 内容搜索 =====
  {
    capability: "keyword_content_search",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/web/search_content",
    buildParams: ({ keyword }) =>
      keyword ? { keyword: keyword.trim(), page: 1 } : null,
  },
  {
    capability: "keyword_content_search",
    tier: "L2",
    method: "GET",
    path: "/api/v1/kuaishou/app/search_content_v2",
    buildParams: ({ keyword }) =>
      keyword ? { keyword: keyword.trim(), page: 1 } : null,
  },
  // ===== 用户搜索 =====
  {
    capability: "user_discovery",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/app/search_user_v2",
    buildParams: ({ keyword }) =>
      keyword ? { keyword: keyword.trim(), page: 1 } : null,
  },
  // ===== 热榜 =====
  {
    capability: "hot_seed",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/web/fetch_hot_search_list",
    buildParams: () => ({}),
  },
  {
    capability: "hot_seed",
    tier: "L2",
    method: "GET",
    path: "/api/v1/kuaishou/web/fetch_hot_topic_list",
    buildParams: () => ({}),
  },
  {
    capability: "hot_seed",
    tier: "L3",
    method: "GET",
    path: "/api/v1/kuaishou/app/fetch_hot_search_list",
    buildParams: () => ({}),
  },
  // ===== 视频详情 =====
  {
    capability: "content_detail",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/web/fetch_one_video",
    buildParams: ({ photoId }) => (photoId ? { photo_id: photoId } : null),
  },
  {
    capability: "content_detail",
    tier: "L2",
    method: "GET",
    path: "/api/v1/kuaishou/app/fetch_one_video_v2",
    buildParams: ({ photoId }) => (photoId ? { photo_id: photoId } : null),
  },
  // ===== 账号主页 =====
  {
    capability: "account_profile",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/app/fetch_one_user_v2",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
  {
    capability: "account_profile",
    tier: "L2",
    method: "GET",
    path: "/api/v1/kuaishou/web/fetch_user_info",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
  // ===== 创作者作品列表 =====
  {
    capability: "creator_posts",
    tier: "L1",
    method: "GET",
    path: "/api/v1/kuaishou/web/fetch_user_post",
    buildParams: ({ uid }) => (uid ? { user_id: uid, count: 20 } : null),
  },
  {
    capability: "creator_posts",
    tier: "L2",
    method: "GET",
    path: "/api/v1/kuaishou/app/fetch_user_hot_post",
    buildParams: ({ uid }) => (uid ? { user_id: uid } : null),
  },
];

function getRoutes(platform: SupportedPlatform) {
  if (platform === "douyin") return DOUYIN_ROUTES;
  if (platform === "kuaishou") return KUAISHOU_ROUTES;
  return XHS_ROUTES;
}

function getTaskPlan(platform: SupportedPlatform, taskType: WatchTaskType) {
  if (platform === "douyin") {
    if (taskType === "account_watch") {
      return {
        required: ["account_profile"] as string[],
        optional: ["creator_posts", "hot_seed"] as string[],
      };
    }
    if (taskType === "validation_watch") {
      return {
        required: ["keyword_content_search"] as string[],
        optional: [
          "topic_discovery",
          "hot_seed",
          "content_detail",
          "comments",
          "trend_growth",
          "cookie_enrich",
        ] as string[],
      };
    }
    return {
      required: ["keyword_content_search"] as string[],
      optional: ["topic_discovery", "hot_seed", "content_detail", "comments", "cookie_enrich"] as string[],
    };
  }

  // 快手任务计划（搜索可用，评论不可用）
  if (platform === "kuaishou") {
    if (taskType === "account_watch") {
      return {
        required: ["account_profile"] as string[],
        optional: ["creator_posts", "hot_seed"] as string[],
      };
    }
    if (taskType === "validation_watch") {
      return {
        required: ["keyword_content_search"] as string[],
        optional: ["hot_seed", "content_detail", "user_discovery"] as string[],
      };
    }
    // topic_watch
    return {
      required: ["keyword_content_search"] as string[],
      optional: ["hot_seed", "content_detail", "user_discovery"] as string[],
    };
  }

  // 小红书任务计划（搜索不可用，用替代数据链：热榜 → 用户搜索 → 作品拉取）
  if (taskType === "validation_watch") {
    return {
      required: ["hot_seed"] as string[],
      optional: ["user_discovery", "creator_posts", "content_detail", "comments"] as string[],
    };
  }

  if (taskType === "account_watch") {
    return {
      required: ["account_profile"] as string[],
      optional: ["creator_posts", "hot_seed"] as string[],
    };
  }

  return {
    required: ["hot_seed"] as string[],
    optional: ["user_discovery", "creator_posts", "content_detail", "comments"] as string[],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasAnyObjectKey(payload: unknown, keys: string[]): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) {
    return payload.some((item) => hasAnyObjectKey(item, keys));
  }
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) return true;
  }
  return Object.values(record).some((value) => hasAnyObjectKey(value, keys));
}

function hasNonEmptyArray(payload: unknown, keys: string[]): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) {
    return payload.length > 0;
  }
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
  }
  return Object.values(record).some((value) => hasNonEmptyArray(value, keys));
}

function validatePayload(capability: string, payload: unknown): string[] {
  if (!isObject(payload)) return ["payload_not_object"];
  if (!isBusinessSuccess(payload)) return ["business_not_success"];

  if (capability === "account_profile") {
    // 小红书、快手和抖音使用不同的解析函数
    let snapshot: Record<string, unknown>;
    if (hasAnyObjectKey(payload, ["red_id"])) {
      snapshot = xhsProfileSnapshotFromPayload(payload);
    } else if (hasAnyObjectKey(payload, ["kwaiId", "kwai_id", "user_name"])) {
      snapshot = ksProfileSnapshotFromPayload(payload);
    } else {
      snapshot = profileSnapshotFromPayload(payload);
    }
    return Object.keys(snapshot).length > 0
      ? []
      : ["missing_profile_fields"];
  }
  if (capability === "comments") {
    return hasNonEmptyArray(payload, ["comments", "comment_list"]) ||
      hasAnyObjectKey(payload, ["comment_count"])
      ? []
      : ["missing_comments"];
  }
  if (capability === "content_detail") {
    return hasAnyObjectKey(payload, ["aweme_detail", "note_detail", "items", "photo", "visionVideoDetail"])
      ? []
      : ["missing_detail"];
  }
  if (capability === "hot_seed") {
    return hasNonEmptyArray(payload, ["word_list", "items", "hot_list"]) ||
      hasAnyObjectKey(payload, ["data", "items"])
      ? []
      : ["missing_hot_seed"];
  }
  if (capability === "creator_posts") {
    return hasNonEmptyArray(payload, ["aweme_list", "items", "notes", "note_list", "list", "feeds", "photos"]) ||
      hasAnyObjectKey(payload, ["has_more", "max_cursor", "pcursor"])
      ? []
      : ["missing_posts"];
  }
  if (capability === "trend_growth" || capability === "cookie_enrich" || capability === "cookie_verify") {
    return hasAnyObjectKey(payload, ["data", "result", "extra"]) ? [] : ["missing_cookie_data"];
  }
  return hasNonEmptyArray(payload, ["items", "aweme_list", "note_list", "challenge_list"]) ||
    hasAnyObjectKey(payload, ["data", "search_id", "cursor"])
    ? []
    : ["missing_data"];
}

function healthKey(method: HttpMethod, path: string) {
  return `${method} ${path}`;
}

function buildRuntimeContext(task: StoredWatchTask, cookie?: string): RuntimeContext {
  const queryPayload = task.queryPayload;
  const takeString = (...keys: string[]) => {
    for (const key of keys) {
      const value = queryPayload[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  };

  const keyword =
    takeString("keyword", "seedTopic", "query", "topicCluster") ??
    (typeof queryPayload.topicKeywords === "string" ? queryPayload.topicKeywords : undefined);

  return {
    platform: task.platform,
    keyword,
    uniqueId: takeString("uniqueId", "handle"),
    uid: takeString("uid", "platformUserId"),
    secUserId: takeString("secUserId"),
    awemeId: takeString("awemeId", "contentId"),
    noteId: takeString("noteId", "contentId"),
    cookie,
  };
}

async function runRoute(
  spec: RouteSpec,
  params: unknown,
): Promise<{
  ok: boolean;
  payload?: unknown;
  httpStatus: number;
  businessCode: number | null;
  requestId: string | null;
  error?: string;
}> {
  try {
    const result =
      spec.method === "GET"
        ? await getTikHub<unknown>(spec.path, params as Record<string, unknown>)
        : await postTikHub<unknown>(spec.path, params);
    return {
      ok: result.ok,
      payload: result.payload,
      httpStatus: result.httpStatus,
      businessCode: result.businessCode,
      requestId: result.requestId,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      businessCode: null,
      requestId: null,
      error: error instanceof Error ? error.message : "Unknown TikHub request error",
    };
  }
}

function shouldEnableRoute(
  spec: RouteSpec,
  healthStore: Record<string, EndpointHealthRecord>,
) {
  const key = healthKey(spec.method, spec.path);
  const health = healthStore[key];
  // 熔断器：如果在冷却期内，跳过此接口
  if (health?.disabledUntil && new Date(health.disabledUntil) > new Date()) {
    return false;
  }
  // 熔断器已过期：自动重置状态，允许重试
  if (health?.disabledUntil && new Date(health.disabledUntil) <= new Date()) {
    healthStore[key] = {
      ...health,
      consecutiveFails: 0,
      disabledUntil: undefined,
      stable: true, // 临时标记为稳定，等待下次实际调用更新
    };
  }
  // 从未探测过的路由，跳过默认禁用名单，其余全部允许
  if (!health) {
    return !DEFAULT_DISABLED_ENDPOINTS.has(spec.path);
  }
  // 已有健康记录：只要未熔断就允许执行（stable=false 不等于永久禁用）
  return true;
}

/**
 * 熔断器：更新失败计数，连续失败 3 次后进入 5 分钟冷却
 * 注意：402（余额不足）/ 401（认证失败）属于账户级别问题，不计入熔断失败次数
 */
function applyCircuitBreaker(
  health: EndpointHealthRecord,
  succeeded: boolean,
  httpStatus?: number,
): EndpointHealthRecord {
  if (succeeded) {
    // 成功后重置计数
    return { ...health, consecutiveFails: 0, disabledUntil: undefined };
  }
  // 402 余额不足 / 401 认证失败：不触发熔断，这是账户问题而非接口故障
  if (httpStatus === 402 || httpStatus === 401) {
    return health;
  }
  const fails = (health.consecutiveFails ?? 0) + 1;
  const CIRCUIT_BREAKER_THRESHOLD = 3;
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟
  const disabledUntil =
    fails >= CIRCUIT_BREAKER_THRESHOLD
      ? new Date(Date.now() + COOLDOWN_MS).toISOString()
      : health.disabledUntil;
  return { ...health, consecutiveFails: fails, disabledUntil };
}

function getFallbackFlag(capability: string): DegradeFlag | null {
  if (capability === "keyword_content_search" || capability === "topic_discovery") {
    return "fallback_search_route";
  }
  if (capability === "user_discovery" || capability === "account_profile" || capability === "creator_posts") {
    return "fallback_user_route";
  }
  if (capability === "content_detail") {
    return "fallback_detail_route";
  }
  if (capability === "comments") {
    return "fallback_comment_route";
  }
  if (capability === "hot_seed") {
    return "fallback_hotlist_route";
  }
  if (capability === "trend_growth") {
    return "fallback_billboard_route";
  }
  return null;
}

function pushUnique<T>(items: T[], next: T | null | undefined) {
  if (next === null || next === undefined) return;
  if (!items.includes(next)) {
    items.push(next);
  }
}

async function executeCapability(
  capability: string,
  required: boolean,
  context: RuntimeContext,
  healthStore: Record<string, EndpointHealthRecord>,
  degradeFlags: DegradeFlag[],
  usedRouteChain: string[],
): Promise<CapabilityRunResult> {
  const candidates = getRoutes(context.platform)
    .filter((route) => route.capability === capability)
    .sort((left, right) => left.tier.localeCompare(right.tier))
    .filter((route) => shouldEnableRoute(route, healthStore));

  let attempts = 0;
  if (candidates.length === 0) {
    return {
      capability,
      required,
      ok: false,
      attempts,
      error: "No healthy routes are currently available for this capability.",
    };
  }

  for (const candidate of candidates) {
    const params = candidate.buildParams(context);
    if (params === null) {
      continue;
    }
    attempts += 1;
    const response = await runRoute(candidate, params);
    const missingFields =
      response.payload !== undefined ? validatePayload(capability, response.payload) : ["missing_payload"];
    const succeeded = response.ok && missingFields.length === 0;
    const prevHealth = healthStore[healthKey(candidate.method, candidate.path)];
    const newHealth: EndpointHealthRecord = {
      path: candidate.path,
      method: candidate.method,
      capability: candidate.capability,
      sampleParams: isObject(params) ? params : { body: JSON.stringify(params) },
      httpStatus: response.httpStatus,
      businessCode: response.businessCode,
      requestId: response.requestId,
      stable: succeeded,
      tier: candidate.tier,
      verifiedAt: nowIso(),
      failureReason: missingFields.length > 0 ? missingFields.join(",") : response.error,
      consecutiveFails: prevHealth?.consecutiveFails,
      disabledUntil: prevHealth?.disabledUntil,
    };
    healthStore[healthKey(candidate.method, candidate.path)] = applyCircuitBreaker(newHealth, succeeded, response.httpStatus);

    if (response.ok && missingFields.length === 0) {
      usedRouteChain.push(`${candidate.capability}:${candidate.tier}:${candidate.path}`);
      if (candidate.tier !== "L1") {
        pushUnique(degradeFlags, getFallbackFlag(capability));
      }
      if (capability === "keyword_content_search" && candidate.tier !== "L1") {
        pushUnique(degradeFlags, "topic_inferred_from_search");
      }
      return {
        capability,
        required,
        ok: true,
        attempts,
        usedPath: candidate.path,
        usedTier: candidate.tier,
        requestId: response.requestId,
        httpStatus: response.httpStatus,
        businessCode: response.businessCode,
        payload: response.payload,
      };
    }
  }

  return {
    capability,
    required,
    ok: false,
    attempts,
    error: `All healthy routes failed for capability ${capability}.`,
  };
}

function deriveExecutionStatus(
  requiredResults: CapabilityRunResult[],
  degradeFlags: DegradeFlag[],
): ExecutionStatus {
  if (requiredResults.some((result) => !result.ok)) {
    return "failed";
  }
  return degradeFlags.length > 0 ? "partial_success" : "success";
}

function calculateNextRunAt(task: StoredWatchTask) {
  const from = task.lastRunAt ?? task.updatedAt;
  return task.scheduleTier === "daily" ? plusHours(from, 24) : plusHours(from, 72);
}

export async function runWatchTaskWithFallback(params: {
  task: StoredWatchTask;
  runId: string;
  cookie?: string;
}): Promise<RunWatchTaskResult> {
  const { task, runId, cookie } = params;
  const healthStore = await readEndpointHealthStore();
  const context = buildRuntimeContext(task, cookie);
  const plan = getTaskPlan(task.platform, task.taskType);
  const degradeFlags: DegradeFlag[] = [];
  const usedRouteChain: string[] = [];
  const requiredResults: CapabilityRunResult[] = [];
  const optionalResults: CapabilityRunResult[] = [];
  let actualUsed = 0;

  for (const capability of plan.required) {
    const result = await executeCapability(
      capability,
      true,
      context,
      healthStore,
      degradeFlags,
      usedRouteChain,
    );
    actualUsed += result.attempts;
    requiredResults.push(result);
  }

  for (const capability of plan.optional) {
    const result = await executeCapability(
      capability,
      false,
      context,
      healthStore,
      degradeFlags,
      usedRouteChain,
    );
    actualUsed += result.attempts;
    optionalResults.push(result);
    if (!result.ok) {
      pushUnique(degradeFlags, capability === "hot_seed" ? "sparse_hotlist" : "optional_endpoint_failed");
      if (capability === "comments") {
        pushUnique(degradeFlags, "sparse_comments");
      }
      if (capability === "creator_posts") {
        pushUnique(degradeFlags, "sparse_followers");
      }
    }
  }

  if (requiredResults.some((result) => !result.ok)) {
    pushUnique(degradeFlags, "platform_partial_failure");
  }

  const executionStatus = deriveExecutionStatus(requiredResults, degradeFlags);
  const executedAt = nowIso();
  const snapshot = {
    taskId: task.taskId,
    artifactId: task.artifactId,
    platform: task.platform,
    taskType: task.taskType,
    executedAt,
    keyword: context.keyword,
    capabilityResults: [...requiredResults, ...optionalResults].map((result) => ({
      capability: result.capability,
      required: result.required,
      ok: result.ok,
      usedPath: result.usedPath,
      usedTier: result.usedTier,
      requestId: result.requestId,
      httpStatus: result.httpStatus,
      businessCode: result.businessCode,
      error: result.error,
      payload: result.payload,
    })),
  } satisfies Record<string, unknown>;

  const run: StoredWatchTaskRun = {
    runId,
    taskId: task.taskId,
    artifactId: task.artifactId,
    platform: task.platform,
    taskType: task.taskType,
    executedAt,
    executionStatus,
    degradeFlags,
    degradeReason:
      requiredResults.find((result) => !result.ok)?.error ??
      (optionalResults.some((result) => !result.ok)
        ? "Optional capabilities were degraded, but the task still returned a usable snapshot."
        : undefined),
    resultSnapshotRef: runId,
    usedRouteChain,
    budgetSnapshot: {
      baseBudget: BASE_BUDGET[task.taskType],
      actualUsed,
      cookieExtraBudget: cookie ? 3 : undefined,
    },
    snapshot,
  };

  const updatedTask: StoredWatchTask = {
    ...task,
    status: executionStatus === "failed" ? "failed" : "completed",
    updatedAt: executedAt,
    lastRunAt: executedAt,
    nextRunAt: calculateNextRunAt({
      ...task,
      updatedAt: executedAt,
      lastRunAt: executedAt,
    }),
    resultSnapshotRef: runId,
    lastExecutionStatus: executionStatus,
    degradeFlags,
    degradeReason: run.degradeReason,
    usedRouteChain,
    budgetSnapshot: run.budgetSnapshot,
  };

  await writeEndpointHealthStore(healthStore);

  return { task: updatedTask, run };
}

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function buildProbeContext(platform: SupportedPlatform, cookie?: string): RuntimeContext {
  if (platform === "douyin") {
    return {
      platform,
      keyword: getEnv("DOUYIN_PROBE_KEYWORD"),
      uniqueId: getEnv("DOUYIN_PROBE_UNIQUE_ID"),
      uid: getEnv("DOUYIN_PROBE_UID"),
      secUserId: getEnv("DOUYIN_PROBE_SEC_USER_ID"),
      awemeId: getEnv("DOUYIN_PROBE_AWEME_ID"),
      cookie,
    };
  }
  if (platform === "kuaishou") {
    return {
      platform,
      keyword: getEnv("KS_PROBE_KEYWORD") ?? "美食",
      uid: getEnv("KS_PROBE_USER_ID") ?? "3xeqr6egcxng4e4",
      photoId: getEnv("KS_PROBE_PHOTO_ID") ?? "3xbfhbrasqm2ndu",
    };
  }
  return {
    platform,
    keyword: getEnv("XHS_PROBE_KEYWORD"),
    uid: getEnv("XHS_PROBE_USER_ID"),
    noteId: getEnv("XHS_PROBE_NOTE_ID"),
  };
}

function probeCapabilities(platform: SupportedPlatform) {
  if (platform === "douyin") {
    return [
      "keyword_content_search",
      "topic_discovery",
      "user_discovery",
      "hot_seed",
      "account_profile",
      "creator_posts",
      "content_detail",
      "comments",
      "trend_growth",
      "cookie_enrich",
      "cookie_verify",
    ];
  }
  if (platform === "kuaishou") {
    // 快手无评论接口，不探测 comments
    return [
      "keyword_content_search",
      "user_discovery",
      "hot_seed",
      "account_profile",
      "creator_posts",
      "content_detail",
    ];
  }
  return ["hot_seed", "user_discovery", "creator_posts", "account_profile", "content_detail", "comments"];
}

export async function probeEndpointHealth(options: {
  includeDouyin?: boolean;
  includeXhs?: boolean;
  includeKuaishou?: boolean;
  douyinCookie?: string;
}) {
  const includeDouyin = options.includeDouyin ?? true;
  const includeXhs = options.includeXhs ?? true;
  const includeKuaishou = options.includeKuaishou ?? true;
  const healthEntries: EndpointHealthRecord[] = [];
  const store: Record<string, EndpointHealthRecord> = {};

  for (const platform of ["douyin", "xiaohongshu", "kuaishou"] as const) {
    if (
      (platform === "douyin" && !includeDouyin) ||
      (platform === "xiaohongshu" && !includeXhs) ||
      (platform === "kuaishou" && !includeKuaishou)
    ) {
      continue;
    }
    const context = buildProbeContext(
      platform,
      platform === "douyin" ? options.douyinCookie : undefined,
    );
    const capabilities = probeCapabilities(platform);
    for (const capability of capabilities) {
      const routes = getRoutes(platform)
        .filter((route) => route.capability === capability)
        .sort((left, right) => left.tier.localeCompare(right.tier));
      for (const route of routes) {
        const params = route.buildParams(context);
        if (params === null) {
          continue;
        }
        const response = await runRoute(route, params);
        const missingFields =
          response.payload !== undefined ? validatePayload(capability, response.payload) : ["missing_payload"];
        const entry: EndpointHealthRecord = {
          path: route.path,
          method: route.method,
          capability: capability,
          sampleParams: isObject(params) ? params : { body: JSON.stringify(params) },
          httpStatus: response.httpStatus,
          businessCode: response.businessCode ?? parseBusinessCode(response.payload),
          requestId: response.requestId ?? parseRequestId(response.payload),
          stable: response.ok && missingFields.length === 0,
          tier: route.tier,
          verifiedAt: nowIso(),
          failureReason: missingFields.length > 0 ? missingFields.join(",") : response.error,
        };
        healthEntries.push(entry);
        store[healthKey(route.method, route.path)] = entry;
      }
    }
  }

  return { store, entries: healthEntries };
}

export { DEFAULT_DISABLED_ENDPOINTS };
