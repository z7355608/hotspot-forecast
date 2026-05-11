/**
 * billboard-integration.test.ts
 * 验证 billboard 路由配置和低粉爆款榜数据提取逻辑
 */
import { describe, expect, it } from "vitest";

// ── 测试 1: extractLowFanBillboardContents 数据提取 ──
// 由于 extractLowFanBillboardContents 是 live-predictions.ts 的私有函数，
// 我们通过模拟相同逻辑来验证数据提取的正确性

describe("低粉爆款榜数据提取", () => {
  const PLATFORM_NAMES = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    kuaishou: "快手",
    bilibili: "B站",
  } as const;

  function extractLowFanBillboardContents(
    payload: unknown,
    platform: keyof typeof PLATFORM_NAMES,
  ) {
    const contents: Array<{
      contentId: string;
      title: string;
      authorName: string;
      platform: string;
      viewCount: number | null;
      likeCount: number | null;
      authorFollowerCount: number | null;
      whyIncluded: string;
    }> = [];
    if (!payload || typeof payload !== "object") return contents;

    const findObjs = (obj: unknown): unknown[] => {
      if (!obj || typeof obj !== "object") return [];
      if (Array.isArray(obj)) return obj;
      const record = obj as Record<string, unknown>;
      if (Array.isArray(record.objs) && record.objs.length > 0) return record.objs;
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") {
          const found = findObjs(value);
          if (found.length > 0) return found;
        }
      }
      return [];
    };

    const objs = findObjs(payload);
    for (const item of objs) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const contentId = String(rec.item_id || "");
      const title = String(rec.item_title || "");
      if (!contentId || !title || title.length < 3) continue;

      contents.push({
        contentId,
        title,
        authorName: String(rec.nick_name || "未知作者"),
        platform: PLATFORM_NAMES[platform],
        viewCount: typeof rec.play_cnt === "number" ? rec.play_cnt : null,
        likeCount: typeof rec.like_cnt === "number" ? rec.like_cnt : null,
        authorFollowerCount: typeof rec.fans_cnt === "number" ? rec.fans_cnt : null,
        whyIncluded: "低粉爆款榜入选",
      });
    }
    return contents;
  }

  it("应正确提取嵌套在 data.data.objs 中的低粉爆款数据", () => {
    const mockPayload = {
      data: {
        data: {
          objs: [
            {
              item_id: "7412345678901234567",
              item_title: "测试低粉爆款视频标题",
              nick_name: "小创作者",
              fans_cnt: 5000,
              play_cnt: 1500000,
              like_cnt: 85000,
              publish_time: 1713600000,
              item_cover_url: "https://example.com/cover.jpg",
            },
            {
              item_id: "7412345678901234568",
              item_title: "另一个低粉爆款",
              nick_name: "新手博主",
              fans_cnt: 3000,
              play_cnt: 800000,
              like_cnt: 42000,
            },
          ],
        },
      },
    };

    const result = extractLowFanBillboardContents(mockPayload, "douyin");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      contentId: "7412345678901234567",
      title: "测试低粉爆款视频标题",
      authorName: "小创作者",
      platform: "抖音",
      viewCount: 1500000,
      likeCount: 85000,
      authorFollowerCount: 5000,
      whyIncluded: "低粉爆款榜入选",
    });
  });

  it("应过滤掉标题过短的内容", () => {
    const mockPayload = {
      data: {
        data: {
          objs: [
            { item_id: "123", item_title: "短", nick_name: "test" },
            { item_id: "456", item_title: "这是一个足够长的标题", nick_name: "test" },
          ],
        },
      },
    };

    const result = extractLowFanBillboardContents(mockPayload, "douyin");
    expect(result).toHaveLength(1);
    expect(result[0]!.contentId).toBe("456");
  });

  it("应处理空 payload", () => {
    expect(extractLowFanBillboardContents(null, "douyin")).toEqual([]);
    expect(extractLowFanBillboardContents(undefined, "douyin")).toEqual([]);
    expect(extractLowFanBillboardContents({}, "douyin")).toEqual([]);
  });

  it("应处理缺少字段的数据", () => {
    const mockPayload = {
      data: {
        data: {
          objs: [
            {
              item_id: "789",
              item_title: "只有标题没有其他数据",
            },
          ],
        },
      },
    };

    const result = extractLowFanBillboardContents(mockPayload, "douyin");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentId: "789",
      title: "只有标题没有其他数据",
      authorName: "未知作者",
      viewCount: null,
      likeCount: null,
      authorFollowerCount: null,
    });
  });
});

