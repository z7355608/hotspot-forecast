/**
 * Topic Strategy V2 Engine — 5-Stage Pipeline
 * ─────────────────────────────────────────────
 * Stage 1: 多平台数据采集（搜索 + 热榜，15s 上限）
 * Stage 2: LLM 生成选题方向（结构化 JSON）
 * Stage 3: 同行对标（top N 账号的最近作品 + 互动率）
 * Stage 4: 跨行业迁移（低粉爆款库查非当前赛道的爆款）
 * Stage 5: 自循环验证（二次搜索 + 评论区需求交叉验证 + 低粉案例检查）
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("TopicStrategy");
import { randomUUID } from "node:crypto";
import { invokeLLM } from "../_core/llm";
import { getTikHub, postTikHub } from "./tikhub";
import { llmExtractFromPayload } from "./llm-extract";
import { runWatchTaskWithFallback } from "./watch-runtime";
import { readConnectorStore, resolveCookieSecret } from "./storage";
import { fetchRealComments } from "./comment-service";
import { queryLowFollowerSamples } from "./low-follower-cleaner";
import {
  createTopicStrategySession,
  getTopicStrategySession,
  updateSessionPipelineStatus,
  createDirection,
  updateDirectionValidation,
  createPeerBenchmark,
  createCrossIndustry,
  getDirectionsBySession,
  getPeerBenchmarksBySession,
  type CreateDirectionInput,
} from "./topic-strategy-db";
import { getHistoricalFeedbackForPrompt, getDirectionFeedbackForPrompt } from "./strategy-evolution";
import type {
  SupportedPlatform,
  StoredWatchTask,
  StoredConnectorRecord,
} from "./types";

/* ── Types ── */

export interface TopicStrategyInput {
  userOpenId: string;
  track: string;
  accountStage: string;
  platforms: SupportedPlatform[];
  userPrompt?: string;
  connectedAccounts?: ConnectedAccountSnapshot[];
  entrySource?: string;
}

export interface ConnectedAccountSnapshot {
  platform: SupportedPlatform;
  handle: string;
  displayName: string;
  followerCount: number;
  recentTopics?: string[];
}

export interface TopicDirection {
  directionName: string;
  directionLogic: string;
  targetStage: string;
  testPlan: string;
  trafficPotential: number;
  productionCost: number;
  competitionLevel: number;
  priorityRank: number;
  executableTopics: ExecutableTopic[];
}

export interface ExecutableTopic {
  title: string;
  angle: string;
  hookType: string;
  estimatedDuration: string;
}

export interface PeerBenchmarkResult {
  platform: SupportedPlatform;
  accountId: string;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  followerCount: number;
  recentWorks: PeerWork[];
  avgInteractionRate: number;
  comparisonNotes?: string;
}

export interface PeerWork {
  title: string;
  likeCount: number;
  viewCount?: number;
  shareCount?: number;
  publishedAt?: string;
  contentUrl?: string;
}

export interface CrossIndustryInsight {
  sourceIndustry: string;
  sourceTitle: string;
  sourcePlatform: string;
  transferableElements: TransferableElement[];
  migrationIdea: string;
  confidence: number;
}

export interface TransferableElement {
  element: string;
  reason: string;
  adaptationHint: string;
}

export interface DirectionValidation {
  directionId: string;
  directionName: string;
  validationScore: number;
  breakdown: ValidationBreakdown;
  detail: ValidationDetail;
  platformScores: Record<string, PlatformValidationScore>;
  evolvedChildren?: TopicDirection[];
}

export interface ValidationBreakdown {
  searchHitScore: number;
  lowFollowerScore: number;
  commentDemandScore: number;
  peerSuccessScore: number;
}

export interface ValidationDetail {
  searchHits: number;
  lowFollowerCases: number;
  commentSignals: string[];
  peerResults: string[];
  /** P0-1: 语义匹配的具体命中内容标题 */
  matchedContentTitles?: string[];
  /** P0-2: 真实评论中提取的需求信号 */
  realCommentDemands?: string[];
  /** P0-3: 同行匹配的具体账号 */
  matchedPeerNames?: string[];
}

export interface PlatformValidationScore {
  score: number;
  searchHits: number;
  details: string;
}

export interface TopicStrategyV2Result {
  sessionId: string;
  track: string;
  accountStage: string;
  platforms: string[];
  strategySummary: string;
  directions: DirectionWithValidation[];
  peerBenchmarks: PeerBenchmarkResult[];
  crossIndustryInsights: CrossIndustryInsight[];
  pipelineProgress: PipelineProgress;
  searchKeywords: SearchKeyword[];
  rawDataSummary: RawDataSummary;
}

export interface DirectionWithValidation extends TopicDirection {
  id: string;
  validationScore: number;
  validationBreakdown: ValidationBreakdown;
  validationStatus: string;
  platformScores: Record<string, PlatformValidationScore>;
  /** P1-5: 验证证据链（传递到前端） */
  validationEvidence?: {
    matchedContentTitles?: string[];
    realCommentDemands?: string[];
    matchedPeerNames?: string[];
  };
  evolvedChildren?: DirectionWithValidation[];
}

export interface PipelineProgress {
  stage1_ms: number;
  stage2_ms: number;
  stage3_ms: number;
  stage4_ms: number;
  stage5_ms: number;
  total_ms: number;
}

export interface SearchKeyword {
  keyword: string;
  source: string;
  platform: SupportedPlatform;
}

export interface RawDataSummary {
  totalContents: number;
  totalAccounts: number;
  totalHotSeeds: number;
  byPlatform: Record<string, { contents: number; accounts: number; hotSeeds: number }>;
}

/* ── Constants ── */

const TRACK_KEYWORDS: Record<string, string[]> = {
  "美妆护肤": ["美妆教程", "护肤", "化妆", "底妆", "眼妆"],
  "母婴育儿": ["育儿", "母婴", "宝宝辅食", "亲子", "早教"],
  "职场干货": ["职场", "面试", "简历", "副业", "升职加薪"],
  "美食探店": ["美食", "探店", "做饭", "家常菜", "烘焙"],
  "穿搭时尚": ["穿搭", "ootd", "时尚", "搭配", "显瘦"],
  "健身运动": ["健身", "减脂", "瑜伽", "跑步", "增肌"],
  "旅行攻略": ["旅行", "旅游攻略", "自驾游", "景点", "民宿"],
  "数码科技": ["数码", "手机测评", "科技", "电脑", "AI"],
  "家居装修": ["家居", "装修", "收纳", "软装", "好物推荐"],
  "宠物": ["宠物", "猫咪", "狗狗", "养猫", "萌宠"],
  "知识科普": ["科普", "知识", "冷知识", "历史", "心理学"],
  "情感心理": ["情感", "恋爱", "婚姻", "心理", "自我成长"],
  "搞笑娱乐": ["搞笑", "段子", "整蛊", "沙雕", "日常"],
};

const STAGE_LABELS: Record<string, string> = {
  new: "新号（0-1万粉）",
  growing: "成长期（1-10万粉）",
  mature: "成熟期（10万+粉）",
};

const PLATFORM_NAMES: Record<SupportedPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  kuaishou: "快手",
};

/* ── Helper functions ── */

