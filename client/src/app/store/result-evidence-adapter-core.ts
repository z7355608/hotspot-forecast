// result-evidence-adapter-core.ts — Main entry: buildEvidenceDrivenDecision + public exports
//
// Internal modules:
//   evidence-fixtures.ts   — Seed fixture data & types
//   evidence-helpers.ts    — Utility / formatting functions
//   evidence-builders.ts   — Candidate builders & evidence screening
//   evidence-card-builders.ts — Card builders (WhyNow, Primary, Secondary, Operator)

import type {
  PlatformSnapshot,
  PredictionBestAction,
  PredictionBrief,
  PredictionConfidenceLabel,
  PredictionMarketEvidence,
  PredictionOpportunityType,
  PredictionVerdict,
  PredictionWindowStrength,
  ScoreBreakdown,
} from "./prediction-types.js";

import type { LowFollowerSource, TrendSeedFixture } from "./evidence-fixtures.js";
import {
  selectFixture,
  PLATFORM_LABELS,
  TIER_LABELS,
  MOMENTUM_LABELS,
} from "./evidence-fixtures.js";

import {
  formatPercent,
  formatCount,
  formatTimingWindowLabel,
  buildOpportunityTitle,
  buildCoreBet,
  buildDecisionBoundary,
} from "./evidence-helpers.js";

import {
  buildEvidenceScreeningReport,
  buildSupportingAccounts,
  buildSupportingContents,
  buildLowFollowerEvidence,
  buildEvidenceGaps,
  filterAcceptedAccounts,
  filterAcceptedContents,
  filterAcceptedLowFollowerEvidence,
} from "./evidence-builders.js";

import {
  buildWhyNowItems,
  buildContinueIf,
  buildStopIf,
  buildWhyNotOtherActions,
  buildBestFor,
  buildNotFor,
  buildAccountMatchSummary,
  buildMissIfWait,
  buildPrimaryCard,
  buildSecondaryCard,
  buildOperatorPanel,
} from "./evidence-card-builders.js";

// ─── Public type ────────────────────────────────────────────────────

import type { PredictionEvidenceRefs } from "./prediction-types.js";

export interface EvidenceDrivenDecision {
  trendOpportunityId: string;
  evidenceRefs: PredictionEvidenceRefs;
  marketEvidence: PredictionMarketEvidence;
  supportingAccounts: import("./prediction-types.js").PredictionSupportingAccount[];
  supportingContents: import("./prediction-types.js").PredictionSupportingContent[];
  lowFollowerEvidence: import("./prediction-types.js").PredictionLowFollowerEvidenceItem[];
  evidenceGaps: string[];
  opportunityTitle: string;
  coreBet: string;
  decisionBoundary: string;
  whyNowItems: import("./prediction-types.js").PredictionWhyNowItem[];
  bestFor: string[];
  notFor: string[];
  accountMatchSummary: string;
  whyNotOtherActions: string[];
  continueIf: string[];
  stopIf: string[];
  missIfWait?: string;
  operatorPanel: import("./prediction-types.js").PredictionOperatorPanel;
  screeningReport: import("./prediction-types.js").PredictionEvidenceScreeningReport;
  primaryCard: import("./prediction-types.js").PredictionResultCard;
  secondaryCard: import("./prediction-types.js").PredictionResultCard;
  bestActionNow: PredictionBestAction;
}

// ─── Main builder ───────────────────────────────────────────────────

