import { useState, useCallback, useEffect, type ElementType } from "react";
import { apiFetch } from "../lib/api-utils";
import {
  BarChart2,
  ChevronDown,
  Settings,
  Shield,
  Sliders,
  User,
  Phone,
  Lock,
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  Pencil,
  LogOut,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  RefreshCw,
  Monitor,
  Smartphone,
  Clock,
  Download,
  FileText,
  Sun,
  Moon,
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
  // 数据控制 tab 已移除（固定使用真实数据模式）
];

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

export function SettingsPage() {
  const { state, dataMode, updateUserProfile } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [showDevices, setShowDevices] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [tab, setTab] = useState<Tab>("账户");
  const [language, setLanguage] = useState("简体中文");
  const [appearance, setAppearance] = useState<"浅色" | "深色" | "跟随系统">(
    theme === "dark" ? "深色" : "浅色"
  );

  const handleAppearanceChange = (key: "浅色" | "深色" | "跟随系统") => {
    setAppearance(key);
    if (key === "浅色" && theme === "dark" && toggleTheme) toggleTheme();
    if (key === "深色" && theme === "light" && toggleTheme) toggleTheme();
    if (key === "跟随系统") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark && theme === "light" && toggleTheme) toggleTheme();
      if (!prefersDark && theme === "dark" && toggleTheme) toggleTheme();
    }
  };
  const [updates, setUpdates] = useState(true);
  const [emailNotify, setEmailNotify] = useState(true);

  // 个性化 tab 使用 store 中的 userProfile
  const profile = state.userProfile;

  const togglePlatform = (platform: string) => {
    const next = profile.platforms.includes(platform)
      ? profile.platforms.filter((item) => item !== platform)
      : [...profile.platforms, platform];
    updateUserProfile({ platforms: next });
  };

  /* ─── Account state ─── */
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("张书萍");
  const [accountPhone] = useState("138****8000");
  const [accountEmail, setAccountEmail] = useState("");

  /* ─── Change phone modal ─── */
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [phoneStep, setPhoneStep] = useState<"input" | "verify">("input");

  /* ─── Change password modal ─── */
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  /* ─── Delete account modal ─── */
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  /* ─── Countdown timer ─── */
  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = setTimeout(() => setPhoneCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phoneCountdown]);

  const isNewPhoneValid = /^1[3-9]\d{9}$/.test(newPhone);
  const isPhoneCodeValid = /^\d{4,6}$/.test(phoneCode);

  const handleSendPhoneCode = useCallback(async () => {
    if (!isNewPhoneValid || phoneCountdown > 0) return;
    // TODO: integrate with Alibaba Cloud SMS API
    await new Promise((r) => setTimeout(r, 500));
    setPhoneStep("verify");
    setPhoneCountdown(60);
  }, [isNewPhoneValid, phoneCountdown]);

  const handleChangePhone = useCallback(async () => {
    if (!isPhoneCodeValid) return;
    // TODO: integrate with backend
    await new Promise((r) => setTimeout(r, 500));
    setShowChangePhone(false);
    setPhoneStep("input");
    setNewPhone("");
    setPhoneCode("");
  }, [isPhoneCodeValid]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmNewPassword) return;
    // TODO: integrate with backend
    await new Promise((r) => setTimeout(r, 500));
    setShowChangePassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }, [currentPassword, newPassword, confirmNewPassword]);

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
          {tab === "账户" && (
            <>
              {/* Profile section */}
              <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-lg font-bold text-white">
                    {nicknameInput[0] || "U"}
                  </div>
                  <button className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-gray-500 transition hover:bg-gray-200">
                    <Pencil className="h-3 w-3" />
                  </button>
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
                        onClick={() => { setEditingNickname(false); /* TODO: save to backend */ }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white transition hover:bg-primary/90"
                      >
                        保存
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
                      <p className="text-sm font-medium text-gray-800">{nicknameInput}</p>
                      <button
                        onClick={() => setEditingNickname(true)}
                        className="text-gray-400 transition hover:text-gray-600"
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
                        <p className="text-xs text-gray-400">{accountPhone}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowChangePhone(true)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                    >
                      更换
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
                      onClick={() => {
                        const email = prompt("请输入邮箱地址：");
                        if (email) setAccountEmail(email);
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                    >
                      {accountEmail ? "修改" : "绑定"}
                    </button>
                  </div>

                  <div className="h-px bg-gray-100" />

                  {/* Password */}
                  <div className="flex items-center justify-between rounded-xl px-1 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                        <Lock className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-800">登录密码</p>
                        <p className="text-xs text-gray-400">已设置 · 上次修改 30 天前</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                    >
                      修改
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
                          免费版
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">每月 200 积分 · 基础功能</p>
                    </div>
                    <button className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/90">
                      升级 Pro
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-white p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">62</p>
                      <p className="text-[10px] text-gray-400">剩余积分</p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">138</p>
                      <p className="text-[10px] text-gray-400">已使用</p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 text-center">
                      <p className="text-lg font-bold text-gray-800">200</p>
                      <p className="text-[10px] text-gray-400">月度额度</p>
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
                      <p className="text-xs text-gray-400">当前 1 台设备在线</p>
                    </div>
                    <button onClick={() => setShowDevices(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50">
                      查看
                    </button>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-800">操作日志</p>
                      <p className="text-xs text-gray-400">查看最近的账户操作记录</p>
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
                  <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50">
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
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 transition hover:bg-red-50"
                  >
                    注销
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══ 外观 Tab ═══ */}
          {tab === "外观" && (
            <>
              <div>
                <p className="mb-4 text-xs uppercase tracking-wider text-gray-400">通用</p>
                <div>
                  <p className="mb-2 text-sm text-gray-700">语言</p>
                  <div className="relative inline-block w-full sm:w-auto">
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-400 sm:w-auto"
                    >
                      <option>简体中文</option>
                      <option>繁體中文</option>
                      <option>English</option>
                      <option>日本語</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>
              <div className="h-px bg-gray-100" />
              <div>
                <p className="mb-4 text-sm text-gray-700">外观</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  {(["浅色", "深色", "跟随系统"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => handleAppearanceChange(key)}
                      className="flex flex-col items-center gap-2"
                    >
                      <div
                        className={`w-full overflow-hidden rounded-xl border-2 transition-colors ${
                          appearance === key ? "border-gray-900" : "border-gray-200"
                        }`}
                        style={{ height: 72 }}
                      >
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
                      </div>
                      <span className={`text-xs ${appearance === key ? "text-gray-900" : "text-gray-400"}`}>
                        {key}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ═══ 通知 Tab ═══ */}
          {tab === "通知" && (
            <div className="space-y-5">
              {[
                { label: "接收产品更新", desc: "新功能发布和优化推送", val: updates, set: setUpdates },
                { label: "任务完成通知", desc: "分析任务完成后发送邮件", val: emailNotify, set: setEmailNotify },
              ].map(({ label, desc, val, set }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-800">{label}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set(!val)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${val ? "bg-gray-900" : "bg-gray-300"}`}
                    role="switch"
                    aria-checked={val}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${val ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              ))}
            </div>
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

      {/* Change Phone Modal */}
      <Modal open={showChangePhone} onClose={() => { setShowChangePhone(false); setPhoneStep("input"); setNewPhone(""); setPhoneCode(""); }} title="更换手机号码">
        {phoneStep === "input" ? (
          <>
            <p className="mb-4 text-sm text-gray-500">当前手机号：{accountPhone}。更换后将使用新手机号登录。</p>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">新手机号码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="请输入新手机号码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  maxLength={11}
                />
              </div>
            </div>
            <button
              onClick={handleSendPhoneCode}
              disabled={!isNewPhoneValid}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              发送验证码
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">验证码已发送至 {newPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}</p>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">验证码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <ShieldCheck className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="请输入验证码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-28 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  maxLength={6}
                  autoFocus
                />
                <button
                  onClick={handleSendPhoneCode}
                  disabled={!isNewPhoneValid || phoneCountdown > 0}
                  className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-medium text-violet-600 transition hover:bg-violet-50 disabled:text-gray-400"
                >
                  {phoneCountdown > 0 ? `${phoneCountdown}s` : "重发"}
                </button>
              </div>
            </div>
            <button
              onClick={handleChangePhone}
              disabled={!isPhoneCodeValid}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              确认更换
            </button>
          </>
        )}
      </Modal>

      {/* Change Password Modal */}
      <Modal open={showChangePassword} onClose={() => { setShowChangePassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword(""); }} title="修改密码">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">当前密码</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">新密码</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 8 位，包含字母和数字"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
              >
                {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && newPassword.length < 8 && (
              <p className="mt-1 text-xs text-amber-600">密码长度至少 8 位</p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">确认新密码</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type={showNewPw ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
            </div>
            {confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
            )}
          </div>
        </div>
        <button
          onClick={handleChangePassword}
          disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmNewPassword}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          确认修改
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
        <button
          disabled={deleteConfirmText !== "确认注销"}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          永久注销账户
        </button>
      </Modal>

      {/* Devices Modal */}
      <Modal open={showDevices} onClose={() => setShowDevices(false)} title="登录设备管理">
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <Monitor className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800">当前设备</p>
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">在线</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Win') ? 'Windows' : 'Linux'} · {navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Safari'}</p>
                <p className="text-xs text-gray-400">本次登录时间：{new Date().toLocaleDateString('zh-CN')}</p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400">如发现可疑设备，请立即修改密码</p>
        </div>
      </Modal>

      {/* Activity Log Modal */}
      <Modal open={showActivityLog} onClose={() => setShowActivityLog(false)} title="操作日志">
        <div className="space-y-2">
          {[
            { action: "登录账户", time: new Date().toLocaleString('zh-CN'), icon: LogOut },
            { action: "连接抖音账号", time: new Date(Date.now() - 86400000).toLocaleString('zh-CN'), icon: Check },
            { action: "修改个性化设置", time: new Date(Date.now() - 172800000).toLocaleString('zh-CN'), icon: Settings },
            { action: "执行爆款预测分析", time: new Date(Date.now() - 259200000).toLocaleString('zh-CN'), icon: Sparkles },
            { action: "创建监控任务", time: new Date(Date.now() - 345600000).toLocaleString('zh-CN'), icon: Clock },
          ].map(({ action, time, icon: Icon }) => (
            <div key={action + time} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                <Icon className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">{action}</p>
                <p className="text-xs text-gray-400">{time}</p>
              </div>
            </div>
          ))}
          <p className="pt-2 text-center text-xs text-gray-400">仅显示最近 30 天的操作记录</p>
        </div>
      </Modal>
    </div>
  );
}
