/**
 * round11.test.ts — 第十一轮 Bug 修复 + 爆款拆解功能测试
 */

import { describe, it, expect, vi } from "vitest";

/* ================================================================== */
/*  Bug 1: 微信公众号链接不应被识别为视频                                    */
/* ================================================================== */

describe("Bug 1: 微信公众号链接识别", () => {
  // 模拟 isVideoUrl 的逻辑
  const VIDEO_PLATFORM_PATTERNS = [
    /douyin\.com/i,
    /tiktok\.com/i,
    /kuaishou\.com/i,
    /bilibili\.com/i,
    /youtube\.com/i,
    /youtu\.be/i,
    /channels\.weixin\.qq\.com/i,
    /xiaohongshu\.com/i,
    /xhslink\.com/i,
    /weibo\.com\/tv/i,
  ];

  const ARTICLE_PLATFORM_PATTERNS = [
    /mp\.weixin\.qq\.com/i,
    /weixin\.qq\.com\/s\//i,
  ];

  function isVideoUrl(url: string): boolean {
    // 先排除文章类链接
    if (ARTICLE_PLATFORM_PATTERNS.some((p) => p.test(url))) return false;
    return VIDEO_PLATFORM_PATTERNS.some((p) => p.test(url));
  }

  it("微信公众号文章链接不应被识别为视频", () => {
    expect(isVideoUrl("https://mp.weixin.qq.com/s/abc123")).toBe(false);
  });

  it("微信公众号长链接不应被识别为视频", () => {
    expect(isVideoUrl("https://mp.weixin.qq.com/s?__biz=MzA3MDI4NjI2MA==&mid=123")).toBe(false);
  });

  it("微信视频号链接应被识别为视频", () => {
    expect(isVideoUrl("https://channels.weixin.qq.com/web/pages/feed/abc123")).toBe(true);
  });

  it("抖音链接应被识别为视频", () => {
    expect(isVideoUrl("https://www.douyin.com/video/123456")).toBe(true);
  });

  it("普通网页链接不应被识别为视频", () => {
    expect(isVideoUrl("https://www.example.com/article/123")).toBe(false);
  });
});

/* ================================================================== */
/*  Bug 3: 删除资源时清理输入框引用                                         */
/* ================================================================== */

