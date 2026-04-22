export type ConnectorAuthMode = "public" | "cookie";
export type AppDataMode = "mock" | "live";

export type PredictionRequestEntrySource = "manual" | "example" | "skill";

export type TaskIntent =
  | "opportunity_prediction"
  | "trend_watch"
  | "viral_breakdown"
  | "topic_strategy"
  | "copy_extraction"
  | "account_diagnosis"
  | "breakdown_sample"  // 低粉爆款样本拆解技能
  | "direct_request";   // 直接需求（不适合结构化卡片，用编辑器展示）

export type TaskIntentConfidence = "high" | "medium" | "low";

export type AgentRunSource =
  | "home_input"
  | "example"
  | "skill"
  | "follow_up"
  | "watch_runtime";

export type AgentRunStatus = "queued" | "running" | "completed" | "degraded" | "failed";

export type TaskArtifactType =
  | "opportunity_memo"
  | "trend_watchlist"
  | "breakdown_sheet"
  | "topic_plan"
  | "copy_pack"
  | "account_diagnosis_sheet"
  | "breakdown_sample_sheet"  // 低粉爆款样本拆解产物
  | "direct_request_doc";     // 直接需求文档产物

export type NotificationProvider = "feishu" | "wecom" | "qq";

export type NotificationEventType =
  | "prediction_succeeded"
  | "prediction_failed"
  | "connector_bound"
  | "connector_needs_auth"
  | "connector_sync_failed"
  | "watch_succeeded"
  | "watch_degraded"
  | "watch_failed";

export type NotificationVerifyStatus = "idle" | "verified" | "failed";

export type NotificationDeliveryStatus = "idle" | "success" | "failed";

export type FollowerScale =
  | "0-1w"
  | "1w-10w"
  | "10w-100w"
  | "100w+"
  | "";

export interface UserProfile {
  /** 创作者昵称 */
  nickname: string;
  /** 创作方向 / 垂类，如 "美妆护肤" */
  niche: string;
  /** 主要运营平台 ID 列表 */
  platforms: string[];
  /** 粉丝量级 */
  followerScale: FollowerScale;
  /** AI 分析偏好 / 自定义指令 */
  instructions: string;
  /** 内容风格标签，如 ["教程", "vlog", "种草"] */
  contentStyleTags: string[];
  /** 最后一次由账号连接自动更新的时间 */
  lastAutoSyncAt?: string;
}

export type ConnectorSyncStatus =
  | "idle"
  | "verified"
  | "stale"
  | "needs_auth";

export interface ConnectorCapabilities {
  supportsSearch: boolean;
  supportsHotList: boolean;
  supportsDetail: boolean;
  supportsComments: boolean;
  supportsPublicProfile: boolean;
  supportsCookieAnalytics: boolean;
}

export interface ConnectorBindingInput {
  authMode: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
  platformUserId?: string;
  loginSessionId?: string;
}

export interface NotificationBindingInput {
  displayName?: string;
  webhookUrl?: string;
  secret?: string;
  enabled?: boolean;
  subscribedEvents: NotificationEventType[];
  /** 飞书应用模式字段 */
  feishuTargetId?: string;
  feishuTargetType?: "open_id" | "user_id" | "chat_id";
  feishuTargetName?: string;
}

export interface PlatformCallBudget {
  topic: number;
  link: number;
  account: number;
  cookieExtra?: number;
}

export interface PlatformPredictionMeta {
  platformId: string;
  platformName: string;
  predictionEnabled: boolean;
  endpointFamilies: string[];
  coreFields: string[];
  capabilities: ConnectorCapabilities;
  callBudget: PlatformCallBudget;
}

export type PredictionInputKind =
  | "prompt"
  | "account"
  | "content_url"
  | "uploaded_asset";

export type PredictionPersonalizationMode = "public" | "cookie";

export interface PredictionEvidenceItem {
  id: string;
  kind: "video" | "image" | "file" | "doc";
  label: string;
  display: string;
  source: string;
  content?: string;
}

