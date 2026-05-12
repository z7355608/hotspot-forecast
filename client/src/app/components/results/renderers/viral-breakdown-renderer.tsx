import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Check,
  Copy,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Flame,
  MessageCircle,
  Play,
  Scissors,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type { ResultRecord } from "../../../store/app-data";
import type {
  PredictionSupportingContent,
  ViralBreakdownTaskPayload,
} from "../../../store/prediction-types";
import {
  InAppVideoPlayerModal,
  type InAppVideoSource,
} from "../../InAppVideoPlayerModal";
import {
  registerArtifactRenderer,
  type ArtifactRendererProps,
  type CtaActionConfig,
  type DeepDiveConfig,
  type FollowUpAction,
  type HeroMetricCard,
} from "../artifact-registry";

type Tone = "emerald" | "blue" | "amber" | "violet" | "rose" | "gray";

interface BreakdownVideoInfo {
  coverUrl?: string | null;
  sourceUrl?: string;
  title?: string;
  platform?: string;
  publishTime?: string;
  duration?: string;
  likeCount?: string;
  commentCount?: string;
  shareCount?: string;
  completionRate?: string;
  interactionRate?: string;
}

interface TimelineSegment {
  time?: string;
  title?: string;
  frameUrl?: string | null;
  subtitle?: string;
  role?: string;
  userMindset?: string;
  visualSummary?: string;
  subtitleSummary?: string;
  narrationSummary?: string;
  userPsychology: string[];
  viralFunction?: string;
  copyMethod?: string;
}

interface CopyPlan {
  id: string;
  label: string;
  accountType?: string;
  title?: string;
  hook?: string;
  shortScript?: string;
  outline: string[];
  shots: string[];
  coverText?: string;
  commentGuide?: string;
}

interface GeneratedScriptResult {
  title?: string;
  openingHook?: string;
  fullVoiceoverScript?: string;
  storyboard: string[];
  shotList: string[];
  coverText?: string;
  commentGuide?: string;
  coverImagePrompt?: string;
  coverImageUrl?: string | null;
  coverImageB64?: string | null;
  coverImageError?: string;
  model?: string;
}

type RewriteStyle = "conversational" | "xiaohongshu" | "douyin";

interface RewrittenScriptResult {
  planId?: string;
  style: RewriteStyle;
  styleLabel: string;
  title?: string;
  openingHook?: string;
  shortScript: string;
  styleNotes: string[];
  model?: string;
}

interface CopyDecision {
  score?: number;
  level?: string;
  suggestion?: string;
  priority?: string;
  keep: string[];
  replace: string[];
  suitableAccounts: string[];
  unsuitableAccounts: string[];
}

interface FormulaDetail {
  original?: string[];
  reusable?: string[];
  explanation?: string;
}

interface EmotionStage {
  stage: string;
  time: string;
  emotion: string;
  videoAction: string;
  copyAdvice: string;
}

interface WorkspaceData {
  videoInfo: BreakdownVideoInfo;
  copyScore?: number;
  copyLevel?: "高" | "中" | "低";
  breakdownValue?: "高" | "中" | "低";
  imitationAdvice?: string;
  copyDecision?: CopyDecision;
  coreConclusion?: string;
  recommendedCopyPoints: string[];
  notRecommendedPoints: string[];
  suitableAccounts: string[];
  unsuitableAccounts: string[];
  suitablePlatforms: string[];
  timelineAnalysis: TimelineSegment[];
  viralFormula: string[];
  viralFormulaDetail?: FormulaDetail;
  formulaSummary?: string;
  copyPlans: CopyPlan[];
  emotionCurve: Array<{
    emotion: string;
    time: string;
    videoMove: string;
    copyAdvice: string;
  }>;
  emotionStages: EmotionStage[];
  audienceMotivation: string[];
  interactionAnalysis: Array<{
    label: string;
    value: string;
    detail: string;
    tone: Tone;
  }>;
  algorithmFriendlyScore: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  avoidPitfalls: string[];
  corePlay?: string;
}

