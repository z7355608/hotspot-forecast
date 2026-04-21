/**
 * server/legacy/comment-service.ts
 * ═══════════════════════════════════════════════════════════════
 * 评论服务：真实评论获取、存储、查询和 AI 分析
 *
 * 功能：
 * 1. 从 TikHub API 获取抖音视频评论（web + app v3 降级）
 * 2. 持久化评论到 creator_work_comments 表
 * 3. 查询已缓存的评论
 * 4. AI 分析评论（情感分类、高频词、需求信号、LLM 摘要）
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("CommentService");
import { getTikHub } from "./tikhub.js";
import { query, execute } from "./database.js";
import type { RowDataPacket } from "./database.js";
import { callLLM } from "./llm-gateway.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

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

export interface FetchCommentsResult {
  success: boolean;
  comments: CommentItem[];
  total: number;
  fromCache: boolean;
  error?: string;
}

// ─────────────────────────────────────────────
// 1. 从 TikHub 获取真实评论
// ─────────────────────────────────────────────

interface RawComment {
  text: string;
  likeCount: number;
  authorName: string;
  authorAvatar?: string;
  replyCount: number;
  commentId: string;
  isAuthorReply: boolean;
  createdAt: number; // unix timestamp
}

function walkObjects(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
  depth = 0,
) {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      walkObjects(item, visitor, depth + 1);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  visitor(record);
  for (const item of Object.values(record)) {
    walkObjects(item, visitor, depth + 1);
  }
}

function extractCommentsFromPayload(payload: unknown): RawComment[] {
  const comments: RawComment[] = [];
  const seenIds = new Set<string>();

  walkObjects(payload, (record) => {
    for (const key of ["comments", "comment_list"]) {
      const value = record[key];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const comment = item as Record<string, unknown>;

        const text =
          typeof comment.text === "string" ? comment.text :
          typeof comment.content === "string" ? comment.content : null;
        if (!text || text.length < 2) continue;

        const commentId = String(comment.cid ?? comment.comment_id ?? comment.id ?? `gen_${comments.length}`);
        if (seenIds.has(commentId)) continue;
        seenIds.add(commentId);

        const likeCount =
          typeof comment.digg_count === "number" ? comment.digg_count :
          typeof comment.like_count === "number" ? comment.like_count : 0;

        const replyCount =
          typeof comment.reply_comment_total === "number" ? comment.reply_comment_total :
          typeof comment.reply_count === "number" ? comment.reply_count : 0;

        const user = comment.user as Record<string, unknown> | undefined;
        const authorName =
          (user && typeof user.nickname === "string" ? user.nickname : null) ??
          (typeof comment.user_name === "string" ? comment.user_name : "匿名用户");

        const authorAvatar =
          (user && typeof user.avatar_thumb === "object" && user.avatar_thumb
            ? ((user.avatar_thumb as Record<string, unknown>).url_list as string[] | undefined)?.[0]
            : null) ??
          (user && typeof user.avatar === "string" ? user.avatar : undefined);

        const isAuthorReply =
          typeof comment.is_author_digged === "number" ? comment.is_author_digged === 1 :
          typeof comment.author_digg === "number" ? comment.author_digg === 1 : false;

        const createdAt =
          typeof comment.create_time === "number" ? comment.create_time :
          typeof comment.created_at === "number" ? comment.created_at : 0;

        comments.push({
          text,
          likeCount,
          authorName,
          authorAvatar: authorAvatar ?? undefined,
          replyCount,
          commentId,
          isAuthorReply,
          createdAt,
        });
      }
    }
  });

  return comments;
}

export async function fetchRealComments(
  workId: string,
  cursor: number | string = 0,
  count = 30,
  platformId = "douyin",
): Promise<{ comments: RawComment[]; hasMore: boolean }> {
  log.info(`Fetching comments for ${platformId} work ${workId}, cursor=${cursor}, count=${count}`);

  if (platformId === "xiaohongshu") {
    return fetchXiaohongshuComments(workId, String(cursor), count);
  }

  // 快手评论接口全部不可用（403/500），直接返回空结果
  if (platformId === "kuaishou") {
    log.info(`Kuaishou comments unavailable (all endpoints return 403/500), skipping`);
    return { comments: [], hasMore: false };
  }

  // 抵音评论：优先使用 web 版接口
  let resp = await getTikHub<Record<string, unknown>>(
    "/api/v1/douyin/web/fetch_video_comments",
    { aweme_id: workId, cursor: Number(cursor), count },
  );

  if (!resp.ok) {
    log.info(`Web API failed, falling back to app v3`);
    // 降级到 app v3 版
    resp = await getTikHub<Record<string, unknown>>(
      "/api/v1/douyin/app/v3/fetch_video_comments",
      { aweme_id: workId, cursor: Number(cursor), count },
    );
  }

  if (!resp.ok || !resp.payload) {
    log.warn(`Both APIs failed for work ${workId}`);
    return { comments: [], hasMore: false };
  }

  const comments = extractCommentsFromPayload(resp.payload);
  const hasMore = comments.length >= count;

  log.info(`Fetched ${comments.length} comments for work ${workId}`);
  return { comments, hasMore };
}

/** 小红书评论获取（L1: web_v2/fetch_note_comments，L2: web/get_note_comments） */
async function fetchXiaohongshuComments(
  noteId: string,
  cursor: string,
  count: number,
): Promise<{ comments: RawComment[]; hasMore: boolean }> {
  let resp: { ok: boolean; payload: unknown } | null = null;

  // L1: web_v2/fetch_note_comments
  try {
    const r = await getTikHub<Record<string, unknown>>(
      "/api/v1/xiaohongshu/web_v2/fetch_note_comments",
      { note_id: noteId, cursor: cursor || "", count },
    );
    if (r.ok) resp = r;
  } catch { /* fallthrough to L2 */ }

  // L2: web/get_note_comments
  if (!resp) {
    try {
      const r = await getTikHub<Record<string, unknown>>(
        "/api/v1/xiaohongshu/web/get_note_comments",
        { note_id: noteId, cursor: cursor || "", count },
      );
      if (r.ok) resp = r;
    } catch { /* both failed */ }
  }

  if (!resp || !resp.payload) {
    log.warn(`XHS comment APIs failed for note ${noteId}`);
    return { comments: [], hasMore: false };
  }

  // 小红书评论结构解析
  const comments = extractXhsCommentsFromPayload(resp.payload);
  const hasMore = comments.length >= count;

  log.info(`Fetched ${comments.length} XHS comments for note ${noteId}`);
  return { comments, hasMore };
}