export interface PredictionRequestDraft {
  prompt: string;
  evidenceItems: PredictionEvidenceItem[];
  selectedPlatforms: string[];
  connectedPlatforms: string[];
  personalizationMode: PredictionPersonalizationMode;
  entrySource?: PredictionRequestEntrySource;
  entryTemplateId?: string;
  selectedSkillId?: string;
  skillLabel?: string;
  skillPrompt?: string;
  /**
   * 父任务 Artifact ID（上下文继承）
   * 设置后，服务端会从父任务中继承 platform/keyword/industry 等上下文
   */
  parentArtifactId?: string;
  /**
   * 多模态输入解析结果（live 模式下由服务端填充）
   * 包含 URL 内容、图片 OCR、文档文本等解析后的文本
   */
  parsedInput?: {
    kind: string;
    extractedText: string;
    title?: string;
    sourceUrl?: string;
    platform?: string;
    metadata?: Record<string, unknown>;
  };
  /**
   * 动态提取的任务参数（live 模式下由服务端填充）
   * LLM 从 Prompt 中结构化提取的 keyword/platform/awemeId 等
   */
  extractedParams?: {
    keyword: string | null;
    platform: string | null;
    awemeId: string | null;
    noteId: string | null;
    uniqueId: string | null;
    contentUrl: string | null;
    industry: string | null;
    confidence: string;
  };
  /**
   * LLM 意图识别结果注入（live 模式下由服务端填充，覆盖正则规则）
   * mock 模式下此字段不存在，完全不受影响
   */
  llmIntentOverride?: {
    taskIntent: TaskIntent;
    confidence: TaskIntentConfidence;
    candidateIntents: TaskIntent[];
    reasons: string[];
    llmUsed: boolean;
  };
}

export interface TaskIntentClassification {
  taskIntent: TaskIntent;
  confidence: TaskIntentConfidence;
  candidateIntents: TaskIntent[];
  reasons: string[];
}

export interface PredictionBrief {
  inputKind: PredictionInputKind;
  seedTopic: string;
  industry: string;
  candidatePlatforms: string[];
  accountContext: string;
  competitorEvidence: string[];
  personalizationMode: PredictionPersonalizationMode;
}

export interface PlatformSnapshot {
  platformId: string;
  platformName: string;
  authMode: ConnectorAuthMode;
  predictionEnabled: boolean;
  callBudget: PlatformCallBudget;
  endpointFamilies: string[];
  coreFields: string[];
  capabilitySummary: string[];
  signals: string[];
}

export interface ScoreBreakdown {
  demand: number;
  competition: number;
  anomaly: number;
  fit: number;
  opportunity: number;
  timing: number;
  risk: number;
}

export type PredictionVerdict = "go_now" | "test_small" | "observe" | "not_now";

export type PredictionConfidenceLabel = "高" | "中" | "低";

export type PredictionOpportunityType =
  | "search_window"
  | "anomaly_window"
  | "structure_window"
  | "fit_window"
  | "false_heat";

export type PredictionWindowStrength =
  | "strong_now"
  | "validate_first"
  | "observe"
  | "avoid";

export interface PredictionEvidenceSummaryItem {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "neutral" | "warning";
}

export interface PredictionTierBreakdown {
  headKol: number;
  standardKol: number;
  strongKoc: number;
  standardKoc: number;
}

export interface PredictionCommentHighlight {
  contentId: string;
  contentTitle: string;
  topComments: {
    text: string;
    likeCount: number;
    authorName: string;
  }[];
  totalCommentCount: number;
}

export interface PredictionCommentInsight {
  totalCommentsCollected: number;
  highFreqKeywords: string[];
  sentimentSummary: "positive" | "mixed" | "negative" | "unknown";
  demandSignals: string[];
  highlights: PredictionCommentHighlight[];
  /** 评论不可用时的原因说明（如快手评论接口不可用） */
  unavailableReason?: string;
}

export interface PredictionMarketEvidence {
  evidenceWindowLabel: string;
  momentumLabel: "emerging" | "accelerating" | "crowded" | "cooling";
  kolCount: number;
  kocCount: number;
  newCreatorCount: number;
  similarContentCount: number;
  growth7d: number;
  lowFollowerAnomalyRatio: number;
  timingLabel: string;
  tierBreakdown: PredictionTierBreakdown;
}