function hasText(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanText(value?: string | null) {
  return hasText(value) ? value.trim() : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function cleanUnknownText(value: unknown) {
  if (typeof value === "string") return cleanText(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstUnknownText(...values: unknown[]) {
  return values.map(value => cleanUnknownText(value)).find(Boolean);
}

function formatInsightItem(value: unknown) {
  const text = cleanUnknownText(value);
  if (text) return text;
  const record = toRecord(value);
  if (!record) return undefined;
  const title = firstUnknownText(record.title, record.name, record.label);
  const details = [
    firstUnknownText(record.description, record.detail),
    firstUnknownText(record.action),
    firstUnknownText(record.reason),
    firstUnknownText(record.trigger),
  ].filter(Boolean);
  if (!title) return details.join("；") || undefined;
  return details.length > 0 ? `${title}：${details.join("；")}` : title;
}

function compactTextList(value?: unknown[] | null) {
  return (value ?? []).map(item => formatInsightItem(item)).filter(Boolean) as string[];
}

function firstText(...values: Array<string | null | undefined>) {
  return values.map(value => cleanText(value)).find(Boolean);
}

function readStringList(record: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) return compactTextList(value);
  }
  return [];
}

function normalizeTone(value: unknown): Tone {
  return value === "emerald" ||
    value === "blue" ||
    value === "amber" ||
    value === "violet" ||
    value === "rose" ||
    value === "gray"
    ? value
    : "blue";
}

function scoreLevelFromScore(score?: number) {
  if (score == null) return undefined;
  if (score >= 80) return "高价值可复制";
  if (score >= 60) return "值得参考，需要改编";
  if (score >= 40) return "谨慎模仿";
  return "不建议直接复制";
}

function buildSuggestionFromPoints(keep: string[], replace: string[]) {
  if (keep.length === 0 && replace.length === 0) return undefined;
  const keepText = keep.slice(0, 2).join(" + ");
  const replaceText = replace.slice(0, 2).join(" + ");
  if (keepText && replaceText) {
    return `建议优先保留「${keepText}」，同时替换或避开「${replaceText}」。`;
  }
  if (keepText) return `建议优先保留「${keepText}」。`;
  return `建议重点避开或替换「${replaceText}」。`;
}

function formatCount(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "--";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return value.toLocaleString();
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRealScore(
  result: ResultRecord,
  payload: ViralBreakdownTaskPayload
) {
  const decisionRecord = toRecord((payload as unknown as Record<string, unknown>).copyDecision);
  const value =
    payload.copyScore ??
    (typeof decisionRecord?.score === "number" ? decisionRecord.score : undefined) ??
    payload.overallScore ??
    result.score;
  return typeof value === "number" && Number.isFinite(value)
    ? clampScore(value)
    : undefined;
}

function normalizeConclusion(payload: ViralBreakdownTaskPayload) {
  const source = firstText(
    payload.coreConclusion,
    payload.oneLinerComment,
    payload.breakdownSummary
  );
  if (!source) return undefined;
  return source
    .replace(/^该视频通过/, "这条视频的核心打法是")
    .replace(/^本视频通过/, "这条视频的核心打法是")
    .replace(/^该视频利用/, "这条视频真正利用的是");
}

function normalizeCopyDecision(
  payload: ViralBreakdownTaskPayload,
  copyScore?: number
): CopyDecision | undefined {
  const payloadRecord = payload as unknown as Record<string, unknown>;
  const decisionRecord = toRecord(payloadRecord.copyDecision);
  const keep = compactTextList(
    readStringList(decisionRecord, ["keepPoints", "keep"]).length
      ? readStringList(decisionRecord, ["keepPoints", "keep"])
      : ((payload.recommendedCopyPoints ?? payload.copyPoints) as unknown[])
  );
  const replace = compactTextList(
    readStringList(decisionRecord, ["replacePoints", "replace"]).length
      ? readStringList(decisionRecord, ["replacePoints", "replace"])
      : ((payload.notRecommendedPoints ?? payload.avoidPoints) as unknown[])
  );
  const suitableAccounts = compactTextList(
    readStringList(decisionRecord, ["suitableAccounts"]).length
      ? readStringList(decisionRecord, ["suitableAccounts"])
      : payload.suitableAccounts
  );
  const unsuitableAccounts = compactTextList(
    readStringList(decisionRecord, ["unsuitableAccounts"]).length
      ? readStringList(decisionRecord, ["unsuitableAccounts"])
      : payload.unsuitableAccounts
  );
  const decisionScore =
    typeof decisionRecord?.score === "number" ? clampScore(decisionRecord.score) : copyScore;
  const decision: CopyDecision = {
    score: decisionScore,
    level: firstUnknownText(decisionRecord?.level, payload.copyLevel) ?? scoreLevelFromScore(decisionScore),
    suggestion:
      firstUnknownText(decisionRecord?.suggestion, payload.imitationAdvice) ??
      buildSuggestionFromPoints(keep, replace),
    priority: firstUnknownText(decisionRecord?.priority),
    keep,
    replace,
    suitableAccounts,
    unsuitableAccounts,
  };
  const hasDecision =
    decision.score != null ||
    hasText(decision.level) ||
    hasText(decision.suggestion) ||
    hasText(decision.priority) ||
    keep.length > 0 ||
    replace.length > 0 ||
    suitableAccounts.length > 0 ||
    unsuitableAccounts.length > 0;
  return hasDecision ? decision : undefined;
}

function normalizeTimelineSegments(
  payload: ViralBreakdownTaskPayload
): TimelineSegment[] {
  return ((payload.timelineAnalysis ?? []) as unknown[])
    .map(rawSegment => {
      const segment = toRecord(rawSegment) ?? {};
      return {
        time: firstUnknownText(segment.timeRange, segment.time),
        title: firstUnknownText(segment.stage, segment.title),
        frameUrl:
          firstUnknownText(
            segment.frameUrl,
            segment.keyframeUrl,
            segment.screenshotUrl
          ) ?? null,
        subtitle: cleanUnknownText(segment.subtitle),
        role: cleanUnknownText(segment.role),
        userMindset: cleanUnknownText(segment.userMindset),
        visualSummary: cleanUnknownText(segment.visualSummary),
        subtitleSummary: firstUnknownText(segment.subtitleSummary, segment.subtitle),
        narrationSummary: cleanUnknownText(segment.narrationSummary),
        userPsychology: Array.isArray(segment.userPsychology)
          ? compactTextList(segment.userPsychology)
          : compactTextList([segment.userMindset]),
        viralFunction: firstUnknownText(segment.viralFunction, segment.role),
        copyMethod: cleanUnknownText(segment.copyMethod),
      };
    })
    .filter(segment =>
      Boolean(
        segment.time ||
          segment.title ||
          segment.frameUrl ||
          segment.visualSummary ||
          segment.subtitleSummary ||
          segment.narrationSummary ||
          segment.viralFunction ||
          segment.copyMethod
      )
    );
}

function normalizeCopyPlans(payload: ViralBreakdownTaskPayload): CopyPlan[] {
  const directPlans = ((payload.copyPlans ?? []) as unknown[])
    .map((rawPlan, index) => {
      const plan = toRecord(rawPlan) ?? {};
      const label = firstUnknownText(plan.name, plan.label) ?? `方案 ${index + 1}`;
      return {
        id: firstUnknownText(plan.id, plan.name, plan.label) ?? `plan-${index}`,
        label,
        accountType: firstUnknownText(plan.suitableAccount, plan.accountType),
        title: cleanUnknownText(plan.title),
        hook: firstUnknownText(plan.openingHook, plan.hook),
        shortScript: cleanUnknownText(plan.shortScript),
        outline: Array.isArray(plan.outline) ? compactTextList(plan.outline) : [],
        shots: Array.isArray(plan.storyboard)
          ? compactTextList(plan.storyboard)
          : Array.isArray(plan.shots)
            ? compactTextList(plan.shots)
            : [],
        coverText: cleanUnknownText(plan.coverText),
        commentGuide: cleanUnknownText(plan.commentGuide),
      };
    })
    .filter(plan =>
      Boolean(
        plan.title ||
          plan.hook ||
          plan.shortScript ||
          plan.outline.length ||
          plan.shots.length ||
          plan.coverText ||
          plan.commentGuide
      )
    );

  if (directPlans.length > 0) return directPlans;

  const outline = compactTextList(
    payload.migrationSteps?.length
      ? payload.migrationSteps
      : payload.scriptLogic?.structureModules
  );
  const shots = compactTextList([
    payload.shootingGuide?.shotComposition
      ? `镜头：${payload.shootingGuide.shotComposition}`
      : undefined,
    payload.shootingGuide?.performanceStyle
      ? `表现：${payload.shootingGuide.performanceStyle}`
      : undefined,
    payload.shootingGuide?.bgmStyle
      ? `BGM：${payload.shootingGuide.bgmStyle}`
      : undefined,
  ]);
  const legacyPlan: CopyPlan = {
    id: "real-structure",
    label: "本次拆解结构",
    accountType: cleanText(payload.targetAudience),
    title: firstText(payload.scriptLogic?.goldenQuotes?.[0], payload.coreConclusion),
    hook: firstText(
      payload.hookAnalysis?.hookImitationTip,
      payload.hookAnalysis?.copyHookReason,
      payload.hookAnalysis?.audioHook
    ),
    shortScript: undefined,
    outline,
    shots,
    coverText: undefined,
    commentGuide: firstText(
      payload.engagementEngineering?.ctaType,
      payload.engagementEngineering?.predictedTopComments?.[0]
    ),
  };
  return legacyPlan.title ||
    legacyPlan.hook ||
    legacyPlan.outline.length ||
    legacyPlan.shots.length ||
    legacyPlan.commentGuide
    ? [legacyPlan]
    : [];
}

function normalizeEmotionStages(
  payload: ViralBreakdownTaskPayload
): EmotionStage[] {
  if (payload.emotionStages?.length) {
    return (payload.emotionStages as unknown[])
      .map(rawItem => {
        const item = toRecord(rawItem) ?? {};
        return {
          stage: cleanUnknownText(item.stage) ?? "",
          time: firstUnknownText(item.timeRange, item.time) ?? "",
          emotion: cleanUnknownText(item.emotion) ?? "",
          videoAction: cleanUnknownText(item.videoAction) ?? "",
          copyAdvice: cleanUnknownText(item.copyAdvice) ?? "",
        };
      })
      .filter(
        item =>
          item.stage ||
          item.time ||
          item.emotion ||
          item.videoAction ||
          item.copyAdvice
      ) as EmotionStage[];
  }
  return (payload.emotionCurve ?? [])
    .map(item => ({
      stage: cleanText(item.emotion) ?? "",
      time: cleanText(item.time) ?? "",
      emotion: cleanText(item.emotion) ?? "",
      videoAction: cleanText(item.videoMove) ?? "",
      copyAdvice: cleanText(item.copyAdvice) ?? "",
    }))
    .filter(
      item =>
        item.stage ||
        item.time ||
        item.emotion ||
        item.videoAction ||
        item.copyAdvice
    );
}

function normalizeFormulaDetail(
  payload: ViralBreakdownTaskPayload,
  formula: string[]
): FormulaDetail | undefined {
  const detail = toRecord((payload as unknown as Record<string, unknown>).viralFormulaDetail);
  const original = compactTextList(
    Array.isArray(detail?.original) && detail.original.length
      ? detail.original
      : formula
  );
  const reusable = compactTextList(Array.isArray(detail?.reusable) ? detail.reusable : []);
  const explanation = cleanUnknownText(detail?.explanation);
  return original.length > 0 || reusable.length > 0 || explanation
    ? { original, reusable, explanation }
    : undefined;
}

function normalizeInteractionAnalysis(payload: ViralBreakdownTaskPayload) {
  if (payload.interactionAnalysis?.length) {
    return (payload.interactionAnalysis as unknown[])
      .map(rawItem => {
        const item = toRecord(rawItem) ?? {};
        const label = firstUnknownText(item.title, item.label);
        const detail = firstUnknownText(item.description, item.detail);
        const trigger = cleanUnknownText(item.trigger);
        return label || detail || trigger
          ? {
              label: label ?? "互动触发点",
              value: firstUnknownText(item.value, trigger) ?? "已识别",
              detail: [detail, trigger].filter(Boolean).join("；"),
              tone: normalizeTone(item.tone),
            }
          : undefined;
      })
      .filter(Boolean) as WorkspaceData["interactionAnalysis"];
  }
  const items = [
    payload.engagementEngineering?.controversyTraps
      ? {
          label: "评论触发点",
          value: "已识别",
          detail: payload.engagementEngineering.controversyTraps,
          tone: "blue" as Tone,
        }
      : undefined,
    payload.engagementEngineering?.ctaType
      ? {
          label: "行动引导",
          value: "已识别",
          detail: payload.engagementEngineering.ctaType,
          tone: "emerald" as Tone,
        }
      : undefined,
    payload.engagementEngineering?.predictedTopComments?.[0]
      ? {
          label: "评论预测",
          value: "已识别",
          detail: payload.engagementEngineering.predictedTopComments[0],
          tone: "violet" as Tone,
        }
      : undefined,
  ];
  return items.filter(Boolean) as WorkspaceData["interactionAnalysis"];
}

function normalizeAlgorithmFriendlyScore(payload: ViralBreakdownTaskPayload) {
  const raw = (payload as unknown as Record<string, unknown>).algorithmFriendlyScore;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(rawItem => {
        const item = toRecord(rawItem) ?? {};
        return {
          label: firstUnknownText(item.title, item.label) ?? "算法判断",
          value: firstUnknownText(item.value, item.score) ?? "已识别",
          detail: firstUnknownText(item.description, item.detail) ?? "",
        };
      })
      .filter(item => item.label || item.detail);
  }
  const algorithmRecord = toRecord(raw);
  if (algorithmRecord) {
    const score = firstUnknownText(algorithmRecord.score);
    const reasons = readStringList(algorithmRecord, ["reasons"]);
    const suggestions = readStringList(algorithmRecord, ["suggestions"]);
    return [
      score
        ? {
            label: "综合判断",
            value: score,
            detail: [...reasons, ...suggestions].join(" / "),
          }
        : undefined,
      ...reasons.map(reason => ({
        label: "推荐原因",
        value: "已识别",
        detail: reason,
      })),
      ...suggestions.map(suggestion => ({
        label: "优化建议",
        value: "已识别",
        detail: suggestion,
      })),
    ].filter(Boolean) as WorkspaceData["algorithmFriendlyScore"];
  }
  const items = [
    payload.rhythmAnalysis?.stimulusIntervalSeconds
      ? {
          label: "刺激间隔",
          value: `${payload.rhythmAnalysis.stimulusIntervalSeconds}s`,
          detail: payload.rhythmAnalysis.emotionCurve || "",
        }
      : undefined,
    payload.rhythmAnalysis?.emotionCurve
      ? {
          label: "情绪推进",
          value: "已识别",
          detail: payload.rhythmAnalysis.emotionCurve,
        }
      : undefined,
    payload.rhythmAnalysis?.dopamineNodes?.length
      ? {
          label: "多巴胺节点",
          value: `${payload.rhythmAnalysis.dopamineNodes.length} 个`,
          detail: payload.rhythmAnalysis.dopamineNodes.join(" / "),
        }
      : undefined,
  ];
  return items.filter(Boolean) as WorkspaceData["algorithmFriendlyScore"];
}

function splitActionText(item: string) {
  const [label, ...rest] = item.split(/[：:]/);
  return {
    label: rest.length ? label.trim() : item,
    detail: rest.length ? rest.join("：").trim() : "",
  };
}

function normalizeBreakdownResult(
  result: ResultRecord,
  payload: ViralBreakdownTaskPayload
): WorkspaceData {
  const payloadRecord = payload as unknown as Record<string, unknown>;
  const primaryContent: PredictionSupportingContent | undefined =
    result.supportingContents[0];
  const copyScore = getRealScore(result, payload);
  const recommendedCopyPoints = compactTextList(
    (payload.recommendedCopyPoints?.length
      ? payload.recommendedCopyPoints
      : payload.copyPoints) as unknown[]
  ).slice(0, 5);
  const notRecommendedPoints = compactTextList(
    (payload.notRecommendedPoints?.length
      ? payload.notRecommendedPoints
      : payload.avoidPoints) as unknown[]
  ).slice(0, 5);
  const videoTitle =
    payload.videoInfo?.title ||
    primaryContent?.title ||
    result.query ||
    result.title;
  const platform =
    payload.videoInfo?.platform ||
    primaryContent?.platform ||
    result.platform[0];
  const duration = payload.videoInfo?.duration || payload.estimatedDuration;
  const coverUrl =
    payload.videoInfo?.coverUrl ?? primaryContent?.coverUrl ?? null;
  const publishTime =
    payload.videoInfo?.publishTime || primaryContent?.publishedAt;
  const copyDecision = normalizeCopyDecision(payload, copyScore);
  const decisionRecord = toRecord(payloadRecord.copyDecision);
  const decisionPlatforms = readStringList(decisionRecord, ["suitablePlatforms"]);
  const formula = compactTextList(
    payload.viralFormula?.length ? payload.viralFormula : payload.coreLabels
  ).slice(0, 6);
  const formulaDetail = normalizeFormulaDetail(payload, formula);

  return {
    copyScore,
    copyLevel: payload.copyLevel,
    breakdownValue: payload.breakdownValue,
    recommendedCopyPoints,
    notRecommendedPoints,
    coreConclusion: normalizeConclusion(payload),
    imitationAdvice: cleanText(payload.imitationAdvice),
    copyDecision,
    videoInfo: {
      coverUrl,
      sourceUrl: cleanText(payload.videoInfo?.sourceUrl),
      title: cleanText(videoTitle),
      platform: cleanText(platform),
      publishTime: cleanText(publishTime),
      duration: cleanText(duration),
      likeCount: firstText(
        payload.videoInfo?.likeCount,
        primaryContent?.likeCount != null
          ? formatCount(primaryContent.likeCount)
          : undefined
      ),
      commentCount: firstText(
        payload.videoInfo?.commentCount,
        primaryContent?.commentCount != null
          ? formatCount(primaryContent.commentCount)
          : undefined
      ),
      shareCount: firstText(
        payload.videoInfo?.shareCount,
        primaryContent?.shareCount != null
          ? formatCount(primaryContent.shareCount)
          : undefined
      ),
      completionRate: cleanText(payload.videoInfo?.completionRate),
      interactionRate: cleanText(payload.videoInfo?.interactionRate),
    },
    suitableAccounts: copyDecision?.suitableAccounts ?? [],
    unsuitableAccounts: copyDecision?.unsuitableAccounts ?? [],
    suitablePlatforms: compactTextList(
      decisionPlatforms.length
        ? decisionPlatforms
        : payload.suitablePlatforms?.length
          ? payload.suitablePlatforms
          : [platform]
    ),
    timelineAnalysis: normalizeTimelineSegments(payload),
    viralFormula: formula,
    viralFormulaDetail: formulaDetail,
    formulaSummary: firstText(
      formulaDetail?.explanation,
      payload.formulaSummary,
      payload.breakdownSummary
    ),
    copyPlans: normalizeCopyPlans(payload),
    emotionCurve: payload.emotionCurve ?? [],
    emotionStages: normalizeEmotionStages(payload),
    audienceMotivation: compactTextList(payload.audienceMotivation as unknown[]),
    interactionAnalysis: normalizeInteractionAnalysis(payload),
    algorithmFriendlyScore: normalizeAlgorithmFriendlyScore(payload),
    avoidPitfalls: compactTextList(
      (payload.avoidPitfalls?.length ? payload.avoidPitfalls : payload.avoidPoints) as unknown[]
    ).slice(0, 5),
    corePlay: firstText(
      payload.corePlay,
      payload.contentStructure,
      payload.breakdownSummary
    ),
  };
}

function openCtaEditor(ctaId: string) {
  window.dispatchEvent(
    new CustomEvent("open-cta-editor", { detail: { ctaId } })
  );
}

function openResultEditor({
  title,
  subtitle,
  markdown,
  expanded = true,
}: {
  title: string;
  subtitle: string;
  markdown: string;
  expanded?: boolean;
}) {
  window.dispatchEvent(
    new CustomEvent("open-cta-editor", {
      detail: {
        editorTitle: title,
        editorSubtitle: subtitle,
        staticMarkdown: markdown,
        expanded,
      },
    })
  );
}

function markdownText(value?: string | null) {
  return value?.trim() || "暂无";
}

function markdownList(items: string[]) {
  if (!items.length) return "- 暂无";
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildGeneratedScriptMarkdown({
  script,
  plan,
  data,
}: {
  script: GeneratedScriptResult;
  plan?: CopyPlan;
  data: WorkspaceData;
}) {
  const imageMarkdown = script.coverImageUrl
    ? `\n\n![封面图](${script.coverImageUrl})`
    : "";
  const sourceTitle = data.videoInfo.title || "本次爆款拆解";
  return `# 完整口播脚本

> 来源：${sourceTitle}${plan?.label ? ` · ${plan.label}` : ""}

## 标题
${markdownText(script.title || plan?.title)}

## 开头 3 秒钩子
${markdownText(script.openingHook || plan?.hook)}

## 完整口播稿
${markdownText(script.fullVoiceoverScript)}

## 分镜脚本
${markdownList(script.storyboard)}

## 拍摄执行清单
${markdownList(script.shotList)}

## 封面文案
${markdownText(script.coverText || plan?.coverText)}${imageMarkdown}

## 评论区引导
${markdownText(script.commentGuide || plan?.commentGuide)}

## 封面图提示词
${markdownText(script.coverImagePrompt)}
${script.coverImageError ? `\n\n> 封面图暂未生成成功：${script.coverImageError}` : ""}
${script.model ? `\n\n---\n模型：${script.model}` : ""}`;
}

function buildRewrittenScriptMarkdown({
  script,
  plan,
}: {
  script: RewrittenScriptResult;
  plan?: CopyPlan;
}) {
  return `# ${script.styleLabel}改写稿

> 来源方案：${plan?.label || "当前方案"}

## 标题
${markdownText(script.title || plan?.title)}

## 开头 3 秒钩子
${markdownText(script.openingHook || plan?.hook)}

## 口播稿
${markdownText(script.shortScript)}

## 改写说明
${markdownList(script.styleNotes)}
${script.model ? `\n\n---\n模型：${script.model}` : ""}`;
}

function normalizeGeneratedScript(raw: unknown): GeneratedScriptResult {
  const record = toRecord(raw) ?? {};
  return {
    title: cleanUnknownText(record.title),
    openingHook: cleanUnknownText(record.openingHook),
    fullVoiceoverScript: cleanUnknownText(record.fullVoiceoverScript),
    storyboard: Array.isArray(record.storyboard) ? compactTextList(record.storyboard) : [],
    shotList: Array.isArray(record.shotList) ? compactTextList(record.shotList) : [],
    coverText: cleanUnknownText(record.coverText),
    commentGuide: cleanUnknownText(record.commentGuide),
    coverImagePrompt: cleanUnknownText(record.coverImagePrompt),
    coverImageUrl: cleanUnknownText(record.coverImageUrl) ?? null,
    coverImageB64: cleanUnknownText(record.coverImageB64) ?? null,
    coverImageError: cleanUnknownText(record.coverImageError),
    model: cleanUnknownText(record.model),
  };
}

function normalizeRewrittenScript(
  raw: unknown,
  planId?: string,
  fallbackStyle: RewriteStyle = "conversational"
): RewrittenScriptResult {
  const record = toRecord(raw) ?? {};
  const style = cleanUnknownText(record.style) as RewriteStyle | undefined;
  return {
    planId,
    style: style ?? fallbackStyle,
    styleLabel: cleanUnknownText(record.styleLabel) ?? "改写结果",
    title: cleanUnknownText(record.title),
    openingHook: cleanUnknownText(record.openingHook),
    shortScript: cleanUnknownText(record.shortScript) ?? "",
    styleNotes: Array.isArray(record.styleNotes)
      ? compactTextList(record.styleNotes)
      : [],
    model: cleanUnknownText(record.model),
  };
}

function toneClasses(tone: Tone) {
  const map: Record<Tone, string> = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    violet: "border-violet-100 bg-violet-50 text-violet-800",
    rose: "border-rose-100 bg-rose-50 text-rose-800",
    gray: "border-gray-100 bg-gray-50 text-gray-800",
  };
  return map[tone];
}

function accountIconLabel(label: string) {
  if (/财|投|钱|副业|商业/.test(label)) return "¥";
  if (/认知|成长|知识|教育/.test(label)) return "智";
  if (/跨境|资讯|观察|趋势/.test(label)) return "趋";
  if (/普通|机会|个人/.test(label)) return "机";
  return "号";
}

function platformIconLabel(platform: string) {
  if (/抖音|douyin/i.test(platform)) return "抖";
  if (/小红书|红书|xhs/i.test(platform)) return "红";
  if (/视频号|微信/i.test(platform)) return "微";
  if (/快手/i.test(platform)) return "快";
  if (/B站|bilibili/i.test(platform)) return "B";
  return platform.slice(0, 1);
}

function platformIconTone(platform: string) {
  if (/抖音|douyin/i.test(platform)) return "bg-gray-950 text-white";
  if (/小红书|红书|xhs/i.test(platform)) return "bg-rose-500 text-white";
  if (/视频号|微信/i.test(platform)) return "bg-emerald-500 text-white";
  if (/快手/i.test(platform)) return "bg-orange-500 text-white";
  if (/B站|bilibili/i.test(platform)) return "bg-sky-500 text-white";
  return "bg-blue-600 text-white";
}

function limitText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function dedupeList(items: string[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function takeTopItems(items: string[], count: number) {
  return dedupeList(items).slice(0, count);
}

function isLongText(text?: string, maxLength = 120) {
  if (!text) return false;
  return text.length > maxLength || text.split("\n").length > 3;
}

function lineClampClass(maxLines: number) {
  if (maxLines <= 1) return "line-clamp-1";
  if (maxLines === 2) return "line-clamp-2";
  if (maxLines === 4) return "line-clamp-4";
  return "line-clamp-3";
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function emitCopyToast(message = "已复制，可以直接粘贴使用。") {
  window.dispatchEvent(
    new CustomEvent("viral-breakdown-copy", { detail: { message } })
  );
}

function PrimaryButton({
  children,
  onClick,
  icon: Icon = Sparkles,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: typeof Sparkles;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex min-h-[72px] items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-6 py-4 text-left text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-200 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 transition group-hover:bg-white/25">
        <Icon className="h-5 w-5" />
      </span>
      <span>{children}</span>
    </button>
  );
}

function ExpandableText({
  text,
  maxLines = 3,
  className = "",
  buttonClassName = "",
  expandLabel = "展开查看",
}: {
  text?: string;
  maxLines?: number;
  className?: string;
  buttonClassName?: string;
  expandLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const foldThreshold =
    maxLines <= 2 ? 56 : maxLines === 3 ? 88 : maxLines === 4 ? 140 : 110;
  const shouldFold = isLongText(text, foldThreshold);
  return (
    <div className="min-w-0">
      <div
        className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
          shouldFold && !expanded ? lineClampClass(maxLines) : ""
        } ${className}`}
      >
        {text}
      </div>
      {shouldFold && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className={`mt-2 text-xs font-semibold text-violet-700 transition hover:text-violet-900 ${buttonClassName}`}
        >
          {expanded ? "收起" : expandLabel}
        </button>
      )}
    </div>
  );
}

function CompactText({
  text,
  maxLines = 2,
  className = "",
}: {
  text?: string;
  maxLines?: number;
  className?: string;
}) {
  if (!text) return null;
  return (
    <div
      title={text}
      className={`min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${lineClampClass(maxLines)} ${className}`}
    >
      {text}
    </div>
  );
}

function ExpandableList({
  items,
  maxItems = 3,
  ordered,
  className = "",
  renderItem,
}: {
  items: string[];
  maxItems?: number;
  ordered?: boolean;
  className?: string;
  renderItem?: (item: string, index: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalized = dedupeList(items);
  if (normalized.length === 0) return null;
  const visibleItems = expanded ? normalized : normalized.slice(0, maxItems);
  const hiddenCount = Math.max(0, normalized.length - maxItems);
  const Tag = ordered ? "ol" : "div";
  return (
    <div className="min-w-0">
      <Tag className={className}>
        {visibleItems.map((item, index) =>
          renderItem ? (
            renderItem(item, index)
          ) : (
            <div
              key={`${item}-${index}`}
              className="break-words text-sm leading-6 text-gray-700 [overflow-wrap:anywhere]"
            >
              {ordered ? `${index + 1}. ` : ""}
              {item}
            </div>
          )
        )}
      </Tag>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-3 text-xs font-semibold text-violet-700 transition hover:text-violet-900"
        >
          {expanded ? "收起" : `展开剩余 ${hiddenCount} 条`}
        </button>
      )}
    </div>
  );
}

function CopyButton({
  content,
  label = "复制",
  className = "",
}: {
  content?: string;
  label?: string;
  className?: string;
}) {
  if (!content) return null;
  return (
    <button
      type="button"
      onClick={async event => {
        event.stopPropagation();
        await writeClipboardText(content);
        emitCopyToast();
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 ${className}`}
    >
      <Copy className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CopyableBlock({
  title,
  content,
  maxLines = 3,
  copyLabel = "复制",
  className = "",
  contentClassName = "",
  actions,
  label,
}: {
  title: string;
  content?: string;
  maxLines?: number;
  copyLabel?: string;
  className?: string;
  contentClassName?: string;
  actions?: React.ReactNode;
  label?: string;
}) {
  if (!content) return null;
  return (
    <div
      className={`rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-gray-950">{title}</div>
            {label && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {label}
              </span>
            )}
          </div>
        </div>
        <CopyButton content={content} label={copyLabel} />
      </div>
      <ExpandableText
        text={content}
        maxLines={maxLines}
        className={`text-sm leading-7 text-gray-700 ${contentClassName}`}
      />
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 42;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#ecfdf5"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#10b981"
          strokeLinecap="round"
          strokeWidth="9"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-semibold tracking-normal text-emerald-600">
          {score}
        </div>
        <div className="text-[11px] text-gray-400">/ 100</div>
      </div>
    </div>
  );
}

function parseDisplayCount(value?: string) {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return null;
  if (normalized.includes("亿")) return Math.round(number * 100_000_000);
  if (normalized.includes("万")) return Math.round(number * 10_000);
  if (/k/i.test(normalized)) return Math.round(number * 1_000);
  return Math.round(number);
}

function VideoCover({
  data,
  onOrientationChange,
}: {
  data: WorkspaceData;
  onOrientationChange?: (orientation: "landscape" | "portrait") => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [playerVideo, setPlayerVideo] = useState<InAppVideoSource | null>(null);
  const coverUrl =
    data.videoInfo.coverUrl && !imageFailed ? data.videoInfo.coverUrl : null;
  const title = data.videoInfo.title ?? "未识别视频标题";
  const canPlay = Boolean(data.videoInfo.sourceUrl);
  const videoSource: InAppVideoSource = {
    title,
    platform: data.videoInfo.platform ?? "抖音",
    contentUrl: data.videoInfo.sourceUrl,
    coverUrl: data.videoInfo.coverUrl,
    likeCount: parseDisplayCount(data.videoInfo.likeCount),
    commentCount: parseDisplayCount(data.videoInfo.commentCount),
    shareCount: parseDisplayCount(data.videoInfo.shareCount),
    publishedAt: data.videoInfo.publishTime,
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (canPlay) setPlayerVideo(videoSource);
        }}
        disabled={!canPlay}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-gray-950 text-left shadow-sm disabled:cursor-default"
        aria-label={canPlay ? "播放原视频" : "原视频暂时不可播放"}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="h-full w-full object-cover"
            onLoad={event => {
              const image = event.currentTarget;
              onOrientationChange?.(
                image.naturalWidth >= image.naturalHeight
                  ? "landscape"
                  : "portrait"
              );
            }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#334155,#020617_70%)] px-6 text-center text-2xl font-semibold leading-tight text-yellow-300">
            {title.slice(0, 18)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
        {canPlay && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/92 px-4 py-2 text-sm font-semibold text-gray-950 shadow-lg">
              <Play className="h-4 w-4 fill-gray-950" />
              点击播放
            </span>
          </div>
        )}
        {data.videoInfo.duration && (
          <div className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {data.videoInfo.duration}
          </div>
        )}
        {data.videoInfo.platform && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-900">
            <Play className="h-3 w-3 fill-gray-900" />
            {data.videoInfo.platform}
          </div>
        )}
      </button>
      {playerVideo && (
        <InAppVideoPlayerModal
          video={playerVideo}
          onClose={() => setPlayerVideo(null)}
        />
      )}
    </>
  );
}

function CoreConclusionCard({ conclusion }: { conclusion?: string }) {
  return (
    <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-cyan-50 px-5 py-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <BadgeCheck className="h-4 w-4" />
        操盘手结论
      </div>
      {conclusion ? (
        <ExpandableText
          text={conclusion}
          maxLines={3}
          className="text-base font-semibold leading-8 text-gray-900"
        />
      ) : (
        <p className="text-base font-semibold leading-8 text-gray-700">
          这次结果里暂时没有生成核心结论。
        </p>
      )}
    </div>
  );
}

function CopyScoreCard({ data }: { data: WorkspaceData }) {
  const decision = data.copyDecision;
  const rawPriority = decision?.priority?.trim();
  const priority = rawPriority && !/^P\d+$/i.test(rawPriority) ? rawPriority : undefined;
  return (
    <div className="flex min-w-0 flex-col rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-gray-950">复制决策</div>
        {decision?.level && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {decision.level}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {decision?.suggestion && (
          <div className="rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold leading-6 text-emerald-900">
            <CompactText text={decision.suggestion} maxLines={2} />
          </div>
        )}
        {priority && (
          <div className="rounded-2xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800">
            <div className="font-semibold">优先动作：</div>
            <CompactText
              text={priority}
              maxLines={1}
              className="mt-0.5"
            />
          </div>
        )}
        {data.breakdownValue && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">拆解价值</span>
            <span className="font-semibold text-blue-700">
              {data.breakdownValue}
            </span>
          </div>
        )}
        {!decision?.suggestion && !data.breakdownValue && !priority && (
          <EmptyInline text="这次结果里暂时没有生成明确复制决策。" />
        )}
      </div>
    </div>
  );
}

function CopyDecisionCards({ data }: { data: WorkspaceData }) {
  return (
    <>
      <DecisionPointCard
        title="最值得复制"
        items={data.recommendedCopyPoints}
        tone="emerald"
        emptyText="这次结果里暂时没有生成明确可复制点。"
      />
      <DecisionPointCard
        title="别照搬"
        items={data.notRecommendedPoints}
        tone="amber"
        emptyText="这次结果里暂时没有生成需要避开的点。"
      />
    </>
  );
}

function DecisionPointCard({
  title,
  items,
  tone,
  emptyText,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber";
  emptyText: string;
}) {
  const Icon = tone === "emerald" ? Check : AlertTriangle;
  return (
    <div
      className={`min-w-0 rounded-3xl px-4 py-4 ${
        tone === "emerald" ? "bg-emerald-50/70" : "bg-amber-50/80"
      }`}
    >
      <div
        className={`mb-3 text-sm font-semibold ${
          tone === "emerald" ? "text-emerald-800" : "text-amber-800"
        }`}
      >
        {title}
      </div>
      <div className="space-y-2">
        {items.length > 0 ? (
          items.slice(0, 2).map((item, index) => (
            <div
              key={`${title}-${item}-${index}`}
              className="flex gap-2 text-xs leading-5 text-gray-700"
            >
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  tone === "emerald" ? "text-emerald-500" : "text-amber-500"
                }`}
              />
              <CompactText text={item} maxLines={2} />
            </div>
          ))
        ) : (
          <EmptyInline text={emptyText} />
        )}
      </div>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-3 py-3 text-sm text-gray-500">
      {text}
    </div>
  );
}

function EmptyModule({
  text,
  description,
  actionLabel,
  onAction,
  compact,
}: {
  text: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border border-dashed border-gray-200 bg-gray-50 text-sm leading-6 text-gray-500 ${
        compact ? "px-4 py-4" : "px-5 py-6"
      }`}
    >
      <div className="font-medium text-gray-700">{text}</div>
      {description && <div className="mt-1 text-xs text-gray-500">{description}</div>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 rounded-2xl border border-violet-200 bg-white px-4 py-2 text-xs font-semibold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function AccountTagGroup({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "blue" | "gray";
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-gray-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map(item => (
            <span
              key={`${label}-${item}`}
              className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium ${
                tone === "blue"
                  ? "border-blue-100 text-blue-700"
                  : "border-gray-100 text-gray-500"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                  tone === "blue" ? "bg-blue-600" : "bg-gray-400"
                }`}
              >
                {accountIconLabel(item)}
              </span>
              {item}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-dashed border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-400">
            暂时没有明确结果
          </span>
        )}
      </div>
    </div>
  );
}

