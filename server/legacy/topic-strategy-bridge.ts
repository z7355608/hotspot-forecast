/**
 * topic-strategy-bridge.ts
 * ═══════════════════════════════════════════════════════════════
 * 从 live-predictions.ts 拆分出的选题策略 V2 分支逻辑。
 * 当 intent 为 topic_strategy 时，走独立的 5 阶段 Pipeline，
 * 并将结果转换为 runLivePrediction 的标准返回格式。
 * ═══════════════════════════════════════════════════════════════
 */

import { randomUUID } from "node:crypto";
import { buildPredictionArtifacts } from "../../client/src/app/store/prediction-engine.js";
import {
  buildAgentContract,
  getTaskIntentHistoryType,
} from "../../client/src/app/store/agent-runtime.js";
import { extractTaskParams } from "./payload-extractor.js";
import type {
  PredictionBestAction,
  PredictionOpportunityType,
  PredictionRequestDraft,
  PredictionSafeActionLevel,
  PredictionSupportingAccount,
  PredictionSupportingContent,
  PredictionUiResult,
  PredictionWhyNowItem,
} from "../../client/src/app/store/prediction-types.js";
import { readConnectorStore } from "./storage.js";
import { query } from "./database.js";
import { runTopicStrategyV2, type TopicStrategyV2Result, type TopicStrategyInput } from "./topic-strategy-engine.js";
import type { ExecutionStatus, SupportedPlatform } from "./types.js";
import {
  clamp,
  createCards,
  getCandidatePlatforms,
  nowIso,
  PLATFORM_NAMES,
  resolveTierLabel,
} from "./prediction-helpers.js";

/**
 * 选题策略 V2 分支 — 当 intent 为 topic_strategy 时，走独立的 5 阶段 Pipeline
 * 不再走通用的 搜索→LLM 流程，而是直接调用 runTopicStrategyV2
 */
export async function runTopicStrategyBranch(draft: PredictionRequestDraft) {
  const connectorStore = await readConnectorStore();

  // 从 prompt 中提取赛道信息
  const payloadResult = await extractTaskParams(draft.prompt, true, {
    platforms: draft.connectedPlatforms ?? [],
    industries: [] as string[],
    followerCount: undefined,
    accountName: undefined,
  }).catch(() => null);

  const track = payloadResult?.industry ?? payloadResult?.keyword ?? draft.prompt.trim().slice(0, 20);

  // 从 prompt 中提取账号阶段（不包含“矩阵号”等运营策略术语）
  const stageMatch = draft.prompt.match(/新号冷启动|新号|起步期|成长期|成熟期|转型期|低粉号|万粉号/);
  const accountStage = stageMatch ? stageMatch[0] : "起步期";

  // 获取候选平台
  const platforms = getCandidatePlatforms(draft);

  // 构建已连接账号快照
  const connectedAccounts: TopicStrategyInput["connectedAccounts"] = [];
  for (const [platformKey, connector] of Object.entries(connectorStore)) {
    if (connector && platforms.includes(platformKey as SupportedPlatform)) {
      let followerCount = 0;
      let recentTopics: string[] = [];
      try {
        const snapRows = await query(
          `SELECT followers FROM creator_account_snapshots WHERE platform_id = ? ORDER BY synced_at DESC LIMIT 1`,
          [platformKey]
        );
        if (snapRows.length > 0) {
          followerCount = Number((snapRows[0] as Record<string,unknown>).followers) || 0;
        }
        const workRows = await query(
          `SELECT title FROM creator_works WHERE platform_id = ? ORDER BY published_at DESC LIMIT 5`,
          [platformKey]
        );
        if (workRows.length > 0) {
          recentTopics = (workRows as Array<Record<string,unknown>>)
            .map(r => String(r.title ?? ""))
            .filter(Boolean);
        }
      } catch {
        // 表不存在或查询失败时降级
      }
      connectedAccounts.push({
        platform: platformKey as SupportedPlatform,
        handle: connector.handle ?? "",
        displayName: connector.handle ?? "",
        followerCount,
        recentTopics,
      });
    }
  }

  // 调用 V2 Pipeline
  const v2Result = await runTopicStrategyV2({
    userOpenId: (draft as unknown as Record<string, unknown>).userId as string ?? "anonymous",
    track,
    accountStage,
    platforms,
    userPrompt: draft.prompt,
    connectedAccounts,
    entrySource: draft.entryTemplateId ?? draft.entrySource ?? "manual",
  });

  // 将 V2 结果转换为 runLivePrediction 的标准返回格式
  return convertV2ResultToLivePredictionResult(draft, v2Result, platforms);
}

