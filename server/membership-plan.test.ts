/**
 * membership-plan.test.ts — 会员等级归一化 & 模型解锁测试
 * 验证 plus_yearly / pro_yearly 等年付变体能正确解锁对应模型
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
    { plan: "free", model: "gpt54", expected: false, desc: "free cannot use gpt54" },
    { plan: "free", model: "claude46", expected: false, desc: "free cannot use claude46" },

    // plus plan
    { plan: "plus", model: "doubao", expected: true, desc: "plus can use doubao" },
    { plan: "plus", model: "gpt54", expected: true, desc: "plus can use gpt54" },
    { plan: "plus", model: "claude46", expected: false, desc: "plus cannot use claude46" },

    // plus_yearly plan — should behave same as plus
    { plan: "plus_yearly", model: "doubao", expected: true, desc: "plus_yearly can use doubao" },
    { plan: "plus_yearly", model: "gpt54", expected: true, desc: "plus_yearly can use gpt54" },
    { plan: "plus_yearly", model: "claude46", expected: false, desc: "plus_yearly cannot use claude46" },

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
  it("free → doubao", () => {
    expect(getHighestAvailableModel("free")).toBe("doubao");
  });

  it("plus → gpt54", () => {
    expect(getHighestAvailableModel("plus")).toBe("gpt54");
  });

  it("plus_yearly → gpt54 (same as plus)", () => {
    expect(getHighestAvailableModel("plus_yearly")).toBe("gpt54");
  });

  it("pro → claude46", () => {
    expect(getHighestAvailableModel("pro")).toBe("claude46");
  });

  it("pro_yearly → claude46 (same as pro)", () => {
    expect(getHighestAvailableModel("pro_yearly")).toBe("claude46");
  });
});
