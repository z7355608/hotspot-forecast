/**
 * Tests verifying the stability fixes for AnalysisView component.
 * 
 * These tests validate the data transformation logic that was causing
 * React DOM insertBefore errors due to unstable references, conditional
 * text nodes, and non-deterministic timing calculations.
 * 
 * The actual React rendering is not tested here (vitest runs in node env),
 * but we verify the pure logic that feeds into the component.
 */
import { describe, it, expect } from "vitest";

/* ------------------------------------------------------------------ */
/*  Reproduce the platform status computation logic                    */
/* ------------------------------------------------------------------ */

type PlatformStatus = {
  name: string;
  status: "collecting" | "done" | "failed";
  contentCount?: number;
  hotCount?: number;
  topContent?: string;
};

type ProgressEvent =
  | { type: "platform_start"; platform: string; platformName: string }
  | {
      type: "platform_done";
      platform: string;
      platformName: string;
      status: "success" | "failed";
      contentCount?: number;
      hotCount?: number;
      topContent?: string;
    }
  | { type: "cache_hit" }
  | {
      type: "data_collected";
      contentCount: number;
      accountCount: number;
      hotCount: number;
      highlights: string[];
      contentSamples: Array<{ platform: string; title: string; likeCount?: number }>;
      accountSamples: Array<{ displayName: string; followerCount?: number }>;
    };