/** 解析小红书评论 API 响应 */
function extractXhsCommentsFromPayload(payload: unknown): RawComment[] {
  const comments: RawComment[] = [];
  const seenIds = new Set<string>();

  if (!payload || typeof payload !== "object") return comments;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;
  const innerData = (data.data ?? data) as Record<string, unknown>;

  // 小红书评论在 comments 数组中
  const commentList = (innerData.comments ?? data.comments ?? []) as Array<Record<string, unknown>>;

  for (const item of commentList) {
    if (!item || typeof item !== "object") continue;

    const text = typeof item.content === "string" ? item.content
      : typeof item.text === "string" ? item.text : null;
    if (!text || text.length < 2) continue;

    const commentId = String(item.id ?? item.comment_id ?? `xhs_${comments.length}`);
    if (seenIds.has(commentId)) continue;
    seenIds.add(commentId);

    const likeCount = Number(item.like_count ?? item.likes ?? 0);

    // 子评论数
    const subComments = item.sub_comments ?? item.sub_comment_list;
    const replyCount = typeof item.sub_comment_count === "number" ? item.sub_comment_count
      : Array.isArray(subComments) ? subComments.length : 0;

    // 作者信息
    const userInfo = item.user_info as Record<string, unknown> | undefined;
    const authorName = userInfo
      ? String(userInfo.nickname ?? userInfo.name ?? "匿名用户")
      : String(item.user_nickname ?? "匿名用户");
    const authorAvatar = userInfo
      ? String(userInfo.image ?? userInfo.avatar ?? "")
      : undefined;

    // 时间戳
    const createdAt = typeof item.create_time === "number" ? item.create_time
      : typeof item.time === "number" ? item.time : 0;

    comments.push({
      text,
      likeCount,
      authorName,
      authorAvatar: authorAvatar || undefined,
      replyCount,
      commentId,
      isAuthorReply: false, // 小红书暂无此字段
      createdAt: createdAt > 1e12 ? Math.floor(createdAt / 1000) : createdAt,
    });
  }

  return comments;
}