export interface PredictionSupportingAccount {
  accountId: string;
  displayName: string;
  handle: string;
  platform: string;
  profileUrl?: string;
  tierLabel:
    | "head_kol"
    | "standard_kol"
    | "strong_koc"
    | "standard_koc"
    | "watch_account";
  followerCount: number | null;
  followingCount: number | null;
  totalLikeCount: number | null;
  avgEngagementRate30d: number | null;
  breakoutHitRate30d: number | null;
  recentTopicClusters: string[];
  whyIncluded: string;
}

export interface PredictionSupportingContent {
  contentId: string;
  title: string;
  authorName: string;
  platform: string;
  publishedAt: string;
  contentUrl?: string;
  coverUrl?: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  structureSummary: string;
  keywordTokens: string[];
  whyIncluded: string;
}

export interface PredictionLowFollowerEvidenceItem {
  id: string;
  platform: string;
  contentForm: string;
  title: string;
  account: string;
  contentUrl?: string;
  coverUrl?: string | null;
  fansLabel: string;
  fansCount: number;
  anomaly: number;
  playCount: string;
  likeCount?: number | null;
  commentCount?: number | null;
  collectCount?: number | null;
  shareCount?: number | null;
  trackTags: string[];
  suggestion: string;
  publishedAt: string;
}

export interface PredictionEvidenceRefs {
  supportingAccountIds: string[];
  supportingContentIds: string[];
  lowFollowerSampleIds: string[];
}

export type PredictionEvidenceCandidateKind =
  | "topic"
  | "account"
  | "content"
  | "low_follower"
  | "comment_intent"
  | "cookie_signal";

export type PredictionContradictionFlag =
  | "weak_comment_intent"
  | "high_head_concentration"
  | "missing_low_follower_evidence"
  | "low_account_fit"
  | "asset_context_missing"
  | "insufficient_supporting_content";

export type PredictionEvidenceAlignment = "strong" | "medium" | "weak";

export type PredictionSafeActionLevel =
  | "shoot_now"
  | "test_one"
  | "watch_first"
  | "not_now";

export interface PredictionEvidenceCandidate {
  kind: PredictionEvidenceCandidateKind;
  sourceId: string;
  platform: string;
  relevanceScore: number;
  qualityScore: number;
  contradictionFlags: PredictionContradictionFlag[];
  normalizedFacts: Record<string, string | number | boolean | null>;
}

export interface PredictionEvidenceScreeningReport {
  safeActionLevel: PredictionSafeActionLevel;
  evidenceAlignment: PredictionEvidenceAlignment;
  acceptedAccountIds: string[];
  acceptedContentIds: string[];
  acceptedLowFollowerIds: string[];
  missingEvidence: string[];
  contradictionSummary: string[];
  candidates: PredictionEvidenceCandidate[];
}

export interface PredictionWhyNowItem {
  sourceLabel: string;
  fact: string;
  inference: string;
  userImpact: string;
  tone: "positive" | "neutral" | "warning";
}

export interface PredictionResultCardPreviewSection {
  title: string;
  items: string[];
  tone?: "positive" | "neutral" | "warning";
}

export type PredictionResultCardActionMode =
  | "navigate"
  | "open_deep_dive"
  | "save_snapshot";

export type PredictionWatchTaskType =
  | "account_watch"
  | "topic_watch"
  | "content_watch"
  | "validation_watch";

export type PredictionWatchTaskPriority = "high" | "medium" | "low";

export type PredictionWatchScheduleTier = "daily" | "every_72h" | "weekly";

export type PredictionWatchTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type PredictionExecutionStatus =
  | "success"
  | "partial_success"
  | "failed";

export interface PredictionResultArtifactStatus {
  artifactId: string;
  savedAt: string;
  watchTaskId?: string;
  watchStatus?: PredictionWatchTaskStatus;
  lastWatchRunAt?: string;
  lastExecutionStatus?: PredictionExecutionStatus;
}

export interface PredictionWatchPreset {
  taskType: PredictionWatchTaskType;
  priority: PredictionWatchTaskPriority;
  scheduleTier: PredictionWatchScheduleTier;
  platform: "douyin" | "xiaohongshu" | "kuaishou";
  queryPayload: Record<string, unknown>;
}

