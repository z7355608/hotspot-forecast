import { useState, useCallback, useEffect, type ElementType } from "react";
import {
  BarChart2,
  ChevronDown,
  Settings,
  Sliders,
  User,
  Phone,
  X,
  Pencil,
  LogOut,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  RefreshCw,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useAppStore } from "../store/app-store";
import { Link } from "react-router-dom";
import type { FollowerScale } from "../store/prediction-types";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

type Tab = "账户" | "外观" | "通知" | "个性化";

const TABS: { id: Tab; icon: ElementType; label: string }[] = [
  { id: "账户", icon: User, label: "账户" },
  { id: "外观", icon: Settings, label: "外观" },
  { id: "通知", icon: BarChart2, label: "通知" },
  { id: "个性化", icon: Sliders, label: "个性化" },
];

const PLAN_LABEL: Record<string, string> = {
  free: "免费版",
  plus: "Plus",
  pro: "Pro",
  plus_yearly: "Plus 年付",
  pro_yearly: "Pro 年付",
};

const TX_TYPE_LABEL: Record<string, string> = {
  purchase: "购买积分",
  subscription: "订阅赠送",
  checkin: "每日签到",
  consume: "分析消耗",
  refund: "退款",
  admin: "系统调整",
};

function formatDateTime(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 把 user-agent 解析成简短设备摘要 */
function describeUserAgent(ua: string | null | undefined): { os: string; browser: string } {
  const u = ua ?? "";
  let os = "未知设备";
  if (/iPhone|iPad|iPod/.test(u)) os = "iOS";
  else if (/Android/.test(u)) os = "Android";
  else if (/Mac OS X/.test(u)) os = "macOS";
  else if (/Windows/.test(u)) os = "Windows";
  else if (/Linux/.test(u)) os = "Linux";

  let browser = "浏览器";
  if (/Edg\//.test(u)) browser = "Edge";
  else if (/Chrome\//.test(u)) browser = "Chrome";
  else if (/Firefox\//.test(u)) browser = "Firefox";
  else if (/Safari\//.test(u) && !/Chrome\//.test(u)) browser = "Safari";

  return { os, browser };
}

const FOLLOWER_SCALE_OPTIONS: { value: FollowerScale; label: string }[] = [
  { value: "0-1w", label: "0 – 1万（起号阶段）" },
  { value: "1w-10w", label: "1万 – 10万（成长期）" },
  { value: "10w-100w", label: "10万 – 100万（腰部创作者）" },
  { value: "100w+", label: "100万+（头部创作者）" },
];

const PLATFORM_OPTIONS = ["抖音", "小红书", "快手"];

/* ─── Modal overlay ─── */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── ToggleRow: 可切换行组件 ─── */
function ToggleRow({ label, desc, defaultOn = false }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => setOn(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${on ? "bg-gray-900" : "bg-gray-300"}`}
        role="switch"
        aria-checked={on}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${on ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

/* ─── SmartFillSection: AI 智能填充组件 ─── */
interface SmartFillResult {
  niche?: string;
  styleTags?: string[];
  instructions?: string;
  followerScale?: string;
}

function SmartFillSection({ onApply }: { onApply: (data: SmartFillResult) => void }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const profileQuery = trpc.personalization.getProfile.useQuery(
    { platformId: "douyin" },
    { enabled: !!user },
  );

  const analyzeMutation = trpc.personalization.analyze.useMutation({
    onSuccess: (data) => {
      if (data.status === "completed") {
        onApply({
          niche: data.suggestedNiche,
          styleTags: data.suggestedStyleTags,
          instructions: data.suggestedInstructions,
        });
        profileQuery.refetch();
      }
    },
  });

  const confirmMutation = trpc.personalization.confirmProfile.useMutation();

  const isAnalyzing = analyzeMutation.isPending;
  const hasProfile = !!profileQuery.data;
  const isLoggedIn = !!user;

  const handleAnalyze = () => {
    analyzeMutation.mutate({ platformId: "douyin" });
  };

  const handleApplySuggestions = () => {
    if (!profileQuery.data) return;
    onApply({
      niche: profileQuery.data.suggestedNiche || undefined,
      styleTags: profileQuery.data.suggestedStyleTags,
      instructions: profileQuery.data.suggestedInstructions || undefined,
    });
    confirmMutation.mutate({ platformId: "douyin" });
  };

  if (!isLoggedIn) return null;

  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/80 to-indigo-50/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">AI 智能填充</p>
            <p className="text-[11px] text-gray-400">基于你的账号连接数据，自动推断创作方向、风格标签和分析偏好</p>
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <><Loader2 className="h-3 w-3 animate-spin" />分析中…</>
          ) : hasProfile ? (
            <><RefreshCw className="h-3 w-3" />重新分析</>
          ) : (
            <><Sparkles className="h-3 w-3" />开始分析</>
          )}
        </button>
      </div>

      {/* 分析结果 */}
      {analyzeMutation.isSuccess && analyzeMutation.data.status === "completed" && (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-white/80 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            分析完成，已自动填充到下方表单
          </div>
          <div className="mt-2 space-y-1.5 text-[11px] text-gray-500">
            <p>推断赛道：<span className="font-medium text-gray-700">{analyzeMutation.data.suggestedNiche}</span></p>
            <p>风格标签：<span className="font-medium text-gray-700">{analyzeMutation.data.suggestedStyleTags?.join("、")}</span></p>
            <p>置信度：<span className="font-medium text-gray-700">{analyzeMutation.data.confidence}</span></p>
          </div>
        </div>
      )}

      {analyzeMutation.isSuccess && analyzeMutation.data.status === "unchanged" && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs text-amber-700">{analyzeMutation.data.message}</p>
        </div>
      )}

      {analyzeMutation.isError && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {analyzeMutation.error.message}
          </div>
        </div>
      )}

      {/* 已有画像显示 */}
      {hasProfile && !analyzeMutation.isPending && !analyzeMutation.isSuccess && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-violet-600 transition hover:text-violet-700"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "收起上次分析结果" : "查看上次分析结果"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-white/60 p-3 text-[11px] text-gray-500">
              <p>推断赛道：<span className="font-medium text-gray-700">{profileQuery.data?.suggestedNiche || "未知"}</span></p>
              <p>风格标签：<span className="font-medium text-gray-700">{profileQuery.data?.suggestedStyleTags?.join("、") || "无"}</span></p>
              <p>置信度：<span className="font-medium text-gray-700">{profileQuery.data?.confidence}</span></p>
              <p>分析作品数：{profileQuery.data?.inputWorksCount} 条 | 当时粉丝数：{profileQuery.data?.inputFollowers}</p>
              {!profileQuery.data?.userConfirmed && (
                <button
                  onClick={handleApplySuggestions}
                  className="mt-1 rounded-lg border border-violet-200 px-2.5 py-1 text-[11px] text-violet-600 transition hover:bg-violet-50"
                >
                  应用到表单
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── NotificationPreferencesSection ─── */
function NotificationPreferencesSection({ enabled }: { enabled: boolean }) {
  const trpcUtils = trpc.useUtils();
  const prefsQuery = trpc.auth.getPreferences.useQuery(undefined, { enabled });
  const setPrefs = trpc.auth.setPreferences.useMutation({
    onMutate: async (vars) => {
      // 乐观更新
      await trpcUtils.auth.getPreferences.cancel();
      const prev = trpcUtils.auth.getPreferences.getData();
      if (prev) {
        trpcUtils.auth.getPreferences.setData(undefined, { ...prev, ...vars });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) trpcUtils.auth.getPreferences.setData(undefined, ctx.prev);
    },
    onSettled: () => trpcUtils.auth.getPreferences.invalidate(),
  });

  if (!enabled) {
    return (
      <p className="text-xs text-gray-400">登录后可配置通知偏好</p>
    );
  }

  if (prefsQuery.isLoading || !prefsQuery.data) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        加载中…
      </div>
    );
  }

  const prefs = prefsQuery.data;
  const items: { key: "productUpdates" | "taskCompleteEmail"; label: string; desc: string }[] = [
    { key: "productUpdates", label: "接收产品更新", desc: "新功能发布和优化推送" },
    { key: "taskCompleteEmail", label: "任务完成通知", desc: "分析任务完成后通过邮件提醒" },
  ];

  return (
    <div className="space-y-5">
      {items.map(({ key, label, desc }) => {
        const val = prefs[key];
        return (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-800">{label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{desc}</p>
            </div>
            <button
              type="button"
              disabled={setPrefs.isPending}
              onClick={() => setPrefs.mutate({ [key]: !val } as { productUpdates?: boolean; taskCompleteEmail?: boolean })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 ${val ? "bg-gray-900" : "bg-gray-300"}`}
              role="switch"
              aria-checked={val}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${val ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function SettingsPage() {
  const { state, updateUserProfile } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const trpcUtils = trpc.useUtils();
  const [showDevices, setShowDevices] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [tab, setTab] = useState<Tab>("账户");
  // 深色模式当前未上线，强制锁在浅色（包含为旧用户清掉残留的 dark localStorage）
  const [appearance] = useState<"浅色">("浅色");
  useEffect(() => {
    try {
      if (localStorage.getItem("theme") === "dark") localStorage.setItem("theme", "light");
    } catch {
      /* ignore storage access failures (private mode) */
    }
    if (theme === "dark" && toggleTheme) toggleTheme();
  }, [theme, toggleTheme]);

  // 个性化 tab 使用 store 中的 userProfile
  const profile = state.userProfile;

  const togglePlatform = (platform: string) => {
    const next = profile.platforms.includes(platform)
      ? profile.platforms.filter((item) => item !== platform)
      : [...profile.platforms, platform];
    updateUserProfile({ platforms: next });
  };

  /* ─── 账户实时数据 ─── */
  const balanceQuery = trpc.credits.getBalance.useQuery(undefined, { enabled: !!user });
  const subscriptionQuery = trpc.credits.getSubscription.useQuery(undefined, { enabled: !!user });
  const transactionsQuery = trpc.credits.getTransactions.useQuery(
    { limit: 20, offset: 0 },
    { enabled: !!user && showActivityLog }
  );
  const sessionsQuery = trpc.auth.listSessions.useQuery(undefined, {
    enabled: !!user && showDevices,
  });

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => trpcUtils.auth.me.invalidate(),
  });
  const revokeSessionMutation = trpc.auth.revokeSession.useMutation({
    onSuccess: () => trpcUtils.auth.listSessions.invalidate(),
  });

  /* ─── Account state ─── */
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  // 后端进来的真实昵称，editingNickname 切到 true 时同步进 input
  useEffect(() => {
    if (!editingNickname) setNicknameInput(user?.name ?? "");
  }, [user?.name, editingNickname]);

  const accountPhoneMasked = user?.phoneMasked ?? "未绑定";
  const accountEmail = user?.email ?? "";

  /* ─── Email modal ─── */
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  useEffect(() => {
    if (showEmailModal) setEmailInput(accountEmail);
  }, [showEmailModal, accountEmail]);
  const isEmailValid = !emailInput || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);

  /* ─── Delete account modal ─── */
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      setEditingNickname(false);
      return;
    }
    try {
      await updateProfileMutation.mutateAsync({ name: trimmed });
      setEditingNickname(false);
    } catch (err) {
      console.error("[Settings] save nickname failed", err);
    }
  }, [nicknameInput, updateProfileMutation]);

  const handleSaveEmail = useCallback(async () => {
    if (!isEmailValid) return;
    try {
      await updateProfileMutation.mutateAsync({ email: emailInput || null });
      setShowEmailModal(false);
    } catch (err) {
      console.error("[Settings] save email failed", err);
    }
  }, [isEmailValid, emailInput, updateProfileMutation]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      console.error("[Settings] logout failed", err);
    }
  }, [logout]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-8 text-xl text-gray-900">设置</h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:w-40 lg:flex-col lg:overflow-visible lg:pb-0">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors lg:w-full ${
                tab === id
                  ? "bg-gray-200 text-gray-900"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-[480px] flex-1 space-y-7 rounded-2xl border border-gray-100 bg-white p-5 sm:p-7">
          {/* ═══════════════════════════════════════════
              账户 Tab - Enhanced
              ═══════════════════════════════════════════ */}
          {tab === "账户" && (() => {
            const credits = balanceQuery.data?.credits ?? 0;
            const planKey = balanceQuery.data?.membershipPlan ?? "free";
            const planLabel = PLAN_LABEL[planKey] ?? planKey;
            const sub = subscriptionQuery.data?.subscription ?? null;
            const monthlyQuota = sub?.monthlyCredits ?? 0;
            const sessionCount = sessionsQuery.data?.sessions.length ?? 0;
            const displayName = (user?.name && user.name.trim()) || (user?.phoneMasked ?? "U");

            return (
            <>
              {/* Profile section */}
              <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-lg font-bold text-white">
                    {displayName[0] || "U"}
                  </div>
                </div>
                <div className="flex-1">
                  {editingNickname ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={nicknameInput}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        maxLength={20}
                        autoFocus
                      />
                      <button
                        disabled={updateProfileMutation.isPending}
                        onClick={handleSaveNickname}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {updateProfileMutation.isPending ? "保存中…" : "保存"}
                      </button>
                      <button
                        onClick={() => setEditingNickname(false)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{displayName}</p>
                      <button
                        onClick={() => setEditingNickname(true)}
                        className="text-gray-400 transition hover:text-gray-600"
                        aria-label="编辑昵称"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">创作者账户</p>
                </div>
              </div>

              {/* Account info section */}
              <div>
                <p className="mb-4 text-xs uppercase tracking-wider text-gray-400">账户信息</p>
                <div className="space-y-1">
                  {/* Phone */}
                  <div className="flex items-center justify-between rounded-xl px-1 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                        <Phone className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-800">手机号码</p>
                        <p className="text-xs text-gray-400">{accountPhoneMasked}</p>
                      </div>
                    </div>
                    <button
                      disabled
                      title="短信网关接入中，敬请期待"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-300 cursor-not-allowed"
                    >
                      敬请期待
                    </button>
                  </div>

                  <div className="h-px bg-gray-100" />

                  {/* Email (optional) */}
                  <div className="flex items-center justify-between rounded-xl px-1 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-800">邮箱地址</p>
                        <p className="text-xs text-gray-400">
                          {accountEmail || "未绑定 · 绑定后可接收通知"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                    >
                      {accountEmail ? "修改" : "绑定"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Subscription section */}
              <div>
                <p className="mb-4 text-xs uppercase tracking-wider text-gray-400">订阅与积分</p>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">当前套餐</p>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {balanceQuery.isLoading ? "加载中…" : planLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {sub
                          ? `每月 ${monthlyQuota} 积分 · 到期 ${formatDateTime(sub.endAt)}`
                          : "免费用户 · 升级享更多积分"}
                      </p>
                    </div>
                    <Link
                      to="/credits"
                      className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/90"
                    >
                      {sub ? "管理订阅" : "升级 Pro"}
                    </Link>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{credits}</p>
                      <p className="text-[10px] text-gray-400">剩余积分</p>
                    </div>
                    {sub && (
                      <div className="rounded-lg bg-white p-2.5 text-center">
                        <p className="text-lg font-bold text-gray-800">{monthlyQuota}</p>
                        <p className="text-[10px] text-gray-400">月度额度</p>
                      </div>
                    )}
                    <div className="rounded-lg bg-white p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">{sub?.autoRenew ? "是" : "否"}</p>
                      <p className="text-[10px] text-gray-400">自动续费</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Security section */}
              <div>
                <p className="mb-4 text-xs uppercase tracking-wider text-gray-400">安全与隐私</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-800">登录设备管理</p>
                      <p className="text-xs text-gray-400">
                        {sessionsQuery.data
                          ? `当前 ${sessionCount} 个活跃会话`
                          : "查看当前登录的设备"}
                      </p>
                    </div>
                    <button onClick={() => setShowDevices(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50">
                      查看
                    </button>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-800">积分明细</p>
                      <p className="text-xs text-gray-400">查看最近的积分变动记录</p>
                    </div>
                    <button onClick={() => setShowActivityLog(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50">
                      查看
                    </button>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        <Link to="/terms" className="hover:underline">服务条款</Link>
                        {" · "}
                        <Link to="/privacy" className="hover:underline">隐私政策</Link>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Danger zone */}
              <div>
                <p className="mb-4 text-xs uppercase tracking-wider text-red-400">危险操作</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-800">退出登录</p>
                    <p className="text-xs text-gray-400">退出当前账户</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    退出
                  </button>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-red-600">注销账户</p>
                    <p className="text-xs text-gray-400">永久删除账户和所有数据，此操作不可撤销</p>
                  </div>
                  <button
                    onClick={() => setShowDeleteAccount(true)}
                    disabled
                    title="注销流程接入中，请联系客服"
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 opacity-50 cursor-not-allowed"
                  >
                    注销
                  </button>
                </div>
              </div>
            </>
            );
          })()}

          {/* ═══ 外观 Tab ═══ */}
          {tab === "外观" && (
            <>
              <div>
                <p className="mb-4 text-sm text-gray-700">外观</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  {(["浅色", "深色", "跟随系统"] as const).map((key) => {
                    const isActive = appearance === key;
                    const isDisabled = key !== "浅色";
                    const previewBody = (
                      <>
                        {key === "浅色" && (
                          <div className="flex h-full w-full flex-col gap-1.5 bg-[#f5f4f2] p-2">
                            <div className="h-2 w-full rounded bg-[#e0ddd8]" />
                            <div className="h-2 w-3/4 rounded bg-[#e0ddd8]" />
                            <div className="h-2 w-full rounded bg-[#e0ddd8]" />
                          </div>
                        )}
                        {key === "深色" && (
                          <div className="flex h-full w-full flex-col gap-1.5 bg-[#1a1a1a] p-2">
                            <div className="h-2 w-full rounded bg-[#333]" />
                            <div className="h-2 w-3/4 rounded bg-[#333]" />
                            <div className="h-2 w-full rounded bg-[#333]" />
                          </div>
                        )}
                        {key === "跟随系统" && (
                          <div className="flex h-full w-full">
                            <div className="flex w-1/2 flex-col gap-1.5 bg-[#f5f4f2] p-2">
                              <div className="h-2 w-full rounded bg-[#e0ddd8]" />
                              <div className="h-2 w-full rounded bg-[#e0ddd8]" />
                            </div>
                            <div className="flex w-1/2 flex-col gap-1.5 bg-[#1a1a1a] p-2">
                              <div className="h-2 w-full rounded bg-[#333]" />
                              <div className="h-2 w-full rounded bg-[#333]" />
                            </div>
                          </div>
                        )}
                      </>
                    );
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isDisabled}
                        title={isDisabled ? "深色模式适配中，敬请期待" : ""}
                        className={`flex flex-col items-center gap-2 ${isDisabled ? "cursor-not-allowed" : ""}`}
                      >
                        <div
                          className={`relative w-full overflow-hidden rounded-xl border-2 transition-colors ${
                            isActive ? "border-gray-900" : "border-gray-200"
                          } ${isDisabled ? "opacity-50" : ""}`}
                          style={{ height: 72 }}
                        >
                          {previewBody}
                          {isDisabled && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-500 shadow-sm">
                                适配中
                              </span>
                            </div>
                          )}
                        </div>
                        <span className={`text-xs ${isActive ? "text-gray-900" : "text-gray-400"}`}>
                          {key}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-gray-400">
                  深色模式还在做整体视觉适配，预计后续版本上线。当前固定使用浅色主题。
                </p>
              </div>
            </>
          )}

          {/* ═══ 通知 Tab ═══ */}
          {tab === "通知" && (
            <NotificationPreferencesSection enabled={!!user} />
          )}

          {/* ═══ 个性化 Tab ═══ */}
          {tab === "个性化" && (
            <div className="space-y-5">
              {/* ── 智能填充区域 ── */}
              <SmartFillSection onApply={(data) => {
                if (data.niche) updateUserProfile({ niche: data.niche });
                if (data.styleTags?.length) updateUserProfile({ contentStyleTags: data.styleTags });
                if (data.instructions) updateUserProfile({ instructions: data.instructions });
                if (data.followerScale) updateUserProfile({ followerScale: data.followerScale as FollowerScale });
              }} />

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">创作者昵称</label>
                <input
                  value={profile.nickname}
                  onChange={(event) => updateUserProfile({ nickname: event.target.value })}
                  placeholder="你在各平台使用的名字"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder-gray-300 focus:border-gray-400"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">创作方向 / 垂类</label>
                <input
                  value={profile.niche}
                  onChange={(event) => updateUserProfile({ niche: event.target.value })}
                  placeholder="如：美食探店、职场干货、母婴育儿…"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder-gray-300 focus:border-gray-400"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-gray-400">主要运营平台</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => togglePlatform(platform)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        profile.platforms.includes(platform)
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">账号规模</label>
                <div className="relative">
                  <select
                    value={profile.followerScale}
                    onChange={(event) => updateUserProfile({ followerScale: event.target.value as FollowerScale })}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-400"
                  >
                    <option value="">选择粉丝量级</option>
                    {FOLLOWER_SCALE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs text-gray-400">AI 分析偏好 / 自定义指令</label>
                  <span className="text-xs text-gray-300">{profile.instructions.length} / 300</span>
                </div>
                <textarea
                  value={profile.instructions}
                  onChange={(event) => event.target.value.length <= 300 && updateUserProfile({ instructions: event.target.value })}
                  rows={3}
                  placeholder="告诉 AI 你希望它在分析爆款时优先考虑什么…"
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder-gray-300 focus:border-gray-400"
                />
              </div>
              {profile.lastAutoSyncAt && (
                <p className="text-[11px] text-gray-300">部分字段已由账号连接自动填充</p>
              )}
            </div>
          )}

          {/* 数据控制 Tab 已移除，固定使用真实数据模式 */}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          Modals
          ═══════════════════════════════════════════ */}

      {/* Email Modal */}
      <Modal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title={accountEmail ? "修改邮箱" : "绑定邮箱"}
      >
        <p className="mb-4 text-sm text-gray-500">绑定邮箱后可接收任务完成等通知。</p>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">邮箱地址</label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value.trim())}
            placeholder="name@example.com"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
          {!isEmailValid && emailInput && (
            <p className="mt-1 text-xs text-red-500">邮箱格式不正确</p>
          )}
        </div>
        {updateProfileMutation.error && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            {updateProfileMutation.error.message}
          </div>
        )}
        <button
          onClick={handleSaveEmail}
          disabled={!isEmailValid || updateProfileMutation.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {updateProfileMutation.isPending ? "保存中…" : "保存"}
        </button>
      </Modal>

      {/* Delete Account Modal */}
      <Modal open={showDeleteAccount} onClose={() => { setShowDeleteAccount(false); setDeleteConfirmText(""); }} title="注销账户">
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">此操作不可撤销！</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>所有分析历史和保存的结果将被永久删除</li>
            <li>剩余积分和会员权益将立即失效</li>
            <li>账户数据将在 30 天内完全清除</li>
          </ul>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            请输入 <strong className="text-red-600">确认注销</strong> 以继续
          </label>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="确认注销"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm outline-none transition focus:border-red-400 focus:bg-white focus:ring-2 focus:ring-red-100"
          />
        </div>
        <p className="mt-3 text-xs text-amber-600">
          注销流程接入中。如需立即注销，请联系客服。
        </p>
      </Modal>

      {/* Devices Modal — 真实会话列表 */}
      <Modal open={showDevices} onClose={() => setShowDevices(false)} title="登录设备管理">
        {sessionsQuery.isLoading || !sessionsQuery.data ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </div>
        ) : sessionsQuery.data.sessions.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">暂无登录会话记录</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {sessionsQuery.data.sessions.map((s) => {
              const { os, browser } = describeUserAgent(s.userAgent);
              const isMobile = /iOS|Android/.test(os);
              const Icon = isMobile ? Smartphone : Monitor;
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-3 ${s.isCurrent ? "border-emerald-100 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.isCurrent ? "bg-emerald-100" : "bg-white"}`}>
                      <Icon className={`h-5 w-5 ${s.isCurrent ? "text-emerald-600" : "text-gray-500"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-800">{os} · {browser}</p>
                        {s.isCurrent && (
                          <span className="shrink-0 rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">当前会话</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        登录于 {formatDateTime(s.createdAt)}
                        {s.ip ? ` · ${s.ip}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">最近活跃 {formatDateTime(s.lastActiveAt)}</p>
                    </div>
                    {!s.isCurrent && (
                      <button
                        type="button"
                        disabled={revokeSessionMutation.isPending}
                        onClick={() => revokeSessionMutation.mutate({ sessionId: s.id })}
                        className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 transition hover:bg-white disabled:opacity-50"
                      >
                        {revokeSessionMutation.isPending ? "处理中…" : "下线"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-gray-400">如发现可疑设备，请立即下线并联系客服</p>
      </Modal>

      {/* Activity Log Modal — 真实积分明细 */}
      <Modal open={showActivityLog} onClose={() => setShowActivityLog(false)} title="积分明细">
        {transactionsQuery.isLoading || !transactionsQuery.data ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </div>
        ) : transactionsQuery.data.transactions.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">暂无积分变动记录</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {transactionsQuery.data.transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <div key={tx.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
                    <Sparkles className={`h-3.5 w-3.5 ${isPositive ? "text-emerald-500" : "text-gray-400"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-700">{tx.description}</p>
                    <p className="text-xs text-gray-400">
                      {TX_TYPE_LABEL[tx.type] ?? tx.type} · {formatDateTime(tx.createdAt)}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-medium ${isPositive ? "text-emerald-600" : "text-gray-700"}`}>
                    {isPositive ? "+" : ""}{tx.amount}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="pt-2 text-center text-xs text-gray-400">
          仅显示最近 {transactionsQuery.data?.transactions.length ?? 0} 条记录，完整流水请前往「积分中心」
        </p>
      </Modal>
    </div>
  );
}
