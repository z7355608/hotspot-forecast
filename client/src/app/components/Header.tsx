import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Coins, LogOut, Menu, Settings, Sparkles, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AI_MODELS,
  canUseModel,
  getModelOption,
  getModelRequiredPlanLabel,
} from "../store/app-data";
import { getMembershipLabel, useAppStore } from "../store/app-store";
import { trpc } from "../../lib/trpc";

/** 实时从后端获取积分余额的按钮 */
function HeaderCreditsButton({
  onOpenCredits,
  fallbackCredits,
}: {
  onOpenCredits?: () => void;
  fallbackCredits: number;
}) {
  const { user } = useAuth();
  const balanceQuery = trpc.credits.getBalance.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
  });
  const credits = balanceQuery.data?.credits ?? fallbackCredits;
  return (
    <button
      type="button"
      onClick={onOpenCredits}
      className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 transition-colors hover:bg-gray-100 sm:px-3"
    >
      <Coins className="h-4 w-4 text-amber-600" />
      <span>{credits}</span>
    </button>
  );
}

/** Extract initials from user name (supports Chinese and English) */
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // For Chinese names, take the last 1-2 characters (given name)
  const isChinese = /[\u4e00-\u9fff]/.test(trimmed);
  if (isChinese) {
    return trimmed.length <= 2 ? trimmed : trimmed.slice(-2);
  }
  // For English names, take first letter of first and last name
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Header({
  onOpenNav,
  onOpenCredits,
  onOpenNotifications,
}: {
  onOpenNav?: () => void;
  onOpenCredits?: () => void;
  onOpenNotifications?: () => void;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { state, resetAppState, setSelectedModel } = useAppStore();
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!modelRef.current?.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
      if (!profileRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedModel = getModelOption(state.selectedModel);
  const membershipLabel = getMembershipLabel(state.membershipPlan);

  // Use real user info from auth, with fallbacks
  const displayName = user?.name || "用户";
  const displayInitials = getInitials(user?.name);
  const displayEmail = user?.email || "";

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    resetAppState();
    setShowProfileMenu(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenNav}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-0" ref={modelRef}>
            <button
              type="button"
              onClick={() => setShowModelMenu((value) => !value)}
              className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-900 transition-colors hover:bg-gray-50 sm:px-3"
            >
              <span className="max-w-[11rem] truncate sm:max-w-[15rem]">
                {selectedModel.name}
              </span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                {selectedModel.badge}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${showModelMenu ? "rotate-180" : ""}`}
              />
            </button>
            {showModelMenu && (
              <div className="absolute left-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl">
                {AI_MODELS.map((model) => {
                  const active = model.id === state.selectedModel;
                  const available = canUseModel(state.membershipPlan, model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        if (!available) {
                          setShowModelMenu(false);
                          onOpenCredits?.();
                          return;
                        }

                        setSelectedModel(model.id);
                        setShowModelMenu(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors ${
                        active
                          ? "bg-gray-900 text-white"
                          : available
                            ? "hover:bg-gray-50"
                            : "opacity-70 hover:bg-gray-50"
                      }`}
                    >
                      <div>
                        <div className="text-sm">{model.name}</div>
                        <div
                          className={`mt-1 text-xs ${active ? "text-white/70" : "text-gray-400"}`}
                        >
                          {available
                            ? `创作趋势分析模型 · ${model.badge} 计费`
                            : `${getModelRequiredPlanLabel(model.id)} · ${model.badge} 计费`}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          active
                            ? "bg-white/15 text-white"
                            : available
                              ? "bg-gray-100 text-gray-500"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {active
                          ? "当前"
                          : available
                            ? model.badge
                            : model.requiredPlan === "plus"
                              ? "Plus"
                              : "Pro"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>
          <HeaderCreditsButton onOpenCredits={onOpenCredits} fallbackCredits={state.credits} />
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu((value) => !value)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a6b5a] text-xs font-semibold text-white"
            >
              {displayInitials}
            </button>
            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-2 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-100 bg-white p-3 shadow-2xl">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a6b5a] text-sm font-semibold text-white">
                    {displayInitials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-900">
                      {displayName}
                    </div>
                    {displayEmail && (
                      <div className="truncate text-xs text-gray-400">
                        {displayEmail}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {[
                    { label: "账户设置", to: "/settings", icon: Settings },
                    { label: "账号连接", to: "/connectors", icon: Link2 },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        navigate(item.to);
                        setShowProfileMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <item.icon className="h-4 w-4 text-gray-400" />
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 text-red-300" />
                    退出登录
                  </button>
                </div>
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  当前方案：{membershipLabel}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
