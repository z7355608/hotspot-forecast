import { useEffect, useState } from "react";
import {
  getSkills,
  updateSkill,
  getPromptTemplate,
  updatePromptTemplate,
  getPromptTemplateVersions,
  type Skill,
  type PromptTemplate,
} from "../api";

const CATEGORY_LABELS: Record<string, string> = {
  breakdown: "拆解分析",
  prediction: "机会预测",
  strategy: "内容策略",
  tools: "辅助工具",
};

const ICON_MAP: Record<string, string> = {
  Scissors: "✂️",
  TrendingUp: "📈",
  LayoutGrid: "🗂️",
  FileText: "📄",
  Rocket: "🚀",
  Sparkles: "✨",
};

// ── Prompt Editor Modal ────────────────────────────────────────────────────────

function PromptEditorModal({
  skill,
  onClose,
}: {
  skill: Skill;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<PromptTemplate | null>(null);
  const [versions, setVersions] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "history">("edit");
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editedUserPrompt, setEditedUserPrompt] = useState("");
  const [editedLabel, setEditedLabel] = useState("");
  const [editedMaxTokens, setEditedMaxTokens] = useState(4000);

  const templateId = skill.prompt_template_id ?? skill.id + "-v1";

  useEffect(() => {
    Promise.all([
      getPromptTemplate(templateId),
      getPromptTemplateVersions(templateId),
    ])
      .then(([tRes, vRes]) => {
        setTemplate(tRes.template);
        setVersions(vRes.versions);
        setEditedPrompt(tRes.template.system_prompt_doubao);
        setEditedUserPrompt(tRes.template.user_prompt_template);
        setEditedLabel(tRes.template.label);
        setEditedMaxTokens(tRes.template.max_tokens);
      })
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, [templateId]);

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    try {
      const res = await updatePromptTemplate(templateId, {
        system_prompt_doubao: editedPrompt,
        user_prompt_template: editedUserPrompt,
        label: editedLabel,
        max_tokens: editedMaxTokens,
      });
      setMsg(`✅ 已保存为 v${res.newVersion}（旧版本已保留为历史记录）`);
      // Refresh versions
      const vRes = await getPromptTemplateVersions(templateId);
      setVersions(vRes.versions);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-lg">
              {ICON_MAP[skill.icon ?? "Sparkles"] ?? "✨"} {skill.label} · 提示词编辑
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">模板 ID: {templateId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-6">
          {(["edit", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "edit" ? "📝 编辑提示词" : `🕐 版本历史 (${versions.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-gray-500 text-sm text-center py-12">加载中...</div>
          ) : activeTab === "edit" ? (
            <div className="space-y-5">
              {/* Label */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">技能名称</label>
                <input
                  type="text"
                  value={editedLabel}
                  onChange={(e) => setEditedLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  系统提示词 (System Prompt)
                  <span className="ml-2 text-gray-600">— 定义 AI 的角色和分析框架</span>
                </label>
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                  placeholder="输入系统提示词..."
                />
                <p className="text-xs text-gray-600 mt-1">{editedPrompt.length} 字符</p>
              </div>

              {/* User Prompt Template */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  用户提示词模板 (User Prompt Template)
                  <span className="ml-2 text-gray-600">— 使用 {"{{变量名}}"} 作为占位符</span>
                </label>
                <textarea
                  value={editedUserPrompt}
                  onChange={(e) => setEditedUserPrompt(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                  placeholder="输入用户提示词模板..."
                />
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">最大 Token 数</label>
                <input
                  type="number"
                  value={editedMaxTokens}
                  onChange={(e) => setEditedMaxTokens(Number(e.target.value))}
                  min={500}
                  max={16000}
                  step={500}
                  className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {msg && (
                <div className={`rounded-lg px-3.5 py-2 text-sm ${msg.startsWith("✅") ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300" : "bg-red-900/30 border border-red-800 text-red-300"}`}>
                  {msg}
                </div>
              )}
            </div>
          ) : (
            /* Version History */
            <div className="space-y-3">
              {versions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">暂无历史版本</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded font-mono">v{v.version}</span>
                        <span className="text-white text-sm font-medium">{v.label}</span>
                      </div>
                      <span className="text-gray-500 text-xs">
                        {new Date(v.created_at).toLocaleString("zh-CN")}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs font-mono line-clamp-3 whitespace-pre-wrap">
                      {v.system_prompt_doubao.slice(0, 200)}...
                    </p>
                    <div className="flex gap-3 mt-2 text-xs text-gray-600">
                      <span>Max tokens: {v.max_tokens}</span>
                      <span>模型: {v.preferred_model}</span>
                      <span>ID: {v.id}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "edit" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
            <p className="text-gray-600 text-xs">保存时会创建新版本，旧版本自动保留为历史记录</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "保存中..." : "保存新版本"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main SkillsPage ────────────────────────────────────────────────────────────

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  useEffect(() => {
    getSkills()
      .then((res) => setSkills(res.skills))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(skill: Skill) {
    setSavingId(skill.id);
    const newActive = skill.is_active === 1 ? 0 : 1;
    try {
      await updateSkill(skill.id, { is_active: newActive });
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, is_active: newActive } : s))
      );
      setMsg("已更新");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSavingId(null);
      setTimeout(() => setMsg(""), 2000);
    }
  }

  async function handleCostChange(skill: Skill, cost: number) {
    setSavingId(skill.id);
    try {
      await updateSkill(skill.id, { cost });
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, cost } : s))
      );
      setMsg("已更新");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSavingId(null);
      setTimeout(() => setMsg(""), 2000);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">加载中...</div>;
  }

  if (error) {
    return <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">加载失败：{error}</div>;
  }

  // Group by category
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    const cat = s.category ?? "tools";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {editingSkill && (
        <PromptEditorModal skill={editingSkill} onClose={() => setEditingSkill(null)} />
      )}

      {msg && (
        <div className="bg-emerald-900/40 border border-emerald-700 rounded-lg px-3.5 py-2 text-emerald-300 text-sm">
          {msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">技能管理</h2>
          <p className="text-gray-500 text-sm mt-0.5">管理 AI 分析技能的提示词、开关和积分消耗</p>
        </div>
        <span className="text-gray-600 text-xs">{skills.length} 个技能</span>
      </div>

      {Object.entries(grouped).map(([category, catSkills]) => (
        <div key={category}>
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">技能</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Intent</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">积分消耗</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">提示词</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {catSkills.map((skill) => (
                  <tr key={skill.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{ICON_MAP[skill.icon ?? "Sparkles"] ?? "✨"}</span>
                        <div>
                          <p className="font-medium text-white">{skill.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5 max-w-xs">{skill.desc_text}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {skill.intent ?? skill.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={skill.cost ?? 20}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== skill.cost) handleCostChange(skill, v);
                        }}
                        className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setEditingSkill(skill)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/40 hover:bg-indigo-900/70 border border-indigo-800 text-indigo-300 text-xs rounded-lg transition-colors"
                      >
                        <span>✏️</span>
                        <span>编辑提示词</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(skill)}
                        disabled={savingId === skill.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${skill.is_active === 1 ? "bg-indigo-600" : "bg-gray-700"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${skill.is_active === 1 ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