function nowIso() {
  return new Date().toISOString();
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function elapsed(start: number) {
  return Date.now() - start;
}

/* ── Stage 1: 多平台数据采集 ── */

async function stage1Collect(
  input: TopicStrategyInput,
  sessionId: string,
): Promise<{
  searchKeywords: SearchKeyword[];
  rawContents: RawContentEntry[];
  rawAccounts: RawAccountEntry[];
  rawHotSeeds: number;
  byPlatform: Record<string, { contents: number; accounts: number; hotSeeds: number }>;
  durationMs: number;
}> {
  const start = Date.now();

  // 1a. 生成搜索关键词（赛道 + LLM 扩展）
  const searchKeywords = await generateSearchKeywords(input);

  // 1b. 为每个平台 × 每个关键词创建搜索任务
  const allContents: RawContentEntry[] = [];
  const allAccounts: RawAccountEntry[] = [];
  let totalHotSeeds = 0;
  const byPlatform: Record<string, { contents: number; accounts: number; hotSeeds: number }> = {};

  const searchTasks: Array<Promise<void>> = [];

  for (const platform of input.platforms) {
    byPlatform[platform] = { contents: 0, accounts: 0, hotSeeds: 0 };

    // 搜索任务
    for (const kw of searchKeywords.filter((k) => k.platform === platform)) {
      searchTasks.push(
        searchPlatform(platform, kw.keyword).then((result) => {
          allContents.push(...result.contents);
          allAccounts.push(...result.accounts);
          byPlatform[platform].contents += result.contents.length;
          byPlatform[platform].accounts += result.accounts.length;
        }).catch((err) => {
          log.error({ err: err }, `Search failed: ${platform}/${kw.keyword}`);
        }),
      );
    }

    // 热榜任务
    searchTasks.push(
      fetchHotSeed(platform, input.track).then((count) => {
        totalHotSeeds += count;
        byPlatform[platform].hotSeeds += count;
      }).catch((err) => {
        log.error({ err: err }, `HotSeed failed: ${platform}`);
      }),
    );
  }

  // 并行执行，15s 超时
  await Promise.race([
    Promise.allSettled(searchTasks),
    new Promise<void>((resolve) => setTimeout(resolve, 15000)),
  ]);

  return {
    searchKeywords,
    rawContents: dedupeContents(allContents),
    rawAccounts: dedupeAccounts(allAccounts),
    rawHotSeeds: totalHotSeeds,
    byPlatform,
    durationMs: elapsed(start),
  };
}

interface RawContentEntry {
  contentId: string;
  title: string;
  authorName: string;
  platform: SupportedPlatform;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  authorFollowerCount: number | null;
  contentUrl?: string;
  publishedAt?: string;
}

interface RawAccountEntry {
  accountId: string;
  displayName: string;
  handle: string;
  platform: SupportedPlatform;
  followerCount: number | null;
  profileUrl?: string;
}

function dedupeContents(items: RawContentEntry[]): RawContentEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.contentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeAccounts(items: RawAccountEntry[]): RawAccountEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.accountId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateSearchKeywords(input: TopicStrategyInput): Promise<SearchKeyword[]> {
  const baseKeywords = TRACK_KEYWORDS[input.track] ?? [input.track];
  const keywords: SearchKeyword[] = [];

  // 每个平台取前 2 个基础关键词（优化API调用量）
  for (const platform of input.platforms) {
    for (const kw of baseKeywords.slice(0, 2)) {
      keywords.push({ keyword: kw, source: "track_preset", platform });
    }
  }

  // LLM 扩展关键词（如果有用户补充 prompt）
  if (input.userPrompt) {
    try {
      const resp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一个短视频选题关键词专家。根据用户的赛道和补充描述，生成 3 个精准的搜索关键词。

重要规则：
- 关键词必须是普通用户会搜索的内容词，不是运营术语
- 禁止包含：矩阵号、冷启动、起号、涨粉、运营、引流、算法、投放等运营类词汇
- 关键词应该是观众会搜索的内容话题，例如“家居收纳”“健身干货”“宝妈好物”

返回 JSON 数组格式：["关键词1", "关键词2", "关键词3"]
只返回 JSON，不要其他文字。`,
          },
          {
            role: "user",
            content: `赛道：${input.track}\n补充描述：${input.userPrompt}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "keywords",
            strict: true,
            schema: {
              type: "object",
              properties: {
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "搜索关键词列表",
                },
              },
              required: ["keywords"],
              additionalProperties: false,
            },
          },
        },
      });
      const rawContent = resp.choices[0].message.content;
      const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const parsed = JSON.parse(contentStr ?? "{}");
      const extraKws: string[] = parsed.keywords ?? [];
      for (const platform of input.platforms) {
        for (const kw of extraKws.slice(0, 1)) {
          keywords.push({ keyword: kw, source: "llm_expansion", platform });
        }
      }
    } catch (err) {
      log.error({ err: err }, "LLM keyword expansion failed");
    }
  }

  return keywords;
}

