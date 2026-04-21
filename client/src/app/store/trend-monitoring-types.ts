export type SupportedTrendPlatform = "douyin" | "xiaohongshu" | "kuaishou";

export type AccountTierLabel =
  | "head_kol"
  | "standard_kol"
  | "strong_koc"
  | "standard_koc"
  | "watch_account";

export type TopicMomentumLabel = "emerging" | "accelerating" | "crowded" | "cooling";

export type WatchTaskType = "account_watch" | "topic_watch" | "validation_watch";

export type WatchTaskPriority = "high" | "medium" | "low";

export type WatchTaskStatus = "pending" | "running" | "completed" | "failed" | "paused";

export type WatchScheduleTier = "high_frequency" | "daily" | "every_72h";

export type ValidationLabel = "confirmed" | "weakened" | "missed" | "false_positive";

export type TrendTaskType =
  | "industry_bootstrap"
  | "account_watch"
  | "topic_watch"
  | "validation_watch"
  | "content_enrich";

export type ExecutionStatus = "success" | "partial_success" | "failed";

export type DegradeFlag =
  | "fallback_search_route"
  | "fallback_user_route"
  | "fallback_detail_route"
  | "fallback_comment_route"
  | "sparse_comments"
  | "sparse_followers"
  | "sparse_hotlist"
  | "platform_partial_failure";

export interface IndustrySeedTerms {
  keywords: string[];
  audienceTerms: string[];
  scenarioTerms: string[];
  painPointTerms: string[];
}

export interface IndustryProfile {
  industryId: string;
  industryName: string;
  seedTerms: IndustrySeedTerms;
  candidatePlatforms: SupportedTrendPlatform[];
  bootstrapVersion: string;
}

export interface PlatformTierThreshold {
  kocMinFollowers: number;
  kocMaxFollowers: number;
  kolMinFollowers: number;
  kolMaxFollowers: number;
  headKolMinFollowers: number;
}

export interface AccountTierRuleSet {
  version: string;
  platforms: Record<SupportedTrendPlatform, PlatformTierThreshold>;
  weakKolEngagementMedianMultiplier: number;
  strongKocEngagementP75Multiplier: number;
  anomalyHitWindowDays: number;
}

export const ACCOUNT_TIER_RULES_V1: AccountTierRuleSet = {
  version: "account-tier-rules.v1",
  platforms: {
    douyin: {
      kocMinFollowers: 1_000,
      kocMaxFollowers: 100_000,
      kolMinFollowers: 100_000,
      kolMaxFollowers: 3_000_000,
      headKolMinFollowers: 3_000_000,
    },
    xiaohongshu: {
      kocMinFollowers: 500,
      kocMaxFollowers: 50_000,
      kolMinFollowers: 50_000,
      kolMaxFollowers: 1_000_000,
      headKolMinFollowers: 1_000_000,
    },
    kuaishou: {
      kocMinFollowers: 1_000,
      kocMaxFollowers: 100_000,
      kolMinFollowers: 100_000,
      kolMaxFollowers: 5_000_000,
      headKolMinFollowers: 5_000_000,
    },
  },
  weakKolEngagementMedianMultiplier: 1,
  strongKocEngagementP75Multiplier: 1,
  anomalyHitWindowDays: 30,
};

export interface AccountPerformanceSnapshot {
  followerCount: number | null;
  contentCount30d: number;
  avgEngagementRate30d: number | null;
  engagementPer1kFollowers30d: number | null;
  postingFrequency30d: number | null;
  breakoutHitRate30d: number | null;
}

export interface ObservedAccount {
  accountId: string;
  platform: SupportedTrendPlatform;
  handle: string;
  displayName: string;
  industryId: string;
  tierLabel: AccountTierLabel;
  followerPercentileInIndustry?: number | null;
  engagementPercentileInIndustry?: number | null;
  breakoutHitPercentileInIndustry?: number | null;
  performance: AccountPerformanceSnapshot;
  recentTopicClusters: string[];
  isWhitelisted?: boolean;
  isBlacklisted?: boolean;
  lastObservedAt?: string;
}

