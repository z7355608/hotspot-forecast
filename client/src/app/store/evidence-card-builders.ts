// evidence-card-builders.ts — Card builders (WhyNow, Primary, Secondary, Operator)

import type {
  PredictionBestAction as PredictionAction,
  PredictionBestAction,
  PredictionBrief,
  PredictionLowFollowerEvidenceItem,
  PredictionMarketEvidence,
  PredictionOpportunityType,
  PredictionOperatorPanel,
  PredictionSafeActionLevel,
  PredictionSupportingAccount,
  PredictionSupportingContent,
  PredictionWhyNowItem,
  PredictionWindowStrength,
  PredictionEvidenceScreeningReport,
  PredictionResultCard,
} from "./prediction-types.js";
import type { TrendSeedFixture } from "./evidence-fixtures.js";
import {
  PLATFORM_LABELS,
  TIER_LABELS,
  MOMENTUM_LABELS,
} from "./evidence-fixtures.js";
import {
  formatGrowthLabel,
  formatPercent,
  formatTimingWindowLabel,
  dedupeStrings,
} from "./evidence-helpers.js";

export function buildWhyNowItems(
  fixture: TrendSeedFixture,
  bestActionNow: PredictionBestAction,
  opportunityType: PredictionOpportunityType,
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[],
  evidenceGaps: string[],
  screeningReport: PredictionEvidenceScreeningReport,
) {
  const trend = fixture.trend;
  const platformLabel = PLATFORM_LABELS[trend.platform];
  const marketItem: PredictionWhyNowItem = {
    sourceLabel: "KOL-KOC 扩散",
    fact: `${platformLabel} ${formatTimingWindowLabel(trend)} 内命中 ${trend.kolCount} 个 KOL、${trend.kocCount} 个 KOC、${trend.newCreatorCount} 个新创作者，近 7 天增长 ${formatGrowthLabel(
      trend.growth7d,
    )}。`,
    inference:
      trend.momentumLabel === "crowded"
        ? "市场已经证明这是真需求，但竞争密度也在抬升。"
        : "这说明机会不是孤立样本，而是市场参与者已经开始同步扩散。",
    userImpact:
      bestActionNow.type === "monitor"
        ? "对你意味着先盯扩散是否持续，而不是因为一波热度就重投。"
        : "对你意味着这次判断已经具备“现在做决定”的市场基础。",
    tone:
      trend.momentumLabel === "crowded" || trend.riskScore >= 65 ? "warning" : "positive",
  };

  const sampleItem: PredictionWhyNowItem = lowFollowerEvidence.length > 0
    ? {
        sourceLabel: "低粉异常样本",
        fact: `当前已出现 ${lowFollowerEvidence.length} 个可复核低粉样本，其中最高异常值 ${Math.max(
          ...lowFollowerEvidence.map((item) => item.anomaly),
        ).toFixed(1)} 倍。`,
        inference:
          bestActionNow.type === "low_follower_validation"
            ? "这波窗口已经出现早期样本，下一步关键是验证这些结构是否能被你复制。"
            : "低粉样本已经说明这不是只有头部才吃到的机会。",
        userImpact:
          bestActionNow.type === "low_follower_validation"
            ? "对你意味着先做样本级验证，再决定是否扩大投入。"
            : "对你意味着可以把低粉样本当成结构证据，而不是唯一出口。",
        tone: "positive",
      }
    : {
        sourceLabel: "支持内容结构",
        fact: `当前最强的支持内容都集中在「${fixture.contents
          .slice(0, 2)
          .map((content) => content.structureSummary)
          .join(" / ")}」这种结构上。`,
        inference:
          opportunityType === "structure_window"
            ? "说明现在最重要的是结构迁移，而不是继续堆行业层大道理。"
            : "说明真正跑起来的是表达方式，而不是泛题材热度。",
        userImpact:
          bestActionNow.type === "breakdown"
            ? "对你意味着先拆结构，再决定哪些部件值得借。"
            : "对你意味着后续动作必须围绕这些已验证结构来组织。",
        tone: "positive",
      };

  const riskItem: PredictionWhyNowItem = {
    sourceLabel: "风险边界",
    fact:
      screeningReport.contradictionSummary[0] ??
      evidenceGaps[0] ??
      `当前风险主要来自 ${trend.whyRisky}，风险分 ${trend.riskScore}。`,
    inference:
      trend.riskScore >= 65
        ? "窗口不是没有价值，而是如果继续泛做，极容易把局部热度误判成长期方向。"
        : "这说明机会成立，但执行边界必须先写清楚，不能当成普适结论。",
    userImpact:
      bestActionNow.type === "generate_test_brief"
        ? "对你意味着现在开做时，同时设定清晰的效果评估标准，方便快速迭代优化。"
        : "对你意味着下一步可以带上效果跟踪指标，让每次迭代都有数据支撑。",
    tone: trend.riskScore >= 60 ? "warning" : "neutral",
  };

  return [marketItem, sampleItem, riskItem];
}

