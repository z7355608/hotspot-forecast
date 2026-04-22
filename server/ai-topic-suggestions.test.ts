/**
 * AI 选题生成模块测试
 * ===================
 * 验证 AiTopicSuggestion 类型定义、数据透传、前端渲染器包含新模块
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── 类型导入验证 ──
import type { AiTopicSuggestion } from "../client/src/app/store/prediction-types";

describe("AiTopicSuggestion 类型定义", () => {
  it("应该包含必需的 title 和 angle 字段", () => {
    const topic: AiTopicSuggestion = {
      title: "测试标题",
      angle: "测试角度",
    };
    expect(topic.title).toBe("测试标题");
    expect(topic.angle).toBe("测试角度");
  });

  it("应该支持可选的 referenceTitle 和 referenceId 字段", () => {
    const topic: AiTopicSuggestion = {
      title: "3天瘦5斤的减脂餐，不用挨饿也能瘦",
      angle: "用真实数据对比展示效果",
      referenceTitle: "我用这个方法一周瘦了8斤",
      referenceId: "content_123",
    };
    expect(topic.referenceTitle).toBe("我用这个方法一周瘦了8斤");
    expect(topic.referenceId).toBe("content_123");
  });

  it("referenceTitle 和 referenceId 可以为 undefined", () => {
    const topic: AiTopicSuggestion = {
      title: "测试标题",
      angle: "测试角度",
    };
    expect(topic.referenceTitle).toBeUndefined();
    expect(topic.referenceId).toBeUndefined();
  });
});

describe("PredictionUiResult 包含 aiTopicSuggestions 字段", () => {
  it("prediction-types.ts 中 PredictionUiResult 应该包含 aiTopicSuggestions 可选字段", () => {
    const typesSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/app/store/prediction-types.ts"),
      "utf-8",
    );
    expect(typesSource).toContain("aiTopicSuggestions?: AiTopicSuggestion[]");
  });
});

describe("ResultRecord 包含 aiTopicSuggestions 字段", () => {
  it("app-data-core.ts 中 ResultRecord 应该包含 aiTopicSuggestions 可选字段", () => {
    const coreSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/app/store/app-data-core.ts"),
      "utf-8",
    );
    expect(coreSource).toContain("aiTopicSuggestions?: AiTopicSuggestion[]");
  });
});

describe("store-helpers.ts 包含 aiTopicSuggestions 透传逻辑", () => {
  it("buildLiveResult 中应该有 aiTopicSuggestions 的显式透传", () => {
    const helpersSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/app/store/store-helpers.ts"),
      "utf-8",
    );
    expect(helpersSource).toContain("aiTopicSuggestions");
    expect(helpersSource).toContain("live.aiTopicSuggestions");
  });
});

describe("前端渲染器包含 AI 选题模块", () => {
  const rendererSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../client/src/app/components/results/renderers/new-prediction-result.tsx",
    ),
    "utf-8",
  );

  it("应该包含 AI 选题模块标题", () => {
    expect(rendererSource).toContain("AI 为你生成的爆款选题");
  });

  it("应该包含'拿开拍方案'按钮", () => {
    expect(rendererSource).toContain("拿开拍方案");
  });

  it("应该包含 aiTopicSuggestions 数据读取", () => {
    expect(rendererSource).toContain("result.aiTopicSuggestions");
  });

  it("应该包含对标参考展示", () => {
    expect(rendererSource).toContain("对标参考");
  });

  it("应该包含切入角度展示", () => {
    expect(rendererSource).toContain("切入角度");
  });

  it("应该通过 open-cta-editor 事件触发行动", () => {
    // 确认 AI 选题卡片的按钮使用了 open-cta-editor 事件
    expect(rendererSource).toContain("open-cta-editor");
    expect(rendererSource).toContain('ctaId: "shoot_plan"');
  });

  it("AI 选题模块应该在建议拍摄方向之后、热门作品参考之前", () => {
    const directionIdx = rendererSource.indexOf("建议拍摄方向");
    const aiTopicIdx = rendererSource.indexOf("AI 为你生成的爆款选题");
    const hotWorksIdx = rendererSource.indexOf("热门作品参考");
    
    expect(directionIdx).toBeGreaterThan(-1);
    expect(aiTopicIdx).toBeGreaterThan(-1);
    expect(hotWorksIdx).toBeGreaterThan(-1);
    expect(aiTopicIdx).toBeGreaterThan(directionIdx);
    expect(aiTopicIdx).toBeLessThan(hotWorksIdx);
  });
});

describe("后端 live-predictions.ts 包含 AI 选题 LLM 调用", () => {
  const backendSource = fs.readFileSync(
    path.resolve(__dirname, "legacy/live-predictions.ts"),
    "utf-8",
  );

  it("应该包含 aiTopicSuggestions 变量声明", () => {
    expect(backendSource).toContain("let aiTopicSuggestions: AiTopicSuggestion[]");
  });

  it("应该包含 AI 选题 LLM 调用的 prompt", () => {
    expect(backendSource).toContain("短视频爆款内容策划师");
    expect(backendSource).toContain("真实采集的热门样本");
  });

  it("应该包含 aiTopicSuggestions 注入到结果对象", () => {
    expect(backendSource).toContain("aiTopicSuggestions");
  });

  it("应该包含对标样本 ID 匹配逻辑", () => {
    expect(backendSource).toContain("refContent?.contentId");
  });

  it("应该包含降级处理（LLM 调用失败时降级为空列表）", () => {
    expect(backendSource).toContain("AI选题生成失败，降级为空列表");
  });
});

describe("结果持久化恢复链路包含 aiTopicSuggestions 映射", () => {
  const resultsPageSource = fs.readFileSync(
    path.resolve(__dirname, "../client/src/app/pages/ResultsPage.tsx"),
    "utf-8",
  );

  it("normalizeRemoteResult 应该包含 aiTopicSuggestions 的映射逻辑", () => {
    expect(resultsPageSource).toContain("aiTopicSuggestions");
    expect(resultsPageSource).toContain("snapshot.aiTopicSuggestions");
  });

  it("应该正确映射 title 和 angle 字段", () => {
    expect(resultsPageSource).toContain('asString(topic.title, "未命名选题")');
    expect(resultsPageSource).toContain('asString(topic.angle, "")');
  });

  it("应该处理可选的 referenceTitle 和 referenceId", () => {
    expect(resultsPageSource).toContain('typeof topic.referenceTitle === "string"');
    expect(resultsPageSource).toContain('typeof topic.referenceId === "string"');
  });
});

describe("AI 选题数据格式验证", () => {
  it("应该能正确解析 LLM 返回的 JSON 格式", () => {
    const mockLlmResponse = JSON.stringify({
      topics: [
        {
          title: "3天瘦5斤的减脂餐，不用挨饿也能瘦",
          angle: "用真实体重数据对比，展示减脂效果",
          referenceTitle: "我用这个方法一周瘦了8斤",
        },
        {
          title: "健身教练都不会告诉你的5个减脂误区",
          angle: "反常识切入，引发好奇心",
          referenceTitle: "减脂期千万别这样吃",
        },
        {
          title: "上班族的懒人减脂计划，每天只需15分钟",
          angle: "针对上班族痛点，降低执行门槛",
          referenceTitle: "不去健身房也能练出马甲线",
        },
      ],
    });

    const parsed = JSON.parse(mockLlmResponse) as {
      topics?: Array<{ title?: string; angle?: string; referenceTitle?: string }>;
    };

    expect(parsed.topics).toBeDefined();
    expect(parsed.topics!.length).toBe(3);
    
    const suggestions: AiTopicSuggestion[] = parsed.topics!.map((t) => ({
      title: t.title ?? "未命名选题",
      angle: t.angle ?? "",
      referenceTitle: t.referenceTitle,
    }));

    expect(suggestions[0].title).toBe("3天瘦5斤的减脂餐，不用挨饿也能瘦");
    expect(suggestions[1].angle).toBe("反常识切入，引发好奇心");
    expect(suggestions[2].referenceTitle).toBe("不去健身房也能练出马甲线");
  });

  it("应该处理空 topics 数组", () => {
    const emptyResponse = JSON.stringify({ topics: [] });
    const parsed = JSON.parse(emptyResponse) as { topics?: unknown[] };
    expect(Array.isArray(parsed.topics)).toBe(true);
    expect(parsed.topics!.length).toBe(0);
  });

  it("应该处理缺失字段的 topics", () => {
    const partialResponse = JSON.stringify({
      topics: [
        { title: "只有标题" },
        { angle: "只有角度" },
      ],
    });
    const parsed = JSON.parse(partialResponse) as {
      topics?: Array<{ title?: string; angle?: string; referenceTitle?: string }>;
    };

    const suggestions: AiTopicSuggestion[] = parsed.topics!.map((t) => ({
      title: t.title ?? "未命名选题",
      angle: t.angle ?? "",
      referenceTitle: t.referenceTitle,
    }));

    expect(suggestions[0].title).toBe("只有标题");
    expect(suggestions[0].angle).toBe("");
    expect(suggestions[1].title).toBe("未命名选题");
    expect(suggestions[1].angle).toBe("只有角度");
  });
});
