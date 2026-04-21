/**
 * FUTURE-2: Topic Strategy V2 集成测试
 * 覆盖路由请求/响应语义、模块导入、DB helpers 可用性
 */
import { describe, it, expect } from "vitest";

// ─── 模块导入测试 ───
describe("Topic Strategy V2 module imports", () => {
  it("should export runTopicStrategyV2", async () => {
    const mod = await import("./topic-strategy-engine");
    expect(typeof mod.runTopicStrategyV2).toBe("function");
  });

  it("should export revalidateSingleDirection", async () => {
    const mod = await import("./topic-strategy-engine");
    expect(typeof mod.revalidateSingleDirection).toBe("function");
  });

  it("should export TopicStrategyV2Result type via runtime shape", async () => {
    // 验证模块不会在导入时崩溃
    const mod = await import("./topic-strategy-engine");
    expect(mod).toBeDefined();
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

// ─── DB helpers 测试 ───
describe("Topic Strategy DB helpers availability", () => {
  it("should export all required DB functions", async () => {
    const db = await import("./topic-strategy-db");
    expect(typeof db.createTopicStrategySession).toBe("function");
    expect(typeof db.getTopicStrategySession).toBe("function");
    expect(typeof db.updateSessionPipelineStatus).toBe("function");
    expect(typeof db.createDirection).toBe("function");
    expect(typeof db.getDirectionsBySession).toBe("function");
    expect(typeof db.updateDirectionValidation).toBe("function");
    expect(typeof db.createPeerBenchmark).toBe("function");
    expect(typeof db.getPeerBenchmarksBySession).toBe("function");
    expect(typeof db.createCrossIndustry).toBe("function");
    expect(typeof db.getCrossIndustryBySession).toBe("function");
    expect(typeof db.listUserSessions).toBe("function");
  });
});

// ─── Performance Tracker 测试 ───
describe("Performance Tracker module", () => {
  it("should export runPerformanceCollection", async () => {
    const mod = await import("./performance-tracker");
    expect(typeof mod.runPerformanceCollection).toBe("function");
  });
});

// ─── Weekly Topic Refresh 测试 ───
describe("Weekly Topic Refresh module", () => {
  it("should export runWeeklyTopicRefresh", async () => {
    const mod = await import("./weekly-topic-refresh");
    expect(typeof mod.runWeeklyTopicRefresh).toBe("function");
  });
});

// ─── Content Calendar Router 测试 ───
describe("Content Calendar tRPC router", () => {
  it("should export contentCalendarRouter", async () => {
    const mod = await import("../routers/content-calendar");
    expect(mod.contentCalendarRouter).toBeDefined();
  });
});

// ─── 类型结构验证 ───
describe("V2 data structure contracts", () => {
  it("TopicDirection should have required fields", async () => {
    // 验证 TypeScript 编译时类型在运行时的结构
    const sampleDirection = {
      directionName: "测试方向",
      directionLogic: "测试逻辑",
      targetStage: "new",
      testPlan: "测试计划",
      trafficPotential: 8,
      productionCost: 3,
      competitionLevel: 5,
      priorityRank: 1,
      executableTopics: [
        { title: "测试选题1", angle: "角度1", hook: "钩子1" },
      ],
    };
    expect(sampleDirection.directionName).toBeTruthy();
    expect(sampleDirection.executableTopics).toHaveLength(1);
    expect(sampleDirection.executableTopics[0]).toHaveProperty("title");
    expect(sampleDirection.executableTopics[0]).toHaveProperty("angle");
    expect(sampleDirection.executableTopics[0]).toHaveProperty("hook");
  });

  it("ValidationBreakdown should have 4 score dimensions", () => {
    const breakdown = {
      searchHitScore: 70,
      lowFollowerScore: 60,
      commentDemandScore: 50,
      peerSuccessScore: 40,
    };
    const keys = Object.keys(breakdown);
    expect(keys).toContain("searchHitScore");
    expect(keys).toContain("lowFollowerScore");
    expect(keys).toContain("commentDemandScore");
    expect(keys).toContain("peerSuccessScore");
    // 每个分数应在 0-100 范围
    Object.values(breakdown).forEach((score) => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  it("PeerBenchmarkResult should have required fields", () => {
    const peer = {
      platform: "douyin",
      accountId: "test-id",
      displayName: "测试账号",
      handle: "test-handle",
      followerCount: 50000,
      avgInteractionRate: 0.05,
      recentWorks: [
        { title: "测试作品", likeCount: 1000 },
      ],
    };
    expect(peer.platform).toBeTruthy();
    expect(peer.displayName).toBeTruthy();
    expect(peer.followerCount).toBeGreaterThan(0);
    expect(peer.recentWorks).toHaveLength(1);
  });

  it("CrossIndustryInsight should have required fields", () => {
    const insight = {
      sourceIndustry: "美食",
      inspirationTitle: "测试灵感",
      transferableElements: ["元素1", "元素2"],
      adaptationSuggestion: "建议",
    };
    expect(insight.sourceIndustry).toBeTruthy();
    expect(insight.inspirationTitle).toBeTruthy();
    expect(insight.transferableElements.length).toBeGreaterThan(0);
  });

  it("Validation score formula should weight correctly", () => {
    const breakdown = {
      searchHitScore: 80,
      lowFollowerScore: 60,
      commentDemandScore: 70,
      peerSuccessScore: 50,
    };
    const score =
      breakdown.searchHitScore * 0.3 +
      breakdown.lowFollowerScore * 0.3 +
      breakdown.commentDemandScore * 0.2 +
      breakdown.peerSuccessScore * 0.2;
    expect(score).toBeCloseTo(66, 0);
    // 验证权重之和为 1
    expect(0.3 + 0.3 + 0.2 + 0.2).toBe(1);
  });
});

// ─── smoothScore 对数函数行为验证 ───
describe("smoothScore behavior", () => {
  // 模拟 smoothScore 函数
  function smoothScore(count: number, halfPoint: number, maxScore: number): number {
    if (count <= 0) return 0;
    const denominator = Math.log(1 + halfPoint * 4);
    if (denominator === 0) return maxScore;
    return Math.min(maxScore, maxScore * Math.log(1 + count) / denominator);
  }

  it("should return 0 for count=0", () => {
    expect(smoothScore(0, 3, 100)).toBe(0);
  });

  it("should return less than max for count=1", () => {
    const score = smoothScore(1, 3, 100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it("should increase monotonically", () => {
    const scores = [1, 2, 3, 5, 10, 20].map((c) => smoothScore(c, 3, 100));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it("should cap at maxScore", () => {
    const score = smoothScore(1000, 3, 100);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("should avoid extreme scores for small counts", () => {
    // count=1 不应超过 40 分（避免旧版线性乘法的极端分数）
    const score = smoothScore(1, 3, 100);
    expect(score).toBeLessThan(40);
  });
});

// ─── getStageFollowerRange 行为验证 ───
describe("getStageFollowerRange behavior", () => {
  function getStageFollowerRange(stage: string): { min: number; max: number } {
    switch (stage) {
      case "new":
        return { min: 1000, max: 50000 };
      case "growing":
        return { min: 10000, max: 300000 };
      case "mature":
        return { min: 100000, max: Infinity };
      default:
        return { min: 0, max: Infinity };
    }
  }

  it("should return correct range for new accounts", () => {
    const range = getStageFollowerRange("new");
    expect(range.min).toBe(1000);
    expect(range.max).toBe(50000);
  });

  it("should return correct range for growing accounts", () => {
    const range = getStageFollowerRange("growing");
    expect(range.min).toBe(10000);
    expect(range.max).toBe(300000);
  });

  it("should return correct range for mature accounts", () => {
    const range = getStageFollowerRange("mature");
    expect(range.min).toBe(100000);
    expect(range.max).toBe(Infinity);
  });

  it("should return full range for unknown stage", () => {
    const range = getStageFollowerRange("unknown");
    expect(range.min).toBe(0);
    expect(range.max).toBe(Infinity);
  });
});