export function buildBestFor(
  brief: PredictionBrief,
  fixture: TrendSeedFixture,
  bestActionNow: PredictionBestAction,
) {
  if (brief.inputKind === "account") {
    return [
      `和支持账号同层级的账号，更容易承接这波机会，当前主要参考 ${fixture.accounts
        .slice(0, 2)
        .map((account) => TIER_LABELS[account.tierLabel])
        .join(" / ")}。`,
      "已经有明确人设、素材来源或更新节奏，能把窗口变成连续动作的团队。",
    ];
  }
  if (brief.inputKind === "content_url") {
    return [
      "手里已经有竞品链接或跑起来的样本，准备先拆结构再执行的人。",
      "愿意围绕同一结构做多条测试，而不是直接复制原内容的人。",
    ];
  }
  if (bestActionNow.type === "monitor") {
    return [
      "当前更适合想先卡位观察、补证据、控制试错成本的人。",
      "能够接受先设监控规则，再根据结果决定是否扩量的操盘手。",
    ];
  }
  return [
    "已经有素材、节奏或账号承接能力，准备把判断快速转成动作的人。",
    "想把市场证据、样本证据和账号适配一起纳入判断的人。",
  ];
}

export function buildNotFor(
  brief: PredictionBrief,
  bestActionNow: PredictionBestAction,
) {
  if (brief.inputKind === "content_url") {
    return [
      "准备直接照抄竞品表达、不愿意先拆结构的人。",
      "没有样本上下文，只想拿一个万能模板的人。",
    ];
  }
  if (brief.inputKind === "account") {
    return [
      "当前没有明确账号对象，只想马上写内容的人。",
      "不关心账号阶段与资源分配，只想看赛道热不热的人。",
    ];
  }
  if (bestActionNow.type === "monitor") {
    return [
      "想立刻重投入、期待页面直接替你承诺收益的人。",
      "不愿意补评论、人群或样本证据的人。",
    ];
  }
  return [
    "希望直接获得结论而不想了解背后逻辑的人。",
    "只看单条内容表现而不关注赛道整体趋势的人。",
  ];
}

export function buildAccountMatchSummary(
  brief: PredictionBrief,
  fixture: TrendSeedFixture,
  bestActionNow: PredictionBestAction,
) {
  const leadAccount = fixture.accounts[0];
  if (brief.inputKind === "account") {
    return `当前更像账号分配题。支持账号里最有代表性的是「${leadAccount.displayName}」，它吃到机会的关键不是粉丝规模，而是 ${leadAccount.whyIncluded.replace(
      "。",
      "",
    )}。你需要先判断当前账号是否也具备这类条件。`;
  }
  if (brief.inputKind === "content_url") {
    return `这次输入本质上是结构判断。当前跑起来的支持内容都在重复「${fixture.contents[0]?.structureSummary ?? "结果先行"}」，所以你的任务不是判断赛道热不热，而是确认自己能不能稳定做出这种结构。`;
  }
  if (brief.inputKind === "uploaded_asset") {
    return `你现在更缺的是承接证据。结果页已经把市场样本和支持账号给出来了，下一步要对照这些对象判断你的素材是否能补上相同的结构和证明。`;
  }
  if (bestActionNow.type === "monitor") {
    return `方向本身不是完全不行，但当前更像一个待观察窗口。支持对象已经说明市场开始动了，只是还没强到足以让你无脑下注。`;
  }
  return `市场证据和样本证据已经说明这波机会不是空判断。真正的关键是，你能不能像支持账号一样，把机会变成稳定、连续、可复盘的内容动作。`;
}

