/**
 * server/trend-intelligence.ts
 * ═══════════════════════════════════════════════════════════════
 * 赛道情报分析层 — 模块三核心
 *
 * 功能：
 * 1. 行业特征建模（IndustrySeedTerms）：从用户 Prompt 提取行业词/人群词/场景词
 * 2. 热点与搜索趋势融合：整合 hot_seed + 关键词搜索数据，计算 TopicFeatureRow
 * 3. 内容特征提取：从 TikHub 原始数据映射为标准化 ContentFeatureRow
 * 4. 账号特征提取：从 TikHub 原始数据映射为标准化 AccountFeatureRow
 * 5. 低粉异常检测：识别低粉高互动的异常内容（低粉爆款信号）
 *
 * 原则：
 * - 所有特征数据必须源自 TikHub 真实数据，不使用 LLM 自由推断
 * - LLM 只用于行业词提取（结构化提取，不自由发挥）
 * - 数据稀疏时降级处理，不补全假数据
 * ═══════════════════════════════════════════════════════════════
 */

import { callLLM, type LLMMessage } from "./llm-gateway.js";

// ─────────────────────────────────────────────
// 类型定义（与 archive/schemas.py 对齐，使用 camelCase）
// ─────────────────────────────────────────────

export type SupportedTrendPlatform = "douyin" | "xiaohongshu";

export interface IndustrySeedTerms {
  /** 行业核心关键词（如"健身"、"减脂"） */
  keywords: string[];
  /** 目标人群词（如"宝妈"、"上班族"） */
  audienceTerms: string[];
  /** 使用场景词（如"居家"、"通勤"） */
  scenarioTerms: string[];
  /** 痛点词（如"失眠"、"焦虑"） */
  painPointTerms: string[];
}

export interface IndustryProfile {
  industryId: string;
  industryName: string;
  seedTerms: IndustrySeedTerms;
  candidatePlatforms: SupportedTrendPlatform[];
}

/** 内容特征行（从 TikHub 原始数据映射） */
export interface ContentFeatureRow {
  platform: SupportedTrendPlatform;
  contentId: string;
  authorId: string;
  titleText: string;
  bodyText: string;
  publishedAt: string;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  viewCount: number | null;
  saveCount: number | null;
  tags: string[];
  topicCluster: string;
}

/** 账号特征行（从 TikHub 原始数据映射） */
export interface AccountFeatureRow {
  platform: SupportedTrendPlatform;
  accountId: string;
  handle: string;
  displayName: string;
  followerCount: number | null;
  avgEngagementRate: number | null;
  tierLabel: "head_kol" | "standard_kol" | "strong_koc" | "standard_koc" | "watch_account";
}

/** 话题特征行（从热榜/搜索数据映射） */
export interface TopicFeatureRow {
  platform: SupportedTrendPlatform;
  topicQuery: string;
  searchHeat: number | null;
  hotRankFreq: number | null;
  growth7d: number | null;
  lowFollowerAnomalyRatio: number | null;
}

/** 低粉异常样本 */
export interface LowFollowerAnomalySample {
  contentId: string;
  authorId: string;
  followerCount: number;
  totalInteraction: number;
  interactionBenchmark: number;
  platform: SupportedTrendPlatform;
}

/** 赛道情报分析结果 */
export interface TrendIntelligenceResult {
  industryProfile: IndustryProfile;
  contentFeatures: ContentFeatureRow[];
  accountFeatures: AccountFeatureRow[];
  topicFeatures: TopicFeatureRow[];
  lowFollowerAnomalies: LowFollowerAnomalySample[];
  evidenceMetrics: EvidenceMetrics;
  dataQuality: DataQualityReport;
}

/** 证据指标（供评分引擎使用） */
export interface EvidenceMetrics {
  searchHeat: number;
  hotRankFreq: number;
  growth7d: number;
  newCreatorRatio: number;
  lowFollowerAnomalyRatio: number;
  headConcentration: number;
  contentDensity: number;
  topicVolatility: number;
  similarContentCount: number;
  creatorCount: number;
  kolCount: number;
  kocCount: number;
  hotSeedCount: number;
  commentCount: number;
}

