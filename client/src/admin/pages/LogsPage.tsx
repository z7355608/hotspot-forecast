import { useEffect, useState, useCallback } from "react";
import { getLogs, type AdminLog } from "../api";

const ACTION_LABELS: Record<string, string> = {
  login: "登录",
  update_user: "修改用户",
  update_config: "修改配置",
  update_skill: "修改技能",
  create_user: "创建用户",
  delete_user: "删除用户",
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-blue-900/50 text-blue-300",
  update_user: "bg-amber-900/50 text-amber-300",
  update_config: "bg-purple-900/50 text-purple-300",
  update_skill: "bg-indigo-900/50 text-indigo-300",
  create_user: "bg-emerald-900/50 text-emerald-300",
  delete_user: "bg-red-900/50 text-red-300",
};

export function LogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const PAGE_SIZE = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getLogs({ page, pageSize: PAGE_SIZE });
      setLogs(res.logs);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">管理员</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">目标</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">详情</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">加载中...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500">暂无操作日志</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{log.adminPhone}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-gray-700 text-gray-300"}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{log.target}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-xs truncate" title={log.detail}>
                      {log.detail}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{log.ip}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">共 {total} 条记录</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded text-xs transition-colors"
              >
                上一页
              </button>
              <span className="text-xs text-gray-400 px-2">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 rounded text-xs transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
