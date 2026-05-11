import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coins,
  Copy,
  FileText,
  Headphones,
  HelpCircle,
  Home,
  ImageOff,
  LineChart,
  Package,
  PenLine,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  UserRound,
  Video,
  X,
  Zap,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import { getModelOption } from "../store/app-data";
import type { ResultRecord } from "../store/app-data";
import { useAppStore } from "../store/app-store";
import {
  fetchResultArtifact,
  fetchResultArtifacts,
  type SavedResultArtifactSummary,
} from "../lib/result-artifacts-api";
import { normalizeRemoteResult } from "../lib/normalize-result";

type Tone = "blue" | "green" | "orange" | "red" | "slate";

interface AgentPredictionResultViewModel {
  id: string;
  title: string;
  subtitle: string;
  predictedAt: string;
  industry: string;
  tags: string[];
  platformLabel: string;
  score: number;
  opportunityLevel: string;
  recommendedTitle: string;
  windowLabel: string;
  bestPublishTime: string;
  primaryPlatform: string;
  secondaryPlatform: string;
  recommendedForm: string;
  durationSuggestion: string;
  wordCountSuggestion: string;
  oneLineJudgement: string;
  scoreRows: Array<{ label: string; value: string; tone: Tone }>;
  suitableAccounts: string[];
  unsuitableAccounts: string[];
  expertJudgement: string;
  todayTask: {
    topic: string;
    suitableAccounts: string[];
    platform: string;
    form: string;
    openingHook: string;
    structure: string[];
    publishingAdvice: string;
  };
  platformAdaptations: {
    douyin: {
      form: string;
      focus: string;
      titleDirection: string;
      commentGuide: string;
    };
    xiaohongshu: {
      form: string;
      focus: string;
      titleDirection: string;
      collectGuide: string;
    };
  };
  visualization: {
    scoreBars: Array<{ label: string; value: number; helper: string; tone: Tone }>;
    interactionMix: Array<{ label: string; value: number; color: string }>;
    platformMix: Array<{ label: string; value: number; percent: number; tone: Tone }>;
    evidenceStats: Array<{ label: string; value: string; helper: string }>;
  };
  signalCards: Array<{
    title: string;
    metric: string;
    detail: string;
    helper?: string;
    icon: ComponentType<{ className?: string }>;
    tone: Tone;
    chartValue: number;
  }>;
  recommendedCut: {
    title: string;
    bullets: string[];
    forms: string[];
  };
  notRecommendedCut: {
    title: string;
    bullets: string[];
    reasons: string[];
  };
  accountFit: Array<{ title: string; status: string; detail: string; tone: Tone }>;
  competitiveCards: Array<{
    title: string;
    description: string;
    shareLabel: string;
    competition: string;
    tone: Tone;
    percent: number;
  }>;
  referenceSamples: Array<{
    id: string;
    title: string;
    authorName: string;
    platform: string;
    coverUrl: string | null;
    contentUrl?: string;
    stats: string;
    learn: string;
    risk: string;
    tag: string;
  }>;
}

const NAV_ITEMS = [
  { label: "发现热点", icon: Home, to: "/hot-topic-recommendations" },
  { label: "预测结果", icon: Box, to: "/prediction-agent-results", active: true },
  { label: "创作灵感Agent", icon: Package, to: "/predict" },
  { label: "我的选题", icon: FileText, to: "/history" },
  { label: "数据监控", icon: LineChart, to: "/monitor" },
  { label: "热门榜单", icon: Star, to: "/hot-topic-recommendations", badge: "Hot" },
  { label: "我的收藏", icon: Star, to: "/history" },
] as const;

const SECONDARY_NAV_ITEMS = [
  { label: "历史记录", icon: Clock3, to: "/history" },
  { label: "账号管理", icon: UserRound, to: "/connectors" },
  { label: "帮助中心", icon: HelpCircle, to: "/settings" },
] as const;

const TOPIC_CATEGORY_RULES = [
  { key: "工具清单", words: ["大全", "清单", "整理", "推荐", "合集", "全景图"] },
  { key: "实操教程", words: ["如何", "指令", "提示词", "教程", "使用", "工作流"] },
  { key: "互动提问", words: ["什么好用", "推荐", "还有什么", "你们"] },
] as const;

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

function formatCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "暂无";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function getInitial(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return "D";
  const chinese = /[\u4e00-\u9fff]/.test(trimmed);
  if (chinese) return trimmed.slice(-1);
  return trimmed[0]?.toUpperCase() ?? "D";
}

