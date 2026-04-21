export type ConnectorAuthMode = "public" | "cookie";

export type SupportedPlatform = "douyin" | "xiaohongshu" | "kuaishou";

export type NotificationProvider = "feishu" | "wecom" | "qq";

export type NotificationEventType =
  | "prediction_succeeded"
  | "prediction_failed"
  | "connector_bound"
  | "connector_needs_auth"
  | "connector_sync_failed"
  | "watch_succeeded"
  | "watch_degraded"
  | "watch_failed";

export type NotificationDispatchEventType = NotificationEventType | "test_message";

export type NotificationVerifyStatus = "idle" | "verified" | "failed";

export type NotificationDeliveryStatus = "idle" | "success" | "failed";

export type WatchTaskType = "account_watch" | "topic_watch" | "validation_watch";

export type WatchTaskPriority = "high" | "medium" | "low";

export type WatchScheduleTier = "daily" | "every_72h";

export type WatchTaskStatus = "pending" | "running" | "completed" | "failed";

export type ExecutionStatus = "success" | "partial_success" | "failed";

export type DegradeFlag =
  | "fallback_search_route"
  | "fallback_user_route"
  | "fallback_detail_route"
  | "fallback_comment_route"
  | "fallback_billboard_route"
  | "fallback_hotlist_route"
  | "topic_inferred_from_search"
  | "optional_endpoint_failed"
  | "sparse_comments"
  | "sparse_followers"
  | "sparse_hotlist"
  | "platform_partial_failure";

export interface ConnectorCapabilities {
  supportsSearch: boolean;
  supportsHotList: boolean;
  supportsDetail: boolean;
  supportsComments: boolean;
  supportsPublicProfile: boolean;
  supportsCookieAnalytics: boolean;
}

export interface StoredConnectorRecord {
  platformId: string;
  authMode: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
  platformUserId?: string;
  cookieConfigured: boolean;
  encryptedSecretRef?: string;
  verifyStatus: "verified" | "needs_auth" | "idle";
  syncStatus: "verified" | "stale" | "needs_auth" | "idle";
  lastVerifiedAt?: string;
  lastSyncedAt?: string;
  lastHealthCheckAt?: string;
}

export interface StoredSecret {
  ref: string;
  cipherText: string;
  iv: string;
  authTag: string;
  updatedAt: string;
}

export interface ConnectorPayload {
  authMode: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
  platformUserId?: string;
  cookie?: string;
  loginSessionId?: string;
}

export type FeishuReceiveIdType = "open_id" | "user_id" | "chat_id";

export interface NotificationChannelPayload {
  displayName?: string;
  webhookUrl?: string;
  secret?: string;
  subscribedEvents?: NotificationEventType[];
  enabled?: boolean;
  /** 飞书应用模式：接收对象 ID（chat_id 或 open_id） */
  feishuTargetId?: string;
  /** 飞书应用模式：接收对象类型 */
  feishuTargetType?: FeishuReceiveIdType;
  /** 飞书应用模式：接收对象名称（用于显示） */
  feishuTargetName?: string;
}

export interface TikHubResult<T = unknown> {
  ok: boolean;
  httpStatus: number;
  businessCode: number | null;
  requestId: string | null;
  payload: T;
}

export interface LoginSessionRecord {
  sessionId: string;
  platformId: string;
  status: "pending" | "completed" | "failed" | "expired";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cookieSecretRef?: string;
  previewCookie?: string;
  error?: string;
  /** Base64-encoded screenshot of the login page (for QR code display in headless mode) */
  qrScreenshot?: string;
}

export interface StoredNotificationChannel {
  channelId: NotificationProvider;
  provider: NotificationProvider;
  displayName: string;
  destinationLabelMasked?: string;
  enabled: boolean;
  subscribedEvents: NotificationEventType[];
  encryptedSecretRef?: string;
  verifyStatus: NotificationVerifyStatus;
  lastVerifiedAt?: string;
  lastDeliveredAt?: string;
  lastDeliveryStatus?: NotificationDeliveryStatus;
  lastDeliveryError?: string;
  /** 飞书应用模式：接收对象 ID */
  feishuTargetId?: string;
  /** 飞书应用模式：接收对象类型 */
  feishuTargetType?: FeishuReceiveIdType;
  /** 飞书应用模式：接收对象名称 */
  feishuTargetName?: string;
}

