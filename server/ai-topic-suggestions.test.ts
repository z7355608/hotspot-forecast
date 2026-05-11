/**
 * AI 选题生成模块测试
 * ===================
 * 验证 AiTopicSuggestion 类型定义、数据透传、前端预测决策页包含关键模块、
 * P1-P3 重构验证（预测结论+预测依据+下一步生成衔接）。
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

  it("应该包含核心结果徽章「爆款预测结果」", () => {
    expect(rendererSource).toContain("爆款预测结果");
  });

  it("应该包含主行动「按这个预测生成内容方案」", () => {
    expect(rendererSource).toContain("按这个预测生成内容方案");
  });

  it("应该包含 aiTopicSuggestions 数据读取", () => {
    expect(rendererSource).toContain("result.aiTopicSuggestions");
  });

  it("应该包含代表性参考视频展示", () => {
    expect(rendererSource).toContain("代表性参考视频");
    expect(rendererSource).toContain("video.authorName");
  });

  it("应该包含爆发指数与评分解释", () => {
    expect(rendererSource).toContain("爆发指数");
    expect(rendererSource).toContain("plan.score");
    expect(rendererSource).toContain("scoreExplanation");
  });

  it("应该包含核心标签展示", () => {
    expect(rendererSource).toContain("plan.hashtagSuggestions");
  });

  it("应该包含参考视频作者展示", () => {
    expect(rendererSource).toContain("video.authorName");
  });

  it("应该通过 open-cta-editor 事件触发行动", () => {
    expect(rendererSource).toContain("open-cta-editor");
    expect(rendererSource).toContain('id: "shoot_plan"');
  });
});

describe("P2：预测依据区域", () => {
  const rendererSource = fs.readFileSync(
    path.resolve(
      __dirname,
      "../client/src/app/components/results/renderers/new-prediction-result.tsx",
    ),
    "utf-8",
  );

  it("应该包含预测依据锚点和标题", () => {
    expect(rendererSource).toContain('id="data-signals"');
    expect(rendererSource).toContain("预测依据");
    expect(rendererSource).toContain("为什么这个机会值得跟？");
  });

  it("预测依据区域应该在下一步行动之前", () => {
    const evidenceIdx = rendererSource.indexOf("为什么这个机会值得跟？");
    const nextActionsIdx = rendererSource.indexOf("下一步行动");
    expect(nextActionsIdx).toBeGreaterThan(-1);
    expect(evidenceIdx).toBeGreaterThan(-1);
    expect(evidenceIdx).toBeLessThan(nextActionsIdx);
  });

  it("预测依据区域应该使用 signalCards 和数字化图表", () => {
    expect(rendererSource).toContain("plan.signalCards");
    expect(rendererSource).toContain("SignalCardArticle");
    expect(rendererSource).toContain("MiniBarChart");
    expect(rendererSource).toContain("useAnimatedNumber");
  });

  it("应该使用数据趋势相关图标", () => {
    expect(rendererSource).toContain("TrendingUp");
    expect(rendererSource).toContain("BarChart3");
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

  it("下一步生成按钮应该传递预测切口上下文", () => {
    const rendererSource = fs.readFileSync(
      path.resolve(
        __dirname,
        "../client/src/app/components/results/renderers/new-prediction-result.tsx",
      ),
      "utf-8",
    );
    // 预测页只传递切口/判断/结构上下文，不在结果页直接交付完整脚本。
    expect(rendererSource).toContain("directionTitle: plan.recommendedCut");
    expect(rendererSource).toContain("directionDescription: plan.expertJudgement");
    expect(rendererSource).toContain("howToShoot");
    expect(rendererSource).toContain("whyNow");
  });
});

describe("后端 live-predictions.ts 包含 AI 选题 LLM 调用", () => {
  const backendSource = fs.readFileSync(
    path.resolve(__dirname, "legacy/live-predictions.ts"),
    "utf-8",
  );
  // 2026-04-29:topic prompt 抽出到 prompts/topic-prompt-builder.ts(让 evals 可独立用)。
  // prompt 文本断言改去看 builder 文件。
  const topicPromptBuilderSource = fs.readFileSync(
    path.resolve(__dirname, "legacy/prompts/topic-prompt-builder.ts"),
    "utf-8",
  );

  it("应该包含 aiTopicSuggestions 变量声明", () => {
    expect(backendSource).toContain("let aiTopicSuggestions: AiTopicSuggestion[]");
  });

  it("应该调用 buildTopicMessages(prompt 抽出到 builder)", () => {
    expect(backendSource).toContain("buildTopicMessages");
  });

  it("topic-prompt-builder 应该包含选题 prompt 的核心字符串", () => {
    expect(topicPromptBuilderSource).toContain("短视频爆款内容策划师");
    expect(topicPromptBuilderSource).toContain("真实采集的热门样本");
  });

  it("应该包含 aiTopicSuggestions 注入到结果对象", () => {
    expect(backendSource).toContain("aiTopicSuggestions");
  });

  it("应该包含对标样本 ID 匹配逻辑", () => {
    expect(backendSource).toContain("refContent?.contentId");
  });

  it("应该包含降级处理（LLM 调用失败时降级为空列表）", () => {
    // Phase 5B-revised: 拆回独立调用，日志为「选题建议 LLM 调用失败，降级为空列表」
    expect(backendSource).toContain("选题建议 LLM 调用失败");
  });

  it("应该包含 tags 字段生成", () => {
    expect(backendSource).toContain("tags");
  });

  it("应该包含 referenceAuthor 字段处理", () => {
    expect(backendSource).toContain("referenceAuthor");
  });
});

describe("结果持久化恢复链路包含 aiTopicSuggestions 映射", () => {
  const normalizeResultSource = fs.readFileSync(
    path.resolve(__dirname, "../client/src/app/lib/normalize-result.ts"),
    "utf-8",
  );

  it("normalizeRemoteResult 应该包含 aiTopicSuggestions 的映射逻辑", () => {
    expect(normalizeResultSource).toContain("aiTopicSuggestions");
    expect(normalizeResultSource).toContain("snapshot.aiTopicSuggestions");
  });

  it("应该正确映射 title 和 angle 字段", () => {
    expect(normalizeResultSource).toContain('asString(topic.title, "未命名选题")');
    expect(normalizeResultSource).toContain('asString(topic.angle, "")');
  });

  it("应该处理可选的 referenceTitle 和 referenceId", () => {
    expect(normalizeResultSource).toContain('typeof topic.referenceTitle === "string"');
    expect(normalizeResultSource).toContain('typeof topic.referenceId === "string"');
  });

  it("应该处理 score 字段映射", () => {
    expect(normalizeResultSource).toContain("topic.score");
  });

  it("应该处理切口级评论、供给缺口、低粉分数字段映射", () => {
    expect(normalizeResultSource).toContain("topic.commentScore");
    expect(normalizeResultSource).toContain("topic.supplyGapScore");
    expect(normalizeResultSource).toContain("topic.lowFollowerScore");
    expect(normalizeResultSource).toContain("topic.evidenceContentIds");
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

  it("应该包含样本质量入选门槛", () => {
    expect(backendSource).toContain("filterContentsBySampleQuality");
    expect(backendSource).toContain("sampleQualityGate");
  });

  it("应该包含时间范围筛选逻辑", () => {
    expect(backendSource).toContain("ONE_MONTH_MS");
    expect(backendSource).toContain("publishedAt");
  });

  it("应该包含点赞数倒序排序", () => {
    expect(backendSource).toContain("(b.likeCount ?? 0) - (a.likeCount ?? 0)");
  });

  it("应该包含数据不足时的降级逻辑", () => {
    expect(backendSource).toContain("sample_quality_insufficient");
  });
});
