import type { ResultRecord } from "../../../store/app-data";
import type {
  AiTopicSuggestion,
  PredictionSupportingContent,
} from "../../../store/prediction-types";

export interface ScoreExplanationItem {
  label: string;
  value: string;
  reason: string;
  tone: "good" | "watch" | "risk";
}

export type PublishWindowStatus = "active" | "expired" | "watch" | "unknown";

export interface PublishWindowDecision {
  status: PublishWindowStatus;
  deadlineAt: string | null;
  countdownLabel: string;
  helperText: string;
  windowHours: number | null;
}

export interface SignalCard {
  key: "trend" | "demand" | "supply" | "low_follower";
  label: string;
  value: string;
  chartValue: number;
  chartLabel: string;
  detail: string;
  subDetail?: string;
  tone: "good" | "watch" | "risk";
}

export interface PositiveRecommendation {
  label: string;
  value: string;
  detail: string;
  sourceLabel: string;
  tone: "good" | "watch";
}

export interface VideoStructureStep {
  time: string;
  content: string;
}

export interface PublishSuggestion {
  time: string;
  platforms: string;
  commentHook: string;
  boostAdvice: string;
}

export interface TitleSuggestions {
  douyin: string;
  xiaohongshu: string;
  alternate: string[];
}

export interface CopyableStructure {
  name: string;
  suitableAccounts: string;
  openingFormula: string;
  copyablePoint: string;
  risk: string;
  recommendedTitle: string;
}

export interface AvoidPitfall {
  dont: string;
  reason: string;
  doInstead: string;
}

export interface ReferenceVideoInsight {
  id: string;
  role: "learn" | "avoid" | "low_follower";
  title: string;
  authorName: string;
  platform: string;
  contentUrl?: string;
  coverUrl?: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  publishedAt: string;
  viralPoint: string;
  copyablePoint: string;
  avoidPoint: string;
  suitableAccount: string;
  rewrittenTitle: string;
  topicReason: string;
}

export interface AccountFitAssessment {
  accountType: string;
  fit: "强适合" | "适合" | "谨慎" | "不建议";
  suggestion: string;
  tone: "good" | "watch" | "risk";
}

export interface CompetitiveFinding {
  label: string;
  currentState: string;
  risk: string;
  opportunity: string;
}

export interface NextGenerationAction {
  id: "shoot_plan" | "xiaohongshu_plan" | "title_cover" | "weekly_plan";
  title: string;
  description: string;
  suitableFor: string;
  prompt: string;
}

export interface PredictionBattlePlan {
  originalTopic: string;
  recommendedTitle: string;
  predictionLabel: string;
  opportunityLevel: string;
  expertJudgement: string;
  finalVerdict: string;
  actionWindow: string;
  publishWindowStatus: PublishWindowStatus;
  publishDeadlineAt: string | null;
  countdownLabel: string;
  publishWindowHint: string;
  accountContextLabel: string;
  accountContextNote: string;
  suitableAccounts: string[];
  unsuitableAccounts: string[];
  recommendedAngle: string;
  recommendedCut: string;
  recommendedContentType: string;
  narrativeApproach: string;
  conversionApproach: string;
  notRecommendedCuts: string[];
  accountFitAssessments: AccountFitAssessment[];
  score: number;
  scoreLabel: string;
  scoreExplanation: ScoreExplanationItem[];
  signalCards: SignalCard[];
  contentGap: string;
  whyNow: string[];
  openingHook: string;
  videoStructure: VideoStructureStep[];
  publishSuggestion: PublishSuggestion;
  titleSuggestions: TitleSuggestions;
  coverText: string;
  commentHook: string;
  hashtagSuggestions: string[];
  copyableStructures: CopyableStructure[];
  avoidPitfalls: AvoidPitfall[];
  competitiveFindings: CompetitiveFinding[];
  competitiveSummary: CompetitiveFinding[];
  abandonConditions: string[];
  positiveRecommendations: PositiveRecommendation[];
  nextGenerationActions: NextGenerationAction[];
  referenceVideoInsights: ReferenceVideoInsight[];
  representativeVideos: ReferenceVideoInsight[];
  primaryTopic?: AiTopicSuggestion;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function compact(items: Array<string | undefined | null>, limit = 4) {
  return items
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, limit);
}

function cleanHashTag(tag: string) {
  const value = tag.trim().replace(/^#/, "");
  return value ? `#${value}` : "";
}

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.toLowerCase().includes(word.toLowerCase()));
}

function inferAccountFit(topicText: string) {
  if (includesAny(topicText, ["ai", "chatgpt", "claude", "办公", "工具", "效率"])) {
    return {
      suitable: ["AI工具号", "职场效率号", "副业号", "自媒体运营号"],
      unsuitable: ["美妆号", "情感号", "本地生活号，除非能嫁接具体办公场景"],
      hookSubject: "打工人",
      scene: "AI 办公工作流",
    };
  }
  if (includesAny(topicText, ["减脂", "健身", "体脂", "饮食", "训练"])) {
    return {
      suitable: ["健身减脂号", "饮食记录号", "生活方式号", "低粉亲测账号"],
      unsuitable: ["纯娱乐号", "剧情号", "本地探店号，除非能拍真实饮食场景"],
      hookSubject: "减脂人群",
      scene: "真实饮食和训练选择",
    };
  }
  if (includesAny(topicText, ["小红书", "穿搭", "美妆", "护肤"])) {
    return {
      suitable: ["小红书种草号", "垂类测评号", "生活方式号", "成长期个人IP"],
      unsuitable: ["纯资讯号", "泛娱乐号", "没有真实体验素材的账号"],
      hookSubject: "普通用户",
      scene: "真实体验和对比选择",
    };
  }
  return {
    suitable: ["垂类创作者", "成长期账号", "教程型账号", "愿意做真实测试的账号"],
    unsuitable: ["完全不相关赛道", "没有素材执行能力的账号", "只想搬运资讯的账号"],
    hookSubject: "普通用户",
    scene: "一个具体使用场景",
  };
}

