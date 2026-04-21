import { useEffect, useState, useCallback } from "react";
import { getUsers, updateUser, type AdminUserRecord } from "../api";

const PLAN_LABELS: Record<string, string> = {
  free: "免费",
  plus: "Plus 会员",
  pro: "Pro 会员",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-700 text-gray-300",
  plus: "bg-blue-900/60 text-blue-300",
  pro: "bg-indigo-900/60 text-indigo-300",
};

interface EditState {
  userId: string;
  field: "credits" | "plan";
  value: string;
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const PAGE_SIZE = 10;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getUsers({ page, pageSize: PAGE_SIZE, search });
      setUsers(res.users);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function handleSave() {
    if (!edit) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const payload: { credits?: number; membershipPlan?: string } = {};
      if (edit.field === "credits") payload.credits = Number(edit.value);
      if (edit.field === "plan") payload.membershipPlan = edit.value;
      await updateUser(edit.userId, payload);
      setSaveMsg("保存成功");
      setEdit(null);
      fetchUsers();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索手机号或昵称..."
          className="flex-1 px-3.5 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          搜索
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            清除
          </button>
        )}
      </form>

      {saveMsg && (
        <div className={`px-3.5 py-2 rounded-lg text-sm ${saveMsg === "保存成功" ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700" : "bg-red-900/40 text-red-300 border border-red-700"}`}>
          {saveMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">套餐</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">积分</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">预测次数</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">注册时间</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">加载中...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">暂无数据</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">{u.nickname}</p>
                        <p className="text-xs text-gray-500">{u.phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {edit?.userId === u.id && edit.field === "plan" ? (
                        <select
                          value={edit.value}
                          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="free">免费</option>
                          <option value="plus">Plus 会员</option>
                          <option value="pro">Pro 会员</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[u.membershipPlan] ?? "bg-gray-700 text-gray-300"}`}>
                          {PLAN_LABELS[u.membershipPlan] ?? u.membershipPlan}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {edit?.userId === u.id && edit.field === "credits" ? (
                        <input
                          type="number"
                          value={edit.value}
                          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                          className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="text-white font-medium">{u.credits}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{u.totalPredictions}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${u.status === "active" ? "bg-emerald-900/50 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                        {u.status === "active" ? "活跃" : "非活跃"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-4 py-3">
                      {edit?.userId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                          >
                            {saving ? "保存..." : "保存"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEdit(null)}
                            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEdit({ userId: u.id, field: "credits", value: String(u.credits) })}
                            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
                          >
                            改积分
                          </button>
                          <button
                            type="button"
                            onClick={() => setEdit({ userId: u.id, field: "plan", value: u.membershipPlan })}
                            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
                          >
                            改套餐
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