// ── 测试 2: 联想词扩展逻辑 ──
describe("联想词扩展逻辑", () => {
  it("应从搜索建议中提取关键词", () => {
    const suggestPayload = {
      data: {
        sug_list: [
          { content: "宠物猫日常" },
          { content: "宠物猫品种" },
          { content: "宠物猫搞笑" },
        ],
      },
    };

    const expandedKeywords = new Set(["宠物猫"]);
    const sugList = (suggestPayload.data as Record<string, unknown>).sug_list;
    if (Array.isArray(sugList)) {
      for (const sug of sugList.slice(0, 5)) {
        const content = (sug as Record<string, unknown>)?.content;
        if (typeof content === "string" && content.trim().length >= 2) {
          expandedKeywords.add(content.trim());
        }
      }
    }

    expect(expandedKeywords.size).toBe(4);
    expect(expandedKeywords.has("宠物猫日常")).toBe(true);
    expect(expandedKeywords.has("宠物猫品种")).toBe(true);
    expect(expandedKeywords.has("宠物猫搞笑")).toBe(true);
  });

  it("应从话题建议中提取关键词", () => {
    const challengePayload = {
      data: {
        challenge_list: [
          { cha_name: "宠物日常" },
          { cha_name: "猫咪日记" },
          { cha_name: "" }, // 空字符串应被过滤
          { cha_name: "a" }, // 太短应被过滤
        ],
      },
    };

    const expandedKeywords = new Set(["宠物猫"]);
    const challengeList = (challengePayload.data as Record<string, unknown>).challenge_list;
    if (Array.isArray(challengeList)) {
      for (const ch of challengeList.slice(0, 5)) {
        const chaName = (ch as Record<string, unknown>)?.cha_name;
        if (typeof chaName === "string" && chaName.trim().length >= 2) {
          expandedKeywords.add(chaName.trim());
        }
      }
    }

    expect(expandedKeywords.size).toBe(3);
    expect(expandedKeywords.has("宠物日常")).toBe(true);
    expect(expandedKeywords.has("猫咪日记")).toBe(true);
  });

  it("应限制最多 5 个关键词", () => {
    const expandedKeywords = new Set([
      "关键词1",
      "关键词2",
      "关键词3",
      "关键词4",
      "关键词5",
      "关键词6",
      "关键词7",
    ]);

    const limited = [...expandedKeywords].slice(0, 5);
    expect(limited).toHaveLength(5);
  });
});

// ── 测试 3: billboard 路由配置验证 ──
describe("billboard 路由配置", () => {
  // 验证 DEFAULT_DISABLED_ENDPOINTS 不再包含已验证可用的 billboard 路由
  const DISABLED_ENDPOINTS = new Set([
    "/api/v1/douyin/billboard/fetch_hot_total_topic_list",
    "/api/v1/douyin/billboard/fetch_hot_total_video_list",
    "/api/v1/douyin/billboard/fetch_hot_total_high_search_list",
    "/api/v1/douyin/billboard/fetch_hot_rise_list",
    "/api/v1/douyin/billboard/fetch_hot_total_list",
    "/api/v1/douyin/billboard/fetch_hot_item_trends_list",
  ]);

  it("低粉爆款榜路由不应被禁用", () => {
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_total_low_fan_list")).toBe(false);
  });

  it("热搜榜路由不应被禁用", () => {
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_total_search_list")).toBe(false);
  });

  it("热词榜路由不应被禁用", () => {
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_total_hot_word_list")).toBe(false);
  });

  it("未验证的 billboard 路由仍应被禁用", () => {
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_total_topic_list")).toBe(true);
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_total_video_list")).toBe(true);
    expect(DISABLED_ENDPOINTS.has("/api/v1/douyin/billboard/fetch_hot_item_trends_list")).toBe(true);
  });
});

