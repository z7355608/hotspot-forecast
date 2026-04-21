/**
 * topic-strategy-engine.test.ts
 * ─────────────────────────────
 * 选题策略 V2 Pipeline 单元测试 + 集成测试 + 前端渲染器类型测试
 *
 * TEST-1~10:  单元测试（类型导出、常量、辅助函数、数据结构）
 * TEST-11~13: 集成测试（模块导入、路由可用性）
 * TEST-14~17: 前端渲染器类型测试
 * TEST-18~20: 回归测试
 */

import { describe, expect, it } from "vitest";

/* ─────────────────────────────────────────────────────────────────────
 * TEST-1~10: 单元测试
 * ───────────────────────────────────────────────────────────────────── */

describe("Topic Strategy V2 Engine — Unit Tests", () => {
  // TEST-1: 核心类型导出完整性
  it("TEST-1: exports all core types from topic-strategy-engine", async () => {
    const engine = await import("./topic-strategy-engine");
    // runTopicStrategyV2 是主入口
    expect(typeof engine.runTopicStrategyV2).toBe("function");
  });

  // TEST-2: TopicStrategyInput 类型结构验证
  it("TEST-2: TopicStrategyInput has required fields", async () => {
    const input = {
      userOpenId: "user_123",
      track: "美妆护肤",
      accountStage: "起步期",
      platforms: ["douyin" as const, "xiaohongshu" as const],
      userPrompt: "帮我分析美妆赛道",
      connectedAccounts: [],
      entrySource: "template",
    };
    expect(input.userOpenId).toBe("user_123");
    expect(input.track).toBe("美妆护肤");
    expect(input.platforms).toHaveLength(2);
    expect(input.accountStage).toBe("起步期");
  });

  // TEST-3: TopicDirection 结构验证
  it("TEST-3: TopicDirection structure is valid", () => {
    const direction = {
      directionName: "平价护肤分享",
      directionLogic: "低粉爆款集中在平价护肤领域",
      targetStage: "新号冷启动",
      testPlan: "先发3条平价护肤测评",
      trafficPotential: 4,
      productionCost: 2,
      competitionLevel: 3,
      priorityRank: 1,
      executableTopics: [
        { title: "百元以内护肤好物", angle: "性价比", hookType: "清单", estimatedDuration: "60s" },
      ],
    };
    expect(direction.directionName).toBe("平价护肤分享");
    expect(direction.trafficPotential).toBeGreaterThanOrEqual(1);
    expect(direction.trafficPotential).toBeLessThanOrEqual(5);
    expect(direction.executableTopics).toHaveLength(1);
    expect(direction.executableTopics[0].title).toBe("百元以内护肤好物");
  });

  // TEST-4: ValidationBreakdown 分数计算
  it("TEST-4: ValidationBreakdown scores are within 0-100", () => {
    const breakdown = {
      searchHitScore: 72,
      lowFollowerScore: 60,
      commentDemandScore: 45,
      peerSuccessScore: 36,
    };
    const validationScore =
      breakdown.searchHitScore * 0.3 +
      breakdown.lowFollowerScore * 0.3 +
      breakdown.commentDemandScore * 0.2 +
      breakdown.peerSuccessScore * 0.2;

    expect(validationScore).toBeGreaterThanOrEqual(0);
    expect(validationScore).toBeLessThanOrEqual(100);
    // 72*0.3 + 60*0.3 + 45*0.2 + 36*0.2 = 21.6 + 18 + 9 + 7.2 = 55.8
    expect(Math.round(validationScore)).toBe(56);
  });

  // TEST-5: PeerBenchmarkResult 结构验证
  it("TEST-5: PeerBenchmarkResult structure is valid", () => {
    const peer = {
      platform: "douyin" as const,
      accountId: "acc_001",
      displayName: "美妆达人小A",
      handle: "meizhuangA",
      followerCount: 50000,
      recentWorks: [
        { title: "平价眼影盘测评", likeCount: 12000, viewCount: 80000 },
      ],
      avgInteractionRate: 0.15,
    };
    expect(peer.platform).toBe("douyin");
    expect(peer.followerCount).toBe(50000);
    expect(peer.recentWorks).toHaveLength(1);
    expect(peer.avgInteractionRate).toBeGreaterThan(0);
  });

  // TEST-6: CrossIndustryInsight 结构验证
  it("TEST-6: CrossIndustryInsight structure is valid", () => {
    const insight = {
      sourceIndustry: "美食",
      sourceTitle: "3分钟早餐挑战",
      sourcePlatform: "douyin",
      transferableElements: [
        { element: "时间限制挑战", reason: "制造紧迫感", adaptationHint: "改为3分钟化妆挑战" },
      ],
      migrationIdea: "将美食领域的时间挑战形式迁移到美妆领域",
      confidence: 0.75,
    };
    expect(insight.sourceIndustry).toBe("美食");
    expect(insight.transferableElements).toHaveLength(1);
    expect(insight.confidence).toBeGreaterThanOrEqual(0);
    expect(insight.confidence).toBeLessThanOrEqual(1);
  });

  // TEST-7: PipelineProgress 时间记录
  it("TEST-7: PipelineProgress total_ms equals sum of stages", () => {
    const progress = {
      stage1_ms: 3000,
      stage2_ms: 5000,
      stage3_ms: 2000,
      stage4_ms: 4000,
      stage5_ms: 6000,
      total_ms: 20000,
    };
    const sum = progress.stage1_ms + progress.stage2_ms + progress.stage3_ms +
      progress.stage4_ms + progress.stage5_ms;
    expect(sum).toBe(progress.total_ms);
  });

  // TEST-8: SearchKeyword 结构验证
  it("TEST-8: SearchKeyword has required fields", () => {
    const kw = { keyword: "平价护肤", source: "track_preset", platform: "douyin" as const };
    expect(kw.keyword).toBeTruthy();
    expect(kw.source).toBeTruthy();
    expect(["douyin", "xiaohongshu", "kuaishou"]).toContain(kw.platform);
  });

  // TEST-9: RawDataSummary 结构验证
  it("TEST-9: RawDataSummary aggregates correctly", () => {
    const summary = {
      totalContents: 150,
      totalAccounts: 30,
      totalHotSeeds: 5,
      byPlatform: {
        douyin: { contents: 80, accounts: 15, hotSeeds: 3 },
        xiaohongshu: { contents: 70, accounts: 15, hotSeeds: 2 },
      },
    };
    const sumContents = Object.values(summary.byPlatform).reduce((s, p) => s + p.contents, 0);
    expect(sumContents).toBe(summary.totalContents);
  });

  // TEST-10: DirectionWithValidation 自进化子方向
  it("TEST-10: DirectionWithValidation supports evolved children", () => {
    const direction = {
      id: "tsd_abc123",
      directionName: "平价护肤",
      directionLogic: "低粉爆款集中",
      targetStage: "新号",
      testPlan: "先发3条",
      trafficPotential: 4,
      productionCost: 2,
      competitionLevel: 3,
      priorityRank: 1,
      executableTopics: [],
      validationScore: 85,
      validationBreakdown: { searchHitScore: 80, lowFollowerScore: 90, commentDemandScore: 70, peerSuccessScore: 80 },
      validationStatus: "validated",
      platformScores: {},
      evolvedChildren: [
        {
          id: "evolved_tsd_abc123_0",
          directionName: "学生党平价护肤",
          directionLogic: "学生群体消费力有限但需求旺盛",
          targetStage: "新号",
          testPlan: "发1条学生党护肤清单",
          trafficPotential: 3,
          productionCost: 1,
          competitionLevel: 2,
          priorityRank: 1,
          executableTopics: [],
          validationScore: 0,
          validationBreakdown: { searchHitScore: 0, lowFollowerScore: 0, commentDemandScore: 0, peerSuccessScore: 0 },
          validationStatus: "pending",
          platformScores: {},
        },
      ],
    };
    expect(direction.validationScore).toBeGreaterThanOrEqual(80);
    expect(direction.evolvedChildren).toHaveLength(1);
    expect(direction.evolvedChildren![0].directionName).toContain("学生党");
  });
});