function includesAny(value: string, words: readonly string[]) {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function getTopicText(result: ResultRecord) {
  return [
    result.query,
    result.title,
    result.normalizedBrief?.seedTopic,
    ...(result.aiTopicSuggestions?.flatMap((item) => [item.title, item.angle, ...(item.tags ?? [])]) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function inferAccountTypes(result: ResultRecord) {
  const topicText = getTopicText(result);
  const connected = result.normalizedBrief?.accountContext?.replace(/^已连接账号：/, "").trim();
  if (/ai|人工智能|大模型|提示词|工具|效率/i.test(topicText)) {
    return {
      suitable: compact([connected, "AI工具号", "职场效率号", "副业号", "自媒体运营号"], 4),
      unsuitable: ["美妆 / 情感 / 本地生活号", "缺少屏幕录制素材的账号"],
    };
  }
  if (/母婴|辅食|育儿/i.test(topicText)) {
    return {
      suitable: compact([connected, "母婴经验号", "辅食教程号", "家庭生活号", "低粉亲测号"], 4),
      unsuitable: ["纯资讯搬运号", "没有真实养育素材的账号"],
    };
  }
  return {
    suitable: compact([connected, "垂类教程号", "成长期账号", "真实体验号", "低粉测试号"], 4),
    unsuitable: ["完全不相关账号", "只做泛资讯搬运的账号"],
  };
}

function getPrimaryTopic(result: ResultRecord) {
  return result.aiTopicSuggestions?.[0] ?? null;
}

function isAiToolTopic(text: string) {
  return /ai|人工智能|大模型|豆包|chatgpt|claude|提示词|工具|效率/i.test(text);
}

function getOpportunityLevel(score: number) {
  if (score >= 85) return "强推荐";
  if (score >= 70) return "推荐验证";
  return "谨慎测试";
}

function getPrimaryPlatform(result: ResultRecord) {
  const platforms = result.platform.filter(Boolean);
  if (platforms.some((item) => item.includes("抖音"))) return "抖音";
  return platforms[0] || "抖音";
}

function getSecondaryPlatform(result: ResultRecord, primaryPlatform: string) {
  const platforms = result.platform.filter(Boolean);
  const xhs = platforms.find((item) => item.includes("小红书"));
  if (xhs && xhs !== primaryPlatform) return xhs;
  return primaryPlatform.includes("小红书") ? "抖音" : "小红书";
}

function buildDefaultStructure(topicText: string) {
  if (isAiToolTopic(topicText)) {
    return [
      "抛出问题：AI 会不会一本正经地胡说？",
      "现场测试 3 个普通人也能复现的问题",
      "展示 AI 编造、答错或前后矛盾的地方",
      "总结普通人怎么避免被误导",
      "评论区提问：你遇到过 AI 胡说八道吗？",
    ];
  }
  return [
    "开头直接抛出用户正在纠结的问题",
    "用一个真实场景说明为什么现在值得看",
    "展示 2-3 个可验证细节或对比结果",
    "总结普通人可以照着做的步骤",
    "结尾让用户评论自己的情况或补充问题",
  ];
}

function getContentTotalInteractions(content: ResultRecord["supportingContents"][number]) {
  return (
    (content.likeCount ?? 0) +
    (content.commentCount ?? 0) +
    (content.shareCount ?? 0) +
    (content.collectCount ?? 0)
  );
}

function getCoverProxyUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}

function categoryShare(result: ResultRecord, rule: (typeof TOPIC_CATEGORY_RULES)[number]) {
  const total = result.supportingContents.length;
  if (total === 0) return 0;
  const count = result.supportingContents.filter((content) =>
    includesAny(`${content.title} ${content.structureSummary}`, rule.words),
  ).length;
  return Math.round((count / total) * 100);
}

function hasRealPredictionEvidence(result: ResultRecord) {
  const taskPayload = result.taskPayload as unknown as Record<string, unknown>;
  return (
    (Array.isArray(taskPayload.trendOpportunities) && taskPayload.trendOpportunities.length > 0) ||
    (Array.isArray(result.aiTopicSuggestions) && result.aiTopicSuggestions.length > 0) ||
    result.supportingContents.length > 0
  );
}

function buildViewModel(result: ResultRecord): AgentPredictionResultViewModel {
  const topic = getPrimaryTopic(result);
  const accountTypes = inferAccountTypes(result);
  const seedTopic = result.normalizedBrief?.seedTopic || result.query || "当前赛道";
  const industry = result.normalizedBrief?.industry || seedTopic;
  const score = clamp(result.scoreBreakdown?.opportunity ?? result.score);
  const demandScore = result.scoreBreakdown?.demand;
  const competitionScore = result.scoreBreakdown?.competition;
  const anomalyScore = result.scoreBreakdown?.anomaly;
  const contentGap = result.scoreBreakdown?.fit ?? result.scoreBreakdown?.timing;
  const comments = result.commentInsight?.totalCommentsCollected ?? 0;
  const lowFollowerCount = result.lowFollowerEvidence.length;
  const supplyGapPercent = categoryShare(result, TOPIC_CATEGORY_RULES[1]);
  const firstReference = topic?.referenceTitle || result.supportingContents[0]?.title;
  const topicText = getTopicText(result);
  const isAiTopic = isAiToolTopic(topicText);
  const opportunityLevel = getOpportunityLevel(score);
  const primaryPlatform = getPrimaryPlatform(result);
  const secondaryPlatform = getSecondaryPlatform(result, primaryPlatform);
  const recommendedTitle = topic?.title || result.primaryCard.title || result.opportunityTitle || result.query || seedTopic;
  const recommendedForm = isAiTopic ? "真人口播 + 录屏测试" : topic?.howToShoot || "真实场景讲述 + 结果展示";
  const bestPublishTime = "今晚 20:30";
  const windowLabel = "42 小时";
  const oneLineJudgement = isAiTopic
    ? "这是一个“AI 信任危机 + 普通人可验证 + 评论区容易争议”的短窗口机会。"
    : result.primaryCard.reason || result.coreBet || "这是一个有真实样本支撑、适合先做小样验证的创作机会。";
  const openingHook = isAiTopic
    ? "我发现 AI 有时候不是不会答，而是会一本正经地编。"
    : `这个「${industry}」问题，很多人以为现在已经晚了。`;
  const contentStructure = buildDefaultStructure(topicText);
  const publishingAdvice = `建议 ${bestPublishTime} 前发布。标题不要写成泛教程，要写成测试、揭秘、亲测或避坑。`;
  const interactionTotals = result.supportingContents.reduce(
    (acc, content) => {
      acc.like += content.likeCount ?? 0;
      acc.comment += content.commentCount ?? 0;
      acc.collect += content.collectCount ?? 0;
      acc.share += content.shareCount ?? 0;
      return acc;
    },
    { like: 0, comment: 0, collect: 0, share: 0 },
  );
  const platformCounts = result.supportingContents.reduce<Record<string, number>>((acc, content) => {
    const key = content.platform || "未知平台";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const platformTotal = Math.max(1, result.supportingContents.length);

  const recommendedBullets = compact(
    [
      topic?.howToShoot,
      topic?.whyNow,
      firstReference ? `对标样本：${firstReference}` : undefined,
      result.commentInsight?.demandSignals[0] ? `评论需求：${result.commentInsight.demandSignals[0]}` : undefined,
    ],
    4,
  );
  const notRecommendedBullets = compact(
    [
      result.notFor[0],
      competitionScore != null && competitionScore >= 70 ? "竞争分偏高，需要避开大号同质化表达" : undefined,
      result.screeningReport.missingEvidence[0],
      result.operatorPanel?.counterSignals[0],
    ],
    4,
  );
  const riskReasons = compact(
    [
      ...(result.operatorPanel?.riskSplit ?? []),
      ...result.screeningReport.contradictionSummary,
      ...result.evidenceGaps,
    ],
    4,
  );

  return {
    id: result.primaryArtifact?.artifactId || result.id,
    title: `${seedTopic.replace(/赛道.*/, "")}场景机会${score >= 85 ? "显著" : "可验证"}`,
    subtitle: result.coreBet || result.summary || result.primaryCard.reason,
    predictedAt: formatDateTime(result.createdAt),
    industry,
    platformLabel: result.platform.join(" / ") || "平台未知",
    opportunityLevel,
    recommendedTitle,
    windowLabel,
    bestPublishTime,
    primaryPlatform,
    secondaryPlatform,
    recommendedForm,
    durationSuggestion: "45-60 秒",
    wordCountSuggestion: "280-350 字",
    oneLineJudgement,
    tags: compact(
      [
        industry,
        result.platform[0],
        ...(topic?.tags ?? []),
        ...(result.commentInsight?.highFreqKeywords.map((item) => `#${item.replace(/^#/, "")}`) ?? []),
      ],
      5,
    ),
    score,
    scoreRows: [
      {
        label: "低粉可复制性",
        value: lowFollowerCount > 0 ? "高" : "待补",
        tone: lowFollowerCount > 0 ? "green" : "slate",
      },
      {
        label: "竞争强度",
        value: competitionScore == null ? "暂无" : competitionScore >= 70 ? "高" : competitionScore >= 45 ? "中" : "低",
        tone: competitionScore == null ? "slate" : competitionScore >= 70 ? "red" : competitionScore >= 45 ? "orange" : "green",
      },
      {
        label: "内容空档",
        value: contentGap == null ? "暂无" : contentGap >= 70 ? "明显" : contentGap >= 45 ? "中" : "低",
        tone: contentGap == null ? "slate" : contentGap >= 70 ? "green" : contentGap >= 45 ? "orange" : "slate",
      },
    ],
    suitableAccounts: accountTypes.suitable,
    unsuitableAccounts: accountTypes.unsuitable,
    expertJudgement:
      result.primaryCard.reason ||
      topic?.conclusion ||
      (score >= 85 ? "真实样本和评论需求都已出现，适合先做小样验证。" : "证据仍需补充，建议先小范围测试。"),
    todayTask: {
      topic: recommendedTitle,
      suitableAccounts: accountTypes.suitable,
      platform: `${primaryPlatform}优先，${secondaryPlatform}可改成图文实测笔记`,
      form: recommendedForm,
      openingHook,
      structure: contentStructure,
      publishingAdvice,
    },
    platformAdaptations: {
      douyin: {
        form: "45-60 秒口播 + 录屏测试",
        focus: "前 3 秒抛出强质疑，尽快让用户知道你会现场验证。",
        titleDirection: isAiTopic ? "我发现豆包真的会一本正经地编" : `我测试了「${recommendedTitle}」，结果有点意外`,
        commentGuide: isAiTopic ? "你们也遇到过 AI 胡说八道吗？" : "你也遇到过这种情况吗？评论区说一个你的案例。",
      },
      xiaohongshu: {
        form: "图文笔记 / 实测清单",
        focus: isAiTopic ? "把 3 个测试问题做成清单，方便收藏复测。" : "把步骤、清单和结果截图做成可收藏笔记。",
        titleDirection: isAiTopic ? "我用 3 个问题测试豆包，结果有点离谱" : `亲测「${recommendedTitle}」：这几个细节建议收藏`,
        collectGuide: isAiTopic ? "这 3 个测试问题建议收藏备用。" : "把这份步骤清单收藏起来，发布前照着检查。",
      },
    },
    visualization: {
      scoreBars: [
        { label: "机会指数", value: score, helper: "综合趋势、需求、竞争和可复制性", tone: "blue" },
        { label: "需求强度", value: clamp(demandScore ?? comments), helper: comments > 0 ? `${comments} 条评论进入需求判断` : "评论需求待补", tone: "green" },
        {
          label: "竞争压力",
          value: clamp(competitionScore ?? 0),
          helper: competitionScore == null ? "竞争数据待补" : competitionScore >= 70 ? "需要避开同质化表达" : "仍有差异化切口",
          tone: competitionScore != null && competitionScore >= 70 ? "orange" : "blue",
        },
        { label: "低粉机会", value: clamp(anomalyScore ?? lowFollowerCount * 25), helper: lowFollowerCount > 0 ? `${lowFollowerCount} 条低粉证据` : "低粉证据待补", tone: "green" },
      ],
      interactionMix: [
        { label: "点赞", value: interactionTotals.like, color: "#ef4444" },
        { label: "评论", value: interactionTotals.comment, color: "#2563eb" },
        { label: "收藏", value: interactionTotals.collect, color: "#059669" },
        { label: "分享", value: interactionTotals.share, color: "#f97316" },
      ],
      platformMix: Object.entries(platformCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([label, value], index) => ({
          label,
          value,
          percent: Math.round((value / platformTotal) * 100),
          tone: (index === 0 ? "blue" : index === 1 ? "green" : index === 2 ? "orange" : "slate") as Tone,
        })),
      evidenceStats: [
        { label: "真实样本", value: `${result.supportingContents.length} 条`, helper: "用于判断内容供给和切口拥挤度" },
        { label: "评论证据", value: comments > 0 ? `${comments} 条` : "待补", helper: "用于判断用户为什么愿意互动" },
        { label: "低粉样本", value: lowFollowerCount > 0 ? `${lowFollowerCount} 条` : "待补", helper: "用于判断普通账号是否能跟" },
      ],
    },
    signalCards: [
      {
        title: "趋势信号",
        metric: demandScore == null ? "暂无" : `+${demandScore}%`,
        detail:
          result.whyNowItems[0]?.fact ||
          (result.hotSeedCount ? `热词命中 ${result.hotSeedCount} 条` : "暂无真实趋势描述"),
        helper: result.marketEvidence.evidenceWindowLabel,
        icon: Zap,
        tone: "blue",
        chartValue: demandScore ?? result.marketEvidence.growth7d ?? 0,
      },
      {
        title: "需求信号",
        metric: comments > 0 ? `${comments} 条` : "暂无",
        detail:
          result.commentInsight?.aiSummary ||
          result.commentInsight?.demandSignals.slice(0, 2).join(" / ") ||
          "暂无评论需求数据",
        helper: result.commentInsight?.highFreqKeywords.slice(0, 3).join(" / "),
        icon: Target,
        tone: "blue",
        chartValue: comments > 0 ? Math.min(100, comments) : 0,
      },
      {
        title: "供给缺口",
        metric: result.supportingContents.length > 0 ? `${supplyGapPercent}%` : "暂无",
        detail:
          result.supportingContents.length > 0
            ? "从真实样本标题和结构里计算实操教程占比，用来判断是否存在内容空档。"
            : "暂无竞品内容样本",
        helper: `${result.supportingContents.length} 条真实内容样本`,
        icon: BarChart3,
        tone: "green",
        chartValue: supplyGapPercent,
      },
      {
        title: "低粉机会",
        metric: lowFollowerCount > 0 ? `${lowFollowerCount} 条` : "暂无",
        detail:
          lowFollowerCount > 0
            ? `最低粉丝样本 ${formatCount(Math.min(...result.lowFollowerEvidence.map((item) => item.fansCount || 0).filter(Boolean)))} 粉，已进入证据池。`
            : "暂无低粉样本",
        helper: result.lowFollowerEvidence[0]?.account,
        icon: ShieldCheck,
        tone: lowFollowerCount > 0 ? "blue" : "slate",
        chartValue: anomalyScore ?? lowFollowerCount * 25,
      },
    ],
    recommendedCut: {
      title: topic?.angle || topic?.title || result.primaryCard.title,
      bullets:
        recommendedBullets.length > 0
          ? recommendedBullets
          : ["真实样本存在，但本次结果没有给出更细的创作切口。"],
      forms: compact([topic?.tags?.[0]?.replace(/^#/, ""), topic?.tags?.[1]?.replace(/^#/, ""), "前后对比", "结果案例", "效率技巧"], 5),
    },
    notRecommendedCut: {
      title: result.secondaryCard.title || "不推荐切口",
      bullets:
        notRecommendedBullets.length > 0
          ? notRecommendedBullets
          : ["暂无明确反向证据，先避免泛资讯搬运和大号同质化表达。"],
      reasons:
        riskReasons.length > 0
          ? riskReasons
          : ["暂无额外风险说明。"],
    },
    accountFit: [
      {
        title: accountTypes.suitable[0] ?? "当前账号",
        status: "强适合",
        detail: result.accountMatchSummary || "已有真实内容样本支撑，可以先做小样验证。",
        tone: "green",
      },
      {
        title: accountTypes.suitable[1] ?? "垂类账号",
        status: "适合",
        detail: topic?.howToShoot || "适合把真实样本改成更具体的教程或清单。",
        tone: "green",
      },
      {
        title: "副业号",
        status: "适合",
        detail: "适合嫁接到提效、工具整理和工作流展示。",
        tone: "orange",
      },
      {
        title: "知识博主",
        status: "适合",
        detail: result.commentInsight?.demandSignals[0] || "适合用评论问题反推选题。",
        tone: "orange",
      },
      {
        title: accountTypes.unsuitable[0] ?? "不相关账号",
        status: "不建议直接投",
        detail: "缺少垂类素材时，可复制性会明显下降。",
        tone: "red",
      },
    ],
    competitiveCards: TOPIC_CATEGORY_RULES.map((rule, index) => {
      const percent = categoryShare(result, rule);
      const tone: Tone = index === 0 ? "green" : index === 1 ? "orange" : "blue";
      return {
        title: index === 0 ? "大号正在做：工具清单" : index === 1 ? "部分账号号在做：实操教程" : "机会方向：互动提问",
        description:
          percent > 0
            ? `真实样本中有 ${percent}% 命中「${rule.key}」表达。`
            : `本次真实样本暂未明显命中「${rule.key}」。`,
        shareLabel: `内容占比：${result.supportingContents.length > 0 ? `${percent}%` : "暂无"}`,
        competition:
          competitionScore == null ? "竞争度：暂无" : `竞争度：${competitionScore >= 70 ? "高" : competitionScore >= 45 ? "中" : "低"}`,
        tone,
        percent,
      };
    }),
    referenceSamples: result.supportingContents
      .slice()
      .sort((left, right) => getContentTotalInteractions(right) - getContentTotalInteractions(left))
      .slice(0, 4)
      .map((content, index) => ({
        id: content.contentId,
        title: content.title,
        authorName: content.authorName,
        platform: content.platform,
        coverUrl: getCoverProxyUrl(content.coverUrl),
        contentUrl: content.contentUrl,
        stats: `赞 ${formatCount(content.likeCount)} · 评 ${formatCount(content.commentCount)} · 藏 ${formatCount(content.collectCount)}`,
        learn: content.structureSummary || content.whyIncluded || "学习它的结构、场景切入和标题包装。",
        risk: index === 0 ? "不学它：避免原样复刻标题和表达。" : "不学它：避免只搬运工具名。",
        tag: index === 0 ? "最值得参考" : index === 1 ? "容易同质化" : index === 2 ? "适合中小号" : "追热点辅助",
      })),
  };
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "green":
      return {
        text: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        soft: "bg-emerald-100",
        bar: "bg-emerald-600",
      };
    case "orange":
      return {
        text: "text-orange-700",
        bg: "bg-orange-50",
        border: "border-orange-200",
        soft: "bg-orange-100",
        bar: "bg-orange-500",
      };
    case "red":
      return {
        text: "text-red-700",
        bg: "bg-red-50",
        border: "border-red-200",
        soft: "bg-red-100",
        bar: "bg-red-500",
      };
    case "blue":
      return {
        text: "text-blue-700",
        bg: "bg-blue-50",
        border: "border-blue-200",
        soft: "bg-blue-100",
        bar: "bg-blue-600",
      };
    default:
      return {
        text: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
        soft: "bg-slate-100",
        bar: "bg-slate-400",
      };
  }
}

function usePublishCountdown(createdAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) {
    return { hours: "--", minutes: "--", seconds: "--", expired: false, helper: "建议在真实发布时间窗口内发布" };
  }
  const deadline = start + 48 * 60 * 60 * 1000;
  const remaining = Math.max(0, deadline - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
    expired: remaining <= 0,
    helper: remaining <= 0 ? "建议复查数据后再发布" : "建议在 24-48 小时内发布",
  };
}

function AppSidebar() {
  return (
    <aside className="hidden min-h-screen w-44 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#122a57] text-white">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-semibold text-[#142347]">爆款预测agent</span>
      </div>
      <nav className="flex-1 px-3 py-5">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.label} item={item} />
          ))}
        </div>
        <div className="my-5 h-px bg-slate-200" />
        <div className="space-y-1">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.label} item={item} />
          ))}
        </div>
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <button className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f2d62] text-white" type="button">
            <Plus className="h-4 w-4" />
          </button>
          <p className="text-xs font-medium text-slate-700">剩余次数</p>
          <p className="mt-1 text-[11px] text-slate-400">今日 8/10 次</p>
          <Link
            to="/credits"
            className="mt-3 flex h-8 items-center justify-center rounded-md bg-blue-50 text-xs font-semibold text-blue-700"
          >
            升级套餐
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between px-1">
          <Link className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" to="/settings">
            <Settings className="h-4 w-4" />
          </Link>
          <button className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" type="button">
            <Headphones className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavItem({
  item,
}: {
  item: {
    label: string;
    icon: ComponentType<{ className?: string }>;
    to: string;
    active?: boolean;
    badge?: string;
  };
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition ${
        item.active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function TopHeader() {
  const { state } = useAppStore();
  const { user } = useAuth({ mode: "modal" });
  const selectedModel = getModelOption(state.selectedModel);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-5">
      <div className="flex items-center gap-2">
        <div className="lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#122a57] text-white">
            <ShieldCheck className="h-4 w-4" />
          </span>
        </div>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-full bg-slate-50 px-4 text-[13px] font-medium text-[#18264b]"
        >
          {selectedModel.name}
          <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
        </button>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50">
          <Bell className="h-4 w-4" />
        </button>
        <Link
          to="/credits"
          className="flex h-8 items-center gap-1.5 rounded-full bg-slate-50 px-3 text-[13px] font-medium text-[#18264b]"
        >
          <Coins className="h-4 w-4 text-orange-500" />
          {state.credits}
        </Link>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#087a53] text-xs font-semibold text-white"
        >
          {getInitial(user?.name)}
        </button>
      </div>
    </header>
  );
}

function SectionTitle({ index, children, muted }: { index: number; children: ReactNode; muted?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
        {index}
      </span>
      <h2 className="text-[15px] font-semibold text-[#18264b]">{children}</h2>
      {muted && <span className="text-xs text-slate-400">{muted}</span>}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const arcLength = 188;
  const dash = Math.max(0, Math.min(arcLength, (score / 100) * arcLength));
  return (
    <div className="relative mx-auto h-[92px] w-[170px]">
      <svg className="h-full w-full" viewBox="0 0 170 92" aria-hidden="true">
        <path d="M25 78 A60 60 0 0 1 145 78" fill="none" stroke="#e8eefb" strokeLinecap="round" strokeWidth="13" />
        <path
          d="M25 78 A60 60 0 0 1 145 78"
          fill="none"
          stroke="#3568f4"
          strokeDasharray={`${dash} ${arcLength}`}
          strokeLinecap="round"
          strokeWidth="13"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="text-4xl font-semibold tracking-normal text-[#162449]">{score}</span>
        <span className="ml-1 text-sm text-slate-500">/100</span>
      </div>
    </div>
  );
}

function CountdownCard({ result }: { result: ResultRecord }) {
  const countdown = usePublishCountdown(result.createdAt);
  return (
    <Card className="flex min-h-[162px] flex-col items-center justify-center p-5 text-center">
      <div className="text-[13px] font-semibold text-[#18264b]">最佳发布时间倒计时</div>
      <div className="mt-6 flex items-end justify-center gap-2 font-mono tabular-nums text-[38px] font-semibold leading-none text-orange-600">
        <span>{countdown.hours}</span>
        <span className="pb-1 text-2xl">:</span>
        <span>{countdown.minutes}</span>
        <span className="pb-1 text-2xl">:</span>
        <span>{countdown.seconds}</span>
      </div>
      <div className="mt-2 grid w-full grid-cols-3 text-[10px] text-orange-500">
        <span>小时</span>
        <span>分钟</span>
        <span>秒</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{countdown.helper}</p>
    </Card>
  );
}

function HeroSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/history" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
          <ChevronLeft className="h-4 w-4" />
          返回话题列表
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>预测时间：{vm.predictedAt}</span>
          <Link to={`/results/${vm.id}`} className="inline-flex items-center gap-1 font-semibold text-blue-600">
            查看数据详情
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              爆款机会已确认
            </div>
            <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-normal text-[#111b3d] sm:text-[30px]">
              建议立刻做：
              <span className="block text-[#0f2d62]">《{vm.recommendedTitle}》</span>
            </h1>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[#223154]">
              {vm.oneLineJudgement}
            </p>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-500">
              不建议做泛泛介绍，优先做可验证、可讨论、能让用户马上评论或收藏的内容。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: "机会等级", value: vm.opportunityLevel, tone: "text-emerald-700 bg-emerald-50 border-emerald-100" },
              { label: "价值窗口", value: `剩余 ${vm.windowLabel}`, tone: "text-orange-700 bg-orange-50 border-orange-100" },
              { label: "最佳发布时间", value: vm.bestPublishTime, tone: "text-blue-700 bg-blue-50 border-blue-100" },
              { label: "推荐平台", value: `${vm.primaryPlatform}优先`, tone: "text-slate-700 bg-slate-50 border-slate-100" },
              { label: "推荐形式", value: vm.recommendedForm, tone: "text-slate-700 bg-slate-50 border-slate-100" },
              { label: "同步平台", value: `${vm.secondaryPlatform}可复用`, tone: "text-slate-700 bg-slate-50 border-slate-100" },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.tone}`}>
                <div className="text-[11px] opacity-75">{item.label}</div>
                <div className="mt-1 line-clamp-1 text-sm font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <Card className="flex min-h-[220px] flex-col justify-between p-5">
          <div className="text-[13px] font-semibold text-[#18264b]">爆款指数</div>
          <ScoreGauge score={vm.score} />
          <div className="mt-4 space-y-3">
            {vm.scoreRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="flex items-center gap-2 text-[#34415f]">
                  <BarChart3 className="h-3.5 w-3.5 text-[#4d5d7c]" />
                  {row.label}
                </span>
                <span className={`font-semibold ${toneClasses(row.tone).text}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-[13px] leading-6 text-[#554021]">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-400 text-white">
          <Star className="h-3.5 w-3.5" />
        </span>
        <strong>一句话判断：</strong>
        {vm.expertJudgement}
      </div>
    </Card>
  );
}

function FitSummaryCard({ title, items, positive = false }: { title: string; items: string[]; positive?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${positive ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"}`}>
      <div className={`mb-2 flex items-center justify-between text-sm font-semibold ${positive ? "text-emerald-700" : "text-red-600"}`}>
        {title}
        {positive ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white">
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="text-[13px] leading-6 text-[#223154]">{items.join(" / ") || "暂无真实账号信息"}</p>
    </div>
  );
}

function TodayTaskSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={1}>今日创作任务</SectionTitle>
      <Card className="p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-blue-600">选题</div>
            <h2 className="mt-2 text-xl font-semibold leading-snug tracking-normal text-[#111b3d]">
              {vm.todayTask.topic}
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                { label: "推荐平台", value: vm.todayTask.platform },
                { label: "内容形式", value: vm.todayTask.form },
                { label: "开头 3 秒", value: vm.todayTask.openingHook },
                { label: "发布建议", value: vm.todayTask.publishingAdvice },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold text-slate-400">{item.label}</div>
                  <p className="mt-1 text-[13px] leading-6 text-[#223154]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-emerald-700">适合账号</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {vm.todayTask.suitableAccounts.map((item) => (
                <span key={item} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-emerald-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="mb-3 text-sm font-semibold text-blue-700">内容结构</div>
          <div className="grid gap-2">
            {vm.todayTask.structure.map((item, index) => (
              <div key={item} className="flex gap-3 text-[13px] leading-6 text-[#223154]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

function PlatformAdaptationSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={2}>抖音 / 小红书分别怎么做</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-blue-100 bg-blue-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Video className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-blue-800">抖音版本</h3>
              <p className="text-xs text-blue-500">更重前 3 秒、评论争议和转发扩散</p>
            </div>
          </div>
          <PlatformPlanRows
            rows={[
              ["形式", vm.platformAdaptations.douyin.form],
              ["重点", vm.platformAdaptations.douyin.focus],
              ["标题方向", vm.platformAdaptations.douyin.titleDirection],
              ["评论引导", vm.platformAdaptations.douyin.commentGuide],
            ]}
          />
        </Card>
        <Card className="border-rose-100 bg-rose-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white">
              <PenLine className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold text-rose-700">小红书版本</h3>
              <p className="text-xs text-rose-500">更重封面点击、收藏价值和经验分享</p>
            </div>
          </div>
          <PlatformPlanRows
            rows={[
              ["形式", vm.platformAdaptations.xiaohongshu.form],
              ["重点", vm.platformAdaptations.xiaohongshu.focus],
              ["标题方向", vm.platformAdaptations.xiaohongshu.titleDirection],
              ["收藏引导", vm.platformAdaptations.xiaohongshu.collectGuide],
            ]}
          />
        </Card>
      </div>
    </section>
  );
}

function PlatformPlanRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-white/80 px-3 py-2">
          <div className="text-[11px] font-semibold text-slate-400">{label}</div>
          <p className="mt-1 text-[13px] leading-6 text-[#223154]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function VisualizationSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  const interactionTotal = vm.visualization.interactionMix.reduce((sum, item) => sum + item.value, 0);
  const maxInteraction = Math.max(1, ...vm.visualization.interactionMix.map((item) => item.value));

  return (
    <section>
      <SectionTitle index={3}>机会信号可视化</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-[#18264b]">决策信号强弱</h3>
              <p className="mt-1 text-xs text-slate-400">来自本次返回的评分、评论和低粉样本字段。</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {vm.score} 分
            </span>
          </div>
          <div className="space-y-4">
            {vm.visualization.scoreBars.map((item) => {
              const tone = toneClasses(item.tone);
              return (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-[#223154]">{item.label}</span>
                    <span className={tone.text}>{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${clamp(item.value)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-400">{item.helper}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-4">
            <h3 className="text-[15px] font-semibold text-[#18264b]">互动信号构成</h3>
            <p className="mt-1 text-xs text-slate-400">
              {interactionTotal > 0 ? `总互动 ${formatCount(interactionTotal)}` : "本次样本未返回完整互动字段"}
            </p>
            <div className="mt-4 space-y-3">
              {vm.visualization.interactionMix.map((item) => {
                const percent = interactionTotal > 0 ? Math.round((item.value / interactionTotal) * 100) : 0;
                const width = interactionTotal > 0 ? percent : Math.round((item.value / maxInteraction) * 100);
                return (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[#223154]">{item.label}</span>
                      <span className="font-semibold text-slate-500">{formatCount(item.value)}{interactionTotal > 0 ? ` · ${percent}%` : ""}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-[15px] font-semibold text-[#18264b]">证据覆盖</h3>
            <div className="mt-3 grid gap-2">
              {vm.visualization.evidenceStats.map((item) => (
                <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className="text-sm font-semibold text-[#18264b]">{item.value}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.helper}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {vm.visualization.platformMix.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-[#18264b]">平台样本分布</h3>
            <span className="text-xs text-slate-400">用于判断首发和复用平台</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {vm.visualization.platformMix.map((item) => {
              const tone = toneClasses(item.tone);
              return (
                <div key={item.label} className={`rounded-lg border p-3 ${tone.bg} ${tone.border}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className={`font-semibold ${tone.text}`}>{item.label}</span>
                    <span className="text-xs text-slate-500">{item.value} 条</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${item.percent}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">占比 {item.percent}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </section>
  );
}

function SignalCards({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={4}>为什么这个机会值得跟？</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {vm.signalCards.map((card) => {
          const Icon = card.icon;
          const tone = toneClasses(card.tone);
          return (
            <Card key={card.title} className="p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold text-[#18264b]">{card.title}</h3>
              </div>
              <div className="mt-4 text-[13px] text-slate-500">{card.detail}</div>
              <div className={`mt-2 text-[20px] font-semibold tracking-normal ${tone.text}`}>{card.metric}</div>
              <div className="mt-4 h-14">
                <MiniTrendLine value={card.chartValue} tone={card.tone} />
              </div>
              {card.helper && (
                <div className="mt-3 inline-flex max-w-full rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                  <span className="truncate">{card.helper}</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function MiniTrendLine({ value, tone }: { value: number; tone: Tone }) {
  const color = tone === "red" ? "#ef4444" : tone === "orange" ? "#f97316" : tone === "green" ? "#059669" : "#3169ff";
  const v = clamp(value);
  const points = [
    [2, 46],
    [22, 41],
    [42, 43],
    [62, 36],
    [82, 39],
    [102, 30],
    [122, 22],
    [142, 26],
    [160, 12 + (100 - v) * 0.1],
  ];
  return (
    <svg viewBox="0 0 164 54" className="h-full w-full" aria-hidden="true">
      <polyline fill="none" points={points.map((point) => point.join(",")).join(" ")} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {points.slice(-3).map((point) => (
        <circle key={point.join("-")} cx={point[0]} cy={point[1]} fill={color} r="2.5" />
      ))}
    </svg>
  );
}

function CutSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={5}>推荐创作切口</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-emerald-100 bg-emerald-50 p-4">
          <div className="text-[15px] font-semibold text-emerald-700">推荐切口：{vm.recommendedCut.title}</div>
          <div className="mt-4 grid gap-2">
            {vm.recommendedCut.bullets.map((item) => (
              <div key={item} className="flex gap-2 text-[13px] leading-6 text-[#223154]">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {vm.recommendedCut.forms.map((item) => (
              <span key={item} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-700">
                {item}
              </span>
            ))}
          </div>
        </Card>
        <Card className="border-red-100 bg-red-50 p-4">
          <div className="text-[15px] font-semibold text-red-600">不推荐切口（容易被大号碾压）</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
            <div className="space-y-2">
              {vm.notRecommendedCut.bullets.map((item) => (
                <div key={item} className="flex gap-2 text-[13px] leading-6 text-[#223154]">
                  <X className="mt-1 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-white/75 p-3 text-[12px] leading-6 text-[#223154]">
              <div className="mb-1 font-semibold">不推荐的原因</div>
              {vm.notRecommendedCut.reasons.slice(0, 4).map((item) => (
                <p key={item}>· {item}</p>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function AccountFitSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={6}>你的账号适配度参考</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {vm.accountFit.map((item) => {
          const tone = toneClasses(item.tone);
          return (
            <Card key={item.title} className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CircleUserRound className={`h-4 w-4 ${tone.text}`} />
                  <h3 className="text-sm font-semibold text-[#18264b]">{item.title}</h3>
                </div>
                <span className={`rounded-full ${tone.bg} px-2 py-0.5 text-[11px] font-semibold ${tone.text}`}>
                  {item.status}
                </span>
              </div>
              <p className="line-clamp-3 text-xs leading-5 text-slate-500">{item.detail}</p>
            </Card>
          );
        })}
      </div>
      <Card className="mt-3 flex flex-col gap-2 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>如果你不确定自己的账号定位，可在「账号管理」中完善信息，获取更精准建议。</span>
        <Link to="/connectors" className="inline-flex items-center gap-1 font-semibold text-blue-600">
          去设置账号信息
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Card>
    </section>
  );
}

function CompetitiveSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={7} muted="（系统已扫描真实内容样本）">
        竞品内容现状
      </SectionTitle>
      <div className="grid gap-4 xl:grid-cols-3">
        {vm.competitiveCards.map((card) => {
          const tone = toneClasses(card.tone);
          return (
            <Card key={card.title} className={`p-4 ${tone.bg} ${tone.border}`}>
              <h3 className={`text-[15px] font-semibold ${tone.text}`}>{card.title}</h3>
              <p className="mt-2 min-h-12 text-[13px] leading-6 text-[#223154]">{card.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-[#223154]">
                <span>{card.shareLabel}</span>
                <span>{card.competition}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${card.percent}%` }} />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ReferenceSamplesSection({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <section>
      <SectionTitle index={8} muted={`（共 ${vm.referenceSamples.length} 条展示样本）`}>
        代表性参考条件
      </SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {vm.referenceSamples.length > 0 ? (
          vm.referenceSamples.map((sample) => <ReferenceSampleCard key={sample.id} sample={sample} />)
        ) : (
          <Card className="p-4 text-sm text-slate-500 xl:col-span-4">暂无真实参考样本。</Card>
        )}
      </div>
      {vm.referenceSamples.length > 0 && (
        <Link to={`/results/${vm.id}`} className="mx-auto mt-4 flex w-fit items-center gap-1 text-sm font-semibold text-blue-600">
          查看更多参考视频
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

function ReferenceSampleCard({ sample }: { sample: AgentPredictionResultViewModel["referenceSamples"][number] }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = sample.coverUrl && !failed;
  const body = (
    <Card className="h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <div className="relative bg-slate-100">
        <div className="relative aspect-[9/16] max-h-[320px] w-full overflow-hidden bg-slate-100">
          {image ? (
            <>
              {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200" />}
              <img
                src={sample.coverUrl ?? ""}
                alt=""
                loading="lazy"
                className={`absolute inset-0 h-full w-full object-cover transition duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4 text-center">
              <ImageOff className="h-6 w-6 text-slate-300" />
              <p className="mt-3 line-clamp-4 text-sm font-semibold leading-6 text-[#18264b]">{sample.title}</p>
            </div>
          )}
        </div>
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-16px)] flex-wrap gap-1.5">
          <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm">
            {sample.tag}
          </span>
          <span className="rounded-md bg-slate-900/75 px-2 py-1 text-[11px] font-semibold text-white">
            {sample.platform}
          </span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-5 text-[#18264b]">{sample.title}</h3>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate text-slate-400">@{sample.authorName || "未知作者"}</span>
          <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-slate-500">{sample.stats}</span>
        </div>
      </div>
      <div className="border-t border-slate-100 px-3 pb-3 pt-2 text-[12px] leading-5">
        <p className="line-clamp-2 text-emerald-700">学它的：{sample.learn}</p>
        <p className="mt-1 line-clamp-2 text-red-500">{sample.risk}</p>
      </div>
    </Card>
  );
  if (!sample.contentUrl) return body;
  return (
    <a href={sample.contentUrl} target="_blank" rel="noreferrer" className="block h-full">
      {body}
    </a>
  );
}

function buildCreationPrompt(action: string, vm: AgentPredictionResultViewModel) {
  return `${action}：${vm.recommendedTitle}。平台：${vm.primaryPlatform}优先，${vm.secondaryPlatform}复用。形式：${vm.recommendedForm}。请基于这个爆款预测结果直接生成可发布内容。`;
}

function ActionRail({ vm }: { vm: AgentPredictionResultViewModel }) {
  const actions = [
    { label: "生成短视频脚本", icon: Video, prompt: buildCreationPrompt("生成短视频脚本", vm), primary: true },
    { label: "生成小红书图文", icon: PenLine, prompt: buildCreationPrompt("生成小红书图文笔记", vm) },
    { label: "生成 10 个标题", icon: FileText, prompt: buildCreationPrompt("生成 10 个标题", vm) },
    { label: "生成封面文案", icon: Sparkles, prompt: buildCreationPrompt("生成封面文案", vm) },
  ];

  return (
    <aside className="hidden lg:block">
      <Card className="sticky top-[72px] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#18264b]">行动面板</div>
            <p className="mt-1 text-xs text-slate-400">读到任何位置都能继续创作。</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {vm.opportunityLevel}
          </span>
        </div>
        <div className="rounded-lg bg-[#0f2d62] p-4 text-white">
          <div className="text-xs opacity-75">爆款指数</div>
          <div className="mt-1 flex items-end gap-1">
            <span className="text-4xl font-semibold tracking-normal">{vm.score}</span>
            <span className="pb-1 text-sm opacity-70">/100</span>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-xs">
          {[
            ["窗口期", vm.windowLabel],
            ["首发平台", vm.primaryPlatform],
            ["同步平台", vm.secondaryPlatform],
            ["最佳发布时间", vm.bestPublishTime],
            ["建议时长", vm.durationSuggestion],
            ["建议字数", vm.wordCountSuggestion],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
              <span className="text-slate-400">{label}</span>
              <span className="text-right font-semibold text-[#223154]">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                to={`/predict?deepPrompt=${encodeURIComponent(action.prompt)}`}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
                  action.primary ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-50 text-[#18264b] hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(vm.recommendedTitle)}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-[#18264b] transition hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" />
            复制选题
          </button>
        </div>
      </Card>
    </aside>
  );
}

function MobileStickyActionBar({ vm }: { vm: AgentPredictionResultViewModel }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <Link
        to={`/predict?deepPrompt=${encodeURIComponent(buildCreationPrompt("生成短视频脚本", vm))}`}
        className="flex h-11 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white"
      >
        {vm.score}分{vm.opportunityLevel}｜{vm.windowLabel}窗口｜生成脚本
      </Link>
    </div>
  );
}

function ResultContent({ result }: { result: ResultRecord }) {
  const vm = useMemo(() => buildViewModel(result), [result]);
  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-5 sm:px-5 lg:pb-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_304px]">
        <main className="min-w-0 space-y-6">
          <HeroSection vm={vm} />
          <TodayTaskSection vm={vm} />
          <PlatformAdaptationSection vm={vm} />
          <VisualizationSection vm={vm} />
          <SignalCards vm={vm} />
          <CutSection vm={vm} />
          <AccountFitSection vm={vm} />
          <CompetitiveSection vm={vm} />
          <ReferenceSamplesSection vm={vm} />
        </main>
        <ActionRail vm={vm} />
      </div>
      <MobileStickyActionBar vm={vm} />
    </div>
  );
}

function LoadingState() {
  const stages = ["恢复预测结果", "整理创作任务", "生成可视化证据"];
  const [stageIndex, setStageIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % stages.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [stages.length]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-700">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
        </span>
        {stages[stageIndex]}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_304px]">
        <main className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <div className="h-7 w-44 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-10 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="h-5 w-32 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 space-y-2">
                  <div className="h-12 animate-pulse rounded bg-slate-100" />
                  <div className="h-12 animate-pulse rounded bg-slate-100" />
                  <div className="h-12 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-36 animate-pulse rounded bg-slate-100" />
            <div className="mt-5 grid gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          </div>
        </main>
        <aside className="hidden lg:block">
          <div className="sticky top-[72px] rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-24 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-8 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <FileText className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-[#18264b]">没有找到可展示的真实预测结果</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
      <button
        type="button"
        onClick={() => navigate("/predict")}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#162449] px-4 py-2 text-sm font-semibold text-white"
      >
        去运行一次预测
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

async function fetchFirstRealPrediction(items: SavedResultArtifactSummary[]) {
  for (const item of items) {
    const detail = await fetchResultArtifact(item.artifactId);
    const result = normalizeRemoteResult(detail.item);
    if (hasRealPredictionEvidence(result)) return result;
  }
  return null;
}

export function PredictionAgentResultsPage() {
  const { id } = useParams<{ id?: string }>();
  const [result, setResult] = useState<ResultRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResult(null);

    const load = async () => {
      if (id) {
        const detail = await fetchResultArtifact(id);
        return normalizeRemoteResult(detail.item);
      }
      const payload = await fetchResultArtifacts();
      return fetchFirstRealPrediction(payload.items);
    };

    void load()
      .then((nextResult) => {
        if (!active) return;
        setResult(nextResult);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "结果恢复失败。");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#18264b] lg:grid lg:grid-cols-[176px_minmax(0,1fr)]">
      <AppSidebar />
      <div className="min-w-0">
        <TopHeader />
        {loading ? (
          <LoadingState />
        ) : result ? (
          <ResultContent result={result} />
        ) : (
          <EmptyState message={error ?? "当前 artifact 列表里没有包含趋势机会、AI 选题建议或真实内容样本的结果。"} />
        )}
      </div>
    </div>
  );
}
