import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../app/lib/api-utils";
import { toast } from "sonner";

/* ── Types ── */
interface TimingOverall {
  total_count: number;
  avg_total_ms: number;
  min_total_ms: number;
  max_total_ms: number;
  avg_search_ms: number;
  avg_comment_ms: number;
  avg_llm_ms: number;
  cache_hits: number;
  cache_misses: number;
}

interface TimingRecord {
  id: string;
  query_preview: string;
  total_ms: number;
  search_ms: number;
  comment_ms: number;
  llm_ms: number;
  platform_count: number;
  cache_hit: number;
  execution_status: string;
  created_at: string;
}

interface CacheItem {
  id: string;
  cache_key: string;
  query_preview: string;
  hit_count: number;
  platforms: string;
  created_at: string;
  expires_at: string;
  is_valid: number;
}

interface CacheStats {
  total: number;
  valid: number;
  total_hits: number;
  avg_hits: number;
}

/* ── API helpers ── */
const adminToken = () => localStorage.getItem("admin_token") ?? "";

async function fetchTimingStats() {
  const res = await apiFetch("/api/admin/timing", {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  if (!res.ok) throw new Error("获取耗时统计失败");
  return res.json() as Promise<{ overall: TimingOverall; recent: TimingRecord[] }>;
}

async function fetchCacheStats() {
  const res = await apiFetch("/api/admin/cache", {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  if (!res.ok) throw new Error("获取缓存统计失败");
  return res.json() as Promise<{ items: CacheItem[]; stats: CacheStats }>;
}

async function clearExpiredCache() {
  const res = await apiFetch("/api/admin/cache", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  if (!res.ok) throw new Error("清除缓存失败");
  return res.json();
}

async function deleteCacheItem(id: string) {
  const res = await apiFetch(`/api/admin/cache/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  if (!res.ok) throw new Error("删除缓存失败");
  return res.json();
}

/* ── Helpers ── */
function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "success"
      ? "bg-emerald-100 text-emerald-700"
      : status === "partial_success"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  const label =
    status === "success" ? "成功" : status === "partial_success" ? "部分成功" : "失败";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{label}</span>
  );
}

/* ── Main Component ── */
export function PerformanceMonitorPage() {
  const [timingData, setTimingData] = useState<{
    overall: TimingOverall;
    recent: TimingRecord[];
  } | null>(null);
  const [cacheData, setCacheData] = useState<{
    items: CacheItem[];
    stats: CacheStats;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"timing" | "cache">("timing");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [timing, cache] = await Promise.all([fetchTimingStats(), fetchCacheStats()]);
      setTimingData(timing);
      setCacheData(cache);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClearCache = async () => {
    try {
      await clearExpiredCache();
      toast.success("已清除过期缓存");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDeleteCacheItem = async (id: string) => {
    try {
      await deleteCacheItem(id);
      toast.success("已删除缓存项");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        加载中...
      </div>
    );
  }

  const overall = timingData?.overall;
  const cacheHitRate =
    overall && (overall.cache_hits + overall.cache_misses) > 0
      ? Math.round((overall.cache_hits / (overall.cache_hits + overall.cache_misses)) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">性能监控</h2>
          <p className="text-sm text-gray-400 mt-0.5">分析耗时统计与缓存管理</p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="text-xs text-gray-400 mb-1">7天分析次数</div>
          <div className="text-2xl font-bold text-white">{overall?.total_count ?? 0}</div>
        </div>
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="text-xs text-gray-400 mb-1">平均耗时</div>
          <div className={`text-2xl font-bold ${(overall?.avg_total_ms ?? 0) > 60000 ? "text-red-400" : (overall?.avg_total_ms ?? 0) > 30000 ? "text-amber-400" : "text-emerald-400"}`}>
            {fmtMs(overall?.avg_total_ms)}
          </div>
        </div>
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="text-xs text-gray-400 mb-1">缓存命中率</div>
          <div className={`text-2xl font-bold ${cacheHitRate > 30 ? "text-emerald-400" : "text-gray-300"}`}>
            {cacheHitRate}%
          </div>
        </div>
        <div className="rounded-xl bg-gray-800 p-4">
          <div className="text-xs text-gray-400 mb-1">最大耗时</div>
          <div className={`text-2xl font-bold ${(overall?.max_total_ms ?? 0) > 60000 ? "text-red-400" : "text-amber-400"}`}>
            {fmtMs(overall?.max_total_ms)}
          </div>
        </div>
      </div>

      {/* 耗时分解 */}
      {overall && (
        <div className="rounded-xl bg-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">平均耗时分解</h3>
          <div className="space-y-2">
            {[
              { label: "平台搜索", ms: overall.avg_search_ms, color: "bg-blue-500" },
              { label: "评论采集", ms: overall.avg_comment_ms, color: "bg-purple-500" },
              { label: "LLM分析", ms: overall.avg_llm_ms, color: "bg-amber-500" },
            ].map(({ label, ms, color }) => {
              const pct = overall.avg_total_ms > 0 ? Math.round((ms / overall.avg_total_ms) * 100) : 0;
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-gray-400 shrink-0">{label}</div>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-16 text-xs text-gray-300 text-right shrink-0">{fmtMs(ms)} ({pct}%)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700">
        {(["timing", "cache"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === tab
                ? "text-white border-b-2 border-blue-500 -mb-px"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab === "timing" ? "最近分析记录" : "缓存管理"}
          </button>
        ))}
      </div>

      {/* Timing Tab */}
      {activeTab === "timing" && (
        <div className="overflow-x-auto rounded-xl bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs text-gray-400">
                <th className="px-4 py-3 text-left">查询内容</th>
                <th className="px-4 py-3 text-right">总耗时</th>
                <th className="px-4 py-3 text-right">搜索</th>
                <th className="px-4 py-3 text-right">评论</th>
                <th className="px-4 py-3 text-right">LLM</th>
                <th className="px-4 py-3 text-center">缓存</th>
                <th className="px-4 py-3 text-center">状态</th>
                <th className="px-4 py-3 text-right">时间</th>
              </tr>
            </thead>
            <tbody>
              {(timingData?.recent ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">
                    暂无数据，等待第一次分析完成后显示
                  </td>
                </tr>
              ) : (
                timingData?.recent.map((row) => (
                  <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">
                      {row.query_preview || "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${row.total_ms > 60000 ? "text-red-400" : row.total_ms > 30000 ? "text-amber-400" : "text-emerald-400"}`}>
                      {fmtMs(row.total_ms)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">{fmtMs(row.search_ms)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">{fmtMs(row.comment_ms)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">{fmtMs(row.llm_ms)}</td>
                    <td className="px-4 py-3 text-center">
                      {row.cache_hit ? (
                        <span className="text-xs text-amber-400">命中</span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.execution_status} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {fmtDate(row.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cache Tab */}
      {activeTab === "cache" && (
        <div className="space-y-4">
          {/* Cache Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "总缓存数", value: cacheData?.stats.total ?? 0 },
              { label: "有效缓存", value: cacheData?.stats.valid ?? 0 },
              { label: "总命中次数", value: cacheData?.stats.total_hits ?? 0 },
              { label: "平均命中", value: `${cacheData?.stats.avg_hits ?? 0}次` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-gray-800 p-3">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className="text-xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>

          {/* Cache Actions */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClearCache}
              className="flex items-center gap-2 rounded-lg bg-red-900/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              清除过期缓存
            </button>
          </div>

          {/* Cache Table */}
          <div className="overflow-x-auto rounded-xl bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="px-4 py-3 text-left">查询内容</th>
                  <th className="px-4 py-3 text-left">平台</th>
                  <th className="px-4 py-3 text-right">命中次数</th>
                  <th className="px-4 py-3 text-center">状态</th>
                  <th className="px-4 py-3 text-right">过期时间</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {(cacheData?.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">
                      暂无缓存数据
                    </td>
                  </tr>
                ) : (
                  cacheData?.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-700/50">
                      <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">
                        {item.query_preview || item.cache_key.slice(0, 30)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{item.platforms || "—"}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-medium">{item.hit_count}</td>
                      <td className="px-4 py-3 text-center">
                        {item.is_valid ? (
                          <span className="text-xs text-emerald-400">有效</span>
                        ) : (
                          <span className="text-xs text-gray-500">过期</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {fmtDate(item.expires_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteCacheItem(item.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