export interface TopicClusterEvidenceWindow {
  startAt: string;
  endAt: string;
  lookbackDays: number;
}

export interface ObservedTopic {
  topicId: string;
  industryId: string;
  platform: SupportedTrendPlatform;
  topicCluster: string;
  seedKeywords: string[];
  evidenceWindow: TopicClusterEvidenceWindow;
  hotRankFrequency?: number | null;
  searchHeat?: number | null;
  growth7d?: number | null;
}

export interface ContentStructureFeatures {
  hookType?: string;
  narrativePattern?: string;
  visualFormat?: string;
  durationBucket?: string;
}

export interface ContentPerformanceFeatures {
  publishedAt: string;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  viewCount?: number | null;
  engagementPer1kFollowers?: number | null;
  commentQuestionClusters?: string[];
}

export interface ObservedContent {
  contentId: string;
  platform: SupportedTrendPlatform;
  authorId: string;
  industryId: string;
  topicCluster: string;
  title: string;
  keywordTokens: string[];
  tags: string[];
  structure: ContentStructureFeatures;
  performance: ContentPerformanceFeatures;
}

export interface TrendOpportunityEvidence {
  supportingContentIds: string[];
  supportingAccountIds: string[];
  lowFollowerSampleIds: string[];
}

export interface TrendOpportunity {
  trendId: string;
  industryId: string;
  industryName: string;
  platform: SupportedTrendPlatform;
  topicCluster: string;
  momentumLabel: TopicMomentumLabel;
  evidenceWindow: TopicClusterEvidenceWindow;
  kolCount: number;
  kocCount: number;
  newCreatorCount: number;
  similarContentCount: number;
  growth7d: number;
  lowFollowerAnomalyRatio: number;
  competitionScore: number;
  opportunityScore: number;
  riskScore: number;
  timingLabel: string;
  whyNow: string;
  whyRisky: string;
  recommendedAction: string;
  evidence: TrendOpportunityEvidence;
  accountTierRuleVersion: string;
  trendDetectionRuleVersion: string;
  scoreEngineVersion: string;
}

export interface WatchTask {
  taskId: string;
  industryId: string;
  platform: SupportedTrendPlatform;
  taskType: WatchTaskType;
  priority: WatchTaskPriority;
  status: WatchTaskStatus;
  scheduleTier: WatchScheduleTier;
  queryPayload: Record<string, unknown>;
  resultSnapshotRef?: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface TaskBudgetSnapshot {
  taskType: TrendTaskType;
  platform: SupportedTrendPlatform;
  baseBudget: number;
  cookieExtraBudget?: number;
  actualUsed: number;
  cacheHits?: number;
}

export interface PlatformExecutionPlan {
  platform: SupportedTrendPlatform;
  taskType: TrendTaskType;
  primaryEndpoints: string[];
  fallbackEndpoints: string[];
  supportsCookieExtra: boolean;
  routeVersion: string;
}

export interface TaskExecutionResult {
  taskId: string;
  taskType: TrendTaskType;
  platform: SupportedTrendPlatform;
  executionStatus: ExecutionStatus;
  budgetSnapshot: TaskBudgetSnapshot;
  degradeFlags: DegradeFlag[];
  degradeReason?: string;
  resultSnapshotRef?: string;
  executedAt: string;
}

export interface ValidationDeltaMetrics {
  similarContentDelta?: number;
  kolDelta?: number;
  kocDelta?: number;
  growth7dDelta?: number;
  anomalyRatioDelta?: number;
}

export interface ValidationRun {
  validationId: string;
  trendId: string;
  predictedAt: string;
  validatedAt: string;
  expectedDirection: "up" | "flat" | "down";
  actualDirection: "up" | "flat" | "down";
  deltaMetrics: ValidationDeltaMetrics;
  validationLabel: ValidationLabel;
  evidenceQuality?: "strong" | "partial" | "sparse";
  degradeFlags?: DegradeFlag[];
  ruleVersions: {
    accountTierRuleVersion: string;
    trendDetectionRuleVersion: string;
    scoreEngineVersion: string;
    validationDatasetVersion: string;
  };
}
