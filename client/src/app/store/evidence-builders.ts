// evidence-builders.ts — Candidate builders and evidence screening

import type {
  PlatformSnapshot,
  PredictionBrief,
  PredictionConfidenceLabel,
  PredictionContradictionFlag,
  PredictionEvidenceAlignment,
  PredictionEvidenceCandidate,
  PredictionEvidenceScreeningReport,
  PredictionLowFollowerEvidenceItem,
  PredictionSafeActionLevel,
  PredictionSupportingAccount,
  PredictionSupportingContent,
  PredictionVerdict,
  ScoreBreakdown,
} from "./prediction-types.js";
import type { TrendSeedFixture, LowFollowerSource, SeedAccount, SeedContent } from "./evidence-fixtures.js";
import {
  PLATFORM_LABELS,
  TIER_LABELS,
} from "./evidence-fixtures.js";
import {
  buildReferenceTerms,
  buildScenarioTerms,
  buildIntentTerms,
  computeFreshnessScore,
  buildCompletenessScore,
  scoreByTermMatches,
  containsAny,
  normalizePlatformId,
  downgradeSafeAction,
  dedupeStrings,
  formatPercent,
} from "./evidence-helpers.js";

export function buildAccountCandidate(params: {
  brief: PredictionBrief;
  fixture: TrendSeedFixture;
  platformSnapshots: PlatformSnapshot[];
  account: SeedAccount;
}): PredictionEvidenceCandidate {
  const { brief, fixture, platformSnapshots, account } = params;
  const referenceTerms = buildReferenceTerms(brief, fixture);
  const scenarioTerms = buildScenarioTerms(brief);
  const intentTerms = buildIntentTerms(fixture);
  const corpus = [
    account.displayName,
    account.handle,
    account.whyIncluded,
    ...account.recentTopicClusters,
  ]
    .join(" ")
    .toLowerCase();
  const platformIds = new Set(platformSnapshots.map((snapshot) => snapshot.platformId));
  const topicMatch = scoreByTermMatches(corpus, referenceTerms, 35, 16);
  const scenarioMatch = brief.inputKind === "account"
    ? 20
    : containsAny(corpus, scenarioTerms)
      ? 15
      : 8;
  const intentMatch = containsAny(corpus, intentTerms) ? 14 : 8;
  const structureMatch = brief.inputKind === "content_url"
    ? 6
    : containsAny(corpus, ["结果", "结构", "模板", "场景"])
      ? 12
      : 8;
  const platformFit = platformIds.has(account.platform) ? 15 : 6;

  const relevanceScore = Math.min(
    100,
    topicMatch + scenarioMatch + intentMatch + structureMatch + platformFit,
  );

  const engagementStrength = Math.min(
    25,
    (account.performance.avgEngagementRate30d ?? 0) >= 0.08
      ? 14
      : (account.performance.avgEngagementRate30d ?? 0) >= 0.05
        ? 10
        : 6 +
          ((account.performance.breakoutHitRate30d ?? 0) >= 0.25
            ? 8
            : (account.performance.breakoutHitRate30d ?? 0) >= 0.15
              ? 5
              : 2),
  );
  const authorFit = account.tierLabel === "strong_koc" || account.tierLabel === "standard_koc"
    ? 22
    : account.tierLabel === "standard_kol"
      ? 18
      : 14;
  const qualityScore = Math.min(
    100,
    16 +
      engagementStrength +
      authorFit +
      buildCompletenessScore(
        [
          account.displayName,
          account.handle,
          account.performance.followerCount,
          account.performance.avgEngagementRate30d,
          account.performance.breakoutHitRate30d,
          account.recentTopicClusters.join(" "),
        ],
        22,
      ),
  );

  const contradictionFlags: PredictionContradictionFlag[] = [];
  if (
    account.tierLabel === "head_kol" &&
    fixture.tierBreakdown.headKol >= fixture.tierBreakdown.strongKoc + fixture.tierBreakdown.standardKoc
  ) {
    contradictionFlags.push("high_head_concentration");
  }
  if (brief.inputKind === "account" && relevanceScore < 70) {
    contradictionFlags.push("low_account_fit");
  }

  return {
    kind: "account",
    sourceId: account.accountId,
    platform: account.platform,
    relevanceScore,
    qualityScore,
    contradictionFlags,
    normalizedFacts: {
      displayName: account.displayName,
      tierLabel: account.tierLabel,
      followerCount: account.performance.followerCount,
      avgEngagementRate30d: account.performance.avgEngagementRate30d,
      breakoutHitRate30d: account.performance.breakoutHitRate30d,
    },
  };
}