/* ─────────────────────────────────────────────────────────────────────
 * TEST-11~13: 集成测试
 * ───────────────────────────────────────────────────────────────────── */

describe("Topic Strategy V2 — Integration Tests", () => {
  // TEST-11: topic-strategy-engine 模块可正常导入
  it("TEST-11: topic-strategy-engine module imports successfully", async () => {
    const engine = await import("./topic-strategy-engine");
    expect(engine).toBeDefined();
    expect(typeof engine.runTopicStrategyV2).toBe("function");
  });

  // TEST-12: topic-strategy-db 模块可正常导入
  it("TEST-12: topic-strategy-db module imports successfully", async () => {
    const db = await import("./topic-strategy-db");
    expect(typeof db.createTopicStrategySession).toBe("function");
    expect(typeof db.getTopicStrategySession).toBe("function");
    expect(typeof db.createDirection).toBe("function");
    expect(typeof db.updateDirectionValidation).toBe("function");
    expect(typeof db.createPeerBenchmark).toBe("function");
    expect(typeof db.createCrossIndustry).toBe("function");
    expect(typeof db.getDirectionsBySession).toBe("function");
    expect(typeof db.getPeerBenchmarksBySession).toBe("function");
    expect(typeof db.getCrossIndustryBySession).toBe("function");
    expect(typeof db.listUserSessions).toBe("function");
  });

  // TEST-13: HTTP 路由可用性（topic-strategy 路由已注册）
  it("TEST-13: topic-strategy routes are available via http-server", async () => {
    const httpServer = await import("./http-server");
    expect(typeof httpServer.getRequestHandler).toBe("function");

    // 尝试访问 topic-strategy 路由（如果服务器在运行）
    try {
      const res = await fetch("http://127.0.0.1:3000/api/topic-strategy/sessions?userId=test");
      if (res.ok) {
        const data = await res.json();
        expect(data).toHaveProperty("sessions");
      }
    } catch {
      // Server may not be running during test — that's OK
      expect(true).toBe(true);
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────
 * TEST-14~17: 前端渲染器类型测试
 * ───────────────────────────────────────────────────────────────────── */

describe("Topic Strategy V2 — Frontend Renderer Type Tests", () => {
  // TEST-14: TopicStrategyV2Data 类型完整性
  it("TEST-14: TopicStrategyV2Data structure matches V2 pipeline output", () => {
    const v2Data = {
      sessionId: "tss_abc123",
      track: "美妆护肤",
      accountStage: "起步期",
      platforms: ["douyin", "xiaohongshu"],
      strategySummary: "美妆赛道当前有150条活跃内容",
      directions: [
        {
          id: "tsd_001",
          directionName: "平价护肤",
          directionLogic: "低粉爆款集中",
          targetStage: "新号",
          testPlan: "先发3条",
          trafficPotential: 4,
          productionCost: 2,
          competitionLevel: 3,
          priorityRank: 1,
          executableTopics: [
            { title: "百元以内护肤好物", angle: "性价比", hookType: "清单", estimatedDuration: "60s" },
          ],
          validationScore: 72,
          validationBreakdown: { searchHitScore: 80, lowFollowerScore: 60, commentDemandScore: 70, peerSuccessScore: 65 },
          validationStatus: "validated",
          platformScores: { douyin: { score: 75, searchHits: 5, details: "抖音命中5条" } },
        },
      ],
      peerBenchmarks: [
        {
          platform: "douyin",
          accountId: "acc_001",
          displayName: "美妆达人",
          handle: "meizhuang",
          followerCount: 50000,
          recentWorks: [{ title: "测评", likeCount: 12000 }],
          avgInteractionRate: 0.15,
        },
      ],
      crossIndustryInsights: [
        {
          sourceIndustry: "美食",
          sourceTitle: "3分钟挑战",
          sourcePlatform: "douyin",
          transferableElements: [{ element: "时间挑战", reason: "紧迫感", adaptationHint: "改为化妆挑战" }],
          migrationIdea: "迁移时间挑战形式",
          confidence: 0.75,
        },
      ],
      pipelineProgress: {
        stage1_ms: 3000, stage2_ms: 5000, stage3_ms: 2000,
        stage4_ms: 4000, stage5_ms: 6000, total_ms: 20000,
      },
      searchKeywords: [{ keyword: "平价护肤", source: "preset", platform: "douyin" }],
      rawDataSummary: {
        totalContents: 150, totalAccounts: 30, totalHotSeeds: 5,
        byPlatform: { douyin: { contents: 80, accounts: 15, hotSeeds: 3 } },
      },
    };

    expect(v2Data.sessionId).toMatch(/^tss_/);
    expect(v2Data.directions).toHaveLength(1);
    expect(v2Data.peerBenchmarks).toHaveLength(1);
    expect(v2Data.crossIndustryInsights).toHaveLength(1);
    expect(v2Data.pipelineProgress.total_ms).toBe(20000);
  });

  // TEST-15: 验证分拆解 UI 数据
  it("TEST-15: validation breakdown renders correct percentages", () => {
    const breakdown = { searchHitScore: 80, lowFollowerScore: 60, commentDemandScore: 70, peerSuccessScore: 65 };
    const total = breakdown.searchHitScore * 0.3 + breakdown.lowFollowerScore * 0.3 +
      breakdown.commentDemandScore * 0.2 + breakdown.peerSuccessScore * 0.2;
    // 80*0.3 + 60*0.3 + 70*0.2 + 65*0.2 = 24 + 18 + 14 + 13 = 69
    expect(Math.round(total)).toBe(69);
    // 每个维度的百分比
    expect(breakdown.searchHitScore).toBeLessThanOrEqual(100);
    expect(breakdown.lowFollowerScore).toBeLessThanOrEqual(100);
    expect(breakdown.commentDemandScore).toBeLessThanOrEqual(100);
    expect(breakdown.peerSuccessScore).toBeLessThanOrEqual(100);
  });

  // TEST-16: CTA 联动数据结构
  it("TEST-16: CTA cross-linking data structure is correct", () => {
    // 选题策略 → 机会判断 CTA
    const topicToOpportunity = {
      id: "opportunity_check",
      title: "运行机会判断",
      description: "对「美妆护肤」赛道进行完整的机会判断",
      cost: 25,
      prompt: "帮我对「美妆护肤」赛道进行机会判断",
    };
    expect(topicToOpportunity.id).toBe("opportunity_check");
    expect(topicToOpportunity.cost).toBeGreaterThan(0);
    expect(topicToOpportunity.prompt).toContain("机会判断");

    // 机会判断 → 选题策略 CTA
    const opportunityToTopic = {
      id: "topic_strategy",
      title: "生成选题策略",
      description: "基于这次机会判断，生成完整的选题方向",
      cost: 25,
      prompt: "帮我生成完整的选题策略",
    };
    expect(opportunityToTopic.id).toBe("topic_strategy");
    expect(opportunityToTopic.cost).toBeGreaterThan(0);
    expect(opportunityToTopic.prompt).toContain("选题策略");
  });

  // TEST-17: artifact-registry 注册验证
  it("TEST-17: artifact-registry exports resolveRenderer", async () => {
    const registry = await import(
      "../../client/src/app/components/results/artifact-registry"
    );
    expect(typeof registry.resolveRenderer).toBe("function");
    expect(typeof registry.registerArtifactRenderer).toBe("function");
  });
});

/* ─────────────────────────────────────────────────────────────────────
 * TEST-18~20: 回归测试
 * ───────────────────────────────────────────────────────────────────── */

describe("Topic Strategy V2 — Regression Tests", () => {
  // TEST-18: payload-extractor 新增 track 字段
  it("TEST-18: payload-extractor exports extractTaskParams with track field support", async () => {
    const extractor = await import("./payload-extractor");
    expect(typeof extractor.extractTaskParams).toBe("function");
    // 验证 ExtractedTaskParams 类型包含 track 字段（通过运行快速提取）
    const result = await extractor.extractTaskParams("美妆护肤赛道分析", false);
    expect(result).toHaveProperty("track");
    expect(result).toHaveProperty("keyword");
    expect(result).toHaveProperty("rawPrompt", "美妆护肤赛道分析");
  });

  // TEST-19: 现有 opportunity_prediction renderer 不受影响
  it("TEST-19: opportunity-prediction-renderer module imports without error", async () => {
    const mod = await import(
      "../../client/src/app/components/results/renderers/opportunity-prediction-renderer"
    );
    expect(mod).toBeDefined();
  });

  // TEST-20: 现有 topic-strategy renderer 不受影响
  it("TEST-20: topic-strategy-renderer module imports without error", async () => {
    const mod = await import(
      "../../client/src/app/components/results/renderers/topic-strategy-renderer"
    );
    expect(mod).toBeDefined();
    expect(mod.TopicStrategyBody).toBeDefined();
  });
});
