import { describe, expect, it } from "vitest";
import {
  evaluateContentSampleQuality,
  filterContentsBySampleQuality,
  getCandidatePlatforms,
} from "./legacy/prediction-helpers";

function makeDraft(
  selectedPlatforms: string[] = [],
  connectedPlatforms: string[] = [],
) {
  return {
    prompt: "test",
    evidenceItems: [],
    selectedPlatforms,
    connectedPlatforms,
    personalizationMode: "public" as const,
  };
}

describe("getCandidatePlatforms", () => {
  it("uses selectedPlatforms when provided", () => {
    const result = getCandidatePlatforms(makeDraft(["douyin"], ["douyin", "xiaohongshu", "kuaishou"]));
    expect(result).toEqual(["douyin"]);
  });

  it("falls back to connectedPlatforms when selectedPlatforms is empty", () => {
    const result = getCandidatePlatforms(makeDraft([], ["xiaohongshu", "kuaishou"]));
    expect(result).toHaveLength(2);
    expect(result).toContain("xiaohongshu");
    expect(result).toContain("kuaishou");
  });

  it("defaults to douyin when both are empty", () => {
    const result = getCandidatePlatforms(makeDraft([], []));
    expect(result).toEqual(["douyin"]);
  });

  it("filters out unsupported platforms", () => {
    const result = getCandidatePlatforms(makeDraft(["douyin", "bilibili"], []));
    expect(result).toEqual(["douyin"]);
  });

  it("deduplicates platforms", () => {
    const result = getCandidatePlatforms(makeDraft(["douyin", "douyin"], []));
    expect(result).toEqual(["douyin"]);
  });

  it("respects multi-platform selection", () => {
    const result = getCandidatePlatforms(makeDraft(["douyin", "xiaohongshu"], ["kuaishou"]));
    expect(result).toHaveLength(2);
    expect(result).toContain("douyin");
    expect(result).toContain("xiaohongshu");
    expect(result).not.toContain("kuaishou");
  });
});

describe("sample quality gate", () => {
  const now = new Date("2026-05-09T00:00:00.000Z").getTime();

  it("accepts recent samples with real engagement even when viewCount is missing", () => {
    const decision = evaluateContentSampleQuality(
      {
        contentId: "aweme_1",
        title: "AI工具实测：这个工作流真的能省时间",
        platform: "抖音",
        authorName: "效率研究所",
        publishedAt: "2026-05-08T00:00:00.000Z",
        likeCount: 320,
        commentCount: 18,
        collectCount: 90,
        shareCount: 12,
        viewCount: null,
        authorFollowerCount: null,
        contentUrl: "https://www.douyin.com/video/aweme_1",
      },
      now,
    );

    expect(decision.accepted).toBe(true);
    expect(decision.qualityScore).toBeGreaterThanOrEqual(60);
    expect(decision.hasViewCount).toBe(false);
  });

  it("rejects url-only or no-engagement samples", () => {
    const urlOnly = evaluateContentSampleQuality(
      {
        contentId: "bad_1",
        title: "https://t.co/example",
        platform: "抖音",
        authorName: "unknown",
        publishedAt: "2026-05-08T00:00:00.000Z",
        likeCount: 1000,
      },
      now,
    );
    const noEngagement = evaluateContentSampleQuality(
      {
        contentId: "bad_2",
        title: "健身减脂训练动作讲解",
        platform: "抖音",
        authorName: "健身号",
        publishedAt: "2026-05-08T00:00:00.000Z",
        likeCount: 0,
        commentCount: 0,
        collectCount: 0,
        shareCount: 0,
        viewCount: 0,
      },
      now,
    );

    expect(urlOnly.level).toBe("rejected");
    expect(urlOnly.hardRejectReasons).toContain("标题为纯链接");
    expect(noEngagement.level).toBe("rejected");
    expect(noEngagement.hardRejectReasons).toContain("缺少点赞/评论/收藏/分享互动数据");
  });

  it("selects only quality samples before prediction evidence is formed", () => {
    const goodSample = {
      contentId: "good_1",
      title: "母婴辅食教程：宝宝一周早餐安排",
      platform: "抖音",
      authorName: "辅食日记",
      publishedAt: "2026-05-08T00:00:00.000Z",
      likeCount: 120,
      commentCount: 8,
      collectCount: 40,
      shareCount: 3,
      viewCount: null,
      authorFollowerCount: 9000,
      contentUrl: "https://www.douyin.com/video/good_1",
      coverUrl: null,
      keywordTokens: ["母婴", "辅食"],
      structureSummary: "母婴辅食教程",
    };
    const rejectedSample = {
      ...goodSample,
      contentId: "bad_3",
      title: "https://t.co/example",
    };

    const result = filterContentsBySampleQuality([goodSample, rejectedSample] as any, {
      minAccepted: 1,
      nowMs: now,
    });

    expect(result.selected.map((item) => item.contentId)).toEqual(["good_1"]);
    expect(result.rejected.map((item) => item.contentId)).toEqual(["bad_3"]);
  });
});