export function buildContentCandidate(params: {
  brief: PredictionBrief;
  fixture: TrendSeedFixture;
  platformSnapshots: PlatformSnapshot[];
  content: SeedContent;
}): PredictionEvidenceCandidate {
  const { brief, fixture, platformSnapshots, content } = params;
  const referenceTerms = buildReferenceTerms(brief, fixture);
  const scenarioTerms = buildScenarioTerms(brief);
  const intentTerms = buildIntentTerms(fixture);
  const corpus = [
    content.title,
    content.structureSummary,
    content.whyIncluded,
    ...content.keywordTokens,
    ...(content.performance.commentQuestionClusters ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const platformIds = new Set(platformSnapshots.map((snapshot) => snapshot.platformId));
  const topicMatch = scoreByTermMatches(corpus, referenceTerms, 35, 18);
  const scenarioMatch = brief.inputKind === "content_url"
    ? 20
    : containsAny(corpus, scenarioTerms)
      ? 15
      : 10;
  const intentMatch = containsAny(corpus, intentTerms)
    ? 15
    : (content.performance.commentQuestionClusters ?? []).length > 0
      ? 10
      : 4;
  const structureMatch = brief.inputKind === "content_url" || brief.inputKind === "uploaded_asset"
    ? containsAny(corpus, ["结构", "开头", "结果", "证明", "脚本"])
      ? 15
      : 9
    : 10;
  const platformFit = platformIds.has(content.platform) ? 15 : 6;

  const relevanceScore = Math.min(
    100,
    topicMatch + scenarioMatch + intentMatch + structureMatch + platformFit,
  );

  const engagementStrength = Math.min(
    25,
    (content.performance.viewCount ?? 0) >= 150000
      ? 12
      : (content.performance.viewCount ?? 0) >= 80000
        ? 9
        : 5 +
          ((content.performance.likeCount ?? 0) >= 8000
            ? 6
            : (content.performance.likeCount ?? 0) >= 4000
              ? 4
              : 2) +
          ((content.performance.commentCount ?? 0) >= 500
            ? 4
            : (content.performance.commentCount ?? 0) >= 200
              ? 3
              : 1) +
          ((content.performance.shareCount ?? 0) >= 800
            ? 3
            : (content.performance.shareCount ?? 0) >= 200
              ? 2
              : 1),
  );
  const authorFit = content.topicCluster === fixture.trend.topicCluster ? 22 : 14;
  const qualityScore = Math.min(
    100,
    computeFreshnessScore(content.performance.publishedAt) +
      engagementStrength +
      authorFit +
      buildCompletenessScore(
        [
          content.title,
          content.performance.publishedAt,
          content.performance.viewCount,
          content.performance.likeCount,
          content.performance.commentCount,
          content.structureSummary,
          content.keywordTokens.join(" "),
        ],
        28,
      ),
  );

  const contradictionFlags: PredictionContradictionFlag[] = [];
  if ((content.performance.commentQuestionClusters ?? []).length === 0) {
    contradictionFlags.push("weak_comment_intent");
  }
  if (brief.inputKind === "uploaded_asset") {
    contradictionFlags.push("asset_context_missing");
  }

  return {
    kind: "content",
    sourceId: content.contentId,
    platform: content.platform,
    relevanceScore,
    qualityScore,
    contradictionFlags,
    normalizedFacts: {
      title: content.title,
      publishedAt: content.performance.publishedAt,
      viewCount: content.performance.viewCount ?? null,
      commentCount: content.performance.commentCount ?? null,
      structureSummary: content.structureSummary,
    },
  };
}

export function buildLowFollowerCandidate(params: {
  brief: PredictionBrief;
  fixture: TrendSeedFixture;
  platformSnapshots: PlatformSnapshot[];
  sample: LowFollowerSource;
}): PredictionEvidenceCandidate {
  const { brief, fixture, platformSnapshots, sample } = params;
  const referenceTerms = buildReferenceTerms(brief, fixture);
  const scenarioTerms = buildScenarioTerms(brief);
  const corpus = [
    sample.title,
    sample.account,
    sample.suggestion,
    sample.contentForm,
    ...sample.trackTags,
  ]
    .join(" ")
    .toLowerCase();
  const platformIds = new Set(platformSnapshots.map((snapshot) => snapshot.platformId));
  const platformId = normalizePlatformId(sample.platform);
  const topicMatch = scoreByTermMatches(corpus, referenceTerms, 35, 12);
  const scenarioMatch = containsAny(corpus, scenarioTerms) ? 18 : 10;
  const intentMatch = containsAny(corpus, ["问题", "适合", "切口", "开头", "证明"]) ? 12 : 8;
  const structureMatch = brief.inputKind === "content_url" || brief.inputKind === "uploaded_asset"
    ? containsAny(corpus, ["口播", "图文", "vlog", "清单", "模板"])
      ? 15
      : 8
    : 10;
  const platformFit = platformIds.has(platformId) ? 15 : 7;

  const relevanceScore = Math.min(
    100,
    topicMatch + scenarioMatch + intentMatch + structureMatch + platformFit,
  );

  const engagementStrength = sample.anomaly >= 8 ? 25 : sample.anomaly >= 6 ? 20 : sample.anomaly >= 4 ? 15 : 10;
  const authorFit = sample.fansCount <= 50000 ? 24 : sample.fansCount <= 100000 ? 18 : 12;
  const qualityScore = Math.min(
    100,
    computeFreshnessScore(sample.publishedAt) +
      engagementStrength +
      authorFit +
      buildCompletenessScore(
        [
          sample.title,
          sample.account,
          sample.playCount,
          sample.fansLabel,
          sample.contentForm,
          sample.trackTags.join(" "),
        ],
        26,
      ),
  );

  return {
    kind: "low_follower",
    sourceId: sample.id,
    platform: platformId,
    relevanceScore,
    qualityScore,
    contradictionFlags: [],
    normalizedFacts: {
      title: sample.title,
      anomaly: sample.anomaly,
      fansCount: sample.fansCount,
      playCount: sample.playCount,
      contentForm: sample.contentForm,
    },
  };
}

export function buildEvidenceScreeningReport(params: {
  brief: PredictionBrief;
  fixture: TrendSeedFixture;
  verdict: PredictionVerdict;
  confidenceLabel: PredictionConfidenceLabel;
  scoreBreakdown: ScoreBreakdown;
  platformSnapshots: PlatformSnapshot[];
  lowFollowerSeedEvidence: PredictionLowFollowerEvidenceItem[];
}): PredictionEvidenceScreeningReport {
  const {
    brief,
    fixture,
    verdict,
    confidenceLabel,
    scoreBreakdown,
    platformSnapshots,
    lowFollowerSeedEvidence,
  } = params;
  const accountCandidates = fixture.accounts.map((account) =>
    buildAccountCandidate({ brief, fixture, platformSnapshots, account }),
  );
  const contentCandidates = fixture.contents.map((content) =>
    buildContentCandidate({ brief, fixture, platformSnapshots, content }),
  );
  const lowFollowerCandidates = lowFollowerSeedEvidence.map((sample) =>
    buildLowFollowerCandidate({
      brief,
      fixture,
      platformSnapshots,
      sample: {
        ...sample,
        publishedAt: sample.publishedAt,
      },
    }),
  );
  const candidates = [...accountCandidates, ...contentCandidates, ...lowFollowerCandidates];

  const sortCandidates = (items: PredictionEvidenceCandidate[]) =>
    [...items].sort(
      (left, right) =>
        right.relevanceScore + right.qualityScore - (left.relevanceScore + left.qualityScore),
    );

  const acceptedAccountIds = sortCandidates(accountCandidates)
    .filter((candidate) => candidate.relevanceScore >= 70 && candidate.qualityScore >= 60)
    .slice(0, 6)
    .map((candidate) => candidate.sourceId);
  const acceptedContentIds = sortCandidates(contentCandidates)
    .filter((candidate) => candidate.relevanceScore >= 70 && candidate.qualityScore >= 60)
    .slice(0, 6)
    .map((candidate) => candidate.sourceId);
  const acceptedLowFollowerIds = sortCandidates(lowFollowerCandidates)
    .filter(
      (candidate) =>
        candidate.relevanceScore >= 65 &&
        candidate.qualityScore >= 60 &&
        Number(candidate.normalizedFacts.anomaly ?? 0) >= 4,
    )
    .slice(0, 4)
    .map((candidate) => candidate.sourceId);

  const contradictionFlags = new Set<PredictionContradictionFlag>();
  if (contentCandidates.some((candidate) => candidate.contradictionFlags.includes("weak_comment_intent"))) {
    contradictionFlags.add("weak_comment_intent");
  }
  if (acceptedContentIds.length < 3) {
    contradictionFlags.add("insufficient_supporting_content");
  }
  if (acceptedLowFollowerIds.length === 0) {
    contradictionFlags.add("missing_low_follower_evidence");
  }
  if (brief.inputKind === "account" && acceptedAccountIds.length < 2) {
    contradictionFlags.add("low_account_fit");
  }
  if (brief.inputKind === "uploaded_asset") {
    contradictionFlags.add("asset_context_missing");
  }
  if (
    fixture.tierBreakdown.headKol >= 2 &&
    fixture.tierBreakdown.headKol >= fixture.tierBreakdown.strongKoc + fixture.tierBreakdown.standardKoc
  ) {
    contradictionFlags.add("high_head_concentration");
  }

  const missingEvidence = dedupeStrings([
    ...(fixture.evidenceGaps ?? []),
    acceptedAccountIds.length === 0
      ? "相关账号数据还在丰富中，可以先参考已有样本制定策略。"
      : "",
    acceptedContentIds.length < 3
      ? "当前已找到初步支持内容，可以先用这些样本快速验证。"
      : "",
    acceptedLowFollowerIds.length === 0
      ? "低粉异常样本还在搜集中，可以通过“拆解低粉爆款”CTA让AI专门搜索。"
      : "",
    contentCandidates.every((candidate) => candidate.contradictionFlags.includes("weak_comment_intent"))
      ? "评论意图信号还在积累，可以通过监控持续跟踪变化。"
      : "",
    brief.inputKind === "uploaded_asset"
      ? "当前还没有对上传素材做真实解析，只能给承接缺口，不给完整开拍方案。"
      : "",
    confidenceLabel === "低"
      ? "当前账号或竞品上下文不足，结论更适合作为待验证判断。"
      : "",
  ]);

  const contradictionSummary = dedupeStrings(
    [...contradictionFlags].map((flag) => {
      switch (flag) {
        case "weak_comment_intent":
          return "热度在涨，但评论里还没有稳定出现同一类问题词，说明用户真实意图还不够集中。";
        case "high_head_concentration":
          return "头部账号集中度偏高，如果没有更多中腰部样本，容易把头部红利误判成普适机会。";
        case "missing_low_follower_evidence":
          return "当前缺少低粉异常样本，说明“可复制性”还没有被样本级证据证明。";
        case "low_account_fit":
          return "账号适配证据不够，不能仅凭热度就判断当前账号一定能吃到这波机会。";
        case "asset_context_missing":
          return "素材输入没有真实解析，当前只能给补拍和承接建议，不能直接给完整开拍方案。";
        case "insufficient_supporting_content":
          return "支持内容还在积累中，可以先用已有样本快速验证。";
        default:
          return "";
      }
    }),
  );

  let safeActionLevel: PredictionSafeActionLevel =
    verdict === "go_now"
      ? "shoot_now"
      : verdict === "test_small"
        ? "test_one"
        : verdict === "observe"
          ? "watch_first"
          : "not_now";

  if (confidenceLabel === "低") {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "watch_first");
  }
  if (acceptedContentIds.length < 3) {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "test_one");
  }
  if (acceptedContentIds.length < 2) {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "watch_first");
  }
  if (acceptedLowFollowerIds.length === 0 && verdict === "go_now") {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "test_one");
  }
  if (brief.inputKind === "account" && acceptedAccountIds.length < 2) {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "watch_first");
  }
  if (brief.inputKind === "uploaded_asset") {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "watch_first");
  }
  if (scoreBreakdown.risk >= 72 && acceptedLowFollowerIds.length === 0) {
    safeActionLevel = downgradeSafeAction(safeActionLevel, "watch_first");
  }
  if (scoreBreakdown.opportunity < 50) {
    safeActionLevel = "not_now";
  }

  const evidenceAlignment: PredictionEvidenceAlignment =
    acceptedContentIds.length >= 3 &&
    acceptedAccountIds.length >= 2 &&
    contradictionSummary.length === 0
      ? "strong"
      : acceptedContentIds.length >= 2 && contradictionSummary.length <= 2
        ? "medium"
        : "weak";

  return {
    safeActionLevel,
    evidenceAlignment,
    acceptedAccountIds,
    acceptedContentIds,
    acceptedLowFollowerIds,
    missingEvidence,
    contradictionSummary,
    candidates,
  };
}

