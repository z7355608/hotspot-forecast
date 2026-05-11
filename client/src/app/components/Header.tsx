import { useEffect, useRef, useState } from "react";
import { Bell, Coins, LogOut, Menu, Settings, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import { getMembershipLabel, useAppStore } from "../store/app-store";
import { trpc } from "../../lib/trpc";

/** 通知铃铛 + 真实未读红点 */
function NotificationBellButton({
  onOpenNotifications,
}: {
  onOpenNotifications?: () => void;
}) {
  const { user } = useAuth();
  const unreadQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const hasUnread = (unreadQuery.data?.count ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={onOpenNotifications}
      className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
    >
      <Bell className="h-5 w-5" />
      {hasUnread && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
      )}
    </button>
  );
}

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
  const { state, resetAppState } = useAppStore();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

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
    navigate("/hot-topic-recommendations");
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
          <div className="min-w-0 text-sm font-medium text-gray-900">
            爆款预测agent
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <NotificationBellButton onOpenNotifications={onOpenNotifications} />
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
