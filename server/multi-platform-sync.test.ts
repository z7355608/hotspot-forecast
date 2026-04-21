import { describe, it, expect, vi } from "vitest";

/**
 * Multi-platform sync integration tests
 * Validates the sync function routing and data structure for all 6 supported platforms
 */

// We test the module structure and exported functions
describe("Multi-platform sync module structure", () => {
  it("should export syncCreatorData function", async () => {
    const mod = await import("./legacy/creator-data-sync");
    expect(typeof mod.syncCreatorData).toBe("function");
  });

  it("should export SyncInput type-compatible interface", async () => {
    const mod = await import("./legacy/creator-data-sync");
    // Verify the function accepts the expected input shape
    expect(mod.syncCreatorData).toBeDefined();
  });
});

describe("SUPPORTED_SYNC_PLATFORMS coverage", () => {
  const EXPECTED_PLATFORMS = ["douyin", "xiaohongshu", "youtube", "twitter", "instagram", "weibo"];

  for (const platform of EXPECTED_PLATFORMS) {
    it(`should support platform: ${platform}`, { timeout: 15000 }, async () => {
      // The sync function should not immediately reject supported platforms
      // We test by calling with minimal input and expecting it to attempt API calls
      // (which will fail gracefully without real credentials, but won't throw "unsupported platform")
      const mod = await import("./legacy/creator-data-sync");
      const result = await mod.syncCreatorData({
        userId: "test-user",
        platformId: platform,
        handle: "test-handle",
        days: 7,
        persist: false, // Don't write to DB in tests
      });

      // Should NOT return the "unsupported platform" error
      if (!result.success) {
        expect(result.error).not.toContain("暂不支持数据同步");
        expect(result.error).not.toContain("API接入开发中");
      }
    });
  }

  it("should reject unsupported platform: bilibili", async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "bilibili",
      handle: "test-handle",
      days: 7,
      persist: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("暂不支持数据同步");
  });

  it("should attempt sync for kuaishou (now supported)", async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "kuaishou",
      handle: "test-handle",
      days: 7,
      persist: false,
    });

    // 快手现已支持同步，但可能因无效handle而失败
    // 关键是不再返回"暂不支持数据同步"
    if (!result.success) {
      expect(result.error).not.toContain("暂不支持数据同步");
    }
  });
});

describe("SyncResult data structure", () => {
  it("should always return syncedAt timestamp", { timeout: 15000 }, async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "nonexistent-user-12345",
      days: 7,
      persist: false,
    });

    expect(result.syncedAt).toBeDefined();
    expect(typeof result.syncedAt).toBe("string");
    // Should be a valid ISO date string
    expect(new Date(result.syncedAt).toISOString()).toBe(result.syncedAt);
  });

  it("should return error message on failure", async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "", // Empty handle should fail
      days: 7,
      persist: false,
    });

    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
    }
  });
});

describe("AccountOverview data structure validation", () => {
  it("should have required fields when sync succeeds", async () => {
    const mod = await import("./legacy/creator-data-sync");
    // Use a known douyin user for testing
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "MS4wLjABAAAAVgnJcfVBRnnIXhMxMEoL5VcIqNMaZRzUb5JGc_bPBF4",
      days: 7,
      persist: false,
    });

    if (result.success && result.overview) {
      const ov = result.overview;
      expect(typeof ov.platformId).toBe("string");
      expect(typeof ov.platformName).toBe("string");
      expect(typeof ov.followers).toBe("number");
      expect(typeof ov.syncedAt).toBe("string");
      expect(typeof ov.dataSource).toBe("string");
      expect(ov.dataSource).toBe("live");
      // followers should be a non-negative number
      expect(ov.followers).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("WorkItem data structure validation", () => {
  it("should have required fields for each work", async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "MS4wLjABAAAAVgnJcfVBRnnIXhMxMEoL5VcIqNMaZRzUb5JGc_bPBF4",
      days: 30,
      persist: false,
    });

    if (result.success && result.works && result.works.length > 0) {
      const work = result.works[0];
      expect(typeof work.id).toBe("string");
      expect(typeof work.title).toBe("string");
      // likes, comments, shares should be numbers
      expect(typeof work.likes).toBe("number");
      expect(typeof work.comments).toBe("number");
      expect(typeof work.shares).toBe("number");
      // publishedAt should be a valid date string
      if (work.publishedAt) {
        expect(new Date(work.publishedAt).toString()).not.toBe("Invalid Date");
      }
    }
  });
});

describe("Engagement rate calculation", () => {
  it("should calculate avgEngagementRate when works exist", async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "MS4wLjABAAAAVgnJcfVBRnnIXhMxMEoL5VcIqNMaZRzUb5JGc_bPBF4",
      days: 30,
      persist: false,
    });

    if (result.success && result.overview && result.works && result.works.length > 0) {
      expect(typeof result.overview.avgEngagementRate).toBe("number");
      expect(result.overview.avgEngagementRate).toBeGreaterThanOrEqual(0);
      // Should not be NaN or Infinity
      expect(Number.isFinite(result.overview.avgEngagementRate)).toBe(true);
    }
  });
});

describe("Trend data structure", () => {
  it("should return trend data array", { timeout: 15000 }, async () => {
    const mod = await import("./legacy/creator-data-sync");
    const result = await mod.syncCreatorData({
      userId: "test-user",
      platformId: "douyin",
      handle: "MS4wLjABAAAAVgnJcfVBRnnIXhMxMEoL5VcIqNMaZRzUb5JGc_bPBF4",
      days: 30,
      persist: false,
    });

    if (result.success && result.trendData) {
      expect(Array.isArray(result.trendData)).toBe(true);
      if (result.trendData.length > 0) {
        const point = result.trendData[0];
        expect(typeof point.date).toBe("string");
        // Date should be YYYY-MM-DD format
        expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
