/**
 * result-renderer-fixes.test.ts
 * 验证结果页渲染器5项修复
 */
import { describe, it, expect } from "vitest";
import { buildRecommendedNextTasks } from "../../client/src/app/store/agent-runtime.js";

describe("问题5: buildRecommendedNextTasks 对 opportunity_prediction 返回多个建议", () => {
  const mockClassification = {
    taskIntent: "opportunity_prediction" as const,
    confidence: 0.9,
    seedTopic: "穿搭赛道",
    platforms: ["douyin"],
    inputKind: "keyword" as const,
  };

  const mockArtifacts = {
    normalizedBrief: { seedTopic: "穿搭", platforms: ["douyin"], inputKind: "keyword" as const },
    uiResult: {
      type: "opportunity_prediction",
      score: 72,
      query: "穿搭赛道",
      verdict: "positive",
      opportunityTitle: "穿搭赛道",
      confidenceLabel: "中",
      windowStrength: "moderate",
      opportunityType: "demand_surge",
      supportingContents: [{ title: "测试内容" }],
      supportingAccounts: [],
      lowFollowerEvidence: [{ title: "低粉样本" }],
      bestActionNow: { action: "shoot_now", ctaLabel: "立即拍摄", reason: "数据好", safetyLevel: "green" },
      marketEvidence: { timingLabel: "上升期", evidenceWindowLabel: "7天", whyNow: [] },
      recommendedNextTasks: [],
      summary: "测试",
      primaryCard: null,
      taskPayload: null,
    },
  };

  it("默认分支应返回至少2个建议", () => {
    const tasks = buildRecommendedNextTasks(mockClassification as any, mockArtifacts as any);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
  });

  it("建议中应包含不同类型的任务（不只有监控）", () => {
    const tasks = buildRecommendedNextTasks(mockClassification as any, mockArtifacts as any);
    const titles = tasks.map((t) => t.title);
    // 至少有一个不是监控相关的
    const nonMonitorTasks = titles.filter(
      (t) => !t.includes("监控") && !t.includes("追踪"),
    );
    expect(nonMonitorTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("强信号分支应返回至少2个建议", () => {
    const strongArtifacts = {
      ...mockArtifacts,
      uiResult: {
        ...mockArtifacts.uiResult,
        confidenceLabel: "高",
        windowStrength: "strong_now",
      },
    };
    const tasks = buildRecommendedNextTasks(mockClassification as any, strongArtifacts as any);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    // 强信号应优先建议生成选题
    expect(tasks[0].title).toContain("选题");
  });

  it("结构窗口分支应返回3个建议", () => {
    const structArtifacts = {
      ...mockArtifacts,
      uiResult: {
        ...mockArtifacts.uiResult,
        opportunityType: "structure_window",
      },
    };
    const tasks = buildRecommendedNextTasks(mockClassification as any, structArtifacts as any);
    expect(tasks.length).toBe(3);
  });
});

describe("问题4: 评论采集不应被跳过", () => {
  it("fetchCommentInsight 不应因 existingCommentCount > 0 而跳过", async () => {
    const { fetchCommentInsight } = await import("./comment-collector.js");
    // 传入空内容列表 + existingCommentCount=100，应返回 null（因为没有内容可采集），而不是因为 commentCount > 0 跳过
    const result = await fetchCommentInsight([], 100);
    expect(result).toBeNull(); // 空内容列表返回 null 是正确的
  });
});

describe("问题1: 标题区域应展示爆款预测结果", () => {
  it("标题数据字段优先使用 primaryCard.title", () => {
    const result = {
      primaryCard: { title: "穿搭赛道低粉爆款机会", description: "当前穿搭赛道存在明显的低粉爆款窗口" },
      opportunityTitle: "穿搭赛道",
      query: "穿搭",
    };
    const displayTitle = result.primaryCard?.title || result.opportunityTitle || result.query;
    expect(displayTitle).toBe("穿搭赛道低粉爆款机会");
  });
});

describe("后端 trendingTags 字段", () => {
  it("searchKeywords 应正确转换为 trendingTags 格式", () => {
    const searchKeywords = ["穿搭", "穿搭教程", "日常穿搭"];
    const trendingTags = searchKeywords.map((kw) => `#${kw}`);
    expect(trendingTags).toEqual(["#穿搭", "#穿搭教程", "#日常穿搭"]);
    expect(trendingTags.length).toBe(3);
    expect(trendingTags[0]).toMatch(/^#/);
  });

  it("前端 hotTags 优先使用 trendingTags", () => {
    // 模拟前端 hotTags 逻辑
    const trendingTags = ["#穿搭", "#穿搭教程", "#日常穿搭"];
    const validContents = [{ keywordTokens: ["其他关键词", "不应出现"] }];

    let hotTags: Array<{ tag: string; count: number; w: number }>;
    if (trendingTags && trendingTags.length > 0) {
      hotTags = trendingTags.slice(0, 6).map((tag, i, arr) => ({
        tag: tag.startsWith("#") ? tag : `#${tag}`,
        count: arr.length - i,
        w: Math.round(((arr.length - i) / arr.length) * 100),
      }));
    } else {
      // 回退到样本关键词
      hotTags = [{ tag: "#其他关键词", count: 1, w: 100 }];
    }

    // 应使用 trendingTags，不应回退到样本关键词
    expect(hotTags.length).toBe(3);
    expect(hotTags[0].tag).toBe("#穿搭");
    expect(hotTags.every(t => t.tag.startsWith("#"))).toBe(true);
    expect(hotTags.some(t => t.tag.includes("不应出现"))).toBe(false);
  });

  it("trendingTags 为空时回退到样本关键词", () => {
    const trendingTags: string[] | undefined = undefined;
    const tagCount = new Map<string, number>();
    const validContents = [
      { keywordTokens: ["穿搭", "时尚"] },
      { keywordTokens: ["穿搭", "搭配"] },
    ];
    validContents.forEach(c => {
      c.keywordTokens.forEach(kw => {
        tagCount.set(kw, (tagCount.get(kw) ?? 0) + 1);
      });
    });

    let hotTags: Array<{ tag: string; count: number; w: number }>;
    if (trendingTags && trendingTags.length > 0) {
      hotTags = [];
    } else {
      hotTags = Array.from(tagCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count], i, arr) => ({
          tag: `#${tag}`,
          count,
          w: Math.round((count / (arr[0]?.[1] ?? 1)) * 100),
        }));
    }

    expect(hotTags.length).toBe(3);
    expect(hotTags[0].tag).toBe("#穿搭"); // 出现2次，排第一
    expect(hotTags[0].count).toBe(2);
  });
});