/** 数据质量报告 */
export interface DataQualityReport {
  hasHotSeed: boolean;
  hasSearchData: boolean;
  hasCommentData: boolean;
  hasFollowerData: boolean;
  sparsityScore: number;
  degradeFlags: string[];
}

// ─────────────────────────────────────────────
// 权重配置（从 archive/rules.py 迁移）
// ─────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  // 需求度
  demandSearchHeat: 0.45,
  demandGrowth7d: 0.35,
  demandHotRank: 0.20,
  // 竞争度
  competitionHeadConcentration: 0.50,
  competitionContentDensity: 0.30,
  competitionVolatility: 0.20,
  // 异常度
  anomalyLowFollowerRatio: 0.60,
  anomalyNewCreatorRatio: 0.40,
  // 契合度
  fitPlatformMatch: 0.60,
  fitIndustryMatch: 0.40,
  // 综合机会分
  opportunityDemand: 0.35,
  opportunityAnomaly: 0.25,
  opportunityFit: 0.20,
  opportunityInverseCompetition: 0.20,
  // 时机分
  timingGrowth7d: 0.45,
  timingNewCreatorRatio: 0.30,
  timingHotRank: 0.25,
  // 风险分
  riskHeadConcentration: 0.40,
  riskContentDensity: 0.30,
  riskVolatility: 0.20,
  riskDataSparsity: 0.10,
} as const;

export const TREND_THRESHOLDS = {
  similarContentGrowthMin: 0.20,
  creatorGrowthMin: 0.15,
  newCreatorRatioMin: 0.25,
  lowFollowerAnomalyRatioMin: 0.18,
  evidenceRulesRequired: 3,
  minimumVisibleOpportunity: 60.0,
  strongOpportunity: 80.0,
  goodOpportunity: 70.0,
  highRisk: 75.0,
  mediumRisk: 60.0,
  // 低粉爆款严格阈值
  lowFollowerMaxCount: 10_000,
  lowFollowerMinPlayCount: 100_000,
  lowFollowerEngagementP75Multiplier: 1.5,
} as const;

// 平台账号分层阈值
export const PLATFORM_TIER_THRESHOLDS = {
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
} as const;

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function ensureList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.replace(/，/g, ",").split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function clamp0100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function scale0100(value: number | null, cap: number): number {
  if (value === null || !Number.isFinite(value) || cap <= 0) return 0;
  return clamp0100((value / cap) * 100);
}

function average(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * p) - 1);
  return sorted[idx];
}

// ─────────────────────────────────────────────
// 行业特征建模：从 Prompt 提取 IndustrySeedTerms
// ─────────────────────────────────────────────

/**
 * 从用户 Prompt 中提取行业特征词（LLM 结构化提取，不自由发挥）
 * 输出：行业词/人群词/场景词/痛点词四类
 */
export async function extractIndustryProfile(
  prompt: string,
  seedTopic: string,
): Promise<IndustryProfile> {
  // 先用正则快速提取
  const quickKeywords = extractKeywordsQuick(prompt, seedTopic);

  // 如果快速提取结果足够，不调用 LLM
  if (quickKeywords.keywords.length >= 2) {
    return buildIndustryProfile(seedTopic, quickKeywords);
  }

  // LLM 补充提取
  try {
    const llmResult = await extractIndustryTermsWithLLM(prompt, seedTopic);
    return buildIndustryProfile(seedTopic, {
      keywords: [...new Set([...quickKeywords.keywords, ...llmResult.keywords])].slice(0, 8),
      audienceTerms: [...new Set([...quickKeywords.audienceTerms, ...llmResult.audienceTerms])].slice(0, 5),
      scenarioTerms: [...new Set([...quickKeywords.scenarioTerms, ...llmResult.scenarioTerms])].slice(0, 5),
      painPointTerms: [...new Set([...quickKeywords.painPointTerms, ...llmResult.painPointTerms])].slice(0, 5),
    });
  } catch {
    return buildIndustryProfile(seedTopic, quickKeywords);
  }
}

