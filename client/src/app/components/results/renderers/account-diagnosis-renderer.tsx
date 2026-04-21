/**
 * Account Diagnosis Renderer
 * ==========================
 * 账号诊断的 Dumb Renderer。
 */

import { Rocket, Scissors, Target } from "lucide-react";
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

function AccountDiagnosisBody({ result }: ArtifactRendererProps) {
  const payload =
    result.taskPayload.kind === "account_diagnosis"
      ? result.taskPayload
      : {
          kind: "account_diagnosis" as const,
          diagnosisSummary: result.accountMatchSummary,
          strengths: result.bestFor,
          gaps: result.notFor,
          benchmarkAccounts: [] as Array<{ accountId: string; displayName: string; handle: string; whyIncluded: string }>,
          adjustments: result.continueIf,
        };

  return (
    <div className="space-y-4">
      <TaskSection
        title="这个号现在能不能接"
        description="账号诊断页首屏应该先回答承接判断，再告诉你哪里该改。"
      >
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="break-words text-sm leading-relaxed text-gray-700">
            {payload.diagnosisSummary}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <div className="mb-2 text-xs text-emerald-700">当前能继续放大的部分</div>
            <div className="space-y-1.5">
              {payload.strengths.map((item, index) => (
                <p key={`strength-${index}`} className="break-words text-sm text-emerald-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-4">
            <div className="mb-2 text-xs text-amber-700">当前主要短板</div>
            <div className="space-y-1.5">
              {payload.gaps.map((item, index) => (
                <p key={`gap-${index}`} className="break-words text-sm text-amber-950">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </TaskSection>

      {payload.benchmarkAccounts.length > 0 && (
        <TaskSection title="对标账号" description="这些账号进入了本次诊断链，方便你判断应该朝哪种打法靠。">
          <div className="grid gap-3 lg:grid-cols-3">
            {payload.benchmarkAccounts.map((account) => (
              <div
                key={account.accountId}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="text-sm text-gray-900">{account.displayName}</div>
                <div className="mt-1 text-xs text-gray-400">@{account.handle}</div>
                <p className="mt-3 break-words text-xs leading-relaxed text-gray-600">
                  {account.whyIncluded}
                </p>
              </div>
            ))}
          </div>
        </TaskSection>
      )}

      <TaskSection title="接下来怎么调" description="别只看诊断结论，首屏直接给调整方向。">
        <div className="space-y-2">
          {payload.adjustments.map((item, index) => (
            <p
              key={`adjust-${index}`}
              className="break-words rounded-2xl bg-white px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-100"
            >
              {item}
            </p>
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
      detail: result.classificationReasons[0] ?? "账号诊断任务",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDive(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续深化账号诊断",
    description: "可继续补账号打法、对标账号、该停内容和补强方向。",
    placeholder:
      "把这个号该继续什么讲清楚\n给我一版对标账号打法\n把该停掉的内容类型列出来",
    quickActions: [
      { label: "看账号打法", cost: 10 },
      { label: "给我对标账号", cost: 10 },
      { label: "列出该停的内容", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "account_playbook",
      icon: Rocket,
      title: "生成账号打法方案",
      description: "基于诊断结果，给你一份完整的账号运营策略",
      value: "明确接下来 30 天该怎么做",
      cost: 30,
      prompt: `基于这次账号诊断（${result.query}），帮我生成一份完整的账号打法方案，包含：内容方向调整、发布节奏、对标账号和 30 天目标。`,
      highlight: true,
    },
    {
      id: "benchmark_accounts",
      icon: Target,
      title: "找 3 个对标账号",
      description: "看看同赛道做得好的人是怎么运营的",
      value: "找到可参考的成功路径",
      cost: 20,
      prompt: `基于这次账号诊断（${result.query}），帮我找到 3 个值得对标的账号，分析他们的内容策略、增长路径和可借鉴的点。`,
    },
    {
      id: "stop_list",
      icon: Scissors,
      title: "列出该停的内容",
      description: "哪些内容可以优化替换，释放更多精力做高价值内容",
      value: "聚焦核心优势",
      cost: 10,
      prompt: `基于这次账号诊断（${result.query}），帮我列出所有应该停掉的内容类型，说清楚为什么要停，以及停掉后该用什么替代。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次账号诊断，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "看账号打法", prompt: "看账号打法" },
    { label: "给我对标账号", prompt: "给我对标账号" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */

registerArtifactRenderer({
  artifactType: "account_diagnosis_sheet",
  taskIntent: "account_diagnosis",
  component: AccountDiagnosisBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { AccountDiagnosisBody };