export function buildWhyNotOtherActions(
  bestActionNow: PredictionBestAction,
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[],
) {
  if (bestActionNow.type === "breakdown") {
    return [
      "当前最缺的是结构判断，不是再看更多宏观数据。",
      "在没拆清楚支持内容结构前，直接生成 brief 只会继续放大错误模板。",
    ];
  }
  if (bestActionNow.type === "account_benchmark") {
    return [
      "现在真正的问题是账号谁来承接，不是题材要不要做。",
      "在没判断清楚账号层适配前，先去做低粉验证或 brief 都会偏早。",
    ];
  }
  if (bestActionNow.type === "monitor") {
    return [
      "当前赛道正在酝酿期，提前布局积累素材是最佳策略。",
      "先用监控跟踪关键指标，信号明确后就能快速出击。",
    ];
  }
  if (bestActionNow.type === "generate_test_brief") {
    return [
      "市场和样本证据已经足够清晰，现在是行动的最佳时机。",
      "把判断转化成具体的执行方案，快速验证就能看到效果。",
    ];
  }
  return lowFollowerEvidence.length > 0
    ? [
        "已经有低粉异常样本可复核，直接验证可复制性就能快速放大。",
        "样本结构已经出现，用一条内容快速验证就能确认方向。",
      ]
    : [
        "样本结构已经出现，用一条内容验证你的切入角度就能确认方向。",
        "验证通过后就可以放心放大，这是最快的路径。",
      ];
}

export function buildContinueIf(
  bestActionNow: PredictionBestAction,
  fixture: TrendSeedFixture,
) {
  const leadContent = fixture.contents[0];
  if (bestActionNow.type === "monitor") {
    return [
      `后续 7-14 天里，继续出现类似「${leadContent.title}」这种结构的新增样本。`,
      "评论区重复出现更明确的人群问题、场景问题或执行问题。",
    ];
  }
  return [
    "首轮测试能复现支持样本里的关键反馈，例如收藏、评论提问或转发。",
    `你能围绕「${fixture.trend.topicCluster}」连续输出，而不是只做一条碰运气。`,
  ];
}

export function buildStopIf(
  bestActionNow: PredictionBestAction,
  fixture: TrendSeedFixture,
) {
  if (bestActionNow.type === "monitor") {
    return [
      "继续补样后，依然只有热度，没有看到更明确的人群意图或异常样本。",
      "你无法把机会压缩成明确对象、场景和结果承诺，判断长期停留在大方向层。",
    ];
  }
  return [
    "首轮测试没有复现支持样本里的关键反馈，只有曝光没有评论/收藏/关注转化。",
    `你做出来的内容和当前支持结构偏差很大，无法证明自己真在承接「${fixture.trend.topicCluster}」这类机会。`,
  ];
}

export function buildMissIfWait(
  windowStrength: PredictionWindowStrength,
  bestActionNow: PredictionBestAction,
  fixture: TrendSeedFixture,
) {
  if (windowStrength !== "strong_now") return undefined;
  if (bestActionNow.type === "generate_test_brief") {
    return `如果现在不做，等更多账号把「${fixture.trend.topicCluster}」打成标准模板后，你再入场只会面对更高竞争密度。`;
  }
  return `如果现在不开始验证，可能会错过这波窗口还没完全拥挤、但结构已经跑通的早期阶段。`;
}

