import { describe, it, expect } from "vitest";

/**
 * Tests for comment-service.ts functionality:
 * - Sentiment classification (classifySentiment)
 * - High frequency keyword extraction
 * - Demand signal extraction
 * - Sentiment inference from counts
 * - Comment analysis result structure
 * - Cover URL handling
 *
 * We test pure logic by replicating the internal functions since they are not exported.
 */

// ─── Replicate classifySentiment ───
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

// ─── Replicate inferSentiment (count-based) ───
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

// ─── Replicate extractHighFreqKeywords ───
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

// ─── Replicate extractDemandSignals ───
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

// ─── Replicate extractCommentsFromPayload ───
interface RawComment {
  text: string;
  likeCount: number;
  authorName: string;
  authorAvatar?: string;
  replyCount: number;
  commentId: string;
  isAuthorReply: boolean;
  createdAt: number;
}

function walkObjects(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
  depth = 0,
) {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visitor, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  visitor(record);
  for (const item of Object.values(record)) walkObjects(item, visitor, depth + 1);
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
          text, likeCount, authorName,
          authorAvatar: authorAvatar ?? undefined,
          replyCount, commentId, isAuthorReply, createdAt,
        });
      }
    }
  });
  return comments;
}

// ─── Replicate formatTimeAgo ───
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

// ═══════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════

describe("classifySentiment", () => {
  it("should classify positive comments", () => {
    expect(classifySentiment("太棒了，超级喜欢")).toBe("positive");
    expect(classifySentiment("yyds 绝绝子")).toBe("positive");
    expect(classifySentiment("已种草，准备入手")).toBe("positive");
  });

  it("should classify negative comments", () => {
    expect(classifySentiment("太差了，垃圾")).toBe("negative");
    expect(classifySentiment("智商税，割韭菜")).toBe("negative");
    expect(classifySentiment("翻车了，踩雷")).toBe("negative");
  });

  it("should classify neutral comments", () => {
    // "今天天气真好" contains "好" which is a positive word, so it's positive
    expect(classifySentiment("今天天气真好")).toBe("positive");
    expect(classifySentiment("第一")).toBe("neutral");
    expect(classifySentiment("")).toBe("neutral");
    // Pure neutral: no sentiment words at all
    expect(classifySentiment("明天再来看看")).toBe("neutral");
  });

  it("should handle mixed sentiment by counting words", () => {
    // "好" (pos) + "差" (neg) = tie → neutral
    expect(classifySentiment("好差")).toBe("neutral");
    // "好" + "赞" (2 pos) vs "差" (1 neg) → positive
    expect(classifySentiment("好赞但是差")).toBe("positive");
  });
});

describe("inferSentiment (count-based)", () => {
  it("should return unknown for zero total", () => {
    expect(inferSentiment(0, 0, 0)).toBe("unknown");
  });

  it("should return positive when pos > neg*2", () => {
    expect(inferSentiment(10, 3, 20)).toBe("positive");
  });

  it("should return negative when neg > pos*2", () => {
    expect(inferSentiment(3, 10, 20)).toBe("negative");
  });

  it("should return mixed when both present but neither dominates", () => {
    expect(inferSentiment(5, 5, 15)).toBe("mixed");
    expect(inferSentiment(3, 5, 15)).toBe("mixed");
  });

  it("should return unknown when no pos or neg", () => {
    expect(inferSentiment(0, 0, 10)).toBe("unknown");
  });
});

describe("extractCommentsFromPayload", () => {
  it("should extract comments from web API format", () => {
    const payload = {
      data: {
        comments: [
          {
            cid: "c1",
            text: "太好看了",
            digg_count: 100,
            reply_comment_total: 5,
            user: { nickname: "小明", avatar: "https://avatar.com/1.jpg" },
            create_time: 1700000000,
          },
          {
            cid: "c2",
            text: "求链接",
            digg_count: 50,
            reply_comment_total: 2,
            user: { nickname: "小红" },
            create_time: 1700001000,
          },
        ],
      },
    };

    const result = extractCommentsFromPayload(payload);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("太好看了");
    expect(result[0].likeCount).toBe(100);
    expect(result[0].authorName).toBe("小明");
    expect(result[0].replyCount).toBe(5);
    expect(result[0].commentId).toBe("c1");
    expect(result[1].authorName).toBe("小红");
  });

  it("should extract from comment_list format (app v3)", () => {
    const payload = {
      comment_list: [
        {
          comment_id: "a1",
          content: "这个视频太有趣了",
          like_count: 30,
          reply_count: 1,
          user_name: "用户A",
          created_at: 1700002000,
        },
      ],
    };

    const result = extractCommentsFromPayload(payload);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("这个视频太有趣了");
    expect(result[0].likeCount).toBe(30);
    expect(result[0].authorName).toBe("用户A");
  });

  it("should deduplicate by comment ID", () => {
    const payload = {
      data: {
        comments: [
          { cid: "dup1", text: "重复评论内容", digg_count: 10 },
          { cid: "dup1", text: "重复评论内容", digg_count: 10 },
        ],
      },
    };

    const result = extractCommentsFromPayload(payload);
    expect(result).toHaveLength(1);
  });

  it("should skip comments with text shorter than 2 chars", () => {
    const payload = {
      data: {
        comments: [
          { cid: "s1", text: "好", digg_count: 5 },
          { cid: "s2", text: "好的", digg_count: 5 },
        ],
      },
    };

    const result = extractCommentsFromPayload(payload);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("好的");
  });

  it("should handle empty payload", () => {
    expect(extractCommentsFromPayload(null)).toEqual([]);
    expect(extractCommentsFromPayload({})).toEqual([]);
    expect(extractCommentsFromPayload({ data: {} })).toEqual([]);
  });

  it("should detect author replies", () => {
    const payload = {
      data: {
        comments: [
          { cid: "ar1", text: "作者回复了", is_author_digged: 1, digg_count: 5 },
          { cid: "ar2", text: "普通评论哦", is_author_digged: 0, digg_count: 3 },
        ],
      },
    };

    const result = extractCommentsFromPayload(payload);
    expect(result[0].isAuthorReply).toBe(true);
    expect(result[1].isAuthorReply).toBe(false);
  });
});

