/**
 * Viral Breakdown Renderer
 * ========================
 * 爆款拆解的完整渲染器 — 展示 LLM 输出的全部 JSON 字段。
 *
 * 七大模块：
 *   1. 爆款指数仪表盘（综合评分 + 四维雷达 + 核心标签 + 一句话辣评）
 *   2. 黄金钩子解剖（视觉钩 + 听觉钩 + 文案钩类型 + 模仿技巧）
 *   3. 情绪曲线与节奏（刺激间隔 + 情绪曲线 + 多巴胺锚点）
 *   4. 脚本逻辑与结构（结构模块 + 力量词 + 金句）
 *   5. 变现暗线（人设类型 + 变现埋点 + 转化话术）
 *   6. 互动工程（槽点设计 + 预测神评 + CTA 类型）
 *   7. 像素级复刻 SOP（值得抄 + 要避开 + 迁移步骤 + 脚本骨架 + 拍摄通告单）
 */
import { Scissors, Sparkles, Target } from "lucide-react";
import type { ResultRecord } from "../../../store/app-data";
import { TaskSection } from "../results-shared";
import {
  registerArtifactRenderer,
  type ArtifactRendererProps,
  type HeroMetricCard,
  type DeepDiveConfig,
  type CtaActionConfig,
  type FollowUpAction,
} from "../artifact-registry";

