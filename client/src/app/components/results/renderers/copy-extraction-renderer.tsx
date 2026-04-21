/**
 * Copy Extraction Renderer
 * ========================
 * 文案提取的 Dumb Renderer。
 */

import { Lightbulb, Sparkles, Target } from "lucide-react";
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
/*  Renderer Component                                                  */
/* ------------------------------------------------------------------ */

function CopyExtractionBody({ result }: ArtifactRendererProps) {
  const payload =
    result.taskPayload.kind === "copy_extraction"
      ? result.taskPayload
      : {
          kind: "copy_extraction" as const,
          extractionSummary: result.summary,
          hookPatterns: [] as string[],
          structurePatterns: [] as string[],
          ctaPatterns: [] as string[],
          reusablePhrases: [] as string[],
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="这次能直接拿走什么表达资产"
        description="文案提取页的 aha moment 是看完就能带走钩子、结构和 CTA，不是再读一遍解释。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.extractionSummary}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            { title: "可复用钩子", items: payload.hookPatterns },
            { title: "结构模式", items: payload.structurePatterns },
            { title: "CTA 模式", items: payload.ctaPatterns },
            { title: "可直接改写的表达", items: payload.reusablePhrases },
          ].map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-gray-100 bg-white px-4 py-4"
            >
              <div className="mb-2 text-xs text-gray-400">{section.title}</div>
              <div className="space-y-1.5">
                {section.items.map((item, index) => (
                  <p
                    key={`${section.title}-${index}`}
                    className="break-words text-sm leading-relaxed text-gray-700"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TaskSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Registry Configuration                                              */
/* ------------------------------------------------------------------ */

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  return [
    {
      label: "当前主结果",
      value: result.primaryCard.title,
      detail: result.primaryCard.reason,
    },
    {
      label: "推荐下一步",
      value: result.recommendedNextTasks[0]?.title ?? result.primaryCtaLabel,
      detail: result.recommendedNextTasks[0]?.reason ?? result.bestActionNow.reason,
    },
    {
      label: "任务匹配度",
      value: result.taskIntentConfidence === "high" ? "高匹配" : result.taskIntentConfidence === "medium" ? "中匹配" : "低匹配",
      detail: result.classificationReasons[0] ?? "文案提取任务",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDive(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续提取表达资产",
    description: "可继续补钩子、过渡句、CTA 模式和可改写表达。",
    placeholder:
      "提取这次内容里的钩子和 CTA\n给我一组可直接改写的表达\n把结构过渡句整理出来",
    quickActions: [
      { label: "提取 3 个钩子", cost: 10 },
      { label: "整理 CTA 模式", cost: 10 },
      { label: "生成可改写表达包", cost: 30 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "rewrite_pack",
      icon: Sparkles,
      title: "生成可改写表达包",
      description: "把提取的表达改成 5 个不同风格的版本，直接能用",
      value: "一次提取，多次复用",
      cost: 30,
      prompt: `基于这次文案提取（${result.query}），把所有提取的钩子和金句改写成 5 个不同风格版本（口语化/专业/幽默/悬念/共情），每个都能直接用。`,
      highlight: true,
    },
    {
      id: "hook_library",
      icon: Lightbulb,
      title: "扩展钩子句式库",
      description: "基于这次提取的模式，生成 20 个同类钩子",
      value: "建立你自己的爆款钩子弹药库",
      cost: 20,
      prompt: `基于这次文案提取（${result.query}），分析钩子的底层模式，然后生成 20 个同类型但不同主题的钩子句式。`,
    },
    {
      id: "cta_patterns",
      icon: Target,
      title: "整理 CTA 转化模式",
      description: "把高转化的行动号召拆成可复用的模板",
      value: "提升每条内容的转化率",
      cost: 10,
      prompt: `基于这次文案提取（${result.query}），整理所有 CTA 模式，按转化目的分类（关注/评论/收藏/购买），给出可直接套用的模板。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次文案提取，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "提取 3 个钩子", prompt: "提取 3 个钩子" },
    { label: "整理 CTA 模式", prompt: "整理 CTA 模式" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */

registerArtifactRenderer({
  artifactType: "copy_pack",
  taskIntent: "copy_extraction",
  component: CopyExtractionBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { CopyExtractionBody };
