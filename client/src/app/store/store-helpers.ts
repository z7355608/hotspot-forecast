/**
 * store-helpers.ts — app-store-provider 的纯工具函数
 * 从 app-store-provider.tsx 中提取，供 AppStoreProvider 组件导入使用
 */

import {
  APP_NOW,
  INITIAL_CONNECTORS,
  INITIAL_NOTIFICATION_CHANNELS,
  INITIAL_STATS,
  INITIAL_TRANSACTIONS,
  canUseModel,
  createId,
  createResultRecord,
  createSeedResults,
  getHighestAvailableModel,
  type AIModelId,
  type ConnectorRecord,
  type NotificationChannelRecord,
  type ResultRecord,
} from "./app-data";
import { buildPredictionArtifacts } from "./prediction-engine";
import type { ConnectorServerRecord } from "../lib/connectors-api";
import {
  fetchApiHealth as fetchApiHealthRequest,
} from "../lib/live-predictions-api";
import type { NotificationChannelServerRecord } from "../lib/notification-channels-api";
import { API_BACKEND_UNAVAILABLE_MESSAGE, normalizeApiError } from "../lib/api-utils";
import type { SavedResultArtifactSummary, WatchTaskSummary } from "../lib/result-artifacts-api";
import type {
  AppDataMode,
  PredictionRequestDraft,
  PredictionWatchPreset,
  UserProfile,
} from "./prediction-types";
import type {
  ApiHealthState,
  AppState,
  GlobalState,
  ModeScopedState,
} from "./store-types";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

export const STORAGE_KEY = "figma-hotspot-forecast.store.v3";
export const LEGACY_STORAGE_KEY = "figma-hotspot-forecast.store.v2";
export const MODE_STORAGE_KEY: Record<AppDataMode, string> = {
  mock: "figma-hotspot-forecast.mode.mock.v1",
  live: "figma-hotspot-forecast.mode.live.v1",
};

export const DEFAULT_DATA_MODE: AppDataMode =
  import.meta.env.VITE_DEFAULT_DATA_MODE === "live" ? "live" : "mock";

/* ================================================================== */
/*  State initializers                                                 */
/* ================================================================== */

export function createInitialApiHealth(mode: AppDataMode): ApiHealthState {
  return {
    status: mode === "live" ? "unknown" : "ready",
    checkedAt: mode === "live" ? undefined : APP_NOW,
    services: {
      livePrediction: mode === "mock",
      notifications: mode === "mock",
    },
  };
}

export async function probeApiHealth(): Promise<ApiHealthState> {
  try {
    const payload = await fetchApiHealthRequest();
    return {
      status: "ready",
      checkedAt: payload.serverTime,
      message: undefined,
      services: payload.services,
    };
  } catch (error) {
    return {
      status: "unavailable",
      checkedAt: new Date().toISOString(),
      message: normalizeApiError(error, API_BACKEND_UNAVAILABLE_MESSAGE),
      services: {
        livePrediction: false,
        notifications: false,
      },
    };
  }
}

export function createBaseGlobalState(mode: AppDataMode = DEFAULT_DATA_MODE): GlobalState {
  return {
    dataMode: mode,
    credits: 120,
    membershipPlan: "free",
    selectedModel: "doubao",
    transactions: INITIAL_TRANSACTIONS,
    monthlySpent: INITIAL_STATS.monthlySpent,
    totalEarned: INITIAL_STATS.totalEarned,
    userProfile: {
      nickname: "",
      niche: "",
      platforms: [],
      followerScale: "",
      instructions: "",
      contentStyleTags: [],
    },
  };
}

export function resetConnectorRecord(connector: ConnectorRecord): ConnectorRecord {
  return {
    ...connector,
    connected: false,
    authMode: undefined,
    profileUrl: undefined,
    handle: undefined,
    platformUserId: undefined,
    cookieConfigured: false,
    syncStatus: "idle",
    lastVerifiedAt: undefined,
    lastSync: "未连接",
    dataPoints: connector.dataPoints?.startsWith("待接入")
      ? connector.dataPoints
      : `待接入 · ${connector.name} 平台数据快照`,
  };
}