function HeroVideoSummary({ data }: { data: WorkspaceData }) {
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "portrait"
  );
  const isLandscape = orientation === "landscape";
  const stats = [
    { label: "发布时间", value: data.videoInfo.publishTime },
    { label: "视频时长", value: data.videoInfo.duration },
    { label: "点赞", value: data.videoInfo.likeCount },
    { label: "评论", value: data.videoInfo.commentCount },
    { label: "转发", value: data.videoInfo.shareCount },
    { label: "完播率", value: data.videoInfo.completionRate },
    { label: "互动率", value: data.videoInfo.interactionRate },
  ].filter(item => hasText(item.value));
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div
        className={`grid gap-6 ${
          isLandscape
            ? "xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.05fr)]"
            : "xl:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <VideoCover data={data} onOrientationChange={setOrientation} />
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold leading-tight tracking-normal text-gray-950">
            {data.videoInfo.title ?? "未识别视频标题"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            {stats.map(item => (
              <span
                key={item.label}
                className="rounded-full bg-gray-50 px-2.5 py-1"
              >
                {item.label}：
                <span className="font-medium text-gray-800">{item.value}</span>
              </span>
            ))}
          </div>
          {!isLandscape && (
            <div className="mt-5">
              <CoreConclusionCard conclusion={data.coreConclusion} />
            </div>
          )}
        </div>
      </div>
      {isLandscape && (
        <div className="mt-5">
          <CoreConclusionCard conclusion={data.coreConclusion} />
        </div>
      )}
      <div className="mt-5 grid items-start gap-4 md:grid-cols-3">
        <CopyScoreCard data={data} />
        <CopyDecisionCards data={data} />
      </div>
    </section>
  );
}

function HeroActions({
  onGenerateScript,
  isGeneratingScript,
}: {
  onGenerateScript: (selectedPlanId?: string) => void;
  isGeneratingScript: boolean;
}) {
  const actions = [
    {
      title: isGeneratingScript ? "正在生成口播脚本" : "生成完整口播脚本",
      desc: "保留爆点结构，直接生成 60 秒口播",
      icon: Sparkles,
      highlight: true,
      onClick: () => onGenerateScript(),
    },
    {
      title: "生成同款选题",
      desc: "按同一爆款公式扩展 5 个方向",
      icon: WandSparkles,
      onClick: () => openCtaEditor("find_similar"),
    },
    {
      title: "逐秒拆解视频爆点",
      desc: "跳到真实关键帧和节奏拆分",
      icon: Clock3,
      onClick: () =>
        document
          .getElementById("video-timeline")
          ?.scrollIntoView({ behavior: "smooth" }),
    },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.title}
            type="button"
            onClick={action.onClick}
            disabled={action.highlight && isGeneratingScript}
            className={`group flex items-center gap-4 rounded-[24px] border p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:p-5 ${
              action.highlight
                ? "border-violet-200 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white shadow-violet-200"
                : "border-gray-100 bg-white text-gray-900 hover:border-blue-200 hover:bg-blue-50"
            } disabled:cursor-wait disabled:opacity-75`}
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                action.highlight
                  ? "bg-white/16 text-white"
                  : "bg-blue-50 text-blue-600 group-hover:bg-white"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
                {action.title}
              </span>
              <span
                className={`mt-1 block text-xs leading-5 ${
                  action.highlight ? "text-violet-100" : "text-gray-500"
                }`}
              >
                {action.desc}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

function RightCreationPanel({
  data,
  onGenerateScript,
  isGeneratingScript,
}: {
  data: WorkspaceData;
  onGenerateScript: (selectedPlanId?: string) => void;
  isGeneratingScript: boolean;
}) {
  const secondaryActions = [
    {
      label: "生成同款选题",
      desc: "换题材继续复用",
      icon: WandSparkles,
      onClick: () => openCtaEditor("find_similar"),
    },
    {
      label: "提取钩子和金句",
      desc: "放入编辑器整理成素材库",
      icon: Scissors,
      onClick: () => openCtaEditor("extract_hooks"),
    },
  ];
  const keepPoints = takeTopItems(data.copyDecision?.keep ?? [], 2);
  return (
    <aside className="sticky top-6 space-y-4 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
      <div>
        <div className="text-sm font-semibold text-gray-950">创作工作台</div>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          下一步生成结果会统一进入右侧编辑器，方便继续改、复制和导出。
        </p>
      </div>
      <div className="flex items-center justify-between rounded-3xl bg-gray-50 p-4">
        <div>
          <div className="text-xs font-medium text-gray-500">可复用程度</div>
          {data.copyDecision?.level && (
            <div className="mt-2 text-sm font-semibold text-emerald-700">
              {data.copyDecision.level}
            </div>
          )}
        </div>
        {data.copyScore != null ? (
          <ScoreRing score={data.copyScore} />
        ) : (
          <div className="w-28 rounded-2xl bg-white px-3 py-4 text-center text-xs text-gray-400">
            这次还没有评分
          </div>
        )}
      </div>
      {keepPoints.length > 0 && (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-900">
          这条视频最值得复制的是：
          <span className="text-emerald-700">{keepPoints.join(" + ")}</span>
        </div>
      )}
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-500">
            适合平台
          </div>
          <div className="flex flex-wrap gap-2">
            {data.suitablePlatforms.length > 0 ? (
              takeTopItems(data.suitablePlatforms, 4).map(platform => (
              <span
                key={platform}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${platformIconTone(platform)}`}
                >
                  {platformIconLabel(platform)}
                </span>
                {platform}
              </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">这次还没有明确平台</span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-gray-500">
            适合账号类型
          </div>
          <p className="text-sm leading-6 text-gray-800">
            {data.suitableAccounts.length > 0
              ? takeTopItems(data.suitableAccounts, 3).join(" / ")
              : "这次结果里暂时没有明确账号类型"}
          </p>
        </div>
        {data.corePlay && (
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-500">
              核心玩法
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-3">
              <ExpandableText
                text={data.corePlay}
                maxLines={2}
                className="text-sm leading-6 text-emerald-900"
              />
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => onGenerateScript()}
          disabled={isGeneratingScript}
          className="group flex w-full items-center justify-between rounded-3xl border border-violet-500 bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-4 text-left text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-wait disabled:opacity-75"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/16 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">
                {isGeneratingScript ? "正在生成口播脚本" : "生成完整口播脚本"}
              </span>
              <span className="mt-0.5 block text-xs text-violet-100">
                直接拿去改、拿去拍
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white" />
        </button>
        <div className="pt-2 text-xs font-semibold text-gray-500">下一步动作</div>
        {secondaryActions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="group flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-3 py-2.5 text-left text-gray-800 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-md disabled:cursor-wait disabled:opacity-75"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-blue-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-gray-500 [overflow-wrap:anywhere]">
                    {action.desc}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function VideoTimelineAnalysis({
  data,
}: {
  data: WorkspaceData;
}) {
  const hasRealFrame = data.timelineAnalysis.some(segment => segment.frameUrl);
  const [detailSegment, setDetailSegment] = useState<TimelineSegment | null>(null);
  return (
    <section
      id="video-timeline"
      className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="mb-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-normal text-gray-950">
            视频时间轴拆解
          </h2>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Scissors className="h-3.5 w-3.5" />
            {hasRealFrame ? "真实关键帧截图" : "画面摘要"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          逐秒拆解这条视频如何抓住用户注意力
        </p>
      </div>
      {data.timelineAnalysis.length === 0 ? (
        <EmptyModule
          text="本次视频暂未生成逐秒时间轴拆解。"
          description="完整时间轴需要关键帧、字幕和口播分段结果。"
          compact
        />
      ) : (
      <div className="relative">
        <div className="absolute left-0 right-0 top-[18px] hidden h-0.5 bg-gradient-to-r from-violet-200 via-blue-200 to-emerald-200 lg:block" />
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
          {data.timelineAnalysis.map((segment, index) => (
            <TimelineSegmentCard
              key={`${segment.time ?? "segment"}-${index}`}
              segment={segment}
              index={index}
              onViewDetails={() => setDetailSegment(segment)}
            />
          ))}
        </div>
      </div>
      )}
      {detailSegment && (
        <TimelineDetailModal
          segment={detailSegment}
          onClose={() => setDetailSegment(null)}
        />
      )}
    </section>
  );
}

function TimelineSegmentCard({
  segment,
  index,
  onViewDetails,
}: {
  segment: TimelineSegment;
  index: number;
  onViewDetails: () => void;
}) {
  return (
    <div className="relative flex min-h-[278px] min-w-0 flex-col rounded-3xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="relative z-10 mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-violet-600 text-sm font-semibold text-white shadow-sm">
          {index + 1}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-violet-700">
            {segment.time}
          </div>
          <div className="line-clamp-2 break-words text-sm font-semibold text-gray-950 [overflow-wrap:anywhere]">
            {segment.title}
          </div>
        </div>
      </div>
      <VideoFrame
        frameUrl={segment.frameUrl}
        title={segment.title}
        time={segment.time}
        visualSummary={segment.visualSummary}
        subtitleSummary={segment.subtitleSummary}
      />
      <div className="mt-4 flex flex-1 flex-col">
        {segment.viralFunction ? (
          <div className="rounded-2xl bg-white px-3 py-3 text-xs leading-5 text-gray-700 shadow-sm">
            <div className="mb-1 font-semibold text-gray-950">这一段的作用</div>
            <ExpandableText text={segment.viralFunction} maxLines={2} />
          </div>
        ) : (
          <EmptyInline text="这段暂时没有生成爆点作用。" />
        )}
        <button
          type="button"
          onClick={onViewDetails}
          className="mt-auto inline-flex w-fit items-center rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
        >
          查看拆解
        </button>
      </div>
    </div>
  );
}

function TimelineDetailModal({
  segment,
  onClose,
}: {
  segment: TimelineSegment;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="时间轴拆解详情"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-violet-700">
              {segment.time}
            </div>
            <h3 className="mt-1 break-words text-xl font-semibold leading-snug text-gray-950 [overflow-wrap:anywhere]">
              {segment.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
            aria-label="关闭拆解详情"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-[calc(92vh-78px)] gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
          <VideoFrame
            frameUrl={segment.frameUrl}
            title={segment.title}
            time={segment.time}
            visualSummary={segment.visualSummary}
            subtitleSummary={segment.subtitleSummary}
          />
          <div className="space-y-4">
            <InfoLine label="画面摘要" value={segment.visualSummary} />
            <InfoLine label="字幕摘要" value={segment.subtitleSummary} />
            <InfoLine label="口播摘要" value={segment.narrationSummary} />
            <InfoLine label="爆点作用" value={segment.viralFunction} />
            {segment.userPsychology.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold text-gray-400">
                  用户心理
                </div>
                <div className="flex flex-wrap gap-2">
                  {segment.userPsychology.map(item => (
                    <span
                      key={`${segment.time}-${item}`}
                      className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {segment.copyMethod && (
              <CopyableBlock
                title="你可以这样复制"
                content={segment.copyMethod}
                maxLines={4}
                copyLabel="复制"
                className="border-blue-100 bg-blue-50/70 shadow-none"
                contentClassName="font-semibold text-blue-800"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoFrame({
  frameUrl,
  title,
  time,
  visualSummary,
  subtitleSummary,
}: {
  frameUrl?: string | null;
  title?: string;
  time?: string;
  visualSummary?: string;
  subtitleSummary?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = frameUrl && !failed ? frameUrl : null;
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-gray-950">
      {src ? (
        <img
          src={src}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="relative flex h-full w-full flex-col justify-between bg-gray-100 p-3 text-left">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-gray-500 shadow-sm">
              <Play className="h-3 w-3 fill-gray-400" />
              暂无关键帧
            </span>
          </div>
          <div>
            {visualSummary ? (
              <>
                <div className="line-clamp-2 text-sm font-semibold leading-6 text-gray-900">
                  暂无关键帧，仅展示模型识别的画面摘要
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-600">
                  {visualSummary}
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs leading-5 text-gray-500">
                本段暂未返回画面信息。
              </div>
            )}
          </div>
        </div>
      )}
      {src && <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />}
      {time && (
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
          {time}
        </div>
      )}
    </div>
  );
}

function InfoLine({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string;
  strong?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="mb-0.5 font-medium text-gray-400">{label}</div>
      <ExpandableText
        text={value}
        maxLines={2}
        className={strong ? "font-semibold text-blue-700" : "text-gray-700"}
      />
    </div>
  );
}

function ViralFormulaBlock({ data }: { data: WorkspaceData }) {
  const icons = [TrendingUp, Zap, CircleHelp, Target, Flame];
  const originalFormula = data.viralFormulaDetail?.original ?? [];
  const reusableItems = data.viralFormulaDetail?.reusable ?? [];
  const hasFormula =
    data.viralFormula.length > 0 ||
    originalFormula.length > 0 ||
    reusableItems.length > 0 ||
    hasText(data.formulaSummary);
  if (!hasFormula) return null;
  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-sm">
      <div className="bg-[radial-gradient(circle_at_0%_0%,rgba(139,92,246,0.20),transparent_36%),linear-gradient(135deg,#1f2937,#4338ca_58%,#0f766e)] px-5 py-3.5 text-white sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              爆款公式提炼
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-violet-100">
              把这条视频拆成你能复用的套路。
            </p>
          </div>
        </div>
      </div>
      {data.viralFormula.length > 0 && (
        <div className="flex flex-col gap-3 p-5 sm:p-6 xl:flex-row xl:items-stretch">
          {data.viralFormula.map((item, index) => {
          const Icon = icons[index % icons.length];
          return (
            <div key={`${item}-${index}`} className="contents">
              <div className="group relative flex min-h-[96px] flex-1 flex-col justify-between overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-b from-white to-violet-50/50 p-4 transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg xl:min-w-0">
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-violet-100/70 blur-xl transition group-hover:bg-violet-200" />
                <div className="relative flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-violet-300">
                    0{index + 1}
                  </span>
                </div>
                <div className="relative mt-3">
                  <div
                    className="text-base font-semibold leading-6 text-gray-950"
                    title={item}
                  >
                    {limitText(item, 28)}
                  </div>
                  <div className="mt-2 h-1 w-10 rounded-full bg-violet-500/70" />
                </div>
              </div>
              {index < data.viralFormula.length - 1 && (
                <div className="hidden items-center justify-center text-2xl font-semibold text-violet-200 xl:flex">
                  +
                </div>
              )}
            </div>
          );
          })}
          <div className="hidden items-center justify-center text-2xl font-semibold text-violet-200 xl:flex">
            =
          </div>
          <div className="relative flex min-h-[96px] flex-1 flex-col justify-between overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-yellow-50 to-white p-4 shadow-sm xl:min-w-0">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-200/50 blur-2xl" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-100">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="relative">
              <div className="text-lg font-semibold text-amber-950">
                传播结果
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-800">
                基于本次拆解返回的公式元素整理。
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="mb-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          {originalFormula.length > 0 && (
            <FormulaCompareCard
              title="原视频公式"
              items={originalFormula}
              tone="emerald"
            />
          )}
          {originalFormula.length > 0 && reusableItems.length > 0 && (
            <div className="hidden items-center justify-center px-1 text-xs font-semibold text-gray-400 lg:flex">
              抽象成可复制结构
            </div>
          )}
          {reusableItems.length > 0 ? (
            <FormulaCompareCard
              title="可复用公式"
              items={reusableItems}
              tone="violet"
              copyable
            />
          ) : (
            <EmptyModule
              text="可复用公式暂时还没有生成。"
              compact
            />
          )}
        </div>
        {data.formulaSummary && (
          <div className="rounded-3xl border border-gray-100 bg-gray-50 px-4 py-4">
            <ExpandableText
              text={data.formulaSummary}
              maxLines={3}
              className="text-sm leading-7 text-gray-700"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function FormulaCompareCard({
  title,
  items,
  tone,
  copyable,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "violet";
  copyable?: boolean;
}) {
  const content = items.join(" + ");
  return (
    <div
      className={`rounded-3xl border p-4 ${
        tone === "emerald"
          ? "border-emerald-100 bg-emerald-50/70"
          : "border-violet-100 bg-violet-50/70"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className={`text-sm font-semibold ${
            tone === "emerald" ? "text-emerald-800" : "text-violet-800"
          }`}
        >
          {title}
        </div>
        {copyable && <CopyButton content={content} label="复制公式" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <div key={`${title}-${item}-${index}`} className="contents">
            <span
              className="max-w-full break-words rounded-2xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-gray-800 shadow-sm [overflow-wrap:anywhere]"
              title={item}
            >
              {limitText(item, 28)}
            </span>
            {index < items.length - 1 && (
              <span className="text-sm font-semibold text-gray-300">+</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyPlanTabs({
  data,
  onGenerateScript,
  onRewriteScript,
  isGeneratingScript,
  isRewritingScript,
  rewritingStyle,
}: {
  data: WorkspaceData;
  onGenerateScript: (selectedPlanId?: string) => void;
  onRewriteScript: (selectedPlanId: string, rewriteStyle: RewriteStyle) => void;
  isGeneratingScript: boolean;
  isRewritingScript: boolean;
  rewritingStyle?: RewriteStyle | null;
}) {
  const [activeId, setActiveId] = useState(data.copyPlans[0]?.id ?? "");
  const activePlan =
    data.copyPlans.find(plan => plan.id === activeId) ?? data.copyPlans[0];
  if (!activePlan) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-white via-violet-50/60 to-blue-50 px-5 py-6 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-normal text-gray-950">
            可直接拍的方案
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            下面这部分是给你直接拿去改、拿去拍的，不是单纯分析。
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <EmptyModule
            text="本次拆解暂未生成可拍方案。"
            description="你可以重新发起拆解，或点击生成脚本入口继续创作。"
            actionLabel={isGeneratingScript ? "正在生成完整口播脚本" : "生成完整口播脚本"}
            onAction={() => onGenerateScript()}
            compact
          />
        </div>
      </section>
    );
  }
  const hasIntro = Boolean(
    activePlan.accountType || activePlan.title || activePlan.hook
  );
  const rewriteActions: Array<{ label: string; style: RewriteStyle }> = [
    { label: "改成更口语", style: "conversational" },
    { label: "改成小红书风格", style: "xiaohongshu" },
    { label: "改成抖音口播风格", style: "douyin" },
  ];
  return (
    <section className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gradient-to-r from-white via-violet-50/60 to-blue-50 px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal text-gray-950">
              可直接拍的方案
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              系统已经把原视频拆成了你能直接用的标题、开头、口播和分镜。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.copyPlans.map(plan => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setActiveId(plan.id)}
                className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  activePlan.id === plan.id
                    ? "border-violet-400 bg-violet-600 text-white shadow-lg shadow-violet-200"
                    : "border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:text-violet-700"
                }`}
              >
                {plan.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {hasIntro && (
              <div className="rounded-[26px] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5">
                {activePlan.accountType && (
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm">
                    <Target className="h-3.5 w-3.5" />
                    {activePlan.accountType}
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <CopyableBlock
                    title="标题"
                    content={activePlan.title}
                    maxLines={3}
                    copyLabel="复制标题"
                    className="border-white bg-white/85 shadow-sm"
                    contentClassName="text-base font-semibold leading-7 text-gray-950"
                  />
                  <CopyableBlock
                    title="开头 3 秒钩子"
                    content={activePlan.hook}
                    maxLines={3}
                    copyLabel="复制钩子"
                    className="border-white bg-white/85 shadow-sm"
                  />
                </div>
              </div>
            )}
            {activePlan.shortScript ? (
              <CopyableBlock
                title="口播稿"
                label="可直接念"
                content={activePlan.shortScript}
                maxLines={4}
                copyLabel="复制口播稿"
                className="border-emerald-100 bg-emerald-50/70 shadow-sm"
                contentClassName="text-base leading-8 text-gray-800"
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => onGenerateScript(activePlan.id)}
                      disabled={isGeneratingScript}
                      className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isGeneratingScript ? "正在生成" : "生成 60 秒完整版"}
                    </button>
                    {rewriteActions.map(action => (
                      <button
                        key={action.style}
                        type="button"
                        onClick={() => onRewriteScript(activePlan.id, action.style)}
                        disabled={isRewritingScript}
                        className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-50"
                      >
                        {isRewritingScript && rewritingStyle === action.style
                          ? "正在改写"
                          : action.label}
                      </button>
                    ))}
                  </>
                }
              />
            ) : (
              <div className="rounded-[26px] border border-emerald-100 bg-emerald-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  口播稿
                </div>
                <EmptyModule
                  text="本次拆解暂未生成可直接口播稿。"
                  description="你可以点击下方按钮，继续生成完整脚本。"
                  compact
                />
              </div>
            )}
          </div>
          <div className="space-y-4">
            {activePlan.coverText && (
              <CoverPreviewCard
                coverText={activePlan.coverText}
                title={activePlan.title}
                sourceCoverUrl={data.videoInfo.coverUrl ?? undefined}
              />
            )}
            {activePlan.commentGuide && (
              <CopyableBlock
                title="评论区引导"
                content={activePlan.commentGuide}
                maxLines={2}
                copyLabel="复制评论引导"
                className="bg-gray-50"
              />
            )}
            <PrimaryButton
              onClick={() => onGenerateScript(activePlan.id)}
              icon={Sparkles}
              className="w-full min-h-[56px]"
            >
              {isGeneratingScript ? "正在生成完整脚本" : "生成完整 60 秒口播脚本"}
            </PrimaryButton>
          </div>
        </div>
        {(activePlan.outline.length > 0 || activePlan.shots.length > 0) && (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {activePlan.outline.length > 0 && (
              <ListCard
                title="口播脚本纲要"
                items={activePlan.outline}
                copyLabel="复制纲要"
              />
            )}
            {activePlan.shots.length > 0 && (
              <ListCard
                title="分镜建议"
                items={activePlan.shots}
                copyLabel="复制分镜"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CoverPreviewCard({
  coverText,
  title,
  imageSrc,
  sourceCoverUrl,
}: {
  coverText: string;
  title?: string;
  imageSrc?: string;
  sourceCoverUrl?: string;
}) {
  const visualSrc = imageSrc || sourceCoverUrl || "";
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [visualSrc]);
  const usableVisualSrc = visualSrc && !imageFailed ? visualSrc : "";
  return (
    <div className="rounded-[26px] border border-gray-100 bg-gray-50 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-950">
          {usableVisualSrc ? "封面图" : "封面文案"}
        </div>
        <CopyButton content={coverText} label="复制封面文案" />
      </div>
      {usableVisualSrc ? (
        <div className="relative h-[260px] max-h-[320px] overflow-hidden rounded-3xl border border-gray-100 bg-gray-950 sm:h-[300px]">
          <img
            src={usableVisualSrc}
            alt={coverText || title || "封面图"}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/18 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            {!imageSrc && (
              <div className="mb-3 inline-flex rounded-full bg-white/16 px-3 py-1 text-[11px] font-semibold text-white/80 backdrop-blur">
                参考原视频封面
              </div>
            )}
            <div className="line-clamp-3 break-words text-xl font-black leading-tight tracking-normal text-yellow-300 drop-shadow [overflow-wrap:anywhere]">
              {coverText}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-gray-100 bg-white px-4 py-5">
          <div className="break-words text-xl font-black leading-tight tracking-normal text-gray-950 [overflow-wrap:anywhere]">
            {coverText}
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            当前结果没有真实封面图，完整脚本生成后会把封面图和封面文案一起放入编辑器。
          </p>
        </div>
      )}
    </div>
  );
}

function PlanCard({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <div className="rounded-[26px] border border-gray-100 bg-gray-50 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-950">
        <MessageCircle className="h-4 w-4 text-blue-600" />
        {title}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 [overflow-wrap:anywhere]">
        {body}
      </p>
    </div>
  );
}

function ListCard({
  title,
  items,
  copyLabel = "复制",
}: {
  title: string;
  items: string[];
  copyLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
          <FileText className="h-4 w-4 text-blue-600" />
          {title}
        </div>
        <CopyButton content={items.join("\n")} label={copyLabel} />
      </div>
      <ol className="space-y-3">
        {dedupeList(items).map((item, index) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-gray-700">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
              {index + 1}
            </span>
            <ExpandableText text={item} maxLines={2} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildDeepInsights(data: WorkspaceData) {
  const insights: string[] = [];
  const firstEmotion = data.emotionStages[0];
  if (firstEmotion?.emotion || firstEmotion?.videoAction || firstEmotion?.copyAdvice) {
    insights.push(
      [
        firstEmotion.time ? `${firstEmotion.time}：` : "",
        firstEmotion.emotion ? `用户情绪是「${firstEmotion.emotion}」` : "",
        firstEmotion.videoAction ? `，视频动作是「${firstEmotion.videoAction}」` : "",
        firstEmotion.copyAdvice ? `，复制时可以「${firstEmotion.copyAdvice}」` : "",
      ].join("")
    );
  }
  const firstInteraction = data.interactionAnalysis[0];
  if (firstInteraction?.detail || firstInteraction?.label) {
    insights.push(
      `${firstInteraction.label}：${firstInteraction.detail || firstInteraction.value}`
    );
  }
  const firstPitfall = data.avoidPitfalls[0];
  if (firstPitfall) {
    insights.push(`复制时先避开：${firstPitfall}`);
  }
  const firstKeep = data.copyDecision?.keep?.[0];
  if (firstKeep) {
    insights.push(`你最该先学的是：${firstKeep}`);
  }
  return takeTopItems(insights.filter(Boolean), 3);
}

function DeepAnalysisSection({ data }: { data: WorkspaceData }) {
  const hasEmotion = data.emotionCurve.length > 0 || data.emotionStages.length > 0;
  const hasAudience = data.audienceMotivation.length > 0;
  const hasInteraction = data.interactionAnalysis.length > 0;
  const hasAlgorithm = data.algorithmFriendlyScore.length > 0;
  const hasPitfalls = data.avoidPitfalls.length > 0;
  const insights = buildDeepInsights(data);
  const [expanded, setExpanded] = useState(false);
  if (
    !hasEmotion &&
    !hasAudience &&
    !hasInteraction &&
    !hasAlgorithm &&
    !hasPitfalls
  ) {
    return null;
  }
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-gray-950">
            为什么能火
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            先看能直接指导复拍的洞察，完整情绪、动机和算法细节可展开查看。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="w-fit rounded-full bg-gray-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
        >
          {expanded ? "收起完整分析" : "展开完整分析"}
        </button>
      </div>
      {insights.length > 0 && (
        <div className="mb-5 rounded-[26px] border border-violet-100 bg-violet-50/70 p-5">
          <div className="mb-3 text-sm font-semibold text-violet-900">
            本条视频的关键洞察
          </div>
          <ExpandableList
            items={insights}
            maxItems={3}
            className="grid gap-3 md:grid-cols-3"
            renderItem={(item, index) => (
              <div
                key={`${item}-${index}`}
                className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-gray-700 shadow-sm"
              >
                <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <ExpandableText text={item} maxLines={3} />
              </div>
            )}
          />
        </div>
      )}
      {expanded && (
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          {hasEmotion && (
            <div className="min-w-0 xl:col-span-2">
              <EmotionCurveCard data={data} />
            </div>
          )}
          {hasAudience && <AudienceMotivationCard data={data} />}
          {hasInteraction && <InteractionAnalysisCard data={data} />}
          {hasAlgorithm && <AlgorithmFriendlyCard data={data} />}
          {hasPitfalls && <AvoidPitfallsCard data={data} />}
        </div>
      )}
    </section>
  );
}

function EmotionCurveCard({ data }: { data: WorkspaceData }) {
  const [showAllCurve, setShowAllCurve] = useState(false);
  const [showAllStages, setShowAllStages] = useState(false);
  const visibleCurve = showAllCurve ? data.emotionCurve : data.emotionCurve.slice(0, 3);
  const visibleStages = showAllStages ? data.emotionStages : data.emotionStages.slice(0, 3);
  return (
    <div className="min-w-0 overflow-hidden rounded-[26px] border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950">
        <BarChart3 className="h-4 w-4 text-blue-600" />
        情绪曲线
      </div>
      {data.emotionCurve.length > 0 && (
        <>
          <div className="relative mb-3 grid min-w-0 gap-3 overflow-hidden rounded-3xl bg-white p-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_86%_18%,rgba(16,185,129,0.10),transparent_28%)]" />
            <svg viewBox="0 0 420 112" className="relative h-12 w-full">
              <path
                d="M10 74 C52 34, 88 80, 132 44 S214 28, 254 56 S330 78, 410 24"
                fill="none"
                stroke="#6366f1"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M10 74 C52 34, 88 80, 132 44 S214 28, 254 56 S330 78, 410 24"
                fill="none"
                stroke="#c4b5fd"
                strokeWidth="10"
                strokeLinecap="round"
                opacity="0.25"
              />
            </svg>
            <div className="relative grid gap-2 sm:grid-cols-3">
              {visibleCurve.map((item, index) => (
                <div
                  key={`${item.emotion}-node-${item.time}`}
                  className="rounded-2xl border border-violet-100 bg-white/86 px-3 py-2 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-gray-950">
                        {item.emotion}
                      </div>
                      <div className="text-[11px] text-gray-400">{item.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {visibleCurve.map(item => (
              <div
                key={`${item.emotion}-${item.time}`}
                className="rounded-2xl bg-white px-3 py-2"
              >
                <div className="text-xs font-semibold text-gray-900">
                  {item.emotion} · {item.time}
                </div>
                <ExpandableText
                  text={item.videoMove}
                  maxLines={2}
                  className="mt-1 text-xs leading-5 text-gray-500"
                />
                <ExpandableText
                  text={item.copyAdvice}
                  maxLines={2}
                  className="mt-2 text-xs font-semibold leading-5 text-blue-700"
                />
              </div>
            ))}
          </div>
          {data.emotionCurve.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllCurve(value => !value)}
              className="mt-3 text-xs font-semibold text-violet-700 transition hover:text-violet-900"
            >
              {showAllCurve ? "收起" : `展开剩余 ${data.emotionCurve.length - 3} 条`}
            </button>
          )}
        </>
      )}
      {data.emotionStages.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-gray-100 bg-white">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[0.9fr_0.8fr_0.8fr_1.3fr_1.2fr] gap-0 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500">
            <span>阶段</span>
            <span>时间</span>
            <span>用户情绪</span>
            <span>视频动作</span>
            <span>复制建议</span>
          </div>
          {visibleStages.map(item => (
            <div
              key={`${item.stage}-${item.time}`}
              className="grid grid-cols-[0.9fr_0.8fr_0.8fr_1.3fr_1.2fr] gap-0 border-b border-gray-50 px-4 py-3 text-xs leading-5 last:border-b-0"
            >
              <span className="font-semibold text-gray-900">{item.stage}</span>
              <span className="text-gray-500">{item.time}</span>
              <span className="font-semibold text-amber-700">
                {item.emotion}
              </span>
              <span className="text-gray-600">
                <ExpandableText text={item.videoAction} maxLines={2} />
              </span>
              <span className="font-semibold text-blue-700">
                <ExpandableText text={item.copyAdvice} maxLines={2} />
              </span>
            </div>
          ))}
        </div>
        {data.emotionStages.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllStages(value => !value)}
            className="px-4 py-3 text-xs font-semibold text-violet-700 transition hover:text-violet-900"
          >
            {showAllStages ? "收起" : `展开剩余 ${data.emotionStages.length - 3} 条`}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

function AudienceMotivationCard({ data }: { data: WorkspaceData }) {
  return (
    <SimpleAnalysisCard icon={Target} title="受众动机">
      <ExpandableList
        items={data.audienceMotivation}
        maxItems={2}
        className="space-y-2"
        renderItem={(item, index) => (
          <div key={`${item}-${index}`} className="rounded-2xl bg-white px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              {splitActionText(item).label}
            </div>
            {splitActionText(item).detail && (
              <ExpandableText
                text={splitActionText(item).detail}
                maxLines={2}
                className="mt-1 pl-5 text-xs leading-5 text-gray-500"
              />
            )}
          </div>
        )}
      />
    </SimpleAnalysisCard>
  );
}

function InteractionAnalysisCard({ data }: { data: WorkspaceData }) {
  return (
    <SimpleAnalysisCard icon={MessageCircle} title="互动与传播">
      <div className="space-y-2">
        <ExpandableList
          items={data.interactionAnalysis.map(
            item => `${item.label}：${item.value}${item.detail ? `；${item.detail}` : ""}`
          )}
          maxItems={2}
          className="space-y-2"
          renderItem={(itemText, index) => {
            const item = data.interactionAnalysis[index];
            return (
          <div
            key={`${item?.label ?? itemText}-${index}`}
            className={`rounded-2xl border px-3 py-2 ${toneClasses(item.tone)}`}
          >
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
            <ExpandableText
              text={item.detail}
              maxLines={2}
              className="mt-1 text-xs leading-5 text-gray-600"
            />
          </div>
            );
          }}
        />
      </div>
    </SimpleAnalysisCard>
  );
}

function AlgorithmFriendlyCard({ data }: { data: WorkspaceData }) {
  return (
    <SimpleAnalysisCard icon={ShieldCheck} title="算法友好度">
      <ExpandableList
        items={data.algorithmFriendlyScore.map(
          item => `${item.label}：${item.value}${item.detail ? `；${item.detail}` : ""}`
        )}
        maxItems={2}
        className="space-y-2"
        renderItem={(itemText, index) => {
          const item = data.algorithmFriendlyScore[index];
          return (
          <div key={`${item?.label ?? itemText}-${index}`} className="rounded-2xl bg-white px-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-900">
              <span>{item.label}</span>
              <span className="text-emerald-600">{item.value}</span>
            </div>
            <ExpandableText
              text={item.detail}
              maxLines={2}
              className="mt-1 text-xs leading-5 text-gray-500"
            />
          </div>
          );
        }}
      />
    </SimpleAnalysisCard>
  );
}

function AvoidPitfallsCard({ data }: { data: WorkspaceData }) {
  return (
    <SimpleAnalysisCard icon={AlertTriangle} title="复制时要避开的坑">
      <ExpandableList
        items={data.avoidPitfalls}
        maxItems={2}
        className="space-y-2"
        renderItem={(item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex gap-2 rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-gray-700"
          >
            <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <ExpandableText text={item} maxLines={2} />
          </div>
        )}
      />
    </SimpleAnalysisCard>
  );
}

function SimpleAnalysisCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-gray-100 bg-gray-50 p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-950">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

function ActionStatusToast({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed right-5 top-20 z-50 max-w-[360px] rounded-2xl border border-blue-100 bg-white/96 px-4 py-3 text-sm font-medium text-blue-700 shadow-xl shadow-gray-200/80 backdrop-blur">
      {message}
    </div>
  );
}

function ResultPageLayout({
  children,
  rightPanel,
}: {
  children: React.ReactNode;
  rightPanel: React.ReactNode;
}) {
  return (
    <div className="relative -mx-4 -my-8 bg-[#f7f8fb] px-4 py-6 sm:-mx-6 sm:-my-10 sm:px-6">
      <div className="mx-auto max-w-[1560px]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-5">{children}</main>
          <div className="min-w-0">{rightPanel}</div>
        </div>
      </div>
    </div>
  );
}

function ViralBreakdownBody({ result }: ArtifactRendererProps) {
  if (result.taskPayload.kind !== "viral_breakdown") {
    return null;
  }
  const payload = result.taskPayload;
  const data = useMemo(
    () => normalizeBreakdownResult(result, payload),
    [result, payload]
  );
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isRewritingScript, setIsRewritingScript] = useState(false);
  const [rewritingStyle, setRewritingStyle] = useState<RewriteStyle | null>(null);
  const effectiveData = data;
  useEffect(() => {
    if (!actionStatus) return;
    const timer = window.setTimeout(() => setActionStatus(null), 3200);
    return () => window.clearTimeout(timer);
  }, [actionStatus]);

  useEffect(() => {
    const handleCopyToast = (event: Event) => {
      const message =
        event instanceof CustomEvent && typeof event.detail?.message === "string"
          ? event.detail.message
          : "已复制，可以直接粘贴使用。";
      setActionStatus(message);
    };
    window.addEventListener("viral-breakdown-copy", handleCopyToast);
    return () => window.removeEventListener("viral-breakdown-copy", handleCopyToast);
  }, []);

  const handleGenerateScript = async (selectedPlanId?: string) => {
    if (isGeneratingScript) return;
    const selectedPlan =
      data.copyPlans.find(plan => plan.id === selectedPlanId) ?? data.copyPlans[0];
    setIsGeneratingScript(true);
    setActionStatus("正在生成完整口播脚本和 image 模型封面预览...");
    try {
      const response = await fetch("/api/viral-breakdown/complete-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          taskPayload: payload,
          selectedPlanId,
          resultTitle: result.title,
          query: result.query,
        }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        script?: unknown;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "生成完整口播脚本失败");
      }
      const script = normalizeGeneratedScript(json.script);
      openResultEditor({
        title: "完整口播脚本",
        subtitle: "已统一放入编辑器，可继续修改、复制或导出。",
        markdown: buildGeneratedScriptMarkdown({
          script,
          plan: selectedPlan,
          data,
        }),
      });
      setActionStatus(
        script.coverImageUrl || script.coverImageB64
          ? "完整口播脚本和封面图已放入编辑器。"
          : "完整口播脚本已放入编辑器，封面图暂未生成成功。"
      );
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "生成完整口播脚本失败");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleRewriteScript = async (
    selectedPlanId: string,
    rewriteStyle: RewriteStyle
  ) => {
    if (isRewritingScript) return;
    const selectedPlan = data.copyPlans.find(plan => plan.id === selectedPlanId);
    if (!selectedPlan?.shortScript) {
      setActionStatus("当前方案没有可改写的口播稿。");
      return;
    }
    setIsRewritingScript(true);
    setRewritingStyle(rewriteStyle);
    setActionStatus("正在基于真实口播稿改写...");
    try {
      const response = await fetch("/api/viral-breakdown/rewrite-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          taskPayload: payload,
          selectedPlanId,
          rewriteStyle,
          currentScript: selectedPlan.shortScript,
          resultTitle: result.title,
          query: result.query,
        }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        rewrittenScript?: unknown;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "改写口播稿失败");
      }
      const script = normalizeRewrittenScript(
        json.rewrittenScript,
        selectedPlanId,
        rewriteStyle
      );
      openResultEditor({
        title: `${script.styleLabel}改写稿`,
        subtitle: "已统一放入编辑器，可继续修改、复制或导出。",
        markdown: buildRewrittenScriptMarkdown({
          script,
          plan: selectedPlan,
        }),
      });
      setActionStatus(`${script.styleLabel}改写已放入编辑器。`);
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "改写口播稿失败");
    } finally {
      setIsRewritingScript(false);
      setRewritingStyle(null);
    }
  };

  return (
    <ResultPageLayout
      rightPanel={
        <RightCreationPanel
          data={effectiveData}
          onGenerateScript={handleGenerateScript}
          isGeneratingScript={isGeneratingScript}
        />
      }
    >
      <ActionStatusToast message={actionStatus} />
      <HeroVideoSummary data={effectiveData} />
      <HeroActions
        onGenerateScript={handleGenerateScript}
        isGeneratingScript={isGeneratingScript}
      />
      <CopyPlanTabs
        data={effectiveData}
        onGenerateScript={handleGenerateScript}
        onRewriteScript={handleRewriteScript}
        isGeneratingScript={isGeneratingScript}
        isRewritingScript={isRewritingScript}
        rewritingStyle={rewritingStyle}
      />
      <VideoTimelineAnalysis
        data={effectiveData}
      />
      <ViralFormulaBlock data={effectiveData} />
      <DeepAnalysisSection data={effectiveData} />
    </ResultPageLayout>
  );
}

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const payload =
    result.taskPayload.kind === "viral_breakdown" ? result.taskPayload : null;
  const score =
    payload?.copyScore ?? payload?.overallScore ?? result.score;
  return [
    {
      label: "可复制指数",
      value: score != null ? `${score} / 100` : "暂未生成",
      detail:
        payload?.copyDecision?.level ?? payload?.copyLevel ?? "暂未生成可复制判断",
    },
    {
      label: "核心玩法",
      value:
        payload?.corePlay ??
        payload?.contentStructure ??
        payload?.breakdownSummary ??
        "暂未生成",
      detail: payload?.formulaSummary ?? payload?.oneLinerComment ?? "暂未生成公式说明",
    },
    {
      label: "适合账号",
      value:
        payload?.suitableAccounts?.slice(0, 3).join(" / ") ??
        payload?.targetAudience ??
        "暂未生成",
      detail: payload?.imitationAdvice ?? "暂未生成复制建议",
    },
  ];
}

function getDeepDive(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续生成创作方案",
    description: "围绕这条爆款继续生成脚本、封面、评论区引导。",
    placeholder: "帮我把这条爆款改成我的账号能拍的版本",
    quickActions: [
      { label: "生成同款脚本", cost: 30 },
      { label: "生成封面标题", cost: 10 },
      { label: "生成评论区引导", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  return [
    {
      id: "remake_script",
      icon: Sparkles,
      title: "生成同款脚本",
      description: "保留爆点结构，改成你的账号能直接拍的版本",
      value: "带分镜 + 口播 + CTA",
      cost: 30,
      prompt: `基于这次爆款拆解（${result.query}），生成一版适合我的账号直接拍的同款脚本，包含标题、开头3秒钩子、分镜、口播、封面文案和评论区引导。`,
      highlight: true,
    },
    {
      id: "extract_hooks",
      icon: Scissors,
      title: "提取钩子和金句",
      description: "把最值得复用的表达方式拆出来",
      value: "获得可迁移钩子库",
      cost: 10,
      prompt: `基于这次爆款拆解（${result.query}），提取所有可迁移的钩子、金句、CTA 模式和评论区引导句式。`,
    },
    {
      id: "find_similar",
      icon: Target,
      title: "生成 5 个相似选题",
      description: "围绕同一爆款公式扩展可拍选题",
      value: "获取更多可复用选题",
      cost: 20,
      prompt: `基于这次爆款拆解（${result.query}），用同一个爆款公式生成 5 个适合不同账号类型的相似选题，并说明各自适合的平台和开头钩子。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map(item => ({
      label: item.actionLabel,
      prompt: `基于这次爆款拆解，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "生成完整脚本", prompt: "生成完整脚本" },
    { label: "生成封面标题", prompt: "生成封面标题" },
  ];
}

registerArtifactRenderer({
  artifactType: "breakdown_sheet",
  taskIntent: "viral_breakdown",
  component: ViralBreakdownBody,
  validatePayload: r => r.taskPayload?.kind === "viral_breakdown",
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { ViralBreakdownBody };
