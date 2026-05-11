import { describe, it, expect } from "vitest";
import { augmenter } from "./x-tech-source.js";
import type { AugmenterContext } from "../registry.js";

const ctx = (overrides: Partial<AugmenterContext> = {}): AugmenterContext => ({
  industry: null,
  seedTopic: "",
  prompt: null,
  traceId: null,
  ...overrides,
});

describe("x-tech-source shouldRun", () => {
  it("triggers on AI keyword in prompt", () => {
    expect(augmenter.shouldRun(ctx({ prompt: "ai 科技选题方向" }))).toBe(true);
  });

  it("triggers on 大模型 in seedTopic", () => {
    expect(augmenter.shouldRun(ctx({ seedTopic: "大模型应用" }))).toBe(true);
  });

  it("triggers on industry='AI' alone", () => {
    expect(augmenter.shouldRun(ctx({ industry: "AI" }))).toBe(true);
  });

  it("does NOT trigger when no tech keyword present", () => {
    expect(augmenter.shouldRun(ctx({ prompt: "美妆护肤选题" }))).toBe(false);
  });

  // 关键反向测试:低粉/素人场景必须跳过,即使 prompt 含 AI 关键词
  it("does NOT trigger on 低粉爆款 even with AI keyword", () => {
    expect(
      augmenter.shouldRun(ctx({ prompt: "ai科技最近7天有哪些低粉爆款" })),
    ).toBe(false);
  });

  it("does NOT trigger on 可复制方向 even with AI keyword", () => {
    expect(
      augmenter.shouldRun(ctx({ prompt: "ai 大模型可复制的方向" })),
    ).toBe(false);
  });

  it("does NOT trigger on 素人 even with tech keyword", () => {
    expect(
      augmenter.shouldRun(ctx({ prompt: "科技赛道素人爆款样本" })),
    ).toBe(false);
  });

  it("does NOT trigger on 复刻 even with tech keyword", () => {
    expect(augmenter.shouldRun(ctx({ prompt: "ai 选题复刻教程" }))).toBe(false);
  });

  it("does NOT trigger on 对标账号 even with tech keyword", () => {
    expect(
      augmenter.shouldRun(ctx({ prompt: "ai 科技对标账号有哪些" })),
    ).toBe(false);
  });

  it("anti-keyword wins regardless of which field carries it", () => {
    // industry 含 AI,但 prompt 含「低粉」→ 整体跳过
    expect(
      augmenter.shouldRun(ctx({ industry: "AI", prompt: "找低粉账号" })),
    ).toBe(false);
  });
});
