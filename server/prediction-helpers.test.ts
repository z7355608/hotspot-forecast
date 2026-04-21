import { describe, expect, it } from "vitest";
import { getCandidatePlatforms } from "./legacy/prediction-helpers";

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
