/**
 * client/src/app/lib/creator-api.ts
 * 创作中心 API 客户端 — 调用后端真实数据接口
 */

import { parseApiResponse, apiFetch } from "./api-utils";

/* ------------------------------------------------------------------ */
/*  类型定义（与后端 creator-data-sync.ts 对齐）                         */
/* ------------------------------------------------------------------ */

export interface AccountOverview {
  platformId: string;
  platformName: string;
  handle: string;
  avatarUrl?: string;
  followers: number;
  following?: number;
  totalWorks: number;
  avgEngagementRate: number;
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalCollects?: number;
  totalCoins?: number;
  totalFavorites?: number;
  totalReposts?: number;
  totalReads?: number;
  totalVoteups?: number;
  followersChange?: number;
  viewsChange?: number;
  likesChange?: number;
  commentsChange?: number;
  sharesChange?: number;
  collectsChange?: number;
  engagementRateChange?: number;
  syncedAt: string;
  dataSource: "live" | "cached";
  /** 前端扩展字段 */
  platformColor?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface WorkItem {
  id: string;
  title: string;
  coverUrl: string;
  contentUrl?: string;
  publishedAt: string;
  type: "video" | "note" | "article";
  isHot: boolean;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  coins?: number;
  favorites?: number;
  reposts?: number;
  reads?: number;
  voteups?: number;
  completionRate?: number;
  avgWatchDuration?: number;
  duration?: string;
  tags?: string[];
  trafficSources?: { source: string; percentage: number }[];
  audienceGender?: { male: number; female: number };
  audienceAge?: { range: string; percentage: number }[];
}

export interface FanProfile {
  genderRatio: { male: number; female: number };
  ageDistribution: { range: string; percentage: number }[];
  topCities: { city: string; percentage: number }[];
  topProvinces?: { province: string; percentage: number }[];
  activeHours: { hour: string; percentage: number }[];
  interestTags: string[];
  deviceTypes?: { device: string; percentage: number }[];
  dataSource: "live" | "cached" | "estimated";
}

export interface TrendDataPoint {
  date: string;
  followers?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  engagementRate?: number;
  [key: string]: string | number | undefined;
}

export interface SyncResult {
  success: boolean;
  overview?: AccountOverview;
  works?: WorkItem[];
  fanProfile?: FanProfile;
  trendData?: TrendDataPoint[];
  error?: string;
  syncedAt: string;
}

export interface CommentItem {
  id: string;
  author: string;
  authorAvatar?: string;
  content: string;
  likes: number;
  replyCount: number;
  sentiment: "positive" | "neutral" | "negative";
  isAuthorReply: boolean;
  createdAt: string;
}

export interface CommentAnalysis {
  totalComments: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positiveRatio: number;
  negativeRatio: number;
  highFreqKeywords: string[];
  demandSignals: string[];
  sentimentSummary: "positive" | "mixed" | "negative" | "unknown";
  aiSummary: string | null;
}

export interface DiagnosisReport {
  platformId: string;
  generatedAt: string;
  summary: string;
  engagementAnalysis?: string;
  contentStrategy?: string;
  growthSuggestions?: string[];
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  API 调用                                                           */
/* ------------------------------------------------------------------ */

/**
 * 同步账号数据（触发后端从 TikHub 拉取真实数据）
 * 后端会自动从 connector store 读取已绑定的账号信息
 */
export async function syncCreatorData(platformId: string, days = 30, forceRefresh = false): Promise<SyncResult> {
  const response = await apiFetch("/api/creator/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformId, days, forceRefresh }),
  });
  return parseApiResponse<SyncResult>(response);
}

/** 获取账号概览（从缓存读取） */
export async function getCreatorOverview(platformId: string): Promise<AccountOverview | null> {
  const response = await apiFetch(`/api/creator/overview?platformId=${encodeURIComponent(platformId)}`);
  if (response.status === 404) return null;
  const result = await parseApiResponse<{ overview: AccountOverview }>(response);
  return result.overview;
}

/** 获取作品列表 */
export async function getCreatorWorks(
  platformId: string,
  limit = 30,
  sortBy = "published_at",
): Promise<WorkItem[]> {
  const params = new URLSearchParams({ platformId, limit: String(limit), sortBy });
  const response = await apiFetch(`/api/creator/works?${params}`);
  if (response.status === 404) return [];
  const result = await parseApiResponse<{ works: WorkItem[]; total: number }>(response);
  return result.works;
}

/** 获取粉丝画像 */
export async function getCreatorFanProfile(platformId: string): Promise<FanProfile | null> {
  const response = await apiFetch(`/api/creator/fan-profile?platformId=${encodeURIComponent(platformId)}`);
  if (response.status === 404) return null;
  const result = await parseApiResponse<{ fanProfile: FanProfile }>(response);
  return result.fanProfile;
}

/** 获取趋势数据 */
export async function getCreatorTrends(platformId: string, days = 30): Promise<TrendDataPoint[]> {
  const params = new URLSearchParams({ platformId, days: String(days) });
  const response = await apiFetch(`/api/creator/trends?${params}`);
  if (response.status === 404) return [];
  const result = await parseApiResponse<{ trendData: TrendDataPoint[] }>(response);
  return result.trendData;
}

/** 运行账号诊断 */
export async function runCreatorDiagnosis(
  platformId: string,
  topicContext?: string,
  userGoal?: string,
): Promise<DiagnosisReport> {
  const response = await apiFetch("/api/creator/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformId, topicContext, userGoal }),
  });
  const result = await parseApiResponse<{ report: DiagnosisReport }>(response);
  return result.report;
}