function buildCardTitleAndCta(params: {
  inputKind: PredictionBrief["inputKind"];
  safeActionLevel: PredictionSafeActionLevel;
  variant: "primary" | "secondary";
}) {
  const { inputKind, safeActionLevel, variant } = params;
  const baseCopy =
    safeActionLevel === "shoot_now"
      ? variant === "primary"
        ? { title: "今天直接开拍", ctaLabel: "拿开拍方案" }
        : { title: "看可借鉴样本", ctaLabel: "去看借鉴样本" }
      : safeActionLevel === "test_one"
        ? variant === "primary"
          ? { title: "小样验证一下", ctaLabel: "看验证步骤" }
          : { title: "先盯这几个信号", ctaLabel: "看观察重点" }
        : safeActionLevel === "watch_first"
          ? variant === "primary"
            ? { title: "先观察趋势", ctaLabel: "看观察重点" }
            : { title: "先补这几个证据", ctaLabel: "看还差什么" }
          : variant === "primary"
            ? { title: "这波先别做", ctaLabel: "看不做原因" }
            : { title: "等什么再回来", ctaLabel: "保存重看条件" };

  if (inputKind === "content_url") {
    if (safeActionLevel === "shoot_now") {
      return variant === "primary"
        ? { title: "这条可以这样拍", ctaLabel: "看可借鉴点" }
        : { title: "看可借鉴样本", ctaLabel: "看借鉴版" };
    }
    if (safeActionLevel === "test_one") {
      return variant === "primary"
        ? { title: "先按这条验证一版", ctaLabel: "看验证版" }
        : { title: "先盯这几个信号", ctaLabel: "看观察重点" };
    }
    if (safeActionLevel === "watch_first") {
      return variant === "primary"
        ? { title: "这条先别急着做", ctaLabel: "看观察重点" }
        : { title: "先补这几个证据", ctaLabel: "看还差什么" };
    }
    return variant === "primary"
      ? { title: "这条先别做", ctaLabel: "看不做原因" }
      : { title: "等什么再回来", ctaLabel: "保存重看条件" };
  }

  if (inputKind === "account") {
    if (safeActionLevel === "shoot_now") {
      return variant === "primary"
        ? { title: "这个号现在能做", ctaLabel: "看账号打法" }
        : { title: "先看对标账号", ctaLabel: "看对标账号" };
    }
    if (safeActionLevel === "test_one") {
      return variant === "primary"
        ? { title: "这个号先小试", ctaLabel: "看账号打法" }
        : { title: "先看对标账号", ctaLabel: "看对标账号" };
    }
    if (safeActionLevel === "watch_first") {
      return variant === "primary"
        ? { title: "这个号潜力待释放", ctaLabel: "看发力方向" }
        : { title: "看对标账号打法", ctaLabel: "看对标账号" };
    }
    return variant === "primary"
      ? { title: "这个号换个方向切入", ctaLabel: "看新方向" }
      : { title: "设置回看提醒", ctaLabel: "设置提醒" };
  }

  if (inputKind === "uploaded_asset") {
    if (safeActionLevel === "shoot_now") {
      return variant === "primary"
        ? { title: "这套素材能接", ctaLabel: "看怎么拍" }
        : { title: "先补这几个镜头", ctaLabel: "看先补哪块" };
    }
    if (safeActionLevel === "test_one") {
      return variant === "primary"
        ? { title: "先补这几个镜头", ctaLabel: "看先补哪块" }
        : { title: "这套素材能接什么", ctaLabel: "看怎么拍" };
    }
    if (safeActionLevel === "watch_first") {
      return variant === "primary"
        ? { title: "这套素材还能更好", ctaLabel: "看优化方向" }
        : { title: "补几个关键镜头", ctaLabel: "看补拍建议" };
    }
    return variant === "primary"
      ? { title: "这套素材换个角度用", ctaLabel: "看新用法" }
      : { title: "设置回看提醒", ctaLabel: "设置提醒" };
  }

  return baseCopy;
}

