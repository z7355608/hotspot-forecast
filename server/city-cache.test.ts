/**
 * city-cache.test.ts
 * 验证城市编码缓存 + Prompt 城市提取（关键词匹配）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./legacy/tikhub", () => ({
  getTikHub: vi.fn(),
  postTikHub: vi.fn(),
}));

import { getTikHub } from "./legacy/tikhub";
import {
  getCityList,
  extractCityFromPrompt,
  _resetCityCacheForTest,
} from "./legacy/city-cache";

const mockedGetTikHub = vi.mocked(getTikHub);

function mockCityListResponse() {
  mockedGetTikHub.mockResolvedValue({
    ok: true,
    payload: {
      data: {
        code: 0,
        data: [
          { value: 110000, label: "北京" },
          { value: 310000, label: "上海" },
          { value: 440100, label: "广州" },
          { value: 440300, label: "深圳" },
          { value: 330100, label: "杭州" },
          { value: 510100, label: "成都" },
          { value: 320100, label: "南京" },
        ],
      },
    },
    httpStatus: 200,
    businessCode: 0,
    requestId: "test",
  } as unknown as Awaited<ReturnType<typeof getTikHub>>);
}

beforeEach(() => {
  _resetCityCacheForTest();
});

afterEach(() => {
  mockedGetTikHub.mockReset();
});

describe("getCityList - 缓存", () => {
  it("首次拉取并缓存", async () => {
    mockCityListResponse();
    const list = await getCityList();
    expect(list).not.toBeNull();
    expect(list!.length).toBe(7);
    expect(list!.find((c) => c.label === "上海")?.cityCode).toBe("310000");
    expect(mockedGetTikHub).toHaveBeenCalledTimes(1);
  });

  it("第二次走缓存", async () => {
    mockCityListResponse();
    await getCityList();
    await getCityList();
    expect(mockedGetTikHub).toHaveBeenCalledTimes(1);
  });

  it("拉取失败返回 null", async () => {
    mockedGetTikHub.mockRejectedValueOnce(new Error("network"));
    const list = await getCityList();
    expect(list).toBeNull();
  });

  it("结构异常返回 null", async () => {
    mockedGetTikHub.mockResolvedValueOnce({
      ok: true,
      payload: { data: { code: 0, data: "not array" } },
    } as unknown as Awaited<ReturnType<typeof getTikHub>>);
    const list = await getCityList();
    expect(list).toBeNull();
  });
});

describe("extractCityFromPrompt - 关键词匹配", () => {
  it("命中上海", async () => {
    mockCityListResponse();
    const hit = await extractCityFromPrompt("我是上海一点点奶茶陆家嘴店，现在发什么会火");
    expect(hit).toEqual({ cityCode: "310000", label: "上海" });
  });

  it("命中北京", async () => {
    mockCityListResponse();
    const hit = await extractCityFromPrompt("北京三里屯现在什么餐厅最火");
    expect(hit).toEqual({ cityCode: "110000", label: "北京" });
  });

  it("命中杭州", async () => {
    mockCityListResponse();
    const hit = await extractCityFromPrompt("杭州西湖周边的网红店");
    expect(hit).toEqual({ cityCode: "330100", label: "杭州" });
  });

  it("多个城市命中时取最早出现的", async () => {
    mockCityListResponse();
    const hit = await extractCityFromPrompt("上海跟北京哪个城市更适合直播带货");
    expect(hit?.label).toBe("上海"); // "上海" 在 "北京" 之前
  });

  it("没有城市命中时返回 null", async () => {
    mockCityListResponse();
    const hit = await extractCityFromPrompt("健身减脂赛道现在什么内容会火");
    expect(hit).toBeNull();
  });

  it("空 prompt 返回 null（不触发缓存读取）", async () => {
    const hit = await extractCityFromPrompt("");
    expect(hit).toBeNull();
    expect(mockedGetTikHub).not.toHaveBeenCalled();
  });

  it("城市列表拉取失败时返回 null", async () => {
    mockedGetTikHub.mockRejectedValueOnce(new Error("net"));
    const hit = await extractCityFromPrompt("我在上海");
    expect(hit).toBeNull();
  });
});

describe("watch-runtime + live-predictions 同城集成验证", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const watchRuntimeSrc = fs.readFileSync(
    path.resolve(__dirname, "./legacy/watch-runtime.ts"),
    "utf-8",
  );
  const livePredictionsSrc = fs.readFileSync(
    path.resolve(__dirname, "./legacy/live-predictions.ts"),
    "utf-8",
  );

  it("RuntimeContext 应含 cityCode 字段", () => {
    expect(watchRuntimeSrc).toContain("cityCode?: string");
  });

  it("city_hot_billboard 路由已注册（GET 方法）", () => {
    expect(watchRuntimeSrc).toContain('capability: "city_hot_billboard"');
    expect(watchRuntimeSrc).toContain("/api/v1/douyin/billboard/fetch_hot_city_list");
    // 必须是 GET（其他 billboard 是 POST）
    const routeIdx = watchRuntimeSrc.indexOf('"/api/v1/douyin/billboard/fetch_hot_city_list"');
    const block = watchRuntimeSrc.slice(routeIdx - 200, routeIdx + 50);
    expect(block).toContain('method: "GET"');
  });

  it("buildParams 在无 cityCode 时返回 null（自动跳过）", () => {
    expect(watchRuntimeSrc).toContain("ctx.cityCode\n        ? { page: 1, page_size: 10, order: \"rank\", city_code: ctx.cityCode }");
    expect(watchRuntimeSrc).toContain("        : null,");
  });

  it("getTaskPlan optional 列表包含 city_hot_billboard", () => {
    const matches = watchRuntimeSrc.match(/"city_hot_billboard"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2); // topic_watch + validation_watch
  });

  it("validatePayload + getFallbackFlag 支持 city_hot_billboard", () => {
    expect(watchRuntimeSrc).toContain('capability === "city_hot_billboard"');
  });

  it("runWatchTaskWithFallback 接受 cityCode 参数", () => {
    expect(watchRuntimeSrc).toContain("cityCode?: string");
    expect(watchRuntimeSrc).toContain("context.cityCode = cityCode");
  });

  it("live-predictions.ts 调用 extractCityFromPrompt 并注入 cityCode", () => {
    expect(livePredictionsSrc).toContain('import { extractCityFromPrompt } from "./city-cache.js"');
    expect(livePredictionsSrc).toContain("extractCityFromPrompt(draft.prompt)");
    expect(livePredictionsSrc).toContain("cityCodeForRunner");
    const matches = livePredictionsSrc.match(/cityCode:\s*cityCodeForRunner/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2); // 主流程 + fallback 各一次
  });

  it("数据提取循环处理 city_hot_billboard 并入 hotSeedCount + trendingTags", () => {
    expect(livePredictionsSrc).toContain('capability === "city_hot_billboard"');
    expect(livePredictionsSrc).toContain("__cityHotTopics");
  });

  it("trendingTags 合并同城热点话题", () => {
    expect(livePredictionsSrc).toContain("__cityHotTopics");
    expect(livePredictionsSrc).toContain("cityTagged");
  });
});
