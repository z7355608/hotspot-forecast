import { useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Headphones,
  Link2,
  LineChart,
  Package,
  Scissors,
  Search,
  Settings,
  Share2,
  Sparkles,
  SquarePen,
  X,
  Zap,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useOnboarding } from "../lib/onboarding-context";

/* ------------------------------------------------------------------ */
/*  导航数据                                                            */
/* ------------------------------------------------------------------ */

const MAIN_NAV = [
  { to: "/", icon: SquarePen, label: "爆款预测Agent", end: true },
  { to: "/low-follower-opportunities", icon: Search, label: "低粉爆款" },
  { to: "/monitor", icon: Activity, label: "智能监控", badge: "Pro" },
  { to: "/account-center", icon: BarChart3, label: "创作中心" },
  { to: "/performance", icon: LineChart, label: "效果追踪" },
];

const TOOLBOX_ITEMS = [
  { to: "/toolbox?tool=video_download", icon: Download, label: "视频万能下载", cost: 5 },
  { to: "/toolbox?tool=video_remove_subtitle", icon: Scissors, label: "视频去字幕", cost: 10 },
  { to: "/toolbox?tool=text_extract", icon: FileText, label: "文案提取", cost: 3 },
];

const SECONDARY_NAV = [
  { to: "/history", icon: Clock, label: "历史记录" },
  { to: "/credits", icon: Zap, label: "积分 / 会员" },
  { to: "/connectors", icon: Link2, label: "账号连接" },
];

/* ------------------------------------------------------------------ */
/*  子组件                                                              */
/* ------------------------------------------------------------------ */

function SidebarLink({
  to,
  icon: Icon,
  label,
  end,
  badge,
  newFeatureId,
  onNavigate,
}: {
  to: string;
  icon: typeof Sparkles;
  label: string;
  end?: boolean;
  badge?: string;
  newFeatureId?: string;
  onNavigate?: () => void;
}) {
  const { newFeaturesSeen, markFeatureSeen } = useOnboarding();
  const showDot = newFeatureId && !newFeaturesSeen[newFeatureId];

  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => {
        if (newFeatureId && showDot) markFeatureSeen(newFeatureId);
        onNavigate?.();
      }}
      className={({ isActive }) =>
        `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-gray-200 text-gray-700"
            : "text-gray-600 hover:bg-gray-200"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {showDot && (
        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
      )}
      {badge && !showDot && (
        <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-700">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/** 可展开/收起的工具箱菜单 */
function ToolboxMenu({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const isToolboxActive = location.pathname === "/toolbox";
  const [expanded, setExpanded] = useState(isToolboxActive);

  return (
    <div>
      {/* 工具箱父级按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isToolboxActive
            ? "bg-gray-200 text-gray-700"
            : "text-gray-600 hover:bg-gray-200"
        }`}
      >
        <Package className="h-4 w-4" />
        <span className="flex-1 text-left">创作工具箱</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* 子菜单 */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? "mt-0.5 max-h-40 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="ml-3 space-y-0.5 border-l border-gray-200 pl-3">
          {TOOLBOX_ITEMS.map((item) => {
            const Icon = item.icon;
            // 判断当前子项是否 active
            const isActive =
              location.pathname === "/toolbox" &&
              location.search.includes(
                `tool=${item.to.split("tool=")[1]}`,
              );
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "bg-gray-200 text-gray-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-600"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SidebarContent                                                     */
/* ------------------------------------------------------------------ */

function SidebarContent({
  onNavigate,
  onOpenInvite,
}: {
  onNavigate?: () => void;
  onOpenInvite?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <>
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-medium text-gray-900">
            爆款预测Agent
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {MAIN_NAV.map((item) => (
            <SidebarLink key={item.to} {...item} onNavigate={onNavigate}
              newFeatureId={item.to === "/low-follower-opportunities" ? "low_follower_page" : undefined}
            />
          ))}
          {/* 工具箱 - 可展开/收起 */}
          <ToolboxMenu onNavigate={onNavigate} />
        </div>

        <div className="h-px bg-gray-200" />

        <div className="space-y-1">
          {SECONDARY_NAV.map((item) => (
            <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        </div>

      </nav>

      <div className="border-t border-gray-200 p-3">
        <button
          type="button"
          onClick={() => {
            onOpenInvite?.();
            onNavigate?.();
          }}
          className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
            <Share2 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900">邀请好友</p>
            <p className="text-xs text-gray-500">各得 500 积分</p>
          </div>
        </button>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                navigate("/settings");
                onNavigate?.();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-200"
              title="设置"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-200"
            title="联系客服"
          >
            <Headphones className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  导出                                                                */
/* ------------------------------------------------------------------ */

export function Sidebar({ onOpenInvite }: { onOpenInvite?: () => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-gray-200 bg-gray-100 lg:flex lg:flex-col">
      <SidebarContent onOpenInvite={onOpenInvite} />
    </aside>
  );
}

export function MobileNavDrawer({
  open,
  onClose,
  onOpenInvite,
}: {
  open: boolean;
  onClose: () => void;
  onOpenInvite?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 flex h-full w-[min(20rem,86vw)] flex-col border-r border-gray-200 bg-gray-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">导航</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarContent onNavigate={onClose} onOpenInvite={onOpenInvite} />
      </aside>
    </div>
  );
}