/* ------------------------------------------------------------------ */
/*  Score Radar Component                                               */
/* ------------------------------------------------------------------ */
function ScoreRadar({
  dimensions,
}: {
  dimensions: { logic: number; emotion: number; visual: number; commercial: number };
}) {
  const items = [
    { label: "逻辑", key: "logic", value: dimensions.logic, color: "#6366f1" },
    { label: "情感", key: "emotion", value: dimensions.emotion, color: "#ec4899" },
    { label: "视觉", key: "visual", value: dimensions.visual, color: "#f59e0b" },
    { label: "商业", key: "commercial", value: dimensions.commercial, color: "#10b981" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-1.5">
          <div className="relative h-16 w-16">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="#f3f4f6" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke={item.color}
                strokeWidth="6"
                strokeDasharray={`${(item.value / 100) * 163.4} 163.4`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-800">
              {item.value}
            </div>
          </div>
          <span className="text-xs text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tag Pill Component                                                  */
/* ------------------------------------------------------------------ */
function TagPill({ label, color = "gray" }: { label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700",
    indigo: "bg-indigo-50 text-indigo-700",
    pink: "bg-pink-50 text-pink-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color] ?? colorMap.gray}`}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Renderer Component                                                  */
/* ------------------------------------------------------------------ */
function ViralBreakdownBody({ result }: ArtifactRendererProps) {
  const raw = result.taskPayload.kind === "viral_breakdown" ? result.taskPayload : null;

  const payload = raw ?? {
    kind: "viral_breakdown" as const,
    breakdownSummary: result.summary,
    copyPoints: result.bestFor,
    avoidPoints: result.notFor,
    migrationSteps: result.continueIf,
    proofContents: result.supportingContents.slice(0, 3).map((item) => ({
      contentId: item.contentId,
      title: item.title,
      structureSummary: item.structureSummary,
      whyIncluded: item.whyIncluded,
    })),
  };

  const hasRichData = !!(payload.overallScore || payload.hookAnalysis || payload.rhythmAnalysis);

  return (
    <div className="space-y-4">

      {/* ── 1. 爆款指数仪表盘 ── */}
      <TaskSection title="爆款指数仪表盘" description="综合评分 + 四维拆解 + 核心标签">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            {payload.overallScore != null && (
              <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-4 text-white shadow-sm">
                <span className="text-3xl font-bold leading-none">{payload.overallScore}</span>
                <span className="mt-1 text-xs opacity-80">综合评分</span>
              </div>
            )}
            <div className="flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-gray-700">{payload.breakdownSummary}</p>
              {payload.oneLinerComment && (
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
                  <p className="text-xs font-medium text-violet-700">💬 {payload.oneLinerComment}</p>
                </div>
              )}
            </div>
          </div>

          {payload.scoreDimensions && (
            <div className="rounded-2xl bg-gray-50 px-4 py-4">
              <div className="mb-3 text-xs text-gray-500">四维评分</div>
              <ScoreRadar dimensions={payload.scoreDimensions} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {payload.coreLabels?.map((label, i) => (
              <TagPill key={i} label={label} color={["indigo", "pink", "amber", "emerald", "violet"][i % 5]} />
            ))}
            {payload.hookType && <TagPill label={`钩子: ${payload.hookType}`} color="gray" />}
            {payload.contentStructure && <TagPill label={`结构: ${payload.contentStructure}`} color="gray" />}
            {payload.estimatedDuration && <TagPill label={`时长: ${payload.estimatedDuration}`} color="gray" />}
            {payload.targetAudience && <TagPill label={`受众: ${payload.targetAudience}`} color="gray" />}
          </div>
        </div>
      </TaskSection>

      {/* ── 2. 黄金钩子解剖 ── */}
      {payload.hookAnalysis && (
        <TaskSection title="黄金钩子解剖" description="开头3秒的完播率密码">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <div className="mb-1.5 text-xs font-medium text-amber-700">👁 视觉钩</div>
              <p className="text-sm leading-relaxed text-amber-950">{payload.hookAnalysis.visualHook}</p>
            </div>
            <div className="rounded-2xl bg-orange-50 px-4 py-4">
              <div className="mb-1.5 text-xs font-medium text-orange-700">🎵 听觉钩</div>
              <p className="text-sm leading-relaxed text-orange-950">{payload.hookAnalysis.audioHook}</p>
            </div>
            <div className="rounded-2xl bg-yellow-50 px-4 py-4">
              <div className="mb-1.5 text-xs font-medium text-yellow-700">✍️ 文案钩类型</div>
              <p className="text-sm font-medium text-yellow-900">{payload.hookAnalysis.copyHookType}</p>
              <p className="mt-1 text-xs leading-relaxed text-yellow-700">{payload.hookAnalysis.copyHookReason}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white px-4 py-4">
              <div className="mb-1.5 text-xs font-medium text-gray-500">💡 模仿技巧</div>
              <p className="text-sm leading-relaxed text-gray-700">{payload.hookAnalysis.hookImitationTip}</p>
            </div>
          </div>
        </TaskSection>
      )}

      {/* ── 3. 情绪曲线与节奏 ── */}
      {payload.rhythmAnalysis && (
        <TaskSection title="情绪曲线与节奏" description="完播率背后的节奏控制逻辑">
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-2xl bg-pink-50 px-4 py-4">
              <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-pink-500 px-3 py-2 text-white">
                <span className="text-xl font-bold leading-none">{payload.rhythmAnalysis.stimulusIntervalSeconds}</span>
                <span className="text-xs opacity-80">秒/刺激</span>
              </div>
              <div>
                <div className="text-xs text-gray-500">情绪曲线</div>
                <p className="mt-0.5 text-sm font-medium text-gray-800">{payload.rhythmAnalysis.emotionCurve}</p>
              </div>
            </div>
            {payload.rhythmAnalysis.dopamineNodes.length > 0 && (
              <div className="rounded-2xl bg-gray-50 px-4 py-4">
                <div className="mb-2 text-xs text-gray-500">多巴胺锚点</div>
                <div className="flex flex-wrap gap-2">
                  {payload.rhythmAnalysis.dopamineNodes.map((node, i) => (
                    <span key={i} className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs text-pink-700">
                      {node}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TaskSection>
      )}

      {/* ── 4. 脚本逻辑与结构 ── */}
      {payload.scriptLogic && (
        <TaskSection title="脚本逻辑与结构" description="内容框架 + 力量词 + 值得直接抄的金句">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-indigo-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-indigo-700">🧱 结构模块</div>
              <ol className="space-y-1">
                {payload.scriptLogic.structureModules.map((mod, i) => (
                  <li key={i} className="flex gap-2 text-sm text-indigo-900">
                    <span className="shrink-0 text-indigo-400">{i + 1}.</span>
                    <span>{mod}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl bg-violet-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-violet-700">⚡ 力量词</div>
              <div className="flex flex-wrap gap-1.5">
                {payload.scriptLogic.powerWords.map((word, i) => (
                  <span key={i} className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                    {word}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-blue-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-blue-700">💎 金句</div>
              <div className="space-y-2">
                {payload.scriptLogic.goldenQuotes.map((quote, i) => (
                  <p key={i} className="border-l-2 border-blue-300 pl-2 text-xs leading-relaxed text-blue-900">
                    "{quote}"
                  </p>
                ))}
              </div>
            </div>
          </div>
        </TaskSection>
      )}

      {/* ── 5. 变现暗线 ── */}
      {payload.monetizationAnalysis && (
        <TaskSection title="变现暗线" description="人设设计 + 变现埋点 + 转化话术">
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
              <span className="text-lg">🎭</span>
              <div>
                <div className="text-xs text-gray-500">人设类型</div>
                <p className="text-sm font-medium text-emerald-800">{payload.monetizationAnalysis.personaType}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 px-4 py-4">
                <div className="mb-2 text-xs text-gray-500">💰 变现埋点</div>
                <ul className="space-y-1.5">
                  {payload.monetizationAnalysis.monetizationPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 shrink-0 text-gray-400">→</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-4">
                <div className="mb-2 text-xs text-gray-500">🗣 转化话术</div>
                <p className="text-sm leading-relaxed text-gray-700">{payload.monetizationAnalysis.conversionScript}</p>
              </div>
            </div>
          </div>
        </TaskSection>
      )}

      {/* ── 6. 互动工程 ── */}
      {payload.engagementEngineering && (
        <TaskSection title="互动工程与算法友好度" description="槽点预埋 + 神评论预测 + CTA 设计">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-red-50 px-4 py-4">
                <div className="mb-1.5 text-xs font-medium text-red-700">🎯 槽点设计</div>
                <p className="text-sm leading-relaxed text-red-900">{payload.engagementEngineering.controversyTraps}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-4">
                <div className="mb-1.5 text-xs font-medium text-gray-600">📢 CTA 类型</div>
                <p className="text-sm font-medium text-gray-800">{payload.engagementEngineering.ctaType}</p>
              </div>
            </div>
            {payload.engagementEngineering.predictedTopComments.length > 0 && (
              <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-gray-100">
                <div className="mb-2 text-xs text-gray-500">🔮 预测神评论</div>
                <div className="space-y-2">
                  {payload.engagementEngineering.predictedTopComments.map((comment, i) => (
                    <div key={i} className="flex gap-2 rounded-xl bg-gray-50 px-3 py-2">
                      <span className="shrink-0 text-sm">💬</span>
                      <p className="text-xs leading-relaxed text-gray-700">{comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TaskSection>
      )}

      {/* ── 7. 像素级复刻 SOP ── */}
      <TaskSection title="像素级复刻 SOP" description="值得抄的点 + 要避开的坑 + 迁移步骤 + 脚本骨架 + 拍摄通告单">
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-emerald-700">✅ 值得抄</div>
              <ul className="space-y-1.5">
                {payload.copyPoints.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-emerald-900">
                    <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-amber-700">⚠️ 迁移时要调整</div>
              <ul className="space-y-1.5">
                {payload.avoidPoints.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-900">
                    <span className="mt-0.5 shrink-0 text-amber-400">!</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-blue-50 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-blue-700">🗺 迁移步骤</div>
              <ol className="space-y-1.5">
                {payload.migrationSteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-blue-900">
                    <span className="shrink-0 font-medium text-blue-400">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {payload.scriptSkeleton && (
            <div className="rounded-2xl bg-gray-900 px-4 py-4">
              <div className="mb-2 text-xs font-medium text-gray-400">📝 脚本骨架</div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-100">{payload.scriptSkeleton}</pre>
            </div>
          )}

          {payload.shootingGuide && (
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
              <div className="mb-3 text-xs font-medium text-gray-600">🎬 拍摄通告单</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 px-3 py-3">
                  <div className="mb-1 text-xs text-gray-400">景别 / 构图</div>
                  <p className="text-sm text-gray-700">{payload.shootingGuide.shotComposition}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-3">
                  <div className="mb-1 text-xs text-gray-400">表演风格</div>
                  <p className="text-sm text-gray-700">{payload.shootingGuide.performanceStyle}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-3">
                  <div className="mb-1 text-xs text-gray-400">BGM 风格</div>
                  <p className="text-sm text-gray-700">{payload.shootingGuide.bgmStyle}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </TaskSection>

      {/* ── 8. 结构证明样本（仅在无富数据时显示） ── */}
      {!hasRichData && payload.proofContents.length > 0 && (
        <TaskSection title="结构证明样本" description="进入这次拆解链的真实样本">
          <div className="grid gap-3 lg:grid-cols-3">
            {payload.proofContents.map((item) => (
              <div
                key={item.contentId}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="line-clamp-2 break-words text-sm text-gray-900">{item.title}</div>
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-relaxed text-gray-600">
                  {item.structureSummary}
                </div>
                <p className="mt-3 break-words text-xs leading-relaxed text-gray-500">
                  {item.whyIncluded}
                </p>
              </div>
            ))}
          </div>
        </TaskSection>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Registry Configuration                                              */
/* ------------------------------------------------------------------ */
function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const payload = result.taskPayload.kind === "viral_breakdown" ? result.taskPayload : null;
  const score = payload?.overallScore;
  const hookType = payload?.hookType;
  const contentStructure = payload?.contentStructure;
  const targetAudience = payload?.targetAudience;
  const estimatedDuration = payload?.estimatedDuration;
  const topLabel = payload?.coreLabels?.[0];

  // 第一卡：综合评分 + 一句话辣评
  const card1: HeroMetricCard = {
    label: "爆款综合评分",
    value: score != null ? `${score} 分` : "--",
    detail: payload?.oneLinerComment ?? "暂无评分",
  };

  // 第二卡：钩子类型 + 内容结构
  const hookLabel = hookType
    ? `${hookType}钉子`
    : (topLabel ?? "未识别");
  const hookDetail = contentStructure
    ? contentStructure
    : (payload?.hookAnalysis?.copyHookType ? `文案钩类型: ${payload.hookAnalysis.copyHookType}` : "暂无结构数据");
  const card2: HeroMetricCard = {
    label: "钩子类型",
    value: hookLabel,
    detail: hookDetail,
  };

  // 第三卡：目标受众 + 预估时长
  const audienceVal = targetAudience ?? "未识别";
  const durationDetail = estimatedDuration ? `预估时长: ${estimatedDuration}` : "暂无时长数据";
  const card3: HeroMetricCard = {
    label: "目标受众",
    value: audienceVal,
    detail: durationDetail,
    span: "col-span-2 lg:col-span-1",
  };

  return [card1, card2, card3];
}

function getDeepDive(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续展开这次拆解结果",
    description: "可继续补可抄点、迁移步骤、脚本骨架和避坑说明。",
    placeholder:
      "把这条内容拆成可抄点\n给我一版试拍版结构\n把不能直接照搬的地方讲清楚",
    quickActions: [
      { label: "拆成试拍步骤", cost: 10 },
      { label: "给我一版试拍版", cost: 30 },
      { label: "讲清楚不能照搬什么", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "remake_script",
      icon: Sparkles,
      title: "生成翻拍脚本",
      description: "把这条爆款改成你能直接用的版本，保留结构去掉雷点",
      value: "5 分钟拿到可开拍的脚本",
      cost: 30,
      prompt: `基于这次爆款拆解（${result.query}），帮我生成一版翻拍脚本，保留核心爆点结构，替换掉不能直接照搬的部分，给出分镜和口播文案。`,
      highlight: true,
    },
    {
      id: "extract_hooks",
      icon: Scissors,
      title: "提取钩子和金句",
      description: "把这条内容里最值钱的表达直接抄走",
      value: "获得 5-8 个可复用的钩子句式",
      cost: 10,
      prompt: `基于这次爆款拆解（${result.query}），帮我提取所有值得复用的钩子、金句、CTA 模式和过渡句，按使用场景分类。`,
    },
    {
      id: "find_similar",
      icon: Target,
      title: "找 5 个同类爆款",
      description: "扩大参考样本，看这个结构还有谁在用",
      value: "验证爆款结构的可复制性",
      cost: 20,
      prompt: `基于这次爆款拆解（${result.query}），帮我找到 5 个使用类似结构的爆款内容，对比它们的共同点和差异点。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次爆款拆解，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "拆成试拍步骤", prompt: "拆成试拍步骤" },
    { label: "给我一版试拍版", prompt: "给我一版试拍版" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */
registerArtifactRenderer({
  artifactType: "breakdown_sheet",
  taskIntent: "viral_breakdown",
  component: ViralBreakdownBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { ViralBreakdownBody };
