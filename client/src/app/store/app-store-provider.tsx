/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_NOW,
  LOW_FOLLOWER_SAMPLES,
  canUseModel,
  normalizePlan,
  createId,
  createResultRecord,
  createBreakdownSampleResultRecord,
  formatTransactionDate,
  generateFollowUpResult,
  getChargedCost,
  getAnalysisInfo,
  getBreakdownActionResult,
  getHomepageAnalysisCost,
  getHighestAvailableModel,
  getModelOption,
  getQueryType,
  getSampleById,
  inferResultScoreLabel,
  type AIModelId,
  type BreakdownActionId,
  type BreakdownGeneratedResult,
  type ConnectorRecord,
  type LowFollowerSample,
  type MembershipPlan,
  type NotificationChannelRecord,
  type ResultRecord,
  type TransactionRecord,
} from "./app-data";
import { getTaskIntentLabel } from "./agent-runtime";
import {
  bindConnector as bindConnectorRequest,
  fetchConnectors as fetchConnectorsRequest,
  syncConnectorProfile as syncConnectorProfileRequest,
  unbindConnector as unbindConnectorRequest,
  verifyConnector as verifyConnectorRequest,
  type ConnectorServerRecord,
} from "../lib/connectors-api";
import {
  ensureArtifactWatch as ensureArtifactWatchRequest,
  fetchResultArtifacts as fetchResultArtifactsRequest,
  fetchWatchTasks as fetchWatchTasksRequest,
  runWatchTask as runWatchTaskRequest,
  saveResultArtifact as saveResultArtifactRequest,
  type SavedResultArtifactSummary,
  type WatchTaskSummary,
} from "../lib/result-artifacts-api";
import {
  fetchEndpointHealth as fetchEndpointHealthRequest,
  runLivePrediction,
  runLivePredictionStream,
  type ProgressEvent,
} from "../lib/live-predictions-api";
import {
  bindNotificationChannel as bindNotificationChannelRequest,
  fetchNotificationChannels as fetchNotificationChannelsRequest,
  testSendNotificationChannel as testSendNotificationChannelRequest,
  unbindNotificationChannel as unbindNotificationChannelRequest,
  verifyNotificationChannel as verifyNotificationChannelRequest,
  type NotificationChannelServerRecord,
} from "../lib/notification-channels-api";
import { API_BACKEND_UNAVAILABLE_MESSAGE, fetchServerBalance, normalizeApiError } from "../lib/api-utils";
import {
  buildPredictionArtifacts,
} from "./prediction-engine";
import type {
  AppDataMode,
  ConnectorBindingInput,
  NotificationBindingInput,
  PredictionWatchPreset,
  PredictionWatchScheduleTier,
  PredictionWatchTaskType,
  PredictionRequestDraft,
  UserProfile,
} from "./prediction-types";
import type {
  ActionResult,
  ApiHealthState,
  AppState,
  EndpointHealthSummary,
  GlobalState,
  ModeScopedState,
} from "./store-types";
import {
  buildLiveResult,
  buildWatchPreset,
  createInitialApiHealth,
  createInitialState,
  createModeInitialState,
  createMockArtifactSummary,
  createMockWatchTaskSummary,
  DEFAULT_DATA_MODE,
  formatConnectorSyncTime,
  hydrateServerConnectors,
  hydrateServerNotificationChannels,
  LEGACY_STORAGE_KEY,
  loadModeState,
  loadPersistedState,
  mergeServerConnectors,
  mergeServerNotificationChannels,
  MODE_STORAGE_KEY,
  persistStateSnapshot,
  pickGlobalState,
  probeApiHealth,
  resetConnectorRecord,
  resetNotificationChannelRecord,
  STORAGE_KEY,
  syncResultArtifactStatus,
  upsertArtifactSummary,
  upsertWatchTask,
} from "./store-helpers";

// Types imported from ./store-types

/** 创作中心单个平台的缓存条目（使用 any 避免跨模块类型冲突） */
export interface CreatorCacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overview: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  works: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fanProfile: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData: any[];
  cachedAt: number; // Unix timestamp ms
}

/** 缓存有效期：30分钟 */
const CREATOR_CACHE_TTL_MS = 30 * 60 * 1000;