/**
 * 将 TopicStrategyV2Result 转换为 runLivePrediction 的标准返回格式
 * 使得前端 agent-runtime 和 result renderer 能正确消费
 */
function convertV2ResultToLivePredictionResult(
  draft: PredictionRequestDraft,
  v2: TopicStrategyV2Result,
  platforms: SupportedPlatform[],
) {
  const connectors = platforms.map((p) => ({
    id: p,
    name: PLATFORM_NAMES[p],
    connected: true,
  }));
  const baseArtifacts = buildPredictionArtifacts(draft, connectors, []);

  // 从 V2 方向中构建 supportingContents
  const supportingContents: PredictionSupportingContent[] = [];
  const supportingAccounts: PredictionSupportingAccount[] = [];

  // 从 peer benchmarks 构建 accounts
  for (const peer of v2.peerBenchmarks.slice(0, 6)) {
    supportingAccounts.push({
      accountId: peer.accountId,
      displayName: peer.displayName,
      handle: peer.handle,
      platform: PLATFORM_NAMES[peer.platform] ?? peer.platform,
      followerCount: peer.followerCount,
      followingCount: null,
      totalLikeCount: null,
      tierLabel: resolveTierLabel(peer.followerCount),
      recentTopicClusters: peer.recentWorks.map((w) => w.title).slice(0, 3),
      whyIncluded: `同行对标：${peer.displayName}`,
      avgEngagementRate30d: peer.avgInteractionRate,
      breakoutHitRate30d: null,
    });
    for (const work of peer.recentWorks.slice(0, 2)) {
      supportingContents.push({
        contentId: `peer_${peer.accountId}_${supportingContents.length}`,
        title: work.title,
        platform: PLATFORM_NAMES[peer.platform] ?? peer.platform,
        authorName: peer.displayName,
        likeCount: work.likeCount,
        viewCount: work.viewCount ?? null,
        commentCount: null,
        shareCount: work.shareCount ?? null,
        collectCount: null,
        publishedAt: work.publishedAt ?? "",
        contentUrl: work.contentUrl,
        keywordTokens: [],
        structureSummary: "",
        whyIncluded: `同行对标：${peer.displayName} 的近期作品`,
      });
    }
  }

  // 构建验证得分最高的方向作为 verdict
  const topDirection = v2.directions.sort((a, b) => b.validationScore - a.validationScore)[0];
  const avgScore = v2.directions.length > 0
    ? Math.round(v2.directions.reduce((sum, d) => sum + d.validationScore, 0) / v2.directions.length)
    : 0;

  const verdict = avgScore >= 75 ? "go_now" as const
    : avgScore >= 55 ? "test_small" as const
    : avgScore >= 35 ? "observe" as const
    : "not_now" as const;

  const opportunityScore = Math.min(avgScore, 100);

  const whyNowItems: PredictionWhyNowItem[] = v2.directions.slice(0, 3).map((dir) => ({
    sourceLabel: dir.directionName,
    fact: dir.directionLogic,
    inference: `验证分 ${dir.validationScore}，${dir.validationStatus === "validated" ? "已验证通过" : "待进一步验证"}`,
    userImpact: dir.testPlan,
    tone: dir.validationScore >= 60 ? "positive" as const : dir.validationScore >= 40 ? "neutral" as const : "warning" as const,
  }));

  const bestActionNow: PredictionBestAction = {
    type: "generate_test_brief",
    title: topDirection ? `从「${topDirection.directionName}」开始` : "查看选题方向",
    description: topDirection
      ? `${topDirection.directionLogic}。验证分 ${topDirection.validationScore}，${topDirection.executableTopics.length} 个可执行选题已就绪。`
      : v2.strategySummary,
    ctaLabel: "看选题方向",
    reason: topDirection
      ? `「${topDirection.directionName}」在 ${v2.platforms.join("+")} 上的验证分最高（${topDirection.validationScore}），优先执行。`
      : "已完成多平台数据采集和验证。",
  };

  const cards = createCards({
    bestActionNow,
    confidenceLabel: avgScore >= 65 ? "高" : avgScore >= 40 ? "中" : "低",
    inputKind: "prompt" as const,
    lowFollowerEvidence: [],
    verdict,
    whyNowItems,
  });

  const scoreBreakdown = {
    demand: clamp(v2.rawDataSummary.totalContents * 5 + v2.rawDataSummary.totalHotSeeds * 8),
    competition: clamp(v2.peerBenchmarks.length * 12),
    anomaly: clamp(v2.crossIndustryInsights.length * 15),
    fit: clamp(50 + v2.directions.filter((d) => d.validationScore >= 60).length * 10),
    opportunity: opportunityScore,
    timing: clamp(v2.rawDataSummary.totalHotSeeds * 8 + v2.rawDataSummary.totalContents * 3),
    risk: clamp(v2.directions.filter((d) => d.validationScore < 40).length * 15),
  };

  // 构建 result 对象，注入 V2 专属字段
  const result: Partial<PredictionUiResult> & Record<string, unknown> = {
    type: "选题策略",
    platform: v2.platforms.map((p) => PLATFORM_NAMES[p as SupportedPlatform] ?? p),
    score: opportunityScore,
    scoreLabel: verdict === "go_now" ? "强推" : verdict === "test_small" ? "值得试" : verdict === "observe" ? "观望" : "谨慎",
    verdict,
    confidenceLabel: avgScore >= 65 ? "高" : avgScore >= 40 ? "中" : "低",
    opportunityTitle: `${v2.track} · 选题策略`,
    opportunityType: "fit_window" as PredictionOpportunityType,
    windowStrength: verdict === "go_now" ? "strong_now" : verdict === "test_small" ? "validate_first" : "observe",
    coreBet: v2.strategySummary,
    decisionBoundary: topDirection
      ? `「${topDirection.directionName}」验证分 ${topDirection.validationScore}，${topDirection.executableTopics.length} 个可执行选题。`
      : "选题方向已生成，请查看详细验证结果。",
    marketEvidence: {
      evidenceWindowLabel: `实时采集 · ${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`,
      momentumLabel: avgScore >= 65 ? "accelerating" : avgScore >= 40 ? "emerging" : "cooling",
      kolCount: supportingAccounts.filter((a) => a.tierLabel === "head_kol" || a.tierLabel === "standard_kol").length,
      kocCount: supportingAccounts.filter((a) => a.tierLabel === "strong_koc" || a.tierLabel === "standard_koc").length,
      newCreatorCount: supportingAccounts.filter((a) => (a.followerCount ?? 0) <= 10000).length,
      similarContentCount: supportingContents.length,
      growth7d: clamp(v2.rawDataSummary.totalHotSeeds * 8 + v2.rawDataSummary.totalContents * 3),
      lowFollowerAnomalyRatio: 0,
      timingLabel: `已采集 ${v2.rawDataSummary.totalContents} 条内容、${v2.rawDataSummary.totalAccounts} 个账号，覆盖 ${v2.platforms.length} 个平台。`,
      tierBreakdown: {
        headKol: supportingAccounts.filter((a) => a.tierLabel === "head_kol").length,
        standardKol: supportingAccounts.filter((a) => a.tierLabel === "standard_kol").length,
        strongKoc: supportingAccounts.filter((a) => a.tierLabel === "strong_koc").length,
        standardKoc: supportingAccounts.filter((a) => a.tierLabel === "standard_koc").length,
      },
    },
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence: [],
    evidenceGaps: [],
    whyNowItems,
    bestFor: [`已在 ${v2.platforms.length} 个平台采集 ${v2.rawDataSummary.totalContents} 条内容，生成 ${v2.directions.length} 个选题方向并完成自循环验证。`],
    notFor: ["如果你只想看单条视频的拆解，请使用「爆款拆解」功能。"],
    accountMatchSummary: `${v2.track} 赛道 · ${v2.accountStage} · ${v2.platforms.length} 个平台 · ${v2.directions.length} 个方向`,
    bestActionNow,
    whyNotOtherActions: ["选题策略已包含完整的方向验证和可执行选题，可以直接进入执行。"],
    missIfWait: verdict === "go_now" ? "当前验证分较高的方向如果不及时执行，可能被竞争者抢先。" : undefined,
    operatorPanel: {
      reportSummary: `${v2.track} 赛道选题策略：${v2.directions.length} 个方向，平均验证分 ${avgScore}`,
      sourceNotes: v2.platforms.map((p) => `数据来源：${PLATFORM_NAMES[p as SupportedPlatform] ?? p} 实时搜索`),
      platformNotes: v2.platforms.map((p) => `${PLATFORM_NAMES[p as SupportedPlatform] ?? p}：已采集`),
      benchmarkHints: v2.peerBenchmarks.slice(0, 3).map((p) => `${p.displayName} · 互动率 ${(p.avgInteractionRate * 100).toFixed(1)}%`),
      riskSplit: [],
      counterSignals: [],
      dataGaps: [],
    },
    screeningReport: {
      safeActionLevel: (verdict === "go_now" ? "shoot_now" : verdict === "test_small" ? "test_one" : "watch_first") as PredictionSafeActionLevel,
      evidenceAlignment: avgScore >= 65 ? "strong" : avgScore >= 40 ? "medium" : "weak",
      acceptedAccountIds: supportingAccounts.map((a) => a.accountId),
      acceptedContentIds: supportingContents.map((c) => c.contentId),
      acceptedLowFollowerIds: [],
      missingEvidence: [],
      contradictionSummary: [],
      candidates: [],
    },
    primaryCard: cards.primaryCard,
    secondaryCard: cards.secondaryCard,
    fitSummary: `${v2.track} 赛道选题策略，覆盖 ${v2.platforms.length} 个平台。`,
    recommendedNextAction: bestActionNow,
    continueIf: [`当 ${v2.track} 赛道出现新的热点或竞品动态时，可以重新运行选题策略获取最新方向。`],
    stopIf: [`如果多次验证后所有方向的验证分都低于 40，建议考虑换赛道。`],
    normalizedBrief: { ...baseArtifacts.normalizedBrief, seedTopic: v2.track },
    platformSnapshots: baseArtifacts.platformSnapshots,
    scoreBreakdown,
    recommendedLowFollowerSampleIds: [],
    hotSeedCount: v2.rawDataSummary.totalHotSeeds,
    // V2 专属字段 — 前端 topic-strategy-renderer 使用
    topicStrategyV2: v2,
  };

  const runtimeMeta = {
    sourceMode: "live" as const,
    executionStatus: "success" as ExecutionStatus,
    usedPlatforms: platforms,
    usedRouteChain: [`topic_strategy_v2_pipeline`],
    degradeFlags: [] as string[],
    endpointHealthVersion: nowIso(),
  };

  const runId = `run_${randomUUID()}`;
  const contract = buildAgentContract({
    runId,
    request: draft,
    artifacts: {
      ...baseArtifacts,
      uiResult: result as PredictionUiResult,
      normalizedBrief: { ...baseArtifacts.normalizedBrief, seedTopic: v2.track },
      platformSnapshots: baseArtifacts.platformSnapshots,
      scoreBreakdown,
      recommendedLowFollowerSampleIds: [],
    },
    runtimeMeta,
    degradeFlags: [],
  });

  const primaryArtifact = {
    ...contract.primaryArtifact,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const run = {
    ...contract.agentRun,
    artifacts: [primaryArtifact],
    runtimeMeta,
  };
  const enrichedResult = {
    id: runId,
    ...result,
    type: getTaskIntentHistoryType(contract.classification.taskIntent),
    taskIntent: contract.classification.taskIntent,
    taskIntentConfidence: contract.classification.confidence,
    entrySource: draft.entrySource ?? "manual",
    title: contract.title,
    summary: contract.summary,
    primaryCtaLabel: contract.primaryCtaLabel,
    taskPayload: contract.taskPayload,
    recommendedNextTasks: contract.recommendedNextTasks,
    primaryArtifact,
    agentRun: run,
    classificationReasons: contract.classification.reasons,
    // 确保 V2 数据也在 enrichedResult 中
    topicStrategyV2: v2,
  };

  return {
    run,
    artifact: primaryArtifact,
    result: enrichedResult,
    runtimeMeta,
    degradeFlags: [] as string[],
    usedRouteChain: [`topic_strategy_v2_pipeline`],
    endpointHealthVersion: nowIso(),
  };
}
