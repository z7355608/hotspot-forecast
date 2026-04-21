import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Instagram,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Youtube,
  Zap,
} from "lucide-react";
import { getCapabilityLabels, getPlatformPredictionMeta } from "../store/prediction-platforms";
import type {
  NotificationBindingInput,
  NotificationEventType,
} from "../store/prediction-types";
import {
  createConnectorLoginSession,
  fetchConnectorLoginSession,
  type ConnectorLoginSession,
} from "../lib/connectors-api";
import { syncCreatorData } from "../lib/creator-api";
import { normalizeApiError } from "../lib/api-utils";
import { useAppStore } from "../store/app-store";
import {
  fetchFeishuChats,
  fetchFeishuStatus,
  type FeishuChat,
} from "../lib/notification-channels-api";

type LoginUiState = "idle" | "pending" | "ready" | "expired";

const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  prediction_succeeded: "分析成功",
  prediction_failed: "分析失败",
  connector_bound: "账号连接成功",
  connector_needs_auth: "账号需要重登",
  connector_sync_failed: "账号同步失败",
  watch_succeeded: "复查成功",
  watch_degraded: "复查降级",
  watch_failed: "复查失败",
};

function PlatformIcon({ id, size = 20 }: { id: string; size?: number }) {
  if (id === "youtube") return <Youtube style={{ width: size, height: size }} />;
  if (id === "instagram") {
    return <Instagram style={{ width: size, height: size }} />;
  }

  const paths: Record<string, ReactNode> = {
    douyin: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.4a6.84 6.84 0 0 0-.79-.05A6.33 6.33 0 0 0 3.15 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
    wechat: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.67.82 3.17 2.12 4.21L4.5 16l2.36-1.18A7.6 7.6 0 0 0 9.5 15a6.2 6.2 0 0 1-.5-2.5C9 9.46 11.91 7 15.5 7a6.5 6.5 0 0 1 .52.02C15.22 5.72 12.12 4 9.5 4zM16.5 9C13.46 9 11 11.01 11 13.5S13.46 18 16.5 18a6.5 6.5 0 0 0 1.86-.28L20.5 19l-.9-2.03A4.42 4.42 0 0 0 21 13.5C21 11.01 18.54 9 16.5 9z" />
      </svg>
    ),
    "wechat-mp": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.67.82 3.17 2.12 4.21L4.5 16l2.36-1.18A7.6 7.6 0 0 0 9.5 15a6.2 6.2 0 0 1-.5-2.5C9 9.46 11.91 7 15.5 7a6.5 6.5 0 0 1 .52.02C15.22 5.72 12.12 4 9.5 4zM16.5 9C13.46 9 11 11.01 11 13.5S13.46 18 16.5 18a6.5 6.5 0 0 0 1.86-.28L20.5 19l-.9-2.03A4.42 4.42 0 0 0 21 13.5C21 11.01 18.54 9 16.5 9z" />
      </svg>
    ),
    bilibili: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" />
      </svg>
    ),
    kuaishou: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.48 3C7.76 3 3.93 6.82 3.93 11.54c0 2.34.94 4.46 2.46 6.01L4.5 21l4.13-2.07c1.15.47 2.42.73 3.75.73h.1c4.72 0 8.55-3.82 8.55-8.54S17.2 3 12.48 3zm0 15.54c-1.18 0-2.3-.28-3.3-.79l-.24-.14-2.45 1.23.64-2.33-.15-.24a7 7 0 0 1-1.08-3.73c0-3.88 3.16-7.04 7.04-7.04 3.88 0 7.04 3.16 7.04 7.04 0 3.88-3.16 7-7.04 7z" />
        <circle cx="9" cy="11.5" r="1.5" />
        <circle cx="15" cy="11.5" r="1.5" />
      </svg>
    ),
  };

  return <>{paths[id] ?? <Zap width={size} height={size} />}</>;
}

function formatLoginSessionStatus(status: ConnectorLoginSession["status"]) {
  if (status === "pending") return "扫码登录中";
  if (status === "completed") return "已登录";
  if (status === "failed") return "登录失败";
  return "登录已失效";
}

function formatShortDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationIcon({ channelId }: { channelId: string }) {
  const label =
    channelId === "feishu" ? "飞" : channelId === "wecom" ? "企" : "Q";
  return <span className="text-sm font-semibold text-white">{label}</span>;
}

