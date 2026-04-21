/**
 * Trend Watch Renderer
 * ====================
 * 趋势观察的 Dumb Renderer。
 */

import { Eye, Flame, Rocket } from "lucide-react";
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

function TrendWatchBody({ result }: ArtifactRendererProps) {
  const payload =
    result.taskPayload.kind === "trend_watch"
      ? result.taskPayload
      : {
          kind: "trend_watch" as const,
          watchSummary: result.summary,
          watchSignals: result.whyNowItems.map((item, index) => ({
            label: `信号 ${index + 1}`,
            detail: item.fact,
          })),
          revisitTriggers: result.continueIf,
          cooldownWarnings: result.stopIf,
          scheduleHint: "建议按观察节奏复查。",
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="现在先盯什么"
        description="这次不是直接执行任务，首屏交付的是观察重点、复查信号和重判条件。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.watchSummary}
          </p>
          <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-gray-500">
            {payload.scheduleHint}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {payload.watchSignals.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
              <div className="text-[11px] text-gray-400">{item.label}</div>
              <p className="mt-2 break-words text-sm leading-relaxed text-gray-700">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </TaskSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaskSection title="什么变化再回来" description="这些反馈出现后，说明这波值得升级重判。">
          <div className="space-y-2">
            {payload.revisitTriggers.map((item, index) => (
              <p
                key={`revisit-${index}`}
                className="break-words rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
        <TaskSection title="调整优先级的信号" description="这些信号出现时，可以重新评估优先级和资源分配。">
          <div className="space-y-2">
            {payload.cooldownWarnings.map((item, index) => (
              <p
                key={`cooldown-${index}`}
                className="break-words rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {item}
              </p>
            ))}
          </div>
        </TaskSection>
      </div>
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
      detail: result.classificationReasons[0] ?? "趋势观察任务",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDive(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续扩展这次观察任务",
    description: "可继续补观察清单、提醒条件、复查节奏或升格阈值。",
    placeholder:
      "把这波趋势的观察清单写清楚\n告诉我什么变化才值得升级重判\n把继续观察和及时停看的条件分开",
    quickActions: [
      { label: "补一版观察清单", cost: 10 },
      { label: "把升格阈值讲清楚", cost: 10 },
      { label: "给我一版提醒文案", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "trend_action",
      icon: Rocket,
      title: "把趋势变成行动",
      description: "基于这波趋势，直接给你一版能拍的方案",
      value: "从观察到行动只需一步",
      cost: 30,
      prompt: `基于这次趋势观察（${result.query}），帮我把观察到的趋势转化为具体的内容行动方案，包含选题、脚本结构和发布建议。`,
      highlight: true,
    },
    {
      id: "trend_alert",
      icon: Eye,
      title: "设置智能提醒",
      description: "当趋势出现关键变化时，第一时间通知你",
      value: "不错过任何入场窗口",
      cost: 10,
      prompt: `基于这次趋势观察（${result.query}），帮我设置升格阈值和提醒条件，当趋势出现关键变化时自动通知我。`,
    },
    {
      id: "trend_deep",
      icon: Flame,
      title: "深挖趋势背后的机会",
      description: "这波趋势里藏着哪些还没被发现的切入点",
      value: "发现别人看不到的蓝海",
      cost: 20,
      prompt: `基于这次趋势观察（${result.query}），帮我深挖趋势背后还没被充分开发的细分机会，找到差异化的切入点。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次趋势观察，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "补一版观察清单", prompt: "补一版观察清单" },
    { label: "把升格阈值讲清楚", prompt: "把升格阈值讲清楚" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */

registerArtifactRenderer({
  artifactType: "trend_watchlist",
  taskIntent: "trend_watch",
  component: TrendWatchBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { TrendWatchBody };
