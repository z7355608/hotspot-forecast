/**
 * credits.test.ts — 积分与会员路由单元测试
 */
import { describe, it, expect } from "vitest";
import {
  NEW_USER_CREDITS,
  CHECKIN_CREDITS,
  BASE_ANALYSIS_COST,
  EXTRA_PLATFORM_COST,
  CREDIT_PACKAGES,
  SUBSCRIPTION_PLANS,
} from "./routers/credits";

describe("积分常量", () => {
  it("新用户注册赠送 60 积分", () => {
    expect(NEW_USER_CREDITS).toBe(60);
  });

  it("每日签到赠送 5 积分", () => {
    expect(CHECKIN_CREDITS).toBe(5);
  });

  it("单平台分析基础消耗 20 积分", () => {
    expect(BASE_ANALYSIS_COST).toBe(20);
  });

  it("每增加一个平台额外消耗 10 积分", () => {
    expect(EXTRA_PLATFORM_COST).toBe(10);
  });
});

describe("积分包配置", () => {
  it("共有 4 个积分包", () => {
    expect(CREDIT_PACKAGES).toHaveLength(4);
  });

  it("积分包 ID 唯一", () => {
    const ids = CREDIT_PACKAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("所有积分包价格大于 0", () => {
    for (const pkg of CREDIT_PACKAGES) {
      expect(pkg.price).toBeGreaterThan(0);
    }
  });

  it("所有积分包积分数大于 0", () => {
    for (const pkg of CREDIT_PACKAGES) {
      expect(pkg.credits).toBeGreaterThan(0);
    }
  });
});

describe("会员套餐配置", () => {
  it("Plus 月付价格低于 Pro 月付", () => {
    expect(SUBSCRIPTION_PLANS.plus.monthly_once.price).toBeLessThan(
      SUBSCRIPTION_PLANS.pro.monthly_once.price
    );
  });

  it("连续包月价格低于单次月付", () => {
    expect(SUBSCRIPTION_PLANS.plus.monthly_auto.price).toBeLessThan(
      SUBSCRIPTION_PLANS.plus.monthly_once.price
    );
    expect(SUBSCRIPTION_PLANS.pro.monthly_auto.price).toBeLessThan(
      SUBSCRIPTION_PLANS.pro.monthly_once.price
    );
  });

  it("年付总价低于 12 个月单次月付总价", () => {
    const plusYearlyTotal = SUBSCRIPTION_PLANS.plus.yearly.price;
    const plusMonthly12 = SUBSCRIPTION_PLANS.plus.monthly_once.price * 12;
    expect(plusYearlyTotal).toBeLessThan(plusMonthly12);

    const proYearlyTotal = SUBSCRIPTION_PLANS.pro.yearly.price;
    const proMonthly12 = SUBSCRIPTION_PLANS.pro.monthly_once.price * 12;
    expect(proYearlyTotal).toBeLessThan(proMonthly12);
  });

  it("年付积分等于 12 个月月付积分", () => {
    expect(SUBSCRIPTION_PLANS.plus.yearly.credits).toBe(
      SUBSCRIPTION_PLANS.plus.monthly_once.credits * 12
    );
    expect(SUBSCRIPTION_PLANS.pro.yearly.credits).toBe(
      SUBSCRIPTION_PLANS.pro.monthly_once.credits * 12
    );
  });
});

describe("多平台积分计算逻辑", () => {
  function calcCost(platformCount: number) {
    return BASE_ANALYSIS_COST + Math.max(platformCount - 1, 0) * EXTRA_PLATFORM_COST;
  }

  it("单平台（抖音）消耗 20 积分", () => {
    expect(calcCost(1)).toBe(20);
  });

  it("双平台消耗 30 积分", () => {
    expect(calcCost(2)).toBe(30);
  });

  it("三平台消耗 40 积分", () => {
    expect(calcCost(3)).toBe(40);
  });
});