async function searchPlatform(
  platform: SupportedPlatform,
  keyword: string,
): Promise<{ contents: RawContentEntry[]; accounts: RawAccountEntry[] }> {
  const contents: RawContentEntry[] = [];
  const accounts: RawAccountEntry[] = [];

  try {
    // Step 1: 调用 TikHub 搜索 API 获取原始数据
    let payload: Record<string, unknown> | null = null;

    if (platform === "douyin") {
      // L1: Douyin Search API（POST，不需要 Cookie）
      let resp = await postTikHub<Record<string, unknown>>(
        "/api/v1/douyin/search/fetch_general_search_v2",
        { keyword, cursor: "0", sort_type: "0", publish_time: "0", filter_duration: "0", content_type: "0", search_id: "", backtrace: "" },
      );
      if (!resp.ok) {
        // L2: 视频搜索降级
        resp = await postTikHub<Record<string, unknown>>(
          "/api/v1/douyin/search/fetch_video_search_v2",
          { keyword, cursor: "0", sort_type: "0", publish_time: "0", filter_duration: "0", search_id: "", backtrace: "" },
        );
      }
      if (resp.ok && resp.payload) {
        payload = resp.payload;
      } else {
        log.warn(`Douyin search failed for keyword "${keyword}": HTTP ${resp.httpStatus}, code ${resp.businessCode}`);
      }
    } else if (platform === "xiaohongshu") {
      // 小红书 App 搜索（GET，不需要 Cookie）
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/xiaohongshu/app/search_notes",
        { keyword, page: 1, sort: "general" },
      );
      if (resp.ok && resp.payload) {
        payload = resp.payload;
      }
      if (!resp.ok) {
        log.warn(`XHS search failed for keyword "${keyword}": HTTP ${resp.httpStatus}, code ${resp.businessCode}`);
      }
    } else if (platform === "kuaishou") {
      // 快手综合搜索（GET，不需要 Cookie）
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/kuaishou/app/search_comprehensive",
        { keyword, pcursor: "" },
      );
      if (resp.ok && resp.payload) {
        payload = resp.payload;
      }
      if (!resp.ok) {
        log.warn(`Kuaishou search failed for keyword "${keyword}": HTTP ${resp.httpStatus}, code ${resp.businessCode}`);
      }
    }

    if (!payload) return { contents, accounts };

    // Step 2: 主方案 — walkObjects 代码抽取（毫秒级，提取全面）
    extractFromPayload(payload, platform, contents, accounts);
    log.info(`walkObjects extraction for ${platform}/${keyword}: ${contents.length} contents, ${accounts.length} accounts`);

    // Step 3: 备选 — 仅当 walkObjects 返回 0 条内容时，尝试 LLM 抽取（应对 API 格式变化）
    if (contents.length === 0) {
      log.warn(`walkObjects returned 0 contents for ${platform}/${keyword}, trying LLM fallback...`);
      try {
        const llmResult = await llmExtractFromPayload(payload, platform);
        if (llmResult.contents.length > 0) {
          for (const c of llmResult.contents) {
            contents.push({
              contentId: c.contentId,
              title: c.title,
              authorName: c.authorName || "未知",
              platform,
              viewCount: c.viewCount,
              likeCount: c.likeCount,
              commentCount: c.commentCount,
              shareCount: c.shareCount,
              collectCount: c.collectCount,
              authorFollowerCount: c.authorFollowerCount,
              contentUrl: buildContentUrl(platform, c.contentId),
              publishedAt: undefined,
            });
          }
          for (const a of llmResult.accounts) {
            accounts.push({
              accountId: a.accountId,
              displayName: a.displayName || a.handle || a.accountId,
              handle: a.handle || a.accountId,
              platform,
              followerCount: a.followerCount,
              profileUrl: buildProfileUrl(platform, a.accountId, a.handle),
            });
          }
          log.info(`LLM fallback succeeded for ${platform}/${keyword}: ${contents.length} contents, ${accounts.length} accounts`);
        } else {
          log.warn(`LLM fallback also returned 0 contents for ${platform}/${keyword}`);
        }
      } catch (llmErr) {
        log.error(`LLM fallback error for ${platform}/${keyword}: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
      }
    }
  } catch (err) {
    log.error({ err: err }, `searchPlatform error: ${platform}/${keyword}`);
  }

  return { contents, accounts };
}

async function fetchHotSeed(platform: SupportedPlatform, track: string): Promise<number> {
  try {
    if (platform === "douyin") {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/douyin/web/fetch_hot_search_list",
        {},
      );
      if (resp.ok && resp.payload) {
        return countHotSeedMatches(resp.payload, track);
      }
    } else if (platform === "xiaohongshu") {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/xiaohongshu/web/get_hot_topics",
        {},
      );
      if (resp.ok && resp.payload) {
        return countHotSeedMatches(resp.payload, track);
      }
    } else if (platform === "kuaishou") {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/kuaishou/web/fetch_hot_search_list",
        {},
      );
      if (resp.ok && resp.payload) {
        return countHotSeedMatches(resp.payload, track);
      }
    }
  } catch (err) {
    log.error({ err: err }, `fetchHotSeed error: ${platform}`);
  }
  return 0;
}

function extractFromPayload(
  payload: Record<string, unknown>,
  platform: SupportedPlatform,
  contents: RawContentEntry[],
  accounts: RawAccountEntry[],
) {
  walkObjects(payload, (record) => {
    // 提取内容
    const title = getString(record, ["desc", "title", "content", "caption", "pureTitle", "display_title"]);
    const contentId = getString(record, ["aweme_id", "note_id", "photo_id", "id"]);
    if (title && contentId && title.length >= 8) {
      const author = getSubObject(record, ["author", "user"]);
      const stats = getSubObject(record, ["statistics", "stats"]);
      // 快手搜索结果作者名在顶层 user_name 字段
      const authorName = (author ? getString(author, ["nickname", "name"]) : null) ?? getString(record, ["author_name", "nickname", "user_name"]) ?? "未知";
      const authorFollowerCount = author ? getNumber(author, ["follower_count", "fans_count", "fan"]) : getNumber(record, ["follower_count"]);

      contents.push({
        contentId,
        title,
        authorName,
        platform,
        // 快手搜索结果的统计字段在顶层：like_count, view_count, comment_count, share_count
        viewCount: (stats ? getNumber(stats, ["play_count", "view_count"]) : null) ?? getNumber(record, ["play_count", "view_count", "view_num"]),
        likeCount: (stats ? getNumber(stats, ["digg_count", "like_count"]) : null) ?? getNumber(record, ["digg_count", "like_count", "liked_count", "nice_count"]),
        commentCount: (stats ? getNumber(stats, ["comment_count"]) : null) ?? getNumber(record, ["comment_count", "comments_count"]),
        shareCount: (stats ? getNumber(stats, ["share_count", "forward_count"]) : null) ?? getNumber(record, ["share_count", "forward_count", "shared_count"]),
        collectCount: (stats ? getNumber(stats, ["collect_count", "favorite_count"]) : null) ?? getNumber(record, ["collect_count", "favorite_count", "collected_count"]),
        authorFollowerCount,
        contentUrl: buildContentUrl(platform, contentId),
        publishedAt: formatTimestamp(record.create_time ?? record.publish_time ?? record.timestamp),
      });
    }

    // 提取账号
    // 快手搜索结果的用户ID在顶层 user_id 字段
    const accountId = getString(record, ["sec_uid", "secUid", "uid", "user_id", "author_id"]);
    const displayName = getString(record, ["nickname", "author_name", "name", "user_name"]);
    const handle = getString(record, ["unique_id", "user_name", "handle", "short_id", "kwaiId"]);
    const followerCount = getNumber(record, ["follower_count", "fans_count", "fan_count"]);
    // BUG-1 修复：放宽条件——允许 followerCount 为 null（搜索结果经常不返回粉丝数）
    // 同时从内容的 authorFollowerCount 补充账号粉丝数
    if (accountId && (displayName || handle)) {
      if (platform === "douyin" && !accountId.startsWith("MS4w")) return;
      // 尝试从已采集的内容中查找该作者的粉丝数
      const authorContent = contents.find(
        (c) => c.authorName === (displayName ?? handle) && c.authorFollowerCount !== null,
      );
      const resolvedFollowerCount = followerCount ?? authorContent?.authorFollowerCount ?? null;
      accounts.push({
        accountId,
        displayName: displayName ?? handle ?? accountId,
        handle: handle ?? accountId,
        platform,
        followerCount: resolvedFollowerCount,
        profileUrl: buildProfileUrl(platform, accountId, handle),
      });
    }
  });
}

function countHotSeedMatches(payload: unknown, track: string): number {
  let count = 0;
  const keywords = TRACK_KEYWORDS[track] ?? [track];
  walkObjects(payload, (record) => {
    const text = getString(record, ["word", "title", "content", "name", "hot_value"]);
    if (text && keywords.some((kw) => text.includes(kw))) {
      count++;
    }
  });
  return count;
}

function buildContentUrl(platform: SupportedPlatform, contentId: string): string | undefined {
  if (platform === "douyin") return `https://www.douyin.com/video/${contentId}`;
  if (platform === "xiaohongshu") return `https://www.xiaohongshu.com/explore/${contentId}`;
  if (platform === "kuaishou") return `https://www.kuaishou.com/short-video/${contentId}`;
  return undefined;
}

function buildProfileUrl(platform: SupportedPlatform, accountId: string, handle?: string | null): string | undefined {
  if (platform === "douyin") return `https://www.douyin.com/user/${accountId}`;
  if (platform === "xiaohongshu" && handle) return `https://www.xiaohongshu.com/user/profile/${handle}`;
  if (platform === "kuaishou") return `https://www.kuaishou.com/profile/${accountId}`;
  return undefined;
}

function formatTimestamp(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number") {
    const ts = value > 1e12 ? value : value * 1000;
    return new Date(ts).toISOString();
  }
  if (typeof value === "string") return value;
  return undefined;
}

/* ── Stage 2: LLM 生成选题方向 ── */

async function stage2GenerateDirections(
  input: TopicStrategyInput,
  rawContents: RawContentEntry[],
  rawAccounts: RawAccountEntry[],
  rawHotSeeds: number,
  sessionId: string,
): Promise<{ directions: TopicDirection[]; strategySummary: string; durationMs: number }> {
  const start = Date.now();

  // 自进化：获取历史反馈上下文（如果有历史发布数据）
  const historicalFeedback = await getHistoricalFeedbackForPrompt(
    input.userOpenId,
    input.track,
  ).catch((err) => {
    log.warn({ err: err }, "历史反馈获取失败，降级为无反馈模式");
    return "";
  });
  if (historicalFeedback) {
    log.info(`Stage 2 注入历史反馈上下文 (${historicalFeedback.length} chars)`);
  }

  const topContents = rawContents
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 20);

  const topAccounts = rawAccounts
    .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
    .slice(0, 10);

  const contentSummary = topContents.map((c) =>
    `[${PLATFORM_NAMES[c.platform]}] ${c.title} | 点赞:${c.likeCount ?? "?"} 播放:${c.viewCount ?? "?"} 作者粉丝:${c.authorFollowerCount ?? "?"}`
  ).join("\n");

  const accountSummary = topAccounts.map((a) =>
    `[${PLATFORM_NAMES[a.platform]}] ${a.displayName} | 粉丝:${a.followerCount ?? "?"}`
  ).join("\n");

  // P1-4: 注入 top 5 爆款完整标题作为参考风格
  const top5Titles = topContents.slice(0, 5).map((c) => c.title);
  const titleStyleRef = top5Titles.length > 0
    ? `\n## 爆款标题参考风格\n以下是当前赛道点赞最高的 ${top5Titles.length} 条内容标题，生成的可执行选题标题应参考这些爆款的语言风格、钩子结构和情绪张力，但不要照抄：\n${top5Titles.map((t, i) => `${i + 1}. 「${t}」`).join("\n")}`
    : "";

  const connectedInfo = input.connectedAccounts?.map((a) =>
    `[${PLATFORM_NAMES[a.platform]}] ${a.displayName} | 粉丝:${a.followerCount} | 近期话题:${a.recentTopics?.join("、") ?? "无"}`
  ).join("\n") ?? "无已连接账号";

  const prompt = `你是一个短视频选题策略专家。基于以下数据，为用户生成 3-5 个选题方向。

## 用户信息
- 赛道：${input.track}
- 账号阶段：${STAGE_LABELS[input.accountStage] ?? input.accountStage}
- 平台：${input.platforms.map((p) => PLATFORM_NAMES[p]).join("、")}
${input.userPrompt ? `- 补充要求：${input.userPrompt}` : ""}

## 已连接账号
${connectedInfo}

## 市场数据（实时采集）
- 共采集 ${rawContents.length} 条内容、${rawAccounts.length} 个账号、${rawHotSeeds} 条热榜命中
- 热门内容 TOP 20：
${contentSummary || "暂无数据"}

- 活跃账号 TOP 10：
${accountSummary || "暂无数据"}
${titleStyleRef}

## 输出要求
生成 3-5 个选题方向，每个方向包含：
1. 方向名称（8字以内，具体可执行）
2. 核心逻辑（为什么现在做这个方向，结合数据说明）
3. 适合的账号阶段
4. 最小测试方案（第一条视频怎么拍）
5. 流量潜力（1-5）、制作难度（1-5）、竞争强度（1-5）
6. 2-3 个具体可执行选题（每个带标题、角度、钩子类型、预估时长）

重要：可执行选题的标题必须像真实的短视频标题，参考上方爆款标题的语言风格和钩子结构，但不要照抄。标题要有情绪张力、口语化、能引发点击欲望。

优先级排序原则：
- 新号优先低竞争高流量方向
- 成长期优先差异化方向
- 成熟期优先高天花板方向

同时生成一段策略总结（100字以内），概括当前赛道的整体机会和建议。
${historicalFeedback ? `
重要：以下是用户在该赛道的历史发布效果数据，请基于这些真实反馈调整方向推荐：
- 优先推荐与历史表现好的方向类似的方向
- 避免推荐与历史表现差的方向相同的方向（除非换了全新角度）
- 如果某个方向效果在下降，考虑推荐替代方向
- 如果整体预测准确率偏低，评分时更保守
${historicalFeedback}` : ""}`;

  try {
    const resp = await invokeLLM({
      messages: [
        { role: "system", content: "你是一个短视频选题策略专家，只返回 JSON 格式的结构化数据。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "topic_strategy_directions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strategySummary: { type: "string", description: "策略总结（100字以内）" },
              directions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    directionName: { type: "string" },
                    directionLogic: { type: "string" },
                    targetStage: { type: "string" },
                    testPlan: { type: "string" },
                    trafficPotential: { type: "integer" },
                    productionCost: { type: "integer" },
                    competitionLevel: { type: "integer" },
                    priorityRank: { type: "integer" },
                    executableTopics: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          angle: { type: "string" },
                          hookType: { type: "string" },
                          estimatedDuration: { type: "string" },
                        },
                        required: ["title", "angle", "hookType", "estimatedDuration"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    "directionName", "directionLogic", "targetStage", "testPlan",
                    "trafficPotential", "productionCost", "competitionLevel", "priorityRank",
                    "executableTopics",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["strategySummary", "directions"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent2 = resp.choices[0].message.content;
    const contentStr2 = typeof rawContent2 === "string" ? rawContent2 : JSON.stringify(rawContent2);
    const parsed = JSON.parse(contentStr2 ?? "{}");
    const directions: TopicDirection[] = (parsed.directions ?? []).map((d: TopicDirection, i: number) => ({
      ...d,
      priorityRank: d.priorityRank ?? i + 1,
      trafficPotential: clamp(d.trafficPotential, 1, 5),
      productionCost: clamp(d.productionCost, 1, 5),
      competitionLevel: clamp(d.competitionLevel, 1, 5),
    }));

    return {
      directions,
      strategySummary: parsed.strategySummary ?? `${input.track}赛道当前有${rawContents.length}条活跃内容，建议从以下方向切入。`,
      durationMs: elapsed(start),
    };
  } catch (err) {
    log.error({ err: err }, "Stage 2 LLM generation failed");
    return {
      directions: [],
      strategySummary: `${input.track}赛道分析完成，但方向生成遇到问题，请稍后重试。`,
      durationMs: elapsed(start),
    };
  }
}

/* ── Stage 3: 同行对标 ── */

async function stage3PeerBenchmark(
  input: TopicStrategyInput,
  rawContents: RawContentEntry[],
  rawAccounts: RawAccountEntry[],
  sessionId: string,
): Promise<{ peers: PeerBenchmarkResult[]; durationMs: number }> {
  const start = Date.now();
  const peers: PeerBenchmarkResult[] = [];

  // P0-3: 按用户账号阶段过滤同行
  // BUG-1 修复：当 rawAccounts 为空时，从 rawContents 中提取作者信息作为候选
  let effectiveAccounts = rawAccounts;
  if (rawAccounts.length === 0 && rawContents.length > 0) {
    const authorMap = new Map<string, RawAccountEntry>();
    for (const c of rawContents) {
      if (c.authorName && c.authorName !== "未知" && !authorMap.has(c.authorName)) {
        authorMap.set(c.authorName, {
          accountId: c.contentId, // 用内容 ID 作为临时账号 ID
          displayName: c.authorName,
          handle: c.authorName,
          platform: c.platform,
          followerCount: c.authorFollowerCount,
          profileUrl: undefined,
        });
      }
    }
    effectiveAccounts = Array.from(authorMap.values());
    log.info(`Stage 3: 从内容中提取了 ${effectiveAccounts.length} 个作者作为候选账号`);
  }

  const stageRange = getStageFollowerRange(input.accountStage);
  const stageFiltered = effectiveAccounts.filter((a) => {
    if (a.followerCount === null || a.followerCount <= 0) return false;
    return a.followerCount >= stageRange.min && a.followerCount <= stageRange.max;
  });

  // 如果阶段过滤后不足 3 个，放宽到全部有粉丝数的账号
  // 再不足则放宽到所有账号
  const candidateAccounts = stageFiltered.length >= 3
    ? stageFiltered
    : effectiveAccounts.filter((a) => a.followerCount !== null && a.followerCount > 0).length >= 3
      ? effectiveAccounts.filter((a) => a.followerCount !== null && a.followerCount > 0)
      : effectiveAccounts;

  const topAccounts = candidateAccounts
    .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
    .slice(0, 5);

  // 批量补充粉丝数：搜索结果经常不返回粉丝数，通过用户详情接口补充
  const accountsNeedingFollowers = topAccounts.filter(
    (a) => (a.followerCount === null || a.followerCount === 0) && a.accountId,
  );
  if (accountsNeedingFollowers.length > 0) {
    log.info(`Stage 3: 补充 ${accountsNeedingFollowers.length} 个账号的粉丝数`);
    const profilePromises = accountsNeedingFollowers.map(async (account) => {
      try {
        let resp: { ok: boolean; payload: Record<string, unknown> | null } = { ok: false, payload: null };
        if (account.platform === "douyin" && account.accountId.startsWith("MS4w")) {
          resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/app/v3/handler_user_profile",
            { sec_user_id: account.accountId },
            10000,
          );
        } else if (account.platform === "kuaishou" && /^\d+$/.test(account.accountId)) {
          resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/kuaishou/app/user_profile_v2",
            { user_id: account.accountId },
            10000,
          );
        }
        if (resp.ok && resp.payload) {
          let fc: number | null = null;
          walkObjects(resp.payload, (r) => {
            if (fc !== null) return;
            const f = getNumber(r, ["follower_count", "fans_count", "fan"]);
            if (f !== null && f > 0) fc = f;
          });
          if (fc !== null && fc > 0) {
            account.followerCount = fc;
          }
        }
      } catch {
        // 忽略单个账号的查询失败
      }
    });
    await Promise.allSettled(profilePromises);
  }

  for (const account of topAccounts) {
    // 查找该账号的作品
    const accountWorks = rawContents
      .filter((c) => c.platform === account.platform && c.authorName === account.displayName)
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      .slice(0, 5);

    const recentWorks: PeerWork[] = accountWorks.map((w) => ({
      title: w.title,
      likeCount: w.likeCount ?? 0,
      viewCount: w.viewCount ?? undefined,
      shareCount: w.shareCount ?? undefined,
      publishedAt: w.publishedAt,
      contentUrl: w.contentUrl,
    }));

    // 计算平均互动率
    const interactionRates = accountWorks
      .filter((w) => w.viewCount && w.viewCount > 0)
      .map((w) => ((w.likeCount ?? 0) + (w.commentCount ?? 0) + (w.shareCount ?? 0)) / (w.viewCount ?? 1));
    const avgRate = interactionRates.length > 0
      ? interactionRates.reduce((a, b) => a + b, 0) / interactionRates.length
      : 0;

    peers.push({
      platform: account.platform,
      accountId: account.accountId,
      displayName: account.displayName,
      handle: account.handle,
      followerCount: account.followerCount ?? 0,
      recentWorks,
      avgInteractionRate: Math.round(avgRate * 10000) / 100,
    });

    // 持久化
    await createPeerBenchmark({
      sessionId,
      platform: account.platform,
      accountId: account.accountId,
      displayName: account.displayName,
      handle: account.handle,
      followerCount: account.followerCount ?? undefined,
      recentWorks,
      avgInteractionRate: Math.round(avgRate * 10000) / 100,
    });
  }

  return { peers, durationMs: elapsed(start) };
}

/* ── Stage 4: 跨行业迁移 ── */

async function stage4CrossIndustry(
  input: TopicStrategyInput,
  rawContents: RawContentEntry[],
  sessionId: string,
): Promise<{ insights: CrossIndustryInsight[]; durationMs: number }> {
  const start = Date.now();

  // P1-6: 扩大搜索范围——先从当前采集数据找，不足时从低粉爆款库补充
  let lowFollowerHits = rawContents.filter(
    (c) =>
      c.authorFollowerCount !== null &&
      c.authorFollowerCount < 10000 &&
      c.likeCount !== null &&
      c.likeCount > 10000,
  );

  // 如果当前采集数据中低粉爆款不足 3 条，从库中查询非当前赛道的爆款样本
  if (lowFollowerHits.length < 3) {
    try {
      // 查询其他赛道的低粉爆款样本（排除当前赛道）
      const dbSamples = await queryLowFollowerSamples({
        isStrictOnly: true,
        minAnomalyScore: 60,
        limit: 10,
      });
      // 过滤掉当前赛道的样本（我们要的是跨行业的）
      const trackKeywords = TRACK_KEYWORDS[input.track] ?? [input.track];
      const crossIndustrySamples = dbSamples.filter((s) => {
        const titleLower = s.title.toLowerCase();
        return !trackKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));
      });
      // 转换为 RawContentEntry 格式并追加
      const converted: RawContentEntry[] = crossIndustrySamples.slice(0, 5).map((s) => ({
        contentId: s.contentId,
        title: s.title,
        platform: s.platform as SupportedPlatform,
        likeCount: s.likeCount,
        commentCount: s.commentCount,
        shareCount: s.shareCount,
        collectCount: s.saveCount ?? 0,
        viewCount: s.viewCount,
        authorId: s.authorId,
        authorName: s.authorName,
        authorFollowerCount: s.followerCount,
        publishedAt: s.publishedAt ?? undefined,
        contentUrl: s.contentUrl ?? undefined,
        tags: s.tags,
      }));
      lowFollowerHits = [...lowFollowerHits, ...converted];
      log.info(`Stage 4: 补充了 ${converted.length} 条跨行业低粉爆款样本`);
    } catch (err) {
      log.warn({ err: err }, "Failed to query low-follower DB for cross-industry");
    }
  }

  if (lowFollowerHits.length === 0) {
    return { insights: [], durationMs: elapsed(start) };
  }

  // 用 LLM 分析可迁移元素
  const sampleContents = lowFollowerHits.slice(0, 8).map((c) =>
    `[${PLATFORM_NAMES[c.platform] ?? c.platform}] ${c.title} | 点赞:${c.likeCount} 作者粉丝:${c.authorFollowerCount}`
  ).join("\n");

  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一个跨行业内容迁移专家。分析以下低粉爆款内容，找出可以迁移到「${input.track}」赛道的元素。
返回 JSON 格式。`,
        },
        {
          role: "user",
          content: `目标赛道：${input.track}\n目标账号阶段：${STAGE_LABELS[input.accountStage] ?? input.accountStage}\n\n低粉爆款样本：\n${sampleContents}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cross_industry_insights",
          strict: true,
          schema: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sourceIndustry: { type: "string" },
                    sourceTitle: { type: "string" },
                    sourcePlatform: { type: "string" },
                    transferableElements: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          element: { type: "string" },
                          reason: { type: "string" },
                          adaptationHint: { type: "string" },
                        },
                        required: ["element", "reason", "adaptationHint"],
                        additionalProperties: false,
                      },
                    },
                    migrationIdea: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["sourceIndustry", "sourceTitle", "sourcePlatform", "transferableElements", "migrationIdea", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["insights"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent4 = resp.choices[0].message.content;
    const contentStr4 = typeof rawContent4 === "string" ? rawContent4 : JSON.stringify(rawContent4);
    const parsed = JSON.parse(contentStr4 ?? "{}");
    const insights: CrossIndustryInsight[] = parsed.insights ?? [];

    // 持久化
    for (const insight of insights) {
      await createCrossIndustry({
        sessionId,
        sourceIndustry: insight.sourceIndustry,
        sourceTitle: insight.sourceTitle,
        sourcePlatform: insight.sourcePlatform,
        transferableElements: insight.transferableElements,
        migrationIdea: insight.migrationIdea,
        confidence: insight.confidence,
      });
    }

    return { insights, durationMs: elapsed(start) };
  } catch (err) {
    log.error({ err: err }, "Stage 4 cross-industry analysis failed");
    return { insights: [], durationMs: elapsed(start) };
  }
}