function looksLikeAccountType(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 24) return false;
  return /(号|账号|博主|达人|IP|KOC|创作者|运营|号主)$/.test(normalized);
}

function buildAccountTypeList(source: string[] | undefined, fallback: string[], limit = 4) {
  const accountTypes = compact((source ?? []).filter(looksLikeAccountType), limit);
  return accountTypes.length ? accountTypes : fallback.slice(0, limit);
}

function normalizeAccountContext(result?: ResultRecord) {
  const context = result?.normalizedBrief?.accountContext?.trim();
  if (!context || context === "未连接账号") return "未读取到已连接账号";
  return context;
}

function windowLabel(result: ResultRecord) {
  if (result.windowStrength === "strong_now") return "建议今天拍，24小时内发布";
  if (result.windowStrength === "validate_first") return "建议今天拍，24-48小时内发布";
  if (result.windowStrength === "observe") return "先准备素材，48小时内小成本测试";
  return "暂不建议重投入，先观察或换更细切口";
}

function getWindowHours(result: ResultRecord) {
  if (result.windowStrength === "strong_now") return 24;
  if (result.windowStrength === "validate_first") return 48;
  if (result.windowStrength === "observe") return 72;
  return null;
}

function padTime(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function formatDeadline(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function buildPublishWindowDecision(result: ResultRecord): PublishWindowDecision {
  const windowHours = getWindowHours(result);
  if (!windowHours) {
    return {
      status: "watch",
      deadlineAt: null,
      countdownLabel: "建议复查",
      helperText: "当前信号不足，不建议直接重投入。",
      windowHours,
    };
  }

  const createdAtMs = new Date(result.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) {
    return {
      status: "unknown",
      deadlineAt: null,
      countdownLabel: `${windowHours}小时窗口`,
      helperText: "缺少可靠生成时间，只展示窗口长度。",
      windowHours,
    };
  }

  const nowMs = Date.now();
  const elapsedHours = (nowMs - createdAtMs) / (60 * 60 * 1000);
  const buildCountdown = (deadline: Date) => {
    const remainingMs = deadline.getTime() - nowMs;
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
  };

  if (elapsedHours <= 12) {
    const deadline = new Date(createdAtMs + 12 * 60 * 60 * 1000);
    return {
      status: "active",
      deadlineAt: deadline.toISOString(),
      countdownLabel: buildCountdown(deadline),
      helperText: `0-12 小时是黄金验证窗口，建议优先发布；黄金窗口截止 ${formatDeadline(deadline)}。`,
      windowHours,
    };
  }

  if (elapsedHours <= 24) {
    const deadline = new Date(createdAtMs + 24 * 60 * 60 * 1000);
    return {
      status: "active",
      deadlineAt: deadline.toISOString(),
      countdownLabel: buildCountdown(deadline),
      helperText: `12-24 小时仍可跟进，但建议先做轻量内容；跟进窗口截止 ${formatDeadline(deadline)}。`,
      windowHours,
    };
  }

  if (elapsedHours <= 36) {
    const deadline = new Date(createdAtMs + 36 * 60 * 60 * 1000);
    return {
      status: "watch",
      deadlineAt: deadline.toISOString(),
      countdownLabel: `后段 ${buildCountdown(deadline)}`,
      helperText: `24-36 小时属于窗口后段，建议先轻量测试，不建议重投入；后段窗口截止 ${formatDeadline(deadline)}。`,
      windowHours,
    };
  }

  const originalDeadline = new Date(createdAtMs + windowHours * 60 * 60 * 1000);
  if (elapsedHours > 36) {
    return {
      status: "expired",
      deadlineAt: originalDeadline.toISOString(),
      countdownLabel: "建议复查",
      helperText: `预测后已超过 36 小时，时间衰减明显；保留分数判断，但建议复查最新样本后再决定是否补拍。`,
      windowHours,
    };
  }

  return {
    status: "unknown",
    deadlineAt: originalDeadline.toISOString(),
    countdownLabel: `${windowHours}小时窗口`,
    helperText: `建议在 ${windowHours} 小时窗口内发布，截止 ${formatDeadline(originalDeadline)}。`,
    windowHours,
  };
}

function verdictText(result: ResultRecord) {
  if (result.verdict === "go_now") return "系统结论：建议今天拍，优先级最高。";
  if (result.verdict === "test_small") return "系统结论：建议今天先拍一条测试，不要等热榜确认。";
  if (result.verdict === "observe") return "系统结论：先备稿观察，信号增强后再发布。";
  return "系统结论：暂不建议跟风，除非能找到更窄场景。";
}

function predictionLabel(result: ResultRecord) {
  if (result.verdict === "go_now") return "建议跟进";
  if (result.verdict === "test_small") return "建议小成本跟进";
  if (result.verdict === "observe") return "建议观察";
  return "不建议直接跟进";
}

function opportunityLevel(result: ResultRecord) {
  const score = result.score ?? 0;
  if (score >= 85) return "S级机会";
  if (score >= 75) return "A级机会";
  if (score >= 60) return "B级机会";
  return "观察级机会";
}

function scoreTone(value: number, invert = false): ScoreExplanationItem["tone"] {
  const normalized = invert ? 100 - value : value;
  if (normalized >= 68) return "good";
  if (normalized >= 45) return "watch";
  return "risk";
}

function buildScoreExplanation(
  result: ResultRecord,
  topic: AiTopicSuggestion | undefined,
  topicScore: number,
  topicSources: ReferenceVideoInsight[],
): ScoreExplanationItem[] {
  const score = result.scoreBreakdown;
  const sourceTitles = compact(topicSources.map((item) => item.title), 2);
  const topicSignals = buildTopicSignalContext(result, topic, topicSources);
  const topicReason =
    topic?.conclusion ||
    topic?.whyNow ||
    (sourceTitles.length ? `参考「${sourceTitles.join("」「")}」等样本，当前切口有真实内容可对标。` : undefined);
  return [
    {
      label: "爆发指数",
      value: `${topicScore} / 100`,
      reason: topicReason || (result.scoreLabel ? `${result.scoreLabel}，综合需求、时机、竞争和账号适配度。` : "综合多维度信号后的机会判断。"),
      tone: scoreTone(topicScore),
    },
    {
      label: "机会窗口",
      value: windowLabel(result).replace("建议", "").replace("发布", "发布窗口"),
      reason: result.marketEvidence?.timingLabel || "基于发布时间、样本热度和证据强度判断。",
      tone: result.windowStrength === "avoid" ? "risk" : result.windowStrength === "observe" ? "watch" : "good",
    },
    {
      label: "低粉可复制性",
      value: topicSignals.lowFollowerScore >= 75 ? "高" : topicSignals.lowFollowerScore >= 55 ? "中" : "谨慎",
      reason: topicSignals.lowFollowerReason,
      tone: scoreTone(topicSignals.lowFollowerScore),
    },
    {
      label: "竞争强度",
      value: (score?.competition ?? 50) >= 70 ? "高" : (score?.competition ?? 50) >= 45 ? "中" : "低",
      reason: (score?.competition ?? 50) >= 70
        ? `同类供给已经明显增加，当前切口要避开“${result.query || "热点"}”泛标题。`
        : `仍有机会围绕「${topic?.angle || topic?.title || result.query || "具体场景"}」做真实体验差异化。`,
      tone: scoreTone(score?.competition ?? 50, true),
    },
    {
      label: "内容空档",
      value: topicSignals.supplyGapScore >= 75 ? "明显" : topicSignals.supplyGapScore >= 55 ? "存在" : "偏窄",
      reason: topicSignals.supplyGapReason,
      tone: scoreTone(topicSignals.supplyGapScore),
    },
    {
      label: "风险等级",
      value: (score?.risk ?? 45) >= 70 ? "高" : (score?.risk ?? 45) >= 45 ? "中" : "中低",
      reason: (score?.risk ?? 45) >= 70 ? "同质化和误判风险较高，必须先收窄切口。" : "主要风险是拍成资讯搬运或泛泛总结。",
      tone: scoreTone(score?.risk ?? 45, true),
    },
  ];
}

function formatSignedPercent(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "待补充";
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
}

function formatCompactCount(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return "0";
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function topicDimensionScore(value: number | undefined, fallback: number) {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback);
}

function lowFollowerMatchesTopic(sample: NonNullable<ResultRecord["lowFollowerEvidence"]>[number], topic: AiTopicSuggestion | undefined) {
  if (!topic) return false;
  if (topic.evidenceContentIds?.includes(sample.id)) return true;
  if (topic.referenceTitle) {
    const ref = normalizeTopicToken(topic.referenceTitle);
    const title = normalizeTopicToken(sample.title);
    if (ref && title && (title.includes(ref) || ref.includes(title))) return true;
  }
  const haystack = normalizeTopicToken([sample.title, sample.account, ...(sample.trackTags ?? [])].join(" "));
  return (topic.tags ?? []).some((tag) => {
    const token = normalizeTopicToken(tag);
    return isDistinctiveTopicToken(token) && haystack.includes(token);
  });
}

function buildTopicSignalContext(
  result: ResultRecord,
  topic: AiTopicSuggestion | undefined,
  topicSources: ReferenceVideoInsight[],
) {
  const sourceIds = new Set([...(topic?.evidenceContentIds ?? []), ...topicSources.map((item) => item.id)]);
  const matchedContents = (result.supportingContents ?? []).filter((content) => sourceIds.has(content.contentId));
  const scoredContents = (result.supportingContents ?? [])
    .map((content) => ({ content, score: topicSourceScore(content, topic) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.content);
  const evidenceContents = uniqueSupportingContents([...matchedContents, ...scoredContents]).slice(0, 4);
  const commentCount =
    typeof topic?.commentCount === "number"
      ? topic.commentCount
      : evidenceContents.reduce((sum, content) => sum + (content.commentCount ?? 0), 0);
  const lowMatches = (result.lowFollowerEvidence ?? []).filter((sample) => lowFollowerMatchesTopic(sample, topic));
  const lowFollowerSampleCount = typeof topic?.lowFollowerSampleCount === "number" ? topic.lowFollowerSampleCount : lowMatches.length;
  const maxAnomaly = lowMatches.length ? Math.max(...lowMatches.map((item) => item.anomaly || 0)) : 0;
  const commentFallback = commentCount > 0
    ? 52 + Math.min(36, Math.round(Math.log10(commentCount + 1) * 15))
    : result.commentInsight?.demandSignals?.length
      ? 56
      : 42;
  const supplyFallback =
    58 +
    (topic?.howToShoot ? 10 : 0) +
    (topic?.angle ? 6 : 0) +
    (evidenceContents.length > 0 ? 6 : -8) -
    Math.min(14, Math.max(0, evidenceContents.length - 2) * 4);
  const lowFollowerFallback = lowFollowerSampleCount > 0 ? 58 + Math.min(34, Math.round(maxAnomaly)) : 38;

  return {
    evidenceContents,
    commentCount,
    commentScore: topicDimensionScore(topic?.commentScore, commentFallback),
    commentReason:
      topic?.commentReason ||
      (commentCount > 0
        ? `匹配样本已有 ${formatCompactCount(commentCount)} 条评论，说明这个角度有讨论空间。`
        : "当前切口评论样本不足，先用强提问验证用户是否愿意留言。"),
    supplyGapScore: topicDimensionScore(topic?.supplyGapScore, supplyFallback),
    supplyGapReason:
      topic?.supplyGapReason ||
      topic?.howToShoot ||
      "这个切口仍要靠具体场景和拍法做出差异，避免落回泛资讯。",
    lowFollowerScore: topicDimensionScore(topic?.lowFollowerScore, lowFollowerFallback),
    lowFollowerReason:
      topic?.lowFollowerReason ||
      (lowFollowerSampleCount > 0
        ? `命中 ${lowFollowerSampleCount} 条低粉样本，最高异常 ${Math.round(maxAnomaly)}。`
        : "当前切口暂未命中低粉样本，建议先小成本验证。"),
    lowFollowerSampleCount,
  };
}

function buildCommentDemandDetail(result: ResultRecord) {
  const commentInsight = result.commentInsight;
  const topComments =
    commentInsight?.highlights
      ?.flatMap((highlight) =>
        highlight.topComments.map((comment) => ({
          ...comment,
          contentTitle: highlight.contentTitle,
        })),
      )
      .filter((comment) => comment.text.trim().length >= 4)
      .sort((a, b) => b.likeCount - a.likeCount) ?? [];
  const strongest = topComments.slice(0, 2);
  if (strongest.length > 0) {
    return {
      detail: `热评最高 ${formatCompactCount(strongest[0]?.likeCount)} 赞：「${strongest[0]?.text}」${strongest[1] ? `；另一个高赞反馈是「${strongest[1].text}」。` : "。"}`,
      subDetail: `来自 ${commentInsight?.highlights?.length ?? 0} 条样本评论，共 ${commentInsight?.totalCommentsCollected ?? 0} 条评论`,
    };
  }

  const signals = compact(commentInsight?.demandSignals ?? [], 3);
  if (signals.length > 0) {
    return {
      detail: `评论中出现的真实需求/反馈：${signals.join(" / ")}。`,
      subDetail: `共 ${commentInsight?.totalCommentsCollected ?? 0} 条评论`,
    };
  }

  return {
    detail: result.whyNowItems?.[0]?.userImpact || `用户更关心“怎么用 / 是否值得做”，不是只看${result.query || "热点"}资讯。`,
    subDetail: undefined,
  };
}

function buildSignalCards(
  result: ResultRecord,
  fit: ReturnType<typeof inferAccountFit>,
  topic: AiTopicSuggestion | undefined,
  topicSources: ReferenceVideoInsight[],
): SignalCard[] {
  const market = result.marketEvidence;
  const score = result.scoreBreakdown;
  const lowFollowerEvidence = result.lowFollowerEvidence ?? [];
  const whyNow = result.whyNowItems ?? [];
  const commentInsight = result.commentInsight;
  const demandDetail = buildCommentDemandDetail(result);
  const topicSignals = buildTopicSignalContext(result, topic, topicSources);
  const highAnomaly = lowFollowerEvidence.length
    ? Math.max(...lowFollowerEvidence.map((item) => item.anomaly || 0))
    : 0;
  const trendValue = market?.growth7d != null ? clamp(Math.abs(market.growth7d)) : clamp(score?.timing ?? result.score ?? 60);
  const demandValue = topicSignals.commentScore;
  const supplyValue = topicSignals.supplyGapScore;
  const lowFollowerValue = topicSignals.lowFollowerScore;

  return [
    {
      key: "trend",
      label: "趋势信号",
      value: market?.growth7d != null ? formatSignedPercent(market.growth7d) : `${score?.timing ?? result.score ?? 0}分`,
      chartValue: trendValue,
      chartLabel: "热度增幅",
      detail:
        whyNow[0]?.fact ||
        market?.timingLabel ||
        `近窗口内已出现 ${market?.similarContentCount ?? result.supportingContents?.length ?? 0} 条相关样本。`,
      subDetail: market?.evidenceWindowLabel,
      tone: scoreTone(score?.timing ?? result.score ?? 60),
    },
    {
      key: "demand",
      label: "评论信号",
      value:
        topicSignals.commentCount > 0
          ? `${formatCompactCount(topicSignals.commentCount)}条评论`
          : `${topicSignals.commentScore}分`,
      chartValue: demandValue,
      chartLabel: "评论强度",
      detail: topicSignals.commentReason,
      subDetail:
        topic?.referenceTitle ||
        demandDetail.subDetail ||
        compact(commentInsight?.highFreqKeywords ?? [], 3).join(" / ") ||
        undefined,
      tone: scoreTone(topicSignals.commentScore),
    },
    {
      key: "supply",
      label: "供给缺口",
      value: `${topicSignals.supplyGapScore}分`,
      chartValue: supplyValue,
      chartLabel: "机会评分",
      detail: topicSignals.supplyGapReason,
      subDetail:
        topicSignals.evidenceContents.length > 0
          ? `当前切口匹配 ${topicSignals.evidenceContents.length} 条来源样本`
          : market?.similarContentCount != null
            ? `已扫描 ${market.similarContentCount} 条相似内容`
            : undefined,
      tone: scoreTone(topicSignals.supplyGapScore),
    },
    {
      key: "low_follower",
      label: "低粉机会",
      value: topicSignals.lowFollowerSampleCount > 0 ? `${topicSignals.lowFollowerSampleCount}条样本` : `${topicSignals.lowFollowerScore}分`,
      chartValue: lowFollowerValue,
      chartLabel: "可复制性",
      detail: topicSignals.lowFollowerReason,
      subDetail:
        lowFollowerEvidence.find((sample) => lowFollowerMatchesTopic(sample, topic))?.title ||
        (highAnomaly > 0 ? `全局最高低粉异常 ${Math.round(highAnomaly)}` : undefined),
      tone: scoreTone(topicSignals.lowFollowerScore),
    },
  ];
}

function splitStructure(source: string | undefined, fallback: VideoStructureStep[]) {
  const parts =
    source
      ?.split(/[\n。；;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 5) ?? [];
  if (parts.length === 0) return fallback;
  const times = ["第一段", "第二段", "第三段", "第四段", "承接方式"];
  return parts.slice(0, 5).map((content, index) => ({
    time: times[index] ?? `${index + 1}`,
    content,
  }));
}

function buildVideoStructure(result: ResultRecord, topic: AiTopicSuggestion | undefined, fit: ReturnType<typeof inferAccountFit>): VideoStructureStep[] {
  const title = topic?.title || result.opportunityTitle || result.query;
  return splitStructure(topic?.howToShoot, [
    { time: "第一段", content: `制造认知差：告诉用户这个热点不是普通资讯，而是${fit.scene}正在出现变化。` },
    { time: "第二段", content: `给出具体场景：选择一个${fit.hookSubject}能理解、能代入、能照着做的使用场景。` },
    { time: "第三段", content: `证明不是空谈：用真实体验、对比或过程展示支撑判断。` },
    { time: "承接方式", content: "把互动承接到清单、模板、资料包或下一条教程，让用户知道下一步怎么拿到完整方法。" },
  ]).map((step, index) => (index === 0 && title ? { ...step, content: topic?.angle || step.content } : step));
}

function buildTitles(result: ResultRecord, topic: AiTopicSuggestion | undefined, fit: ReturnType<typeof inferAccountFit>): TitleSuggestions {
  const base = topic?.title || result.opportunityTitle || result.query || "这个选题今天值得拍";
  return {
    douyin: base,
    xiaohongshu: `我用这个方法做了一套${fit.scene}，真的更省时间`,
    alternate: compact([
      `别再做大盘点了，${fit.hookSubject}真正要看的是这个场景`,
      `我试了几个方法，最后只留下这 3 个`,
      `${fit.hookSubject}今天就能照着拍的一条内容`,
    ], 3),
  };
}

function buildTags(result: ResultRecord, topic: AiTopicSuggestion | undefined, fit: ReturnType<typeof inferAccountFit>) {
  const raw = [
    ...(topic?.tags ?? []),
    ...((result.supportingContents ?? []).flatMap((item) => item.keywordTokens ?? [])),
    fit.scene,
    result.query,
  ];
  return compact(raw.map(cleanHashTag), 6);
}

function normalizeTopicToken(value: string) {
  return value
    .replace(/^#/, "")
    .replace(/[「」《》【】"'“”‘’\s]/g, "")
    .toLowerCase();
}

const GENERIC_TOPIC_TOKENS = new Set([
  "ai",
  "人工智能",
  "豆包",
  "工具",
  "教程",
  "热点",
  "内容",
  "视频",
  "抖音",
  "小红书",
  "爆款",
]);

function isDistinctiveTopicToken(token: string) {
  if (!token) return false;
  if (GENERIC_TOPIC_TOKENS.has(token)) return false;
  if (/^[a-z]{1,2}$/.test(token)) return false;
  return token.length >= 2;
}

function topicReferenceMatches(content: PredictionSupportingContent, topic: AiTopicSuggestion | undefined) {
  if (!topic) return false;
  if (topic.referenceId && content.contentId === topic.referenceId) return true;
  if (topic.referenceAuthor && content.authorName && content.authorName.includes(topic.referenceAuthor)) return true;
  if (!topic.referenceTitle) return false;
  const ref = normalizeTopicToken(topic.referenceTitle);
  const title = normalizeTopicToken(content.title);
  return Boolean(ref && title && (title.includes(ref) || ref.includes(title)));
}

function topicSourceScore(content: PredictionSupportingContent, topic: AiTopicSuggestion | undefined) {
  if (!topic) return 0;
  let score = 0;
  const haystack = normalizeTopicToken([content.title, content.authorName, ...(content.keywordTokens ?? [])].join(" "));
  if (topic.referenceId && content.contentId === topic.referenceId) score += 140;
  if (topic.referenceAuthor && content.authorName && content.authorName.includes(topic.referenceAuthor)) score += 32;
  if (topicReferenceMatches(content, topic)) score += 110;
  for (const tag of topic.tags ?? []) {
    const token = normalizeTopicToken(tag);
    if (isDistinctiveTopicToken(token) && haystack.includes(token)) score += 18;
  }
  for (const phrase of [topic.title, topic.angle, topic.howToShoot]) {
    const token = normalizeTopicToken(phrase ?? "");
    if (token && token.length >= 5 && haystack.includes(token.slice(0, Math.min(10, token.length)))) score += 14;
  }
  return score;
}

function topicSourceReason(content: PredictionSupportingContent, topic: AiTopicSuggestion | undefined) {
  if (!topic) return "用于校验当前机会的真实样本。";
  if (topic.referenceId && content.contentId === topic.referenceId) return "当前切口指定的对标样本。";
  if (topic.referenceAuthor && content.authorName && content.authorName.includes(topic.referenceAuthor)) return `对标作者与当前切口匹配：@${content.authorName}。`;
  if (topicReferenceMatches(content, topic)) return "标题与当前切口的对标样本匹配。";
  const matchedTag = (topic.tags ?? []).find((tag) => {
    const token = normalizeTopicToken(tag);
    return isDistinctiveTopicToken(token) && normalizeTopicToken([content.title, ...(content.keywordTokens ?? [])].join(" ")).includes(token);
  });
  if (matchedTag) return `命中当前切口标签 ${matchedTag}。`;
  if (topic.howToShoot) return `用于验证当前拍法：${topic.howToShoot}`;
  if (topic.angle) return `用于验证「${topic.angle}」能否从真实样本迁移。`;
  return "用于补充当前切口的内容证据。";
}

function rotateSupportingContents(contents: PredictionSupportingContent[], activeTopicIndex: number) {
  const offset = (activeTopicIndex * 3) % contents.length;
  return [...contents.slice(offset), ...contents.slice(0, offset)];
}

function uniqueSupportingContents(contents: PredictionSupportingContent[]) {
  const seen = new Set<string>();
  return contents.filter((content) => {
    const key = content.contentId || content.contentUrl || content.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderSupportingContentsForTopic(
  contents: PredictionSupportingContent[],
  topic: AiTopicSuggestion | undefined,
  activeTopicIndex: number,
) {
  if (contents.length === 0) return [];
  const rotated = rotateSupportingContents(contents, activeTopicIndex);
  if (!topic) return rotated;
  const scored = contents.map((content, index) => ({
    content,
    index,
    score: topicSourceScore(content, topic),
  }));
  const ranked = scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const exactMatches = ranked.filter((item) => topicReferenceMatches(item.content, topic));
  const strongMatches = ranked.filter((item) => item.score >= 24);
  const anchorPool = exactMatches.length ? exactMatches : strongMatches;
  const anchor = anchorPool.length ? anchorPool[activeTopicIndex % anchorPool.length]?.content : rotated[0];

  return uniqueSupportingContents([
    anchor,
    ...anchorPool.map((item) => item.content),
    ...rotated,
    ...ranked.map((item) => item.content),
  ].filter((item): item is PredictionSupportingContent => Boolean(item)));
}

function insightFromContent(
  content: PredictionSupportingContent,
  fit: ReturnType<typeof inferAccountFit>,
  index: number,
  topic?: AiTopicSuggestion,
): ReferenceVideoInsight {
  const keywords = compact(content.keywordTokens ?? [], 2).join(" / ");
  return {
    id: content.contentId,
    role: index === 0 ? "learn" : index === 1 ? "avoid" : "low_follower",
    title: content.title,
    authorName: content.authorName,
    platform: content.platform,
    contentUrl: content.contentUrl,
    coverUrl: content.coverUrl,
    viewCount: content.viewCount,
    likeCount: content.likeCount,
    commentCount: content.commentCount,
    publishedAt: content.publishedAt,
    viralPoint: content.whyIncluded || (keywords ? `命中 ${keywords} 相关需求` : "标题和场景更容易触发点击。"),
    copyablePoint: content.structureSummary || "复制它的问题开场、场景演示和明确结论，不复制人设。",
    avoidPoint: "不要照搬标题和素材，换成自己的真实场景和使用过程。",
    suitableAccount: fit.suitable.slice(0, 2).join(" / "),
    rewrittenTitle: `我把这条改成${fit.hookSubject}能直接用的版本`,
    topicReason: topicSourceReason(content, topic),
  };
}

function buildAccountFitAssessments(fit: ReturnType<typeof inferAccountFit>, result?: ResultRecord): AccountFitAssessment[] {
  const accountContext = normalizeAccountContext(result);
  const connectedAccount = accountContext !== "未读取到已连接账号";
  const base: AccountFitAssessment[] = [
    { accountType: fit.suitable[0] ?? "垂类账号", fit: "强适合", suggestion: "做垂类经验判断和场景化教程。", tone: "good" },
    { accountType: fit.suitable[1] ?? "教程型账号", fit: "强适合", suggestion: "把热点翻译成用户能直接理解的具体场景。", tone: "good" },
    { accountType: fit.suitable[2] ?? "成长期账号", fit: "适合", suggestion: "不要拼资讯速度，拼真实体验和取舍标准。", tone: "good" },
    { accountType: fit.suitable[3] ?? "知识博主", fit: "适合", suggestion: "用趋势判断做开场，但主体要落到实操。", tone: "watch" },
    { accountType: fit.unsuitable[0] ?? "不相关赛道", fit: "不建议", suggestion: "除非能强行嫁接到自己的明确场景，否则容易割裂。", tone: "risk" },
  ];
  if (!connectedAccount) return base;
  return [
    {
      accountType: "你的已连接账号",
      fit: "谨慎",
      suggestion: `${accountContext}。当前接口只返回账号连接上下文，未返回近 30 天内容画像；建议先用本次低粉样本切口发一条小样验证粉丝反应。`,
      tone: "watch",
    },
    ...base.slice(0, 4),
  ];
}

function buildCompetitiveFindings(fit: ReturnType<typeof inferAccountFit>, result: ResultRecord): CompetitiveFinding[] {
  const sampleCount = result.supportingContents?.length ?? 0;
  return [
    {
      label: "大号正在做什么",
      currentState: sampleCount > 0 ? "已有账号开始围绕这个方向做资讯或经验表达。" : "样本还不多，当前更适合先观察内容供给。",
      risk: "中腰部账号如果直接复述资讯，容易被大号速度和权威压制。",
      opportunity: `避开资讯盘点，改做${fit.scene}的具体判断。`,
    },
    {
      label: "同质化在哪里",
      currentState: "泛标题、合集、热点复述最容易迅速同质化。",
      risk: "用户看完不知道自己能怎么用，完播和收藏都会受影响。",
      opportunity: "用真实测试、场景拆解和取舍理由形成差异。",
    },
    {
      label: "中小号机会在哪",
      currentState: `实操场景和${fit.hookSubject}视角仍然更适合中腰部账号切入。`,
      risk: "如果没有具体场景，内容会回到普通观点输出。",
      opportunity: "把热点翻译成用户能收藏、评论、照做的场景型内容。",
    },
  ];
}

function buildAbandonConditions(fit: ReturnType<typeof inferAccountFit>) {
  return [
    `你的账号从未发过${fit.scene}相关内容，也无法自然嫁接到现有人设。`,
    "你只能做资讯搬运，没有实操画面、真实体验或明确取舍标准。",
    "你准备做成大盘点、新闻合集或热词堆砌。",
    "你无法在当前机会窗口内完成发布，且没有后续跟进计划。",
    "你不准备做评论区承接，无法把兴趣转成收藏、私信或下一条内容。",
  ];
}

function buildPositiveRecommendations(
  result: ResultRecord,
  fit: ReturnType<typeof inferAccountFit>,
  topic: AiTopicSuggestion | undefined,
  topicSources: ReferenceVideoInsight[],
): PositiveRecommendation[] {
  const lowFollowerEvidence = result.lowFollowerEvidence ?? [];
  const supportingContents = result.supportingContents ?? [];
  const commentInsight = result.commentInsight;
  const lowSample = lowFollowerEvidence[0];
  const source = topicSources[0];
  const cutLabel = topic?.angle || topic?.title || fit.scene;
  const topComment =
    commentInsight?.highlights
      ?.flatMap((highlight) => highlight.topComments)
      .sort((a, b) => b.likeCount - a.likeCount)[0];
  return [
    {
      label: "Aha 1",
      value: `这个切口押的是「${cutLabel}」`,
      detail: source
        ? `来源样本「${source.title}」提供了当前切口的可迁移结构：${source.topicReason}`
        : lowSample
          ? `低粉样本「${lowSample.title}」只有 ${lowSample.fansLabel}，但互动异常值 ${Math.round(lowSample.anomaly)}，说明中小账号可以用更具体的场景切入。`
          : `已扫描 ${supportingContents.length} 条内容，当前切口需要靠具体场景和真实表达拉开差异。`,
      sourceLabel: source ? "切口来源" : lowSample ? `异常值 ${Math.round(lowSample.anomaly)}` : `${supportingContents.length}条样本`,
      tone: "good",
    },
    {
      label: "Aha 2",
      value: "评论区在接梗，说明内容有二创空间",
      detail: topComment
        ? `最高赞热评「${topComment.text}」拿到 ${formatCompactCount(topComment.likeCount)} 赞，说明用户不是只看结果，而是在参与调侃和表达态度。`
        : commentInsight?.aiSummary || `评论信号不足时，先把切口做得更具体，便于用户接梗。`,
      sourceLabel: commentInsight?.totalCommentsCollected ? `${commentInsight.totalCommentsCollected}条评论` : "评论待补",
      tone: commentInsight?.totalCommentsCollected ? "good" : "watch",
    },
    {
      label: "Aha 3",
      value: topic?.howToShoot || `最优下注点是「${cutLabel}」`,
      detail: topic?.whyNow || `不要把这次机会做成赛道大盘点。更高胜率的做法是把热点压缩到一个可拍场景，并用真实体验验证。`,
      sourceLabel: result.marketEvidence?.similarContentCount ? `${result.marketEvidence.similarContentCount}条相似内容` : "切口判断",
      tone: "good",
    },
    {
      label: "Aha 4",
      value: "下一步不是写全套脚本，而是先生成一条验证稿",
      detail:
        result.continueIf?.[1] ||
        result.bestActionNow?.reason ||
        "先发布一条验证内容，看评论是否继续围绕“能不能吃、怎么练、求清单”扩散，再决定是否做系列化追热点。",
      sourceLabel: result.windowStrength === "strong_now" ? "24小时窗口" : "48小时窗口",
      tone: "good",
    },
  ];
}

function buildNextGenerationActions(result: ResultRecord, topicTitle: string): NextGenerationAction[] {
  return [
    {
      id: "shoot_plan",
      title: "生成抖音口播脚本",
      description: "把预测切口转成 60 秒口播结构和分镜建议。",
      suitableFor: "适合真人出镜 / 口播号",
      prompt: `基于这次预测结果，围绕「${topicTitle}」生成抖音口播脚本。`,
    },
    {
      id: "xiaohongshu_plan",
      title: "生成小红书图文方案",
      description: "把切口改成图文笔记结构、段落和配图建议。",
      suitableFor: "适合教程型 / 清单型内容",
      prompt: `基于这次预测结果，围绕「${topicTitle}」生成小红书图文方案。`,
    },
    {
      id: "title_cover",
      title: "生成标题与封面",
      description: "确认机会后，再生成标题、封面和包装方向。",
      suitableFor: "适合已经决定跟进的用户",
      prompt: `基于这次预测结果，围绕「${topicTitle}」生成标题与封面方案。`,
    },
    {
      id: "weekly_plan",
      title: "生成3天追热点计划",
      description: "把这次机会拆成连续 3 天的跟进节奏。",
      suitableFor: "适合想连续跟进趋势的用户",
      prompt: `基于这次预测结果，围绕「${topicTitle}」生成3天追热点计划。`,
    },
  ];
}

function buildCopyableStructures(result: ResultRecord, fit: ReturnType<typeof inferAccountFit>, topicTitle: string): CopyableStructure[] {
  const lowSample = result.lowFollowerEvidence?.[0];
  return [
    {
      name: "清单筛选型",
      suitableAccounts: fit.suitable.slice(0, 2).join(" / "),
      openingFormula: `我试了最近最火的几个方向，真正有用的是这几个。`,
      copyablePoint: "用清单降低理解门槛，但每一项都要给真实使用理由。",
      risk: "容易变成普通合集，必须加入亲测结果和取舍标准。",
      recommendedTitle: topicTitle,
    },
    {
      name: "认知冲击型",
      suitableAccounts: fit.suitable.slice(1, 3).join(" / ") || fit.suitable[0] || "垂类账号",
      openingFormula: `很多人还在跟风做大盘点，但真正的变化已经发生了。`,
      copyablePoint: "先制造认知差，再用具体案例证明。",
      risk: "容易空泛，必须给出具体场景或真实操作画面。",
      recommendedTitle: `别再只看热榜了，${fit.hookSubject}应该先看这个信号`,
    },
    {
      name: "实操教程型",
      suitableAccounts: lowSample ? "低粉账号 / 教程型账号" : "低粉账号 / 亲测型账号",
      openingFormula: `用这个方法，我把原本很麻烦的一件事压缩成几步。`,
      copyablePoint: lowSample?.suggestion || "用操作过程承接信任，比单纯讲观点更容易被收藏。",
      risk: "必须有真实过程，不然会被用户当成空口建议。",
      recommendedTitle: `今天就照这个流程拍一条${fit.scene}`,
    },
  ];
}

function buildPitfalls(fit: ReturnType<typeof inferAccountFit>, result: ResultRecord): AvoidPitfall[] {
  return [
    {
      dont: `${result.query || "这个方向"}大盘点`,
      reason: "信息太散，普通用户没有耐心看完，中腰部账号也缺少权威优势。",
      doInstead: `只选一个具体场景：${fit.hookSubject}如何用它解决一个明确问题。`,
    },
    {
      dont: "纯资讯搬运",
      reason: "大号更快、更权威，中小账号很容易被压制。",
      doInstead: "做亲测体验 + 使用场景 + 可复制步骤。",
    },
    {
      dont: "标题里堆热词",
      reason: "热词不能自动带来完播，用户要的是和自己有关的收益。",
      doInstead: "标题直接写对象、场景和结果。",
    },
  ];
}

export function buildPredictionBattlePlan(result: ResultRecord, activeTopicIndex = 0): PredictionBattlePlan {
  const topics = result.aiTopicSuggestions ?? [];
  const primaryTopic = topics[activeTopicIndex] ?? topics[0];
  const topicText = [primaryTopic?.title, primaryTopic?.angle, result.query, result.opportunityTitle].join(" ");
  const fit = inferAccountFit(topicText);
  const originalTopic = result.query || result.opportunityTitle || result.title;
  const recommendedTitle = primaryTopic?.title || result.opportunityTitle || result.title || originalTopic;
  const titleSuggestions = buildTitles(result, primaryTopic, fit);
  const recommendedCut = primaryTopic?.angle || fit.scene;
  const topicScore = clamp(primaryTopic?.score ?? result.score ?? 0);
  const commentHook = includesAny(topicText, ["ai", "chatgpt", "claude", "工具"])
    ? "想要工具清单，评论区打「AI」"
    : includesAny(topicText, ["减脂", "健身"])
      ? "想要完整食谱/训练表，评论区打「减脂」"
      : "想要完整模板，评论区打「方案」";
  const whyNow = compact([
    primaryTopic?.whyNow,
    primaryTopic?.conclusionSub,
    result.whyNowItems?.[0]?.fact,
    result.whyNowItems?.[0]?.userImpact,
    result.commentInsight?.aiSummary,
    result.coreBet,
  ], 4);
  const publishWindow = buildPublishWindowDecision(result);
  const competitiveSummary = buildCompetitiveFindings(fit, result);
  const orderedSupportingContents = orderSupportingContentsForTopic(result.supportingContents ?? [], primaryTopic, activeTopicIndex);
  const referenceVideoInsights = orderedSupportingContents
    .slice(0, 9)
    .map((content, index) => insightFromContent(content, fit, index, primaryTopic));
  const representativeVideos = referenceVideoInsights.slice(0, 3);
  const signalCards = buildSignalCards(result, fit, primaryTopic, representativeVideos).map((card) => {
    if (card.key === "trend" && primaryTopic?.whyNow) {
      return {
        ...card,
        detail: primaryTopic.whyNow,
        subDetail: primaryTopic.referenceTitle ? `参考样本：${primaryTopic.referenceTitle}` : card.subDetail,
      };
    }
    return card;
  });

  return {
    originalTopic,
    recommendedTitle,
    predictionLabel:
      publishWindow.status === "expired"
        ? "建议复查"
        : publishWindow.status === "watch"
          ? "谨慎跟进"
          : predictionLabel(result),
    opportunityLevel: topicScore >= 85 ? "S级机会" : topicScore >= 75 ? "A级机会" : topicScore >= 60 ? "B级机会" : opportunityLevel(result),
    expertJudgement:
      primaryTopic?.conclusionSub ||
      primaryTopic?.angle ||
      result.coreBet ||
      `这个热点表面是趋势信号，但中腰部账号真正的机会不是复述资讯，而是切成「${recommendedCut}」。`,
    finalVerdict: verdictText(result),
    actionWindow: windowLabel(result),
    publishWindowStatus: publishWindow.status,
    publishDeadlineAt: publishWindow.deadlineAt,
    countdownLabel: publishWindow.countdownLabel,
    publishWindowHint: publishWindow.helperText,
    accountContextLabel: normalizeAccountContext(result),
    accountContextNote:
      normalizeAccountContext(result) === "未读取到已连接账号"
        ? "当前按公开样本和赛道信号判断，未叠加你的账号画像。"
        : "已读取账号连接上下文；当前接口未返回近期作品画像，所以账号适配仍以赛道和样本信号为主。",
    suitableAccounts: buildAccountTypeList(result.bestFor, fit.suitable, 4),
    unsuitableAccounts: buildAccountTypeList(result.notFor, fit.unsuitable, 3),
    recommendedAngle: primaryTopic?.angle || result.coreBet || `不要做泛分析，做${fit.scene}的具体教程。`,
    recommendedCut,
    recommendedContentType: `${fit.scene}场景型内容`,
    narrativeApproach: primaryTopic?.howToShoot || "先给判断，再给场景，再解释为什么中小账号能做。",
    conversionApproach: "把互动承接到下一步生成的脚本、标题封面、平台版本或追热点计划。",
    notRecommendedCuts: compact([
      `${result.query || "这个方向"}大盘点`,
      "热点资讯合集",
      "纯新闻解读",
      "只堆热词的泛标题",
    ], 4),
    accountFitAssessments: buildAccountFitAssessments(fit, result),
    score: topicScore,
    scoreLabel: primaryTopic?.conclusion || result.scoreLabel || "机会判断",
    scoreExplanation: buildScoreExplanation(result, primaryTopic, topicScore, representativeVideos),
    signalCards,
    contentGap: primaryTopic?.howToShoot || result.decisionBoundary || `多数内容还在泛泛讨论，缺少${fit.hookSubject}能直接照做的${fit.scene}。`,
    whyNow: whyNow.length ? whyNow : [
      "话题已经出现真实样本，但用户还缺少可直接照做的表达。",
      "中腰部账号可以通过真实体验、教程和清单切入，而不是拼权威。",
      "现在做的优势是先占具体场景，不等同质化内容铺满。",
    ],
    openingHook: primaryTopic?.angle || `别再做普通大盘点了，${fit.hookSubject}真正关心的是这件事怎么用。`,
    videoStructure: buildVideoStructure(result, primaryTopic, fit),
    publishSuggestion: {
      time: "中午 12:00 或晚上 8:30",
      platforms: result.platform?.includes("小红书") ? "小红书图文版 + 抖音口播版" : "抖音优先，小红书可改成图文清单",
      commentHook,
      boostAdvice: result.score >= 75 ? "先自然流测试，数据稳定后再考虑小额投流。" : "先自然流验证，不建议一开始投流。",
    },
    titleSuggestions,
    coverText: includesAny(topicText, ["ai", "chatgpt", "claude"]) ? "AI办公变天了" : `${fit.scene}新机会`,
    commentHook,
    hashtagSuggestions: buildTags(result, primaryTopic, fit),
    copyableStructures: buildCopyableStructures(result, fit, recommendedTitle),
    avoidPitfalls: buildPitfalls(fit, result),
    competitiveFindings: competitiveSummary,
    competitiveSummary,
    abandonConditions: buildAbandonConditions(fit),
    positiveRecommendations: buildPositiveRecommendations(result, fit, primaryTopic, representativeVideos),
    nextGenerationActions: buildNextGenerationActions(result, recommendedTitle),
    referenceVideoInsights,
    representativeVideos,
    primaryTopic,
  };
}
