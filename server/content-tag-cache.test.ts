/**
 * content-tag-cache.test.ts
 * 验证垂类标签缓存 + LLM 映射逻辑
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./legacy/tikhub", () => ({
  getTikHub: vi.fn(),
  postTikHub: vi.fn(),
}));
vi.mock("./legacy/llm-gateway", () => ({
  callLLM: vi.fn(),
}));

import { getTikHub } from "./legacy/tikhub";
import { callLLM } from "./legacy/llm-gateway";
import {
  getContentTagTree,
  mapPromptToTag,
  _resetTagCacheForTest,
} from "./legacy/content-tag-cache";

const mockedGetTikHub = vi.mocked(getTikHub);
const mockedCallLLM = vi.mocked(callLLM);

// 模拟一份精简的标签树响应（覆盖 5 个顶级 + 3-4 个子类）
function mockTagTreeResponse() {
  mockedGetTikHub.mockResolvedValue({
    ok: true,
    payload: {
      data: {
        code: 0,
        data: [
          {
            value: 628,
            label: "美食",
            children: [
              { value: 62801, label: "美食探店" },
              { value: 62803, label: "美食测评" },
              { value: 62805, label: "吃播" },
            ],
          },
          {
            value: 617,
            label: "母婴",
            children: [
              { value: 61701, label: "母婴日常" },
              { value: 61702, label: "母婴知识" },
              { value: 61703, label: "母婴种草" },
            ],
          },
          {
            value: 633,
            label: "体育",
            children: [
              { value: 63301, label: "健身" },
              { value: 63302, label: "球类运动" },
            ],
          },
          { value: 615, label: "科技", children: [] },
          { value: 605, label: "电视剧", children: [{ value: 60501, label: "国产剧" }] },
        ],
      },
    },
    httpStatus: 200,
    businessCode: 0,
    requestId: "test",
  } as unknown as Awaited<ReturnType<typeof getTikHub>>);
}

function mockLLMReturn(payload: object) {
  mockedCallLLM.mockResolvedValueOnce({
    content: JSON.stringify(payload),
    model: "doubao-test",
    promptTokens: 0,
    completionTokens: 0,
  });
}

beforeEach(() => {
  _resetTagCacheForTest();
});

afterEach(() => {
  mockedGetTikHub.mockReset();
  mockedCallLLM.mockReset();
});

describe("getContentTagTree - 缓存", () => {
  it("首次调用拉取并缓存", async () => {
    mockTagTreeResponse();
    const tree = await getContentTagTree();
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(5);
    expect(tree!.find((t) => t.label === "母婴")?.value).toBe(617);
    expect(mockedGetTikHub).toHaveBeenCalledTimes(1);
  });

  it("第二次调用走缓存，不再调 TikHub", async () => {
    mockTagTreeResponse();
    await getContentTagTree();
    await getContentTagTree();
    await getContentTagTree();
    expect(mockedGetTikHub).toHaveBeenCalledTimes(1);
  });

  it("并发调用共享 inflight Promise", async () => {
    mockTagTreeResponse();
    const [a, b, c] = await Promise.all([
      getContentTagTree(),
      getContentTagTree(),
      getContentTagTree(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockedGetTikHub).toHaveBeenCalledTimes(1);
  });

  it("TikHub 拉取失败时返回 null（不抛错）", async () => {
    mockedGetTikHub.mockRejectedValueOnce(new Error("network down"));
    const tree = await getContentTagTree();
    expect(tree).toBeNull();
  });

  it("TikHub 返回结构异常（不是 array）时返回 null", async () => {
    mockedGetTikHub.mockResolvedValueOnce({
      ok: true,
      payload: { data: { code: 0, data: "not an array" } },
    } as unknown as Awaited<ReturnType<typeof getTikHub>>);
    const tree = await getContentTagTree();
    expect(tree).toBeNull();
  });
});

describe("mapPromptToTag - LLM 映射", () => {
  it("返回顶级 + 子类，构造 tags 参数", async () => {
    mockTagTreeResponse();
    mockLLMReturn({
      topValue: 617,
      topLabel: "母婴",
      children: [
        { value: 61702, label: "母婴知识" },
        { value: 61703, label: "母婴种草" },
      ],
    });
    const tag = await mapPromptToTag("母婴辅食赛道哪些低粉爆款");
    expect(tag).toEqual({
      value: 617,
      children: [{ value: 61702 }, { value: 61703 }],
    });
  });

  it("LLM 返回 topValue=null（用户输入与垂类无关，如本地商家）→ null", async () => {
    mockTagTreeResponse();
    mockLLMReturn({ topValue: null });
    const tag = await mapPromptToTag("上海一点点奶茶陆家嘴店");
    expect(tag).toBeNull();
  });

  it("LLM 返回不在标签树中的 topValue 时丢弃（防止编造）", async () => {
    mockTagTreeResponse();
    mockLLMReturn({ topValue: 999, topLabel: "不存在", children: [] });
    const tag = await mapPromptToTag("随便");
    expect(tag).toBeNull();
  });

  it("LLM 返回的子类不在该顶级 children 里时被过滤", async () => {
    mockTagTreeResponse();
    mockLLMReturn({
      topValue: 617,
      children: [
        { value: 61702 }, // 合法
        { value: 99999 }, // 不在 children 里，应被过滤
      ],
    });
    const tag = await mapPromptToTag("母婴");
    expect(tag).toEqual({ value: 617, children: [{ value: 61702 }] });
  });

  it("最多保留 3 个子类", async () => {
    mockTagTreeResponse();
    mockLLMReturn({
      topValue: 628,
      children: [
        { value: 62801 },
        { value: 62803 },
        { value: 62805 },
        { value: 62801 }, // 子类组里超出 3 个会截断
      ],
    });
    const tag = await mapPromptToTag("美食");
    expect(tag!.children!.length).toBeLessThanOrEqual(3);
  });

  it("空 prompt → 直接 null（不调 LLM）", async () => {
    const tag = await mapPromptToTag("");
    expect(tag).toBeNull();
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("LLM 调用失败 → null（不抛错）", async () => {
    mockTagTreeResponse();
    mockedCallLLM.mockRejectedValueOnce(new Error("LLM error"));
    const tag = await mapPromptToTag("健身");
    expect(tag).toBeNull();
  });

  it("LLM 返回非 JSON → null", async () => {
    mockTagTreeResponse();
    mockedCallLLM.mockResolvedValueOnce({
      content: "我不知道怎么映射",
      model: "doubao",
      promptTokens: 0,
      completionTokens: 0,
    });
    const tag = await mapPromptToTag("健身");
    expect(tag).toBeNull();
  });

  it("没有标签树（getContentTagTree null）→ 直接 null，不调 LLM", async () => {
    mockedGetTikHub.mockRejectedValueOnce(new Error("network"));
    const tag = await mapPromptToTag("健身");
    expect(tag).toBeNull();
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });
});

describe("watch-runtime + live-predictions 集成验证", () => {
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

  it("RuntimeContext 应含 contentTags 字段", () => {
    expect(watchRuntimeSrc).toContain("contentTags?: Array<{ value: number; children?: Array<{ value: number }>");
  });

  it("buildParams 4 个互动率榜单都从 ctx.contentTags 注入 tags", () => {
    // 4 个 capability 都应该有 tags 注入逻辑
    const tagsInjections = watchRuntimeSrc.match(/ctx\.contentTags && ctx\.contentTags\.length > 0 \? \{ tags: ctx\.contentTags \} : \{\}/g);
    expect(tagsInjections).not.toBeNull();
    expect(tagsInjections!.length).toBeGreaterThanOrEqual(4);
  });

  it("runWatchTaskWithFallback 签名应接受 contentTags 参数", () => {
    expect(watchRuntimeSrc).toContain("contentTags?: Array<{ value: number; children?: Array<{ value: number }>");
    expect(watchRuntimeSrc).toContain("context.contentTags = contentTags");
  });

  it("live-predictions.ts 应在主流程调用 mapPromptToTag", () => {
    expect(livePredictionsSrc).toContain('import { mapPromptToTag } from "./content-tag-cache.js"');
    expect(livePredictionsSrc).toContain("mapPromptToTag(effectiveSeedTopic)");
    expect(livePredictionsSrc).toContain("contentTagsForRunner");
  });

  it("两个 runWatchTaskWithFallback 调用都注入了 contentTags", () => {
    const callsWithTags = livePredictionsSrc.match(/contentTags:\s*contentTagsForRunner/g);
    expect(callsWithTags).not.toBeNull();
    expect(callsWithTags!.length).toBe(2);
  });
});