export function filterAcceptedAccounts(
  accounts: PredictionSupportingAccount[],
  screeningReport: PredictionEvidenceScreeningReport,
) {
  const acceptedIds = new Set(screeningReport.acceptedAccountIds);
  return accounts.filter((account) => acceptedIds.has(account.accountId)).slice(0, 6);
}

export function filterAcceptedContents(
  contents: PredictionSupportingContent[],
  screeningReport: PredictionEvidenceScreeningReport,
) {
  const acceptedIds = new Set(screeningReport.acceptedContentIds);
  return contents.filter((content) => acceptedIds.has(content.contentId)).slice(0, 6);
}

export function filterAcceptedLowFollowerEvidence(
  items: PredictionLowFollowerEvidenceItem[],
  screeningReport: PredictionEvidenceScreeningReport,
) {
  const acceptedIds = new Set(screeningReport.acceptedLowFollowerIds);
  return items.filter((item) => acceptedIds.has(item.id)).slice(0, 4);
}

export function buildSupportingAccounts(fixture: TrendSeedFixture) {
  return fixture.accounts.map<PredictionSupportingAccount>((account) => ({
    accountId: account.accountId,
    displayName: account.displayName,
    handle: account.handle,
    platform: PLATFORM_LABELS[account.platform],
    tierLabel: account.tierLabel,
    followerCount: account.performance.followerCount,
    followingCount: null,
    totalLikeCount: null,
    avgEngagementRate30d: account.performance.avgEngagementRate30d,
    breakoutHitRate30d: account.performance.breakoutHitRate30d,
    recentTopicClusters: account.recentTopicClusters,
    whyIncluded: account.whyIncluded,
  }));
}

