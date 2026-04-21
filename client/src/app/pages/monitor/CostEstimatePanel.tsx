/**
 * 积分消耗预估面板
 * 从 MonitorPage.tsx 提取
 */
import {
  AlertTriangle,
  Zap,
} from "lucide-react";
import type { WatchTaskSummary } from "../../lib/result-artifacts-api";
import { SCHEDULE_OPTIONS, estimateMonthlyCost } from "./monitor-constants";

export function CostEstimatePanel({
  tasks,
  credits,
}: {
  tasks: WatchTaskSummary[];
  credits: number;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "failed");
  const totalMonthlyCost = activeTasks.reduce(
    (sum, t) => sum + estimateMonthlyCost(t),
    0,
  );
  const dailyCost = activeTasks.reduce((sum, t) => {
    const schedule = SCHEDULE_OPTIONS.find((s) => s.value === t.scheduleTier);
    if (!schedule) return sum;
    return sum + (schedule.costPerRun * schedule.runsPerMonth) / 30;
  }, 0);
  const daysRemaining =
    dailyCost > 0 ? Math.floor(credits / dailyCost) : Infinity;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
        <Zap className="h-4 w-4 text-amber-500" />
        积分消耗预估
      </h3>
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] text-gray-400">活跃任务</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {activeTasks.length}
            <span className="ml-0.5 text-xs font-normal text-gray-400">个</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] text-gray-400">日均消耗</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {Math.round(dailyCost)}
            <span className="ml-0.5 text-xs font-normal text-gray-400">积分</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] text-gray-400">月度预估</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {totalMonthlyCost}
            <span className="ml-0.5 text-xs font-normal text-gray-400">积分</span>
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] text-gray-400">余额可用</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              daysRemaining < 7
                ? "text-red-600"
                : daysRemaining < 30
                  ? "text-amber-600"
                  : "text-gray-900"
            }`}
          >
            {daysRemaining === Infinity ? "∞" : `${daysRemaining} 天`}
          </p>
          {daysRemaining < 7 && daysRemaining !== Infinity && (
            <p className="mt-0.5 text-[10px] text-red-500">余额不足</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-[11px] text-amber-700">
          每次监控执行消耗 <strong>15 积分</strong>，按设定频率自动扣除。余额不足时任务自动暂停。
        </p>
      </div>
    </div>
  );
}