/* ── Stage 5: 自循环验证 ── */

async function stage5Validate(
  input: TopicStrategyInput,
  directions: TopicDirection[],
  rawContents: RawContentEntry[],
  peers: PeerBenchmarkResult[],
  sessionId: string,
  directionIds: string[],
): Promise<{ validations: DirectionValidation[]; durationMs: number }> {
  const start = Date.now();
  const validations: DirectionValidation[] = [];

  // P0-1: 批量 LLM 语义匹配（一次调用判断所有方向 × 内容的相关性）
  const semanticMatches = await batchSemanticMatch(
    directions.map((d) => d.directionName),
    rawContents.map((c) => c.title),
  );

  // 并行处理所有方向的验证，避免串行等待
  const validationTasks = directions.map(async (dir, i) => {
    const dirId = directionIds[i];
    const matchedIndices = semanticMatches[i] ?? [];

    // 5a. 二次搜索验证
    const searchHits = await secondarySearch(input.platforms, dir.directionName);

    // 5b. 低粉案例检查（放宽条件：粉丝<5万且点赞>1000，更容易匹配到案例）
    const lowFollowerMatched = matchedIndices
      .map((idx) => rawContents[idx])
      .filter((c) =>
        c &&
        c.authorFollowerCount !== null &&
        c.authorFollowerCount < 50000 &&
        c.likeCount !== null &&
        c.likeCount > 1000,
      );
    // 如果语义匹配中没有低粉案例，从全部内容中查找
    const fallbackLowFollower = lowFollowerMatched.length === 0
      ? rawContents.filter((c) =>
          c.authorFollowerCount !== null &&
          c.authorFollowerCount < 50000 &&
          c.likeCount !== null &&
          c.likeCount > 500 &&
          c.title.length >= 8,
        ).slice(0, 3)
      : [];
    const allLowFollower = [...lowFollowerMatched, ...fallbackLowFollower];
    const lowFollowerCases = allLowFollower.length;
    const matchedContentTitles = allLowFollower.map((c) => c.title).slice(0, 5);

    // 5c. 评论区需求信号（P0-2: 接入真实评论采集）
    const { commentSignals, realCommentDemands } = await extractRealCommentSignals(
      rawContents, matchedIndices, dir.directionName, input.platforms[0] ?? "douyin",
    );

    // 5d. 同行成功率（P0-1: 用语义匹配替代 slice(0,4)）
    const peerSemanticMatches = await batchSemanticMatch(
      [dir.directionName],
      peers.flatMap((p) => p.recentWorks.map((w) => w.title)),
    );
    const peerWorkTitles = peers.flatMap((p) => p.recentWorks.map((w) => ({ title: w.title, peer: p })));
    const matchedPeerSet = new Set<string>();
    const peerResults: string[] = [];
    for (const idx of peerSemanticMatches[0] ?? []) {
      const pw = peerWorkTitles[idx];
      if (pw && !matchedPeerSet.has(pw.peer.displayName)) {
        matchedPeerSet.add(pw.peer.displayName);
        peerResults.push(`${pw.peer.displayName}(${pw.peer.followerCount}粉) 有相关作品「${pw.title.slice(0, 20)}」`);
      }
    }

    // 验证分计算：基础分 + 数据驱动加分
    // 语义匹配本身就是有效验证信号，给予基础分
    const semanticMatchCount = matchedIndices.length;
    const semanticBaseBonus = semanticMatchCount > 0 ? Math.min(30, semanticMatchCount * 5) : 0;

    const breakdown: ValidationBreakdown = {
      searchHitScore: smoothScore(searchHits, 2, 100),
      lowFollowerScore: smoothScore(lowFollowerCases, 1, 100),
      commentDemandScore: smoothScore(commentSignals.length + realCommentDemands.length, 2, 100),
      peerSuccessScore: smoothScore(peerResults.length, 1, 100),
    };

    // 加权计算 + 语义匹配基础分
    const rawScore =
      breakdown.searchHitScore * 0.25 +
      breakdown.lowFollowerScore * 0.25 +
      breakdown.commentDemandScore * 0.2 +
      breakdown.peerSuccessScore * 0.15 +
      semanticBaseBonus * 0.15;

    // 确保有数据采集时最低分为 25（避免全 0 的尴尬）
    // 当数据采集完全失败时（如 TikHub Cookie 过期），给基于 LLM 方向质量的基础分
    // 避免因外部 API 故障导致所有方向验证分全为 0
    const hasDataCollection = rawContents.length > 0;
    const directionQualityBase = dir.executableTopics.length >= 3 ? 40
      : dir.executableTopics.length >= 1 ? 35 : 30;
    const minScore = hasDataCollection ? 25 : directionQualityBase;
    const validationScore = clamp(Math.max(rawScore, minScore));

    // 平台维度验证（P0-1: 语义匹配）
    const platformScores: Record<string, PlatformValidationScore> = {};
    for (const platform of input.platforms) {
      const platformHits = matchedIndices
        .map((idx) => rawContents[idx])
        .filter((c) => c && c.platform === platform).length;
      platformScores[platform] = {
        score: smoothScore(platformHits, 3, 100),
        searchHits: platformHits,
        details: `${PLATFORM_NAMES[platform]}语义命中${platformHits}条相关内容`,
      };
    }

    const detail: ValidationDetail = {
      searchHits,
      lowFollowerCases,
      commentSignals,
      peerResults,
      matchedContentTitles,
      realCommentDemands,
      matchedPeerNames: [...matchedPeerSet],
    };

    // 持久化验证结果
    await updateDirectionValidation(
      dirId,
      validationScore,
      breakdown,
      validationScore >= 60 ? "validated" : "pending",
      detail,
      platformScores,
    );

    const validation: DirectionValidation = {
      directionId: dirId,
      directionName: dir.directionName,
      validationScore,
      breakdown,
      detail,
      platformScores,
    };

    // 5e. 自进化：验证分 > 80 的方向自动生成子方向
    if (validationScore >= 80) {
      const evolvedChildren = await evolveDirection(input, dir, rawContents, sessionId);
      validation.evolvedChildren = evolvedChildren;
    }

    return validation;
  });

  // 给整个 Stage 5 设置 60s 超时保护
  const settledResults = await Promise.race([
    Promise.allSettled(validationTasks),
    new Promise<PromiseSettledResult<DirectionValidation>[]>((resolve) =>
      setTimeout(() => {
        log.warn(`Stage 5 overall timeout (60s), returning partial results`);
        resolve([]);
      }, 60000),
    ),
  ]);

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      validations.push(settled.value);
    } else {
      log.warn(`Direction validation failed: ${settled.reason}`);
    }
  }

  return { validations, durationMs: elapsed(start) };
}