/** 获取最新诊断报告 */
export async function getCreatorDiagnosis(platformId: string): Promise<DiagnosisReport | null> {
  const response = await apiFetch(`/api/creator/diagnosis?platformId=${encodeURIComponent(platformId)}`);
  if (response.status === 404) return null;
  const result = await parseApiResponse<{ report: DiagnosisReport }>(response);
  return result.report;
}

/** AI 评论摘要 */
export async function getCommentSummary(
  comments: Array<{ content: string; sentiment?: string; likes?: number }>,
  workTitle?: string,
): Promise<string> {
  const response = await apiFetch("/api/creator/comment-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comments, workTitle }),
  });
  const result = await parseApiResponse<{ summary: string }>(response);
  return result.summary;
}

export interface FetchCommentsResponse {
  comments: CommentItem[];
  total: number;
  fromCache: boolean;
  hasMore: boolean;
  nextCursor: number | null;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 拉取并存储真实评论（支持分页） */
export async function fetchWorkComments(
  workId: string,
  platformId = "douyin",
  options?: { cursor?: number; page?: number; pageSize?: number },
): Promise<FetchCommentsResponse> {
  const response = await apiFetch("/api/creator/fetch-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workId,
      platformId,
      cursor: options?.cursor ?? 0,
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 20,
    }),
  });
  return parseApiResponse<FetchCommentsResponse>(response);
}

/** 获取已缓存的评论 */
export async function getWorkComments(
  workId: string,
  limit = 50,
  sortBy: "like_count" | "created_at" = "like_count",
): Promise<CommentItem[]> {
  const params = new URLSearchParams({ workId, limit: String(limit), sortBy });
  const response = await apiFetch(`/api/creator/work-comments?${params}`);
  const result = await parseApiResponse<{ comments: CommentItem[]; total: number }>(response);
  return result.comments;
}

/** AI 深度分析评论 */
export async function analyzeWorkComments(
  workId: string,
  workTitle: string,
  platformId = "douyin",
): Promise<CommentAnalysis> {
  const response = await apiFetch("/api/creator/analyze-comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workId, platformId, workTitle }),
  });
  const result = await parseApiResponse<{ analysis: CommentAnalysis }>(response);
  return result.analysis;
}

/** 获取已缓存的评论分析 */
export async function getCachedCommentAnalysis(
  workId: string,
): Promise<CommentAnalysis | null> {
  const response = await apiFetch(`/api/creator/comment-analysis?workId=${encodeURIComponent(workId)}`);
  if (response.status === 404) return null;
  const result = await parseApiResponse<{ analysis: CommentAnalysis }>(response);
  return result.analysis;
}

/** 一键同步 + 诊断 */
export async function syncAndDiagnose(
  platformId: string,
  options?: { topicContext?: string; userGoal?: string; days?: number },
): Promise<{ syncResult: SyncResult; report: DiagnosisReport }> {
  const response = await apiFetch("/api/creator/sync-and-diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformId, ...options }),
  });
  return parseApiResponse<{ syncResult: SyncResult; report: DiagnosisReport }>(response);
}