function extractKeywordsQuick(prompt: string, seedTopic: string): IndustrySeedTerms {
  const keywords: string[] = [];
  const audienceTerms: string[] = [];
  const scenarioTerms: string[] = [];
  const painPointTerms: string[] = [];

  // 从 seedTopic 提取主关键词
  const topicTokens = seedTopic
    .split(/[，,、\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  keywords.push(...topicTokens.slice(0, 5));

  // 人群词正则
  const audiencePatterns = [
    /宝妈|妈妈|母婴|孕妇/g,
    /上班族|白领|职场/g,
    /学生|大学生|高中生/g,
    /老年人|中老年|银发/g,
    /年轻人|Z世代|00后|90后/g,
    /男性|女性|男生|女生/g,
  ];
  for (const pattern of audiencePatterns) {
    const matches = prompt.match(pattern);
    if (matches) audienceTerms.push(...matches.slice(0, 2));
  }

  // 场景词正则
  const scenarioPatterns = [
    /居家|在家|家庭/g,
    /户外|公园|运动/g,
    /通勤|上班|下班/g,
    /睡前|早晨|晚上/g,
    /旅行|出行|旅游/g,
  ];
  for (const pattern of scenarioPatterns) {
    const matches = prompt.match(pattern);
    if (matches) scenarioTerms.push(...matches.slice(0, 2));
  }

  // 痛点词正则
  const painPatterns = [
    /减肥|瘦身|减脂|增肌/g,
    /失眠|焦虑|压力|抑郁/g,
    /脱发|护肤|美白|祛痘/g,
    /省钱|省时|高效|懒人/g,
    /学习|考试|提升|成长/g,
  ];
  for (const pattern of painPatterns) {
    const matches = prompt.match(pattern);
    if (matches) painPointTerms.push(...matches.slice(0, 2));
  }

  return {
    keywords: [...new Set(keywords)],
    audienceTerms: [...new Set(audienceTerms)],
    scenarioTerms: [...new Set(scenarioTerms)],
    painPointTerms: [...new Set(painPointTerms)],
  };
}

async function extractIndustryTermsWithLLM(
  prompt: string,
  seedTopic: string,
): Promise<IndustrySeedTerms> {
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `你是一个短视频赛道分析专家。从用户输入中提取行业特征词，严格按 JSON 格式输出，不要添加任何解释。

输出格式：
{
  "keywords": ["核心行业词1", "核心行业词2"],
  "audienceTerms": ["目标人群词1", "目标人群词2"],
  "scenarioTerms": ["使用场景词1", "使用场景词2"],
  "painPointTerms": ["痛点词1", "痛点词2"]
}

规则：
- keywords：2-6个，赛道核心关键词
- audienceTerms：0-4个，目标受众描述词
- scenarioTerms：0-4个，内容使用场景词
- painPointTerms：0-4个，用户痛点词
- 只提取用户明确提到或强烈暗示的词，不要推断或补全
- 如果某类没有，返回空数组`,
    },
    {
      role: "user",
      content: `赛道主题：${seedTopic}\n用户输入：${prompt}`,
    },
  ];

  const response = await callLLM({
    modelId: "doubao",
    messages,
    maxTokens: 300,
    temperature: 0.1,
  });

  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM 未返回有效 JSON");

  const parsed = JSON.parse(jsonMatch[0]) as Partial<IndustrySeedTerms>;
  return {
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
    audienceTerms: Array.isArray(parsed.audienceTerms) ? parsed.audienceTerms.slice(0, 5) : [],
    scenarioTerms: Array.isArray(parsed.scenarioTerms) ? parsed.scenarioTerms.slice(0, 5) : [],
    painPointTerms: Array.isArray(parsed.painPointTerms) ? parsed.painPointTerms.slice(0, 5) : [],
  };
}

function buildIndustryProfile(seedTopic: string, seedTerms: IndustrySeedTerms): IndustryProfile {
  const industryId = seedTopic
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .slice(0, 32);
  return {
    industryId,
    industryName: seedTopic,
    seedTerms,
    candidatePlatforms: ["douyin", "xiaohongshu"],
  };
}

// ─────────────────────────────────────────────
// 内容特征提取：TikHub 原始数据 → ContentFeatureRow
// ─────────────────────────────────────────────