export function ConnectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    state,
    dataMode,
    notificationChannels,
    connectConnector,
    disconnectConnector,
    refreshApiHealth,
    syncConnectorProfile,
    verifyNotificationChannel,
    connectNotificationChannel,
    disconnectNotificationChannel,
    testNotificationChannel,
    inferProfileFromConnector,
  } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(searchParams.get("platform"));
  const [editingNotificationId, setEditingNotificationId] = useState<string | null>(null);
  const [draftNotificationName, setDraftNotificationName] = useState("");
  const [draftNotificationWebhook, setDraftNotificationWebhook] = useState("");
  const [draftNotificationSecret, setDraftNotificationSecret] = useState("");
  const [draftNotificationEvents, setDraftNotificationEvents] = useState<NotificationEventType[]>([]);
  const [draftNotificationEnabled, setDraftNotificationEnabled] = useState(true);
  // 飞书应用模式状态
  const [feishuChats, setFeishuChats] = useState<FeishuChat[]>([]);
  const [feishuChatsLoading, setFeishuChatsLoading] = useState(false);
  const [feishuStatus, setFeishuStatus] = useState<{ configured: boolean; verified: boolean } | null>(null);
  const [draftFeishuTargetId, setDraftFeishuTargetId] = useState("");
  const [draftFeishuTargetName, setDraftFeishuTargetName] = useState("");

  const loadFeishuChats = () => {
    setFeishuChatsLoading(true);
    Promise.all([fetchFeishuChats(), fetchFeishuStatus()])
      .then(([chatsResult, statusResult]) => {
        setFeishuChats(chatsResult.items || []);
        setFeishuStatus(statusResult);
      })
      .catch(() => {
        setFeishuChats([]);
        setFeishuStatus({ configured: false, verified: false });
      })
      .finally(() => setFeishuChatsLoading(false));
  };
  const [draftProfileUrl, setDraftProfileUrl] = useState("");
  const [draftHandle, setDraftHandle] = useState("");
  const [draftPlatformUserId, setDraftPlatformUserId] = useState("");
  const [loginSession, setLoginSession] = useState<ConnectorLoginSession | null>(null);
  const [editorTab, setEditorTab] = useState<"manual" | "qrlogin">("manual");
  const [saving, setSaving] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationVerifying, setNotificationVerifying] = useState(false);
  const [notificationTesting, setNotificationTesting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notificationActionMessage, setNotificationActionMessage] = useState("");
  const connected = state.connectors.filter((connector) => connector.connected);
  const disconnected = state.connectors.filter((connector) => !connector.connected);
  const connectedNotifications = notificationChannels.filter((channel) => channel.connected);
  const disconnectedNotifications = notificationChannels.filter((channel) => !channel.connected);
  const editingConnector = useMemo(
    () => state.connectors.find((connector) => connector.id === editingId) ?? null,
    [editingId, state.connectors],
  );
  const editingNotification = useMemo(
    () =>
      notificationChannels.find((channel) => channel.channelId === editingNotificationId) ?? null,
    [editingNotificationId, notificationChannels],
  );

  useEffect(() => {
    const nextId = searchParams.get("platform");
    if (nextId) {
      setEditingId(nextId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!editingConnector) return;
    setDraftProfileUrl(editingConnector.profileUrl || "");
    setDraftHandle(editingConnector.handle || "");
    setDraftPlatformUserId(editingConnector.platformUserId || "");
    setLoginSession(null);
    setActionError("");
    // Default to QR login tab for platforms that support cookie login
    const meta = getPlatformPredictionMeta(editingConnector.id);
    setEditorTab(meta?.capabilities.supportsCookieAnalytics ? "qrlogin" : "manual");
  }, [editingConnector]);

  useEffect(() => {
    if (!editingNotification) return;
    setDraftNotificationName(editingNotification.name);
    setDraftNotificationWebhook("");
    setDraftNotificationSecret("");
    setDraftNotificationEvents(editingNotification.subscribedEvents);
    setDraftNotificationEnabled(editingNotification.enabled);
    setNotificationActionMessage("");
    setActionError("");
    // 飞书应用模式：加载群列表和凭证状态
    if (editingNotification.channelId === "feishu") {
      setDraftFeishuTargetId(editingNotification.feishuTargetId || "");
      setDraftFeishuTargetName(editingNotification.feishuTargetName || "");
      loadFeishuChats();
    }
  }, [editingNotification]);

  // 轮询抖音登录状态
  useEffect(() => {
    if (dataMode !== "live") return;
    if (!loginSession || loginSession.status !== "pending" || !editingConnector) return;
    const timer = window.setInterval(() => {
      void fetchConnectorLoginSession(editingConnector.id, loginSession.sessionId)
        .then((payload) => {
          setLoginSession(payload.session);
        })
        .catch((error) => {
          setActionError(
            error instanceof Error ? error.message : "登录状态轮询失败，请稍后重试。",
          );
        });
    }, 2500);
    return () => {
      window.clearInterval(timer);
    };
  }, [dataMode, editingConnector, loginSession]);

  const platformMeta = editingConnector ? getPlatformPredictionMeta(editingConnector.id) : null;
  const showCookieLogin = !!platformMeta?.capabilities.supportsCookieAnalytics;
  const hasStoredCookieLogin = !!editingConnector?.cookieConfigured;
  const hasFreshCookieLogin = loginSession?.status === "completed";
  const hasCookieLogin = hasFreshCookieLogin || hasStoredCookieLogin;

  // 手动输入至少填一个字段，或有cookie登录，即可保存
  const hasManualInput = (draftProfileUrl || "").trim() || (draftHandle || "").trim() || (draftPlatformUserId || "").trim();
  const canSave = !!editingConnector && (dataMode === "mock" || hasManualInput || hasCookieLogin);

  const loginUiState: LoginUiState =
    loginSession?.status === "pending"
      ? "pending"
      : loginSession?.status === "completed" || hasStoredCookieLogin
        ? "ready"
        : loginSession?.status === "failed" || loginSession?.status === "expired"
          ? "expired"
          : "idle";

  const loginStatusTitle =
    loginUiState === "pending"
      ? "扫码登录中"
      : loginUiState === "ready"
        ? "已登录"
        : loginUiState === "expired"
          ? "失效需重登"
          : "尚未开始平台登录";

  const loginStatusBody =
    loginUiState === "pending"
      ? "系统已在后台打开抖音创作者中心。请使用抖音 APP 扫描下方截图中的二维码完成登录，系统会自动检测登录结果。"
      : loginUiState === "ready"
        ? hasFreshCookieLogin
          ? "本次扫码登录已经完成，点击保存连接后会把新的登录态托管到服务端，并自动获取你的账号信息。"
          : "当前账号已托管可用登录态。你可以直接保存，也可以重新登录来覆盖现有账号。"
        : loginUiState === "expired"
          ? "上一次登录会话已失败或过期。请重新点击打开登录并扫码。"
          : "点击上方按钮后，系统会在后台打开抖音创作者中心并截取登录页面。扫码成功后，状态会自动切换为已登录。";

  const loginPanelClassName =
    loginUiState === "pending"
      ? "border-blue-100 bg-blue-50 text-blue-700"
      : loginUiState === "ready"
        ? "border-green-100 bg-green-50 text-green-700"
        : loginUiState === "expired"
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-gray-200 bg-white text-gray-600";

  const platformLoginLabel = editingConnector ? (editingConnector.name || "平台") : "平台";
  const loginActionLabel =
    loginUiState === "pending"
      ? "重新打开登录"
      : loginUiState === "ready"
        ? `更换${platformLoginLabel}账号`
        : loginUiState === "expired"
          ? "重新登录"
          : `打开${platformLoginLabel}登录`;

  const loginMetaText =
    loginUiState === "pending"
      ? `会话创建于 ${formatShortDateTime(loginSession?.createdAt)}`
      : hasFreshCookieLogin
        ? `本次登录完成于 ${formatShortDateTime(loginSession?.completedAt || loginSession?.updatedAt)}`
        : hasStoredCookieLogin
          ? `服务端已托管登录态，上次校验 ${editingConnector?.lastVerifiedAt ? formatShortDateTime(editingConnector.lastVerifiedAt) : "未知"}`
          : loginSession
            ? `最近一次登录尝试状态：${formatLoginSessionStatus(loginSession.status)}`
            : "";

  const isFeishuAppMode = editingNotification?.channelId === "feishu";
  const canSaveNotification =
    !!editingNotification &&
    draftNotificationEvents.length > 0 &&
    (isFeishuAppMode
      ? (draftFeishuTargetId || "").trim().length > 0
      : (draftNotificationWebhook || "").trim().length > 0);

  const openEditor = (connectorId: string) => {
    setEditingId(connectorId);
    setSearchParams({ platform: connectorId });
  };

  const closeEditor = () => {
    setEditingId(null);
    setSearchParams({});
  };

  const openNotificationEditor = (channelId: string) => {
    setEditingNotificationId(channelId);
    setNotificationActionMessage("");
    setActionError("");
  };

  const closeNotificationEditor = () => {
    setEditingNotificationId(null);
    setNotificationActionMessage("");
  };

  const buildNotificationBinding = (): NotificationBindingInput => {
    const base: NotificationBindingInput = {
      displayName: draftNotificationName,
      webhookUrl: draftNotificationWebhook,
      secret: draftNotificationSecret,
      enabled: draftNotificationEnabled,
      subscribedEvents: draftNotificationEvents,
    };
    if (isFeishuAppMode) {
      base.feishuTargetId = draftFeishuTargetId;
      base.feishuTargetType = "chat_id";
      base.feishuTargetName = draftFeishuTargetName;
    }
    return base;
  };

  const toggleNotificationEvent = (eventType: NotificationEventType) => {
    setDraftNotificationEvents((current) =>
      current.includes(eventType)
        ? current.filter((item) => item !== eventType)
        : [...current, eventType],
    );
  };

  // 保存连接：支持手动输入 + 扫码登录双模式
  const handleSave = async () => {
    if (!editingConnector || !canSave) return;
    setSaving(true);
    setActionError("");
    try {
      const authMode = (hasCookieLogin && showCookieLogin) ? "cookie" as const : "public" as const;
      await connectConnector(editingConnector.id, {
        authMode,
        profileUrl: (draftProfileUrl || "").trim() || undefined,
        handle: (draftHandle || "").trim() || undefined,
        platformUserId: (draftPlatformUserId || "").trim() || undefined,
        loginSessionId: loginSession?.sessionId,
      });
      inferProfileFromConnector(editingConnector.id);
      // 绑定成功后自动触发一次数据同步（后台执行，不阻塞弹窗关闭）
      const SYNC_SUPPORTED = new Set(["douyin", "xiaohongshu", "kuaishou"]);
      if (SYNC_SUPPORTED.has(editingConnector.id)) {
        syncCreatorData(editingConnector.id, 30).catch(() => {/* ignore sync errors on auto-sync */});
      }
      closeEditor();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "连接保存失败，请检查服务端和 TikHub 配置。");
    } finally {
      setSaving(false);
    }
  };

  const handleStartPlatformLogin = async () => {
    if (!editingConnector) return;
    setActionError("");
    try {
      if (dataMode === "live") {
        const health = await refreshApiHealth();
        if (health.status !== "ready") {
          throw new Error(
            health.message || "当前环境未接通真实数据后端，需要把同源 /api 反向代理到 Node 服务。",
          );
        }
      }
      const payload = await createConnectorLoginSession(editingConnector.id);
      setLoginSession(payload.session);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "平台登录会话启动失败，请检查服务端依赖。",
      );
    }
  };

  const handleVerifyNotification = async () => {
    if (!editingNotification || !canSaveNotification) return;
    setActionError("");
    setNotificationActionMessage("");
    setNotificationVerifying(true);
    try {
      const response = await verifyNotificationChannel(
        editingNotification.channelId,
        buildNotificationBinding(),
      );
      setNotificationActionMessage(
        response.destinationLabelMasked
          ? `验证成功 · ${response.destinationLabelMasked}`
          : response.responseSummary || "验证成功，可以继续测试发送或保存。",
      );
    } catch (error) {
      setActionError(normalizeApiError(error, "通知渠道验证失败，请检查 webhook 配置。"));
    } finally {
      setNotificationVerifying(false);
    }
  };

  const handleTestNotification = async () => {
    if (!editingNotification || !canSaveNotification) return;
    setActionError("");
    setNotificationActionMessage("");
    setNotificationTesting(true);
    try {
      const response = await testNotificationChannel(
        editingNotification.channelId,
        buildNotificationBinding(),
      );
      setNotificationActionMessage(
        response.responseSummary || "测试发送成功，请到目标群里确认消息是否到达。",
      );
    } catch (error) {
      setActionError(normalizeApiError(error, "测试发送失败，请检查 webhook 和群机器人配置。"));
    } finally {
      setNotificationTesting(false);
    }
  };

  const handleSaveNotification = async () => {
    if (!editingNotification || !canSaveNotification) return;
    setActionError("");
    setNotificationActionMessage("");
    setNotificationSaving(true);
    try {
      await connectNotificationChannel(editingNotification.channelId, buildNotificationBinding());
      closeNotificationEditor();
    } catch (error) {
      setActionError(normalizeApiError(error, "通知渠道保存失败，请检查服务端和 webhook 配置。"));
    } finally {
      setNotificationSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <h1 className="mb-1 text-xl text-gray-900">账号连接</h1>
        <p className="text-sm text-gray-400">
          通过抖音扫码登录连接你的创作平台，用于补充账号上下文，并为爆款预测、低粉爆款推荐和后续判断提供平台依据
        </p>
      </div>
      {dataMode === "live" && state.apiHealth.status === "unavailable" ? (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.apiHealth.message ||
            "当前环境未接通真实数据后端，需要把同源 /api 反向代理到 Node 服务。"}
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {actionError}
        </div>
      ) : null}

      {/* Module D2: 连接器页空状态 */}
      {connected.length === 0 && !editingId && (
        <div className="mb-10 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50">
            <Link2 className="h-8 w-8 text-gray-300" />
          </div>
          <h3 className="mb-2 text-base text-gray-700">连接你的创作平台，获取更精准的分析</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-gray-400">
            连接后可以直接分析你自己的账号数据，不只是公开内容，预测准确率会显著提升
          </p>
          {/* Platform logo dots */}
          <div className="mb-6 flex items-center justify-center gap-3">
            {[
              { id: "douyin", color: "#000", label: "抖" },
              { id: "xhs", color: "#FF2442", label: "红" },
              { id: "bilibili", color: "#00AEEC", label: "B" },
            ].map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-sm text-white"
                  style={{ backgroundColor: p.color }}
                >
                  {p.label}
                </div>
                {i < 2 && (
                  <div className="h-px w-6 border-t border-dashed border-gray-300" />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => disconnected[0] && setEditingId(disconnected[0].id)}
            className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
          >
            连接第一个平台
          </button>
        </div>
      )}

      {connected.length > 0 && (
        <div className="mb-8">
          <p className="mb-3 text-xs text-gray-400">已连接 · {connected.length} 个平台</p>
          <div className="space-y-3">
            {connected.map((connector) => (
              <div
                key={connector.id}
                className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: connector.color }}
                  >
                    <PlatformIcon id={connector.id} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <p className="text-sm text-gray-800">{connector.name}</p>
                      <span className="flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                        <Check className="h-2.5 w-2.5" />
                        已连接
                      </span>
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        {connector.cookieConfigured ? "登录态已托管" : "登录态待校验"}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                          connector.predictionEnabled
                            ? "bg-blue-50 text-blue-600"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {connector.predictionEnabled ? "中文预测已启用" : "连接器已保留"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {connector.handle || connector.platformUserId || "扫码登录连接"} ·{" "}
                      {connector.dataPoints ?? "已记录基础平台信息"} · 最后同步 {connector.lastSync ?? "刚刚"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {getCapabilityLabels(connector.capabilities).map((label) => (
                        <span
                          key={`${connector.id}-${label}`}
                          className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-500"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-gray-400">
                      调用预算：主题 {connector.callBudget.topic} / 链接 {connector.callBudget.link} / 账号{" "}
                      {connector.callBudget.account}
                      {connector.callBudget.cookieExtra
                        ? ` / Cookie +${connector.callBudget.cookieExtra}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void syncConnectorProfile(connector.id).catch((error) => {
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : "刷新快照失败，请检查服务端和 TikHub 配置。",
                          );
                        });
                      }}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      刷新快照
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(connector.id)}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                    >
                      重新登录
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void disconnectConnector(connector.id).catch((error) => {
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : "断开连接失败，请检查服务端状态。",
                          );
                        });
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      断开
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-xs text-gray-400">可连接平台</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {disconnected.map((connector) => (
            <div
              key={connector.id}
              className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: connector.color }}
                >
                  <PlatformIcon id={connector.id} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-sm text-gray-700">{connector.name}</p>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {connector.category}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        connector.predictionEnabled
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {connector.predictionEnabled ? "V1 预测平台" : "连接器保留"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{connector.dataPoints}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getCapabilityLabels(connector.capabilities).map((label) => (
                      <span
                        key={`${connector.id}-${label}`}
                        className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-500"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-gray-400">
                    调用预算：主题 {connector.callBudget.topic} / 链接 {connector.callBudget.link} / 账号{" "}
                    {connector.callBudget.account}
                    {connector.callBudget.cookieExtra
                      ? ` / Cookie +${connector.callBudget.cookieExtra}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEditor(connector.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 transition-all hover:border-gray-900 hover:bg-gray-900"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-400 transition-colors hover:text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 连接器编辑弹窗：Tab 分离手动输入 / 扫码登录 ─── */}
      {editingConnector && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={closeEditor} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl">
              {/* 弹窗头部 */}
              <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: editingConnector.color }}
                  >
                    <PlatformIcon id={editingConnector.id} size={18} />
                  </div>
                  <div>
                    <h2 className="text-base text-gray-900">{editingConnector.name}</h2>
                    <p className="text-xs text-gray-400">
                      {showCookieLogin
                        ? "选择手动输入或扫码登录来连接你的账号"
                        : "输入账号信息后点击保存即可完成连接"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tab 切换栏 - 只在支持cookie的平台显示 */}
              {showCookieLogin && (
                <div className="flex border-b border-gray-100 px-5 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setEditorTab("qrlogin")}
                    className={`relative px-4 py-3 text-sm transition-colors ${
                      editorTab === "qrlogin"
                        ? "text-gray-900"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      扫码登录
                    </span>
                    {editorTab === "qrlogin" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gray-900" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("manual")}
                    className={`relative px-4 py-3 text-sm transition-colors ${
                      editorTab === "manual"
                        ? "text-gray-900"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    手动输入
                    {editorTab === "manual" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gray-900" />
                    )}
                  </button>
                </div>
              )}

              <div className="max-h-[60vh] overflow-y-auto">
                <div className="space-y-5 px-5 py-5 sm:px-6">

                  {/* ─── Tab: 扫码登录 ─── */}
                  {showCookieLogin && editorTab === "qrlogin" && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-xs text-gray-500">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-700">通过扫码登录连接{editingConnector.name}账号</div>
                            <div className="mt-1 text-xs text-gray-400">
                              扫码登录后可自动获取账号信息和创作者后台数据（流量来源、粉丝画像等）
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleStartPlatformLogin();
                            }}
                            className="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-xs text-white transition-colors hover:bg-gray-700"
                          >
                            {loginActionLabel}
                          </button>
                        </div>

                        {/* 登录状态面板 */}
                        <div className={`rounded-xl border px-3 py-3 ${loginPanelClassName}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            {loginUiState === "pending" ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            ) : loginUiState === "ready" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">
                              {loginStatusTitle}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-current">{loginStatusTitle}</div>
                          <div className="mt-1 text-xs text-current/80">{loginStatusBody}</div>
                          {loginMetaText ? (
                            <div className="mt-2 text-[11px] text-current/70">{loginMetaText}</div>
                          ) : null}
                          {loginSession?.error ? (
                            <div className="mt-2 text-[11px] text-red-600">{loginSession.error}</div>
                          ) : null}
                        </div>

                        {/* QR Code Screenshot Display */}
                        {loginUiState === "pending" && (
                          <div className="mt-3 flex flex-col items-center gap-2">
                            {loginSession?.qrScreenshot ? (
                              <>
                                <div className="text-xs text-gray-500">请使用抖音 APP 扫描下方二维码登录</div>
                                <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
                                  <img
                                    src={loginSession.qrScreenshot}
                                    alt="抖音创作者中心登录页面"
                                    className="max-h-[400px] w-full object-contain"
                                  />
                                </div>
                                <div className="text-[11px] text-gray-400">页面截图每 2.5 秒自动刷新，扫码成功后状态会自动更新</div>
                              </>
                            ) : (
                              <div className="w-full rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                                <p className="text-xs text-amber-700">
                                  正在等待二维码加载...如果长时间未显示，可能是服务端浏览器无法正常加载抖音登录页。
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setEditorTab("manual")}
                                  className="mt-2 text-xs font-medium text-amber-700 underline hover:text-amber-900"
                                >
                                  切换到手动输入 Cookie 登录
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 操作步骤 */}
                        <div className="mt-3 grid gap-2 rounded-xl bg-white px-3 py-3 text-xs text-gray-600">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500">
                              1
                            </span>
                            <span>点击上方按钮，系统会在后台打开{editingConnector.name}创作者中心</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500">
                              2
                            </span>
                            <span>页面截图会显示在上方，使用抖音 APP 扫描二维码完成登录</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500">
                              3
                            </span>
                            <span>状态切换为"已登录"后，点击"保存连接"即可完成绑定</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── Tab: 手动输入（非cookie平台直接显示，cookie平台在manual tab显示） ─── */}
                  {(!showCookieLogin || editorTab === "manual") && (
                    <div className="space-y-3">
                      <div className="mb-1 text-xs text-gray-400">
                        {editingConnector.id === 'kuaishou'
                          ? "输入快手昵称或主页链接来连接账号（推荐填昵称，最简单）"
                          : showCookieLogin
                            ? "如果扫码不方便，也可以手动输入账号信息"
                            : "输入你的账号信息来完成连接"}
                      </div>
                      <label className="block">
                        <div className="mb-2 text-xs text-gray-500">账号主页链接</div>
                        <input
                          type="url"
                          value={draftProfileUrl}
                          onChange={(event) => setDraftProfileUrl(event.target.value)}
                          placeholder={`粘贴${editingConnector.name}主页链接，如 ${editingConnector.id === 'douyin' ? 'https://www.douyin.com/user/...' : editingConnector.id === 'xiaohongshu' ? 'https://www.xiaohongshu.com/user/profile/...' : editingConnector.id === 'kuaishou' ? 'https://www.kuaishou.com/profile/373636300' : 'https://...'}`}
                          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-2 text-xs text-gray-500">{editingConnector.id === 'kuaishou' ? '快手昵称（推荐）' : '昵称'}</div>
                        <input
                          type="text"
                          value={draftHandle}
                          onChange={(event) => setDraftHandle(event.target.value)}
                          placeholder={editingConnector.id === 'kuaishou' ? '输入快手昵称，如 美食作家王刚' : `输入${editingConnector.name}账号昵称`}
                          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-2 text-xs text-gray-500">{editingConnector.id === 'kuaishou' ? '快手用户 ID（数字）' : '平台用户 ID'}</div>
                        <input
                          type="text"
                          value={draftPlatformUserId}
                          onChange={(event) => setDraftPlatformUserId(event.target.value)}
                          placeholder={editingConnector.id === 'kuaishou' ? '输入快手数字 ID，如 373636300（可选）' : `输入${editingConnector.name}用户 ID`}
                          className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                        />
                      </label>
                      {editingConnector.id === 'kuaishou' && (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
                          <div className="mb-1.5 font-medium">快手账号连接说明</div>
                          <ul className="space-y-1 list-disc pl-3.5">
                            <li><strong>推荐方式</strong>：填写快手昵称。系统会通过搜索自动匹配你的账号</li>
                            <li><strong>备选方式 1</strong>：粘贴主页链接，如 <code className="rounded bg-amber-100 px-1">https://www.kuaishou.com/profile/373636300</code></li>
                            <li><strong>备选方式 2</strong>：填写快手数字 ID（纯数字，在快手 APP → 设置 → 账号与安全 中查看）</li>
                            <li>三种方式<strong>任填一种</strong>即可，系统会自动验证并拉取公开数据</li>
                            <li>快手暂不支持评论数据采集，不影响作品列表和粉丝画像功能</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* mock模式提示 */}
                  {dataMode === "mock" && (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
                      演示数据模式下不会拉起真实平台登录。保存后只会在本地模拟"已连接"状态，方便走完整演示链路。
                    </div>
                  )}

                  {/* 平台能力信息 */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                    <div className="mb-2 text-gray-700">当前平台能力</div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {getCapabilityLabels(editingConnector.capabilities).map((label) => (
                        <span
                          key={`${editingConnector.id}-modal-${label}`}
                          className="rounded-lg bg-white px-2 py-1 text-[11px] text-gray-500"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div>
                      调用预算：主题 {editingConnector.callBudget.topic} / 链接 {editingConnector.callBudget.link} /
                      账号 {editingConnector.callBudget.account}
                      {editingConnector.callBudget.cookieExtra
                        ? ` / Cookie +${editingConnector.callBudget.cookieExtra}`
                        : ""}
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {actionError ? (
                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                      {actionError}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving
                    ? "保存中..."
                    : editorTab === "qrlogin" && loginUiState !== "ready" && dataMode === "live"
                      ? "等待登录完成"
                      : "保存连接"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── 通知渠道部分（保持不变） ─── */}
      <div className="mt-10">
        <p className="mb-3 text-xs text-gray-400">通知渠道</p>
        <p className="mb-4 text-sm text-gray-400">
          把实时分析、账号异常和观察复查结果同步到团队沟通工具。通知渠道和内容平台分开管理，不会混用同一套连接配置。
        </p>

        {connectedNotifications.length > 0 && (
          <div className="mb-8">
            <p className="mb-3 text-xs text-gray-400">已连接 · {connectedNotifications.length} 个渠道</p>
            <div className="space-y-3">
              {connectedNotifications.map((channel) => (
                <div
                  key={channel.channelId}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: channel.color }}
                    >
                      <NotificationIcon channelId={channel.channelId} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-gray-800">{channel.name}</p>
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-600">
                          <Check className="h-2.5 w-2.5" />
                          已连接
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                          {channel.enabled ? "自动发送中" : "已停用"}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            channel.lastDeliveryStatus === "failed"
                              ? "bg-red-50 text-red-600"
                              : channel.lastDeliveryStatus === "success"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {channel.lastDeliveryStatus === "failed"
                            ? "最近发送失败"
                            : channel.lastDeliveryStatus === "success"
                              ? "最近发送成功"
                              : "未发送"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {channel.feishuAppMode
                          ? (channel.feishuTargetName || "飞书群已配置")
                          : (channel.destinationLabelMasked || "webhook 已配置")} ·
                        订阅 {(channel.subscribedEvents || []).length} 类事件
                        {channel.lastDeliveredAt
                          ? ` · 最后发送 ${formatShortDateTime(channel.lastDeliveredAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openNotificationEditor(channel.channelId)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void disconnectNotificationChannel(channel.channelId).catch((error) => {
                            setActionError(
                              error instanceof Error
                                ? error.message
                                : "断开通知渠道失败，请检查服务端状态。",
                            );
                          });
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        断开
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {disconnectedNotifications.map((channel) => (
            <div
              key={channel.channelId}
              className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: channel.color }}
                >
                  <NotificationIcon channelId={channel.channelId} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">{channel.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {channel.channelId === "feishu"
                      ? "通过飞书应用主动推送通知到指定群聊"
                      : "连接群机器人 webhook，用于接收分析、账号异常和观察任务通知"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openNotificationEditor(channel.channelId)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 transition-all hover:border-gray-900 hover:bg-gray-900"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-400 transition-colors hover:text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 通知渠道编辑弹窗 ─── */}
      {editingNotification && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={closeNotificationEditor} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="mb-1 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: editingNotification.color }}
                  >
                    <NotificationIcon channelId={editingNotification.channelId} />
                  </div>
                  <div>
                    <h2 className="text-base text-gray-900">{editingNotification.name}</h2>
                    <p className="text-xs text-gray-400">
                      {isFeishuAppMode
                        ? "通过飞书应用主动推送通知到指定群聊"
                        : "连接群机器人 webhook，用于接收分析、账号异常和观察任务通知"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-6">
                <label className="block">
                  <div className="mb-2 text-xs text-gray-500">显示名称</div>
                  <input
                    type="text"
                    value={draftNotificationName}
                    onChange={(event) => setDraftNotificationName(event.target.value)}
                    placeholder={editingNotification.name}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                  />
                </label>

                {isFeishuAppMode ? (
                  <div className="space-y-4">
                    {/* 引导步骤 */}
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                      <div className="mb-2 text-xs font-medium text-blue-700">配置步骤</div>
                      <ol className="space-y-1.5 text-xs text-blue-600">
                        <li>1. 在飞书中搜索机器人“爆款预测Agent”，添加到目标群聊</li>
                        <li>2. 回到此页面，点击下方“刷新群列表”</li>
                        <li>3. 从列表中选择目标群即可</li>
                      </ol>
                    </div>

                    {/* 群列表选择 */}
                    {feishuChatsLoading ? (
                      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-400">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        加载飞书群列表中...
                      </div>
                    ) : !feishuStatus?.configured ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                        飞书应用凭证未配置，请联系管理员配置 App ID 和 App Secret。
                      </div>
                    ) : !feishuStatus?.verified ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        飞书应用凭证验证失败，请检查 App ID 和 App Secret 是否正确。
                      </div>
                    ) : feishuChats.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">机器人已加入的群（{feishuChats.length} 个）</div>
                          <button
                            type="button"
                            onClick={loadFeishuChats}
                            className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-blue-500"
                          >
                            <RefreshCcw className="h-3 w-3" />
                            刷新群列表
                          </button>
                        </div>
                        {feishuChats.map((chat) => (
                          <button
                            key={chat.chat_id}
                            type="button"
                            onClick={() => {
                              setDraftFeishuTargetId(chat.chat_id);
                              setDraftFeishuTargetName(chat.name);
                            }}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                              draftFeishuTargetId === chat.chat_id
                                ? "border-blue-400 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-medium text-blue-600">
                              {(chat.name || "群").charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{chat.name}</div>
                              {chat.description && (
                                <div className="truncate text-xs text-gray-400">{chat.description}</div>
                              )}
                            </div>
                            {draftFeishuTargetId === chat.chat_id && (
                              <Check className="h-4 w-4 shrink-0 text-blue-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <span className="text-xs text-gray-500">
                            机器人尚未加入任何群聊
                          </span>
                          <button
                            type="button"
                            onClick={loadFeishuChats}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100"
                          >
                            <RefreshCcw className="h-3 w-3" />
                            刷新群列表
                          </button>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          请先在飞书中将“爆款预测Agent”机器人添加到目标群，然后点击“刷新群列表”。
                        </p>
                      </div>
                    )}

                    {/* 已选择状态 */}
                    {draftFeishuTargetId && (
                      <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-600">
                        <Check className="h-3 w-3" />
                        已选择：{draftFeishuTargetName || draftFeishuTargetId}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="block">
                      <div className="mb-2 text-xs text-gray-500">Webhook 地址</div>
                      <input
                        type="url"
                        value={draftNotificationWebhook}
                        onChange={(event) => setDraftNotificationWebhook(event.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-2 text-xs text-gray-500">可选 Secret</div>
                      <input
                        type="password"
                        value={draftNotificationSecret}
                        onChange={(event) => setDraftNotificationSecret(event.target.value)}
                        placeholder="如飞书签名 secret 或 webhook 桥接 secret"
                        className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition-colors focus:border-gray-400"
                      />
                    </label>
                  </>
                )}

                <div>
                  <div className="mb-2 text-xs text-gray-500">订阅事件</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(NOTIFICATION_EVENT_LABELS).map(([eventType, label]) => {
                      const active = draftNotificationEvents.includes(eventType as NotificationEventType);
                      return (
                        <button
                          key={eventType}
                          type="button"
                          onClick={() => toggleNotificationEvent(eventType as NotificationEventType)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                            active
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDraftNotificationEnabled((value) => !value)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    draftNotificationEnabled
                      ? "border-green-100 bg-green-50 text-green-700"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  <span>{draftNotificationEnabled ? "保存后自动发送通知" : "保存后仅保留配置，暂不自动发送"}</span>
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[11px]">
                    {draftNotificationEnabled ? "已启用" : "已停用"}
                  </span>
                </button>

                <div className="grid gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                  {isFeishuAppMode ? (
                    <>
                      <div>1. 确认飞书应用已被添加到目标群聊。</div>
                      <div>2. 从上方列表选择接收通知的群，或手动输入 Chat ID。</div>
                      <div>3. 点击“发送测试通知”确认群里能收到消息。</div>
                      <div>4. 保存后，真实分析、账号异常和 watch 复查会按订阅事件自动推送。</div>
                    </>
                  ) : (
                    <>
                      <div>1. 先填写 webhook 和可选 secret。</div>
                      <div>2. 点击“验证连接”确认地址可用。</div>
                      <div>3. 点击“发送测试通知”确认群里能收到消息。</div>
                      <div>4. 保存后，真实分析、账号异常和 watch 复查会按订阅事件自动发送。</div>
                    </>
                  )}
                </div>

                {notificationActionMessage ? (
                  <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-xs text-green-700">
                    {notificationActionMessage}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleVerifyNotification();
                    }}
                    disabled={!canSaveNotification || notificationVerifying || notificationSaving}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {notificationVerifying ? "验证中..." : "验证连接"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleTestNotification();
                    }}
                    disabled={!canSaveNotification || notificationTesting || notificationSaving}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {notificationTesting ? "发送中..." : "发送测试通知"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeNotificationEditor}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveNotification();
                    }}
                    disabled={!canSaveNotification || notificationSaving}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {notificationSaving ? "保存中..." : "保存连接"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