interface AppStoreValue {
  state: AppState;
  dataMode: AppDataMode;
  setDataMode: (mode: AppDataMode) => void;
  connectedConnectors: ConnectorRecord[];
  /** 用户选择参与分析的平台ID列表 */
  selectedPlatformIds: string[];
  /** 根据 selectedPlatformIds 过滤出的平台记录 */
  selectedPlatformConnectors: ConnectorRecord[];
  togglePlatformSelection: (platformId: string) => void;
  setSelectedPlatformIds: (ids: string[]) => void;
  notificationChannels: NotificationChannelRecord[];
  featuredSamples: LowFollowerSample[];
  lowFollowerSamples: LowFollowerSample[];
  setSelectedModel: (modelId: AIModelId) => boolean;
  refreshApiHealth: (force?: boolean) => Promise<ApiHealthState>;
  startAnalysis: (request: PredictionRequestDraft, dryRun?: boolean, onProgress?: (event: ProgressEvent) => void) => Promise<ActionResult>;
  addResultFollowUp: (resultId: string, prompt: string, cost: number) => ActionResult;
  removeResult: (resultId: string) => void;
  connectConnector: (connectorId: string, binding: ConnectorBindingInput) => Promise<void>;
  disconnectConnector: (connectorId: string) => Promise<void>;
  syncConnectorProfile: (connectorId: string) => Promise<void>;
  verifyNotificationChannel: (
    channelId: string,
    binding: NotificationBindingInput,
  ) => Promise<{ destinationLabelMasked?: string; responseSummary?: string }>;
  connectNotificationChannel: (
    channelId: string,
    binding: NotificationBindingInput,
  ) => Promise<void>;
  disconnectNotificationChannel: (channelId: string) => Promise<void>;
  testNotificationChannel: (
    channelId: string,
    binding?: NotificationBindingInput,
  ) => Promise<{ responseSummary?: string }>;
  topUpCredits: (credits: number, price: string) => void;
  upgradeMembership: (plan: MembershipPlan) => void;
  consumeBreakdownAction: (
    sampleId: string,
    actionId: BreakdownActionId,
    cost: number,
  ) => ActionResult;
  savedArtifacts: SavedResultArtifactSummary[];
  watchTasks: WatchTaskSummary[];
  saveResultArtifact: (
    result: ResultRecord,
    options?: { createWatch?: boolean },
  ) => Promise<{ artifactId: string; watchTaskId?: string }>;
  ensureResultWatch: (result: ResultRecord) => Promise<{ artifactId: string; watchTaskId: string }>;
  runResultWatchTask: (taskId: string) => Promise<void>;
  pauseWatchTask: (taskId: string) => void;
  resumeWatchTask: (taskId: string) => void;
  deleteWatchTask: (taskId: string) => void;
  updateWatchTaskSchedule: (taskId: string, scheduleTier: PredictionWatchScheduleTier) => void;
  createMonitorTask: (input: {
    taskType: PredictionWatchTaskType;
    platform: "douyin" | "xiaohongshu" | "kuaishou";
    title: string;
    target: string;
    dimensions: string[];
    scheduleTier: PredictionWatchScheduleTier;
  }) => ActionResult;
  getResultById: (resultId: string) => ResultRecord | null;
  getSampleById: (sampleId: string) => LowFollowerSample | null;
  getBreakdownResults: (sampleId: string) => BreakdownGeneratedResult[];
  /** 方案B：将 LowFollowerSample 转换为 ResultRecord 并存入 store */
  createBreakdownSampleResult: (sampleId: string) => ActionResult;
  /** 从 tRPC 返回的真实低粉爆款数据创建拆解结果 */
  createBreakdownFromLiveItem: (item: {
    id: string;
    title: string;
    platform: string;
    contentForm: string | null;
    coverUrl: string | null;
    contentUrl: string | null;
    authorName: string;
    followerCount: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    saveCount: number;
    viralScore: number;
    trackTags: string[];
    burstReasons: string[];
    suggestion: string | null;
    publishedAt: string | null;
    newbieFriendly: number;
  }) => ActionResult;
  resetAppState: () => void;
  updateUserProfile: (patch: Partial<UserProfile>) => void;
  inferProfileFromConnector: (connectorId: string) => void;
  spendToolCredits: (cost: number, toolName: string) => ActionResult;
  /** 从后端同步最新积分和会员状态到本地 state */
  syncBalance: () => Promise<void>;
  /** 创作中心缓存：读取指定平台的缓存数据（30min 内有效） */
  getCreatorCache: (platformId: string) => CreatorCacheEntry | null;
  /** 创作中心缓存：写入指定平台的数据 */
  setCreatorCache: (platformId: string, data: CreatorCacheEntry) => void;
  /** 创作中心缓存：清除指定平台的缓存（强制刷新时调用） */
  clearCreatorCache: (platformId: string) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadPersistedState());

  // 创作中心数据缓存（useRef 避免触发全局重渲染）
  const creatorCacheRef = useRef<Record<string, CreatorCacheEntry>>({});

  const getCreatorCache = (platformId: string): CreatorCacheEntry | null => {
    const entry = creatorCacheRef.current[platformId];
    if (!entry) return null;
    const age = Date.now() - entry.cachedAt;
    if (age > CREATOR_CACHE_TTL_MS) {
      delete creatorCacheRef.current[platformId];
      return null;
    }
    return entry;
  };

  const setCreatorCache = (platformId: string, data: CreatorCacheEntry) => {
    creatorCacheRef.current[platformId] = { ...data, cachedAt: Date.now() };
  };

  const clearCreatorCache = (platformId: string) => {
    delete creatorCacheRef.current[platformId];
  };

  const refreshApiHealth = async (force = false): Promise<ApiHealthState> => {
    if (state.dataMode !== "live") {
      return createInitialApiHealth("mock");
    }
    if (!force && state.apiHealth.status === "ready") {
      return state.apiHealth;
    }
    setState((current) =>
      current.dataMode !== "live"
        ? current
        : {
            ...current,
            apiHealth: {
              ...current.apiHealth,
              status: "checking",
              message: undefined,
            },
            },
    );
    const next = await probeApiHealth();
    setState((current) =>
      current.dataMode !== "live"
        ? current
        : {
            ...current,
            apiHealth: next,
          },
    );
    return next;
  };

  const ensureLiveBackendReady = async (
    service: "livePrediction" | "notifications" | null = null,
  ) => {
    if (state.dataMode !== "live") return;
    const health =
      state.apiHealth.status === "ready" || state.apiHealth.status === "unavailable"
        ? state.apiHealth
        : await refreshApiHealth();
    if (health.status !== "ready") {
      throw new Error(health.message || API_BACKEND_UNAVAILABLE_MESSAGE);
    }
    if (service && !health.services[service]) {
      throw new Error(
        service === "livePrediction"
          ? "真实数据后端已连接，但实时分析服务当前不可用。"
          : "真实数据后端已连接，但通知服务当前不可用。",
      );
    }
  };

  useEffect(() => {
    persistStateSnapshot(state);
  }, [state]);

  useEffect(() => {
    if (state.dataMode !== "live") return undefined;
    let active = true;
    void probeApiHealth()
      .then((health) => {
        if (!active) return;
        setState((current) =>
          current.dataMode !== "live"
            ? current
            : {
                ...current,
                apiHealth: health,
              },
        );
        if (health.status !== "ready") return;
        return Promise.all([
          fetchConnectorsRequest().catch(() => ({ items: [] as ConnectorServerRecord[] })),
          fetchNotificationChannelsRequest().catch(() => ({
            items: [] as NotificationChannelServerRecord[],
          })),
          fetchResultArtifactsRequest().catch(() => ({ items: [] as SavedResultArtifactSummary[] })),
          fetchWatchTasksRequest().catch(() => ({ items: [] as WatchTaskSummary[] })),
          fetchEndpointHealthRequest().catch(() => ({ items: [] as EndpointHealthSummary[] })),
          fetchServerBalance().catch(() => null),
        ]).then(
          ([
            connectorPayload,
            notificationPayload,
            artifactPayload,
            watchTaskPayload,
            healthPayload,
            balancePayload,
          ]) => {
            if (!active) return;
            setState((current) => {
              if (current.dataMode !== "live") return current;
              const results = syncResultArtifactStatus(current.results, artifactPayload.items);
              return {
                ...current,
                // 同步后端真实积分和会员状态
                ...(balancePayload ? {
                  credits: balancePayload.credits,
                  membershipPlan: (balancePayload.membershipPlan || "free") as MembershipPlan,
                } : {}),
                connectors: hydrateServerConnectors(
                  createModeInitialState("live").connectors,
                  connectorPayload.items,
                ),
                notificationChannels: hydrateServerNotificationChannels(
                  createModeInitialState("live").notificationChannels,
                  notificationPayload.items,
                ),
                results,
                savedArtifacts: artifactPayload.items,
                watchTasks: watchTaskPayload.items,
                endpointHealth: healthPayload.items,
              };
            });
          },
        );
      });
    return () => {
      active = false;
    };
  }, [state.dataMode]);

  const connectedConnectors = state.connectors.filter((item) => item.connected);
  const selectedPlatformConnectors = state.connectors.filter((item) =>
    state.selectedPlatformIds.includes(item.id),
  );
  const togglePlatformSelection = (platformId: string) => {
    setState((prev) => {
      const ids = prev.selectedPlatformIds.includes(platformId)
        ? prev.selectedPlatformIds.filter((id) => id !== platformId)
        : [...prev.selectedPlatformIds, platformId];
      const next = { ...prev, selectedPlatformIds: ids };
      persistStateSnapshot(next);
      return next;
    });
  };
  const setSelectedPlatformIds = (ids: string[]) => {
    setState((prev) => {
      const next = { ...prev, selectedPlatformIds: ids };
      persistStateSnapshot(next);
      return next;
    });
  };
  const featuredSamples =
    state.dataMode === "mock"
      ? LOW_FOLLOWER_SAMPLES.filter((item) => item.featured)
      : [];

  const addTransaction = (
    current: AppState,
    record: Omit<TransactionRecord, "id" | "date">,
    dateIso: string,
  ) => {
    const transaction: TransactionRecord = {
      id: createId("tx"),
      date: formatTransactionDate(dateIso),
      ...record,
    };

    return [transaction, ...current.transactions].slice(0, 20);
  };

  const setSelectedModel = (modelId: AIModelId) => {
    if (!canUseModel(state.membershipPlan, modelId)) {
      return false;
    }

    setState((current) => ({
      ...current,
      selectedModel: modelId,
    }));
    return true;
  };

  const setDataMode = (mode: AppDataMode) => {
    if (mode === state.dataMode) return;
    setState((current) => {
      persistStateSnapshot(current);
      const nextGlobal: GlobalState = {
        ...pickGlobalState(current),
        dataMode: mode,
      };
      return loadModeState(mode, nextGlobal);
    });
  };

  const startAnalysis = async (request: PredictionRequestDraft, dryRun?: boolean, onProgress?: (event: ProgressEvent) => void): Promise<ActionResult> => {
    const analysisInfo = getAnalysisInfo(request.prompt);
    const chargedCost = getHomepageAnalysisCost(
      analysisInfo.cost,
      state.selectedModel,
      selectedPlatformConnectors.length,
    );
    const modelName = getModelOption(state.selectedModel).name;
    const now = new Date().toISOString();

    // live 模式下先从后端刷新积分，确保判断基于最新数据
    let currentCredits = state.credits;
    if (state.dataMode === "live") {
      const serverBalance = await fetchServerBalance();
      if (serverBalance) {
        currentCredits = serverBalance.credits;
        setState((prev) => ({ ...prev, credits: serverBalance.credits, membershipPlan: (serverBalance.membershipPlan || "free") as MembershipPlan }));
      }
    }

    if (currentCredits < chargedCost) {
      return {
        ok: false,
        shortfall: chargedCost - currentCredits,
      };
    }

    // dryRun 模式：只做积分校验，不实际调用后端
    if (dryRun) {
      return { ok: true, resultId: "", cost: chargedCost };
    }

    try {
      let nextResult: ResultRecord;
      if (state.dataMode === "live") {
        await ensureLiveBackendReady("livePrediction");
        const payload = onProgress
          ? await runLivePredictionStream(request, onProgress)
          : await runLivePrediction(request);
        nextResult = buildLiveResult(
          request,
          state.selectedModel,
          state.connectors,
          payload.result,
          (payload.run?.runtimeMeta ?? payload.runtimeMeta) as Record<string, unknown> | undefined,
          payload.run?.degradeFlags ?? payload.degradeFlags,
          state.userProfile,
          (payload.result as Record<string, unknown>)?.taskPayload as Record<string, unknown> | undefined,
        );
      } else {
        const artifacts = buildPredictionArtifacts(
          request,
          state.connectors,
          LOW_FOLLOWER_SAMPLES,
          state.userProfile,
        );
        nextResult = createResultRecord({
          id: createId("r"),
          dataMode: "mock",
          request,
          modelId: state.selectedModel,
          createdAt: now,
          updatedAt: now,
          artifacts,
        });
        // mock 模式下也生成一个合理的 hotSeedCount
        nextResult.hotSeedCount = Math.floor(Math.random() * 30) + 20;
      }

      setState((current) => ({
        ...current,
        credits: current.credits - chargedCost,
        monthlySpent: current.monthlySpent + chargedCost,
        results: [{ ...nextResult, createdAt: now, updatedAt: now }, ...current.results],
        transactions: addTransaction(
          current,
          {
            type: "deduct",
            desc: `${analysisInfo.type} · ${modelName}`,
            amount: -chargedCost,
          },
          now,
        ),
      }));

      return {
        ok: true,
        resultId: nextResult.id,
        cost: chargedCost,
      };
    } catch (error) {
      return {
        ok: false,
        shortfall: 0,
        error: normalizeApiError(error, "真实数据分析失败，请稍后重试。"),
      };
    }
  };

  const addResultFollowUp = (
    resultId: string,
    prompt: string,
    cost: number,
  ): ActionResult => {
    const chargedCost = getChargedCost(cost, state.selectedModel);
    const modelName = getModelOption(state.selectedModel).name;
    const now = new Date().toISOString();

    if (state.credits < chargedCost) {
      return { ok: false, shortfall: chargedCost - state.credits };
    }

    const target = state.results.find((item) => item.id === resultId);
    if (!target) {
      return { ok: false, shortfall: chargedCost };
    }

    // live 模式下，生成一个占位结果，实际内容由 CozeEditorDrawer 通过 SSE 流式生成
    const isLive = state.dataMode === "live";
    const followUp = {
      id: createId("fu"),
      label: prompt,
      cost: chargedCost,
      result: isLive
        ? `正在基于「${target.query}」生成「${prompt.slice(0, 20)}」的深度分析……点击查看完整报告。`
        : generateFollowUpResult(target.query, prompt, target.taskIntent),
      createdAt: APP_NOW,
      // live 模式标记，前端用于判断是否走 SSE 流式
      liveStreamPending: isLive,
    };

    setState((current) => ({
      ...current,
      credits: current.credits - chargedCost,
      monthlySpent: current.monthlySpent + chargedCost,
      results: current.results.map((item) =>
        item.id === resultId
          ? {
              ...item,
              updatedAt: now,
              followUps: [...item.followUps, followUp],
            }
          : item,
      ),
      transactions: addTransaction(
        current,
          {
            type: "deduct",
            desc: `${getTaskIntentLabel(target.taskIntent)}深挖：${prompt.slice(0, 12)} · ${modelName}`,
            amount: -chargedCost,
          },
          now,
        ),
      }));

    return { ok: true, resultId, cost: chargedCost };
  };

  const removeResult = (resultId: string) => {
    setState((current) => ({
      ...current,
      results: current.results.filter((item) => item.id !== resultId),
    }));
  };

  const saveResultArtifact = async (
    result: ResultRecord,
    options?: { createWatch?: boolean },
  ) => {
    const target = state.results.find((item) => item.id === result.id) ?? result;
    const watchPreset = buildWatchPreset(target);
    if (state.dataMode === "mock") {
      const existingArtifact = state.savedArtifacts.find(
        (item) => item.clientResultId === target.id || item.artifactId === target.artifactStatus?.artifactId,
      );
      const baseTarget = existingArtifact
        ? { ...target, artifactStatus: existingArtifact.artifactStatus }
        : target;
      const watchTask =
        options?.createWatch
          ? state.watchTasks.find((item) => item.taskId === baseTarget.artifactStatus?.watchTaskId) ??
            createMockWatchTaskSummary(
              baseTarget,
              baseTarget.artifactStatus?.artifactId ?? `mock_artifact_${baseTarget.id}`,
              watchPreset,
            )
          : undefined;
      const artifact = createMockArtifactSummary(baseTarget, watchTask);
      setState((current) => ({
        ...current,
        results: current.results.map((item) =>
          item.id === target.id
            ? {
                ...item,
                artifactStatus: artifact.artifactStatus,
              }
            : item,
        ),
        savedArtifacts: upsertArtifactSummary(current.savedArtifacts, artifact),
        watchTasks: watchTask ? upsertWatchTask(current.watchTasks, watchTask) : current.watchTasks,
      }));
      return {
        artifactId: artifact.artifactId,
        watchTaskId: watchTask?.taskId,
      };
    }

    await ensureLiveBackendReady();
    const response = await saveResultArtifactRequest({
      snapshot: target as unknown as Record<string, unknown>,
      createWatch: options?.createWatch ?? false,
      watchPreset,
    });

    setState((current) => ({
      ...current,
      results: current.results.map((item) =>
        item.id === target.id
          ? {
              ...item,
              artifactStatus: response.artifact.artifactStatus,
            }
          : item,
      ),
      savedArtifacts: upsertArtifactSummary(current.savedArtifacts, response.artifact),
      watchTasks: response.watchTask
        ? upsertWatchTask(current.watchTasks, response.watchTask)
        : current.watchTasks,
    }));

    return {
      artifactId: response.artifact.artifactId,
      watchTaskId: response.watchTask?.taskId,
    };
  };

  const ensureResultWatch = async (result: ResultRecord) => {
    const target = state.results.find((item) => item.id === result.id) ?? result;
    if (state.dataMode === "mock") {
      const artifactId =
        target.artifactStatus?.artifactId ??
        (await saveResultArtifact(target)).artifactId;
      const existingWatch = state.watchTasks.find(
        (item) => item.taskId === target.artifactStatus?.watchTaskId,
      );
      const watchTask = existingWatch ?? createMockWatchTaskSummary(target, artifactId, buildWatchPreset(target));
      setState((current) => ({
        ...current,
        results: current.results.map((item) =>
          item.id === target.id
            ? {
                ...item,
                artifactStatus: {
                  artifactId,
                  savedAt: item.artifactStatus?.savedAt ?? APP_NOW,
                  watchTaskId: watchTask.taskId,
                  watchStatus: watchTask.status,
                  lastWatchRunAt: watchTask.lastRunAt,
                  lastExecutionStatus: watchTask.lastExecutionStatus,
                },
              }
            : item,
        ),
        savedArtifacts: current.savedArtifacts.map((artifact) =>
          artifact.artifactId === artifactId
            ? {
                ...artifact,
                artifactStatus: {
                  ...artifact.artifactStatus,
                  watchTaskId: watchTask.taskId,
                  watchStatus: watchTask.status,
                  lastWatchRunAt: watchTask.lastRunAt,
                  lastExecutionStatus: watchTask.lastExecutionStatus,
                },
              }
            : artifact,
        ),
        watchTasks: upsertWatchTask(current.watchTasks, watchTask),
      }));
      return {
        artifactId,
        watchTaskId: watchTask.taskId,
      };
    }

    const artifactId =
      target.artifactStatus?.artifactId ??
      (await saveResultArtifact(target)).artifactId;
    const watchPreset = buildWatchPreset(target);
    await ensureLiveBackendReady();
    const response = await ensureArtifactWatchRequest(artifactId, watchPreset);

    setState((current) => ({
      ...current,
      results: current.results.map((item) =>
        item.id === target.id
          ? {
              ...item,
              artifactStatus: {
                artifactId,
                savedAt: item.artifactStatus?.savedAt ?? APP_NOW,
                watchTaskId: response.watchTask.taskId,
                watchStatus: response.watchTask.status,
                lastWatchRunAt: response.watchTask.lastRunAt,
                lastExecutionStatus: response.watchTask.lastExecutionStatus,
              },
            }
          : item,
      ),
      savedArtifacts: current.savedArtifacts.map((artifact) =>
        artifact.artifactId === artifactId
          ? {
              ...artifact,
              artifactStatus: {
                ...artifact.artifactStatus,
                watchTaskId: response.watchTask.taskId,
                watchStatus: response.watchTask.status,
                lastWatchRunAt: response.watchTask.lastRunAt,
                lastExecutionStatus: response.watchTask.lastExecutionStatus,
              },
            }
          : artifact,
      ),
      watchTasks: upsertWatchTask(current.watchTasks, response.watchTask),
    }));

    return {
      artifactId,
      watchTaskId: response.watchTask.taskId,
    };
  };

  const runResultWatchTask = async (taskId: string) => {
    if (state.dataMode === "mock") {
      const currentTask = state.watchTasks.find((item) => item.taskId === taskId);
      if (!currentTask) return;
      const now = new Date().toISOString();
      const nextRunAt = new Date(
        Date.parse(now) + (currentTask.scheduleTier === "daily" ? 24 : 72) * 60 * 60 * 1000,
      ).toISOString();
      const lastExecutionStatus =
        currentTask.taskType === "validation_watch" ? "partial_success" : "success";
      const watchTask: WatchTaskSummary = {
        ...currentTask,
        status: "completed",
        lastRunAt: now,
        nextRunAt,
        lastExecutionStatus,
        resultSnapshotRef: `mock_run_${createId("run")}`,
        degradeFlags: lastExecutionStatus === "partial_success" ? ["optional_endpoint_failed"] : [],
        degradeReason:
          lastExecutionStatus === "partial_success"
            ? "演示模式下未调用真实接口，已按可用的本地样本完成部分复查。"
            : undefined,
      };
      setState((current) => ({
        ...current,
        watchTasks: upsertWatchTask(current.watchTasks, watchTask),
        savedArtifacts: current.savedArtifacts.map((artifact) =>
          artifact.artifactId === watchTask.artifactId
            ? {
                ...artifact,
                artifactStatus: {
                  ...artifact.artifactStatus,
                  watchTaskId: watchTask.taskId,
                  watchStatus: watchTask.status,
                  lastWatchRunAt: watchTask.lastRunAt,
                  lastExecutionStatus: watchTask.lastExecutionStatus,
                },
              }
            : artifact,
        ),
        results: current.results.map((result) =>
          result.artifactStatus?.artifactId === watchTask.artifactId
            ? {
                ...result,
                artifactStatus: {
                  ...result.artifactStatus,
                  watchTaskId: watchTask.taskId,
                  watchStatus: watchTask.status,
                  lastWatchRunAt: watchTask.lastRunAt,
                  lastExecutionStatus: watchTask.lastExecutionStatus,
                },
              }
            : result,
        ),
      }));
      return;
    }

    await ensureLiveBackendReady();
    const response = await runWatchTaskRequest(taskId);
    const watchTask = response.watchTask;

    setState((current) => ({
      ...current,
      watchTasks: upsertWatchTask(current.watchTasks, watchTask),
      savedArtifacts: current.savedArtifacts.map((artifact) =>
        artifact.artifactId === watchTask.artifactId
          ? {
              ...artifact,
              artifactStatus: {
                ...artifact.artifactStatus,
                watchTaskId: watchTask.taskId,
                watchStatus: watchTask.status,
                lastWatchRunAt: watchTask.lastRunAt,
                lastExecutionStatus: watchTask.lastExecutionStatus,
              },
            }
          : artifact,
      ),
      results: current.results.map((result) =>
        result.artifactStatus?.artifactId === watchTask.artifactId
          ? {
              ...result,
              artifactStatus: {
                ...result.artifactStatus,
                watchTaskId: watchTask.taskId,
                watchStatus: watchTask.status,
                lastWatchRunAt: watchTask.lastRunAt,
                lastExecutionStatus: watchTask.lastExecutionStatus,
              },
            }
          : result,
      ),
    }));
  };

  const connectConnector = async (
    connectorId: string,
    binding: ConnectorBindingInput,
  ) => {
    if (state.dataMode === "mock") {
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        connectors: current.connectors.map((connector) =>
          connector.id === connectorId
            ? {
                ...connector,
                connected: true,
                authMode: binding.authMode,
                profileUrl: binding.profileUrl?.trim() || connector.profileUrl,
                handle: binding.handle?.trim() || connector.handle,
                platformUserId: binding.platformUserId?.trim() || connector.platformUserId,
                cookieConfigured: binding.authMode === "cookie",
                syncStatus: "verified",
                lastVerifiedAt: now,
                lastSync: formatConnectorSyncTime(now) ?? "刚刚",
                dataPoints:
                  binding.authMode === "cookie"
                    ? "演示模式 · 公开数据 + Cookie 深度画像"
                    : "演示模式 · 公开账号与内容快照",
              }
            : connector,
        ),
      }));
      return;
    }

    await ensureLiveBackendReady();
    await verifyConnectorRequest(connectorId, binding);
    const response = await bindConnectorRequest(connectorId, binding);
    setState((current) => ({
      ...current,
      connectors: mergeServerConnectors(current.connectors, [response.item]),
    }));
  };

  const disconnectConnector = async (connectorId: string) => {
    if (state.dataMode === "mock") {
      setState((current) => ({
        ...current,
        connectors: current.connectors.map((connector) =>
          connector.id === connectorId ? resetConnectorRecord(connector) : connector,
        ),
      }));
      return;
    }

    await ensureLiveBackendReady();
    await unbindConnectorRequest(connectorId);
    setState((current) => ({
      ...current,
      connectors: current.connectors.map((connector) =>
        connector.id === connectorId ? resetConnectorRecord(connector) : connector,
      ),
    }));
  };

  const syncConnectorProfile = async (connectorId: string) => {
    if (state.dataMode === "mock") {
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        connectors: current.connectors.map((connector) =>
          connector.id === connectorId
            ? {
                ...connector,
                syncStatus: connector.connected ? "verified" : "idle",
                lastVerifiedAt: connector.connected ? now : connector.lastVerifiedAt,
                lastSync: connector.connected ? formatConnectorSyncTime(now) ?? "刚刚" : "未连接",
              }
            : connector,
        ),
      }));
      return;
    }

    await ensureLiveBackendReady();
    const response = await syncConnectorProfileRequest(connectorId);
    setState((current) => ({
      ...current,
      connectors: mergeServerConnectors(current.connectors, [response.item]),
    }));
  };

  const verifyNotificationChannel = async (
    channelId: string,
    binding: NotificationBindingInput,
  ) => {
    if (state.dataMode === "mock") {
      return {
        destinationLabelMasked: binding.webhookUrl?.replace(/^https?:\/\//, "").slice(0, 28),
        responseSummary: "演示模式下已模拟验证通知 webhook。",
      };
    }
    await ensureLiveBackendReady("notifications");
    const response = await verifyNotificationChannelRequest(channelId, binding);
    return {
      destinationLabelMasked: response.destinationLabelMasked,
      responseSummary: response.responseSummary,
    };
  };

  const connectNotificationChannel = async (
    channelId: string,
    binding: NotificationBindingInput,
  ) => {
    if (state.dataMode === "mock") {
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        notificationChannels: current.notificationChannels.map<NotificationChannelRecord>((channel) =>
          channel.channelId === channelId
            ? {
                ...channel,
                name: binding.displayName?.trim() || channel.name,
                connected: true,
                enabled: binding.enabled ?? true,
                destinationLabelMasked:
                  binding.webhookUrl?.replace(/^https?:\/\//, "").slice(0, 28) ||
                  channel.destinationLabelMasked,
                subscribedEvents: binding.subscribedEvents,
                verifyStatus: "verified",
                lastVerifiedAt: now,
              }
            : channel,
        ),
      }));
      return;
    }
    await ensureLiveBackendReady("notifications");
    const response = await bindNotificationChannelRequest(channelId, binding);
    setState((current) => ({
      ...current,
      notificationChannels: mergeServerNotificationChannels(
        current.notificationChannels,
        [response.item],
      ),
    }));
  };

  const disconnectNotificationChannel = async (channelId: string) => {
    if (state.dataMode === "mock") {
      setState((current) => ({
        ...current,
        notificationChannels: current.notificationChannels.map<NotificationChannelRecord>((channel) =>
          channel.channelId === channelId ? resetNotificationChannelRecord(channel) : channel,
        ),
      }));
      return;
    }
    await ensureLiveBackendReady("notifications");
    await unbindNotificationChannelRequest(channelId);
    setState((current) => ({
      ...current,
      notificationChannels: current.notificationChannels.map<NotificationChannelRecord>((channel) =>
        channel.channelId === channelId ? resetNotificationChannelRecord(channel) : channel,
      ),
    }));
  };

  const testNotificationChannel = async (
    channelId: string,
    binding?: NotificationBindingInput,
  ) => {
    if (state.dataMode === "mock") {
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        notificationChannels: current.notificationChannels.map<NotificationChannelRecord>((channel) =>
          channel.channelId === channelId
            ? {
                ...channel,
                lastDeliveredAt: now,
                lastDeliveryStatus: "success",
                lastDeliveryError: undefined,
              }
            : channel,
        ),
      }));
      return {
        responseSummary: "演示模式下已模拟发送测试通知。",
      };
    }
    await ensureLiveBackendReady("notifications");
    const response = await testSendNotificationChannelRequest(channelId, binding);
    if (!binding) {
      const refreshed = await fetchNotificationChannelsRequest();
      setState((current) => ({
        ...current,
        notificationChannels: hydrateServerNotificationChannels(
          current.notificationChannels,
          refreshed.items,
        ),
      }));
    }
    return {
      responseSummary: response.responseSummary,
    };
  };

  const topUpCredits = (credits: number, price: string) => {
    setState((current) => ({
      ...current,
      credits: current.credits + credits,
      totalEarned: current.totalEarned + credits,
      transactions: addTransaction(
        current,
        {
          type: "earn",
          desc: `充值 ${credits} 积分包`,
          amount: credits,
        },
        APP_NOW,
      ),
    }));

    void price;
  };

  const upgradeMembership = (plan: MembershipPlan) => {
    setState((current) => ({
      ...current,
      membershipPlan: plan,
      selectedModel: canUseModel(plan, current.selectedModel)
        ? current.selectedModel
        : getHighestAvailableModel(plan),
      transactions: addTransaction(
        current,
        {
          type: "earn",
          desc: normalizePlan(plan) === "pro" ? "升级 Pro 会员" : "升级 Plus 会员",
          amount: 0,
        },
        APP_NOW,
      ),
    }));
  };

  const consumeBreakdownAction = (
    sampleId: string,
    actionId: BreakdownActionId,
    cost: number,
  ): ActionResult => {
    if (state.dataMode === "live") {
      return {
        ok: false,
        shortfall: 0,
        error: "真实数据模式下，低粉爆款拆解暂未接入真实数据。",
      };
    }
    const chargedCost = getChargedCost(cost, state.selectedModel);
    const modelName = getModelOption(state.selectedModel).name;

    if (state.credits < chargedCost) {
      return { ok: false, shortfall: chargedCost - state.credits };
    }

    const sample = getSampleById(sampleId);
    if (!sample) {
      return { ok: false, shortfall: chargedCost };
    }

    const resultPayload = getBreakdownActionResult(sample, actionId);
    const result: BreakdownGeneratedResult = {
      id: createId("bd"),
      actionId,
      title: resultPayload.title,
      items: resultPayload.items,
      cost: chargedCost,
      createdAt: APP_NOW,
    };

    setState((current) => ({
      ...current,
      credits: current.credits - chargedCost,
      monthlySpent: current.monthlySpent + chargedCost,
      breakdownResults: {
        ...current.breakdownResults,
        [sampleId]: [...(current.breakdownResults[sampleId] ?? []), result],
      },
      transactions: addTransaction(
        current,
        {
          type: "deduct",
          desc: `${sample.title.slice(0, 10)} · ${result.title.replace("已生成：", "")} · ${modelName}`,
          amount: -chargedCost,
        },
        APP_NOW,
      ),
    }));

    return { ok: true, resultId: sampleId, cost: chargedCost };
  };

  const getResultById = (resultId: string) =>
    state.results.find((item) => item.id === resultId) ?? null;

  const resolveSampleById = (sampleId: string) =>
    state.dataMode === "mock" ? getSampleById(sampleId) : null;

  const getBreakdownResults = (sampleId: string) =>
    state.dataMode === "mock" ? state.breakdownResults[sampleId] ?? [] : [];

  /**
   * 方案B：将 LowFollowerSample 转换为 ResultRecord 并存入 store
   * 如果已经存在该样本的结果，直接返回已有的 resultId
   */
  const createBreakdownSampleResult = (sampleId: string): ActionResult => {
    // 检查是否已经存在该样本的结果（避免重复创建）
    const existingResult = state.results.find(
      (r) => r.taskPayload?.kind === "breakdown_sample" && r.taskPayload.sampleId === sampleId
    );
    if (existingResult) {
      return { ok: true, resultId: existingResult.id, cost: 0 };
    }

    const sample = getSampleById(sampleId);
    if (!sample) {
      return { ok: false, shortfall: 0, error: `样本不存在: ${sampleId}` };
    }

    // 找到相似样本（同赛道，排除自身）
    const similarSamples = LOW_FOLLOWER_SAMPLES.filter(
      (s) =>
        s.id !== sampleId &&
        s.trackTags.some((tag) => sample.trackTags.includes(tag))
    ).slice(0, 3);

    const resultId = createId("bds");
    const now = new Date().toISOString();

    const record = createBreakdownSampleResultRecord(sample, similarSamples, {
      id: resultId,
      dataMode: state.dataMode,
      modelId: state.selectedModel,
      createdAt: now,
    });

    setState((current) => ({
      ...current,
      results: [record, ...current.results],
    }));

    return { ok: true, resultId, cost: 0 };
  };

  /**
   * 从 tRPC 返回的真实低粉爆款数据创建拆解结果
   * 将 API 返回的 LowFollowerItem 转换为 LowFollowerSample 格式，再复用工厂函数
   */
  const createBreakdownFromLiveItem = (item: {
    id: string;
    title: string;
    platform: string;
    contentForm: string | null;
    coverUrl: string | null;
    contentUrl: string | null;
    authorName: string;
    followerCount: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    saveCount: number;
    viralScore: number;
    trackTags: string[];
    burstReasons: string[];
    suggestion: string | null;
    publishedAt: string | null;
    newbieFriendly: number;
  }): ActionResult => {
    // 检查是否已经存在该样本的结果
    const existingResult = state.results.find(
      (r) => r.taskPayload?.kind === "breakdown_sample" && r.taskPayload.sampleId === item.id
    );
    if (existingResult) {
      return { ok: true, resultId: existingResult.id, cost: 0 };
    }

    // 将 tRPC 返回的数据转换为 LowFollowerSample 格式
    const fansLabel = item.followerCount >= 10000
      ? `${(item.followerCount / 10000).toFixed(1)}万粉`
      : item.followerCount >= 1000
        ? `${(item.followerCount / 1000).toFixed(1)}k粉`
        : `${item.followerCount}粉`;
    const playCount = item.viewCount >= 10000
      ? `${(item.viewCount / 10000).toFixed(1)}万`
      : `${item.viewCount}`;

    const sample: LowFollowerSample = {
      id: item.id,
      platform: item.platform === "douyin" ? "抖音" : item.platform === "xiaohongshu" ? "小红书" : item.platform === "kuaishou" ? "快手" : item.platform === "bilibili" ? "B站" : item.platform,
      contentForm: item.contentForm ?? "竖屏视频",
      img: item.coverUrl ?? "",
      anomaly: item.viralScore / 10,
      fansLabel,
      fansCount: item.followerCount,
      title: item.title,
      account: `@${item.authorName}`,
      trackTags: item.trackTags.length > 0 ? item.trackTags : ["内容"],
      playCount,
      burstReasons: item.burstReasons.length > 0 ? item.burstReasons : ["低粉高互动", "内容切口精准"],
      suggestion: item.suggestion ?? "适合借鉴内容结构和表达方式",
      publishedAt: item.publishedAt ?? new Date().toISOString(),
      newbieFriendly: item.newbieFriendly,
    };

    const resultId = createId("bds");
    const now = new Date().toISOString();

    const record = createBreakdownSampleResultRecord(sample, [], {
      id: resultId,
      dataMode: state.dataMode,
      modelId: state.selectedModel,
      createdAt: now,
    });

    setState((current) => ({
      ...current,
      results: [record, ...current.results],
    }));

    return { ok: true, resultId, cost: 0 };
  };

  const updateUserProfile = (patch: Partial<UserProfile>) => {
    setState((current) => ({
      ...current,
      userProfile: { ...current.userProfile, ...patch },
    }));
  };

  /** 从已连接的 connector 自动推断并填充 userProfile 字段 */
  const inferProfileFromConnector = (connectorId: string) => {
    setState((current) => {
      const connector = current.connectors.find((c) => c.id === connectorId);
      if (!connector || !connector.connected) return current;

      // 将 connector id 映射为平台显示名
      const PLATFORM_LABEL: Record<string, string> = {
        douyin: "抖音",
        tiktok: "TikTok",
        xiaohongshu: "小红书",
        wechat: "微信视频号",
        "wechat-mp": "微信公众号",
        bilibili: "B站",
        kuaishou: "快手",
        xigua: "西瓜视频",
        pipixia: "皮皮虾",
        lemon8: "Lemon8",
        youtube: "YouTube",
        instagram: "Instagram",
        weibo: "微博",
        twitter: "X (Twitter)",
        threads: "Threads",
        reddit: "Reddit",
        zhihu: "知乎",
      };

      const platformLabel = PLATFORM_LABEL[connector.id] ?? connector.name;
      const prevPlatforms = current.userProfile.platforms;
      const nextPlatforms = prevPlatforms.includes(platformLabel)
        ? prevPlatforms
        : [...prevPlatforms, platformLabel];

      // 如果 nickname 为空，用 handle 填充
      const nextNickname =
        current.userProfile.nickname || connector.handle || "";

      // 尝试从 connector 的 dataPoints 推断粉丝规模
      const profilePatch: Partial<typeof current.userProfile> = {
        platforms: nextPlatforms,
        nickname: nextNickname,
        lastAutoSyncAt: new Date().toISOString(),
      };

      // 如果当前没有设置 followerScale，尝试从 connector 信息推断
      // FollowerScale: "0-1w" | "1w-10w" | "10w-100w" | "100w+"
      if (!current.userProfile.followerScale || current.userProfile.followerScale === "0-1w") {
        // connector.dataPoints 可能包含粉丝数信息，如 "15.0万粉丝" 或 "2522584粉丝"
        const dpStr = connector.dataPoints || "";
        const wanMatch = dpStr.match(/(\d+\.?\d*)万粉丝/);
        const rawMatch = dpStr.match(/(\d+)粉丝/);
        let followers = 0;
        if (wanMatch) {
          followers = parseFloat(wanMatch[1]) * 10000;
        } else if (rawMatch) {
          followers = parseInt(rawMatch[1], 10);
        }
        if (followers > 0) {
          if (followers >= 1000000) profilePatch.followerScale = "100w+";
          else if (followers >= 100000) profilePatch.followerScale = "10w-100w";
          else if (followers >= 10000) profilePatch.followerScale = "1w-10w";
          else profilePatch.followerScale = "0-1w";
        }
      }

      return {
        ...current,
        userProfile: {
          ...current.userProfile,
          ...profilePatch,
        },
      };
    });
  };

  const pauseWatchTask = (taskId: string) => {
    setState((current) => ({
      ...current,
      watchTasks: current.watchTasks.map((t) =>
        t.taskId === taskId ? { ...t, status: "failed" as const } : t,
      ),
    }));
  };

  const resumeWatchTask = (taskId: string) => {
    setState((current) => ({
      ...current,
      watchTasks: current.watchTasks.map((t) =>
        t.taskId === taskId ? { ...t, status: "pending" as const } : t,
      ),
    }));
  };

  const deleteWatchTask = (taskId: string) => {
    setState((current) => ({
      ...current,
      watchTasks: current.watchTasks.filter((t) => t.taskId !== taskId),
    }));
  };

  const updateWatchTaskSchedule = (
    taskId: string,
    scheduleTier: PredictionWatchScheduleTier,
  ) => {
    setState((current) => ({
      ...current,
      watchTasks: current.watchTasks.map((t) =>
        t.taskId === taskId ? { ...t, scheduleTier } : t,
      ),
    }));
  };

  const MONITOR_TASK_COST = 15;

  const createMonitorTask = (input: {
    taskType: PredictionWatchTaskType;
    platform: "douyin" | "xiaohongshu" | "kuaishou";
    title: string;
    target: string;
    dimensions: string[];
    scheduleTier: PredictionWatchScheduleTier;
  }): ActionResult => {
    const cost = MONITOR_TASK_COST;
    if (state.credits < cost) {
      return { ok: false, shortfall: cost - state.credits };
    }
    const taskId = createId("mw");
    const now = new Date().toISOString();
    const newTask: WatchTaskSummary = {
      taskId,
      artifactId: "",
      platform: input.platform,
      taskType: input.taskType,
      priority: "medium",
      scheduleTier: input.scheduleTier,
      status: "pending",
      degradeFlags: [],
      title: input.title,
      target: input.target,
      dimensions: input.dimensions,
      source: "standalone",
      createdAt: now,
    };
    setState((current) => ({
      ...current,
      credits: current.credits - cost,
      watchTasks: [...current.watchTasks, newTask],
      transactions: [
        {
          id: createId("tx"),
          date: formatTransactionDate(now),
          label: `\u521B\u5EFA\u76D1\u63A7: ${input.title}`,
          amount: -cost,
          type: "usage" as const,
        },
        ...current.transactions,
      ],
    }));
    return { ok: true, resultId: taskId, cost };
  };

  const spendToolCredits = (cost: number, toolName: string): ActionResult => {
    if (state.credits < cost) {
      return { ok: false, shortfall: cost - state.credits };
    }
    const now = APP_NOW;
    setState((prev) => ({
      ...prev,
      credits: prev.credits - cost,
      transactions: [
        {
          id: createId("tx"),
          date: formatTransactionDate(now),
          label: `工具箱: ${toolName}`,
          amount: -cost,
          type: "usage" as const,
        },
        ...prev.transactions,
      ],
    }));
    return { ok: true, resultId: "", cost };
  };

  const syncBalance = async () => {
    const serverBalance = await fetchServerBalance();
    if (serverBalance) {
      setState((prev) => ({
        ...prev,
        credits: serverBalance.credits,
        membershipPlan: (serverBalance.membershipPlan || "free") as MembershipPlan,
      }));
    }
  };

  const resetAppState = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(MODE_STORAGE_KEY.mock);
      window.localStorage.removeItem(MODE_STORAGE_KEY.live);
    }
    setState(createInitialState());
  };

  const value: AppStoreValue = {
    state,
    dataMode: state.dataMode,
    setDataMode,
    connectedConnectors,
    selectedPlatformIds: state.selectedPlatformIds,
    selectedPlatformConnectors,
    togglePlatformSelection,
    setSelectedPlatformIds,
    notificationChannels: state.notificationChannels,
    featuredSamples,
    lowFollowerSamples: state.dataMode === "mock" ? LOW_FOLLOWER_SAMPLES : [],
    savedArtifacts: state.savedArtifacts,
    watchTasks: state.watchTasks,
    setSelectedModel,
    refreshApiHealth,
    startAnalysis,
    addResultFollowUp,
    removeResult,
    connectConnector,
    disconnectConnector,
    syncConnectorProfile,
    verifyNotificationChannel,
    connectNotificationChannel,
    disconnectNotificationChannel,
    testNotificationChannel,
    saveResultArtifact,
    ensureResultWatch,
    runResultWatchTask,
    pauseWatchTask,
    resumeWatchTask,
    deleteWatchTask,
    updateWatchTaskSchedule,
    createMonitorTask,
    topUpCredits,
    upgradeMembership,
    consumeBreakdownAction,
    createBreakdownSampleResult,
    createBreakdownFromLiveItem,
    getResultById,
    getSampleById: resolveSampleById,
    getBreakdownResults,
    resetAppState,
    updateUserProfile,
    inferProfileFromConnector,
    spendToolCredits,
    syncBalance,
    getCreatorCache,
    setCreatorCache,
    clearCreatorCache,
  };

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppStoreContext);

  if (!context) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }

  return context;
}

export function getMembershipLabel(plan: MembershipPlan) {
  if (plan === "pro" || plan === "pro_yearly") return "Pro 会员";
  if (plan === "plus" || plan === "plus_yearly") return "Plus 会员";
  return "免费版";
}

export function getResultHistoryMeta(result: ResultRecord) {
  return {
    type: getTaskIntentLabel(result.taskIntent) || result.type || getQueryType(result.query),
    scoreLabel: result.scoreLabel || inferResultScoreLabel(result.score),
    model: getModelOption(result.modelId),
  };
}