export function createModeInitialState(mode: AppDataMode): ModeScopedState {
  const connectors =
    mode === "mock"
      ? INITIAL_CONNECTORS
      : INITIAL_CONNECTORS.map((connector) => resetConnectorRecord(connector));
  return {
    connectors,
    // 默认仅选择抖音（单平台），用户可在分析界面选择额外平台（每平台+10积分）
    selectedPlatformIds: ["douyin"],
    notificationChannels: INITIAL_NOTIFICATION_CHANNELS,
    results: mode === "mock" ? createSeedResults(connectors) : [],
    savedArtifacts: [],
    watchTasks: [],
    breakdownResults: {},
    apiHealth: createInitialApiHealth(mode),
    endpointHealth: [],
  };
}

export function createInitialState(mode: AppDataMode = DEFAULT_DATA_MODE): AppState {
  return {
    ...createBaseGlobalState(mode),
    ...createModeInitialState(mode),
  };
}

export function pickGlobalState(state: AppState): GlobalState {
  return {
    dataMode: state.dataMode,
    credits: state.credits,
    membershipPlan: state.membershipPlan,
    selectedModel: state.selectedModel,
    transactions: state.transactions,
    monthlySpent: state.monthlySpent,
    totalEarned: state.totalEarned,
    userProfile: state.userProfile,
  };
}

export function pickModeScopedState(state: AppState): ModeScopedState {
  return {
    connectors: state.connectors,
    selectedPlatformIds: state.selectedPlatformIds,
    notificationChannels: state.notificationChannels,
    results: state.results,
    savedArtifacts: state.savedArtifacts,
    watchTasks: state.watchTasks,
    breakdownResults: state.breakdownResults,
    apiHealth: state.apiHealth,
    endpointHealth: state.endpointHealth,
  };
}

/* ================================================================== */
/*  Persistence                                                        */
/* ================================================================== */

export function persistStateSnapshot(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pickGlobalState(state)));
  window.localStorage.setItem(
    MODE_STORAGE_KEY[state.dataMode],
    JSON.stringify(pickModeScopedState(state)),
  );
}

export function normalizeModeState(
  mode: AppDataMode,
  parsed: Partial<ModeScopedState> | undefined,
): ModeScopedState {
  const fallback = createModeInitialState(mode);
  const connectors = Array.isArray(parsed?.connectors)
    ? fallback.connectors.map((item) => {
        const stored = parsed.connectors?.find((connector) => connector.id === item.id);
        return stored ? { ...item, ...stored } : item;
      })
    : fallback.connectors;
  const notificationChannels = Array.isArray(parsed?.notificationChannels)
    ? fallback.notificationChannels.map((item) => {
        const stored = parsed.notificationChannels?.find(
          (channel) => channel.channelId === item.channelId,
        );
        return stored ? { ...item, ...stored } : item;
      })
    : fallback.notificationChannels;

  return {
    connectors,
    // 如果旧用户已保存了多平台选择，保留其选择；新用户默认仅抖音
    selectedPlatformIds: Array.isArray(parsed?.selectedPlatformIds) && parsed.selectedPlatformIds.length > 0
      ? parsed.selectedPlatformIds
      : ["douyin"],
    notificationChannels,
    results: Array.isArray(parsed?.results) ? parsed.results : fallback.results,
    savedArtifacts: Array.isArray(parsed?.savedArtifacts)
      ? parsed.savedArtifacts
      : fallback.savedArtifacts,
    watchTasks: Array.isArray(parsed?.watchTasks) ? parsed.watchTasks : fallback.watchTasks,
    breakdownResults: parsed?.breakdownResults ?? fallback.breakdownResults,
    apiHealth:
      parsed?.apiHealth && typeof parsed.apiHealth === "object"
        ? {
            ...fallback.apiHealth,
            ...parsed.apiHealth,
            services: {
              ...fallback.apiHealth.services,
              ...(parsed.apiHealth.services ?? {}),
            },
          }
        : fallback.apiHealth,
    endpointHealth: Array.isArray(parsed?.endpointHealth)
      ? parsed.endpointHealth
      : fallback.endpointHealth,
  };
}

