/**
 * membership-plan.test.ts — 会员等级归一化 & 默认模型测试
 * 模型选择已收敛为全用户默认 GPT-5.5，会员等级不再影响模型可用性。
 */
import { describe, it, expect } from "vitest";
import {
  normalizePlan,
  canUseModel,
  getHighestAvailableModel,
  type MembershipPlan,
  type AIModelId,
} from "../client/src/app/store/app-data-core";

describe("normalizePlan", () => {
  it("should return 'free' for free plan", () => {
    expect(normalizePlan("free")).toBe("free");
  });

  it("should return 'plus' for plus plan", () => {
    expect(normalizePlan("plus")).toBe("plus");
  });

  it("should return 'pro' for pro plan", () => {
    expect(normalizePlan("pro")).toBe("pro");
  });

  it("should return 'plus' for plus_yearly plan", () => {
    expect(normalizePlan("plus_yearly")).toBe("plus");
  });

  it("should return 'pro' for pro_yearly plan", () => {
    expect(normalizePlan("pro_yearly")).toBe("pro");
  });
});

describe("canUseModel with yearly plans", () => {
  const testCases: Array<{
    plan: MembershipPlan;
    model: AIModelId;
    expected: boolean;
    desc: string;
  }> = [
    // free plan
    { plan: "free", model: "doubao", expected: true, desc: "free can use doubao" },
    { plan: "free", model: "gpt54", expected: true, desc: "free can use gpt55" },
    { plan: "free", model: "claude46", expected: true, desc: "free can use legacy claude id" },

    // plus plan
    { plan: "plus", model: "doubao", expected: true, desc: "plus can use doubao" },
    { plan: "plus", model: "gpt54", expected: true, desc: "plus can use gpt54" },
    { plan: "plus", model: "claude46", expected: true, desc: "plus can use legacy claude id" },

    // plus_yearly plan — should behave same as plus
    { plan: "plus_yearly", model: "doubao", expected: true, desc: "plus_yearly can use doubao" },
    { plan: "plus_yearly", model: "gpt54", expected: true, desc: "plus_yearly can use gpt54" },
    { plan: "plus_yearly", model: "claude46", expected: true, desc: "plus_yearly can use legacy claude id" },

    // pro plan
    { plan: "pro", model: "doubao", expected: true, desc: "pro can use doubao" },
    { plan: "pro", model: "gpt54", expected: true, desc: "pro can use gpt54" },
    { plan: "pro", model: "claude46", expected: true, desc: "pro can use claude46" },

    // pro_yearly plan — should behave same as pro
    { plan: "pro_yearly", model: "doubao", expected: true, desc: "pro_yearly can use doubao" },
    { plan: "pro_yearly", model: "gpt54", expected: true, desc: "pro_yearly can use gpt54" },
    { plan: "pro_yearly", model: "claude46", expected: true, desc: "pro_yearly can use claude46" },
  ];

  testCases.forEach(({ plan, model, expected, desc }) => {
    it(desc, () => {
      expect(canUseModel(plan, model)).toBe(expected);
    });
  });
});

describe("getHighestAvailableModel with yearly plans", () => {
  it("free → gpt54 (GPT-5.5)", () => {
    expect(getHighestAvailableModel("free")).toBe("gpt54");
  });

  it("plus → gpt54", () => {
    expect(getHighestAvailableModel("plus")).toBe("gpt54");
  });

  it("plus_yearly → gpt54 (same as plus)", () => {
    expect(getHighestAvailableModel("plus_yearly")).toBe("gpt54");
  });

  it("pro → gpt54 (GPT-5.5)", () => {
    expect(getHighestAvailableModel("pro")).toBe("gpt54");
  });

  it("pro_yearly → gpt54 (same as pro)", () => {
    expect(getHighestAvailableModel("pro_yearly")).toBe("gpt54");
  });
});