export function buildEvidenceDrivenDecision(params: {
  brief: PredictionBrief;
  scoreBreakdown: ScoreBreakdown;
  platformSnapshots: PlatformSnapshot[];
  verdict: PredictionVerdict;
  confidenceLabel: PredictionConfidenceLabel;
  opportunityType: PredictionOpportunityType;
  windowStrength: PredictionWindowStrength;
  bestActionNow: PredictionBestAction;
  lowFollowerSamples: LowFollowerSource[];
}): EvidenceDrivenDecision {
  const {
    brief,
    scoreBreakdown,
    platformSnapshots,
    verdict,
    confidenceLabel,
    opportunityType,
    windowStrength,
    bestActionNow,
    lowFollowerSamples,
  } = params;

  const fixture = selectFixture(brief);

  const marketEvidence: PredictionMarketEvidence = {
    evidenceWindowLabel: formatTimingWindowLabel(fixture.trend),
    momentumLabel: fixture.trend.momentumLabel,
    kolCount: fixture.trend.kolCount,
    kocCount: fixture.trend.kocCount,
    newCreatorCount: fixture.trend.newCreatorCount,
    similarContentCount: fixture.trend.similarContentCount,
    growth7d: fixture.trend.growth7d,
    lowFollowerAnomalyRatio: fixture.trend.lowFollowerAnomalyRatio,
    timingLabel: fixture.trend.timingLabel,
    tierBreakdown: fixture.tierBreakdown,
  };

  const rawSupportingAccounts = buildSupportingAccounts(fixture);
  const rawSupportingContents = buildSupportingContents(fixture);
  const lowFollowerSeedEvidence = buildLowFollowerEvidence(
    fixture.trend.evidence.lowFollowerSampleIds,
    lowFollowerSamples,
  );

  const screeningReport = buildEvidenceScreeningReport({
    brief,
    fixture,
    verdict,
    confidenceLabel,
    scoreBreakdown,
    platformSnapshots,
    lowFollowerSeedEvidence,
  });

  const supportingAccounts = filterAcceptedAccounts(rawSupportingAccounts, screeningReport);
  const supportingContents = filterAcceptedContents(rawSupportingContents, screeningReport);
  const lowFollowerEvidence = filterAcceptedLowFollowerEvidence(lowFollowerSeedEvidence, screeningReport);
  const evidenceGaps = buildEvidenceGaps(screeningReport);

  const whyNowItems = buildWhyNowItems(
    fixture,
    bestActionNow,
    opportunityType,
    lowFollowerEvidence,
    evidenceGaps,
    screeningReport,
  );

  const continueIf = buildContinueIf(bestActionNow, fixture);
  const stopIf = buildStopIf(bestActionNow, fixture);
  const whyNotOtherActions = buildWhyNotOtherActions(bestActionNow, lowFollowerEvidence);
  const coreBet = buildCoreBet(opportunityType, fixture, bestActionNow);

  const primaryCard = buildPrimaryCard({
    brief,
    safeActionLevel: screeningReport.safeActionLevel,
    coreBet,
    marketEvidence,
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    continueIf,
    stopIf,
    evidenceGaps,
    contradictionSummary: screeningReport.contradictionSummary,
  });

  const secondaryCard = buildSecondaryCard({
    brief,
    safeActionLevel: screeningReport.safeActionLevel,
    whyNotOtherActions,
    whyNowItems,
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    evidenceGaps,
    continueIf,
    stopIf,
  });

  const operatorPanel = buildOperatorPanel(
    brief,
    fixture,
    marketEvidence,
    supportingAccounts,
    supportingContents,
    screeningReport,
    evidenceGaps,
    stopIf,
    whyNowItems,
  );

  return {
    trendOpportunityId: fixture.trend.trendId,
    evidenceRefs: fixture.trend.evidence,
    marketEvidence,
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    evidenceGaps,
    opportunityTitle: buildOpportunityTitle(brief, opportunityType, fixture),
    coreBet,
    decisionBoundary: buildDecisionBoundary(brief, opportunityType, fixture),
    whyNowItems,
    bestFor: buildBestFor(brief, fixture, bestActionNow),
    notFor: buildNotFor(brief, bestActionNow),
    accountMatchSummary: buildAccountMatchSummary(brief, fixture, bestActionNow),
    whyNotOtherActions,
    continueIf,
    stopIf,
    missIfWait: buildMissIfWait(windowStrength, bestActionNow, fixture),
    operatorPanel,
    screeningReport,
    primaryCard,
    secondaryCard,
    bestActionNow: {
      ...bestActionNow,
      reason:
        bestActionNow.type === "low_follower_validation"
          ? `已找到 ${lowFollowerEvidence.length || 1} 组可复制样本，验证通过就能直接放大！`
          : bestActionNow.type === "account_benchmark"
            ? `支持账号已经表明这波机会不是谁都能吃到，先做账号分配比继续泛聊题材更关键。`
            : bestActionNow.type === "breakdown"
              ? `当前最有价值的信息都在支持内容结构里，先拆清结构再执行，价值最高。`
              : bestActionNow.type === "monitor"
                ? `赛道正在酝酿中，用监控跟踪 ${evidenceGaps.length} 个关键信号，信号明确就能快速出击。`
                : `市场证据和样本证据都已经到位，继续停在分析层的边际价值不高。`,
    },
  };
}

// ─── Public formatting helpers (used by renderers) ──────────────────

export function getTierLabelLabel(tierLabel: import("./prediction-types.js").PredictionSupportingAccount["tierLabel"]) {
  return TIER_LABELS[tierLabel];
}

export function getMomentumLabelText(momentumLabel: import("./trend-monitoring-types.js").TopicMomentumLabel) {
  return MOMENTUM_LABELS[momentumLabel];
}

export function formatMetricValue(value: number | null | undefined, kind: "count" | "percent" = "count") {
  if (kind === "percent") return formatPercent(value);
  return formatCount(value ?? null);
}