async function secondarySearch(platforms: SupportedPlatform[], directionName: string): Promise<number> {
  let totalHits = 0;
  const searchTasks = platforms.map(async (platform) => {
    try {
      const result = await searchPlatform(platform, directionName);
      return result.contents.length;
    } catch {
      return 0;
    }
  });

  // BUG-1 修复：给二次搜索加 10s 超时限制，避免小红书 45s 超时阻塞整个 Stage 5
  const results = await Promise.race([
    Promise.allSettled(searchTasks),
    new Promise<PromiseSettledResult<number>[]>((resolve) =>
      setTimeout(() => resolve(searchTasks.map(() => ({ status: "rejected" as const, reason: "timeout" }))), 10000),
    ),
  ]);
  for (const r of results) {
    if (r.status === "fulfilled") totalHits += r.value;
  }
  return totalHits;
}

/** P0-2: 真实评论需求信号提取（替代假的 extractCommentSignals） */
async function extractRealCommentSignals(
  contents: RawContentEntry[],
  matchedIndices: number[],
  directionName: string,
  defaultPlatform: SupportedPlatform,
): Promise<{ commentSignals: string[]; realCommentDemands: string[] }> {
  const commentSignals: string[] = [];
  const realCommentDemands: string[] = [];

  // 从语义匹配的内容中选取评论数最高的 1 条去采集真实评论（优化API调用量）
  const matchedContents = matchedIndices
    .map((idx) => contents[idx])
    .filter((c) => c && c.commentCount && c.commentCount > 20)
    .sort((a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0))
    .slice(0, 1);

  // 并行获取评论，每个请求 8s 超时，整体 15s 超时
  const commentFetchTasks = matchedContents.map(async (content) => {
    try {
      const fetchWithTimeout = Promise.race([
        fetchRealComments(content.contentId, 0, 10, content.platform ?? defaultPlatform),
        new Promise<{ comments: never[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ comments: [], hasMore: false }), 8000),
        ),
      ]);
      return { content, result: await fetchWithTimeout };
    } catch {
      return { content, result: { comments: [] as never[], hasMore: false } };
    }
  });

  const commentResults = await Promise.race([
    Promise.allSettled(commentFetchTasks),
    new Promise<PromiseSettledResult<{ content: RawContentEntry; result: { comments: never[]; hasMore: boolean } }>[]>(
      (resolve) => setTimeout(() => resolve([]), 15000),
    ),
  ]);

  for (const settled of commentResults) {
    if (settled.status !== "fulfilled") continue;
    const { content, result: { comments } } = settled.value;
    try {

      if (comments.length > 0) {
        commentSignals.push(
          `「${content.title.slice(0, 25)}」有${content.commentCount}条评论，已采集${comments.length}条`,
        );

        // 从真实评论中提取需求信号
        const demandPatterns = [
          /怎么.{1,15}/, /求.{1,15}/, /在哪.{0,12}/, /多少钱.{0,10}/,
          /哪里.{0,12}/, /推荐.{0,12}/, /教程.{0,10}/, /新手.{0,10}/,
          /入门.{0,10}/, /想试.{0,10}/, /想买.{0,10}/, /想学.{0,10}/,
          /可以吗.{0,10}/, /链接.{0,10}/, /同款.{0,10}/, /价格.{0,10}/,
        ];
        const seen = new Set<string>();
        for (const comment of comments) {
          const text = typeof comment.text === "string" ? comment.text : "";
          for (const pattern of demandPatterns) {
            const match = text.match(pattern);
            if (match && !seen.has(match[0].slice(0, 15))) {
              seen.add(match[0].slice(0, 15));
              realCommentDemands.push(match[0].slice(0, 20));
            }
          }
          if (realCommentDemands.length >= 8) break;
        }
      }
    } catch (err) {
      log.warn({ err: err }, `Comment fetch failed for ${content.contentId}`);
    }
  }

  // 降级：如果真实评论采集失败，用标题关键词+评论数做基本信号
  if (commentSignals.length === 0) {
    const keywords = directionName.split(/[·、，,\s]/).filter((k) => k.length >= 2);
    for (const content of contents) {
      for (const kw of keywords) {
        if (content.title.includes(kw) && content.commentCount && content.commentCount > 50) {
          commentSignals.push(`「${content.title.slice(0, 30)}」有${content.commentCount}条评论`);
          break;
        }
      }
      if (commentSignals.length >= 5) break;
    }
  }

  return { commentSignals: commentSignals.slice(0, 5), realCommentDemands: realCommentDemands.slice(0, 8) };
}

