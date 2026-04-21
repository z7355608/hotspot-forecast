import { useEffect, useState } from "react";
import { ArrowLeft, Clock, FileX } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ResultsView } from "../components/ResultsView";
import {
  fetchResultArtifact,
  type SavedResultArtifactDetail,
} from "../lib/result-artifacts-api";
import type { ResultRecord } from "../store/app-data";
import { useAppStore } from "../store/app-store";

const RESULT_TYPES = ["爆款预测", "趋势观察", "爆款拆解", "选题策略", "文案提取", "账号诊断"] as const;
const VERDICTS = ["go_now", "test_small", "observe", "not_now"] as const;
const CONFIDENCE_LABELS = ["高", "中", "低"] as const;
const OPPORTUNITY_TYPES = [
  "search_window",
  "anomaly_window",
  "structure_window",
  "fit_window",
  "false_heat",
] as const;
const WINDOW_STRENGTHS = ["strong_now", "validate_first", "observe", "avoid"] as const;
const INPUT_KINDS = ["prompt", "account", "content_url", "uploaded_asset"] as const;
const PERSONALIZATION_MODES = ["public", "cookie"] as const;
const TASK_INTENTS = [
  "opportunity_prediction",
  "trend_watch",
  "viral_breakdown",
  "topic_strategy",
  "copy_extraction",
  "account_diagnosis",
  "direct_request",
] as const;
const TASK_INTENT_CONFIDENCE = ["high", "medium", "low"] as const;
const ENTRY_SOURCES = ["manual", "example", "skill"] as const;
const ACTION_TYPES = [
  "low_follower_validation",
  "breakdown",
  "account_benchmark",
  "monitor",
  "generate_test_brief",
] as const;
const ACTION_MODES = ["navigate", "open_deep_dive", "save_snapshot"] as const;
const ACTION_LEVELS = ["shoot_now", "test_one", "watch_first", "not_now"] as const;
const ALIGNMENTS = ["strong", "medium", "weak"] as const;