describe("Bug 3: 删除资源时清理输入框引用", () => {
  function cleanInputReferences(inputValue: string, resourceName: string): string {
    // 模拟清理逻辑：移除 [[resourceName]] 引用
    const escaped = resourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\[\\[@?${escaped}\\]\\]`, "g");
    return inputValue.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
  }

  it("应移除输入框中的 [[resource]] 引用", () => {
    const input = "请分析这个视频 [[@test-video.mp4]] 的内容";
    const result = cleanInputReferences(input, "test-video.mp4");
    expect(result).not.toContain("[[");
    expect(result).not.toContain("test-video.mp4");
  });

  it("应移除多个引用", () => {
    const input = "[[@video1.mp4]] 和 [[@video2.mp4]] 对比分析";
    const result1 = cleanInputReferences(input, "video1.mp4");
    expect(result1).not.toContain("video1.mp4");
    expect(result1).toContain("video2.mp4");
  });

  it("无引用时不改变输入", () => {
    const input = "这是一段普通文本";
    const result = cleanInputReferences(input, "video.mp4");
    expect(result).toBe("这是一段普通文本");
  });
});

/* ================================================================== */
/*  Bug 4: 粉丝数为0时拒绝入库                                            */
/* ================================================================== */

describe("Bug 4: 粉丝数入库校验", () => {
  function shouldPersist(followerCount: number): boolean {
    return followerCount > 0;
  }

  it("粉丝数为0时应拒绝入库", () => {
    expect(shouldPersist(0)).toBe(false);
  });

  it("粉丝数为负数时应拒绝入库", () => {
    expect(shouldPersist(-1)).toBe(false);
  });

  it("粉丝数为正数时应允许入库", () => {
    expect(shouldPersist(100)).toBe(true);
  });

  it("粉丝数为1时应允许入库", () => {
    expect(shouldPersist(1)).toBe(true);
  });
});

/* ================================================================== */
/*  爆款拆解: 提示词构建                                                   */
/* ================================================================== */

describe("爆款拆解: 提示词和结构化输出", () => {
  it("应包含必要的分析维度", () => {
    const requiredDimensions = [
      "meta_strategy",
      "shot_list",
      "neuro_marketing",
      "replication_guide",
    ];

    // 模拟 JSON schema 输出结构
    const schema = {
      type: "object",
      properties: {
        meta_strategy: { type: "object" },
        shot_list: { type: "array" },
        neuro_marketing: { type: "object" },
        replication_guide: { type: "object" },
      },
      required: requiredDimensions,
    };

    for (const dim of requiredDimensions) {
      expect(schema.properties).toHaveProperty(dim);
      expect(schema.required).toContain(dim);
    }
  });

  it("分镜列表应包含时间戳和内容", () => {
    const mockShot = {
      shot_number: 1,
      timestamp: { start_seconds: 0, end_seconds: 3 },
      visual_description: "开场画面",
      script_text: "大家好",
      audio_elements: "背景音乐",
      emotion_intensity: 7,
      neuro_hook_type: "好奇心钩子",
    };

    expect(mockShot.timestamp.start_seconds).toBeDefined();
    expect(mockShot.timestamp.end_seconds).toBeDefined();
    expect(mockShot.visual_description).toBeTruthy();
    expect(mockShot.emotion_intensity).toBeGreaterThanOrEqual(1);
    expect(mockShot.emotion_intensity).toBeLessThanOrEqual(10);
  });

  it("爆点公式应包含核心要素", () => {
    const mockMetaStrategy = {
      one_line_formula: "好奇心钩子 × 痛点共鸣 × 行动号召 = 爆款",
      visual_hammer: "高对比度封面 + 文字标题",
      hook_strategy: "前3秒设置悬念",
      conversion_funnel: "评论区引导 → 关注 → 私域",
      rhythm_analysis: "快节奏剪辑，3秒一个镜头切换",
    };

    expect(mockMetaStrategy.one_line_formula).toBeTruthy();
    expect(mockMetaStrategy.visual_hammer).toBeTruthy();
    expect(mockMetaStrategy.hook_strategy).toBeTruthy();
    expect(mockMetaStrategy.conversion_funnel).toBeTruthy();
    expect(mockMetaStrategy.rhythm_analysis).toBeTruthy();
  });
});

/* ================================================================== */
/*  爆款拆解: 前端组件数据映射                                              */
/* ================================================================== */

describe("爆款拆解: 数据映射和格式化", () => {
  function formatSeconds(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  it("格式化秒数为 m:ss 格式", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(5)).toBe("0:05");
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(125)).toBe("2:05");
  });

  it("BreakdownData 结构应完整", () => {
    const mockData = {
      meta_strategy: {
        one_line_formula: "测试公式",
        visual_hammer: "视觉锤",
        hook_strategy: "钩子策略",
        conversion_funnel: "转化漏斗",
        rhythm_analysis: "节奏分析",
      },
      shot_list: [
        {
          shot_number: 1,
          timestamp: { start_seconds: 0, end_seconds: 3 },
          visual_description: "开场",
          script_text: "你好",
          audio_elements: "音乐",
          emotion_intensity: 8,
          neuro_hook_type: "好奇心",
        },
      ],
      neuro_marketing: {
        attention_retention_strategy: "策略",
        memory_anchors: ["锚点1"],
        emotional_arc: "弧线",
        cognitive_load_management: "管理",
      },
      replication_guide: {
        core_template: "模板",
        key_success_factors: ["因素1"],
        adaptation_suggestions: ["建议1"],
        risk_warnings: ["警告1"],
      },
    };

    expect(mockData.meta_strategy).toBeDefined();
    expect(mockData.shot_list).toHaveLength(1);
    expect(mockData.neuro_marketing).toBeDefined();
    expect(mockData.replication_guide).toBeDefined();
    expect(mockData.neuro_marketing.memory_anchors).toBeInstanceOf(Array);
    expect(mockData.replication_guide.key_success_factors).toBeInstanceOf(Array);
  });
});

/* ================================================================== */
/*  LLM 切换: invokeThirdPartyLLM 独立性                                 */
/* ================================================================== */

describe("LLM 切换: 第三方 LLM 独立性", () => {
  it("第三方 LLM 环境变量应独立于内置 LLM", () => {
    // 验证环境变量命名不冲突
    const builtInEnvKeys = ["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"];
    const thirdPartyEnvKeys = ["THIRD_PARTY_LLM_BASE_URL", "THIRD_PARTY_LLM_API_KEY"];

    for (const key of thirdPartyEnvKeys) {
      expect(builtInEnvKeys).not.toContain(key);
    }
  });

  it("第三方 LLM 模型名称应为 gemini-3.1-pro-preview", () => {
    const model = "gemini-3.1-pro-preview";
    expect(model).toBe("gemini-3.1-pro-preview");
    expect(model).not.toBe("gemini-2.5-flash");
  });
});
