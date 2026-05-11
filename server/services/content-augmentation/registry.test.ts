import { describe, it, expect, beforeEach } from "vitest";
import {
  augmentContents,
  registerAugmenter,
  setAugmenterTimeoutMs,
  listAugmenters,
  _resetForTest,
  type AugmenterContext,
  type ContentAugmenter,
} from "./registry.js";
import type { ExtractedContent } from "../../legacy/prediction-helpers.js";

const ctx: AugmenterContext = {
  industry: "AI",
  seedTopic: "ai 科技选题",
  prompt: "ai 科技选题",
  traceId: "test-trace",
};

const baseContent: ExtractedContent = {
  contentId: "base_1",
  title: "base content",
  authorName: "base_author",
  platform: "douyin",
  publishedAt: "2026-04-29T00:00:00.000Z",
  viewCount: 100,
  likeCount: 10,
  commentCount: 1,
  shareCount: 0,
  collectCount: 0,
  structureSummary: "",
  keywordTokens: [],
  whyIncluded: "test fixture",
  authorFollowerCount: 1000,
};

describe("content-augmentation registry", () => {
  beforeEach(() => _resetForTest());

  it("returns existing unchanged (same reference) when no augmenter is registered", async () => {
    const input = [baseContent];
    const out = await augmentContents(input, ctx);
    expect(out).toBe(input); // identity: same reference, zero behavior change
    expect(out).toHaveLength(1);
    expect(out[0].contentId).toBe("base_1");
    expect(listAugmenters()).toEqual([]);
  });

  it("appends contents from a single augmenter", async () => {
    const a: ContentAugmenter = {
      name: "test-a",
      shouldRun: () => true,
      run: async () => [{ ...baseContent, contentId: "a_1", title: "from-a" }],
    };
    registerAugmenter(a);
    const out = await augmentContents([baseContent], ctx);
    expect(out).toHaveLength(2);
    expect(out[1].contentId).toBe("a_1");
  });

  it("skips augmenter when shouldRun returns false", async () => {
    const a: ContentAugmenter = {
      name: "skip-me",
      shouldRun: () => false,
      run: async () => {
        throw new Error("must not run");
      },
    };
    registerAugmenter(a);
    const out = await augmentContents([baseContent], ctx);
    expect(out).toHaveLength(1);
  });

  it("fails soft when augmenter throws", async () => {
    const a: ContentAugmenter = {
      name: "boom",
      shouldRun: () => true,
      run: async () => {
        throw new Error("boom");
      },
    };
    registerAugmenter(a);
    const out = await augmentContents([baseContent], ctx);
    expect(out).toHaveLength(1);
    expect(out[0].contentId).toBe("base_1");
  });

  it("fails soft on timeout", async () => {
    setAugmenterTimeoutMs(50);
    const a: ContentAugmenter = {
      name: "slow",
      shouldRun: () => true,
      run: () => new Promise((resolve) => setTimeout(() => resolve([baseContent]), 500)),
    };
    registerAugmenter(a);
    const out = await augmentContents([baseContent], ctx);
    expect(out).toHaveLength(1);
  });

  it("fails soft when shouldRun throws", async () => {
    const a: ContentAugmenter = {
      name: "bad-check",
      shouldRun: () => {
        throw new Error("should-run-broke");
      },
      run: async () => [baseContent],
    };
    registerAugmenter(a);
    const out = await augmentContents([baseContent], ctx);
    expect(out).toHaveLength(1);
  });

  it("merges outputs from multiple augmenters in order", async () => {
    registerAugmenter({
      name: "a1",
      shouldRun: () => true,
      run: async () => [{ ...baseContent, contentId: "a1_1" }],
    });
    registerAugmenter({
      name: "a2",
      shouldRun: () => true,
      run: async () => [
        { ...baseContent, contentId: "a2_1" },
        { ...baseContent, contentId: "a2_2" },
      ],
    });
    const out = await augmentContents([baseContent], ctx);
    expect(out.map((c) => c.contentId)).toEqual(["base_1", "a1_1", "a2_1", "a2_2"]);
  });
});
