/**
 * 监控任务卡片组件
 * 从 MonitorPage.tsx 提取
 */
import { useState } from "react";
import {
  Calendar,
  ChevronRight,
  Clock,
  Eye,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import type { WatchTaskSummary } from "../../lib/result-artifacts-api";
import {
  TASK_TYPE_META,
  SCHEDULE_OPTIONS,
  STATUS_META,
  PLATFORM_LABEL,
  formatRelativeTime,
  estimateMonthlyCost,
} from "./monitor-constants";
import type { PredictionWatchScheduleTier } from "./monitor-constants";

export function TaskCard({
  task,
  onPause,
  onResume,
  onDelete,
  onRun,
  onChangeSchedule,
  onViewResult,
}: {
  task: WatchTaskSummary;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onRun: () => void;
  onChangeSchedule: (tier: PredictionWatchScheduleTier) => void;
  onViewResult: () => void;
}) {
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const typeMeta = TASK_TYPE_META[task.taskType] ?? TASK_TYPE_META.topic_watch;
  const statusMeta = STATUS_META[task.status] ?? STATUS_META.pending;
  const selectedSchedule = SCHEDULE_OPTIONS.find((s) => s.value === task.scheduleTier) ?? SCHEDULE_OPTIONS[1];
  const TypeIcon = typeMeta.icon;
  const isPaused = task.status === "failed";
  const monthlyCost = estimateMonthlyCost(task);
  const displayTitle = task.title || `${typeMeta.label} · ${task.taskId.slice(0, 8)}`;
  const displayTarget = task.target || "";

  return (
    <div
      className={`group rounded-2xl border px-5 pb-4 pt-5 transition-all hover:shadow-sm ${
        isPaused ? "border-gray-200 bg-gray-50/50" : "border-gray-200 bg-white"
      }`}
    >
      {/* 头部 */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${typeMeta.bg}`}>
            <TypeIcon className={`h-5 w-5 ${typeMeta.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-sm font-medium text-gray-900">
                {displayTitle}
              </h4>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${typeMeta.bg} ${typeMeta.color}`}>
                {typeMeta.shortLabel}
              </span>
              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {PLATFORM_LABEL[task.platform] ?? task.platform}
              </span>
            </div>
            {displayTarget && (
              <p className="mt-0.5 truncate text-[11px] text-gray-400">
                {displayTarget}
              </p>
            )}
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.bg}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
          {statusMeta.label}
        </span>
      </div>

      {/* 监控维度标签 */}
      {task.dimensions && task.dimensions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {task.dimensions.map((dim) => (
            <span
              key={dim}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500"
            >
              {dim}
            </span>
          ))}
        </div>
      )}

      {/* 信息行 */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-gray-400">执行频率</p>
          <div className="relative mt-0.5">
            <button
              type="button"
              onClick={() => setShowScheduleMenu(!showScheduleMenu)}
              className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
            >
              <Calendar className="h-3 w-3 text-gray-400" />
              {selectedSchedule.label}
              <Settings2 className="h-2.5 w-2.5 text-gray-300" />
            </button>
            {showScheduleMenu && (
              <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChangeSchedule(opt.value);
                      setShowScheduleMenu(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-gray-50 ${
                      opt.value === task.scheduleTier
                        ? "font-medium text-gray-900"
                        : "text-gray-600"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] text-gray-400">
                      {opt.costPerRun}分/次
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">上次执行</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-700">
            <Clock className="h-3 w-3 text-gray-400" />
            {formatRelativeTime(task.lastRunAt)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">创建时间</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-700">
            <Clock className="h-3 w-3 text-gray-400" />
            {formatRelativeTime(task.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">月度消耗</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-700">
            <Zap className="h-3 w-3 text-amber-400" />
            ~{monthlyCost} 积分
          </p>
        </div>
      </div>

      {/* 预算快照 */}
      {task.budgetSnapshot && (
        <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">上次预算</span>
            <span className="text-gray-600">
              {task.budgetSnapshot.actualUsed} / {task.budgetSnapshot.baseBudget} 调用
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-400 transition-all"
              style={{
                width: `${Math.min(
                  (task.budgetSnapshot.actualUsed / task.budgetSnapshot.baseBudget) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 降级标记 */}
      {task.degradeFlags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {task.degradeFlags.map((flag) => {
            const DEGRADE_LABELS: Record<string, string> = {
              optional_endpoint_failed: "部分数据略有缺失",
              sparse_comments: "评论数据待补充",
              sparse_hotlist: "热榜数据待更新",
              sparse_followers: "粉丝数据待补充",
              platform_partial_failure: "平台接口波动",
              fallback_search_route: "已启用备用搜索",
              fallback_user_route: "已启用备用用户接口",
              topic_inferred_from_search: "话题由搜索推断",
            };
            return (
              <span
                key={flag}
                className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-600"
                title={flag}
              >
                {DEGRADE_LABELS[flag] || flag.replace(/_/g, " ")}
              </span>
            );
          })}
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex items-center gap-1">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-green-600 transition-colors hover:bg-green-50"
            >
              <Play className="h-3 w-3" />
              恢复
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <Pause className="h-3 w-3" />
              暂停
            </button>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={isPaused}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="h-3 w-3" />
            立即执行
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
            删除
          </button>
        </div>
        <button
          type="button"
          onClick={onViewResult}
          className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
        >
          <Eye className="h-3 w-3" />
          查看结果
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