export function buildSupportingContents(fixture: TrendSeedFixture) {
  return fixture.contents.map<PredictionSupportingContent>((content) => ({
    contentId: content.contentId,
    title: content.title,
    authorName: content.authorName,
    platform: PLATFORM_LABELS[content.platform],
    publishedAt: content.performance.publishedAt,
    viewCount: content.performance.viewCount ?? null,
    likeCount: content.performance.likeCount ?? null,
    commentCount: content.performance.commentCount ?? null,
    shareCount: content.performance.shareCount ?? null,
    collectCount: null,
    structureSummary: content.structureSummary,
    keywordTokens: content.keywordTokens,
    whyIncluded: content.whyIncluded,
  }));
}

export function buildLowFollowerEvidence(
  sampleIds: string[],
  lowFollowerSamples: LowFollowerSource[],
) {
  const sampleMap = new Map(lowFollowerSamples.map((sample) => [sample.id, sample]));
  return sampleIds
    .map((sampleId) => sampleMap.get(sampleId))
    .filter((sample): sample is LowFollowerSource => Boolean(sample))
    .map<PredictionLowFollowerEvidenceItem>((sample) => ({
      id: sample.id,
      platform: sample.platform,
      contentForm: sample.contentForm,
      title: sample.title,
      account: sample.account,
      fansLabel: sample.fansLabel,
      fansCount: sample.fansCount,
      anomaly: sample.anomaly,
      playCount: sample.playCount,
      engagementCount: 0,
      trackTags: sample.trackTags,
      suggestion: sample.suggestion,
      publishedAt: sample.publishedAt,
    }));
}

export function buildEvidenceGaps(
  screeningReport: PredictionEvidenceScreeningReport,
) {
  return dedupeStrings(screeningReport.missingEvidence);
}
