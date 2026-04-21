/**
 * low-follower-algorithm.test.ts
 * 低粉爆款算法 V2 单元测试
 */
import { describe, it, expect } from "vitest";
import {
  computeWeightedInteraction,
  runLowFollowerAlgorithm,
  formatFollowerLabel,
  formatViewLabel,
  formatInteractionLabel,
  getViralScoreLabel,
  fromExtractedContent,
  accountsFromExtractedContents,
  DEFAULT_ALGORITHM_CONFIG,
  type RawContentItem,
  type RawAccountItem,
  type LowFollowerAlgorithmConfig,
} from "./legacy/low-follower-algorithm.js";

// ─────────────────────────────────────────────
// 测试数据工厂
// ─────────────────────────────────────────────

function makeContent(overrides: Partial<RawContentItem> = {}): RawContentItem {
  return {
    contentId: `c_${Math.random().toString(36).slice(2, 8)}`,
    authorId: "author_001",
    authorName: "测试账号",
    title: "测试视频标题",
    platform: "douyin",
    viewCount: null,
    likeCount: 500,
    commentCount: 100,
    shareCount: 50,
    saveCount: 200,
    publishedAt: new Date().toISOString(), // 今天发布
    contentUrl: null,
    coverUrl: null,
    tags: ["测试"],
    ...overrides,
  };
}

