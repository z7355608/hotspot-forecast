/**
 * strategy-evolution.test.ts
 * ═══════════════════════════════════════════════════════════════
 * 选题策略自进化模块的单元测试
 * ═══════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock database module ── */
const mockQuery = vi.fn();
vi.mock("./database", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

/* ── Import after mocks ── */
import {
  aggregateHistoricalFeedback,
  getHistoricalFeedbackForPrompt,
  getDirectionFeedbackForPrompt,
} from "./strategy-evolution";

/* ── Helpers ── */

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    directionName: "测试方向",
    platform: "douyin",
    publishedTitle: "测试标题",
    predictedScore: 70,
    strategySessionId: "sess_001",
    publishedAt: new Date("2026-03-01"),
    latestPerf: JSON.stringify({
      viewCount: 10000,
      likeCount: 800,
      commentCount: 100,
      shareCount: 50,
      collectCount: 30,
      checkpoint: "24h",
    }),
    ...overrides,
  };
}

/* ── Tests ── */

describe("strategy-evolution", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("aggregateHistoricalFeedback", () => {
    it("should return null when no published content exists", async () => {
      mockQuery.mockResolvedValue([]);
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).toBeNull();
    });

    it("should return null when items have no performance data", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ latestPerf: null }),
      ]);
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).toBeNull();
    });

    it("should aggregate single direction feedback correctly", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ id: 1, predictedScore: 70 }),
        makeRow({ id: 2, predictedScore: 60, publishedTitle: "标题2" }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.totalPublished).toBe(2);
      expect(result!.directionFeedbacks).toHaveLength(1);
      expect(result!.directionFeedbacks[0].directionName).toBe("测试方向");
      expect(result!.directionFeedbacks[0].publishCount).toBe(2);
      expect(result!.directionFeedbacks[0].avgPredictedScore).toBeGreaterThan(0);
      expect(result!.directionFeedbacks[0].avgActualScore).toBeGreaterThan(0);
    });

    it("should separate feedbacks by direction + platform", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ id: 1, directionName: "方向A", platform: "douyin" }),
        makeRow({ id: 2, directionName: "方向B", platform: "douyin" }),
        makeRow({ id: 3, directionName: "方向A", platform: "xiaohongshu" }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.directionFeedbacks).toHaveLength(3);
    });

    it("should identify top directions (avgActualScore >= 60)", async () => {
      // High interaction rate → high actual score
      const highPerfRow = makeRow({
        id: 1,
        directionName: "高分方向",
        latestPerf: JSON.stringify({
          viewCount: 1000,
          likeCount: 200,
          commentCount: 50,
          shareCount: 30,
          collectCount: 20,
        }),
      });
      // Low interaction rate → low actual score
      const lowPerfRow = makeRow({
        id: 2,
        directionName: "低分方向",
        latestPerf: JSON.stringify({
          viewCount: 100000,
          likeCount: 10,
          commentCount: 1,
          shareCount: 0,
          collectCount: 0,
        }),
      });

      mockQuery.mockResolvedValue([highPerfRow, lowPerfRow]);
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.topDirections.length).toBeGreaterThanOrEqual(1);
      expect(result!.topDirections).toContain("高分方向");
    });

    it("should identify weak directions (avgActualScore < 40 and publishCount >= 2)", async () => {
      const lowPerfRows = [
        makeRow({
          id: 1,
          directionName: "弱方向",
          latestPerf: JSON.stringify({
            viewCount: 100000,
            likeCount: 5,
            commentCount: 0,
            shareCount: 0,
            collectCount: 0,
          }),
        }),
        makeRow({
          id: 2,
          directionName: "弱方向",
          publishedTitle: "弱标题2",
          latestPerf: JSON.stringify({
            viewCount: 50000,
            likeCount: 3,
            commentCount: 0,
            shareCount: 0,
            collectCount: 0,
          }),
        }),
      ];

      mockQuery.mockResolvedValue(lowPerfRows);
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.weakDirections).toContain("弱方向");
    });

    it("should compute platform comparison when multiple platforms exist", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ id: 1, platform: "douyin" }),
        makeRow({ id: 2, platform: "xiaohongshu" }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.platformComparison).toHaveLength(2);
      expect(result!.platformComparison.map((p) => p.platform).sort()).toEqual(["douyin", "xiaohongshu"]);
    });

    it("should detect improving trend when newer items score higher", async () => {
      // 4 items needed for trend detection
      const items = [
        makeRow({
          id: 1,
          publishedAt: new Date("2026-03-04"),
          latestPerf: JSON.stringify({ viewCount: 1000, likeCount: 200, commentCount: 50, shareCount: 30, collectCount: 20 }),
        }),
        makeRow({
          id: 2,
          publishedAt: new Date("2026-03-03"),
          latestPerf: JSON.stringify({ viewCount: 1000, likeCount: 180, commentCount: 40, shareCount: 25, collectCount: 15 }),
        }),
        makeRow({
          id: 3,
          publishedAt: new Date("2026-03-02"),
          latestPerf: JSON.stringify({ viewCount: 10000, likeCount: 50, commentCount: 5, shareCount: 2, collectCount: 1 }),
        }),
        makeRow({
          id: 4,
          publishedAt: new Date("2026-03-01"),
          latestPerf: JSON.stringify({ viewCount: 10000, likeCount: 30, commentCount: 3, shareCount: 1, collectCount: 0 }),
        }),
      ];

      mockQuery.mockResolvedValue(items);
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.directionFeedbacks[0].trend).toBe("improving");
    });

    it("should generate feedbackContext as non-empty string", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ id: 1 }),
        makeRow({ id: 2, publishedTitle: "标题2" }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      expect(result!.feedbackContext).toBeTruthy();
      expect(result!.feedbackContext).toContain("历史效果反馈");
    });

    it("should filter by track when track parameter is provided", async () => {
      // First call: main query returns all items
      // Second call: session query returns matching sessions
      mockQuery
        .mockResolvedValueOnce([
          makeRow({ id: 1, strategySessionId: "sess_001" }),
          makeRow({ id: 2, strategySessionId: "sess_002" }),
        ])
        .mockResolvedValueOnce([
          { id: "sess_001" },
        ]);

      const result = await aggregateHistoricalFeedback("user_001", "美妆");
      expect(result).not.toBeNull();
      // Should have filtered to only sess_001
      expect(result!.totalPublished).toBe(1);
    });

    it("should handle database errors gracefully", async () => {
      mockQuery.mockRejectedValue(new Error("DB connection failed"));
      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).toBeNull();
    });
  });

  describe("getHistoricalFeedbackForPrompt", () => {
    it("should return empty string when no data exists", async () => {
      mockQuery.mockResolvedValue([]);
      const result = await getHistoricalFeedbackForPrompt("user_001", "美妆");
      expect(result).toBe("");
    });

    it("should return non-empty string when data exists", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ id: 1 }),
        makeRow({ id: 2, publishedTitle: "标题2" }),
      ]);

      const result = await getHistoricalFeedbackForPrompt("user_001", "美妆");
      expect(result).toBeTruthy();
      expect(result).toContain("历史效果反馈");
    });
  });

  describe("getDirectionFeedbackForPrompt", () => {
    it("should return empty string when no matching direction exists", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ directionName: "完全不同的方向" }),
      ]);

      const result = await getDirectionFeedbackForPrompt("user_001", "不存在的方向");
      expect(result).toBe("");
    });

    it("should return feedback for matching direction name", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ directionName: "测试方向" }),
        makeRow({ id: 2, directionName: "测试方向", publishedTitle: "标题2" }),
      ]);

      const result = await getDirectionFeedbackForPrompt("user_001", "测试方向");
      expect(result).toBeTruthy();
      expect(result).toContain("该方向的历史效果");
    });

    it("should match partial direction names", async () => {
      mockQuery.mockResolvedValue([
        makeRow({ directionName: "美妆教程分享" }),
      ]);

      const result = await getDirectionFeedbackForPrompt("user_001", "美妆教程");
      expect(result).toBeTruthy();
      expect(result).toContain("该方向的历史效果");
    });
  });

  describe("actual score computation", () => {
    it("should score high for high interaction rate (>10%)", async () => {
      mockQuery.mockResolvedValue([
        makeRow({
          latestPerf: JSON.stringify({
            viewCount: 1000,
            likeCount: 200,
            commentCount: 50,
            shareCount: 30,
            collectCount: 20,
          }),
        }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      // totalInteraction = 200 + 50*3 + 30*5 + 20*2 = 200+150+150+40 = 540
      // interactionRate = 540/1000 = 0.54 → score = 80 + (0.54-0.1)*200 = 168 → capped at 100
      expect(result!.directionFeedbacks[0].avgActualScore).toBeGreaterThanOrEqual(80);
    });

    it("should score low for very low interaction rate (<1%)", async () => {
      mockQuery.mockResolvedValue([
        makeRow({
          latestPerf: JSON.stringify({
            viewCount: 100000,
            likeCount: 10,
            commentCount: 1,
            shareCount: 0,
            collectCount: 0,
          }),
        }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      // totalInteraction = 10 + 1*3 + 0 + 0 = 13
      // interactionRate = 13/100000 = 0.00013 → score = 0.00013 * 3000 ≈ 0.39
      expect(result!.directionFeedbacks[0].avgActualScore).toBeLessThan(10);
    });

    it("should compute accuracy based on predicted vs actual difference", async () => {
      mockQuery.mockResolvedValue([
        makeRow({
          predictedScore: 80,
          latestPerf: JSON.stringify({
            viewCount: 1000,
            likeCount: 200,
            commentCount: 50,
            shareCount: 30,
            collectCount: 20,
          }),
        }),
      ]);

      const result = await aggregateHistoricalFeedback("user_001");
      expect(result).not.toBeNull();
      // actual ≈ 100, predicted = 80, diff = 20, accuracy = 80
      expect(result!.directionFeedbacks[0].accuracy).toBeGreaterThanOrEqual(70);
    });
  });
});