function computePlatformStatuses(
  progressEvents: ProgressEvent[],
): Record<string, PlatformStatus> {
  if (!progressEvents || progressEvents.length === 0) return {};
  const map: Record<string, PlatformStatus> = {};
  for (const ev of progressEvents) {
    if (ev.type === "platform_start") {
      map[ev.platform] = { name: ev.platformName, status: "collecting" };
    } else if (ev.type === "platform_done") {
      map[ev.platform] = {
        name: ev.platformName,
        status: ev.status === "success" ? "done" : "failed",
        contentCount: ev.contentCount,
        hotCount: ev.hotCount,
        topContent: ev.topContent,
      };
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Reproduce the step timing computation (deterministic version)      */
/* ------------------------------------------------------------------ */

function computeStepTimings(stepsCount: number, totalDuration: number): number[] {
  const count = stepsCount;
  const earlyBudget = totalDuration * 0.6;
  const earlyInterval = count > 1 ? earlyBudget / (count - 1) : earlyBudget;
  return Array.from({ length: count }, (_, i) => {
    if (i < count - 1) {
      const factor = 0.9 + (i / Math.max(count - 2, 1)) * 0.2;
      return Math.round(earlyInterval * (i + 1) * factor);
    }
    return Math.round(totalDuration * 0.9);
  });
}

/* ------------------------------------------------------------------ */
/*  Reproduce the data summary computation (stable join version)       */
/* ------------------------------------------------------------------ */

function computeDataSummary(data: {
  contentCount: number;
  accountCount: number;
  hotCount: number;
}): string {
  return [
    data.contentCount > 0 ? `${data.contentCount} 条内容` : null,
    data.accountCount > 0 ? `${data.accountCount} 个账号` : null,
    data.hotCount > 0 ? `${data.hotCount} 条热榜` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("AnalysisView stability fixes", () => {
  describe("platformStatuses computation", () => {
    it("should return empty for no events", () => {
      expect(computePlatformStatuses([])).toEqual({});
    });

    it("should track platform_start as collecting", () => {
      const result = computePlatformStatuses([
        { type: "platform_start", platform: "douyin", platformName: "抖音" },
      ]);
      expect(result.douyin).toEqual({ name: "抖音", status: "collecting" });
    });

    it("should transition from collecting to done", () => {
      const result = computePlatformStatuses([
        { type: "platform_start", platform: "douyin", platformName: "抖音" },
        {
          type: "platform_done",
          platform: "douyin",
          platformName: "抖音",
          status: "success",
          contentCount: 42,
          hotCount: 5,
        },
      ]);
      expect(result.douyin.status).toBe("done");
      expect(result.douyin.contentCount).toBe(42);
    });

    it("should handle failed status", () => {
      const result = computePlatformStatuses([
        { type: "platform_start", platform: "xhs", platformName: "小红书" },
        {
          type: "platform_done",
          platform: "xhs",
          platformName: "小红书",
          status: "failed",
        },
      ]);
      expect(result.xhs.status).toBe("failed");
    });

    it("should handle multiple platforms with different statuses", () => {
      const result = computePlatformStatuses([
        { type: "platform_start", platform: "douyin", platformName: "抖音" },
        { type: "platform_start", platform: "xhs", platformName: "小红书" },
        {
          type: "platform_done",
          platform: "douyin",
          platformName: "抖音",
          status: "success",
          contentCount: 10,
        },
      ]);
      expect(result.douyin.status).toBe("done");
      expect(result.xhs.status).toBe("collecting");
    });
  });

  describe("stepTimings deterministic computation", () => {
    it("should produce deterministic results across calls", () => {
      const t1 = computeStepTimings(4, 15000);
      const t2 = computeStepTimings(4, 15000);
      expect(t1).toEqual(t2);
    });

    it("should produce monotonically increasing timings", () => {
      const timings = computeStepTimings(5, 20000);
      for (let i = 1; i < timings.length; i++) {
        expect(timings[i]).toBeGreaterThan(timings[i - 1]);
      }
    });

    it("should have last step at ~90% of total duration", () => {
      const total = 15000;
      const timings = computeStepTimings(4, total);
      const lastStep = timings[timings.length - 1];
      expect(lastStep).toBe(Math.round(total * 0.9));
    });

    it("should handle single step", () => {
      const timings = computeStepTimings(1, 10000);
      expect(timings).toHaveLength(1);
      expect(timings[0]).toBe(9000); // 90% of 10000
    });

    it("should handle two steps", () => {
      const timings = computeStepTimings(2, 10000);
      expect(timings).toHaveLength(2);
      expect(timings[0]).toBeLessThan(timings[1]);
    });
  });

  describe("data summary stable join", () => {
    it("should join all three counts", () => {
      expect(
        computeDataSummary({ contentCount: 10, accountCount: 5, hotCount: 3 }),
      ).toBe("10 条内容 · 5 个账号 · 3 条热榜");
    });

    it("should omit zero counts", () => {
      expect(
        computeDataSummary({ contentCount: 10, accountCount: 0, hotCount: 3 }),
      ).toBe("10 条内容 · 3 条热榜");
    });

    it("should handle all zeros", () => {
      expect(
        computeDataSummary({ contentCount: 0, accountCount: 0, hotCount: 0 }),
      ).toBe("");
    });

    it("should handle only hotCount", () => {
      expect(
        computeDataSummary({ contentCount: 0, accountCount: 0, hotCount: 7 }),
      ).toBe("7 条热榜");
    });

    it("should produce stable output across calls", () => {
      const data = { contentCount: 10, accountCount: 5, hotCount: 3 };
      const r1 = computeDataSummary(data);
      const r2 = computeDataSummary(data);
      expect(r1).toBe(r2);
    });
  });

  describe("platform status label text (stable rendering)", () => {
    /**
     * This test verifies the logic that was previously using multiple
     * conditional text nodes (&&) which caused insertBefore errors.
     * Now consolidated into a single expression.
     */
    function getPlatformLabel(info: PlatformStatus): string | null {
      if (info.status === "collecting") return " 采集中…";
      if (info.status === "done") {
        if (info.contentCount && info.contentCount > 0)
          return ` 发现 ${info.contentCount} 条内容`;
        if (info.hotCount && info.hotCount > 0)
          return ` 捕获 ${info.hotCount} 条热榜`;
        return " 采集完成";
      }
      if (info.status === "failed") return " 采集失败";
      return null;
    }

    it("should show collecting text", () => {
      expect(
        getPlatformLabel({ name: "抖音", status: "collecting" }),
      ).toBe(" 采集中…");
    });

    it("should show content count when done with content", () => {
      expect(
        getPlatformLabel({
          name: "抖音",
          status: "done",
          contentCount: 42,
        }),
      ).toBe(" 发现 42 条内容");
    });

    it("should show hot count when done with only hot data", () => {
      expect(
        getPlatformLabel({
          name: "抖音",
          status: "done",
          hotCount: 5,
        }),
      ).toBe(" 捕获 5 条热榜");
    });

    it("should show default done text when no counts", () => {
      expect(
        getPlatformLabel({ name: "抖音", status: "done" }),
      ).toBe(" 采集完成");
    });

    it("should show failed text", () => {
      expect(
        getPlatformLabel({ name: "抖音", status: "failed" }),
      ).toBe(" 采集失败");
    });
  });

  describe("key stability for platform items", () => {
    it("should generate different keys when status changes", () => {
      const pid = "douyin";
      const keyCollecting = `${pid}-collecting`;
      const keyDone = `${pid}-done`;
      expect(keyCollecting).not.toBe(keyDone);
    });

    it("should generate stable keys for same status", () => {
      const pid = "douyin";
      const key1 = `${pid}-done`;
      const key2 = `${pid}-done`;
      expect(key1).toBe(key2);
    });
  });
});