function buildCardDescription(
  safeActionLevel: PredictionSafeActionLevel,
  inputKind: PredictionBrief["inputKind"],
) {
  if (safeActionLevel === "shoot_now") {
    return inputKind === "content_url"
      ? "先把这条内容里真正值得借的结构部件拿走，再进入试拍。"
      : inputKind === "account"
        ? "当前重点不是继续观察，而是明确这个号怎么接这波机会。"
        : inputKind === "uploaded_asset"
          ? "基于现有素材先给出最值得开拍的承接方式。"
          : "证据已经足够支撑一轮开拍，不需要继续停在抽象判断层。";
  }
  if (safeActionLevel === "test_one") {
    return inputKind === "content_url"
      ? "先按当前结构低成本试一版，看你能不能复现关键反馈。"
      : "先跑一条最小验证样本，比直接重投更稳。";
  }
  if (safeActionLevel === "watch_first") {
    return "赛道正在酝酿中，提前储备素材和选题，等信号明确就能快速出击。";
  }
  return "帮你梳理清楚当前赛道状况和最佳切入时机，随时准备出击。";
}

export function buildPrimaryCard(params: {
  brief: PredictionBrief;
  safeActionLevel: PredictionSafeActionLevel;
  coreBet: string;
  marketEvidence: PredictionMarketEvidence;
  supportingAccounts: PredictionSupportingAccount[];
  supportingContents: PredictionSupportingContent[];
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[];
  continueIf: string[];
  stopIf: string[];
  evidenceGaps: string[];
  contradictionSummary: string[];
}): PredictionResultCard {
  const {
    brief,
    safeActionLevel,
    coreBet,
    marketEvidence,
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    continueIf,
    stopIf,
    evidenceGaps,
    contradictionSummary,
  } = params;
  const { title, ctaLabel } = buildCardTitleAndCta({
    inputKind: brief.inputKind,
    safeActionLevel,
    variant: "primary",
  });

  const previewSections =
    safeActionLevel === "shoot_now"
      ? [
          {
            title: "这一轮先拍什么",
            items: [coreBet],
          },
          {
            title: "优先参考",
            items: supportingContents.slice(0, 3).map((content) => content.title),
          },
          {
            title: "效果评估标准",
            items: [continueIf[0], stopIf[0]].filter(Boolean),
            tone: "warning" as const,
          },
        ]
      : safeActionLevel === "test_one"
        ? [
            {
              title: "先试哪个切口",
              items: [
                lowFollowerEvidence[0]?.suggestion ??
                  supportingContents[0]?.structureSummary ??
                  coreBet,
              ],
            },
            {
              title: "优先参考样本",
              items: (
                lowFollowerEvidence.length > 0
                  ? lowFollowerEvidence.slice(0, 3).map((sample) => sample.title)
                  : supportingContents.slice(0, 3).map((content) => content.title)
              ),
            },
            {
              title: "试成了看什么 / 不行就停什么",
              items: [continueIf[0], stopIf[0]].filter(Boolean),
              tone: "warning" as const,
            },
          ]
        : safeActionLevel === "watch_first"
          ? [
              {
                title: "先盯这 3 个信号",
                items: [
                  `近 7 天增长 ${formatGrowthLabel(marketEvidence.growth7d)}`,
                  `新创作者 ${marketEvidence.newCreatorCount} 个`,
                  `低粉异常占比 ${formatPercent(marketEvidence.lowFollowerAnomalyRatio)}`,
                ],
              },
              {
                title: "还缺什么",
                items: evidenceGaps.slice(0, 3),
                tone: "warning" as const,
              },
              {
                title: "什么变化再回来",
                items: continueIf.slice(0, 2),
              },
            ]
          : [
              {
                title: "现在为什么别做",
                items: contradictionSummary.slice(0, 2).length > 0
                  ? contradictionSummary.slice(0, 2)
                  : evidenceGaps.slice(0, 2),
                tone: "warning" as const,
              },
              {
                title: "最危险的误判",
                items: stopIf.slice(0, 2),
                tone: "warning" as const,
              },
              {
                title: "等什么再回来",
                items: continueIf.slice(0, 2),
              },
            ];

  return {
    title,
    ctaLabel,
    description: buildCardDescription(safeActionLevel, brief.inputKind),
    reason:
      safeActionLevel === "shoot_now"
        ? `筛选后仍保留 ${supportingContents.length} 条支持内容、${supportingAccounts.length} 个支持账号，足以支撑先进入执行层。`
        : safeActionLevel === "test_one"
          ? "证据已经证明有机会，但更稳的是先拿一条最小成本样本验证可复制性。"
          : safeActionLevel === "watch_first"
            ? `首屏证据仍有 ${evidenceGaps.length} 个缺口，先观察和补证据比先执行更稳。`
            : "当前冲突信号还在，直接往执行层升级的风险高于收益。",
    previewSections,
    continueIf: continueIf.slice(0, 2),
    stopIf: stopIf.slice(0, 2),
    evidenceRefs:
      safeActionLevel === "shoot_now"
        ? supportingContents.slice(0, 3).map((content) => content.contentId)
        : safeActionLevel === "test_one"
          ? (
              lowFollowerEvidence.length > 0
                ? lowFollowerEvidence.slice(0, 3).map((sample) => sample.id)
                : supportingContents.slice(0, 3).map((content) => content.contentId)
            )
          : supportingContents.slice(0, 2).map((content) => content.contentId),
    actionMode: "open_deep_dive",
    actionPrompt:
      safeActionLevel === "shoot_now"
        ? brief.inputKind === "content_url"
          ? "基于这次判断，给我这条内容的可抄结构、试拍版和拍摄注意点。"
          : brief.inputKind === "account"
            ? "基于这次判断，给我这个号现在能做的打法、内容角度和开拍顺序。"
            : brief.inputKind === "uploaded_asset"
              ? "基于这次判断，给我这套素材怎么接这波机会、怎么拍和哪些镜头要补。"
              : "基于这次判断，给我一版开拍方案：标题方向、脚本骨架、拍摄要点和效果评估标准。"
        : safeActionLevel === "test_one"
          ? "基于这次判断，给我一版低成本试拍步骤：先试哪个切口、参考哪些样本、成败看什么。"
          : safeActionLevel === "watch_first"
            ? "基于这次判断，给我一份监控计划：重点跟踪哪几个信号、多久检查一次、什么变化就可以行动。"
            : "把当前赛道状况、最佳切入时机和行动触发条件整理成一页说明。",
  };
}

