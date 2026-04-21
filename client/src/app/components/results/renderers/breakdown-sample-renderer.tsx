/**
 * Breakdown Sample Renderer
 * ==========================
 * 低粉爆款样本拆解的 Dumb Renderer。
 * 设计为"技能工作台"风格：
 *   - 顶部：样本基础信息卡（平台/粉丝/播放/爆发因子）
 *   - 主区：三栏拆解结果（值得抄 / 别照搬 / 迁移步骤）
 *   - 工具区：标题变体 + 开头钉子 + 内容提纲
 *   - 底部：相似案例横向列表
 */

import { Copy, Layers, Sparkles } from "lucide-react";
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

function BreakdownSampleBody({ result }: ArtifactRendererProps) {
  const payload =
    result.taskPayload?.kind === "breakdown_sample"
      ? result.taskPayload
      : null;

  if (!payload) {
    return (
      <div className="rounded-2xl bg-gray-50 px-4 py-6 text-sm text-gray-500">
        {result.summary}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 样本信息卡 ── */}
      <TaskSection
        title="样本基础信息"
        description="这条爆款的核心数据，是你判断可借鉴性的基础。"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">平台 / 形式</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {payload.platform} · {payload.contentForm}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">账号体量</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{payload.fansLabel}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">播放量</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{payload.playCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-emerald-50 px-4 py-3">
            <p className="text-xs text-emerald-700">爆发因子</p>
            <p className="mt-1 text-sm font-medium text-emerald-900">
              {payload.anomaly}倍
            </p>
          </div>
        </div>

        {/* 爆因标签 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {payload.burstReasons.map((reason, i) => (
            <span
              key={i}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700"
            >
              {reason}
            </span>
          ))}
          {payload.trackTags.map((tag, i) => (
            <span
              key={`tag-${i}`}
              className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-xs text-gray-500"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* 拆解总结 */}
        <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.breakdownSummary}
          </p>
        </div>
      </TaskSection>

      {/* ── 三栏拆解结果 ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <TaskSection title="值得抄的部分">
          <div className="space-y-2">
            {payload.copyPoints.map((item, i) => (
              <p
                key={i}
                className="break-words rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>

        <TaskSection
          title="迁移时要调整的部分"
          description="这些地方需要结合你自己的风格重新设计，效果会更好。"
        >
          <div className="space-y-2">
            {payload.avoidPoints.map((item, i) => (
              <p
                key={i}
                className="break-words rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>

        <TaskSection
          title="迁移步骤"
          description="按这个顺序执行，降低踩坑概率。"
        >
          <div className="space-y-2">
            {payload.migrationSteps.map((item, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {i + 1}
                </span>
                <p className="break-words text-sm leading-relaxed text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </TaskSection>
      </div>

      {/* ── 工具区：标题变体 + 开头钉子 + 内容提纲 ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <TaskSection
          title="3 个标题变体"
          description="保留爆款结构，替换成你的场景。"
        >
          <div className="space-y-2">
            {payload.titleVariants.map((item, i) => (
              <p
                key={i}
                className="break-words rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-800"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>

        <TaskSection
          title="3 个开头钉子"
          description="前 3 秒决定留存，先选好开场方式。"
        >
          <div className="space-y-2">
            {payload.hookVariants.map((item, i) => (
              <p
                key={i}
                className="break-words rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-800"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>

        <TaskSection
          title="内容提纲结构"
          description="这个结构是这条样本能爆的核心骨架。"
        >
          <div className="space-y-2">
            {payload.contentOutline.map((item, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                  {i + 1}
                </span>
                <p className="break-words text-sm leading-relaxed text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </TaskSection>
      </div>

      {/* ── 相似案例 ── */}
      {payload.similarSamples.length > 0 && (
        <TaskSection
          title="相似爆款案例"
          description="同赛道的其他低粉爆款，可以交叉验证借鉴方向。"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payload.similarSamples.map((sample) => (
              <div
                key={sample.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-gray-900 line-clamp-2">
                    {sample.title}
                  </p>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {sample.anomaly}x
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                    {sample.platform}
                  </span>
                  <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                    {sample.fansLabel}
                  </span>
                  {sample.trackTags.slice(0, 1).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
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
  const payload =
    result.taskPayload?.kind === "breakdown_sample" ? result.taskPayload : null;

  return [
    {
      label: "爆发因子",
      value: payload ? `${payload.anomaly}倍` : "—",
      detail: payload
        ? `${payload.platform} · ${payload.fansLabel} 账号实现 ${payload.playCount}`
        : result.summary,
    },
    {
      label: "可借鉴度",
      value: result.scoreLabel ?? "高",
      detail: result.fitSummary ?? "结构可迁移，建议低成本测试验证",
    },
    {
      label: "推荐下一步",
      value: result.recommendedNextTasks[0]?.title ?? "生成翻拍脚本",
      detail: result.recommendedNextTasks[0]?.reason ?? "把这条爆款改成你能直接用的版本",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDive(result: ResultRecord): DeepDiveConfig {
  const payload =
    result.taskPayload?.kind === "breakdown_sample" ? result.taskPayload : null;
  const track = payload?.trackTags[0] ?? "内容";

  return {
    title: "继续深挖这条爆款",
    description: "可以继续生成翻拍脚本、提取文案模式或制定选题策略。",
    placeholder: `帮我生成这条 ${track} 爆款的翻拍脚本\n提取这条样本的钩子句式和 CTA 模板\n基于这个爆款方向制定 3 个选题`,
    quickActions: [
      { label: "生成翻拍脚本", cost: 30 },
      { label: "提取文案模式", cost: 15 },
      { label: "制定选题策略", cost: 20 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  const payload =
    result.taskPayload?.kind === "breakdown_sample" ? result.taskPayload : null;
  const track = payload?.trackTags[0] ?? "内容";
  const title = payload?.sampleTitle ?? result.query;

  return [
    {
      id: "rewrite_script",
      icon: Sparkles,
      title: "生成翻拍脚本",
      description: "把这条爆款改成你能直接开拍的版本，保留结构去掉雷点",
      value: "从拆解到开拍零等待",
      cost: 30,
      prompt: `基于低粉爆款样本「${title}」的拆解结果，帮我生成一版翻拍脚本。要求：保留「${payload?.burstReasons[0] ?? "核心爆因"}」的表达框架，替换成适合我账号的 ${track} 场景，包含标题、前3秒开场、主体结构和结尾CTA。`,
      highlight: true,
    },
    {
      id: "extract_copy",
      icon: Copy,
      title: "提取文案模式",
      description: "把这条样本的钩子句式、叙事结构和 CTA 整理成可复用资产",
      value: "建立自己的文案素材库",
      cost: 15,
      prompt: `基于低粉爆款样本「${title}」，帮我提取可复用的文案模式：1）3-5个钩子句式；2）叙事结构模板；3）CTA转化模式。每个都给出原样本中的例子和可迁移的通用版本。`,
    },
    {
      id: "topic_strategy",
      icon: Layers,
      title: "制定选题策略",
      description: `在 ${track} 赛道找到 3-5 个可持续的选题方向`,
      value: "从单条爆款到持续选题",
      cost: 20,
      prompt: `基于低粉爆款样本「${title}」的分析，帮我在 ${track} 赛道制定选题策略：找出 3-5 个可持续的选题方向，每个方向说明为什么现在做、适合什么账号阶段、如何低成本验证。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次低粉爆款拆解，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "生成翻拍脚本", prompt: "基于这次拆解结果，帮我生成一版翻拍脚本" },
    { label: "提取文案模式", prompt: "提取这条样本的钩子句式和CTA模板" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */

registerArtifactRenderer({
  artifactType: "breakdown_sample_sheet",
  taskIntent: "breakdown_sample",
  component: BreakdownSampleBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { BreakdownSampleBody };