export interface PredictionResultCard {
  title: string;
  ctaLabel: string;
  description: string;
  reason: string;
  previewSections: PredictionResultCardPreviewSection[];
  continueIf: string[];
  stopIf: string[];
  evidenceRefs: string[];
  actionMode: PredictionResultCardActionMode;
  actionTarget?: string;
  actionPrompt?: string;
}

export type PredictionRecommendedActionType =
  | "low_follower_validation"
  | "breakdown"
  | "account_benchmark"
  | "monitor"
  | "generate_test_brief";

export interface PredictionBestAction {
  type: PredictionRecommendedActionType;
  title: string;
  description: string;
  ctaLabel: string;
  reason: string;
}

export interface PredictionOperatorPanel {
  reportSummary: string;
  sourceNotes: string[];
  platformNotes: string[];
  benchmarkHints: string[];
  riskSplit: string[];
  counterSignals: string[];
  dataGaps: string[];
}

/* ── 爆款预测：趋势机会结构 ── */
export type TrendOpportunityStage =
  | "pre_burst"    // 爆发前夜
  | "validated"    // 已验证
  | "high_risk";   // 高风险假热

export interface TrendOpportunityTopic {
  title: string;
  hookType: string;
  angle: string;
  estimatedDuration: string;
}

export interface TrendOpportunity {
  /** 机会名称（赛道切入点，如「低粉素人开箱」） */
  opportunityName: string;
  /** 阶段标签 */
  stage: TrendOpportunityStage;
  /** 爆发指数 0-95 */
  opportunityScore: number;
  /** 时机分 0-100 */
  timingScore: number;
  /** 一句话结论 */
  oneLiner: string;
  /** 为什么现在做（3条） */
  whyNow: string[];
  /** 现在做（✅） */
  doNow: string;
  /** 先观察（⏳） */
  observe: string;
  /** 可执行选题 2-3 条 */
  executableTopics: TrendOpportunityTopic[];
  /** 证据摘要（折叠展示） */
  evidenceSummary: string;
}

export interface OpportunityPredictionTaskPayload {
  kind: "opportunity_prediction";
  highlight: string;
  verdictLabel: string;
  evidenceSummary: string[];
  bestActionReason: string;
  supportingProofTitles: string[];
  /** 爆款预测：多趋势机会列表（3-5个） */
  trendOpportunities?: TrendOpportunity[];
  /** 总览摘要一句话 */
  overviewOneLiner?: string;
}

export interface TrendWatchTaskPayload {
  kind: "trend_watch";
  watchSummary: string;
  watchSignals: Array<{
    label: string;
    detail: string;
  }>;
  revisitTriggers: string[];
  cooldownWarnings: string[];
  scheduleHint: string;
}

export interface ViralBreakdownTaskPayload {
  kind: "viral_breakdown";
  breakdownSummary: string;
  overallScore?: number;
  scoreDimensions?: {
    logic: number;
    emotion: number;
    visual: number;
    commercial: number;
  };
  coreLabels?: string[];
  oneLinerComment?: string;
  hookAnalysis?: {
    visualHook: string;
    audioHook: string;
    copyHookType: string;
    copyHookReason: string;
    hookImitationTip: string;
  };
  rhythmAnalysis?: {
    stimulusIntervalSeconds: number;
    emotionCurve: string;
    dopamineNodes: string[];
  };
  scriptLogic?: {
    structureModules: string[];
    powerWords: string[];
    goldenQuotes: string[];
  };
  monetizationAnalysis?: {
    personaType: string;
    monetizationPoints: string[];
    conversionScript: string;
  };
  engagementEngineering?: {
    controversyTraps: string;
    predictedTopComments: string[];
    ctaType: string;
  };
  copyPoints: string[];
  avoidPoints: string[];
  migrationSteps: string[];
  scriptSkeleton?: string;
  shootingGuide?: {
    shotComposition: string;
    performanceStyle: string;
    bgmStyle: string;
  };
  hookType?: string;
  contentStructure?: string;
  estimatedDuration?: string;
  targetAudience?: string;
  proofContents: Array<{
    contentId: string;
    title: string;
    structureSummary: string;
    whyIncluded: string;
  }>;
}

/* ── Topic Strategy V2 Sub-Types ── */

