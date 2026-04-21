/**
 * 智能监控页面 — 主组件
 *
 * 子模块：
 *   monitor/monitor-constants.ts  — 常量、类型、工具函数
 *   monitor/MarkdownRenderer.tsx  — Markdown 渲染器
 *   monitor/MonitorResultDrawer.tsx — 报告查看侧滑面板
 *   monitor/CreateMonitorModal.tsx — 创建监控弹窗
 *   monitor/TaskCard.tsx          — 任务卡片
 *   monitor/CostEstimatePanel.tsx — 积分消耗预估面板
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Crown,
  Plus,
} from "lucide-react";
import type { WatchTaskSummary } from "../lib/result-artifacts-api";
import { useAppStore } from "../store/app-store";
import { normalizePlan } from "../store/app-data-core";
import { TASK_TYPE_META } from "./monitor/monitor-constants";
import { MonitorResultDrawer } from "./monitor/MonitorResultDrawer";
import { CreateMonitorModal } from "./monitor/CreateMonitorModal";
import { TaskCard } from "./monitor/TaskCard";
import { CostEstimatePanel } from "./monitor/CostEstimatePanel";

/* ------------------------------------------------------------------ */
/*  会员限制遮罩                                                          */
/* ------------------------------------------------------------------ */

function MembershipGate({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50">
          <Crown className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className="mb-2 text-lg font-medium text-gray-900">
          智能监控是 Pro 会员专属功能
        </h2>
        <p className="mb-6 max-w-md text-sm text-gray-500">
          开通 Pro 会员后，你可以创建多种监控任务，自动追踪赛道趋势、竞品动态和作品数据，
          让 AI 持续为你盯盘，不错过任何机会。
        </p>
        <div className="mb-8 grid grid-cols-3 gap-4 text-left">
          {(["topic_watch", "account_watch", "content_watch"] as const).map((type) => {
            const meta = TASK_TYPE_META[type];
            const Icon = meta.icon;
            return (
              <div key={type} className="rounded-xl border border-gray-200 bg-white p-4">
                <Icon className={`mb-2 h-5 w-5 ${meta.color}`} />
                <p className="text-xs font-medium text-gray-800">{meta.label}</p>
                <p className="mt-1 text-[11px] text-gray-400">{meta.description}</p>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          <Crown className="h-4 w-4" />
          升级 Pro 会员
        </button>
        <p className="mt-3 text-[11px] text-gray-400">
          Plus 会员 ¥15/月 起 · 含每月 200 积分
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  空状态                                                               */
/* ------------------------------------------------------------------ */

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        <Activity className="h-6 w-6 text-gray-400" />
      </div>
      <h3 className="mb-2 text-sm font-medium text-gray-700">
        还没有监控任务
      </h3>
      <p className="mb-5 max-w-sm text-xs text-gray-400">
        创建你的第一个监控任务，AI 会按设定频率自动追踪赛道趋势、竞品动态或作品数据变化，并在发现异常时及时提醒你。
      </p>
      <button
        type="button"
        onClick={onCreateNew}
        className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
      >
        <Plus className="h-3.5 w-3.5" />
        创建监控任务
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MonitorPage 主组件                                                   */
/* ------------------------------------------------------------------ */

type FilterTab = "all" | "topic_watch" | "account_watch" | "content_watch" | "active" | "paused";

export function MonitorPage() {
  const navigate = useNavigate();
  const {
    state,
    watchTasks,
    pauseWatchTask,
    resumeWatchTask,
    deleteWatchTask,
    updateWatchTaskSchedule,
    runResultWatchTask,
    createMonitorTask,
  } = useAppStore();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<WatchTaskSummary | null>(null);

  const isMember =
    normalizePlan(state.membershipPlan) !== "free";

  // 会员限制
  if (!isMember) {
    return <MembershipGate onUpgrade={() => navigate("/credits")} />;
  }

  const filteredTasks = useMemo(() => {
    switch (filterTab) {
      case "topic_watch":
        return watchTasks.filter((t) => t.taskType === "topic_watch");
      case "account_watch":
        return watchTasks.filter((t) => t.taskType === "account_watch");
      case "content_watch":
        return watchTasks.filter((t) => t.taskType === "content_watch");
      case "active":
        return watchTasks.filter((t) => t.status !== "failed");
      case "paused":
        return watchTasks.filter((t) => t.status === "failed");
      default:
        return watchTasks;
    }
  }, [watchTasks, filterTab]);

  // 按类型统计
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of watchTasks) {
      counts[t.taskType] = (counts[t.taskType] || 0) + 1;
    }
    return counts;
  }, [watchTasks]);

  const activeCount = watchTasks.filter((t) => t.status !== "failed").length;
  const pausedCount = watchTasks.filter((t) => t.status === "failed").length;

  const TABS: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "全部", count: watchTasks.length },
    { id: "topic_watch", label: "赛道", count: typeCounts.topic_watch || 0 },
    { id: "account_watch", label: "账号", count: typeCounts.account_watch || 0 },
    { id: "content_watch", label: "作品", count: typeCounts.content_watch || 0 },
    { id: "active", label: "运行中", count: activeCount },
    { id: "paused", label: "已暂停", count: pausedCount },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      {/* 页面标题 + 创建按钮 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl text-gray-900">智能监控</h1>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              Pro
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            创建和管理监控任务，AI 按设定频率自动追踪赛道、账号和作品数据变化
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          创建监控
        </button>
      </div>

      {/* 积分消耗面板 */}
      {watchTasks.length > 0 && (
        <div className="mb-6">
          <CostEstimatePanel tasks={watchTasks} credits={state.credits} />
        </div>
      )}

      {/* 筛选 tabs */}
      {watchTasks.length > 0 && (
        <div className="mb-5 flex items-center gap-2 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                filterTab === tab.id
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  filterTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 任务列表 */}
      {watchTasks.length === 0 ? (
        <EmptyState onCreateNew={() => setShowCreateModal(true)} />
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <p className="text-sm text-gray-400">当前筛选条件下没有任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              onPause={() => pauseWatchTask(task.taskId)}
              onResume={() => resumeWatchTask(task.taskId)}
              onDelete={() => deleteWatchTask(task.taskId)}
              onRun={() => runResultWatchTask(task.taskId)}
              onChangeSchedule={(tier) =>
                updateWatchTaskSchedule(task.taskId, tier)
              }
              onViewResult={() => setViewingTask(task)}
            />
          ))}
        </div>
      )}

      {/* 底部说明 */}
      <div className="mt-8 rounded-xl bg-gray-50 px-5 py-4">
        <h4 className="mb-2 text-xs font-medium text-gray-600">
          关于智能监控
        </h4>
        <ul className="space-y-1.5 text-[11px] text-gray-400">
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            <strong>赛道监控</strong>：追踪赛道热度趋势、爆款出现频率、新入场创作者数量和竞争格局变化
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            <strong>账号监控</strong>：追踪竞品/对标账号的粉丝增长、发布频率、互动率和爆款动态
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            <strong>作品监控</strong>：追踪单条内容的播放量/阅读量趋势、互动数据和评论区舆情
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            创建监控消耗 15 积分，后续按频率（每天/每 3 天/每周）自动执行，每次 15 积分
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
            积分余额不足时任务自动暂停，充值后可手动恢复。也可从分析结果页直接开启监控
          </li>
        </ul>
      </div>

      {/* 创建监控弹窗 */}
      <CreateMonitorModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={(input) => {
          const result = createMonitorTask(input);
          return { ok: result.ok, shortfall: result.ok ? undefined : (result as { shortfall: number }).shortfall };
        }}
        credits={state.credits}
      />

      {/* 监控结果查看弹窗 */}
      <MonitorResultDrawer
        task={viewingTask}
        open={!!viewingTask}
        onClose={() => setViewingTask(null)}
      />
    </div>
  );
}
