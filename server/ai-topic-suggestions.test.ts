/**
 * AI 选题生成模块测试
 * ===================
 * 验证 AiTopicSuggestion 类型定义、数据透传、前端渲染器包含新模块、
 * P1-P3 重构验证（选题方案+支撑证据+脚本生成衔接）
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

  it("应该支持可选的 referenceTitle、referenceId、score、tags、referenceAuthor 字段", () => {
    const topic: AiTopicSuggestion = {
      title: "3天瘦5斤的减脂餐，不用挨饿也能瘦",
      angle: "用真实数据对比展示效果",
      referenceTitle: "我用这个方法一周瘦了8斤",
      referenceId: "content_123",
      score: 88,
      tags: ["#减脂餐", "#健康饮食"],
      referenceAuthor: "爱健身的菜同学",
    };
    expect(topic.referenceTitle).toBe("我用这个方法一周瘦了8斤");
    expect(topic.referenceId).toBe("content_123");
    expect(topic.score).toBe(88);
    expect(topic.tags).toEqual(["#减脂餐", "#健康饮食"]);
    expect(topic.referenceAuthor).toBe("爱健身的菜同学");
  });

  it("所有可选字段可以为 undefined", () => {
    const topic: AiTopicSuggestion = {
      title: "测试标题",
      angle: "测试角度",
    };
    expect(topic.referenceTitle).toBeUndefined();
    expect(topic.referenceId).toBeUndefined();
    expect(topic.score).toBeUndefined();
    expect(topic.tags).toBeUndefined();
    expect(topic.referenceAuthor).toBeUndefined();
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

describe("P1：前端渲染器 — AI 预测爆款选题模块", () => {
  const rendererSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../client/src/app/components/results/renderers/new-prediction-result.tsx",
    ),
    "utf-8",
  );

  it("应该包含 AI 选题模块标题'AI 预测爆款选题'", () => {
    expect(rendererSource).toContain("AI 预测爆款选题");
  });

  it("应该包含引导文案'当前推荐结果'", () => {
    expect(rendererSource).toContain("当前推荐结果");
  });

  it("应该包含 aiTopicSuggestions 数据读取", () => {
    expect(rendererSource).toContain("result.aiTopicSuggestions");
  });

  it("应该包含对标作者标签展示", () => {
    expect(rendererSource).toContain("对标 @");
  });

  it("应该包含推荐内容区域", () => {
    expect(rendererSource).toContain("推荐内容");
  });

  it("应该包含优先级分数展示", () => {
    expect(rendererSource).toContain("优先级");
    expect(rendererSource).toContain("topic.score");
  });

  it("应该包含核心标签展示", () => {
    expect(rendererSource).toContain("topic.tags");
  });

  it("应该包含对标作者展示", () => {
    expect(rendererSource).toContain("topic.referenceAuthor");
  });

  it("应该包含'生成脚本'按钮", () => {
    expect(rendererSource).toContain("生成脚本");
  });

  it("应该通过 open-cta-editor 事件触发行动", () => {
    expect(rendererSource).toContain("open-cta-editor");
    expect(rendererSource).toContain('ctaId: "shoot_plan"');
  });

  it("选题模块应该在第一屏结论之后、建议拍摄方向之前", () => {
    const firstScreenComment = rendererSource.indexOf("第一层：结果先行");
    const aiTopicComment = rendererSource.indexOf("AI 预测爆款选题】— 核心交付物");
    const secondLayerComment = rendererSource.indexOf("第二层：动作建议");
    const hotWorksIdx = rendererSource.indexOf("热门作品参考");
    
    expect(firstScreenComment).toBeGreaterThan(-1);
    expect(aiTopicComment).toBeGreaterThan(-1);
    expect(secondLayerComment).toBeGreaterThan(-1);
    expect(hotWorksIdx).toBeGreaterThan(-1);
    expect(aiTopicComment).toBeGreaterThan(firstScreenComment);
    expect(aiTopicComment).toBeLessThan(secondLayerComment);
    expect(aiTopicComment).toBeLessThan(hotWorksIdx);
  });
});

describe("P2：支撑证据区域", () => {
  const rendererSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../client/src/app/components/results/renderers/new-prediction-result.tsx",
    ),
    "utf-8",
  );

  it("应该包含支撑证据分割线和标题", () => {
    expect(rendererSource).toContain("以上选题的预测依据（数据支撑）");
  });

  it("支撑证据区域应该在选题模块和动作建议之后", () => {
    const aiTopicIdx = rendererSource.indexOf("AI 预测爆款选题");
    const evidenceIdx = rendererSource.indexOf("以上选题的预测依据（数据支撑）");
    const secondLayerIdx = rendererSource.indexOf("第二层：动作建议");
    
    expect(aiTopicIdx).toBeGreaterThan(-1);
    expect(evidenceIdx).toBeGreaterThan(-1);
    expect(secondLayerIdx).toBeGreaterThan(-1);
    expect(evidenceIdx).toBeGreaterThan(secondLayerIdx);
  });

  it("数据分析模块应该在支撑证据区域内", () => {
    const evidenceIdx = rendererSource.indexOf("以上选题的预测依据（数据支撑）");
    const whyNowIdx = rendererSource.indexOf("为什么现在值得拍");
    const hotWorksIdx = rendererSource.indexOf("热门作品参考");
    const lowFollowerIdx = rendererSource.indexOf("低粉爆款归因");
    const marketIdx = rendererSource.indexOf("市场数据支撑");
    const evidenceEndIdx = rendererSource.indexOf("支撑证据区域结束");
    
    expect(evidenceIdx).toBeGreaterThan(-1);
    expect(evidenceEndIdx).toBeGreaterThan(-1);
    // 所有数据模块都在支撑证据区域内
    expect(whyNowIdx).toBeGreaterThan(evidenceIdx);
    expect(whyNowIdx).toBeLessThan(evidenceEndIdx);
    expect(hotWorksIdx).toBeGreaterThan(evidenceIdx);
    expect(hotWorksIdx).toBeLessThan(evidenceEndIdx);
    expect(lowFollowerIdx).toBeGreaterThan(evidenceIdx);
    expect(lowFollowerIdx).toBeLessThan(evidenceEndIdx);
    expect(marketIdx).toBeGreaterThan(evidenceIdx);
    expect(marketIdx).toBeLessThan(evidenceEndIdx);
  });

  it("应该使用 Database 图标", () => {
    expect(rendererSource).toContain("Database");
  });
});

describe("P3：生成开拍脚本按钮上下文传递", () => {
  const shellSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../client/src/app/components/results/results-view-shell.tsx",
    ),
    "utf-8",
  );

  it("handleCtaWithEditor 应该支持扩展的 directionContext 类型", () => {
    expect(shellSource).toContain("directionTitle?: string");
    expect(shellSource).toContain("directionDescription?: string");
    expect(shellSource).toContain("referenceTitle?: string");
    expect(shellSource).toContain("referenceAuthor?: string");
    expect(shellSource).toContain("tags?: string[]");
  });

  it("应该将选题的切入角度融入 prompt", () => {
    expect(shellSource).toContain("切入角度");
  });

  it("应该将对标参考融入 prompt", () => {
    expect(shellSource).toContain("对标参考");
  });

  it("应该将核心标签融入 prompt", () => {
    expect(shellSource).toContain("核心标签");
  });

  it("应该注入 topicReference 到 SSE context", () => {
    expect(shellSource).toContain("topicReference");
  });

  it("应该注入 topicTags 到 SSE context", () => {
    expect(shellSource).toContain("topicTags");
  });

  it("选题卡片按钮应该传递完整的选题信息", () => {
    const rendererSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../client/src/app/components/results/renderers/new-prediction-result.tsx",
      ),
      "utf-8",
    );
    // 确认卡片按钮传递了所有必要字段
    expect(rendererSource).toContain("directionTitle: topic.title");
    expect(rendererSource).toContain("directionDescription: topic.angle");
    expect(rendererSource).toContain("referenceTitle: topic.referenceTitle");
    expect(rendererSource).toContain("referenceAuthor: topic.referenceAuthor");
    expect(rendererSource).toContain("tags: topic.tags");
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

  it("应该包含 tags 字段生成", () => {
    expect(backendSource).toContain("tags");
  });

  it("应该包含 referenceAuthor 字段处理", () => {
    expect(backendSource).toContain("referenceAuthor");
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

  it("应该处理 score 字段映射", () => {
    expect(resultsPageSource).toContain("topic.score");
  });
});

describe("AI 选题数据格式验证", () => {
  it("应该能正确解析 LLM 返回的 JSON 格式（含 tags 和 score）", () => {
    const mockLlmResponse = JSON.stringify({
      topics: [
        {
          title: "3天瘦5斤的减脂餐，不用挨饿也能瘦",
          angle: "用真实体重数据对比，展示减脂效果",
          referenceTitle: "我用这个方法一周瘦了8斤",
          score: 92,
          tags: ["#减脂餐", "#健康饮食", "#瘦身"],
        },
        {
          title: "健身教练都不会告诉你的5个减脂误区",
          angle: "反常识切入，引发好奇心",
          referenceTitle: "减脂期千万别这样吃",
          score: 85,
          tags: ["#减脂误区", "#健身知识"],
        },
        {
          title: "上班族的懒人减脂计划，每天只需15分钟",
          angle: "针对上班族痛点，降低执行门槛",
          referenceTitle: "不去健身房也能练出马甲线",
          score: 78,
          tags: ["#懒人减脂", "#上班族"],
        },
      ],
    });

    const parsed = JSON.parse(mockLlmResponse) as {
      topics?: Array<{ title?: string; angle?: string; referenceTitle?: string; score?: number; tags?: string[] }>;
    };

    expect(parsed.topics).toBeDefined();
    expect(parsed.topics!.length).toBe(3);
    
    const suggestions: AiTopicSuggestion[] = parsed.topics!.map((t) => {
      const rawScore = typeof t.score === "number" ? t.score : 80;
      const clampedScore = Math.max(70, Math.min(95, rawScore));
      return {
        title: t.title ?? "未命名选题",
        angle: t.angle ?? "",
        referenceTitle: t.referenceTitle,
        score: clampedScore,
        tags: t.tags,
      };
    });

    expect(suggestions[0].title).toBe("3天瘦5斤的减脂餐，不用挨饿也能瘦");
    expect(suggestions[0].score).toBe(92);
    expect(suggestions[0].tags).toEqual(["#减脂餐", "#健康饮食", "#瘦身"]);
    expect(suggestions[1].angle).toBe("反常识切入，引发好奇心");
    expect(suggestions[1].score).toBe(85);
    expect(suggestions[2].referenceTitle).toBe("不去健身房也能练出马甲线");
    expect(suggestions[2].score).toBe(78);
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

  it("爆款机率分数应被 clamp 在 70-95 范围内", () => {
    const scores = [50, 70, 88, 95, 100];
    const clamped = scores.map(s => Math.max(70, Math.min(95, s)));
    expect(clamped).toEqual([70, 70, 88, 95, 95]);
  });
});

describe("需求5：基于具体选题的下一步建议", () => {
  const backendSource = fs.readFileSync(
    path.resolve(__dirname, "legacy/live-predictions.ts"),
    "utf-8",
  );

  it("应该包含基于选题生成下一步建议的逻辑", () => {
    expect(backendSource).toContain("针对选题");
    expect(backendSource).toContain("生成脚本");
  });

  it("应该在有选题时覆盖默认的 recommendedNextTasks", () => {
    expect(backendSource).toContain("aiTopicSuggestions.length > 0");
    expect(backendSource).toContain("contract.recommendedNextTasks");
  });
});

describe("需求6：搜索接口数据筛选规则", () => {
  const backendSource = fs.readFileSync(
    path.resolve(__dirname, "legacy/live-predictions.ts"),
    "utf-8",
  );

  it("应该包含点赞数筛选门槛", () => {
    expect(backendSource).toContain("MIN_LIKE_THRESHOLD");
    expect(backendSource).toContain("1000");
  });

  it("应该包含时间范围筛选逻辑", () => {
    expect(backendSource).toContain("ONE_MONTH_MS");
    expect(backendSource).toContain("publishedAt");
  });

  it("应该包含点赞数倒序排序", () => {
    expect(backendSource).toContain("(b.likeCount ?? 0) - (a.likeCount ?? 0)");
  });

  it("应该包含数据不足时的降级逻辑", () => {
    expect(backendSource).toContain("qualityFiltered.length >= 3");
  });
});