export function mapRawToContentFeature(
  platform: SupportedTrendPlatform,
  raw: Record<string, unknown>,
): ContentFeatureRow | null {
  const contentId = firstString(raw.aweme_id, raw.note_id, raw.id);
  if (!contentId) return null;

  const titleText = firstString(raw.desc, raw.title, raw.content);
  const authorId = firstString(raw.author_id, raw.uid, raw.sec_uid, raw.user_id);
  const tags = ensureList(raw.hashtag ?? raw.tags ?? raw.tag_list);
  const topicCluster = buildTopicCluster(tags, titleText);

  return {
    platform,
    contentId,
    authorId,
    titleText,
    bodyText: firstString(raw.desc, raw.body_text),
    publishedAt: formatPublishedAt(raw.create_time ?? raw.publish_time ?? raw.published_at),
    likeCount: safeNumber(raw.digg_count ?? raw.like_count),
    commentCount: safeNumber(raw.comment_count),
    shareCount: safeNumber(raw.share_count),
    viewCount: safeNumber(raw.play_count ?? raw.view_count),
    saveCount: safeNumber(raw.collect_count ?? raw.save_count),
    tags,
    topicCluster,
  };
}

function buildTopicCluster(tags: string[], titleText: string): string {
  if (tags.length >= 2) return tags.slice(0, 2).join(" / ");
  if (tags.length === 1) return tags[0];
  if (titleText) return titleText.slice(0, 18);
  return "未命名主题";
}

function formatPublishedAt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return new Date().toISOString();
}

// ─────────────────────────────────────────────
// 账号特征提取：TikHub 原始数据 → AccountFeatureRow
// ─────────────────────────────────────────────

export function mapRawToAccountFeature(
  platform: SupportedTrendPlatform,
  raw: Record<string, unknown>,
): AccountFeatureRow | null {
  const accountId = firstString(raw.sec_uid, raw.uid, raw.user_id, raw.author_id, raw.id);
  if (!accountId) return null;

  const followerCount = safeNumber(
    raw.follower_count ?? raw.fans_count ?? raw.fan_count ?? raw.followers,
  );
  const tierLabel = classifyAccountTier(platform, followerCount);

  return {
    platform,
    accountId,
    handle: firstString(raw.unique_id, raw.user_name, raw.handle, raw.short_id, accountId),
    displayName: firstString(raw.nickname, raw.author_name, raw.name, raw.screen_name),
    followerCount,
    avgEngagementRate: computeEngagementRate(raw),
    tierLabel,
  };
}

function classifyAccountTier(
  platform: SupportedTrendPlatform,
  followerCount: number | null,
): AccountFeatureRow["tierLabel"] {
  if (followerCount === null) return "watch_account";
  const thresholds = PLATFORM_TIER_THRESHOLDS[platform];
  if (followerCount >= thresholds.headKolMinFollowers) return "head_kol";
  if (followerCount >= thresholds.kolMinFollowers) return "standard_kol";
  if (followerCount >= thresholds.kocMinFollowers) return "strong_koc";
  return "standard_koc";
}

function computeEngagementRate(raw: Record<string, unknown>): number | null {
  const viewCount = safeNumber(raw.play_count ?? raw.view_count ?? raw.avg_play_count);
  if (!viewCount || viewCount <= 0) return null;
  const likes = safeNumber(raw.digg_count ?? raw.like_count ?? raw.avg_like_count) ?? 0;
  const comments = safeNumber(raw.comment_count ?? raw.avg_comment_count) ?? 0;
  const shares = safeNumber(raw.share_count ?? raw.avg_share_count) ?? 0;
  return (likes + comments + shares) / viewCount;
}

// ─────────────────────────────────────────────
// 话题特征提取：热榜/搜索数据 → TopicFeatureRow
// ─────────────────────────────────────────────