const DEFAULT_MARKET_EVIDENCE = {
  evidenceWindowLabel: "证据待补充",
  momentumLabel: "cooling",
  kolCount: 0,
  kocCount: 0,
  newCreatorCount: 0,
  similarContentCount: 0,
  growth7d: 0,
  lowFollowerAnomalyRatio: 0,
  timingLabel: "已保存的分析快照，可以随时回看和追加数据。",
  tierBreakdown: {
    headKol: 0,
    standardKol: 0,
    strongKoc: 0,
    standardKoc: 0,
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return typeof value === "string" && allowed.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}

function normalizeRemoteResult(detail: SavedResultArtifactDetail): ResultRecord {
  const snapshot = isRecord(detail.snapshot) ? detail.snapshot : {};
  const normalizedBrief = isRecord(snapshot.normalizedBrief) ? snapshot.normalizedBrief : {};
  const bestActionSource = isRecord(snapshot.bestActionNow) ? snapshot.bestActionNow : {};
  const recommendedActionSource = isRecord(snapshot.recommendedNextAction)
    ? snapshot.recommendedNextAction
    : bestActionSource;
  const primaryCardSource = isRecord(snapshot.primaryCard) ? snapshot.primaryCard : {};
  const secondaryCardSource = isRecord(snapshot.secondaryCard) ? snapshot.secondaryCard : {};
  const marketEvidenceSource = isRecord(snapshot.marketEvidence) ? snapshot.marketEvidence : {};
  const tierBreakdownSource = isRecord(marketEvidenceSource.tierBreakdown)
    ? marketEvidenceSource.tierBreakdown
    : {};
  const screeningSource = isRecord(snapshot.screeningReport) ? snapshot.screeningReport : {};
  const operatorPanelSource = isRecord(snapshot.operatorPanel) ? snapshot.operatorPanel : undefined;
  const primaryArtifactSource = isRecord(snapshot.primaryArtifact) ? snapshot.primaryArtifact : {};
  const taskPayloadSource = isRecord(snapshot.taskPayload) ? snapshot.taskPayload : {};
  const agentRunSource = isRecord(snapshot.agentRun) ? snapshot.agentRun : {};

  const defaultAction = {
    type: "monitor" as const,
    title: "持续跟踪这个方向",
    description: "已保存的分析结果，可以随时回看并追加新数据。",
    ctaLabel: "查看分析要点",
    reason: "已保存的分析快照，可以基于当前结果继续探索。",
  };

  const bestActionNow = {
    type: asEnum(bestActionSource.type, ACTION_TYPES, defaultAction.type),
    title: asString(bestActionSource.title, defaultAction.title),
    description: asString(bestActionSource.description, defaultAction.description),
    ctaLabel: asString(bestActionSource.ctaLabel, defaultAction.ctaLabel),
    reason: asString(bestActionSource.reason, defaultAction.reason),
  };

  const recommendedNextAction = {
    type: asEnum(recommendedActionSource.type, ACTION_TYPES, bestActionNow.type),
    title: asString(recommendedActionSource.title, bestActionNow.title),
    description: asString(recommendedActionSource.description, bestActionNow.description),
    ctaLabel: asString(recommendedActionSource.ctaLabel, bestActionNow.ctaLabel),
    reason: asString(recommendedActionSource.reason, bestActionNow.reason),
  };

  const defaultCard = {
    title: bestActionNow.title,
    ctaLabel: bestActionNow.ctaLabel,
    description: bestActionNow.description,
    reason: bestActionNow.reason,
    previewSections: [
      {
        title: "当前可确认的结果",
        items: [bestActionNow.reason],
        tone: "neutral" as const,
      },
    ],
    continueIf: ["追加更多支持账号、内容样本或评论数据后，分析结论会更精准。"],
    stopIf: ["如果方向变化较大，可以考虑调整角度重新分析。"],
    evidenceRefs: [],
    actionMode: "open_deep_dive" as const,
    actionTarget: undefined,
    actionPrompt: bestActionNow.title,
  };

  const buildCard = (source: Record<string, unknown>) => ({
    title: asString(source.title, defaultCard.title),
    ctaLabel: asString(source.ctaLabel, defaultCard.ctaLabel),
    description: asString(source.description, defaultCard.description),
    reason: asString(source.reason, defaultCard.reason),
    previewSections: Array.isArray(source.previewSections)
      ? source.previewSections
          .filter(isRecord)
          .map((section) => ({
            title: asString(section.title, "结果预览"),
            items: asStringArray(section.items),
            tone: asEnum(section.tone, ["positive", "neutral", "warning"] as const, "neutral"),
          }))
          .filter((section) => section.items.length > 0)
      : defaultCard.previewSections,
    continueIf: asStringArray(source.continueIf).length > 0
      ? asStringArray(source.continueIf)
      : defaultCard.continueIf,
    stopIf: asStringArray(source.stopIf).length > 0 ? asStringArray(source.stopIf) : defaultCard.stopIf,
    evidenceRefs: asStringArray(source.evidenceRefs),
    actionMode: asEnum(source.actionMode, ACTION_MODES, defaultCard.actionMode),
    actionTarget: typeof source.actionTarget === "string" ? source.actionTarget : undefined,
    actionPrompt: typeof source.actionPrompt === "string" ? source.actionPrompt : undefined,
  });

  const whyNowItems = Array.isArray(snapshot.whyNowItems)
    ? snapshot.whyNowItems.filter(isRecord).map((item) => ({
        sourceLabel: asString(item.sourceLabel, "已保存结果"),
        fact: asString(item.fact, bestActionNow.reason),
        inference: asString(item.inference, "当前快照更适合作为复看依据，而不是重新拼造新的强结论。"),
        userImpact: asString(item.userImpact, "先看清楚这条判断的事实边界，再决定是否继续投入。"),
        tone: asEnum(item.tone, ["positive", "neutral", "warning"] as const, "neutral"),
      }))
    : [
        {
          sourceLabel: "已保存结果",
          fact: bestActionNow.reason,
          inference: "已保存的分析快照，可以随时回看并追加新数据。",
          userImpact: "你可以随时回看这次分析，也可以基于当前结果发起新的探索。",
          tone: "neutral" as const,
        },
      ];

  const taskIntent = asEnum(snapshot.taskIntent, TASK_INTENTS, "opportunity_prediction");
  const taskIntentConfidence = asEnum(
    snapshot.taskIntentConfidence,
    TASK_INTENT_CONFIDENCE,
    "low",
  );
  const entrySource = asEnum(snapshot.entrySource, ENTRY_SOURCES, "manual");
  const title = asString(
    snapshot.title,
    asString(snapshot.opportunityTitle, detail.title ?? detail.opportunityTitle),
  );
  const summary = asString(
    snapshot.summary,
    asString(snapshot.coreBet, detail.summary ?? detail.coreBet ?? bestActionNow.reason),
  );
  const primaryCtaLabel = asString(
    snapshot.primaryCtaLabel,
    bestActionNow.ctaLabel,
  );
  const primaryArtifact = {
    artifactId: asString(primaryArtifactSource.artifactId, detail.artifactId),
    runId: asString(primaryArtifactSource.runId, asString(agentRunSource.runId, detail.artifactId)),
    taskIntent,
    artifactType: asEnum(
      primaryArtifactSource.artifactType,
      [
        "opportunity_memo",
        "trend_watchlist",
        "breakdown_sheet",
        "topic_plan",
        "copy_pack",
        "account_diagnosis_sheet",
      ] as const,
      "opportunity_memo",
    ),
    title: asString(primaryArtifactSource.title, title),
    summary: asString(primaryArtifactSource.summary, summary),
    payload: taskPayloadSource,
    snapshotRefs: asStringArray(primaryArtifactSource.snapshotRefs),
    createdAt: asString(primaryArtifactSource.createdAt, detail.createdAt),
    updatedAt: asString(primaryArtifactSource.updatedAt, detail.updatedAt),
    watchable:
      typeof primaryArtifactSource.watchable === "boolean" ? primaryArtifactSource.watchable : true,
    shareable:
      typeof primaryArtifactSource.shareable === "boolean" ? primaryArtifactSource.shareable : true,
  };
  const recommendedNextTasks = Array.isArray(snapshot.recommendedNextTasks)
    ? snapshot.recommendedNextTasks.filter(isRecord).map((item) => ({
        taskIntent: asEnum(item.taskIntent, TASK_INTENTS, "opportunity_prediction"),
        title: asString(item.title, "继续这个任务"),
        reason: asString(item.reason, bestActionNow.reason),
        actionLabel: asString(item.actionLabel, bestActionNow.ctaLabel),
      }))
    : [
        {
          taskIntent: "opportunity_prediction" as const,
          title: bestActionNow.title,
          reason: bestActionNow.reason,
          actionLabel: bestActionNow.ctaLabel,
        },
      ];
  const taskPayload =
    taskPayloadSource.kind && typeof taskPayloadSource.kind === "string"
      ? (taskPayloadSource as unknown as ResultRecord["taskPayload"])
      : {
          kind: "opportunity_prediction" as const,
          highlight: summary,
          verdictLabel: bestActionNow.title,
          evidenceSummary: whyNowItems.map((item) => item.fact).slice(0, 3),
          bestActionReason: bestActionNow.reason,
          supportingProofTitles: asStringArray(
            Array.isArray(snapshot.supportingContents)
              ? snapshot.supportingContents
                  .filter(isRecord)
                  .map((content) => asString(content.title, ""))
              : [],
          ).slice(0, 4),
        };
  const evidenceRefs = isRecord(snapshot.evidenceRefs)
    ? {
        supportingAccountIds: asStringArray(snapshot.evidenceRefs.supportingAccountIds),
        supportingContentIds: asStringArray(snapshot.evidenceRefs.supportingContentIds),
        lowFollowerSampleIds: asStringArray(snapshot.evidenceRefs.lowFollowerSampleIds),
      }
    : undefined;
  const scoreBreakdown = isRecord(snapshot.scoreBreakdown)
    ? {
        demand: asNumber(snapshot.scoreBreakdown.demand, 0),
        competition: asNumber(snapshot.scoreBreakdown.competition, 0),
        anomaly: asNumber(snapshot.scoreBreakdown.anomaly, 0),
        fit: asNumber(snapshot.scoreBreakdown.fit, 0),
        opportunity: asNumber(snapshot.scoreBreakdown.opportunity, 0),
        timing: asNumber(snapshot.scoreBreakdown.timing, 0),
        risk: asNumber(snapshot.scoreBreakdown.risk, 0),
      }
    : {
        demand: 0,
        competition: 0,
        anomaly: 0,
        fit: 0,
        opportunity: 0,
        timing: 0,
        risk: 0,
      };
  const classificationReasons = asStringArray(snapshot.classificationReasons);
  const agentRun = {
    runId: asString(agentRunSource.runId, detail.artifactId),
    source: asEnum(
      agentRunSource.source,
      ["home_input", "example", "skill", "follow_up", "watch_runtime"] as const,
      "home_input",
    ),
    taskIntent,
    taskIntentConfidence,
    status: asEnum(
      agentRunSource.status,
      ["queued", "running", "completed", "degraded", "failed"] as const,
      "completed",
    ),
    brief: {
      inputKind: asEnum(normalizedBrief.inputKind, INPUT_KINDS, "prompt"),
      seedTopic: asString(normalizedBrief.seedTopic, asString(snapshot.query, detail.query)),
      industry: asString(normalizedBrief.industry, "泛内容创作"),
      candidatePlatforms: asStringArray(normalizedBrief.candidatePlatforms),
      accountContext: asString(normalizedBrief.accountContext, "已保存快照恢复"),
      competitorEvidence: asStringArray(normalizedBrief.competitorEvidence),
      personalizationMode: asEnum(
        normalizedBrief.personalizationMode,
        PERSONALIZATION_MODES,
        "public",
      ),
    },
    facts: {
      platformSnapshots: Array.isArray(snapshot.platformSnapshots) ? snapshot.platformSnapshots : [],
      scoreBreakdown,
      evidenceRefs,
    },
    judgment: {
      title,
      summary,
      verdict: asEnum(snapshot.verdict, VERDICTS, "observe"),
      confidenceLabel: asEnum(snapshot.confidenceLabel, CONFIDENCE_LABELS, "低"),
      bestAction: bestActionNow,
    },
    deliverables: Array.isArray(agentRunSource.deliverables) ? agentRunSource.deliverables : [],
    recommendedNextTasks,
    artifacts: [primaryArtifact],
    runtimeMeta: isRecord(agentRunSource.runtimeMeta) ? agentRunSource.runtimeMeta : undefined,
    degradeFlags: asStringArray(agentRunSource.degradeFlags),
    taskPayload,
  };

  return {
    id: asString(snapshot.id, detail.artifactId),
    dataMode: "live",
    taskIntent,
    taskIntentConfidence,
    entrySource,
    title,
    summary,
    primaryCtaLabel,
    query: asString(snapshot.query, detail.query),
    type: asEnum(snapshot.type, RESULT_TYPES, "爆款预测"),
    modelId: asEnum(snapshot.modelId, ["doubao", "gpt54", "claude46"] as const, "doubao"),
    platform:
      asStringArray(snapshot.platform).length > 0
        ? asStringArray(snapshot.platform)
        : detail.platform,
    score: asNumber(snapshot.score, detail.score ?? 0),
    scoreLabel: asString(snapshot.scoreLabel, detail.scoreLabel ?? "待补证据"),
    createdAt: asString(snapshot.createdAt, detail.createdAt),
    updatedAt: asString(snapshot.updatedAt, detail.updatedAt),
    verdict: asEnum(snapshot.verdict, VERDICTS, "observe"),
    confidenceLabel: asEnum(snapshot.confidenceLabel, CONFIDENCE_LABELS, "低"),
    opportunityTitle: asString(snapshot.opportunityTitle, detail.opportunityTitle),
    opportunityType: asEnum(snapshot.opportunityType, OPPORTUNITY_TYPES, "search_window"),
    windowStrength: asEnum(snapshot.windowStrength, WINDOW_STRENGTHS, "observe"),
    coreBet: asString(
      snapshot.coreBet,
      detail.coreBet ?? "已保存的分析结果，可以随时回看并基于新数据继续探索。",
    ),
    decisionBoundary: asString(
      snapshot.decisionBoundary,
      "这是已保存的分析快照，可以基于当前结果继续追加数据或发起新的分析。",
    ),
    marketEvidence: {
      evidenceWindowLabel: asString(
        marketEvidenceSource.evidenceWindowLabel,
        DEFAULT_MARKET_EVIDENCE.evidenceWindowLabel,
      ),
      momentumLabel: asEnum(
        marketEvidenceSource.momentumLabel,
        ["emerging", "accelerating", "crowded", "cooling"] as const,
        DEFAULT_MARKET_EVIDENCE.momentumLabel,
      ),
      kolCount: asNumber(marketEvidenceSource.kolCount, DEFAULT_MARKET_EVIDENCE.kolCount),
      kocCount: asNumber(marketEvidenceSource.kocCount, DEFAULT_MARKET_EVIDENCE.kocCount),
      newCreatorCount: asNumber(
        marketEvidenceSource.newCreatorCount,
        DEFAULT_MARKET_EVIDENCE.newCreatorCount,
      ),
      similarContentCount: asNumber(
        marketEvidenceSource.similarContentCount,
        DEFAULT_MARKET_EVIDENCE.similarContentCount,
      ),
      growth7d: asNumber(marketEvidenceSource.growth7d, DEFAULT_MARKET_EVIDENCE.growth7d),
      lowFollowerAnomalyRatio: asNumber(
        marketEvidenceSource.lowFollowerAnomalyRatio,
        DEFAULT_MARKET_EVIDENCE.lowFollowerAnomalyRatio,
      ),
      timingLabel: asString(marketEvidenceSource.timingLabel, DEFAULT_MARKET_EVIDENCE.timingLabel),
      tierBreakdown: {
        headKol: asNumber(tierBreakdownSource.headKol, DEFAULT_MARKET_EVIDENCE.tierBreakdown.headKol),
        standardKol: asNumber(
          tierBreakdownSource.standardKol,
          DEFAULT_MARKET_EVIDENCE.tierBreakdown.standardKol,
        ),
        strongKoc: asNumber(
          tierBreakdownSource.strongKoc,
          DEFAULT_MARKET_EVIDENCE.tierBreakdown.strongKoc,
        ),
        standardKoc: asNumber(
          tierBreakdownSource.standardKoc,
          DEFAULT_MARKET_EVIDENCE.tierBreakdown.standardKoc,
        ),
      },
    },
    supportingAccounts: Array.isArray(snapshot.supportingAccounts)
      ? snapshot.supportingAccounts.filter(isRecord).map((account) => ({
          accountId: asString(account.accountId, `account-${Math.random().toString(36).slice(2, 8)}`),
          displayName: asString(account.displayName, "未命名账号"),
          handle: asString(account.handle, "unknown"),
          platform: asString(account.platform, "unknown"),
          tierLabel: asEnum(
            account.tierLabel,
            ["head_kol", "standard_kol", "strong_koc", "standard_koc", "watch_account"] as const,
            "watch_account",
          ),
          followerCount: typeof account.followerCount === "number" ? account.followerCount : null,
          followingCount: typeof account.followingCount === "number" ? account.followingCount : null,
          totalLikeCount: typeof account.totalLikeCount === "number" ? account.totalLikeCount : null,
          avgEngagementRate30d:
            typeof account.avgEngagementRate30d === "number" ? account.avgEngagementRate30d : null,
          breakoutHitRate30d:
            typeof account.breakoutHitRate30d === "number" ? account.breakoutHitRate30d : null,
          recentTopicClusters: asStringArray(account.recentTopicClusters),
          whyIncluded: asString(
            account.whyIncluded,
            "这条账号样本来自已保存结果，但原始快照没有附带完整纳入理由。",
          ),
        }))
      : [],
    supportingContents: Array.isArray(snapshot.supportingContents)
      ? snapshot.supportingContents.filter(isRecord).map((content) => ({
          contentId: asString(content.contentId, `content-${Math.random().toString(36).slice(2, 8)}`),
          title: asString(content.title, "未命名内容"),
          authorName: asString(content.authorName, "未知作者"),
          platform: asString(content.platform, "unknown"),
          publishedAt: asString(content.publishedAt, detail.createdAt),
          viewCount: typeof content.viewCount === "number" ? content.viewCount : null,
          likeCount: typeof content.likeCount === "number" ? content.likeCount : null,
          commentCount: typeof content.commentCount === "number" ? content.commentCount : null,
          shareCount: typeof content.shareCount === "number" ? content.shareCount : null,
          collectCount: typeof content.collectCount === "number" ? content.collectCount : null,
          structureSummary: asString(
            content.structureSummary,
            "已保存快照没有提供完整结构拆解，这里只保留样本引用。",
          ),
          keywordTokens: asStringArray(content.keywordTokens),
          whyIncluded: asString(
            content.whyIncluded,
            "这条内容样本来自已保存结果，但原始快照没有附带完整纳入理由。",
          ),
        }))
      : [],
    lowFollowerEvidence: Array.isArray(snapshot.lowFollowerEvidence)
      ? snapshot.lowFollowerEvidence.filter(isRecord).map((item) => ({
          id: asString(item.id, `lf-${Math.random().toString(36).slice(2, 8)}`),
          platform: asString(item.platform, "unknown"),
          contentForm: asString(item.contentForm, "未知形式"),
          title: asString(item.title, "未命名样本"),
          account: asString(item.account, "未知账号"),
          fansLabel: asString(item.fansLabel, "未知粉丝量"),
          fansCount: asNumber(item.fansCount, 0),
          anomaly: asNumber(item.anomaly, 0),
          playCount: asString(item.playCount, "未知播放"),
          trackTags: asStringArray(item.trackTags),
          suggestion: asString(
            item.suggestion,
            "原始快照没有附带完整建议，这里只保留样本引用。",
          ),
          publishedAt: asString(item.publishedAt, detail.createdAt),
        }))
      : [],
    evidenceGaps:
      asStringArray(snapshot.evidenceGaps).length > 0
        ? asStringArray(snapshot.evidenceGaps)
        : ["已保存的分析快照，可以通过追加数据获取更完整的分析。"],
    whyNowItems,
    bestFor: asStringArray(snapshot.bestFor),
    notFor: asStringArray(snapshot.notFor),
    accountMatchSummary: asString(
      snapshot.accountMatchSummary,
      asString(
        snapshot.fitSummary,
        "已保存的账号分析结果，可以结合支持账号数据继续探索。",
      ),
    ),
    bestActionNow,
    whyNotOtherActions:
      asStringArray(snapshot.whyNotOtherActions).length > 0
        ? asStringArray(snapshot.whyNotOtherActions)
        : ["可以通过追加更多数据来获取更精准的行动建议。"],
    missIfWait: typeof snapshot.missIfWait === "string" ? snapshot.missIfWait : undefined,
    operatorPanel: operatorPanelSource
      ? {
          reportSummary: asString(
            operatorPanelSource.reportSummary,
            "已保存的运营分析快照。",
          ),
          sourceNotes: asStringArray(operatorPanelSource.sourceNotes),
          platformNotes: asStringArray(operatorPanelSource.platformNotes),
          benchmarkHints: asStringArray(operatorPanelSource.benchmarkHints),
          riskSplit: asStringArray(operatorPanelSource.riskSplit),
          counterSignals: asStringArray(operatorPanelSource.counterSignals),
          dataGaps: asStringArray(operatorPanelSource.dataGaps),
        }
      : undefined,
    screeningReport: {
      safeActionLevel: asEnum(screeningSource.safeActionLevel, ACTION_LEVELS, "watch_first"),
      evidenceAlignment: asEnum(screeningSource.evidenceAlignment, ALIGNMENTS, "weak"),
      acceptedAccountIds: asStringArray(screeningSource.acceptedAccountIds),
      acceptedContentIds: asStringArray(screeningSource.acceptedContentIds),
      acceptedLowFollowerIds: asStringArray(screeningSource.acceptedLowFollowerIds),
      missingEvidence:
        asStringArray(screeningSource.missingEvidence).length > 0
          ? asStringArray(screeningSource.missingEvidence)
          : ["可以通过追加数据获取更完整的分析结果。"],
      contradictionSummary: asStringArray(screeningSource.contradictionSummary),
      candidates: Array.isArray(screeningSource.candidates)
        ? screeningSource.candidates.filter(isRecord).map((candidate) => ({
            kind: asEnum(
              candidate.kind,
              ["topic", "account", "content", "low_follower", "comment_intent", "cookie_signal"] as const,
              "topic",
            ),
            sourceId: asString(candidate.sourceId, "unknown"),
            platform: asString(candidate.platform, "unknown"),
            relevanceScore: asNumber(candidate.relevanceScore, 0),
            qualityScore: asNumber(candidate.qualityScore, 0),
            contradictionFlags: Array.isArray(candidate.contradictionFlags)
              ? candidate.contradictionFlags.filter(
                  (flag): flag is
                    | "weak_comment_intent"
                    | "high_head_concentration"
                    | "missing_low_follower_evidence"
                    | "low_account_fit"
                    | "asset_context_missing"
                    | "insufficient_supporting_content" =>
                    typeof flag === "string",
                )
              : [],
            normalizedFacts: isRecord(candidate.normalizedFacts)
              ? Object.fromEntries(
                  Object.entries(candidate.normalizedFacts).filter((entry): entry is [
                    string,
                    string | number | boolean | null,
                  ] => {
                    const value = entry[1];
                    return (
                      typeof value === "string" ||
                      typeof value === "number" ||
                      typeof value === "boolean" ||
                      value === null
                    );
                  }),
                )
              : {},
          }))
        : [],
    },
    primaryCard: buildCard(primaryCardSource),
    secondaryCard: buildCard(secondaryCardSource),
    fitSummary: asString(
      snapshot.fitSummary,
      "已保存的分析结果，可以随时回看并基于新数据继续探索。",
    ),
    recommendedNextAction,
    continueIf:
      asStringArray(snapshot.continueIf).length > 0
        ? asStringArray(snapshot.continueIf)
        : defaultCard.continueIf,
    stopIf: asStringArray(snapshot.stopIf).length > 0 ? asStringArray(snapshot.stopIf) : defaultCard.stopIf,
    normalizedBrief: {
      inputKind: asEnum(normalizedBrief.inputKind, INPUT_KINDS, "prompt"),
      seedTopic: asString(normalizedBrief.seedTopic, asString(snapshot.query, detail.query)),
      industry: asString(normalizedBrief.industry, "未指定"),
      candidatePlatforms:
        asStringArray(normalizedBrief.candidatePlatforms).length > 0
          ? asStringArray(normalizedBrief.candidatePlatforms)
          : ["douyin"],
      accountContext: asString(normalizedBrief.accountContext, ""),
      competitorEvidence: asStringArray(normalizedBrief.competitorEvidence),
      personalizationMode: asEnum(
        normalizedBrief.personalizationMode,
        PERSONALIZATION_MODES,
        "public",
      ),
    },
    platformSnapshots: Array.isArray(snapshot.platformSnapshots)
      ? snapshot.platformSnapshots.filter(isRecord).map((item) => ({
          platformId: asString(item.platformId, "unknown"),
          platformName: asString(item.platformName, "未知平台"),
          authMode: asEnum(item.authMode, ["public", "cookie"] as const, "public"),
          predictionEnabled: Boolean(item.predictionEnabled),
          callBudget: isRecord(item.callBudget)
            ? {
                topic: asNumber(item.callBudget.topic, 0),
                link: asNumber(item.callBudget.link, 0),
                account: asNumber(item.callBudget.account, 0),
                cookieExtra:
                  typeof item.callBudget.cookieExtra === "number"
                    ? item.callBudget.cookieExtra
                    : undefined,
              }
            : { topic: 0, link: 0, account: 0 },
          endpointFamilies: asStringArray(item.endpointFamilies),
          coreFields: asStringArray(item.coreFields),
          capabilitySummary: asStringArray(item.capabilitySummary),
          signals: asStringArray(item.signals),
        }))
      : [],
    scoreBreakdown: isRecord(snapshot.scoreBreakdown)
      ? {
          demand: asNumber(snapshot.scoreBreakdown.demand, 0),
          competition: asNumber(snapshot.scoreBreakdown.competition, 0),
          anomaly: asNumber(snapshot.scoreBreakdown.anomaly, 0),
          fit: asNumber(snapshot.scoreBreakdown.fit, 0),
          opportunity: asNumber(snapshot.scoreBreakdown.opportunity, 0),
          timing: asNumber(snapshot.scoreBreakdown.timing, 0),
          risk: asNumber(snapshot.scoreBreakdown.risk, 0),
        }
      : undefined,
    recommendedLowFollowerSampleIds: asStringArray(snapshot.recommendedLowFollowerSampleIds),
    artifactStatus: detail.artifactStatus,
    taskPayload,
    recommendedNextTasks,
    primaryArtifact,
    agentRun,
    classificationReasons,
    followUps: Array.isArray(snapshot.followUps)
      ? snapshot.followUps.filter(isRecord).map((item) => ({
          id: asString(item.id, `followup-${Math.random().toString(36).slice(2, 8)}`),
          label: asString(item.label, asString(item.prompt, "补充追问")),
          result: asString(item.result, "暂无补充结果"),
          cost: asNumber(item.cost, 0),
          createdAt: asString(item.createdAt, detail.updatedAt),
        }))
      : [],
    commentInsight: isRecord(snapshot.commentInsight)
      ? {
          totalCommentsCollected: asNumber(snapshot.commentInsight.totalCommentsCollected, 0),
          highFreqKeywords: asStringArray(snapshot.commentInsight.highFreqKeywords),
          sentimentSummary: asEnum(
            snapshot.commentInsight.sentimentSummary,
            ["positive", "mixed", "negative", "unknown"] as const,
            "unknown",
          ),
          demandSignals: asStringArray(snapshot.commentInsight.demandSignals),
          highlights: Array.isArray(snapshot.commentInsight.highlights)
            ? (snapshot.commentInsight.highlights as unknown[]).filter(isRecord).map((h) => ({
                contentId: asString(h.contentId, ""),
                contentTitle: asString(h.contentTitle, ""),
                topComments: Array.isArray(h.topComments)
                  ? (h.topComments as unknown[]).filter(isRecord).map((c) => ({
                      text: asString(c.text, ""),
                      likeCount: asNumber(c.likeCount, 0),
                      authorName: asString(c.authorName, ""),
                    }))
                  : [],
                totalCommentCount: asNumber(h.totalCommentCount, 0),
              }))
            : [],
        }
      : undefined,
  };
}

function InvalidState({
  onReset,
  onHistory,
  title = "该结果不存在或已被删除",
  description = "这条分析记录可能已被删除，或者本地状态尚未恢复",
  detail = "你可以重新提问，或回到历史记录继续查看其他分析",
}: {
  onReset: () => void;
  onHistory: () => void;
  title?: string;
  description?: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
        <FileX className="h-6 w-6 text-gray-300" />
      </div>
      <p className="mb-1 text-base text-gray-700">{title}</p>
      <p className="mb-2 text-sm text-gray-400">{description}</p>
      <p className="mb-8 text-xs text-gray-300">{detail}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onHistory}
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Clock className="h-4 w-4" />
          查看历史记录
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页重新提问
        </button>
      </div>
    </div>
  );
}

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dataMode, getResultById, state } = useAppStore();
  const localResult = id ? getResultById(id) : null;
  const [remoteResult, setRemoteResult] = useState<ResultRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const autoFocusFollowUp = searchParams.get("focus") === "execute";

  useEffect(() => {
    let active = true;
    if (!id || localResult || dataMode !== "live" || state.apiHealth.status === "unavailable") {
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
    }, 0);
    void fetchResultArtifact(id)
      .then((payload) => {
        if (!active) return;
        setRemoteResult(normalizeRemoteResult(payload.item));
      })
      .catch(() => {
        if (!active) return;
        setRemoteResult(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [dataMode, id, localResult, state.apiHealth.status]);

  const result = localResult ?? remoteResult;

  if (loading && !result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 text-sm text-gray-400">
        正在恢复已保存结果...
      </div>
    );
  }

  if (!result) {
    const modeLabel = dataMode === "live" ? "真实数据" : "演示数据";
    return (
      <InvalidState
        onReset={() => navigate("/")}
        onHistory={() => navigate("/history")}
        title={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? "当前环境未接通真实数据后端"
            : `当前${modeLabel}下不存在该结果`
        }
        description={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? state.apiHealth.message ||
              "需要把同源 /api 反向代理到 Node 服务，结果页才能恢复真实保存快照。"
            : `结果 ID ${id ?? "--"} 不属于当前数据源，系统不会混显另一模式的数据。`
        }
        detail={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? "请先接通真实后端，或切回演示数据后再查看本地结果。"
            : "你可以去设置切换数据源，或回到历史记录查看当前模式下可用的结果。"
        }
      />
    );
  }

  return (
    <ResultsView
      result={result}
      autoFocusFollowUp={autoFocusFollowUp}
      onReset={() => navigate("/")}
    />
  );
}
