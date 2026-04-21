/**
 * comment-collector.ts
 * ═══════════════════════════════════════════════════════════════
 * 从 live-predictions.ts 拆分出的评论采集和分析模块。
 * 包含评论二次采集、高频词提取、需求信号提取、情感分析。
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("CommentCollector");
import type {
  PredictionCommentHighlight,
  PredictionCommentInsight,
} from "../../client/src/app/store/prediction-types.js";
import { getTikHub } from "./tikhub.js";
import { walkObjects } from "./prediction-helpers.js";
import type { ExtractedContent } from "./prediction-helpers.js";

/* ── Types ── */

export interface ExtractedComment {
  text: string;
  likeCount: number;
  authorName: string;
}

/* ── Comment Extraction ── */

export function extractCommentsFromPayload(payload: unknown): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
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
        const likeCount =
          typeof comment.digg_count === "number" ? comment.digg_count :
          typeof comment.like_count === "number" ? comment.like_count : 0;
        const user = comment.user as Record<string, unknown> | undefined;
        const authorName =
          (user && typeof user.nickname === "string" ? user.nickname : null) ??
          (typeof comment.user_name === "string" ? comment.user_name : "匿名用户");
        comments.push({ text, likeCount, authorName });
      }
    }
  });
  return comments;
}

/* ── NLP Utilities ── */

export function extractHighFreqKeywords(texts: string[]): string[] {
  if (texts.length === 0) return [];
  const freq = new Map<string, number>();
  const stopWords = new Set(["的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "这", "那", "啥", "啊", "呢", "吧", "嘛", "哈哈", "哈", "嘿嘿", "老师", "谢谢", "可以", "什么", "怎么", "这个", "那个", "觉得"]);
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

export function extractDemandSignals(texts: string[]): string[] {
  const demandPatterns = [
    /怎么.{1,10}/,
    /求.{1,10}/,
    /在哪.{0,10}/,
    /多少钱.{0,10}/,
    /哪里.{0,10}/,
    /推荐.{0,10}/,
    /教程.{0,10}/,
    /新手.{0,10}/,
    /入门.{0,10}/,
    /怕.{0,10}/,
    /担心.{0,10}/,
    /心动.{0,10}/,
    /想试.{0,10}/,
    /想买.{0,10}/,
    /想学.{0,10}/,
    /可以吗.{0,10}/,
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

export function inferSentiment(texts: string[]): "positive" | "mixed" | "negative" | "unknown" {
  if (texts.length === 0) return "unknown";
  let positive = 0;
  let negative = 0;
  const posWords = ["好", "赞", "喜欢", "棒", "厉害", "美", "漂亮", "感谢", "爱", "心动", "收藏", "学到", "有用", "实用", "太棒", "不错", "很好", "超级", "完美"];
  const negWords = ["差", "丑", "垃圾", "难看", "假", "骗", "广告", "恶心", "无聊", "浪费", "失望"];
  for (const text of texts) {
    if (posWords.some((w) => text.includes(w))) positive++;
    if (negWords.some((w) => text.includes(w))) negative++;
  }
  if (positive > negative * 2) return "positive";
  if (negative > positive * 2) return "negative";
  if (positive > 0 || negative > 0) return "mixed";
  return "unknown";
}

/* ── Main Comment Collection ── */

/**
 * 评论二次采集：从搜索结果中提取内容ID，并行调用 TikHub 评论接口
 * 支持抖音和小红书双平台，最多采集前 5 个内容的评论，每个最多 20 条
 */
export async function fetchCommentInsight(
  contents: ExtractedContent[],
  existingCommentCount: number,
): Promise<PredictionCommentInsight | null> {
  if (existingCommentCount > 0) return null;

  const douyinContents = contents.filter(
    (c) => c.contentId && c.platform === "抖音" && !c.contentId.startsWith("note_"),
  ).slice(0, 5);
  const xhsContents = contents.filter(
    (c) => c.contentId && c.platform === "小红书",
  ).slice(0, 5);
  const kuaishouContents = contents.filter(
    (c) => c.contentId && c.platform === "快手",
  );
  if (kuaishouContents.length > 0) {
    log.info(`快手平台评论接口不可用，跳过 ${kuaishouContents.length} 个快手内容的评论采集`);
  }

  const allTargets = [
    ...douyinContents.map((c) => ({ ...c, _platform: "douyin" as const })),
    ...xhsContents.map((c) => ({ ...c, _platform: "xiaohongshu" as const })),
  ].slice(0, 8);

  if (allTargets.length === 0) return null;

  log.info(`评论二次采集：尝试采集 ${allTargets.length} 个内容的评论（抖音:${douyinContents.length} 小红书:${xhsContents.length}）`);

  const highlights: PredictionCommentHighlight[] = [];
  const allCommentTexts: string[] = [];
  let totalCollected = 0;

  const results = await Promise.allSettled(
    allTargets.map(async (content) => {
      try {
        let comments: ExtractedComment[] = [];

        if (content._platform === "douyin") {
          let resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/web/fetch_video_comments",
            { aweme_id: content.contentId, cursor: 0, count: 20 },
          );
          if (!resp.ok) {
            resp = await getTikHub<Record<string, unknown>>(
              "/api/v1/douyin/app/v3/fetch_video_comments",
              { aweme_id: content.contentId, cursor: 0, count: 20 },
            );
          }
          if (resp.ok && resp.payload) {
            comments = extractCommentsFromPayload(resp.payload);
          }
        } else {
          let resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/xiaohongshu/web_v2/fetch_note_comments",
            { note_id: content.contentId, cursor: "", count: 20 },
          );
          if (!resp.ok) {
            resp = await getTikHub<Record<string, unknown>>(
              "/api/v1/xiaohongshu/web/get_note_comments",
              { note_id: content.contentId, cursor: "", count: 20 },
            );
          }
          if (resp.ok && resp.payload) {
            comments = extractCommentsFromPayload(resp.payload);
          }
        }

        if (comments.length === 0) return null;

        return {
          contentId: content.contentId,
          contentTitle: content.title.slice(0, 40),
          comments,
          totalCount: comments.length,
        };
      } catch (err) {
        log.warn({ err: err }, `评论采集失败 (${content._platform}:${content.contentId})`);
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const { contentId, contentTitle, comments, totalCount } = result.value;
      totalCollected += totalCount;
      const topComments = comments
        .sort((a, b) => b.likeCount - a.likeCount)
        .slice(0, 3)
        .map((c) => ({ text: c.text, likeCount: c.likeCount, authorName: c.authorName }));
      highlights.push({
        contentId,
        contentTitle,
        topComments,
        totalCommentCount: totalCount,
      });
      allCommentTexts.push(...comments.map((c) => c.text));
    }
  }

  if (totalCollected === 0) return null;

  const highFreqKeywords = extractHighFreqKeywords(allCommentTexts);
  const demandSignals = extractDemandSignals(allCommentTexts);
  const sentimentSummary = inferSentiment(allCommentTexts);

  log.info(`评论采集完成：${totalCollected} 条评论，${highlights.length} 个内容，高频词: [${highFreqKeywords.join(", ")}]`);

  return {
    totalCommentsCollected: totalCollected,
    highFreqKeywords,
    sentimentSummary,
    demandSignals,
    highlights,
  };
}
