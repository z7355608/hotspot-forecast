import { CHINESE_PREDICTION_PLATFORM_IDS, getCapabilityLabels, getPlatformPredictionMeta } from "./prediction-platforms.js";
import { buildEvidenceDrivenDecision } from "./result-evidence-adapter.js";
import type {
  PredictionBestAction,
  ConnectorAuthMode,
  PlatformSnapshot,
  PredictionArtifacts,
  PredictionBrief,
  PredictionConfidenceLabel,
  PredictionOpportunityType,
  PredictionUiResult,
  PredictionVerdict,
  PredictionRequestDraft,
  PredictionWindowStrength,
  ScoreBreakdown,
  UserProfile,
} from "./prediction-types.js";

type ConnectorLike = {
  id: string;
  name: string;
  connected: boolean;
  authMode?: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
};

type SampleLike = {
  id: string;
  platform: string;
  contentForm: string;
  title: string;
  account: string;
  fansLabel: string;
  trackTags: string[];
  playCount: string;
  suggestion: string;
  publishedAt: string;
  newbieFriendly: number;
  fansCount: number;
  anomaly: number;
};

const INDUSTRY_PATTERNS: Array<{ industry: string; topic: string; matcher: RegExp }> = [
  { industry: "职场教育", topic: "职场干货", matcher: /(职场|excel|办公|面试|升职)/i },
  { industry: "穿搭时尚", topic: "通勤穿搭", matcher: /(穿搭|通勤|ootd|搭配)/i },
  { industry: "美妆护肤", topic: "美妆护肤", matcher: /(美妆|护肤|底妆|口红)/i },
  { industry: "母婴育儿", topic: "母婴育儿", matcher: /(母婴|育儿|宝妈|宝宝)/i },
  { industry: "健身减脂", topic: "健身减脂", matcher: /(健身|减脂|体脂|训练)/i },
  { industry: "美食探店", topic: "美食探店", matcher: /(美食|探店|餐厅|吃什么|下饭)/i },
  { industry: "情绪成长", topic: "情绪成长", matcher: /(情绪|成长|女性|分手|内耗)/i },
  { industry: "居家生活", topic: "居家生活", matcher: /(居家|生活|收纳|清洁|家务)/i },
  { industry: "萌宠宠物", topic: "萌宠日常", matcher: /(萌宠|宠物|猫|狗|猫咪|狗狗|铲屎|养猫|养狗|柯基|金毛|布偶|橘猫)/i },
  { industry: "科技数码", topic: "科技数码", matcher: /(科技|数码|手机|电脑|AI|人工智能|编程|代码|开发)/i },
  { industry: "汽车出行", topic: "汽车测评", matcher: /(汽车|车|新能源|电车|特斯拉|比亚迪|驾照|自驾)/i },
  { industry: "旅行户外", topic: "旅行攻略", matcher: /(旅行|旅游|户外|露营|徒步|攻略|景点|民宿)/i },
  { industry: "游戏电竞", topic: "游戏攻略", matcher: /(游戏|电竞|王者|吃鸡|原神|英雄联盟|手游)/i },
  { industry: "财经理财", topic: "财经知识", matcher: /(财经|理财|股票|基金|投资|赚钱|副业|创业)/i },
  { industry: "影视娱乐", topic: "影视解说", matcher: /(影视|电影|电视剧|综艺|追剧|解说|娱乐)/i },
  { industry: "三农乡村", topic: "三农生活", matcher: /(三农|农村|乡村|种地|养殖|农产品)/i },
  { industry: "家居装修", topic: "家居装修", matcher: /(家居|装修|家装|软装|家具|设计师)/i },
  { industry: "教育知识", topic: "知识科普", matcher: /(知识|科普|学习|考研|考公|英语|读书)/i },
  { industry: "音乐舞蹈", topic: "音乐创作", matcher: /(音乐|舞蹈|唱歌|乐器|吉他|钢琴|街舞)/i },
  { industry: "医疗健康", topic: "健康科普", matcher: /(医疗|健康|养生|中医|减肥|饮食|营养)/i },
  { industry: "零食快消", topic: "零食测评", matcher: /(零食|快消|饮料|奶茶|咖啡|测评)/i },
  { industry: "摄影剪辑", topic: "摄影教程", matcher: /(摄影|剪辑|拍摄|运镜|调色|后期|PR|剪映)/i },
];

const PLATFORM_KEYWORDS: Array<{ id: string; matcher: RegExp }> = [
  { id: "douyin", matcher: /(抖音|douyin|aweme)/i },
  { id: "xiaohongshu", matcher: /(小红书|xhs|xiaohongshu)/i },
  { id: "kuaishou", matcher: /(快手|kuaishou)/i },
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hashSeed(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  }
  return hash;
}

