import { ENV } from "../../../_core/env.js";
import { createModuleLogger } from "../../../legacy/logger.js";
import { getTikHub } from "../../../legacy/tikhub.js";
import type { ExtractedContent } from "../../../legacy/prediction-helpers.js";
import {
  type AugmenterContext,
  type ContentAugmenter,
  registerAugmenter,
} from "../registry.js";

const log = createModuleLogger("XTechAugmenter");

/**
 * X 平台(Twitter)AI 科技博主推文 augmenter。
 *
 * 第一性原理 MVP:不接"新平台",而是把 X 上预设科技博主的近期推文作为
 * 「补充候选内容」追加到主流程的 supportingContents,让现有的 trend / topic
 * 打分 LLM 自然消化(0 LLM 增量)。
 *
 * 触发条件:industry / seedTopic / prompt 命中 AI 科技关键词。
 * 数据源:复用 TikHub Twitter 端点(同 creator-data-sync 走同一通道)。
 * 缓存:per-handle,1 小时窗口,内存 LRU 风格(简易 Map)。
 *
 * 详见 docs/decisions/0005-x-augmenter-bootstrap.md。
 */

const TECH_KEYWORDS = [
  "ai", "AI", "人工智能", "大模型", "LLM", "llm",
  "agent", "Agent", "智能体",
  "科技", "tech", "Tech",
  "openai", "OpenAI", "anthropic", "Anthropic", "claude", "Claude",
  "gpt", "GPT", "deepseek", "DeepSeek",
];

// 反向关键词:命中即跳过本 augmenter。
// 这些场景用户要的是「素人/低粉账号的可复刻样本」,而本 augmenter 提供的是
// 高粉科技名人(elonmusk/sama/karpathy 等)推文,属于反向素材会污染 prompt。
// 详见 docs/decisions/0005-x-augmenter-bootstrap.md「适用边界」段。
const ANTI_KEYWORDS = [
  "低粉", "素人", "可复制", "复刻", "对标账号",
];

const DEFAULT_HANDLES = [
  // 留空,完全靠 env.X_AUGMENTER_TECH_HANDLES 注入
];

const MAX_TWEETS_PER_HANDLE = 3;
const MAX_TOTAL_TWEETS = 8;
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 小时
const TWEET_TITLE_MAX = 200;

interface CacheEntry {
  at: number;
  contents: ExtractedContent[];
}
const cache = new Map<string, CacheEntry>();

function getHandles(): string[] {
  const fromEnv = ENV.xAugmenterTechHandles
    .split(",")
    .map((s) => s.trim().replace(/^@+/, ""))
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_HANDLES;
}

function shouldRun(ctx: AugmenterContext): boolean {
  const haystack = `${ctx.industry ?? ""} ${ctx.seedTopic} ${ctx.prompt ?? ""}`.toLowerCase();
  // 反向关键词优先:低粉/素人样本场景下不注入 X 高粉名人推文
  if (ANTI_KEYWORDS.some((k) => haystack.includes(k.toLowerCase()))) return false;
  return TECH_KEYWORDS.some((k) => haystack.includes(k.toLowerCase()));
}

async function fetchHandleTweets(screenName: string): Promise<ExtractedContent[]> {
  const cached = cache.get(screenName);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.contents;
  }

  const res = await getTikHub<unknown>(
    "/api/v1/twitter/web/fetch_user_post_tweet",
    { screen_name: screenName, cursor: "" },
  );
  if (!res.ok) {
    log.warn({ screenName, httpStatus: res.httpStatus }, "tikhub twitter fetch failed");
    return [];
  }
  const p = res.payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;
  const timeline = (data.timeline ?? []) as Array<Record<string, unknown>>;

  const tweets: ExtractedContent[] = [];
  for (const t of timeline) {
    const tweetId = String(t.tweet_id ?? t.id ?? "");
    const text = String(t.text ?? t.full_text ?? "").trim();
    if (!tweetId || !text) continue;

    // TikHub Twitter timeline 真实字段名:favorites / retweets / replies / views / bookmarks / quotes
    // (旧的 favorite_count / retweet_count / reply_count 是兜底,以防上游字段名变化)
    const likes = numberOr(t.favorites ?? t.favorite_count ?? t.likes, 0);
    const retweets = numberOr(t.retweets ?? t.retweet_count, 0);
    const quotes = numberOr(t.quotes, 0);
    const replies = numberOr(t.replies ?? t.reply_count, 0);
    const views = numberOr(t.views ?? t.view_count, 0);
    const bookmarks = numberOr(t.bookmarks, 0);
    const createdAt = t.created_at
      ? new Date(String(t.created_at)).toISOString()
      : new Date().toISOString();

    tweets.push({
      contentId: `x_${tweetId}`,
      title: text.slice(0, TWEET_TITLE_MAX),
      authorName: `@${screenName}`,
      // platform 设 "X",下游 c.platform === "抖音" 等比对会自然跳过(safe-by-default)
      platform: "X",
      publishedAt: createdAt,
      contentUrl: `https://x.com/${screenName}/status/${tweetId}`,
      coverUrl: null,
      viewCount: views || null,
      likeCount: likes,
      commentCount: replies,
      // 转发 + 引用 都算传播
      shareCount: retweets + quotes,
      collectCount: bookmarks,
      structureSummary: "",
      keywordTokens: [],
      whyIncluded: "X 平台 AI 科技博主推文(augmenter 注入)",
      // 设置一个大数,避免被低粉爆款算法误判为「素人爆款样本」
      authorFollowerCount: 1_000_000,
    });
  }

  // 按互动排序,取 top
  tweets.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
  const top = tweets.slice(0, MAX_TWEETS_PER_HANDLE);
  cache.set(screenName, { at: Date.now(), contents: top });
  return top;
}

function numberOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function run(ctx: AugmenterContext): Promise<ExtractedContent[]> {
  const handles = getHandles();
  if (handles.length === 0) {
    log.warn("no X handles configured (X_AUGMENTER_TECH_HANDLES empty), skip");
    return [];
  }

  const settled = await Promise.allSettled(handles.map(fetchHandleTweets));
  const all: ExtractedContent[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  // 跨 handle 再排一次,取整体 top
  all.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
  const top = all.slice(0, MAX_TOTAL_TWEETS);
  log.info(
    { traceId: ctx.traceId, industry: ctx.industry, handles: handles.length, added: top.length },
    "x-tech augmenter produced",
  );
  return top;
}

const xTechAugmenter: ContentAugmenter = {
  name: "x-tech-source",
  shouldRun,
  run,
};

/** 暴露给单测的 augmenter 对象。生产代码用 register()。 */
export const augmenter = xTechAugmenter;

export function register(): void {
  registerAugmenter(xTechAugmenter);
}

/** 仅供测试用 */
export function _clearCacheForTest(): void {
  cache.clear();
}
