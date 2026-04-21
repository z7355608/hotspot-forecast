import { useEffect, useState } from "react";
import { getConfig, updateConfig, type SystemConfig } from "../api";

export function ConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [form, setForm] = useState<Partial<SystemConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getConfig()
      .then((c) => { setConfig(c); setForm(c); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await updateConfig(form);
      setMsg("保存成功");
      const updated = await getConfig();
      setConfig(updated);
      setForm(updated);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  function updateField<K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">加载中...</div>;
  }

  if (error) {
    return <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">加载失败：{error}</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {/* 开关配置 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">系统开关</h2>

        <div className="flex items-center justify-between py-2 border-b border-gray-800">
          <div>
            <p className="text-sm font-medium text-gray-200">TikHub 数据接口</p>
            <p className="text-xs text-gray-500 mt-0.5">关闭后将停止调用 TikHub API，使用缓存数据</p>
          </div>
          <button
            type="button"
            onClick={() => updateField("tikhubEnabled", !form.tikhubEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.tikhubEnabled ? "bg-indigo-600" : "bg-gray-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.tikhubEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-200">维护模式</p>
            <p className="text-xs text-gray-500 mt-0.5">开启后 C 端用户将看到维护提示页面</p>
          </div>
          <button
            type="button"
            onClick={() => updateField("maintenanceMode", !form.maintenanceMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.maintenanceMode ? "bg-amber-500" : "bg-gray-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.maintenanceMode ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {/* 积分配置 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">积分配置</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">新用户默认积分</label>
            <input
              type="number"
              value={form.defaultCredits ?? ""}
              onChange={(e) => updateField("defaultCredits", Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">免费用户积分上限</label>
            <input
              type="number"
              value={form.maxFreeCredits ?? ""}
              onChange={(e) => updateField("maxFreeCredits", Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">每日免费次数上限</label>
            <input
              type="number"
              value={form.dailyFreeLimit ?? ""}
              onChange={(e) => updateField("dailyFreeLimit", Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* 定价配置 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">定价配置</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Plus 会员价格（元/月）</label>
            <input
              type="number"
              step="0.1"
              value={form.monthlyPrice ?? ""}
              onChange={(e) => updateField("monthlyPrice", Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Pro 会员价格（元/月）</label>
            <input
              type="number"
              step="0.1"
              value={form.yearlyPrice ?? ""}
              onChange={(e) => updateField("yearlyPrice", Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Admin Whitelist */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">管理员白名单</h2>
        <div className="space-y-2">
          {(config?.adminWhitelist ?? []).map((admin) => (
            <div key={admin.phone} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div>
                <p className="text-sm text-white">{admin.nickname}</p>
                <p className="text-xs text-gray-500">{admin.phone}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${admin.isActive ? "bg-emerald-900/50 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                {admin.isActive ? "启用" : "禁用"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3">如需修改管理员白名单，请直接修改服务器配置文件</p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
        {msg && (
          <span className={`text-sm ${msg === "保存成功" ? "text-emerald-400" : "text-red-400"}`}>{msg}</span>
        )}
      </div>
    </form>
  );
}
