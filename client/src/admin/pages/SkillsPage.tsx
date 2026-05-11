import { useEffect, useMemo, useState } from "react";
import {
  getSkills,
  updateSkill,
  getPromptTemplate,
  updatePromptTemplate,
  getPromptTemplateVersions,
  getSkillStats,
  getPipelineTopology,
  listBadCases,
  listPromptTemplates,
  createPromptTemplate,
  createSkill,
  deleteSkill,
  type Skill,
  type PromptTemplate,
  type PromptTemplateSummary,
  type SkillStats,
  type PipelineTopology,
  type BadCaseItem,
} from "../api";
import { TraceDetailDrawer } from "../components/TraceDetailDrawer";

// ── Stage 元数据 ──────────────────────────────────────────────────────────────

const STAGE_META: Record<
  string,
  { order: number; label: string; summary: string; color: string }
> = {
  stage1_input:     { order: 1, label: "输入理解",   summary: "解析用户输入，识别意图类型",         color: "indigo" },
  stage2_collect:   { order: 2, label: "数据采集",   summary: "拉取平台数据、采集评论",             color: "blue"   },
  stage3_analyze:   { order: 3, label: "清洗分析",   summary: "语义过滤、低粉算法、评论摘要",       color: "cyan"   },
  stage4_predict:   { order: 4, label: "核心预测",   summary: "机会判断 / 选题策略 / 低粉爆款 / 账号诊断", color: "emerald" },
  stage5_recommend: { order: 5, label: "动作推荐",   summary: "基于预测结果生成下一步行动建议",     color: "amber"  },
  stage6_tools:     { order: 6, label: "用户工具",   summary: "拆解、文案提取等二次加工动作",       color: "purple" },
};

const ICON_MAP: Record<string, string> = {
  Scissors:   "✂️",
  TrendingUp: "📈",
  LayoutGrid: "🗂️",
  FileText:   "📄",
  Rocket:     "🚀",
  Sparkles:   "✨",
};

const ENTRY_SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  workbench: { label: "用户入口", cls: "bg-emerald-900/40 text-emerald-300 border border-emerald-800" },
  pipeline:  { label: "链路内部", cls: "bg-gray-800 text-gray-400 border border-gray-700" },
  cta:       { label: "二次动作", cls: "bg-amber-900/40 text-amber-300 border border-amber-800" },
};

// 来自 main：处理数据库读出的乱码（mojibake）
function isPotentiallyGarbled(text: string | null | undefined): boolean {
  if (!text) return true;
  return text.includes("�") || /[ÃÂÐÑØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö]/.test(text);
}

function repairMojibake(text: string | null | undefined): string {
  if (!text) return "";
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return isPotentiallyGarbled(text) ? repairMojibake(text) : text;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN");
}

// 显示兜底：数据库 label/desc 缺失或乱码时给出可读名
function normalizeSkillDisplay(skill: Skill): { label: string; desc: string; phase: string } {
  const meta = STAGE_META[skill.category ?? ""];
  const repairedLabel = normalizeText(skill.label);
  const repairedDesc = normalizeText(skill.desc_text);
  return {
    label: repairedLabel || skill.id,
    desc: repairedDesc || "暂无描述",
    phase: meta ? `Stage ${meta.order} · ${meta.label}` : "未归类",
  };
}

