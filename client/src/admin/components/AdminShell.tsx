import { useState } from "react";
import type { AdminUser } from "../api";
import { clearToken } from "../api";

export type AdminPage =
  | "dashboard"
  | "users"
  | "config"
  | "skills:overview"
  | "skills:stage1"
  | "skills:stage2"
  | "skills:stage3"
  | "skills:stage4"
  | "skills:stage5"
  | "skills:stage6"
  | "skills:entry"
  | "traces"
  | "logs"
  | "performance"
  | "api-usage";

interface NavLeaf {
  type: "leaf";
  id: AdminPage;
  label: string;
}

interface NavGroup {
  type: "group";
  id: string;
  label: string;
  icon: React.ReactNode;
  children: NavLeaf[];
}

interface NavItem {
  type: "leaf";
  id: AdminPage;
  label: string;
  icon: React.ReactNode;
}

type NavEntry = NavItem | NavGroup;

const NAV_ITEMS: NavEntry[] = [
  {
    type: "leaf",
    id: "dashboard",
    label: "数据看板",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    type: "leaf",
    id: "users",
    label: "用户管理",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    type: "leaf",
    id: "config",
    label: "系统配置",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    type: "group",
    id: "skills",
    label: "技能管理",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    children: [
      { type: "leaf", id: "skills:overview", label: "链路总览" },
      { type: "leaf", id: "skills:stage1",   label: "Stage 1 · 输入理解" },
      { type: "leaf", id: "skills:stage2",   label: "Stage 2 · 数据采集" },
      { type: "leaf", id: "skills:stage3",   label: "Stage 3 · 清洗分析" },
      { type: "leaf", id: "skills:stage4",   label: "Stage 4 · 核心预测" },
      { type: "leaf", id: "skills:stage5",   label: "Stage 5 · 动作推荐" },
      { type: "leaf", id: "skills:stage6",   label: "Stage 6 · 用户工具" },
      { type: "leaf", id: "skills:entry",    label: "入口技能（工作台）" },
    ],
  },
  {
    type: "leaf",
    id: "traces",
    label: "调用追踪",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h4l3-9 4 18 3-9h4" />
      </svg>
    ),
  },
  {
    type: "leaf",
    id: "logs",
    label: "操作日志",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    type: "leaf",
    id: "performance",
    label: "性能监控",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    type: "leaf",
    id: "api-usage",
    label: "API消耗",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

function isPageInGroup(group: NavGroup, page: AdminPage): boolean {
  return group.children.some((c) => c.id === page);
}

function findCurrentLabel(currentPage: AdminPage): string {
  for (const item of NAV_ITEMS) {
    if (item.type === "leaf" && item.id === currentPage) return item.label;
    if (item.type === "group") {
      const child = item.children.find((c) => c.id === currentPage);
      if (child) return `${item.label} · ${child.label}`;
    }
  }
  return "管理后台";
}

interface Props {
  user: AdminUser;
  currentPage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AdminShell({ user, currentPage, onNavigate, onLogout, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-expand the group that contains the active page
  const initialExpanded = NAV_ITEMS.reduce<Record<string, boolean>>((acc, item) => {
    if (item.type === "group") acc[item.id] = isPageInGroup(item, currentPage);
    return acc;
  }, {});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initialExpanded);

  function handleLogout() {
    clearToken();
    onLogout();
  }

  function toggleGroup(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const currentLabel = findCurrentLabel(currentPage);

  function renderNav(closeMobile = false) {
    return NAV_ITEMS.map((item) => {
      if (item.type === "leaf") {
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onNavigate(item.id);
              if (closeMobile) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      }

      const isOpen = expanded[item.id] ?? false;
      const groupActive = isPageInGroup(item, currentPage);

      return (
        <div key={item.id} className="space-y-0.5">
          <button
            type="button"
            onClick={() => toggleGroup(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              groupActive ? "text-white bg-gray-800" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {item.icon}
            <span className="flex-1 text-left">{item.label}</span>
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {isOpen && (
            <div className="ml-3 pl-3 border-l border-gray-800 space-y-0.5">
              {item.children.map((child) => {
                const active = currentPage === child.id;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => {
                      onNavigate(child.id);
                      if (closeMobile) setSidebarOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
                      active ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {child.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-gray-900 border-r border-gray-800 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-800">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">管理后台</p>
            <p className="text-xs text-gray-500 truncate">爆款预测agent</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {renderNav(false)}
        </nav>

        {/* User */}
        <div className="px-2 py-3 border-t border-gray-800">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {user.nickname?.[0] ?? "A"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{user.nickname}</p>
              <p className="text-xs text-gray-500 truncate">{user.phone}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="退出登录"
              className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-gray-900 border-r border-gray-800 flex flex-col transform transition-transform lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">管理后台</span>
          <button type="button" onClick={() => setSidebarOpen(false)} className="text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {renderNav(true)}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 lg:px-6">
          <button
            type="button"
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-white">{currentLabel}</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