export interface TopicDirectionV2 {
  id: string;
  directionName: string;
  directionLogic: string;
  targetStage: string;
  testPlan: string;
  trafficPotential: number;
  productionCost: number;
  competitionLevel: number;
  priorityRank: number;
  validationScore: number;
  validationStatus: string;
  validationBreakdown: {
    searchHitScore: number;
    lowFollowerScore: number;
    commentDemandScore: number;
    peerSuccessScore: number;
  };
  platformScores: Record<string, { score: number; searchHits: number; details: string }>;
  /** P1-5: 验证证据链（每个维度的具体命中内容） */
  validationEvidence?: {
    matchedContentTitles?: string[];
    realCommentDemands?: string[];
    matchedPeerNames?: string[];
  };
  executableTopics: Array<{
    title: string;
    angle: string;
    hookType: string;
    estimatedDuration: string;
  }>;
  evolvedChildren?: TopicDirectionV2[];
}

export interface PeerBenchmarkV2 {
  platform: string;
  accountId: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  followerCount: number;
  avgInteractionRate: number;
  comparisonNotes?: string;
  recentWorks: Array<{
    title: string;
    likeCount: number;
    viewCount?: number;
    shareCount?: number;
    publishedAt?: string;
    contentUrl?: string;
  }>;
}

export interface CrossIndustryInsightV2 {
  sourceIndustry: string;
  sourceTitle: string;
  sourcePlatform: string;
  migrationIdea: string;
  confidence: number;
  transferableElements: Array<{
    element: string;
    reason: string;
    adaptationHint: string;
  }>;
}

export interface TopicStrategyV2Data {
  sessionId: string;
  track: string;
  accountStage: string;
  platforms: string[];
  strategySummary: string;
  directions: TopicDirectionV2[];
  peerBenchmarks: PeerBenchmarkV2[];
  crossIndustryInsights: CrossIndustryInsightV2[];
  pipelineProgress: {
    stage1_ms: number;
    stage2_ms: number;
    stage3_ms: number;
    stage4_ms: number;
    stage5_ms: number;
    total_ms: number;
  };
  searchKeywords: Array<{ keyword: string; source: string; platform: string }>;
  rawDataSummary: {
    totalContents: number;
    totalAccounts: number;
    totalHotSeeds: number;
    byPlatform: Record<string, { contents: number; accounts: number; hotSeeds: number }>;
  };
}

export interface TopicStrategyTaskPayload {
  kind: "topic_strategy";
  strategySummary: string;
  /** V1 兼容字段 */
  topicDirections: Array<{
    title: string;
    whyNow: string;
    fitNote: string;
  }>;
  fitRationale: string;
  firstMoves: string[];
  stopRules: string[];
}

export interface CopyExtractionTaskPayload {
  kind: "copy_extraction";
  extractionSummary: string;
  hookPatterns: string[];
  structurePatterns: string[];
  ctaPatterns: string[];
  reusablePhrases: string[];
}

export interface AccountDiagnosisTaskPayload {
  kind: "account_diagnosis";
  diagnosisSummary: string;
  strengths: string[];
  gaps: string[];
  benchmarkAccounts: Array<{
    accountId: string;
    displayName: string;
    handle: string;
    tierLabel: PredictionSupportingAccount["tierLabel"];
    whyIncluded: string;
  }>;
  adjustments: string[];
}

export interface BreakdownSampleTaskPayload {
  kind: "breakdown_sample";
  /** 样本基础信息 */
  sampleId: string;
  sampleTitle: string;
  platform: string;
  contentForm: string;
  anomaly: number;
  fansLabel: string;
  playCount: string;
  trackTags: string[];
  /** 拆解结果 */
  burstReasons: string[];
  breakdownSummary: string;
  copyPoints: string[];       // 值得抄
  avoidPoints: string[];      // 别直接照抄
  migrationSteps: string[];   // 迁移步骤
  titleVariants: string[];    // 标题变体
  hookVariants: string[];     // 开头钉子
  contentOutline: string[];   // 内容提纲
  /** 相似样本（用于展示相似案例） */
  similarSamples: Array<{
    id: string;
    title: string;
    platform: string;
    anomaly: number;
    fansLabel: string;
    trackTags: string[];
  }>;
}