export function extractTopicFeaturesFromCapabilities(
  platform: SupportedTrendPlatform,
  capabilityResults: Array<{ capability: string; payload: unknown }>,
  seedTopic: string,
): TopicFeatureRow[] {
  const topics: TopicFeatureRow[] = [];

  // 从 hot_seed 能力提取热度信号
  const hotSeedPayloads = capabilityResults
    .filter((r) => r.capability === "hot_seed")
    .map((r) => r.payload);

  let hotRankFreq = 0;
  let searchHeat = 0;
  let growth7d: number | null = null;

  for (const payload of hotSeedPayloads) {
    if (!payload || typeof payload !== "object") continue;
    const records = extractRecordsFromPayload(payload);
    for (const record of records) {
      // 搜索热度
      const heat = safeNumber(record.search_heat ?? record.search_result_count ?? record.hot_value);
      if (heat !== null) searchHeat = Math.max(searchHeat, heat);

      // 热榜频次（出现在热榜中的次数）
      const rank = safeNumber(record.hot_rank ?? record.rank ?? record.position);
      if (rank !== null && rank > 0) hotRankFreq += 1;

      // 7天增长率
      const growth = safeNumber(record.growth_7d ?? record.growth ?? record.trend_growth);
      if (growth !== null) growth7d = growth7d === null ? growth : Math.max(growth7d, growth);
    }
  }

  // 从 search 能力提取搜索数据
  const searchPayloads = capabilityResults
    .filter((r) => r.capability === "search" || r.capability === "keyword_search")
    .map((r) => r.payload);

  for (const payload of searchPayloads) {
    if (!payload || typeof payload !== "object") continue;
    const records = extractRecordsFromPayload(payload);
    const heatValues = records
      .map((r) => safeNumber(r.search_heat ?? r.hot_value ?? r.result_count))
      .filter((v): v is number => v !== null);
    if (heatValues.length > 0) {
      searchHeat = Math.max(searchHeat, average(heatValues));
    }
  }

  if (searchHeat > 0 || hotRankFreq > 0) {
    topics.push({
      platform,
      topicQuery: seedTopic,
      searchHeat: searchHeat > 0 ? searchHeat : null,
      hotRankFreq: hotRankFreq > 0 ? hotRankFreq : null,
      growth7d,
      lowFollowerAnomalyRatio: null, // 由后续计算填充
    });
  }

  return topics;
}