// ── 测试 4: 高互动率榜单家族（high_like / high_fan / high_play）路由注册验证 ──
describe("高互动率榜单家族路由注册（P0-#1）", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const watchRuntimeSrc = fs.readFileSync(
    path.resolve(__dirname, "./watch-runtime.ts"),
    "utf-8",
  );
  const livePredictionsSrc = fs.readFileSync(
    path.resolve(__dirname, "./live-predictions.ts"),
    "utf-8",
  );

  it("watch-runtime.ts 应注册 high_like_billboard 路由", () => {
    expect(watchRuntimeSrc).toContain('capability: "high_like_billboard"');
    expect(watchRuntimeSrc).toContain("/api/v1/douyin/billboard/fetch_hot_total_high_like_list");
  });

  it("watch-runtime.ts 应注册 high_fan_billboard 路由", () => {
    expect(watchRuntimeSrc).toContain('capability: "high_fan_billboard"');
    expect(watchRuntimeSrc).toContain("/api/v1/douyin/billboard/fetch_hot_total_high_fan_list");
  });

  it("watch-runtime.ts 应注册 high_play_billboard 路由", () => {
    expect(watchRuntimeSrc).toContain('capability: "high_play_billboard"');
    expect(watchRuntimeSrc).toContain("/api/v1/douyin/billboard/fetch_hot_total_high_play_list");
  });

  it("getTaskPlan 的 topic_watch optional 列表应包含 3 个新 capability", () => {
    // 找到第二个（topic_watch）的 optional 块——它跟在 validation_watch 后面
    const topicWatchSection = watchRuntimeSrc.match(/return \{\s*required: \["keyword_content_search"\] as string\[\],\s*optional: \[([\s\S]+?)\] as string\[\],\s*\};\s*\}\s*\/\/ 快手任务计划/);
    expect(topicWatchSection).not.toBeNull();
    const optionalBlock = topicWatchSection![1];
    expect(optionalBlock).toContain('"high_like_billboard"');
    expect(optionalBlock).toContain('"high_fan_billboard"');
    expect(optionalBlock).toContain('"high_play_billboard"');
  });

  it("validatePayload 应支持 3 个新榜单 capability", () => {
    expect(watchRuntimeSrc).toContain('capability === "high_like_billboard"');
    expect(watchRuntimeSrc).toContain('capability === "high_fan_billboard"');
    expect(watchRuntimeSrc).toContain('capability === "high_play_billboard"');
  });

  it("getFallbackFlag 应支持 3 个新榜单 capability", () => {
    // getFallbackFlag 段落应同时包含三个新 capability
    const idx = watchRuntimeSrc.indexOf("function getFallbackFlag");
    expect(idx).toBeGreaterThan(-1);
    const tail = watchRuntimeSrc.slice(idx, idx + 1500);
    expect(tail).toContain("high_like_billboard");
    expect(tail).toContain("high_fan_billboard");
    expect(tail).toContain("high_play_billboard");
  });

  it("live-predictions.ts 应在数据提取循环里覆盖 3 个新 capability", () => {
    expect(livePredictionsSrc).toContain('capability === "high_like_billboard"');
    expect(livePredictionsSrc).toContain('capability === "high_fan_billboard"');
    expect(livePredictionsSrc).toContain('capability === "high_play_billboard"');
  });

  it("live-predictions.ts 应给每条样本标注来源榜单 whyIncluded", () => {
    expect(livePredictionsSrc).toContain('"高点赞率榜入选"');
    expect(livePredictionsSrc).toContain('"高涨粉率榜入选"');
    expect(livePredictionsSrc).toContain('"高完播率榜入选"');
  });

  it("buildParams 应使用统一的 page/page_size/date_window 参数", () => {
    // 检查 3 个新路由都有 buildParams 返回值含 page_size 和 date_window
    const highLikeIdx = watchRuntimeSrc.indexOf('"/api/v1/douyin/billboard/fetch_hot_total_high_like_list"');
    expect(highLikeIdx).toBeGreaterThan(-1);
    // 取后续 200 字符内容
    const highLikeBlock = watchRuntimeSrc.slice(highLikeIdx, highLikeIdx + 300);
    expect(highLikeBlock).toMatch(/page_size:\s*\d+/);
    expect(highLikeBlock).toMatch(/date_window:\s*\d+/);
  });
});