export function buildSecondaryCard(params: {
  brief: PredictionBrief;
  safeActionLevel: PredictionSafeActionLevel;
  whyNotOtherActions: string[];
  whyNowItems: PredictionWhyNowItem[];
  supportingAccounts: PredictionSupportingAccount[];
  supportingContents: PredictionSupportingContent[];
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[];
  evidenceGaps: string[];
  continueIf: string[];
  stopIf: string[];
}): PredictionResultCard {
  const {
    brief,
    safeActionLevel,
    whyNotOtherActions,
    whyNowItems,
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    evidenceGaps,
    continueIf,
    stopIf,
  } = params;
  const { title, ctaLabel } = buildCardTitleAndCta({
    inputKind: brief.inputKind,
    safeActionLevel,
    variant: "secondary",
  });
  const canNavigateToSamples =
    (safeActionLevel === "shoot_now" || safeActionLevel === "test_one") &&
    lowFollowerEvidence.length > 0 &&
    brief.inputKind !== "account" &&
    brief.inputKind !== "uploaded_asset";

  const previewSections =
    safeActionLevel === "shoot_now"
      ? [
          {
            title: "先看谁已经跑出来",
            items: (
              lowFollowerEvidence.length > 0
                ? lowFollowerEvidence.slice(0, 3).map((sample) => sample.title)
                : supportingContents.slice(0, 3).map((content) => content.title)
            ),
          },
          {
            title: "为什么现在不先做别的",
            items: whyNotOtherActions.slice(0, 2),
          },
        ]
      : safeActionLevel === "test_one"
        ? [
            {
              title: "先盯这几个信号",
              items: whyNowItems.slice(0, 3).map((item) => item.fact),
            },
            {
              title: "什么情况下可以加码",
              items: continueIf.slice(0, 2),
            },
          ]
        : safeActionLevel === "watch_first"
          ? [
              {
                title: "先补哪几个证据",
                items: evidenceGaps.slice(0, 3),
                tone: "warning" as const,
              },
              {
                title: "别急着做的原因",
                items: whyNotOtherActions.slice(0, 2),
              },
            ]
          : [
              {
                title: "等什么再回来",
                items: continueIf.slice(0, 2),
              },
              {
                title: "继续硬做会怎样",
                items: stopIf.slice(0, 2),
                tone: "warning" as const,
              },
            ];

  return {
    title,
    ctaLabel,
    description:
      safeActionLevel === "shoot_now"
        ? "如果你不想马上进执行层，先用样本或对标对象复核一次。"
        : safeActionLevel === "test_one"
          ? "先把观察信号写清楚，试拍才不会变成盲投。"
          : safeActionLevel === "watch_first"
            ? "这张卡只补最关键的缺口，不再继续堆泛信息。"
            : "先把回来条件保存清楚，避免反复被同类热度带跑。",
    reason: whyNotOtherActions[0] ?? "这张卡是主动作之外最值得补的一步。",
    previewSections,
    continueIf: continueIf.slice(0, 2),
    stopIf: stopIf.slice(0, 2),
    evidenceRefs: canNavigateToSamples
      ? lowFollowerEvidence.slice(0, 3).map((sample) => sample.id)
      : brief.inputKind === "account"
        ? supportingAccounts.slice(0, 3).map((account) => account.accountId)
        : supportingContents.slice(0, 3).map((content) => content.contentId),
    actionMode:
      canNavigateToSamples
        ? "navigate"
        : safeActionLevel === "not_now"
          ? "save_snapshot"
          : "open_deep_dive",
    actionTarget: canNavigateToSamples ? "/low-follower-opportunities" : undefined,
    actionPrompt: canNavigateToSamples
      ? undefined
      : brief.inputKind === "account"
        ? "基于这次判断，给我 3 个对标账号方向，并解释为什么当前账号适合或不适合承接。"
        : safeActionLevel === "watch_first"
          ? "基于这次判断，把当前最缺的证据、补证据顺序和回看条件整理给我。"
          : "基于这次判断，给我一版可抄样本清单和为什么先不做其他动作。",
  };
}