export interface DirectRequestTaskPayload {
  kind: "direct_request";
  /** 用户原始输入 */
  userPrompt: string;
  /** AI 生成的完整 Markdown 报告 */
  reportMarkdown: string;
  /** 核心结论摘要 */
  coreSummary: string;
  /** 建议下一步 */
  suggestedNextSteps: string[];
}

export type AgentTaskPayload =
  | OpportunityPredictionTaskPayload
  | TrendWatchTaskPayload
  | ViralBreakdownTaskPayload
  | TopicStrategyTaskPayload
  | CopyExtractionTaskPayload
  | AccountDiagnosisTaskPayload
  | BreakdownSampleTaskPayload
  | DirectRequestTaskPayload;

export interface AgentRecommendedTask {
  taskIntent: TaskIntent;
  title: string;
  reason: string;
  actionLabel: string;
}

export interface TaskArtifact {
  artifactId: string;
  runId: string;
  taskIntent: TaskIntent;
  artifactType: TaskArtifactType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  snapshotRefs: string[];
  createdAt: string;
  updatedAt: string;
  watchable: boolean;
  shareable: boolean;
}

export interface AgentRun {
  runId: string;
  parentRunId?: string;
  source: AgentRunSource;
  taskIntent: TaskIntent;
  taskIntentConfidence: TaskIntentConfidence;
  status: AgentRunStatus;
  brief: PredictionBrief;
  facts: {
    platformSnapshots: PlatformSnapshot[];
    scoreBreakdown: ScoreBreakdown;
    evidenceRefs?: PredictionEvidenceRefs;
  };
  judgment: {
    title: string;
    summary: string;
    verdict?: PredictionVerdict;
    confidenceLabel?: PredictionConfidenceLabel;
    bestAction?: PredictionBestAction;
  };
  deliverables: Array<{
    kind: string;
    title: string;
    description: string;
    ctaLabel?: string;
  }>;
  recommendedNextTasks: AgentRecommendedTask[];
  artifacts: TaskArtifact[];
  runtimeMeta?: Record<string, unknown>;
  degradeFlags: string[];
  taskPayload: AgentTaskPayload;
}

export interface PredictionUiResult {
  type: "爆款预测" | "趋势观察" | "爆款拆解" | "选题策略" | "文案提取" | "账号诊断";
  platform: string[];
  score: number;
  scoreLabel: string;
  verdict: PredictionVerdict;
  confidenceLabel: PredictionConfidenceLabel;
  opportunityTitle: string;
  opportunityType: PredictionOpportunityType;
  windowStrength: PredictionWindowStrength;
  coreBet: string;
  decisionBoundary: string;
  marketEvidence: PredictionMarketEvidence;
  supportingAccounts: PredictionSupportingAccount[];
  supportingContents: PredictionSupportingContent[];
  lowFollowerEvidence: PredictionLowFollowerEvidenceItem[];
  evidenceGaps: string[];
  whyNowItems: PredictionWhyNowItem[];
  bestFor: string[];
  notFor: string[];
  accountMatchSummary: string;
  bestActionNow: PredictionBestAction;
  whyNotOtherActions: string[];
  missIfWait?: string;
  operatorPanel?: PredictionOperatorPanel;
  screeningReport: PredictionEvidenceScreeningReport;
  primaryCard: PredictionResultCard;
  secondaryCard: PredictionResultCard;
  fitSummary: string;
  recommendedNextAction: PredictionBestAction;
  continueIf: string[];
  stopIf: string[];
  commentInsight?: PredictionCommentInsight;
}

export interface PredictionArtifacts {
  normalizedBrief: PredictionBrief;
  platformSnapshots: PlatformSnapshot[];
  scoreBreakdown: ScoreBreakdown;
  uiResult: PredictionUiResult;
  trendOpportunityId?: string;
  evidenceRefs?: PredictionEvidenceRefs;
  recommendedLowFollowerSampleIds: string[];
  taskIntent?: TaskIntent;
  taskIntentConfidence?: TaskIntentConfidence;
  classificationReasons?: string[];
  recommendedNextTasks?: AgentRecommendedTask[];
  primaryArtifact?: TaskArtifact;
  taskPayload?: AgentTaskPayload;
  agentRun?: AgentRun;
}