export function loadModeState(mode: AppDataMode, global: GlobalState): AppState {
  if (typeof window === "undefined") return { ...global, ...createModeInitialState(mode) };

  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY[mode]);
    if (!raw) {
      return {
        ...global,
        ...createModeInitialState(mode),
      };
    }
    const parsed = JSON.parse(raw) as Partial<ModeScopedState>;
    return {
      ...global,
      ...normalizeModeState(mode, parsed),
    };
  } catch {
    return {
      ...global,
      ...createModeInitialState(mode),
    };
  }
}

export function loadPersistedState() {
  if (typeof window === "undefined") return createInitialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw && legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<AppState>;
      const fallback = createInitialState("mock");
      const membershipPlan = parsed.membershipPlan ?? fallback.membershipPlan;
      const selectedModel =
        parsed.selectedModel && canUseModel(membershipPlan, parsed.selectedModel)
          ? parsed.selectedModel
          : getHighestAvailableModel(membershipPlan);
      const migrated: AppState = {
        ...fallback,
        ...parsed,
        dataMode: "mock",
        membershipPlan,
        selectedModel,
        notificationChannels: fallback.notificationChannels,
        apiHealth: fallback.apiHealth,
        endpointHealth: [],
        results: Array.isArray(parsed.results)
          ? parsed.results.map((result) => ({
              ...result,
              dataMode: "mock",
            }))
          : fallback.results,
      };
      persistStateSnapshot(migrated);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    const fallback = createInitialState();
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<GlobalState>;
    const membershipPlan = parsed.membershipPlan ?? fallback.membershipPlan;
    const selectedModel =
      parsed.selectedModel && canUseModel(membershipPlan, parsed.selectedModel)
        ? parsed.selectedModel
        : getHighestAvailableModel(membershipPlan);
    const global: GlobalState = {
      ...pickGlobalState(fallback),
      ...parsed,
      dataMode:
        parsed.dataMode === "live"
          ? "live"
          : parsed.dataMode === "mock"
            ? "mock"
            : DEFAULT_DATA_MODE,
      membershipPlan,
      selectedModel,
      transactions: parsed.transactions ?? fallback.transactions,
    };
    return loadModeState(global.dataMode, global);
  } catch {
    return createInitialState();
  }
}

/* ================================================================== */
/*  Server data merge helpers                                          */
/* ================================================================== */