/** P0-1: LLM 批量语义匹配（一次调用判断多个方向 × 多个标题的相关性） */
async function batchSemanticMatch(
  directionNames: string[],
  contentTitles: string[],
): Promise<Record<number, number[]>> {
  if (directionNames.length === 0 || contentTitles.length === 0) {
    return {};
  }

  // 限制标题数量避免 token 过长
  const maxTitles = Math.min(contentTitles.length, 50);
  const truncatedTitles = contentTitles.slice(0, maxTitles);

  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一个内容相关性判断专家。判断每个"方向"与哪些"标题"在语义上相关。
相关的标准：标题的主题、角度或受众与方向有明确关联（不要求完全匹配，只要有合理的内容关联即可）。
返回 JSON 格式。`,
        },
        {
          role: "user",
          content: `方向列表：
${directionNames.map((d, i) => `${i}. ${d}`).join("\n")}

标题列表：
${truncatedTitles.map((t, i) => `${i}. ${t}`).join("\n")}

对每个方向，返回与之相关的标题编号数组。`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_match",
          strict: true,
          schema: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                description: "每个方向对应的匹配标题编号数组，按方向顺序排列",
                items: {
                  type: "object",
                  properties: {
                    directionIndex: { type: "integer" },
                    matchedTitleIndices: { type: "array", items: { type: "integer" } },
                  },
                  required: ["directionIndex", "matchedTitleIndices"],
                  additionalProperties: false,
                },
              },
            },
            required: ["matches"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = resp.choices[0].message.content;
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(contentStr ?? "{}");
    const result: Record<number, number[]> = {};
    for (const m of parsed.matches ?? []) {
      const validIndices = (m.matchedTitleIndices ?? [])
        .filter((idx: number) => idx >= 0 && idx < maxTitles);
      result[m.directionIndex] = validIndices;
    }
    return result;
  } catch (err) {
    log.warn({ err: err }, "Semantic match LLM failed, falling back to keyword match");
    // 降级：关键词匹配
    const result: Record<number, number[]> = {};
    for (let di = 0; di < directionNames.length; di++) {
      const keywords = directionNames[di].split(/[·、，,\s]/).filter((k) => k.length >= 2);
      const matched: number[] = [];
      for (let ti = 0; ti < truncatedTitles.length; ti++) {
        if (keywords.some((kw) => truncatedTitles[ti].includes(kw))) {
          matched.push(ti);
        }
      }
      result[di] = matched;
    }
    return result;
  }
}

/** P1-7: 对数平滑评分函数（避免极端分数） */
function smoothScore(count: number, halfPoint: number, maxScore: number): number {
  if (count <= 0) return 0;
  // 使用对数函数：hp=1→count=1→43, count=2→68, count=3→86
  // hp=2→count=1→30, count=2→48, count=3→61
  const score = maxScore * Math.log(1 + count) / Math.log(1 + halfPoint * 3);
  return clamp(Math.round(score), 0, maxScore);
}

/** P0-3: 根据账号阶段返回粉丝数范围 */
function getStageFollowerRange(accountStage: string): { min: number; max: number } {
  switch (accountStage) {
    case "new":
      return { min: 1000, max: 50000 };     // 新号看 0.1-5 万粉同行
    case "growing":
      return { min: 10000, max: 300000 };   // 成长期看 1-30 万粉同行
    case "mature":
      return { min: 100000, max: Infinity }; // 成熟期看 10 万+ 同行
    default:
      return { min: 0, max: Infinity };
  }
}

/* ── Stage 5e: 自进化 — 递归生成子方向 ── */

async function evolveDirection(
  input: TopicStrategyInput,
  parentDirection: TopicDirection,
  rawContents: RawContentEntry[],
  sessionId: string,
): Promise<TopicDirection[]> {
  try {
    // 自进化：获取该方向的历史效果反馈
    const dirFeedback = await getDirectionFeedbackForPrompt(
      input.userOpenId,
      parentDirection.directionName,
    ).catch(() => "");

    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一个选题深挖专家。基于一个已验证的高分方向，生成 2 个更细分的子方向。
每个子方向要比父方向更具体、更可执行。返回 JSON 格式。${dirFeedback ? "\n请参考该方向的历史效果数据来优化子方向生成。" : ""}`,
        },
        {
          role: "user",
          content: `父方向：${parentDirection.directionName}\n核心逻辑：${parentDirection.directionLogic}\n赛道：${input.track}\n账号阶段：${STAGE_LABELS[input.accountStage] ?? input.accountStage}${dirFeedback}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "evolved_directions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              directions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    directionName: { type: "string" },
                    directionLogic: { type: "string" },
                    targetStage: { type: "string" },
                    testPlan: { type: "string" },
                    trafficPotential: { type: "integer" },
                    productionCost: { type: "integer" },
                    competitionLevel: { type: "integer" },
                    priorityRank: { type: "integer" },
                    executableTopics: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          angle: { type: "string" },
                          hookType: { type: "string" },
                          estimatedDuration: { type: "string" },
                        },
                        required: ["title", "angle", "hookType", "estimatedDuration"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    "directionName", "directionLogic", "targetStage", "testPlan",
                    "trafficPotential", "productionCost", "competitionLevel", "priorityRank",
                    "executableTopics",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["directions"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent5 = resp.choices[0].message.content;
    const contentStr5 = typeof rawContent5 === "string" ? rawContent5 : JSON.stringify(rawContent5);
    const parsed = JSON.parse(contentStr5 ?? "{}");
    return (parsed.directions ?? []).slice(0, 2);
  } catch (err) {
    log.error({ err: err }, "evolveDirection failed");
    return [];
  }
}

/* ── Utility: walk / getString / getNumber ── */

/**
 * 检查 TikHub 返回的 payload 中是否包含内层平台 API 错误
 * 例如抖音返回 {data: {0: {status_code: 2483, status_msg: "请先登录"}}} 表示 Cookie 过期
 */
function hasInnerApiError(payload: Record<string, unknown>): boolean {
  const data = payload.data;
  if (!data || typeof data !== "object") return false;
  // 检查 data[0].status_code 是否为非成功状态
  const firstItem = (data as Record<string, unknown>)["0"];
  if (firstItem && typeof firstItem === "object") {
    const inner = firstItem as Record<string, unknown>;
    const statusCode = inner.status_code;
    if (typeof statusCode === "number" && statusCode !== 0 && statusCode !== 200) {
      return true;
    }
  }
  return false;
}

function getInnerApiMessage(payload: Record<string, unknown>): string {
  const data = payload.data;
  if (!data || typeof data !== "object") return "unknown";
  const firstItem = (data as Record<string, unknown>)["0"];
  if (firstItem && typeof firstItem === "object") {
    const inner = firstItem as Record<string, unknown>;
    return `status_code=${inner.status_code}, msg=${inner.status_msg ?? "N/A"}`;
  }
  return "unknown";
}

function walkObjects(obj: unknown, visitor: (record: Record<string, unknown>) => void) {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkObjects(item, visitor);
    return;
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    visitor(record);
    for (const value of Object.values(record)) {
      walkObjects(value, visitor);
    }
  }
}

function getString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getSubObject(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/* ── Main Pipeline ── */

export async function runTopicStrategyV2(input: TopicStrategyInput): Promise<TopicStrategyV2Result> {
  log.info(`Starting V2 pipeline: track=${input.track}, platforms=${input.platforms.join(",")}, stage=${input.accountStage}`);

  // 创建 session
  const sessionId = await createTopicStrategySession({
    userOpenId: input.userOpenId,
    track: input.track,
    accountStage: input.accountStage,
    platforms: input.platforms,
    userPrompt: input.userPrompt,
    connectedAccounts: input.connectedAccounts,
    entrySource: input.entrySource,
  });

  await updateSessionPipelineStatus(sessionId, "collecting");

  // Stage 1: 多平台数据采集
  const stage1 = await stage1Collect(input, sessionId);
  log.info(`Stage 1 complete: ${stage1.rawContents.length} contents, ${stage1.rawAccounts.length} accounts, ${stage1.rawHotSeeds} hot seeds (${stage1.durationMs}ms)`);

  await updateSessionPipelineStatus(sessionId, "generating", {
    searchKeywords: stage1.searchKeywords,
    rawDataSummary: {
      totalContents: stage1.rawContents.length,
      totalAccounts: stage1.rawAccounts.length,
      totalHotSeeds: stage1.rawHotSeeds,
      byPlatform: stage1.byPlatform,
    },
  });

  // Stage 2: LLM 生成选题方向
  const stage2 = await stage2GenerateDirections(
    input, stage1.rawContents, stage1.rawAccounts, stage1.rawHotSeeds, sessionId,
  );
  log.info(`Stage 2 complete: ${stage2.directions.length} directions (${stage2.durationMs}ms)`);

  // 持久化方向
  const directionIds: string[] = [];
  for (let i = 0; i < stage2.directions.length; i++) {
    const dir = stage2.directions[i];
    const dirId = await createDirection({
      sessionId,
      directionName: dir.directionName,
      directionLogic: dir.directionLogic,
      targetStage: dir.targetStage,
      testPlan: dir.testPlan,
      trafficPotential: dir.trafficPotential,
      productionCost: dir.productionCost,
      competitionLevel: dir.competitionLevel,
      priorityRank: dir.priorityRank,
      executableTopics: dir.executableTopics,
      sortOrder: i,
    });
    directionIds.push(dirId);
  }

  await updateSessionPipelineStatus(sessionId, "validating");

  // Stage 3: 同行对标
  const stage3 = await stage3PeerBenchmark(input, stage1.rawContents, stage1.rawAccounts, sessionId);
  log.info(`Stage 3 complete: ${stage3.peers.length} peers (${stage3.durationMs}ms)`);

  // Stage 4: 跨行业迁移
  const stage4 = await stage4CrossIndustry(input, stage1.rawContents, sessionId);
  log.info(`Stage 4 complete: ${stage4.insights.length} insights (${stage4.durationMs}ms)`);

  // Stage 5: 自循环验证
  const stage5 = await stage5Validate(
    input, stage2.directions, stage1.rawContents, stage3.peers, sessionId, directionIds,
  );
  log.info(`Stage 5 complete: ${stage5.validations.length} validations (${stage5.durationMs}ms)`);

  // 构建最终结果
  const pipelineProgress: PipelineProgress = {
    stage1_ms: stage1.durationMs,
    stage2_ms: stage2.durationMs,
    stage3_ms: stage3.durationMs,
    stage4_ms: stage4.durationMs,
    stage5_ms: stage5.durationMs,
    total_ms: stage1.durationMs + stage2.durationMs + stage3.durationMs + stage4.durationMs + stage5.durationMs,
  };

  const directionsWithValidation: DirectionWithValidation[] = stage2.directions.map((dir, i) => {
    const validation = stage5.validations.find((v) => v.directionId === directionIds[i]);
    return {
      ...dir,
      id: directionIds[i],
      validationScore: validation?.validationScore ?? 0,
      validationBreakdown: validation?.breakdown ?? { searchHitScore: 0, lowFollowerScore: 0, commentDemandScore: 0, peerSuccessScore: 0 },
      validationStatus: validation ? (validation.validationScore >= 60 ? "validated" : "pending") : "pending",
      platformScores: validation?.platformScores ?? {},
      // P1-5: 传递验证证据链到前端
      validationEvidence: validation?.detail ? {
        matchedContentTitles: validation.detail.matchedContentTitles ?? [],
        realCommentDemands: validation.detail.realCommentDemands ?? [],
        matchedPeerNames: validation.detail.matchedPeerNames ?? [],
      } : undefined,
      evolvedChildren: validation?.evolvedChildren?.map((child, ci) => ({
        ...child,
        id: `evolved_${directionIds[i]}_${ci}`,
        validationScore: 0,
        validationBreakdown: { searchHitScore: 0, lowFollowerScore: 0, commentDemandScore: 0, peerSuccessScore: 0 },
        validationStatus: "pending",
        platformScores: {},
      })),
    };
  });

  const result: TopicStrategyV2Result = {
    sessionId,
    track: input.track,
    accountStage: input.accountStage,
    platforms: input.platforms,
    strategySummary: stage2.strategySummary,
    directions: directionsWithValidation,
    peerBenchmarks: stage3.peers,
    crossIndustryInsights: stage4.insights,
    pipelineProgress,
    searchKeywords: stage1.searchKeywords,
    rawDataSummary: {
      totalContents: stage1.rawContents.length,
      totalAccounts: stage1.rawAccounts.length,
      totalHotSeeds: stage1.rawHotSeeds,
      byPlatform: stage1.byPlatform,
    },
  };

  // 持久化最终结果
  await updateSessionPipelineStatus(sessionId, "completed", {
    pipelineProgress,
    totalDurationMs: pipelineProgress.total_ms,
    validationRuns: stage5.validations,
    resultSnapshot: result,
  });

  log.info(`Pipeline complete: sessionId=${sessionId}, total=${pipelineProgress.total_ms}ms`);

  return result;
}

/**
 * FUTURE-1: 对单个方向重新运行 Stage 5 验证
 * 从数据库获取 session 上下文，重新执行搜索验证 + 低粉爆款匹配 + 评论采集 + 同行验证
 */
export async function revalidateSingleDirection(
  sessionId: string,
  directionId: string,
): Promise<{
  directionId: string;
  directionName: string;
  validationScore: number;
  validationBreakdown: ValidationBreakdown;
  validationEvidence: {
    matchedContentTitles: string[];
    realCommentDemands: string[];
    matchedPeerNames: string[];
  };
}> {
  // 1. 获取 session 上下文
  const session = await getTopicStrategySession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // 2. 获取目标方向
  const allDirections = await getDirectionsBySession(sessionId);
  const targetDir = allDirections?.find((d: Record<string, unknown>) => d.id === directionId);
  if (!targetDir) throw new Error(`Direction ${directionId} not found in session ${sessionId}`);

  // 3. 构建 input
  const platforms = (session.platforms ? JSON.parse(session.platforms as string) : ["douyin"]) as SupportedPlatform[];
  const input: TopicStrategyInput = {
    userOpenId: session.user_open_id as string,
    track: session.track as string,
    accountStage: (session.account_stage as string) || "new",
    platforms,
    userPrompt: (session.user_prompt as string) || "",
    connectedAccounts: [],
    entrySource: "revalidate",
  };

  // 4. 重新采集数据（轻量级：只搜索该方向相关内容）
  const dirName = targetDir.direction_name as string;
  const searchHits = await secondarySearch(platforms, dirName);

  // 5. 从 session 的 result_snapshot 中恢复 rawContents 和 peers
  let rawContents: RawContentEntry[] = [];
  let peers: PeerBenchmarkResult[] = [];
  try {
    const snapshot = session.result_snapshot ? JSON.parse(session.result_snapshot as string) : null;
    if (snapshot) {
      // 尝试从 rawDataSummary 恢复
      rawContents = snapshot._rawContents ?? [];
      peers = snapshot.peerBenchmarks ?? [];
    }
  } catch { /* ignore parse errors */ }

  // 6. 如果没有缓存的 rawContents，重新搜索
  if (rawContents.length === 0) {
    const keywords = [dirName, ...dirName.split(/[+/、，,]/).map((s: string) => s.trim()).filter(Boolean)];
    for (const platform of platforms) {
      for (const kw of keywords.slice(0, 2)) {
        try {
          const results = await searchPlatform(platform, kw);
          rawContents.push(...results.contents);
        } catch { /* skip failed searches */ }
      }
    }
  }

  // 7. 如果没有缓存的 peers，从数据库获取
  if (peers.length === 0) {
    const dbPeers = await getPeerBenchmarksBySession(sessionId);
    if (dbPeers) {
      peers = dbPeers.map((p: Record<string, unknown>) => ({
        platform: (p.platform as string) as SupportedPlatform,
        accountId: (p.unique_id as string) || "",
        displayName: (p.display_name as string) || "",
        handle: (p.unique_id as string) || "",
        followerCount: (p.follower_count as number) || 0,
        avgInteractionRate: (p.avg_engagement_rate as number) || 0,
        recentWorks: p.recent_works ? JSON.parse(p.recent_works as string) : [],
      }));
    }
  }

  // 8. 执行语义匹配
  const direction: TopicDirection = {
    directionName: dirName,
    directionLogic: (targetDir.direction_logic as string) || "",
    targetStage: (targetDir.target_stage as string) || "",
    testPlan: (targetDir.test_plan as string) || "",
    trafficPotential: (targetDir.traffic_potential as number) ?? 5,
    productionCost: (targetDir.production_cost as number) ?? 5,
    competitionLevel: (targetDir.competition_level as number) ?? 5,
    priorityRank: (targetDir.priority_rank as number) || 0,
    executableTopics: targetDir.executable_topics ? JSON.parse(targetDir.executable_topics as string) : [],
  };

  const semanticMatches = await batchSemanticMatch(
    [dirName],
    rawContents.map((c) => c.title),
  );
  const matchedIndices = semanticMatches[0] ?? [];

  // 9. 低粉爆款检查
  const lowFollowerMatched = matchedIndices
    .map((idx) => rawContents[idx])
    .filter((c) =>
      c &&
      c.authorFollowerCount !== null &&
      c.authorFollowerCount < 10000 &&
      c.likeCount !== null &&
      c.likeCount > 5000,
    );
  const matchedContentTitles = lowFollowerMatched.map((c) => c.title).slice(0, 5);

  // 10. 评论区需求信号
  const { commentSignals, realCommentDemands } = await extractRealCommentSignals(
    rawContents, matchedIndices, dirName, platforms[0] ?? "douyin",
  );

  // 11. 同行验证
  const peerSemanticMatches = await batchSemanticMatch(
    [dirName],
    peers.flatMap((p) => p.recentWorks.map((w) => w.title)),
  );
  const peerWorkTitles = peers.flatMap((p) => p.recentWorks.map((w) => ({ title: w.title, peer: p })));
  const matchedPeerSet = new Set<string>();
  for (const idx of peerSemanticMatches[0] ?? []) {
    const pw = peerWorkTitles[idx];
    if (pw) matchedPeerSet.add(pw.peer.displayName);
  }

  // 12. 计算验证分
  const breakdown: ValidationBreakdown = {
    searchHitScore: smoothScore(searchHits, 3, 100),
    lowFollowerScore: smoothScore(lowFollowerMatched.length, 2, 100),
    commentDemandScore: smoothScore(commentSignals.length + realCommentDemands.length, 3, 100),
    peerSuccessScore: smoothScore([...matchedPeerSet].length, 2, 100),
  };
  const validationScore = clamp(
    breakdown.searchHitScore * 0.3 +
    breakdown.lowFollowerScore * 0.3 +
    breakdown.commentDemandScore * 0.2 +
    breakdown.peerSuccessScore * 0.2,
  );

  // 13. 持久化更新
  const platformScores: Record<string, PlatformValidationScore> = {};
  for (const platform of platforms) {
    const platformHits = matchedIndices
      .map((idx) => rawContents[idx])
      .filter((c) => c && c.platform === platform).length;
    platformScores[platform] = {
      score: smoothScore(platformHits, 3, 100),
      searchHits: platformHits,
      details: `${PLATFORM_NAMES[platform] ?? platform}语义命中${platformHits}条相关内容`,
    };
  }

  await updateDirectionValidation(
    directionId,
    validationScore,
    breakdown,
    validationScore >= 60 ? "validated" : "pending",
    {
      searchHits,
      lowFollowerCases: lowFollowerMatched.length,
      commentSignals,
      peerResults: [...matchedPeerSet].map((name) => `${name} 有相关作品`),
      matchedContentTitles,
      realCommentDemands,
      matchedPeerNames: [...matchedPeerSet],
    },
    platformScores,
  );

  log.info(`Revalidated direction ${directionId}: score=${validationScore}`);

  return {
    directionId,
    directionName: dirName,
    validationScore,
    validationBreakdown: breakdown,
    validationEvidence: {
      matchedContentTitles,
      realCommentDemands,
      matchedPeerNames: [...matchedPeerSet],
    },
  };
}