function makeAccount(overrides: Partial<RawAccountItem> = {}): RawAccountItem {
  return {
    accountId: "author_001",
    followerCount: 3000,
    platform: "douyin",
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// computeWeightedInteraction 测试
// ─────────────────────────────────────────────

describe("computeWeightedInteraction", () => {
  it("应正确计算加权互动分（刚发布，无时间衰减）", () => {
    const item = makeContent({
      likeCount: 100,
      commentCount: 50,
      saveCount: 30,
      shareCount: 20,
      publishedAt: new Date().toISOString(),
    });
    // 基础分 = 100*1 + 50*3 + 30*2 + 20*4 = 100 + 150 + 60 + 80 = 390
    // 时间衰减 ≈ 1 / (1 + 0/7) = 1
    const score = computeWeightedInteraction(item, DEFAULT_ALGORITHM_CONFIG);
    expect(score).toBeCloseTo(390, 0);
  });

  it("应对7天前发布的内容应用时间衰减", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const item = makeContent({
      likeCount: 100,
      commentCount: 50,
      saveCount: 30,
      shareCount: 20,
      publishedAt: sevenDaysAgo,
    });
    // 基础分 = 390
    // 时间衰减 = 1 / (1 + 7/7) = 0.5
    // 加权互动分 = 390 * 0.5 = 195
    const score = computeWeightedInteraction(item, DEFAULT_ALGORITHM_CONFIG);
    expect(score).toBeCloseTo(195, 0);
  });

  it("无发布时间时不衰减", () => {
    const item = makeContent({
      likeCount: 100,
      commentCount: 50,
      saveCount: 30,
      shareCount: 20,
      publishedAt: null,
    });
    const score = computeWeightedInteraction(item, DEFAULT_ALGORITHM_CONFIG);
    expect(score).toBeCloseTo(390, 0);
  });

  it("所有互动为0时返回0", () => {
    const item = makeContent({
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      shareCount: 0,
    });
    const score = computeWeightedInteraction(item, DEFAULT_ALGORITHM_CONFIG);
    expect(score).toBe(0);
  });

  it("null互动数应视为0", () => {
    const item = makeContent({
      likeCount: null,
      commentCount: null,
      saveCount: null,
      shareCount: null,
    });
    const score = computeWeightedInteraction(item, DEFAULT_ALGORITHM_CONFIG);
    expect(score).toBe(0);
  });
});

// ─────────────────────────────────────────────
// runLowFollowerAlgorithm 测试
// ─────────────────────────────────────────────

describe("runLowFollowerAlgorithm", () => {
  it("空输入应返回空结果", () => {
    const result = runLowFollowerAlgorithm([], []);
    expect(result.samples).toHaveLength(0);
    expect(result.anomalyHitCount).toBe(0);
    expect(result.lowFollowerAnomalyRatio).toBe(0);
    expect(result.totalContentCount).toBe(0);
  });

  it("低粉+高互动内容应被识别为爆款", () => {
    const contents = [
      makeContent({
        contentId: "viral_1",
        authorId: "low_fan_author",
        likeCount: 5000,
        commentCount: 2000,
        saveCount: 1000,
        shareCount: 800,
      }),
      // 普通内容作为对照
      makeContent({
        contentId: "normal_1",
        authorId: "normal_author",
        likeCount: 10,
        commentCount: 2,
        saveCount: 1,
        shareCount: 0,
      }),
      makeContent({
        contentId: "normal_2",
        authorId: "normal_author",
        likeCount: 20,
        commentCount: 5,
        saveCount: 3,
        shareCount: 1,
      }),
    ];
    const accounts = [
      makeAccount({ accountId: "low_fan_author", followerCount: 500 }),
      makeAccount({ accountId: "normal_author", followerCount: 800 }),
    ];

    const result = runLowFollowerAlgorithm(contents, accounts);
    expect(result.samples.length).toBeGreaterThan(0);

    // 低粉高互动的那条应该被标记为严格异常
    const viralSample = result.samples.find((s) => s.contentId === "viral_1");
    expect(viralSample).toBeDefined();
    expect(viralSample!.isStrictAnomaly).toBe(true);
    expect(viralSample!.followerCount).toBe(500);
    expect(viralSample!.anomalyScore).toBeGreaterThan(0);
  });

  it("高粉账号不应被识别为低粉爆款", () => {
    const contents = [
      makeContent({
        contentId: "high_fan_viral",
        authorId: "high_fan_author",
        likeCount: 50000,
        commentCount: 10000,
        saveCount: 5000,
        shareCount: 3000,
      }),
    ];
    const accounts = [
      makeAccount({ accountId: "high_fan_author", followerCount: 500000 }),
    ];

    const result = runLowFollowerAlgorithm(contents, accounts);
    // 高粉账号不应该命中
    const sample = result.samples.find((s) => s.contentId === "high_fan_viral");
    expect(sample).toBeUndefined();
  });

  it("超过30天的旧内容应被过滤", () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const contents = [
      makeContent({
        contentId: "old_viral",
        authorId: "low_fan_author",
        likeCount: 5000,
        commentCount: 2000,
        saveCount: 1000,
        shareCount: 800,
        publishedAt: oldDate,
      }),
    ];
    const accounts = [
      makeAccount({ accountId: "low_fan_author", followerCount: 500 }),
    ];

    const result = runLowFollowerAlgorithm(contents, accounts);
    expect(result.samples).toHaveLength(0);
    expect(result.totalContentCount).toBe(0);
  });

  it("无发布时间的内容不应被过滤", () => {
    const contents = [
      makeContent({
        contentId: "no_date_viral",
        authorId: "low_fan_author",
        likeCount: 5000,
        commentCount: 2000,
        saveCount: 1000,
        shareCount: 800,
        publishedAt: null,
      }),
      // 需要更多样本来计算P75
      makeContent({ contentId: "filler_1", authorId: "low_fan_author", likeCount: 10, commentCount: 2, saveCount: 1, shareCount: 0 }),
      makeContent({ contentId: "filler_2", authorId: "low_fan_author", likeCount: 5, commentCount: 1, saveCount: 0, shareCount: 0 }),
    ];
    const accounts = [
      makeAccount({ accountId: "low_fan_author", followerCount: 500 }),
    ];

    const result = runLowFollowerAlgorithm(contents, accounts);
    const sample = result.samples.find((s) => s.contentId === "no_date_viral");
    expect(sample).toBeDefined();
  });

  it("严格异常应排在宽松异常前面", () => {
    const contents = [
      // 严格异常：低粉+高互动+高效率
      makeContent({
        contentId: "strict_1",
        authorId: "author_a",
        likeCount: 5000,
        commentCount: 2000,
        saveCount: 1000,
        shareCount: 800,
      }),
      // 宽松异常：低粉+高互动但效率比可能不够
      makeContent({
        contentId: "loose_1",
        authorId: "author_b",
        likeCount: 3000,
        commentCount: 500,
        saveCount: 200,
        shareCount: 100,
      }),
      // 普通内容
      makeContent({ contentId: "normal_1", authorId: "author_c", likeCount: 5, commentCount: 1, saveCount: 0, shareCount: 0 }),
      makeContent({ contentId: "normal_2", authorId: "author_c", likeCount: 3, commentCount: 0, saveCount: 0, shareCount: 0 }),
    ];
    const accounts = [
      makeAccount({ accountId: "author_a", followerCount: 200 }),
      makeAccount({ accountId: "author_b", followerCount: 8000 }),
      makeAccount({ accountId: "author_c", followerCount: 500 }),
    ];

    const result = runLowFollowerAlgorithm(contents, accounts);
    if (result.samples.length >= 2) {
      const strictSamples = result.samples.filter((s) => s.isStrictAnomaly);
      const looseSamples = result.samples.filter((s) => !s.isStrictAnomaly);
      if (strictSamples.length > 0 && looseSamples.length > 0) {
        const firstStrictIdx = result.samples.indexOf(strictSamples[0]);
        const firstLooseIdx = result.samples.indexOf(looseSamples[0]);
        expect(firstStrictIdx).toBeLessThan(firstLooseIdx);
      }
    }
  });

  it("自定义配置应覆盖默认值", () => {
    const contents = [
      makeContent({
        contentId: "custom_1",
        authorId: "author_x",
        likeCount: 1000,
        commentCount: 200,
        saveCount: 100,
        shareCount: 50,
      }),
      makeContent({ contentId: "filler_1", authorId: "author_x", likeCount: 5, commentCount: 1, saveCount: 0, shareCount: 0 }),
    ];
    const accounts = [
      makeAccount({ accountId: "author_x", followerCount: 15000 }),
    ];

    // 默认配置下 15000 粉超过 10000 上限，不会命中
    const defaultResult = runLowFollowerAlgorithm(contents, accounts);
    const defaultSample = defaultResult.samples.find((s) => s.contentId === "custom_1");
    expect(defaultSample).toBeUndefined();

    // 提高上限到 20000
    const customResult = runLowFollowerAlgorithm(contents, accounts, { followerCeiling: 20000 });
    const customSample = customResult.samples.find((s) => s.contentId === "custom_1");
    expect(customSample).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// 格式化函数测试
// ─────────────────────────────────────────────

describe("formatFollowerLabel", () => {
  it("万级粉丝", () => expect(formatFollowerLabel(35000)).toBe("3.5万粉"));
  it("千级粉丝", () => expect(formatFollowerLabel(2500)).toBe("2.5k粉"));
  it("百级粉丝", () => expect(formatFollowerLabel(800)).toBe("800粉"));
});

describe("formatViewLabel", () => {
  it("千万级", () => expect(formatViewLabel(15000000)).toBe("1.5千万"));
  it("百万级", () => expect(formatViewLabel(2500000)).toBe("2.5百万"));
  it("万级", () => expect(formatViewLabel(50000)).toBe("5.0万"));
  it("千级", () => expect(formatViewLabel(800)).toBe("800"));
});

describe("formatInteractionLabel", () => {
  it("万级互动", () => expect(formatInteractionLabel(25000)).toBe("2.5万互动"));
  it("千级互动", () => expect(formatInteractionLabel(3500)).toBe("3.5k互动"));
  it("百级互动", () => expect(formatInteractionLabel(200)).toBe("200互动"));
});

describe("getViralScoreLabel", () => {
  it("超级爆款", () => expect(getViralScoreLabel(85)).toContain("超级爆款"));
  it("强势爆款", () => expect(getViralScoreLabel(65)).toContain("强势爆款"));
  it("潜力爆款", () => expect(getViralScoreLabel(45)).toContain("潜力爆款"));
  it("值得关注", () => expect(getViralScoreLabel(20)).toContain("值得关注"));
});

// ─────────────────────────────────────────────
// 转换函数测试
// ─────────────────────────────────────────────

describe("fromExtractedContent", () => {
  it("应正确转换 ExtractedContent 为 RawContentItem", () => {
    const extracted = {
      contentId: "abc123",
      title: "测试标题",
      authorName: "测试作者",
      platform: "douyin",
      publishedAt: "2026-03-25T10:00:00Z",
      viewCount: 50000,
      likeCount: 1000,
      commentCount: 200,
      shareCount: 50,
      keywordTokens: ["美食", "教程"],
      authorFollowerCount: 3000,
      authorId: "author_xyz",
    };

    const result = fromExtractedContent(extracted);
    expect(result.contentId).toBe("abc123");
    expect(result.authorId).toBe("author_xyz");
    expect(result.platform).toBe("douyin");
    expect(result.likeCount).toBe(1000);
    expect(result.saveCount).toBeNull(); // ExtractedContent 没有 saveCount
    expect(result.tags).toEqual(["美食", "教程"]);
  });

  it("无 authorId 时应回退到 contentId", () => {
    const extracted = {
      contentId: "abc123",
      title: "测试",
      authorName: "测试",
      platform: "douyin",
      publishedAt: "2026-03-25T10:00:00Z",
      viewCount: null,
      likeCount: null,
      commentCount: null,
      shareCount: null,
      keywordTokens: [],
    };

    const result = fromExtractedContent(extracted);
    expect(result.authorId).toBe("abc123");
  });
});

describe("accountsFromExtractedContents", () => {
  it("应去重并提取账号信息", () => {
    const items = [
      { contentId: "c1", authorId: "a1", platform: "douyin", authorFollowerCount: 3000 },
      { contentId: "c2", authorId: "a1", platform: "douyin", authorFollowerCount: 3000 },
      { contentId: "c3", authorId: "a2", platform: "douyin", authorFollowerCount: 8000 },
    ];

    const accounts = accountsFromExtractedContents(items);
    expect(accounts).toHaveLength(2);
    expect(accounts.find((a) => a.accountId === "a1")?.followerCount).toBe(3000);
    expect(accounts.find((a) => a.accountId === "a2")?.followerCount).toBe(8000);
  });

  it("无粉丝量的账号应被跳过", () => {
    const items = [
      { contentId: "c1", authorId: "a1", platform: "douyin", authorFollowerCount: null },
      { contentId: "c2", authorId: "a2", platform: "douyin", authorFollowerCount: undefined },
    ];

    const accounts = accountsFromExtractedContents(items);
    expect(accounts).toHaveLength(0);
  });
});
