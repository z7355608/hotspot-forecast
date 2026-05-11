/**
 * account-diagnosis-routes.test.ts
 * 验证账号诊断五件套（粉丝画像/兴趣话题/搜索词/作品分析/涨粉趋势）的路由注册
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const watchRuntimeSrc = fs.readFileSync(
  path.resolve(__dirname, "./legacy/watch-runtime.ts"),
  "utf-8",
);
const typesSrc = fs.readFileSync(
  path.resolve(__dirname, "./legacy/types.ts"),
  "utf-8",
);

describe("账号诊断五件套路由注册", () => {
  const expectedCapabilities = [
    "account_fans_portrait",
    "account_fans_interest_topics",
    "account_fans_interest_searches",
    "account_item_analysis",
    "account_fan_trends",
  ];

  const expectedPaths = [
    "/api/v1/douyin/billboard/fetch_hot_account_fans_portrait_list",
    "/api/v1/douyin/billboard/fetch_hot_account_fans_interest_topic_list",
    "/api/v1/douyin/billboard/fetch_hot_account_fans_interest_search_list",
    "/api/v1/douyin/billboard/fetch_hot_account_item_analysis_list",
    "/api/v1/douyin/billboard/fetch_hot_account_trends_list",
  ];

  for (const cap of expectedCapabilities) {
    it(`capability ${cap} 已注册`, () => {
      expect(watchRuntimeSrc).toContain(`capability: "${cap}"`);
    });
  }

  for (const p of expectedPaths) {
    it(`path ${p} 已注册`, () => {
      expect(watchRuntimeSrc).toContain(p);
    });
  }

  it("5 个 capability 都使用 GET 方法（billboard 类）", () => {
    // 找到第一个新路由块的索引（fans_portrait）
    const idx = watchRuntimeSrc.indexOf("/api/v1/douyin/billboard/fetch_hot_account_fans_portrait_list");
    expect(idx).toBeGreaterThan(-1);
    // 取前后 600 字符的块
    const block = watchRuntimeSrc.slice(idx - 200, idx + 2200);
    // 这个区域应该包含 5 个 method: "GET"
    const getMatches = block.match(/method:\s*"GET"/g);
    expect(getMatches).not.toBeNull();
    expect(getMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it("5 个 buildParams 都在 secUserId 缺失时返回 null（自动跳过）", () => {
    const idx = watchRuntimeSrc.indexOf("/api/v1/douyin/billboard/fetch_hot_account_fans_portrait_list");
    const block = watchRuntimeSrc.slice(idx - 200, idx + 2200);
    // 5 次出现 ctx.secUserId ? ... : null
    const matches = block.match(/ctx\.secUserId\s*\?[\s\S]*?:\s*null/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
  });

  it("getTaskPlan(douyin, account_watch) optional 列表包含 5 个新 capability", () => {
    // 抓 account_watch 的 plan 块
    const m = watchRuntimeSrc.match(/account_watch[\s\S]+?required:\s*\["account_profile"\][\s\S]+?optional:\s*\[([\s\S]+?)\]/);
    expect(m).not.toBeNull();
    const block = m![1];
    for (const cap of expectedCapabilities) {
      expect(block).toContain(`"${cap}"`);
    }
  });

  it("validatePayload 5 个新 capability 共用一个分支", () => {
    for (const cap of expectedCapabilities) {
      expect(watchRuntimeSrc).toContain(`capability === "${cap}"`);
    }
  });

  it("getFallbackFlag 5 个新 capability 映射到 fallback_account_diagnosis_route", () => {
    expect(watchRuntimeSrc).toContain("fallback_account_diagnosis_route");
  });

  it("DegradeFlag 类型已新增 fallback_account_diagnosis_route", () => {
    expect(typesSrc).toContain('"fallback_account_diagnosis_route"');
  });

  it("account_fans_portrait 使用 option=1（实测 1-5 可用，8 返回 400）", () => {
    const idx = watchRuntimeSrc.indexOf('"account_fans_portrait"');
    expect(idx).toBeGreaterThan(-1);
    const block = watchRuntimeSrc.slice(idx, idx + 600);
    expect(block).toContain("option: 1");
    expect(block).not.toContain("option: 8");
  });

  it("account_fan_trends 不传 date_window（实测 168/2 返回 400，仅 1/24 有效，依赖默认）", () => {
    const idx = watchRuntimeSrc.indexOf('"account_fan_trends"');
    expect(idx).toBeGreaterThan(-1);
    // 取直到下一条 capability 之前
    const nextCapIdx = watchRuntimeSrc.indexOf("capability:", idx + 30);
    const block = watchRuntimeSrc.slice(idx, nextCapIdx > 0 ? nextCapIdx : idx + 500);
    expect(block).toContain("option: 2");
    expect(block).not.toContain("date_window:");
  });
});