function extractRecordsFromPayload(payload: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  function walk(value: unknown, depth = 0) {
    if (depth > 5 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    records.push(record);
    for (const v of Object.values(record)) walk(v, depth + 1);
  }
  walk(payload);
  return records;
}

// ─────────────────────────────────────────────
// 低粉异常检测
// ─────────────────────────────────────────────

export function detectLowFollowerAnomalies(
  contents: ContentFeatureRow[],
  accounts: AccountFeatureRow[],
): LowFollowerAnomalySample[] {
  const followerLookup = new Map<string, number>();
  for (const account of accounts) {
    if (account.followerCount !== null) {
      followerLookup.set(account.accountId, account.followerCount);
    }
  }

  // 计算互动量基准（P75）
  const interactions = contents.map((c) =>
    (c.likeCount ?? 0) + (c.commentCount ?? 0) + (c.shareCount ?? 0) + (c.saveCount ?? 0),
  );
  const benchmark = percentile(interactions.filter((v) => v > 0), 0.75);

  // 计算粉丝下限（P30）
  const followerCounts = [...followerLookup.values()].filter((v) => v > 0);
  const followerFloor = percentile(followerCounts, 0.30);

  const anomalies: LowFollowerAnomalySample[] = [];
  for (const content of contents) {
    const followers = followerLookup.get(content.authorId);
    if (followers === undefined || followers > followerFloor) continue;

    const interaction = (content.likeCount ?? 0) + (content.commentCount ?? 0) +
      (content.shareCount ?? 0) + (content.saveCount ?? 0);

    if (interaction >= benchmark && benchmark > 0) {
      anomalies.push({
        contentId: content.contentId,
        authorId: content.authorId,
        followerCount: followers,
        totalInteraction: interaction,
        interactionBenchmark: benchmark,
        platform: content.platform,
      });
    }
  }

  return anomalies;
}

// ─────────────────────────────────────────────
// 证据指标计算
// ─────────────────────────────────────────────

export function computeEvidenceMetrics(
  contents: ContentFeatureRow[],
  accounts: AccountFeatureRow[],
  topics: TopicFeatureRow[],
  anomalies: LowFollowerAnomalySample[],
  hotSeedCount: number,
  commentCount: number,
): EvidenceMetrics {
  const creatorIds = new Set(contents.map((c) => c.authorId).filter(Boolean));
  const creatorCount = creatorIds.size;

  // 新创作者比例（KOC/watch_account）
  const newCreatorIds = new Set(
    accounts
      .filter((a) => creatorIds.has(a.accountId) &&
        (a.tierLabel === "strong_koc" || a.tierLabel === "standard_koc" || a.tierLabel === "watch_account"))
      .map((a) => a.accountId),
  );
  const newCreatorRatio = creatorCount > 0 ? newCreatorIds.size / creatorCount : 0;

  // 低粉异常比例
  const lowFollowerAnomalyRatio = contents.length > 0
    ? anomalies.length / contents.length
    : average(topics.map((t) => t.lowFollowerAnomalyRatio));

  // 头部集中度（头部 KOL 粉丝占比）
  const totalFollowers = accounts.reduce((sum, a) => sum + (a.followerCount ?? 0), 0);
  const kolFollowers = accounts
    .filter((a) => a.tierLabel === "head_kol" || a.tierLabel === "standard_kol")
    .reduce((sum, a) => sum + (a.followerCount ?? 0), 0);
  const headConcentration = totalFollowers > 0 ? kolFollowers / totalFollowers : 0;

  // 内容密度（每个创作者的平均内容数）
  const contentDensity = creatorCount > 0 ? contents.length / creatorCount : 0;

  // 话题波动性（不同话题簇数量 / 总内容数）
  const topicClusters = new Set(contents.map((c) => c.topicCluster));
  const topicVolatility = contents.length > 0 ? topicClusters.size / contents.length : 0;

  // 搜索热度和热榜频次（取平均）
  const searchHeat = scale0100(average(topics.map((t) => t.searchHeat)), 1000);
  const hotRankFreq = scale0100(average(topics.map((t) => t.hotRankFreq)), 20);
  const growth7d = scale0100(average(topics.map((t) => t.growth7d)), 1);

  const kolCount = accounts.filter(
    (a) => a.tierLabel === "head_kol" || a.tierLabel === "standard_kol",
  ).length;
  const kocCount = accounts.filter(
    (a) => a.tierLabel === "strong_koc" || a.tierLabel === "standard_koc",
  ).length;

  return {
    searchHeat,
    hotRankFreq,
    growth7d,
    newCreatorRatio,
    lowFollowerAnomalyRatio,
    headConcentration,
    contentDensity,
    topicVolatility,
    similarContentCount: contents.length,
    creatorCount,
    kolCount,
    kocCount,
    hotSeedCount,
    commentCount,
  };
}

// ─────────────────────────────────────────────
// 数据质量评估
// ─────────────────────────────────────────────

export function assessDataQuality(
  contents: ContentFeatureRow[],
  accounts: AccountFeatureRow[],
  topics: TopicFeatureRow[],
  degradeFlags: string[],
): DataQualityReport {
  const hasHotSeed = topics.some((t) => t.hotRankFreq !== null && t.hotRankFreq > 0);
  const hasSearchData = topics.some((t) => t.searchHeat !== null && t.searchHeat > 0);
  const hasCommentData = contents.some((c) => c.commentCount !== null && c.commentCount > 0);
  const hasFollowerData = accounts.some((a) => a.followerCount !== null);

  let sparsityScore = 0;
  if (!hasHotSeed) sparsityScore += 0.25;
  if (!hasSearchData) sparsityScore += 0.20;
  if (!hasFollowerData) sparsityScore += 0.25;
  if (!hasCommentData) sparsityScore += 0.15;
  if (contents.length < 3) sparsityScore += 0.15;

  return {
    hasHotSeed,
    hasSearchData,
    hasCommentData,
    hasFollowerData,
    sparsityScore: Math.min(1, sparsityScore),
    degradeFlags,
  };
}

// ─────────────────────────────────────────────
// 主入口：从 PlatformRunSummary 生成赛道情报
// ─────────────────────────────────────────────

export interface PlatformRunSummaryForTrend {
  platform: SupportedTrendPlatform;
  degradeFlags: string[];
  snapshot: {
    capabilityResults?: Array<{ capability: string; payload: unknown }>;
  };
}

/**
 * 从平台运行结果中提取赛道情报
 * 这是模块三的主入口，供 live-predictions.ts 调用
 */
export async function buildTrendIntelligence(
  runs: PlatformRunSummaryForTrend[],
  prompt: string,
  seedTopic: string,
): Promise<TrendIntelligenceResult> {
  // Step 1: 提取行业特征词（LLM 结构化提取）
  const industryProfile = await extractIndustryProfile(prompt, seedTopic);

  const allContents: ContentFeatureRow[] = [];
  const allAccounts: AccountFeatureRow[] = [];
  const allTopics: TopicFeatureRow[] = [];
  const allDegradeFlags: string[] = [];
  let hotSeedCount = 0;
  let commentCount = 0;

  // Step 2: 遍历各平台数据，提取特征
  for (const run of runs) {
    const capabilityResults = Array.isArray(run.snapshot.capabilityResults)
      ? run.snapshot.capabilityResults
      : [];

    for (const flag of run.degradeFlags) {
      if (!allDegradeFlags.includes(flag)) allDegradeFlags.push(flag);
    }

    // 提取内容和账号特征
    const seenContentIds = new Set<string>();
    const seenAccountIds = new Set<string>();

    for (const item of capabilityResults) {
      if (!item || typeof item !== "object") continue;
      const { capability, payload } = item as { capability: string; payload: unknown };

      if (capability === "hot_seed") {
        hotSeedCount += countItemsInPayload(payload);
      }
      if (capability === "comments") {
        commentCount += countItemsInPayload(payload);
      }

      // 递归遍历 payload 提取内容和账号
      walkPayloadForFeatures(run.platform, payload, (record) => {
        // 尝试提取内容
        const content = mapRawToContentFeature(run.platform, record);
        if (content && !seenContentIds.has(content.contentId)) {
          seenContentIds.add(content.contentId);
          allContents.push(content);
        }

        // 尝试提取账号（只提取有粉丝数据的记录）
        const hasFollowerSignal = record.follower_count !== undefined ||
          record.fans_count !== undefined || record.fan_count !== undefined;
        if (hasFollowerSignal) {
          const account = mapRawToAccountFeature(run.platform, record);
          if (account && !seenAccountIds.has(account.accountId)) {
            seenAccountIds.add(account.accountId);
            allAccounts.push(account);
          }
        }
      });

      // 提取话题特征
      const topicFeatures = extractTopicFeaturesFromCapabilities(
        run.platform,
        capabilityResults,
        seedTopic,
      );
      allTopics.push(...topicFeatures);
    }
  }

  // Step 3: 低粉异常检测
  const lowFollowerAnomalies = detectLowFollowerAnomalies(allContents, allAccounts);

  // Step 4: 计算证据指标
  const evidenceMetrics = computeEvidenceMetrics(
    allContents,
    allAccounts,
    allTopics,
    lowFollowerAnomalies,
    hotSeedCount,
    commentCount,
  );

  // Step 5: 数据质量评估
  const dataQuality = assessDataQuality(allContents, allAccounts, allTopics, allDegradeFlags);

  return {
    industryProfile,
    contentFeatures: allContents.slice(0, 20),
    accountFeatures: allAccounts.slice(0, 15),
    topicFeatures: allTopics.slice(0, 10),
    lowFollowerAnomalies,
    evidenceMetrics,
    dataQuality,
  };
}

function walkPayloadForFeatures(
  platform: SupportedTrendPlatform,
  payload: unknown,
  visitor: (record: Record<string, unknown>) => void,
  depth = 0,
): void {
  if (depth > 6 || !payload || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    for (const item of payload) walkPayloadForFeatures(platform, item, visitor, depth + 1);
    return;
  }
  const record = payload as Record<string, unknown>;
  visitor(record);
  for (const v of Object.values(record)) walkPayloadForFeatures(platform, v, visitor, depth + 1);
}

function countItemsInPayload(payload: unknown): number {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["list", "data", "items", "result", "results"]) {
      if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
    }
    return 1;
  }
  return 0;
}