function inferInputKind(draft: PredictionRequestDraft): PredictionBrief["inputKind"] {
  if (draft.evidenceItems.some((item) => /^https?:\/\//.test(item.source))) {
    return "content_url";
  }
  if (draft.evidenceItems.length > 0) {
    return "uploaded_asset";
  }
  if (/(账号|主页|博主|作者|对标|竞品)/.test(draft.prompt)) {
    return "account";
  }
  return "prompt";
}

function inferIndustry(prompt: string) {
  const matched = INDUSTRY_PATTERNS.find((item) => item.matcher.test(prompt));
  if (matched) return matched;
  // Fallback: 从 prompt 中提取核心关键词作为 seedTopic，而不是用泛化的"爆款预测"
  // 移除常见的功能词和停用词，保留核心赛道/话题词
  const cleaned = prompt
    .replace(/[低粉|高粉|新号|大号|小号|素人|普通人|新手|老手]/g, "")
    .replace(/[有没有|能不能|怎么样|值不值得|适合|可以|应该|赛道|领域|方向|机会|前景|爆款|预测]/g, "")
    .replace(/[\s，、？?!\u3002]+/g, " ")
    .trim();
  const topic = cleaned.length >= 2 ? cleaned.slice(0, 8) : prompt.slice(0, 8);
  return { industry: "泛内容创作", topic };
}

function inferPlatforms(draft: PredictionRequestDraft, connectors: ConnectorLike[]) {
  const inferred = new Set<string>();

  for (const item of PLATFORM_KEYWORDS) {
    if (item.matcher.test(draft.prompt)) {
      inferred.add(item.id);
    }
  }

  for (const evidence of draft.evidenceItems) {
    for (const item of PLATFORM_KEYWORDS) {
      if (item.matcher.test(`${evidence.source} ${evidence.display}`)) {
        inferred.add(item.id);
      }
    }
  }

  for (const selected of draft.selectedPlatforms) {
    if (CHINESE_PREDICTION_PLATFORM_IDS.includes(selected as (typeof CHINESE_PREDICTION_PLATFORM_IDS)[number])) {
      inferred.add(selected);
    }
  }

  const connectedPredictionIds = connectors
    .filter((connector) => connector.connected)
    .map((connector) => connector.id)
    .filter((id) =>
      CHINESE_PREDICTION_PLATFORM_IDS.includes(id as (typeof CHINESE_PREDICTION_PLATFORM_IDS)[number]),
    );

  if (inferred.size === 0) {
    connectedPredictionIds.slice(0, 2).forEach((id) => inferred.add(id));
  }

  if (inferred.size === 0) {
    inferred.add("douyin");
    inferred.add("xiaohongshu");
  }

  return [...inferred];
}

function buildAccountContext(connectors: ConnectorLike[], userProfile?: UserProfile) {
  const parts: string[] = [];

  // 注入 userProfile 个性化信息
  if (userProfile) {
    if (userProfile.niche) {
      parts.push(`创作方向：${userProfile.niche}`);
    }
    if (userProfile.followerScale) {
      const scaleLabel: Record<string, string> = {
        "0-1w": "0–1万（起号阶段）",
        "1w-10w": "1万–10万（成长期）",
        "10w-100w": "10万–100万（腰部创作者）",
        "100w+": "100万+（头部创作者）",
      };
      parts.push(`粉丝量级：${scaleLabel[userProfile.followerScale] ?? userProfile.followerScale}`);
    }
    if (userProfile.platforms.length > 0) {
      parts.push(`运营平台：${userProfile.platforms.join("、")}`);
    }
    if (userProfile.contentStyleTags.length > 0) {
      parts.push(`内容风格：${userProfile.contentStyleTags.join("、")}`);
    }
    if (userProfile.instructions) {
      parts.push(`分析偏好：${userProfile.instructions}`);
    }
  }

  // 注入已连接的账号信息
  const connected = connectors.filter((connector) => connector.connected);
  if (connected.length > 0) {
    const connectorSummary = connected
      .slice(0, 3)
      .map((connector) => {
        const identity = connector.handle || connector.profileUrl || connector.name;
        return `${connector.name}：${identity}`;
      })
      .join("；");
    parts.push(`已连接账号：${connectorSummary}`);
  }

  if (parts.length === 0) {
    return "未提供账号连接，按公开平台数据做通用预测";
  }

  return parts.join("\n");
}

function buildPlatformSnapshots(candidatePlatforms: string[], connectors: ConnectorLike[]) {
  return candidatePlatforms.map((platformId) => {
    const meta = getPlatformPredictionMeta(platformId);
    const linked = connectors.find((connector) => connector.id === platformId && connector.connected);
    const authMode: ConnectorAuthMode =
      linked?.authMode === "cookie" && meta.capabilities.supportsCookieAnalytics
        ? "cookie"
        : "public";

    const capabilitySummary = getCapabilityLabels(meta.capabilities);
    const signals = [
      meta.capabilities.supportsSearch ? "搜索需求" : "",
      meta.capabilities.supportsHotList ? "热榜加速度" : "",
      meta.capabilities.supportsComments ? "评论反馈" : "",
      meta.capabilities.supportsPublicProfile ? "账号画像" : "",
      authMode === "cookie" ? "Cookie 深度画像" : "",
    ].filter(Boolean);

    return {
      platformId,
      platformName: meta.platformName,
      authMode,
      predictionEnabled: meta.predictionEnabled,
      callBudget: meta.callBudget,
      endpointFamilies: meta.endpointFamilies,
      coreFields: meta.coreFields,
      capabilitySummary,
      signals,
    } satisfies PlatformSnapshot;
  });
}

function buildScores(
  brief: PredictionBrief,
  connectors: ConnectorLike[],
  platformSnapshots: PlatformSnapshot[],
) {
  const industryBoost = brief.industry === "泛内容创作" ? 0 : 8;
  const connectedBoost = connectors.filter((item) => item.connected).length * 4;
  const cookieBoost = platformSnapshots.some((item) => item.authMode === "cookie") ? 8 : 0;
  const competitorBoost = brief.competitorEvidence.length * 5;
  const seed = hashSeed(
    [
      brief.seedTopic,
      brief.industry,
      brief.candidatePlatforms.join(","),
      brief.inputKind,
      brief.personalizationMode,
      brief.accountContext,
    ].join("|"),
  );

  const demand = clamp(48 + industryBoost + (seed % 17) + brief.candidatePlatforms.length * 4);
  const competition = clamp(42 + (seed % 23) + (brief.seedTopic.length % 8) * 3);
  const anomaly = clamp(38 + competitorBoost + ((seed >> 2) % 19) + platformSnapshots.length * 3);
  const fit = clamp(
    32 +
      connectedBoost +
      cookieBoost +
      (brief.inputKind === "account" ? 12 : 0) +
      (brief.inputKind === "content_url" ? 8 : 0) +
      ((seed >> 1) % 15),
  );

  const growth7d = clamp(40 + (seed % 21) + brief.candidatePlatforms.length * 5);
  const newcomerRatio = clamp(35 + ((seed >> 3) % 24) + competitorBoost);
  const hotAcceleration = clamp(30 + ((seed >> 4) % 28) + (platformSnapshots.some((item) => item.signals.includes("热榜加速度")) ? 10 : 0));

  const opportunity = clamp(
    0.35 * demand + 0.25 * anomaly + 0.2 * fit + 0.2 * (100 - competition),
  );
  const timing = clamp(0.45 * growth7d + 0.3 * newcomerRatio + 0.25 * hotAcceleration);
  const volatility = clamp(25 + ((seed >> 5) % 30) + brief.competitorEvidence.length * 6);
  const sparsity = clamp(20 + (platformSnapshots.some((item) => !item.predictionEnabled) ? 20 : 0));
  const risk = clamp(
    0.4 * competition + 0.3 * clamp(competition - anomaly / 3) + 0.2 * volatility + 0.1 * sparsity,
  );

  return {
    demand,
    competition,
    anomaly,
    fit,
    opportunity,
    timing,
    risk,
  } satisfies ScoreBreakdown;
}

function inferScoreLabel(opportunity: number) {
  if (opportunity >= 80) return "强推";
  if (opportunity >= 70) return "可行";
  if (opportunity >= 60) return "潜力股";
  return "蓄力中";
}

function summarizePlatforms(platformSnapshots: PlatformSnapshot[]) {
  return platformSnapshots.map((item) => item.platformName);
}

function inferVerdict(scoreBreakdown: ScoreBreakdown): PredictionVerdict {
  if (
    scoreBreakdown.opportunity >= 80 &&
    scoreBreakdown.fit >= 68 &&
    scoreBreakdown.risk <= 66
  ) {
    return "go_now";
  }
  if (scoreBreakdown.opportunity >= 66 && scoreBreakdown.fit >= 55) {
    return "test_small";
  }
  if (scoreBreakdown.opportunity >= 54 || scoreBreakdown.demand >= 60) {
    return "observe";
  }
  return "not_now";
}

function inferConfidenceLabel(
  brief: PredictionBrief,
  connectors: ConnectorLike[],
  platformSnapshots: PlatformSnapshot[],
): PredictionConfidenceLabel {
  let confidenceScore = 0;

  if (brief.personalizationMode === "cookie") confidenceScore += 1;
  if (brief.competitorEvidence.length > 0) confidenceScore += 1;
  if (platformSnapshots.length >= 2) confidenceScore += 1;
  if (connectors.filter((item) => item.connected).length >= 2) confidenceScore += 1;
  if (brief.inputKind === "account" || brief.inputKind === "content_url") {
    confidenceScore += 1;
  }

  if (confidenceScore >= 4) return "高";
  if (confidenceScore >= 2) return "中";
  return "低";
}

function inferWindowStrengthFromVerdict(
  verdict: PredictionVerdict,
): PredictionWindowStrength {
  if (verdict === "go_now") return "strong_now";
  if (verdict === "test_small") return "validate_first";
  if (verdict === "observe") return "observe";
  return "avoid";
}

function buildRecommendedNextAction(
  brief: PredictionBrief,
  scoreBreakdown: ScoreBreakdown,
  verdict: PredictionVerdict,
  confidenceLabel: PredictionConfidenceLabel,
): PredictionBestAction {
  if (brief.inputKind === "content_url") {
    return {
      type: "breakdown",
      title: "先做爆款拆解",
      description: "把竞品内容拆成结构部件，确认你该借的是标题、开头承诺、证据方式还是评论触发点。",
      ctaLabel: "继续生成拆解",
      reason: "这是链接输入场景，最佳下一步不是去找低粉样本，而是把这条内容拆透。",
    };
  }

  if (brief.inputKind === "account") {
    return {
      type: "account_benchmark",
      title: "先做对标账号参考",
      description: "拿当前账号和同赛道参考账号对齐，找出你缺的是切口、证据还是更新节奏。",
      ctaLabel: "生成对标参考",
      reason: "这是账号诊断问题，优先做账号层面对照比低粉样本更有用。",
    };
  }

  if (verdict === "observe" || verdict === "not_now" || confidenceLabel === "低") {
    return {
      type: "monitor",
      title: "先继续观察，不要重投入",
      description: "先补样本、补评论或补具体切口，等证据更完整后再判断是否进入验证或执行。",
      ctaLabel: "继续生成观察规则",
      reason: "当前最缺的是证据，而不是动作速度。",
    };
  }

  if (scoreBreakdown.anomaly >= 66 && scoreBreakdown.risk >= 52) {
    return {
      type: "low_follower_validation",
      title: "先验证可复制性",
      description: "去低粉异常样本里确认这个方向是否已经出现早期成功结构，再决定是否放大投入。",
      ctaLabel: "去低粉爆款验证",
      reason: "当前机会存在，但仍需样本级证据证明这不是偶发信号。",
    };
  }

  if (verdict === "go_now" && confidenceLabel === "高") {
    return {
      type: "generate_test_brief",
      title: "直接进入测试 brief",
      description: "把首轮选题、标题结构、内容骨架和停止规则一次性定下来，快速进入执行。",
      ctaLabel: "生成测试 brief",
      reason: "结论已经足够清晰，继续找证据的边际价值不高。",
    };
  }

  return {
    type: "low_follower_validation",
    title: "先小样验证再决定",
    description: "先用低成本样本验证切口是否成立，再决定是否进入连续执行。",
    ctaLabel: "去低粉爆款验证",
    reason: "当前更适合先做验证，而不是直接重投。",
  };
}

function inferOpportunityType(
  brief: PredictionBrief,
  scoreBreakdown: ScoreBreakdown,
  bestActionNow: PredictionBestAction,
): PredictionOpportunityType {
  if (brief.inputKind === "content_url" || bestActionNow.type === "breakdown") {
    return "structure_window";
  }
  if (brief.inputKind === "account" || bestActionNow.type === "account_benchmark") {
    return "fit_window";
  }
  if (scoreBreakdown.risk >= 72 && scoreBreakdown.anomaly < 58) {
    return "false_heat";
  }
  if (scoreBreakdown.anomaly >= scoreBreakdown.demand || bestActionNow.type === "low_follower_validation") {
    return "anomaly_window";
  }
  return "search_window";
}

function buildUiResult(
  brief: PredictionBrief,
  scoreBreakdown: ScoreBreakdown,
  connectors: ConnectorLike[],
  platformSnapshots: PlatformSnapshot[],
  lowFollowerSamples: SampleLike[],
): PredictionUiResult {
  const scoreLabel = inferScoreLabel(scoreBreakdown.opportunity);
  const platformNames = summarizePlatforms(platformSnapshots);
  const verdict = inferVerdict(scoreBreakdown);
  const confidenceLabel = inferConfidenceLabel(brief, connectors, platformSnapshots);
  const bestActionNow = buildRecommendedNextAction(
    brief,
    scoreBreakdown,
    verdict,
    confidenceLabel,
  );
  const opportunityType = inferOpportunityType(brief, scoreBreakdown, bestActionNow);
  const windowStrength = inferWindowStrengthFromVerdict(verdict);
  const decision = buildEvidenceDrivenDecision({
    brief,
    scoreBreakdown,
    platformSnapshots,
    verdict,
    confidenceLabel,
    opportunityType,
    windowStrength,
    bestActionNow,
    lowFollowerSamples,
  });

  return {
    type:
      brief.inputKind === "account"
        ? "账号诊断"
        : brief.inputKind === "content_url"
          ? "爆款拆解"
          : "爆款预测",
    platform: platformNames,
    score: scoreBreakdown.opportunity,
    scoreLabel,
    verdict,
    confidenceLabel,
    opportunityTitle: decision.opportunityTitle,
    opportunityType,
    windowStrength,
    coreBet: decision.coreBet,
    decisionBoundary: decision.decisionBoundary,
    marketEvidence: decision.marketEvidence,
    supportingAccounts: decision.supportingAccounts,
    supportingContents: decision.supportingContents,
    lowFollowerEvidence: decision.lowFollowerEvidence,
    evidenceGaps: decision.evidenceGaps,
    whyNowItems: decision.whyNowItems,
    bestFor: decision.bestFor,
    notFor: decision.notFor,
    accountMatchSummary: decision.accountMatchSummary,
    bestActionNow: decision.bestActionNow,
    whyNotOtherActions: decision.whyNotOtherActions,
    missIfWait: decision.missIfWait,
    operatorPanel: decision.operatorPanel,
    screeningReport: decision.screeningReport,
    primaryCard: decision.primaryCard,
    secondaryCard: decision.secondaryCard,
    fitSummary: decision.accountMatchSummary,
    recommendedNextAction: decision.bestActionNow,
    continueIf: decision.continueIf,
    stopIf: decision.stopIf,
  };
}

export function buildPredictionArtifacts(
  draft: PredictionRequestDraft,
  connectors: ConnectorLike[],
  lowFollowerSamples: SampleLike[],
  userProfile?: UserProfile,
): PredictionArtifacts {
  const inferred = inferIndustry(draft.prompt);
  const candidatePlatforms = inferPlatforms(draft, connectors);
  const normalizedBrief = {
    inputKind: inferInputKind(draft),
    seedTopic: inferred.topic,
    industry: inferred.industry,
    candidatePlatforms,
    accountContext: buildAccountContext(connectors, userProfile),
    competitorEvidence: draft.evidenceItems
      .filter((item) => /^https?:\/\//.test(item.source))
      .map((item) => item.display),
    personalizationMode: draft.personalizationMode,
  } satisfies PredictionBrief;
  const platformSnapshots = buildPlatformSnapshots(candidatePlatforms, connectors);
  const scoreBreakdown = buildScores(normalizedBrief, connectors, platformSnapshots);
  const verdict = inferVerdict(scoreBreakdown);
  const confidenceLabel = inferConfidenceLabel(
    normalizedBrief,
    connectors,
    platformSnapshots,
  );
  const bestActionNow = buildRecommendedNextAction(
    normalizedBrief,
    scoreBreakdown,
    verdict,
    confidenceLabel,
  );
  const opportunityType = inferOpportunityType(
    normalizedBrief,
    scoreBreakdown,
    bestActionNow,
  );
  const windowStrength = inferWindowStrengthFromVerdict(verdict);
  const decision = buildEvidenceDrivenDecision({
    brief: normalizedBrief,
    scoreBreakdown,
    platformSnapshots,
    verdict,
    confidenceLabel,
    opportunityType,
    windowStrength,
    bestActionNow,
    lowFollowerSamples,
  });
  const uiResult = buildUiResult(
    normalizedBrief,
    scoreBreakdown,
    connectors,
    platformSnapshots,
    lowFollowerSamples,
  );

  return {
    normalizedBrief,
    platformSnapshots,
    scoreBreakdown,
    uiResult,
    trendOpportunityId: decision.trendOpportunityId,
    evidenceRefs: decision.evidenceRefs,
    recommendedLowFollowerSampleIds:
      uiResult.bestActionNow.type === "low_follower_validation"
        ? uiResult.lowFollowerEvidence.map((sample) => sample.id)
        : [],
  };
}
