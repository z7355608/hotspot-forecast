import { useEffect, useState } from "react";
import { listTraces, type TraceListItem } from "../api";
import { TraceDetailDrawer, traceDetailUtils } from "../components/TraceDetailDrawer";

const { formatDuration, formatRelativeTime } = traceDetailUtils;

// ── Main Page ────────────────────────────────────────────────────────────────

export function TracesPage() {
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [days, setDays] = useState(7);
  const [onlyBad, setOnlyBad] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setErr("");
    listTraces({ days, onlyBad, limit: 100 })
      .then((res) => setTraces(res.traces))
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, onlyBad]);

  return (
    <div className="space-y-6">
      {activeSession && (
        <TraceDetailDrawer
          sessionId={activeSession}
          onClose={() => setActiveSession(null)}
          onFeedbackSubmitted={load}
        />
      )}

      <div>
        <h2 className="text-white font-semibold">AI 调用追踪</h2>
        <p className="text-gray-500 text-sm mt-0.5">
          每行 = 一次用户预测的完整链路。点击查看每个技能的耗时、token、状态，并可标记 bad case 回流到 prompt 优化。
        </p>
      </div>

      {/* 控制条 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {[1, 3, 7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                days === d ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {d}天
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyBad}
            onChange={(e) => setOnlyBad(e.target.checked)}
            className="accent-red-500"
          />
          只看 bad case
        </label>
        <span className="ml-auto text-gray-600 text-xs">{traces.length} 条</span>
      </div>

      {err && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{err}</div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">加载中...</div>
      ) : traces.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-gray-600 text-sm text-center">
          {onlyBad ? "暂无 bad case 记录" : "近期无追踪记录"}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">用户输入（节选）</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">技能链</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">耗时</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">反馈</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {traces.map((t) => {
                const failedRatio = t.skillCount > 0 ? t.failedCount / t.skillCount : 0;
                const statusBadge = failedRatio === 0
                  ? "bg-emerald-900/40 text-emerald-300"
                  : failedRatio < 0.3
                    ? "bg-amber-900/40 text-amber-300"
                    : "bg-red-900/40 text-red-300";
                return (
                  <tr
                    key={t.sessionId}
                    onClick={() => setActiveSession(t.sessionId)}
                    className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {formatRelativeTime(t.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 max-w-xs">
                      <p className="line-clamp-1">{t.firstInput || <span className="text-gray-700 italic">无输入记录</span>}</p>
                      {t.userId && <p className="text-xs text-gray-600 mt-0.5 font-mono">u: {t.userId.slice(0, 12)}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <span className="font-mono">{t.skillCount}</span>
                      <span className="text-gray-700 mx-1">·</span>
                      <span className="text-gray-500">{t.skillIds.slice(0, 3).join(" → ")}</span>
                      {t.skillIds.length > 3 && <span className="text-gray-600"> +{t.skillIds.length - 3}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {formatDuration(t.totalDurationMs)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {t.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-mono ${statusBadge}`}>
                        {t.successCount}/{t.skillCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.feedbackRating === "bad" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-900/60 text-red-300">✗ bad</span>
                      ) : t.feedbackRating === "good" ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300">✓ good</span>
                      ) : (
                        <span className="text-xs text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