// ─────────────────────────────────────────────
// 2. 持久化评论到数据库
// ─────────────────────────────────────────────

export async function persistComments(
  userId: string,
  platformId: string,
  workId: string,
  comments: RawComment[],
): Promise<number> {
  let persisted = 0;

  for (const c of comments) {
    try {
      const sentiment = classifySentiment(c.text);
      await execute(
        `INSERT INTO creator_work_comments
         (user_id, platform_id, work_id, comment_id, author_name, author_avatar,
          content, like_count, reply_count, sentiment, is_author_reply, created_at, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE
           like_count=VALUES(like_count),
           reply_count=VALUES(reply_count),
           synced_at=NOW()`,
        [
          userId,
          platformId,
          workId,
          c.commentId,
          c.authorName,
          c.authorAvatar ?? null,
          c.text,
          c.likeCount,
          c.replyCount,
          sentiment,
          c.isAuthorReply ? 1 : 0,
          c.createdAt > 0 ? new Date(c.createdAt * 1000) : null,
        ],
      );
      persisted++;
    } catch (err) {
      log.error({ err: err }, `Failed to persist comment ${c.commentId}`);
    }
  }

  log.info(`Persisted ${persisted}/${comments.length} comments for work ${workId}`);
  return persisted;
}

// ─────────────────────────────────────────────
// 3. 查询已缓存的评论
// ─────────────────────────────────────────────