export function formatConnectorSyncTime(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mergeServerConnectors(connectors: ConnectorRecord[], records: ConnectorServerRecord[]) {
  return connectors.map((item) => {
    const serverRecord = records.find((record) => record.platformId === item.id);
    if (!serverRecord) return item;
    return {
      ...item,
      connected: true,
      authMode: serverRecord.authMode,
      profileUrl: serverRecord.profileUrl ?? item.profileUrl,
      handle: serverRecord.handle ?? item.handle,
      platformUserId: serverRecord.platformUserId ?? item.platformUserId,
      cookieConfigured: serverRecord.cookieConfigured ?? item.cookieConfigured,
      syncStatus: serverRecord.syncStatus ?? item.syncStatus,
      lastVerifiedAt: serverRecord.lastVerifiedAt ?? item.lastVerifiedAt,
      lastSync: formatConnectorSyncTime(serverRecord.lastSyncedAt) ?? item.lastSync ?? "刚刚",
      dataPoints:
        serverRecord.authMode === "cookie"
          ? "已验证连接 · 公开数据 + Cookie 深度画像"
          : "已验证连接 · 公开账号与内容快照",
    };
  });
}

export function mergeServerNotificationChannels(
  channels: NotificationChannelRecord[],
  records: NotificationChannelServerRecord[],
): NotificationChannelRecord[] {
  return channels.map<NotificationChannelRecord>((item) => {
    const serverRecord = records.find((record) => record.channelId === item.channelId);
    if (!serverRecord) return item;
    return {
      ...item,
      name: serverRecord.displayName || item.name,
      connected: serverRecord.connected,
      enabled: serverRecord.enabled,
      destinationLabelMasked: serverRecord.destinationLabelMasked ?? item.destinationLabelMasked,
      subscribedEvents: (serverRecord.subscribedEvents || item.subscribedEvents) as NotificationChannelRecord["subscribedEvents"],
      verifyStatus: serverRecord.verifyStatus,
      lastVerifiedAt: serverRecord.lastVerifiedAt,
      lastDeliveredAt: serverRecord.lastDeliveredAt,
      lastDeliveryStatus: serverRecord.lastDeliveryStatus ?? item.lastDeliveryStatus,
      lastDeliveryError: serverRecord.lastDeliveryError,
      feishuTargetId: serverRecord.feishuTargetId,
      feishuTargetType: serverRecord.feishuTargetType,
      feishuTargetName: serverRecord.feishuTargetName,
      feishuAppMode: serverRecord.feishuAppMode,
    };
  });
}

export function resetNotificationChannelRecord(
  channel: NotificationChannelRecord,
  overrides?: Partial<Pick<NotificationChannelRecord, "enabled">>,
): NotificationChannelRecord {
  return {
    ...channel,
    connected: false,
    enabled: overrides?.enabled ?? true,
    destinationLabelMasked: undefined,
    verifyStatus: "idle",
    lastVerifiedAt: undefined,
    lastDeliveredAt: undefined,
    lastDeliveryStatus: "idle",
    lastDeliveryError: undefined,
    feishuTargetId: undefined,
    feishuTargetType: undefined,
    feishuTargetName: undefined,
    feishuAppMode: undefined,
  };
}

/* ================================================================== */
/*  Artifact & watch task helpers                                      */
/* ================================================================== */

export function syncResultArtifactStatus(
  results: ResultRecord[],
  artifacts: SavedResultArtifactSummary[],
) {
  const artifactByClientId = new Map(
    artifacts
      .filter((artifact) => artifact.clientResultId)
      .map((artifact) => [artifact.clientResultId as string, artifact]),
  );
  return results.map((result) => {
    const artifact = artifactByClientId.get(result.id);
    return artifact
      ? {
          ...result,
          artifactStatus: artifact.artifactStatus,
        }
      : result;
  });
}

export function upsertArtifactSummary(
  current: SavedResultArtifactSummary[],
  next: SavedResultArtifactSummary,
) {
  const filtered = current.filter((item) => item.artifactId !== next.artifactId);
  return [next, ...filtered].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export function upsertWatchTask(current: WatchTaskSummary[], next: WatchTaskSummary) {
  const filtered = current.filter((item) => item.taskId !== next.taskId);
  return [next, ...filtered].sort((left, right) => {
    const leftTime = left.lastRunAt ?? left.nextRunAt ?? "";
    const rightTime = right.lastRunAt ?? right.nextRunAt ?? "";
    return Date.parse(rightTime || "1970-01-01") - Date.parse(leftTime || "1970-01-01");
  });
}

export function resolveResultPlatform(result: ResultRecord): "douyin" | "xiaohongshu" | "kuaishou" {
  const candidate = result.normalizedBrief?.candidatePlatforms.find(
    (platform) => platform === "douyin" || platform === "xiaohongshu" || platform === "kuaishou",
  );
  if (candidate === "douyin" || candidate === "xiaohongshu" || candidate === "kuaishou") {
    return candidate;
  }
  if (result.platform.some((platform) => platform.includes("快手"))) {
    return "kuaishou";
  }
  if (result.platform.some((platform) => platform.includes("小红书"))) {
    return "xiaohongshu";
  }
  return "douyin";
}

export function buildWatchPreset(result: ResultRecord): PredictionWatchPreset {
  const platform = resolveResultPlatform(result);
  const hasLowFollowerEvidence = result.lowFollowerEvidence.length > 0;
  const taskType =
    result.taskIntent === "account_diagnosis"
      ? "account_watch"
      : result.taskIntent === "trend_watch"
        ? "topic_watch"
        : result.verdict === "test_small" && hasLowFollowerEvidence
          ? "validation_watch"
          : result.normalizedBrief?.inputKind === "account"
            ? "account_watch"
            : "topic_watch";

  const priority =
    result.windowStrength === "strong_now"
      ? "high"
      : result.windowStrength === "avoid"
        ? "low"
        : "medium";
  const scheduleTier =
    result.taskIntent === "trend_watch" ||
    result.windowStrength === "observe" ||
    result.windowStrength === "avoid"
      ? "every_72h"
      : "daily";
  const firstContentId = result.supportingContents[0]?.contentId;
  const firstAccount = result.supportingAccounts[0];

  return {
    taskType,
    priority,
    scheduleTier,
    platform,
    queryPayload: {
      query: result.query,
      seedTopic: result.normalizedBrief?.seedTopic ?? result.query,
      topicCluster: result.opportunityTitle,
      inputKind: result.normalizedBrief?.inputKind ?? "prompt",
      keyword: result.normalizedBrief?.seedTopic ?? result.query,
      handle: firstAccount?.handle,
      platformUserId: firstAccount?.accountId,
      uniqueId: platform === "douyin" ? firstAccount?.handle : undefined,
      secUserId:
        platform === "douyin" && firstAccount?.accountId.startsWith("MS4w")
          ? firstAccount.accountId
          : undefined,
      contentId: firstContentId,
      awemeId: platform === "douyin" ? firstContentId : undefined,
      noteId: platform === "xiaohongshu" ? firstContentId : undefined,
      supportingAccountIds: result.supportingAccounts.map((item) => item.accountId),
      supportingContentIds: result.supportingContents.map((item) => item.contentId),
      lowFollowerSampleIds: result.lowFollowerEvidence.map((item) => item.id),
    },
  };
}

/* ================================================================== */
/*  Server hydration helpers                                           */
/* ================================================================== */

export function hydrateServerConnectors(connectors: ConnectorRecord[], records: ConnectorServerRecord[]) {
  const merged = mergeServerConnectors(connectors, records);
  const connectedIds = new Set(records.map((record) => record.platformId));
  return merged.map<ConnectorRecord>((item) =>
    connectedIds.has(item.id)
      ? item
      : {
          ...item,
          connected: false,
          authMode: undefined,
          profileUrl: undefined,
          handle: undefined,
          platformUserId: undefined,
          cookieConfigured: false,
          syncStatus: "idle",
          lastVerifiedAt: undefined,
          lastSync: "未连接",
          dataPoints: item.dataPoints?.startsWith("待接入")
            ? item.dataPoints
            : `待接入 · ${item.name} 平台数据快照`,
        },
  );
}

export function hydrateServerNotificationChannels(
  channels: NotificationChannelRecord[],
  records: NotificationChannelServerRecord[],
): NotificationChannelRecord[] {
  return mergeServerNotificationChannels(channels, records).map<NotificationChannelRecord>((item) => {
    const serverRecord = records.find((record) => record.channelId === item.channelId);
    if (serverRecord) return item;
    return resetNotificationChannelRecord(item, { enabled: true });
  });
}

/* ================================================================== */
/*  Mock data builders                                                 */
/* ================================================================== */

export function createMockArtifactSummary(
  result: ResultRecord,
  watchTask?: WatchTaskSummary,
): SavedResultArtifactSummary {
  const artifactId = result.artifactStatus?.artifactId ?? `mock_artifact_${result.id}`;
  return {
    artifactId,
    clientResultId: result.id,
    createdAt: result.createdAt,
    updatedAt: APP_NOW,
    query: result.query,
    type: result.type,
    platform: result.platform,
    score: result.score,
    scoreLabel: result.scoreLabel,
    verdict: result.verdict,
    windowStrength: result.windowStrength,
    confidenceLabel: result.confidenceLabel,
    opportunityTitle: result.opportunityTitle,
    coreBet: result.coreBet,
    artifactStatus: {
      artifactId,
      savedAt: result.artifactStatus?.savedAt ?? APP_NOW,
      watchTaskId: watchTask?.taskId ?? result.artifactStatus?.watchTaskId,
      watchStatus: watchTask?.status ?? result.artifactStatus?.watchStatus,
      lastWatchRunAt: watchTask?.lastRunAt ?? result.artifactStatus?.lastWatchRunAt,
      lastExecutionStatus:
        watchTask?.lastExecutionStatus ?? result.artifactStatus?.lastExecutionStatus,
    },
  };
}

export function createMockWatchTaskSummary(
  result: ResultRecord,
  artifactId: string,
  watchPreset: PredictionWatchPreset,
): WatchTaskSummary {
  const topicLabel = result.opportunityTitle || result.title || result.query;
  const dimensionMap: Record<string, string[]> = {
    topic_watch: ["赛道热度", "爆款率", "低粉起号机会"],
    account_watch: ["粉丝增长", "互动率", "内容表现"],
    content_watch: ["播放量", "互动率", "分享率"],
    validation_watch: ["可复制性", "低粉爆款信号", "内容结构"],
  };
  return {
    taskId: result.artifactStatus?.watchTaskId ?? `mock_watch_${result.id}`,
    artifactId,
    platform: watchPreset.platform,
    taskType: watchPreset.taskType,
    priority: watchPreset.priority,
    scheduleTier: watchPreset.scheduleTier,
    status: "pending",
    nextRunAt: APP_NOW,
    degradeFlags: [],
    title: `观察：${topicLabel.slice(0, 30)}`,
    target: result.query || topicLabel,
    dimensions: dimensionMap[watchPreset.taskType] ?? ["赛道热度", "爆款率"],
    source: "result",
    createdAt: APP_NOW,
  };
}

/* ================================================================== */
/*  Live result builder                                                */
/* ================================================================== */

export function buildLiveResult(
  request: PredictionRequestDraft,
  modelId: AIModelId,
  connectors: ConnectorRecord[],
  payload: Record<string, unknown>,
  runtimeMeta?: Record<string, unknown>,
  degradeFlags?: string[],
  userProfile?: UserProfile,
  serverTaskPayload?: Record<string, unknown>,
): ResultRecord {
  const baseArtifacts = buildPredictionArtifacts(request, connectors, [], userProfile);
  const live = payload as Partial<ResultRecord>;
  const mergedArtifacts = {
    ...baseArtifacts,
    uiResult: {
      ...baseArtifacts.uiResult,
      ...(live as Partial<typeof baseArtifacts.uiResult>),
    },
    normalizedBrief:
      (live.normalizedBrief as typeof baseArtifacts.normalizedBrief) ??
      baseArtifacts.normalizedBrief,
    platformSnapshots:
      (live.platformSnapshots as typeof baseArtifacts.platformSnapshots) ??
      baseArtifacts.platformSnapshots,
    scoreBreakdown:
      (live.scoreBreakdown as typeof baseArtifacts.scoreBreakdown) ??
      baseArtifacts.scoreBreakdown,
    recommendedLowFollowerSampleIds: Array.isArray(live.recommendedLowFollowerSampleIds)
      ? live.recommendedLowFollowerSampleIds
      : baseArtifacts.recommendedLowFollowerSampleIds,
  };
  const now = new Date().toISOString();
  const record = createResultRecord({
    id:
      typeof live.id === "string" && live.id.trim()
        ? live.id
        : createId("r"),
    dataMode: "live",
    request,
    modelId,
    createdAt: now,
    updatedAt: now,
    artifacts: mergedArtifacts,
    runtimeMeta,
    degradeFlags,
  });
  // 携带 hotSeedCount（由后端 live-predictions 返回）
  if (typeof live.hotSeedCount === "number") {
    (record as ResultRecord).hotSeedCount = live.hotSeedCount;
  }
  // 携带 aiTopicSuggestions（由后端 LLM 生成的爆款选题建议）
  if (Array.isArray(live.aiTopicSuggestions) && live.aiTopicSuggestions.length > 0) {
    (record as ResultRecord).aiTopicSuggestions = live.aiTopicSuggestions;
  }
  // 携带服务端返回的完整 taskPayload（包含 trendOpportunities、overviewOneLiner 等 LLM 生成字段）
  // createResultRecord 内部会用 buildAgentContract 重新生成 taskPayload，会覆盖服务端的字段，
  // 所以这里需要把服务端的 taskPayload 合并进来，确保 LLM 生成的字段不丢失。
  // 合并服务端返回的 taskPayload（包含 trendOpportunities、overviewOneLiner 等 LLM 生成字段）
  const stp = serverTaskPayload ?? (live.taskPayload && typeof live.taskPayload === "object" ? live.taskPayload as unknown as Record<string, unknown> : undefined);
  if (stp) {
    (record as ResultRecord).taskPayload = {
      ...(record as ResultRecord).taskPayload as unknown as Record<string, unknown>,
      ...stp,
    } as unknown as typeof record.taskPayload;
  }
  return record;
}