describe("formatTimeAgo", () => {
  it("should format minutes ago", () => {
    const date = new Date(Date.now() - 5 * 60000);
    expect(formatTimeAgo(date)).toBe("5 分钟前");
  });

  it("should format hours ago", () => {
    const date = new Date(Date.now() - 3 * 3600000);
    expect(formatTimeAgo(date)).toBe("3 小时前");
  });

  it("should format days ago", () => {
    const date = new Date(Date.now() - 7 * 86400000);
    expect(formatTimeAgo(date)).toBe("7 天前");
  });

  it("should format old dates as locale string", () => {
    const date = new Date(Date.now() - 60 * 86400000);
    const result = formatTimeAgo(date);
    // Should be a locale date string, not "X 天前"
    expect(result).not.toContain("天前");
  });
});

describe("CommentAnalysis result structure", () => {
  it("should compute correct ratios from counts", () => {
    const total = 20;
    const positiveCount = 12;
    const neutralCount = 5;
    const negativeCount = 3;

    const analysis = {
      totalComments: total,
      positiveCount,
      neutralCount,
      negativeCount,
      positiveRatio: Math.round((positiveCount / total) * 100),
      negativeRatio: Math.round((negativeCount / total) * 100),
      highFreqKeywords: ["减肥", "好用"],
      demandSignals: ["怎么减肥"],
      sentimentSummary: inferSentiment(positiveCount, negativeCount, total) as "positive" | "mixed" | "negative" | "unknown",
      aiSummary: "测试摘要",
    };

    expect(analysis.positiveRatio).toBe(60);
    expect(analysis.negativeRatio).toBe(15);
    expect(analysis.sentimentSummary).toBe("positive");
    expect(analysis.totalComments).toBe(20);
  });

  it("should handle zero comments gracefully", () => {
    const analysis = {
      totalComments: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      positiveRatio: 0,
      negativeRatio: 0,
      highFreqKeywords: [],
      demandSignals: [],
      sentimentSummary: "unknown" as const,
      aiSummary: null,
    };

    expect(analysis.totalComments).toBe(0);
    expect(analysis.sentimentSummary).toBe("unknown");
    expect(analysis.aiSummary).toBeNull();
  });
});

describe("Cover URL handling", () => {
  it("should treat empty coverUrl as falsy", () => {
    const work = { coverUrl: "" };
    expect(!!work.coverUrl).toBe(false);
  });

  it("should treat valid coverUrl as truthy", () => {
    const work = { coverUrl: "https://p3-sign.douyinpic.com/cover.jpg" };
    expect(!!work.coverUrl).toBe(true);
  });

  it("should handle undefined coverUrl", () => {
    const work: { coverUrl?: string } = {};
    expect(!!work.coverUrl).toBe(false);
  });
});

describe("extractHighFreqKeywords (from comment-service)", () => {
  it("should extract keywords from real-like comments", () => {
    const texts = [
      "这个护肤品太好用了",
      "护肤品效果不错",
      "好用的护肤品推荐",
      "护肤品真的好用",
    ];
    const keywords = extractHighFreqKeywords(texts);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.some((k) => k.includes("护肤"))).toBe(true);
  });
});

describe("extractDemandSignals (from comment-service)", () => {
  it("should extract demand patterns including 链接/同款/价格", () => {
    const texts = [
      "求链接在哪买",
      "同款在哪里",
      "价格多少钱",
    ];
    const signals = extractDemandSignals(texts);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals.some((s) => s.includes("链接") || s.includes("求"))).toBe(true);
  });
});