// ─────────────────────────────────────────────
// 热点与搜索趋势融合：生成 whyNowItems
// ─────────────────────────────────────────────

export interface WhyNowItem {
  signal: string;
  description: string;
  userImpact: string;
  dataBasis: string;
  strength: "strong" | "medium" | "weak";
}

/**
 * 基于赛道情报数据，生成 whyNowItems（现在为什么是好时机）
 * 数据驱动：每条 whyNow 必须有 dataBasis 说明数据来源
 */
export function buildWhyNowItemsFromIntelligence(
  intelligence: TrendIntelligenceResult,
  platforms: string[],
): WhyNowItem[] {
  const items: WhyNowItem[] = [];
  const { evidenceMetrics, dataQuality, lowFollowerAnomalies, contentFeatures } = intelligence;

  // 信号1：热榜出现（强信号）
  if (dataQuality.hasHotSeed && evidenceMetrics.hotSeedCount >= 3) {
    items.push({
      signal: "热榜信号",
      description: `${platforms.join("/")} 热榜出现 ${evidenceMetrics.hotSeedCount} 条相关内容`,
      userImpact: "热榜出现说明平台正在主动推流，现在入场能获得更多自然流量。",
      dataBasis: `来自 ${platforms.join("/")} hot_seed 接口，共 ${evidenceMetrics.hotSeedCount} 条热榜数据`,
      strength: evidenceMetrics.hotSeedCount >= 5 ? "strong" : "medium",
    });
  }

  // 信号2：低粉爆款异常（强信号）
  if (lowFollowerAnomalies.length >= 2) {
    const avgFollowers = Math.round(
      lowFollowerAnomalies.reduce((sum, a) => sum + a.followerCount, 0) / lowFollowerAnomalies.length,
    );
    items.push({
      signal: "低粉爆款信号",
      description: `发现 ${lowFollowerAnomalies.length} 条低粉高互动异常内容（平均粉丝 ${avgFollowers.toLocaleString("zh-CN")}）`,
      userImpact: "低粉账号能跑出高互动，说明赛道红利期未结束，普通创作者仍有机会。",
      dataBasis: `来自真实内容样本分析，${lowFollowerAnomalies.length} 条内容满足低粉爆款阈值（粉丝 P30 以下，互动量 P75 以上）`,
      strength: "strong",
    });
  }

  // 信号3：新创作者涌入（中等信号）
  if (evidenceMetrics.newCreatorRatio >= TREND_THRESHOLDS.newCreatorRatioMin) {
    const pct = Math.round(evidenceMetrics.newCreatorRatio * 100);
    items.push({
      signal: "新创作者涌入",
      description: `${pct}% 的内容来自 KOC/新账号（粉丝 < 10万）`,
      userImpact: "新创作者占比高说明赛道门槛低、机会均等，适合中小账号切入。",
      dataBasis: `基于 ${evidenceMetrics.creatorCount} 个创作者的账号分层分析`,
      strength: pct >= 40 ? "strong" : "medium",
    });
  }

  // 信号4：内容样本充足（中等信号）
  if (contentFeatures.length >= 4) {
    items.push({
      signal: "真实内容样本",
      description: `采集到 ${contentFeatures.length} 条真实相关内容`,
      userImpact: "有足够的真实样本可以拆解爆款结构，降低试错成本。",
      dataBasis: `来自 ${platforms.join("/")} 真实接口，共 ${contentFeatures.length} 条内容样本`,
      strength: contentFeatures.length >= 6 ? "strong" : "medium",
    });
  }

  // 信号5：评论意图（弱信号，有则加分）
  if (evidenceMetrics.commentCount >= 5) {
    items.push({
      signal: "评论意图信号",
      description: `评论区出现 ${evidenceMetrics.commentCount} 条相关意图讨论`,
      userImpact: "评论区有真实需求讨论，说明用户痛点真实存在。",
      dataBasis: `来自评论接口，${evidenceMetrics.commentCount} 条评论数据`,
      strength: "weak",
    });
  }

  // 如果没有任何信号，返回一条数据稀疏提示
  if (items.length === 0) {
    items.push({
      signal: "数据稀疏",
      description: "当前采集到的信号较少，建议补充更多证据再决策",
      userImpact: "数据不足时，不建议直接做大投入，先小规模验证。",
      dataBasis: `当前共 ${contentFeatures.length} 条内容，${evidenceMetrics.hotSeedCount} 条热榜数据`,
      strength: "weak",
    });
  }

  return items.slice(0, 4);
}
