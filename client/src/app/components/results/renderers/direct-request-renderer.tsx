/**
 * Direct Request Renderer
 * =======================
 * 通用自定义问题的结果页。使用真实 React 组件渲染，避免旧 Markdown/HTML
 * 分支因为 prose 插件或字符串类名缺失而出现未加载样式的画面。
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Compass,
  FileText,
  Lightbulb,
  Sparkles,
  Target,
} from "lucide-react";
import type { ResultRecord } from "../../../store/app-data";
import { TaskSection } from "../results-shared";
import {
  registerArtifactRenderer,
  type ArtifactRendererProps,
  type CtaActionConfig,
  type DeepDiveConfig,
  type FollowUpAction,
  type HeroMetricCard,
} from "../artifact-registry";

function formatCount(value: number | null | undefined): string {
  if (value == null) return "0";
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
  return String(value);
}

function toneClasses(tone?: "positive" | "neutral" | "warning") {
  if (tone === "warning") return "border-amber-100 bg-amber-50 text-amber-900";
  if (tone === "positive") return "border-emerald-100 bg-emerald-50 text-emerald-900";
  return "border-gray-100 bg-gray-50 text-gray-700";
}

function DirectRequestBody({ result }: ArtifactRendererProps) {
  const conclusion = result.summary || result.coreBet || result.primaryCard.description;
  const previewSections = result.primaryCard.previewSections ?? [];
  const market = result.marketEvidence;
  const hasMarketEvidence =
    market.kolCount > 0 ||
    market.kocCount > 0 ||
    market.newCreatorCount > 0 ||
    market.similarContentCount > 0;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                  智能分析结果
                </span>
                <span className="rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-500">
                  {result.taskIntentConfidence === "high" ? "高匹配" : result.taskIntentConfidence === "medium" ? "中匹配" : "低匹配"}
                </span>
              </div>
              <h1 className="break-words text-2xl font-semibold leading-tight text-gray-950">
                {result.title || result.primaryCard.title || "自定义问题分析"}
              </h1>
              <p className="mt-3 max-w-3xl break-words text-sm leading-7 text-gray-600">
                {conclusion}
              </p>
            </div>
            <div className="grid min-w-[180px] grid-cols-2 gap-2 sm:grid-cols-1">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[11px] text-gray-400">综合评分</div>
                <div className="mt-1 text-2xl font-semibold text-gray-950">{result.score}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[11px] text-gray-400">建议动作</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{result.bestActionNow.ctaLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-gray-50 sm:grid-cols-3">
          {[
            { label: "判断边界", value: result.decisionBoundary },
            { label: "适配说明", value: result.fitSummary },
            { label: "如果不做", value: result.missIfWait },
          ]
            .filter((item) => item.value)
            .map((item) => (
              <div key={item.label} className="bg-white px-5 py-4 sm:px-7">
                <div className="text-[11px] text-gray-400">{item.label}</div>
                <p className="mt-1 break-words text-sm leading-6 text-gray-700">{item.value}</p>
              </div>
            ))}
        </div>
      </div>

      {previewSections.length > 0 && (
        <TaskSection title="详细分析" description="把自定义问题拆成可判断、可行动的几个部分。">
          <div className="grid gap-3 lg:grid-cols-2">
            {previewSections.map((section) => (
              <div
                key={section.title}
                className={`rounded-2xl border px-4 py-4 ${toneClasses(section.tone)}`}
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 shrink-0" />
                  {section.title}
                </div>
                <div className="space-y-2">
                  {section.items.map((item, index) => (
                    <p key={`${section.title}-${index}`} className="break-words text-sm leading-6">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TaskSection>
      )}

      <TaskSection title="下一步判断" description={result.bestActionNow.reason}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <Target className="h-4 w-4" />
              当前最优动作
            </div>
            <p className="break-words text-sm leading-6 text-gray-700">{result.bestActionNow.description}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              继续做的条件
            </div>
            <div className="space-y-2">
              {(result.continueIf.length > 0 ? result.continueIf : result.bestFor).slice(0, 4).map((item, index) => (
                <p key={`continue-${index}`} className="break-words text-sm leading-6 text-emerald-800">{item}</p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              需要调整的信号
            </div>
            <div className="space-y-2">
              {(result.stopIf.length > 0 ? result.stopIf : result.notFor).slice(0, 4).map((item, index) => (
                <p key={`stop-${index}`} className="break-words text-sm leading-6 text-amber-800">{item}</p>
              ))}
            </div>
          </div>
        </div>
      </TaskSection>

      {(hasMarketEvidence || result.whyNowItems.length > 0) && (
        <TaskSection title="证据支撑" description="保留原始采样和推理依据，避免只看结论。">
          {hasMarketEvidence && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "同类内容", value: formatCount(market.similarContentCount) },
                { label: "KOL/KOC", value: `${formatCount(market.kolCount)} / ${formatCount(market.kocCount)}` },
                { label: "新创作者", value: formatCount(market.newCreatorCount) },
                { label: "近7天增长", value: `${market.growth7d}%` },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-400">{metric.label}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-950">{metric.value}</div>
                </div>
              ))}
            </div>
          )}

          {result.whyNowItems.length > 0 && (
            <div className="mt-4 space-y-3">
              {result.whyNowItems.slice(0, 4).map((item, index) => (
                <div key={`${item.sourceLabel}-${index}`} className="rounded-2xl border border-gray-100 px-4 py-4">
                  <div className="mb-1 text-xs font-medium text-gray-500">{item.sourceLabel}</div>
                  <p className="break-words text-sm leading-6 text-gray-900">{item.fact}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-gray-500">{item.userImpact || item.inference}</p>
                </div>
              ))}
            </div>
          )}
        </TaskSection>
      )}

      {(result.recommendedNextTasks.length > 0 || result.evidenceGaps.length > 0) && (
        <TaskSection title="可继续推进" description="把分析结论转成后续动作。">
          <div className="grid gap-3 lg:grid-cols-2">
            {result.recommendedNextTasks.slice(0, 4).map((task, index) => (
              <div key={`${task.title}-${index}`} className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                  <ClipboardList className="h-4 w-4 text-gray-500" />
                  {task.title}
                </div>
                <p className="break-words text-sm leading-6 text-gray-600">{task.reason}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400">
                  {task.actionLabel}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            ))}
            {result.evidenceGaps.slice(0, 4).map((gap, index) => (
              <div key={`gap-${index}`} className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Lightbulb className="h-4 w-4 text-gray-500" />
                  待补证据
                </div>
                <p className="break-words text-sm leading-6 text-gray-600">{gap}</p>
              </div>
            ))}
          </div>
        </TaskSection>
      )}
    </div>
  );
}

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  return [
    {
      label: "综合判断",
      value: result.primaryCard.title,
      detail: result.primaryCard.reason,
    },
    {
      label: "当前动作",
      value: result.bestActionNow.ctaLabel,
      detail: result.bestActionNow.reason,
    },
    {
      label: "任务匹配度",
      value: result.taskIntentConfidence === "high" ? "高匹配" : result.taskIntentConfidence === "medium" ? "中匹配" : "低匹配",
      detail: result.classificationReasons[0] ?? "自定义问题分析",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDiveConfig(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续分析这个问题",
    description: "可以补充条件、要求更具体的执行步骤，或让系统进一步验证证据。",
    placeholder: "把这次结论改成一周执行计划",
    quickActions: [
      { label: "把结论整理成执行清单", cost: 10 },
      { label: "补充反证条件和风险", cost: 10 },
      { label: "生成一周落地计划", cost: 20 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "direct_action_plan",
      icon: Compass,
      title: "生成执行方案",
      description: "把这次自定义分析落到步骤、时间表和交付物",
      value: "从判断直接进入执行",
      cost: 20,
      prompt: `基于这次分析（${result.query}），帮我生成可执行方案。`,
      highlight: true,
    },
    {
      id: "direct_evidence_check",
      icon: Lightbulb,
      title: "补充证据检查",
      description: "继续验证哪些条件成立、哪些条件会推翻结论",
      value: "降低误判风险",
      cost: 10,
      prompt: `基于这次分析（${result.query}），帮我补充证据检查和反证条件。`,
    },
    {
      id: "direct_topic_list",
      icon: ClipboardList,
      title: "改成选题清单",
      description: "把结论转成可以直接拍的选题方向",
      value: "快速获得可拍内容",
      cost: 20,
      prompt: `基于这次分析（${result.query}），帮我改成可拍选题清单。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次分析，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "整理执行清单", prompt: "把这次结论整理成执行清单" },
    { label: "补充风险判断", prompt: "补充反证条件和风险" },
  ];
}

registerArtifactRenderer({
  artifactType: "direct_request_doc",
  taskIntent: "direct_request",
  component: DirectRequestBody,
  getHeroMetrics,
  getDeepDiveConfig,
  getCtaActions,
  getFollowUpActions,
});

export { DirectRequestBody };