export function buildOperatorPanel(
  brief: PredictionBrief,
  fixture: TrendSeedFixture,
  marketEvidence: PredictionMarketEvidence,
  supportingAccounts: PredictionSupportingAccount[],
  supportingContents: PredictionSupportingContent[],
  screeningReport: PredictionEvidenceScreeningReport,
  evidenceGaps: string[],
  stopIf: string[],
  whyNowItems: PredictionWhyNowItem[],
): PredictionOperatorPanel {
  return {
    reportSummary: `这次判断围绕「${fixture.trend.topicCluster}」展开。Agent 先筛掉弱相关证据，再用 ${marketEvidence.kolCount} 个 KOL、${marketEvidence.kocCount} 个 KOC、${marketEvidence.similarContentCount} 条内容和样本层证据，判断现在是否值得下注以及先做什么。当前安全动作级别为 ${screeningReport.safeActionLevel}，证据对齐度 ${screeningReport.evidenceAlignment}。`,
    sourceNotes: whyNowItems.map((item) => `${item.sourceLabel}：${item.fact}`),
    platformNotes: [
      `当前主平台是 ${PLATFORM_LABELS[fixture.trend.platform]}，候选平台为 ${brief.candidatePlatforms.join(" / ")}。`,
      `市场动量状态：${MOMENTUM_LABELS[fixture.trend.momentumLabel]}，时机标签：${fixture.trend.timingLabel}。`,
    ],
    benchmarkHints: supportingAccounts
      .slice(0, 3)
      .map(
        (account) =>
          `${account.displayName}（${TIER_LABELS[account.tierLabel]}）：${account.whyIncluded}`,
      ),
    riskSplit: stopIf,
    counterSignals: [
      ...screeningReport.contradictionSummary.slice(0, 2),
      ...evidenceGaps.slice(0, 2),
      "如果新增样本开始偏离当前支持结构，必须更新判断，不要硬把旧结论推进执行。",
    ],
    dataGaps:
      evidenceGaps.length > 0
        ? evidenceGaps
        : [
            `当前已经有 ${supportingContents.length} 条支持内容和 ${supportingAccounts.length} 个支持账号，后续主要缺的是执行回填，而不是继续收集同类证据。`,
          ],
  };
}