export async function getCachedComments(
  workId: string,
  limit = 50,
  sortBy: "like_count" | "created_at" = "like_count",
  offset = 0,
): Promise<CommentItem[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_work_comments
     WHERE work_id=?
     ORDER BY ${sortBy} DESC
     LIMIT ? OFFSET ?`,
    [workId, limit, offset],
  );

  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.comment_id ?? row.id ?? ""),
      author: String(row.author_name ?? "匿名用户"),
      authorAvatar: row.author_avatar ? String(row.author_avatar) : undefined,
      content: String(row.content ?? ""),
      likes: Number(row.like_count ?? 0),
      replyCount: Number(row.reply_count ?? 0),
      sentiment: (row.sentiment as CommentItem["sentiment"]) ?? "neutral",
      isAuthorReply: Boolean(row.is_author_reply),
      createdAt: row.created_at
        ? formatTimeAgo(new Date(row.created_at as string))
        : "未知时间",
    };
  });
}

export async function getCachedCommentCount(workId: string): Promise<number> {
  const rows = await query<RowDataPacket[]>(
    `SELECT COUNT(*) as cnt FROM creator_work_comments WHERE work_id=?`,
    [workId],
  );
  return Number((rows[0] as Record<string, unknown>)?.cnt ?? 0);
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}

// ─────────────────────────────────────────────
// 4. 情感分类（规则引擎）
// ─────────────────────────────────────────────

const POS_WORDS = new Set([
  "好", "赞", "喜欢", "棒", "厉害", "美", "漂亮", "感谢", "爱", "心动",
  "收藏", "学到", "有用", "实用", "太棒", "不错", "很好", "超级", "完美",
  "牛", "绝了", "好看", "推荐", "种草", "入手", "回购", "惊艳", "宝藏",
  "神仙", "绝绝子", "yyds", "太强", "太赞", "太好", "优秀", "满分",
]);

const NEG_WORDS = new Set([
  "差", "丑", "垃圾", "难看", "假", "骗", "广告", "恶心", "无聊", "浪费",
  "失望", "坑", "烂", "难用", "退货", "翻车", "踩雷", "智商税", "割韭菜",
  "不行", "太差", "难吃", "后悔", "吐了", "尬", "无语",
]);

function classifySentiment(text: string): "positive" | "neutral" | "negative" {
  let pos = 0;
  let neg = 0;
  for (const word of POS_WORDS) {
    if (text.includes(word)) pos++;
  }
  for (const word of NEG_WORDS) {
    if (text.includes(word)) neg++;
  }
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

// ─────────────────────────────────────────────
// 5. AI 分析评论
// ─────────────────────────────────────────────

export async function analyzeComments(
  userId: string,
  workId: string,
  platformId: string,
  workTitle: string,
): Promise<CommentAnalysis> {
  // 获取评论
  const comments = await getCachedComments(workId, 100, "like_count");

  if (comments.length === 0) {
    return {
      totalComments: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      positiveRatio: 0,
      negativeRatio: 0,
      highFreqKeywords: [],
      demandSignals: [],
      sentimentSummary: "unknown",
      aiSummary: null,
    };
  }

  // 统计情感分布
  const positiveCount = comments.filter((c) => c.sentiment === "positive").length;
  const neutralCount = comments.filter((c) => c.sentiment === "neutral").length;
  const negativeCount = comments.filter((c) => c.sentiment === "negative").length;
  const total = comments.length;

  // 高频词提取
  const highFreqKeywords = extractHighFreqKeywords(comments.map((c) => c.content));

  // 需求信号提取
  const demandSignals = extractDemandSignals(comments.map((c) => c.content));

  // 情感总结
  const sentimentSummary = inferSentiment(positiveCount, negativeCount, total);

  // LLM 深度分析
  let aiSummary: string | null = null;
  try {
    aiSummary = await generateAICommentAnalysis(comments, workTitle);
  } catch (err) {
    log.error({ err: err }, "AI analysis failed");
    // 降级到规则摘要
    const posRatio = Math.round((positiveCount / total) * 100);
    const negRatio = Math.round((negativeCount / total) * 100);
    aiSummary = `评论区共 ${total} 条评论，正面占比 ${posRatio}%，负面占比 ${negRatio}%。` +
      (highFreqKeywords.length > 0 ? `高频关键词：${highFreqKeywords.slice(0, 5).join("、")}。` : "") +
      (demandSignals.length > 0 ? `用户需求信号：${demandSignals.slice(0, 3).join("、")}。` : "");
  }

  // 持久化分析结果
  try {
    await execute(
      `INSERT INTO creator_work_comment_analysis
       (user_id, work_id, platform_id, total_comments, positive_count, neutral_count, negative_count,
        high_freq_keywords, demand_signals, sentiment_summary, ai_summary, analyzed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         total_comments=VALUES(total_comments),
         positive_count=VALUES(positive_count),
         neutral_count=VALUES(neutral_count),
         negative_count=VALUES(negative_count),
         high_freq_keywords=VALUES(high_freq_keywords),
         demand_signals=VALUES(demand_signals),
         sentiment_summary=VALUES(sentiment_summary),
         ai_summary=VALUES(ai_summary),
         analyzed_at=NOW()`,
      [
        userId,
        workId,
        platformId,
        total,
        positiveCount,
        neutralCount,
        negativeCount,
        JSON.stringify(highFreqKeywords),
        JSON.stringify(demandSignals),
        sentimentSummary,
        aiSummary,
      ],
    );
  } catch (err) {
    log.error({ err: err }, "Failed to persist analysis");
  }

  return {
    totalComments: total,
    positiveCount,
    neutralCount,
    negativeCount,
    positiveRatio: Math.round((positiveCount / total) * 100),
    negativeRatio: Math.round((negativeCount / total) * 100),
    highFreqKeywords,
    demandSignals,
    sentimentSummary,
    aiSummary,
  };
}

// ─────────────────────────────────────────────
// 6. LLM 深度分析
// ─────────────────────────────────────────────

async function generateAICommentAnalysis(
  comments: CommentItem[],
  workTitle: string,
): Promise<string> {
  // 取点赞最高的前 20 条评论
  const topComments = comments
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 20)
    .map((c, i) => `${i + 1}. [${c.sentiment}] ${c.author}: ${c.content} (${c.likes}赞)`)
    .join("\n");

  const positiveCount = comments.filter((c) => c.sentiment === "positive").length;
  const negativeCount = comments.filter((c) => c.sentiment === "negative").length;
  const total = comments.length;

  const result = await callLLM({
    messages: [
      {
        role: "system",
        content: `你是一位资深的社交媒体评论分析专家。请根据评论数据，输出一段 150-200 字的深度分析报告。

分析维度：
1. **整体情绪**：正面/负面/中性占比，评论区氛围
2. **核心话题**：用户最关注的 3-5 个话题点
3. **需求洞察**：用户表达的购买意向、学习需求或改进建议
4. **运营建议**：基于评论数据，给创作者 2-3 条具体可执行的建议

语言风格：专业但不晦涩，用数据说话，给出明确的行动指引。不要用"建议先验证"这类模糊表达。`,
      },
      {
        role: "user",
        content: `作品《${workTitle}》的评论分析：
- 总评论数：${total}
- 正面评论：${positiveCount} (${Math.round((positiveCount / total) * 100)}%)
- 负面评论：${negativeCount} (${Math.round((negativeCount / total) * 100)}%)

热门评论（按点赞排序）：
${topComments}

请输出深度分析报告。`,
      },
    ],
    modelId: "doubao" as const,
    temperature: 0.4,
    maxTokens: 500,
  });

  return result.content.trim();
}

// ─────────────────────────────────────────────
// 7. 高频词和需求信号提取
// ─────────────────────────────────────────────

function extractHighFreqKeywords(texts: string[]): string[] {
  if (texts.length === 0) return [];
  const freq = new Map<string, number>();
  const stopWords = new Set([
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "这", "那", "啥", "啊", "呢", "吧", "嘛", "哈哈",
    "哈", "嘿嘿", "老师", "谢谢", "可以", "什么", "怎么", "这个", "那个", "觉得",
  ]);

  for (const text of texts) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= text.length - len; i++) {
        const word = text.slice(i, i + len);
        if (!/^[\u4e00-\u9fff]+$/.test(word)) continue;
        if (stopWords.has(word)) continue;
        freq.set(word, (freq.get(word) || 0) + 1);
      }
    }
  }

  const sorted = [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  const result: string[] = [];
  for (const [word] of sorted) {
    if (result.length >= 8) break;
    if (result.some((existing) => existing.includes(word) || word.includes(existing))) continue;
    result.push(word);
  }
  return result;
}

function extractDemandSignals(texts: string[]): string[] {
  const demandPatterns = [
    /怎么.{1,10}/, /求.{1,10}/, /在哪.{0,10}/, /多少钱.{0,10}/,
    /哪里.{0,10}/, /推荐.{0,10}/, /教程.{0,10}/, /新手.{0,10}/,
    /入门.{0,10}/, /想试.{0,10}/, /想买.{0,10}/, /想学.{0,10}/,
    /可以吗.{0,10}/, /链接.{0,10}/, /同款.{0,10}/, /价格.{0,10}/,
  ];

  const signals: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const pattern of demandPatterns) {
      const match = text.match(pattern);
      if (match) {
        const signal = match[0].slice(0, 20);
        if (!seen.has(signal)) {
          seen.add(signal);
          signals.push(signal);
        }
      }
    }
    if (signals.length >= 6) break;
  }
  return signals;
}

function inferSentiment(
  positiveCount: number,
  negativeCount: number,
  total: number,
): "positive" | "mixed" | "negative" | "unknown" {
  if (total === 0) return "unknown";
  if (positiveCount > negativeCount * 2) return "positive";
  if (negativeCount > positiveCount * 2) return "negative";
  if (positiveCount > 0 || negativeCount > 0) return "mixed";
  return "unknown";
}

// ─────────────────────────────────────────────
// 8. 获取已缓存的分析结果
// ─────────────────────────────────────────────

export async function getCachedAnalysis(
  workId: string,
): Promise<CommentAnalysis | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_work_comment_analysis WHERE work_id=? LIMIT 1`,
    [workId],
  );

  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  const parseJson = <T>(val: unknown, fallback: T): T => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "object") return val as T;
    if (typeof val === "string") {
      try { return JSON.parse(val) as T; } catch { return fallback; }
    }
    return fallback;
  };

  const total = Number(row.total_comments ?? 0);
  const positiveCount = Number(row.positive_count ?? 0);
  const negativeCount = Number(row.negative_count ?? 0);

  return {
    totalComments: total,
    positiveCount,
    neutralCount: Number(row.neutral_count ?? 0),
    negativeCount,
    positiveRatio: total > 0 ? Math.round((positiveCount / total) * 100) : 0,
    negativeRatio: total > 0 ? Math.round((negativeCount / total) * 100) : 0,
    highFreqKeywords: parseJson<string[]>(row.high_freq_keywords, []),
    demandSignals: parseJson<string[]>(row.demand_signals, []),
    sentimentSummary: (row.sentiment_summary as CommentAnalysis["sentimentSummary"]) ?? "unknown",
    aiSummary: row.ai_summary ? String(row.ai_summary) : null,
  };
}
