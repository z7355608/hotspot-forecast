/**
 * API 消耗统计页面
 * 展示 TikHub API 调用量、费用、命中率等数据
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../app/lib/api-utils";

interface OverallStats {
  total_calls: number;
  billed_calls: number;
  cached_calls: number;
  failed_calls: number;
  total_cost_usd: number;
  billed_cost_usd: number;
}

interface TaskTypeRow {
  task_type: string;
  total_calls: number;
  billed_calls: number;
  cost_usd: number;
}

interface PathRow {
  api_path: string;
  total_calls: number;
  billed_calls: number;
  cached_calls: number;
  failed_calls: number;
  cost_usd: number;
}

interface DailyRow {
  day: string;
  total_calls: number;
  billed_calls: number;
  cached_calls: number;
  cost_usd: number;
}

interface RecentRow {
  id: number;
  called_at: string;
  api_path: string;
  method: string;
  http_status: number;
  success: number;
  cache_hit: number;
  cost_usd: number;
  task_type: string | null;
  user_id: string | null;
  keyword: string | null;
  platform: string | null;
  request_id: string | null;
  error_msg: string | null;
}

interface ApiUsageData {
  overall: OverallStats;
  byTaskType: TaskTypeRow[];
  byPath: PathRow[];
  daily: DailyRow[];
  recent: RecentRow[];
}

async function fetchApiUsage(): Promise<ApiUsageData> {
  const res = await apiFetch("/api/admin/api-usage", {
    headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") ?? ""}` },
  });
  if (!res.ok) throw new Error("Failed to fetch API usage");
  return res.json();
}

const TASK_TYPE_LABELS: Record<string, string> = {
  topic_watch: "爆款预测",
  validation_watch: "内容验证",
  account_watch: "账号分析",
  topic_strategy: "选题策略",
  creator_sync: "创作者同步",
  monitor: "监控任务",
  unknown: "未知来源",
};

function fmtPath(path: string) {
  // 只显示最后两段
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function fmtCost(usd: number) {
  if (!usd) return "$0.00";
  return `$${Number(usd).toFixed(4)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export function ApiUsagePage() {
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchApiUsage()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <div className="text-red-400 text-sm">{error ?? "加载失败"}</div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          重试
        </button>
      </div>
    );
  }

  const { overall, byTaskType, byPath, daily, recent } = data;
  const cacheRate = overall.total_calls > 0
    ? Math.round((overall.cached_calls / overall.total_calls) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">TikHub API 消耗统计</h2>
          <p className="text-xs text-gray-500 mt-0.5">最近 30 天数据 · 每次实际调用 $0.01，缓存命中不计费</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">总调用次数</p>
          <p className="text-2xl font-bold text-white">{overall.total_calls?.toLocaleString() ?? 0}</p>
          <p className="text-xs text-gray-600 mt-1">含缓存 {overall.cached_calls ?? 0} 次</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">实际计费次数</p>
          <p className="text-2xl font-bold text-amber-400">{overall.billed_calls?.toLocaleString() ?? 0}</p>
          <p className="text-xs text-gray-600 mt-1">缓存节省 {overall.cached_calls ?? 0} 次</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">预估总费用</p>
          <p className="text-2xl font-bold text-green-400">{fmtCost(overall.billed_cost_usd)}</p>
          <p className="text-xs text-gray-600 mt-1">缓存命中率 {cacheRate}%</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">失败次数</p>
          <p className="text-2xl font-bold text-red-400">{overall.failed_calls?.toLocaleString() ?? 0}</p>
          <p className="text-xs text-gray-600 mt-1">
            失败率 {overall.total_calls > 0 ? Math.round((overall.failed_calls / overall.total_calls) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Daily Chart (simple bar) */}
      {daily.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-4">每日调用趋势（最近 14 天）</h3>
          <div className="flex items-end gap-1 h-28">
            {daily.map((d) => {
              const maxCalls = Math.max(...daily.map((r) => r.total_calls), 1);
              const billedH = Math.round((d.billed_calls / maxCalls) * 100);
              const cachedH = Math.round((d.cached_calls / maxCalls) * 100);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}\n计费: ${d.billed_calls} 次\n缓存: ${d.cached_calls} 次\n费用: ${fmtCost(d.cost_usd)}`}>
                  <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                    <div className="w-full bg-indigo-500 rounded-t-sm" style={{ height: `${billedH}%` }} />
                    <div className="w-full bg-gray-600 rounded-t-sm" style={{ height: `${cachedH}%`, marginTop: "1px" }} />
                  </div>
                  <span className="text-gray-600 text-xs" style={{ fontSize: "9px" }}>
                    {d.day.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-3 h-2 bg-indigo-500 rounded-sm inline-block" /> 计费调用
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-3 h-2 bg-gray-600 rounded-sm inline-block" /> 缓存命中
            </span>
          </div>
        </div>
      )}

      {/* By Task Type + By Path */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Task Type */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-3">按任务类型分布</h3>
          {byTaskType.length === 0 ? (
            <p className="text-xs text-gray-600">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {byTaskType.map((row) => {
                const maxCost = Math.max(...byTaskType.map((r) => r.cost_usd), 0.01);
                const pct = Math.round((row.cost_usd / maxCost) * 100);
                return (
                  <div key={row.task_type}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{TASK_TYPE_LABELS[row.task_type] ?? row.task_type}</span>
                      <span className="text-gray-400">{row.total_calls} 次 · {fmtCost(row.cost_usd)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Path */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Top 接口消耗</h3>
          {byPath.length === 0 ? (
            <p className="text-xs text-gray-600">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {byPath.slice(0, 8).map((row) => {
                const maxCost = Math.max(...byPath.map((r) => r.cost_usd), 0.01);
                const pct = Math.round((row.cost_usd / maxCost) * 100);
                return (
                  <div key={row.api_path}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-300 font-mono truncate max-w-[180px]" title={row.api_path}>
                        {fmtPath(row.api_path)}
                      </span>
                      <span className="text-gray-400 flex-shrink-0 ml-2">{row.billed_calls} 次 · {fmtCost(row.cost_usd)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-300">最近 50 条调用记录</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2 text-gray-500 font-medium">时间</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">接口</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">来源</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">关键词</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">状态</th>
                <th className="text-right px-4 py-2 text-gray-500 font-medium">费用</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{fmtDate(row.called_at)}</td>
                  <td className="px-4 py-2 text-gray-300 font-mono max-w-[200px] truncate" title={row.api_path}>
                    {fmtPath(row.api_path)}
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    {TASK_TYPE_LABELS[row.task_type ?? ""] ?? row.task_type ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-400 max-w-[100px] truncate">{row.keyword ?? "—"}</td>
                  <td className="px-4 py-2">
                    {row.cache_hit ? (
                      <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">缓存</span>
                    ) : row.success ? (
                      <span className="px-1.5 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">成功</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded text-xs" title={row.error_msg ?? ""}>失败</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    {row.cache_hit ? (
                      <span className="text-gray-600">$0</span>
                    ) : (
                      <span className="text-amber-400">{fmtCost(row.cost_usd)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-600">暂无调用记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