export interface StoredNotificationDelivery {
  deliveryId: string;
  channelId: NotificationProvider;
  eventType: NotificationDispatchEventType;
  status: NotificationDeliveryStatus;
  sentAt: string;
  requestSummary: string;
  responseSummary?: string;
  error?: string;
}

export interface NotificationDispatchEvent {
  eventType: NotificationDispatchEventType;
  occurredAt: string;
  title: string;
  summary: string;
  statusLabel: string;
  platforms: string[];
  resultId?: string;
  artifactId?: string;
  watchTaskId?: string;
  degradeFlags: string[];
  link?: string;
}

export interface ResultArtifactStatus {
  artifactId: string;
  savedAt: string;
  watchTaskId?: string;
  watchStatus?: WatchTaskStatus;
  lastWatchRunAt?: string;
  lastExecutionStatus?: ExecutionStatus;
}

export interface WatchPresetPayload {
  taskType: WatchTaskType;
  priority: WatchTaskPriority;
  scheduleTier: WatchScheduleTier;
  platform: SupportedPlatform;
  queryPayload: Record<string, unknown>;
}

export interface StoredResultArtifact {
  artifactId: string;
  clientResultId?: string;
  taskIntent?: string;
  artifactType?: string;
  createdAt: string;
  updatedAt: string;
  query: string;
  type: string;
  title?: string;
  summary?: string;
  platform: string[];
  score?: number;
  scoreLabel?: string;
  verdict?: string;
  windowStrength?: string;
  confidenceLabel?: string;
  opportunityTitle: string;
  coreBet?: string;
  watchable?: boolean;
  shareable?: boolean;
  watchTaskId?: string;
  lastWatchRunAt?: string;
  lastExecutionStatus?: ExecutionStatus;
  snapshot: Record<string, unknown>;
}

export interface StoredWatchTask {
  taskId: string;
  artifactId: string;
  platform: SupportedPlatform;
  taskType: WatchTaskType;
  priority: WatchTaskPriority;
  scheduleTier: WatchScheduleTier;
  status: WatchTaskStatus;
  queryPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  resultSnapshotRef?: string;
  lastExecutionStatus?: ExecutionStatus;
  degradeFlags?: DegradeFlag[];
  degradeReason?: string;
  usedRouteChain?: string[];
  budgetSnapshot?: {
    baseBudget: number;
    actualUsed: number;
    cookieExtraBudget?: number;
  };
}

export interface StoredWatchTaskRun {
  runId: string;
  taskId: string;
  artifactId: string;
  platform: SupportedPlatform;
  taskType: WatchTaskType;
  executedAt: string;
  executionStatus: ExecutionStatus;
  degradeFlags: DegradeFlag[];
  degradeReason?: string;
  resultSnapshotRef: string;
  usedRouteChain: string[];
  budgetSnapshot: {
    baseBudget: number;
    actualUsed: number;
    cookieExtraBudget?: number;
  };
  snapshot: Record<string, unknown>;
}

export interface EndpointHealthRecord {
  path: string;
  method: "GET" | "POST";
  capability: string;
  sampleParams: Record<string, unknown>;
  httpStatus: number;
  businessCode: number | null;
  requestId: string | null;
  stable: boolean;
  tier: "L1" | "L2" | "L3";
  verifiedAt: string;
  failureReason?: string;
  /** 熏断器：连续失败次数（连续失败 3 次后进入冷却） */
  consecutiveFails?: number;
  /** 熏断器：冷却期截止时间（ISO 8601，在此时间前跳过此接口） */
  disabledUntil?: string;
}