// 来自 main：诊断 prompt 模板乱码问题的临时调试日志，发到本地 7545 端口（失败 silent）
// 稳定后可统一清理
function emitDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
  runId = "repro-2",
) {
  fetch("http://127.0.0.1:7545/ingest/236e4359-60f3-406e-93d6-60666b075463", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "69d318",
    },
    body: JSON.stringify({
      sessionId: "69d318",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

const STAGE_KEYS = [
  "stage1_input",
  "stage2_collect",
  "stage3_analyze",
  "stage4_predict",
  "stage5_recommend",
  "stage6_tools",
] as const;

// ── Prompt Editor Modal （沿用现有版本） ───────────────────────────────────────

function PromptEditorModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
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
    // #region agent log
    emitDebugLog("H6", "client/admin/SkillsPage.tsx:PromptEditorModal", "prompt modal load start", {
      skillId: skill.id,
      intent: skill.intent ?? "",
      templateId,
    });
    // #endregion
    Promise.all([
      getPromptTemplate(templateId),
      getPromptTemplateVersions(templateId),
    ])
      .then(([tRes, vRes]) => {
        // #region agent log
        emitDebugLog("H7", "client/admin/SkillsPage.tsx:PromptEditorModal", "prompt modal load success", {
          skillId: skill.id,
          templateId,
          templateLabel: normalizeText(tRes.template.label).slice(0, 30),
          versionsCount: vRes.versions.length,
        });
        // #endregion
        setTemplate(tRes.template);
        setVersions(vRes.versions);
        setEditedPrompt(normalizeText(tRes.template.system_prompt_doubao));
        setEditedUserPrompt(normalizeText(tRes.template.user_prompt_template));
        setEditedLabel(normalizeText(tRes.template.label));
        setEditedMaxTokens(tRes.template.max_tokens);
      })
      .catch((e) => {
        // #region agent log
        emitDebugLog("H8", "client/admin/SkillsPage.tsx:PromptEditorModal", "prompt modal load failed", {
          skillId: skill.id,
          templateId,
          error: e instanceof Error ? e.message : String(e),
        });
        // #endregion
        setMsg(e.message);
      })
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-lg">
              {ICON_MAP[skill.icon ?? "Sparkles"] ?? "✨"} {normalizeSkillDisplay(skill).label} · 提示词编辑
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">模板 ID: {templateId}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex border-b border-gray-800 px-6">
          {(["edit", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab === "edit" ? "📝 编辑提示词" : `🕐 版本历史 (${versions.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-gray-500 text-sm text-center py-12">加载中...</div>
          ) : activeTab === "edit" ? (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">技能名称</label>
                <input
                  type="text"
                  value={editedLabel}
                  onChange={(e) => setEditedLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
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
                />
                <p className="text-xs text-gray-600 mt-1">{editedPrompt.length} 字符</p>
              </div>
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
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">最大 Token 数</label>
                <input
                  type="number"
                  value={editedMaxTokens}
                  onChange={(e) => setEditedMaxTokens(Number(e.target.value))}
                  min={500} max={16000} step={500}
                  className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {msg && (
                <div className={`rounded-lg px-3.5 py-2 text-sm ${
                  msg.startsWith("✅")
                    ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300"
                    : "bg-red-900/30 border border-red-800 text-red-300"
                }`}>{msg}</div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {versions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">暂无历史版本</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded font-mono">v{v.version}</span>
                        <span className="text-white text-sm font-medium">{normalizeText(v.label)}</span>
                      </div>
                      <span className="text-gray-500 text-xs">{fmtDate(v.created_at)}</span>
                    </div>
                    <p className="text-gray-400 text-xs font-mono line-clamp-3 whitespace-pre-wrap">
                      {normalizeText(v.system_prompt_doubao).slice(0, 200)}...
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

        {activeTab === "edit" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
            <p className="text-gray-600 text-xs">保存时会创建新版本，旧版本自动保留为历史记录</p>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
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

// ── Skill Detail Drawer ──────────────────────────────────────────────────────

function SkillDetailDrawer({
  skill,
  allSkills,
  onClose,
  onEditPrompt,
}: {
  skill: Skill;
  allSkills: Skill[];
  onClose: () => void;
  onEditPrompt: () => void;
}) {
  const [stats, setStats] = useState<SkillStats | null>(null);
  const [statsErr, setStatsErr] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);

  const [tpl, setTpl] = useState<PromptTemplate | null>(null);
  const [badCases, setBadCases] = useState<BadCaseItem[]>([]);
  const [activeTrace, setActiveTrace] = useState<string | null>(null);

  useEffect(() => {
    setStatsLoading(true);
    setStatsErr("");
    setStats(null);
    getSkillStats(skill.id)
      .then(setStats)
      .catch((e) => setStatsErr(e instanceof Error ? e.message : "加载统计失败"))
      .finally(() => setStatsLoading(false));

    if (skill.prompt_template_id) {
      getPromptTemplate(skill.prompt_template_id)
        .then((r) => setTpl(r.template))
        .catch(() => setTpl(null));
      listBadCases({ promptTemplateId: skill.prompt_template_id, limit: 10 })
        .then((r) => setBadCases(r.badCases))
        .catch(() => setBadCases([]));
    } else {
      setTpl(null);
      setBadCases([]);
    }
  }, [skill.id, skill.prompt_template_id]);

  // upstream / downstream by stage order
  const stageOrder = STAGE_META[skill.category ?? ""]?.order;
  const sameStage = allSkills.filter((s) => s.category === skill.category && s.id !== skill.id);
  const upstream  = stageOrder ? allSkills.filter((s) => STAGE_META[s.category ?? ""]?.order === stageOrder - 1) : [];
  const downstream = stageOrder ? allSkills.filter((s) => STAGE_META[s.category ?? ""]?.order === stageOrder + 1) : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-2xl bg-gray-950 border-l border-gray-800 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{ICON_MAP[skill.icon ?? "Sparkles"] ?? "✨"}</span>
            <div>
              <h2 className="text-white font-semibold">{normalizeText(skill.label) || skill.id}</h2>
              <p className="text-gray-500 text-xs mt-0.5">{skill.id}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* 描述 */}
          <p className="text-gray-300 text-sm leading-relaxed">{normalizeText(skill.desc_text) || "暂无描述"}</p>

          {/* 链路位置 */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">链路位置</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              {stageOrder ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-mono">
                      Stage {stageOrder}
                    </span>
                    <span className="text-white text-sm font-medium">{STAGE_META[skill.category ?? ""]?.label}</span>
                    <span className="text-gray-500 text-xs">{STAGE_META[skill.category ?? ""]?.summary}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500 mb-1.5">上游 (Stage {stageOrder - 1})</p>
                      {upstream.length > 0 ? (
                        <ul className="space-y-1">
                          {upstream.slice(0, 4).map((s) => (
                            <li key={s.id} className="text-gray-400">· {s.label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-700 italic">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-500 mb-1.5">同阶段</p>
                      {sameStage.length > 0 ? (
                        <ul className="space-y-1">
                          {sameStage.slice(0, 4).map((s) => (
                            <li key={s.id} className="text-gray-400">· {s.label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-700 italic">仅本技能</p>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-500 mb-1.5">下游 (Stage {stageOrder + 1})</p>
                      {downstream.length > 0 ? (
                        <ul className="space-y-1">
                          {downstream.slice(0, 4).map((s) => (
                            <li key={s.id} className="text-gray-400">· {s.label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-700 italic">—</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-sm">该技能未归属链路阶段</p>
              )}
            </div>
          </section>

          {/* 调用统计 */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">调用统计 · 近 7 日</h3>
            {statsLoading ? (
              <div className="text-gray-600 text-sm py-4">加载中...</div>
            ) : statsErr ? (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-xs">{statsErr}</div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <StatCard label="调用次数"   value={stats.total} />
                  <StatCard label="成功率"     value={stats.successRate != null ? `${stats.successRate}%` : "—"} />
                  <StatCard label="平均 Token" value={stats.avgTokens   ?? "—"} />
                  <StatCard label="平均耗时"   value={stats.avgDurationMs != null ? `${stats.avgDurationMs} ms` : "—"} />
                </div>
                <DailySparkline data={stats.dailyTrend} />
              </>
            ) : null}
          </section>

          {/* IO Schema */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">输入 / 输出 Schema</h3>
            {tpl ? (
              <div className="space-y-3">
                <SchemaBlock title="必需参数 (required_params)" json={safeParseJson(tpl.required_params)} />
                <SchemaBlock title="可选参数 (optional_params)" json={safeParseJson(tpl.optional_params)} />
                <SchemaBlock title="输出格式 (output_format)" json={tpl.output_format} />
                {tpl.output_schema ? (
                  <SchemaBlock title="输出 Schema (output_schema)" json={safeParseJson(tpl.output_schema)} />
                ) : null}
              </div>
            ) : (
              <p className="text-gray-600 text-xs italic">该技能未关联 prompt 模板（无 LLM 调用）</p>
            )}
          </section>

          {/* 最近 bad cases — prompt 优化的反向输入源 */}
          {tpl && (
            <section>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                最近 bad cases（{badCases.length}）
              </h3>
              {badCases.length === 0 ? (
                <p className="text-gray-700 text-xs italic">
                  暂无 bad case 记录。在「调用追踪」页或本页用户/客服反馈后，与本技能 prompt 模板相关的差评会汇集到这里，作为下次 prompt 优化的素材。
                </p>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
                  {badCases.map((bc) => (
                    <button
                      key={bc.id}
                      type="button"
                      onClick={() => bc.sessionId && setActiveTrace(bc.sessionId)}
                      disabled={!bc.sessionId}
                      className="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-mono">✗ bad</span>
                        <span className="text-xs text-gray-500">{bc.reporterId ?? "—"}</span>
                        <span className="ml-auto text-xs text-gray-600">
                          {new Date(bc.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {bc.note ? (
                        <p className="text-sm text-gray-300 line-clamp-2">{bc.note}</p>
                      ) : (
                        <p className="text-xs text-gray-600 italic">（未填写说明）</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 操作 */}
          <section className="pt-2 border-t border-gray-800 flex gap-3">
            {tpl ? (
              <button
                type="button"
                onClick={onEditPrompt}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
              >
                ✏️ 编辑提示词
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-4 py-2 bg-gray-800 text-gray-600 text-sm font-medium rounded-lg cursor-not-allowed"
                title="该技能无 prompt（占位/规则技能）"
              >
                无可编辑提示词
              </button>
            )}
            <span className="text-gray-600 text-xs self-center">
              入口：<span className="text-gray-400">{ENTRY_SOURCE_BADGE[skill.entry_source ?? ""]?.label ?? skill.entry_source}</span> ·
              意图：<span className="text-gray-400 ml-1">{skill.intent}</span>
            </span>
          </section>
        </div>
      </div>
      {activeTrace && (
        <TraceDetailDrawer sessionId={activeTrace} onClose={() => setActiveTrace(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-white text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function DailySparkline({ data }: { data: Array<{ day: string; count: number }> }) {
  if (data.length === 0) {
    return <p className="text-gray-700 text-xs italic">近 7 日无调用记录</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 360;
  const h = 60;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((d, i) => {
      const x = i * stepX;
      const y = h - (d.count / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth={1.5} />
        {data.map((d, i) => {
          const x = i * stepX;
          const y = h - (d.count / max) * h;
          return <circle key={d.day} cx={x} cy={y} r={2.5} fill="#a5b4fc" />;
        })}
      </svg>
      <div className="flex justify-between mt-1.5 text-xs text-gray-600">
        {data.map((d) => <span key={d.day}>{d.day.slice(5)}·{d.count}</span>)}
      </div>
    </div>
  );
}

function SchemaBlock({ title, json }: { title: string; json: unknown }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1.5">{title}</p>
      <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
        {typeof json === "string" ? json : JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

function safeParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

// ── Skill Create Modal（运营自助新建技能 + 模板）─────────────────────────────

function SkillCreateModal({
  defaultStage,
  onClose,
  onCreated,
}: {
  defaultStage?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [templates, setTemplates] = useState<PromptTemplateSummary[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 技能基础字段
  const [skillId, setSkillId] = useState("");
  const [label, setLabel] = useState("");
  const [descText, setDescText] = useState("");
  const [icon, setIcon] = useState("Sparkles");
  const [category, setCategory] = useState(defaultStage ?? "stage6_tools");
  const [entrySource, setEntrySource] = useState<"workbench" | "pipeline" | "cta">("pipeline");
  const [cost, setCost] = useState(5);

  // 关联模板（已有 / 新建）
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [newTplLabel, setNewTplLabel] = useState("");
  const [newTplSystem, setNewTplSystem] = useState("");
  const [newTplUser, setNewTplUser] = useState("");
  const [newTplMaxTokens, setNewTplMaxTokens] = useState(2000);
  const [newTplFormat, setNewTplFormat] = useState<"markdown" | "json">("markdown");

  useEffect(() => {
    listPromptTemplates()
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, []);

  // 自动 slugify label → skillId
  useEffect(() => {
    if (!skillId && label) {
      setSkillId(label.toLowerCase().replace(/[^a-z0-9一-龥]+/g, "-").replace(/^-|-$/g, ""));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  async function handleSubmit() {
    if (!label || !descText) {
      setMsg("请填写技能名称和描述");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      let templateId = selectedTemplateId;

      if (mode === "new") {
        if (!newTplLabel || !newTplSystem) {
          setMsg("新建模板需要填写名称和 system prompt");
          setBusy(false);
          return;
        }
        const tplBaseId = (skillId || label.toLowerCase()).replace(/[^a-z0-9-]+/g, "-");
        const created = await createPromptTemplate({
          id: tplBaseId,
          label: newTplLabel,
          intent: "custom",
          category,
          system_prompt_doubao: newTplSystem,
          user_prompt_template: newTplUser,
          required_params: [],
          optional_params: [],
          output_format: newTplFormat,
          preferred_model: "doubao",
          max_tokens: newTplMaxTokens,
          base_cost: cost,
        });
        templateId = created.id;
      }

      if (!templateId) {
        setMsg("请选择已有模板或新建模板");
        setBusy(false);
        return;
      }

      await createSkill({
        id: skillId || undefined,
        label,
        desc_text: descText,
        icon,
        category,
        prompt_template_id: templateId,
        intent: "custom",
        entry_source: entrySource,
        cost,
        sort_order: 9999,
        is_active: true,
        is_premium: false,
      });

      onCreated();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-lg">+ 新建技能</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              技能 = 代码里的一个 LLM 调用点。运营自建技能后，需在代码侧加一行
              <code className="font-mono mx-1">resolveSystemPrompt(&apos;...&apos;)</code>
              才会生效。
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 基础信息 */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">基础信息</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">名称 *</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="如：账号定位诊断"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">技能 ID（自动生成）</label>
                <input
                  type="text"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  placeholder="account-positioning"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">描述 *</label>
                <textarea
                  value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                  rows={2}
                  placeholder="一句话描述这个技能做什么 + 输出什么"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">链路阶段</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="stage1_input">Stage 1 · 输入理解</option>
                  <option value="stage2_collect">Stage 2 · 数据采集</option>
                  <option value="stage3_analyze">Stage 3 · 清洗分析</option>
                  <option value="stage4_predict">Stage 4 · 核心预测</option>
                  <option value="stage5_recommend">Stage 5 · 动作推荐</option>
                  <option value="stage6_tools">Stage 6 · 用户工具</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">入口类型</label>
                <select
                  value={entrySource}
                  onChange={(e) => setEntrySource(e.target.value as "workbench" | "pipeline" | "cta")}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="pipeline">pipeline · 链路内部</option>
                  <option value="workbench">workbench · 工作台入口</option>
                  <option value="cta">cta · 二次动作</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">积分消耗</label>
                <input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                  min={0} max={100}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">图标</label>
                <select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Sparkles">✨ Sparkles</option>
                  <option value="TrendingUp">📈 TrendingUp</option>
                  <option value="LayoutGrid">🗂️ LayoutGrid</option>
                  <option value="FileText">📄 FileText</option>
                  <option value="Rocket">🚀 Rocket</option>
                  <option value="Scissors">✂️ Scissors</option>
                </select>
              </div>
            </div>
          </section>

          {/* 关联模板 */}
          <section>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Prompt 模板</h3>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`px-3 py-1.5 text-xs rounded-lg ${
                  mode === "existing" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                选已有模板
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`px-3 py-1.5 text-xs rounded-lg ${
                  mode === "new" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                + 新建模板
              </button>
            </div>

            {mode === "existing" ? (
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">— 选择一个模板 —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} · {t.label}（{t.category}）
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">模板名称</label>
                  <input
                    type="text"
                    value={newTplLabel}
                    onChange={(e) => setNewTplLabel(e.target.value)}
                    placeholder="如：账号定位诊断"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">System Prompt *</label>
                  <textarea
                    value={newTplSystem}
                    onChange={(e) => setNewTplSystem(e.target.value)}
                    rows={10}
                    placeholder="# 角色 ..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">User Prompt 模板（可选）</label>
                  <textarea
                    value={newTplUser}
                    onChange={(e) => setNewTplUser(e.target.value)}
                    rows={4}
                    placeholder="如：请分析以下数据：{{xxx}}"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">输出格式</label>
                    <select
                      value={newTplFormat}
                      onChange={(e) => setNewTplFormat(e.target.value as "markdown" | "json")}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    >
                      <option value="markdown">markdown</option>
                      <option value="json">json</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">最大 Token 数</label>
                    <input
                      type="number"
                      value={newTplMaxTokens}
                      onChange={(e) => setNewTplMaxTokens(Number(e.target.value))}
                      min={500} max={16000} step={500}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {msg && (
            <div className="rounded-lg px-3.5 py-2 text-sm bg-red-900/30 border border-red-800 text-red-300">
              {msg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">取消</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
          >
            {busy ? "创建中..." : "创建技能"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skill Row & Table（共用） ────────────────────────────────────────────────

function SkillTable({
  skills,
  onOpenDetail,
  onToggle,
  onCostChange,
  onDelete,
  savingId,
}: {
  skills: Skill[];
  onOpenDetail: (s: Skill) => void;
  onToggle: (s: Skill) => void;
  onCostChange: (s: Skill, cost: number) => void;
  onDelete: (s: Skill) => void;
  savingId: string | null;
}) {
  if (skills.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-gray-600 text-sm text-center">
        该分组暂无技能
      </div>
    );
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">技能</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">入口</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Intent</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">积分</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">详情</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {skills.map((skill) => {
            const badge = ENTRY_SOURCE_BADGE[skill.entry_source ?? ""];
            return (
              <tr key={skill.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ICON_MAP[skill.icon ?? "Sparkles"] ?? "✨"}</span>
                    <div>
                      <p className="font-medium text-white">{normalizeText(skill.label) || skill.id}</p>
                      <p className="text-xs text-gray-500 mt-0.5 max-w-xs">{normalizeText(skill.desc_text) || "暂无描述"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {badge ? (
                    <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
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
                      if (v !== skill.cost) onCostChange(skill, v);
                    }}
                    className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(skill)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/40 hover:bg-indigo-900/70 border border-indigo-800 text-indigo-300 text-xs rounded-lg transition-colors"
                  >
                    <span>🔎</span><span>查看详情</span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onToggle(skill)}
                    disabled={savingId === skill.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                      skill.is_active === 1 ? "bg-indigo-600" : "bg-gray-700"
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      skill.is_active === 1 ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onDelete(skill)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    title="删除技能"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pipeline Overview View ───────────────────────────────────────────────────

function PipelineOverviewView({ skills }: { skills: Skill[] }) {
  const [topology, setTopology] = useState<PipelineTopology | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getPipelineTopology()
      .then(setTopology)
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const skillById = useMemo(
    () => Object.fromEntries(skills.map((s) => [s.id, s])),
    [skills],
  );

  if (err) return <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{err}</div>;
  if (!topology) return <div className="text-gray-500 text-sm">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-semibold">链路总览</h2>
        <p className="text-gray-500 text-sm mt-0.5">爆款预测 Agent 端到端执行链路 — 6 个阶段，每个阶段下挂载对应技能</p>
      </div>

      <div className="space-y-3">
        {topology.stages.map((stage) => (
          <div key={stage.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-mono">
                Stage {stage.order}
              </span>
              <span className="text-white text-sm font-semibold">{stage.label}</span>
              <span className="text-gray-500 text-xs">{stage.summary}</span>
              <span className="ml-auto text-xs text-gray-600">{stage.skills.length} 个技能</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage.skills.length === 0 ? (
                <span className="text-gray-700 text-xs italic">该阶段暂无技能</span>
              ) : (
                stage.skills.map((s) => {
                  const fullSkill = skillById[s.id];
                  const badge = ENTRY_SOURCE_BADGE[s.entrySource];
                  const wired = !!s.promptTemplateId && fullSkill?.is_active === 1;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"
                    >
                      <span className="text-sm">{ICON_MAP[fullSkill?.icon ?? "Sparkles"] ?? "✨"}</span>
                      <span className="text-sm text-white">{s.label}</span>
                      {badge && <span className={`text-xs px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        wired
                          ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800"
                          : "bg-gray-700 text-gray-400 border border-gray-600"
                      }`}>{wired ? "已接入" : "占位"}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main SkillsPage ──────────────────────────────────────────────────────────

type SkillView =
  | "overview"
  | "stage1_input"
  | "stage2_collect"
  | "stage3_analyze"
  | "stage4_predict"
  | "stage5_recommend"
  | "stage6_tools"
  | "entry";

interface SkillsPageProps {
  view: SkillView;
}

export function SkillsPage({ view }: SkillsPageProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [creatingSkill, setCreatingSkill] = useState(false);

  function reload() {
    setLoading(true);
    getSkills()
      .then((res) => setSkills(res.skills))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleDelete(skill: Skill) {
    if (!confirm(`确认删除技能「${skill.label}」？\n\n此操作不可撤销。如果代码侧仍在用此技能 id，链路会降级到 fallback prompt。`)) return;
    try {
      await deleteSkill(skill.id);
      setMsg(`已删除 ${skill.label}`);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "删除失败");
    }
    setTimeout(() => setMsg(""), 3000);
  }

  async function handleToggle(skill: Skill) {
    setSavingId(skill.id);
    const newActive = skill.is_active === 1 ? 0 : 1;
    try {
      await updateSkill(skill.id, { is_active: newActive });
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, is_active: newActive } : s)));
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
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, cost } : s)));
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

  // 按当前 view 决定要展示的 skills 子集
  let viewSkills: Skill[] = [];
  let viewTitle = "";
  let viewSummary = "";

  if (view === "overview") {
    return (
      <>
        {detailSkill && (
          <SkillDetailDrawer
            skill={detailSkill}
            allSkills={skills}
            onClose={() => setDetailSkill(null)}
            onEditPrompt={() => {
              setEditingSkill(detailSkill);
            }}
          />
        )}
        {editingSkill && <PromptEditorModal skill={editingSkill} onClose={() => setEditingSkill(null)} />}
        {creatingSkill && (
          <SkillCreateModal
            onClose={() => setCreatingSkill(false)}
            onCreated={reload}
          />
        )}
        <PipelineOverviewView skills={skills} />
      </>
    );
  }

  if (view === "entry") {
    viewSkills = skills.filter((s) => s.entry_source === "workbench");
    viewTitle = "入口技能（用户工作台可见）";
    viewSummary = "用户在工作台直接点击触发的技能。修改这些会直接影响 C 端体验。";
  } else if (STAGE_KEYS.includes(view)) {
    const meta = STAGE_META[view];
    viewSkills = skills.filter((s) => s.category === view);
    viewTitle = `Stage ${meta.order} · ${meta.label}`;
    viewSummary = meta.summary;
  }

  return (
    <div className="space-y-6">
      {detailSkill && (
        <SkillDetailDrawer
          skill={detailSkill}
          allSkills={skills}
          onClose={() => setDetailSkill(null)}
          onEditPrompt={() => {
            setEditingSkill(detailSkill);
          }}
        />
      )}
      {editingSkill && <PromptEditorModal skill={editingSkill} onClose={() => setEditingSkill(null)} />}
      {creatingSkill && (
        <SkillCreateModal
          defaultStage={view !== "entry" && STAGE_KEYS.includes(view) ? view : undefined}
          onClose={() => setCreatingSkill(false)}
          onCreated={() => { reload(); setMsg("✅ 技能已创建"); setTimeout(() => setMsg(""), 3000); }}
        />
      )}

      {msg && (
        <div className="bg-emerald-900/40 border border-emerald-700 rounded-lg px-3.5 py-2 text-emerald-300 text-sm">
          {msg}
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-white font-semibold">{viewTitle}</h2>
          <p className="text-gray-500 text-sm mt-0.5">{viewSummary}</p>
          <p className="text-gray-600 text-xs mt-2">{viewSkills.length} 个技能</p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingSkill(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg"
        >
          + 新建技能
        </button>
      </div>

      <SkillTable
        skills={viewSkills}
        onOpenDetail={setDetailSkill}
        onToggle={handleToggle}
        onCostChange={handleCostChange}
        onDelete={handleDelete}
        savingId={savingId}
      />
    </div>
  );
}
