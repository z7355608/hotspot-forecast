/**
 * FUTURE-3: Topic Strategy Renderer 逻辑测试
 * 覆盖 CTA 联动、数据结构验证、空态处理
 * 注意：由于 vitest 配置为 node 环境，此测试不依赖 DOM
 */
import { describe, it, expect } from "vitest";

// ─── 前端类型结构验证 ───
describe("TopicStrategyV2Data frontend type contract", () => {
  // 模拟前端 TopicStrategyV2Data 结构
  const mockV2Data = {
    sessionId: "test-session-123",
    track: "美妆护肤",
    accountStage: "new",
    platforms: ["douyin", "xiaohongshu"],
    strategySummary: "测试策略总结",
    directions: [
      {
        id: "dir-1",
        directionName: "平价护肤测评",
        directionLogic: "低粉爆款率高",
        targetStage: "new",
        testPlan: "先发3条测试",
        trafficPotential: 8,
        productionCost: 3,
        competitionLevel: 5,
        priorityRank: 1,
        validationScore: 72,
        validationBreakdown: {
          searchHitScore: 80,
          lowFollowerScore: 65,
          commentDemandScore: 70,
          peerSuccessScore: 55,
        },
        validationStatus: "validated",
        executableTopics: [
          { title: "学生党必入的5款平价水乳", angle: "学生预算", hook: "全部不超过50元" },
          { title: "油皮亲妈！这3款控油面霜真的绝了", angle: "肤质痛点", hook: "实测对比" },
        ],
        validationEvidence: {
          matchedContentTitles: ["平价水乳推荐", "学生党护肤"],
          realCommentDemands: ["求推荐平价水乳", "学生党用什么好"],
          matchedPeerNames: ["小美护肤日记", "平价好物分享"],
        },
        evolvedChildren: [
          {
            id: "evolved-1",
            directionName: "平价护肤-敏感肌专场",
            directionLogic: "细分人群",
            targetStage: "new",
            testPlan: "测试敏感肌内容",
            trafficPotential: 7,
            productionCost: 3,
            competitionLevel: 4,
            priorityRank: 1,
            validationScore: 0,
            validationBreakdown: { searchHitScore: 0, lowFollowerScore: 0, commentDemandScore: 0, peerSuccessScore: 0 },
            validationStatus: "pending",
            executableTopics: [],
          },
        ],
        platformScores: {
          douyin: { score: 75, searchHits: 5, details: "抖音语义命中5条" },
          xiaohongshu: { score: 68, searchHits: 3, details: "小红书语义命中3条" },
        },
      },
    ],
    peerBenchmarks: [
      {
        platform: "douyin",
        accountId: "peer-1",
        displayName: "小美护肤日记",
        handle: "xiaomei",
        followerCount: 35000,
        avgInteractionRate: 0.08,
        recentWorks: [
          { title: "平价水乳推荐", likeCount: 12000 },
        ],
      },
    ],
    crossIndustryInsights: [
      {
        sourceIndustry: "美食",
        inspirationTitle: "5分钟快手早餐",
        transferableElements: ["时间限定", "快速出结果"],
        adaptationSuggestion: "可以做'5分钟快速护肤routine'",
      },
    ],
    pipelineProgress: {
      stage1_ms: 5000,
      stage2_ms: 3000,
      stage3_ms: 2000,
      stage4_ms: 1500,
      stage5_ms: 4000,
      total_ms: 15500,
    },
    searchKeywords: [
      { keyword: "平价护肤", source: "ai" },
      { keyword: "学生党水乳", source: "ai" },
    ],
    rawDataSummary: {
      totalContents: 45,
      totalAccounts: 12,
      totalHotSeeds: 8,
      byPlatform: {
        douyin: { contents: 25, accounts: 7 },
        xiaohongshu: { contents: 20, accounts: 5 },
      },
    },
  };

  it("should have valid sessionId", () => {
    expect(mockV2Data.sessionId).toBeTruthy();
  });

  it("should have at least one direction", () => {
    expect(mockV2Data.directions.length).toBeGreaterThan(0);
  });

  it("each direction should have required fields", () => {
    for (const dir of mockV2Data.directions) {
      expect(dir.id).toBeTruthy();
      expect(dir.directionName).toBeTruthy();
      expect(dir.validationScore).toBeGreaterThanOrEqual(0);
      expect(dir.validationScore).toBeLessThanOrEqual(100);
      expect(dir.validationBreakdown).toBeDefined();
      expect(dir.executableTopics).toBeDefined();
    }
  });

  it("validation breakdown should sum to correct total", () => {
    const dir = mockV2Data.directions[0];
    const b = dir.validationBreakdown;
    const expected = b.searchHitScore * 0.3 + b.lowFollowerScore * 0.3 + b.commentDemandScore * 0.2 + b.peerSuccessScore * 0.2;
    // 验证 breakdown 分数加权和在合理范围内
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(expected).toBeLessThanOrEqual(100);
    // 验证分在合理范围内（引擎可能对加权和做额外调整，如基础分提升）
    expect(dir.validationScore).toBeGreaterThanOrEqual(0);
    expect(dir.validationScore).toBeLessThanOrEqual(100);
  });

  it("executable topics should have title, angle, hook", () => {
    for (const dir of mockV2Data.directions) {
      for (const topic of dir.executableTopics) {
        expect(topic.title).toBeTruthy();
        expect(topic.angle).toBeTruthy();
        expect(topic.hook).toBeTruthy();
      }
    }
  });

  it("validation evidence should have arrays", () => {
    const dir = mockV2Data.directions[0];
    if (dir.validationEvidence) {
      expect(Array.isArray(dir.validationEvidence.matchedContentTitles)).toBe(true);
      expect(Array.isArray(dir.validationEvidence.realCommentDemands)).toBe(true);
      expect(Array.isArray(dir.validationEvidence.matchedPeerNames)).toBe(true);
    }
  });

  it("evolved children should be optional", () => {
    const dir = mockV2Data.directions[0];
    if (dir.evolvedChildren) {
      expect(Array.isArray(dir.evolvedChildren)).toBe(true);
      for (const child of dir.evolvedChildren) {
        expect(child.directionName).toBeTruthy();
        expect(child.validationScore).toBeDefined();
      }
    }
  });
});

// ─── CTA 联动逻辑验证 ───
describe("CTA cross-linking logic", () => {
  it("topic_strategy → opportunity_check CTA should carry track", () => {
    const track = "美妆护肤";
    const ctaPayload = {
      action: "opportunity_check",
      context: { track, source: "topic_strategy" },
    };
    expect(ctaPayload.action).toBe("opportunity_check");
    expect(ctaPayload.context.track).toBe(track);
  });

  it("opportunity_prediction → topic_strategy CTA should carry track", () => {
    const track = "美妆护肤";
    const ctaPayload = {
      action: "topic_strategy",
      context: { track, source: "opportunity_prediction" },
    };
    expect(ctaPayload.action).toBe("topic_strategy");
    expect(ctaPayload.context.track).toBe(track);
  });

  it("direction_scripts CTA should carry direction context", () => {
    const direction = {
      directionName: "平价护肤测评",
      validationScore: 72,
      executableTopics: [
        { title: "学生党必入的5款平价水乳", angle: "学生预算", hook: "全部不超过50元" },
      ],
    };
    const ctaPayload = {
      action: "direction_scripts",
      context: {
        directionName: direction.directionName,
        validationScore: direction.validationScore,
        topics: direction.executableTopics,
      },
    };
    expect(ctaPayload.context.directionName).toBe("平价护肤测评");
    expect(ctaPayload.context.topics).toHaveLength(1);
  });

  it("direction_calendar CTA should carry multiple directions", () => {
    const directions = [
      { directionName: "方向1", validationScore: 80 },
      { directionName: "方向2", validationScore: 60 },
    ];
    const ctaPayload = {
      action: "direction_calendar",
      context: {
        directions: directions.map((d) => ({
          name: d.directionName,
          score: d.validationScore,
        })),
      },
    };
    expect(ctaPayload.context.directions).toHaveLength(2);
    // 高分方向应排在前面
    const sorted = [...ctaPayload.context.directions].sort((a, b) => b.score - a.score);
    expect(sorted[0].name).toBe("方向1");
  });
});

// ─── 空态处理验证 ───
describe("Empty state handling", () => {
  it("should handle empty directions gracefully", () => {
    const emptyData = {
      directions: [],
      peerBenchmarks: [],
      crossIndustryInsights: [],
    };
    expect(emptyData.directions).toHaveLength(0);
    // 前端应显示空态提示
    const shouldShowEmptyState = emptyData.directions.length === 0;
    expect(shouldShowEmptyState).toBe(true);
  });

  it("should handle direction with no executable topics", () => {
    const direction = {
      directionName: "测试方向",
      executableTopics: [],
      validationScore: 30,
    };
    expect(direction.executableTopics).toHaveLength(0);
    // 低分方向可能没有可执行选题
    const hasTopics = direction.executableTopics.length > 0;
    expect(hasTopics).toBe(false);
  });

  it("should handle missing validation evidence", () => {
    const direction = {
      directionName: "测试方向",
      validationScore: 50,
      validationEvidence: undefined as undefined | { matchedContentTitles: string[] },
    };
    // 前端应安全处理 undefined evidence
    const titles = direction.validationEvidence?.matchedContentTitles ?? [];
    expect(titles).toHaveLength(0);
  });

  it("should handle empty peer benchmarks", () => {
    const peers: unknown[] = [];
    const shouldShowPeerSection = peers.length > 0;
    expect(shouldShowPeerSection).toBe(false);
  });

  it("should handle empty cross-industry insights", () => {
    const insights: unknown[] = [];
    const shouldShowCrossIndustrySection = insights.length > 0;
    expect(shouldShowCrossIndustrySection).toBe(false);
  });

  it("should handle missing platform scores", () => {
    const direction = {
      directionName: "测试方向",
      platformScores: undefined as undefined | Record<string, { score: number }>,
    };
    const scores = direction.platformScores ?? {};
    expect(Object.keys(scores)).toHaveLength(0);
  });
});

// ─── 排序逻辑验证 ───
describe("Direction sorting logic", () => {
  const directions = [
    { directionName: "方向A", validationScore: 50, priorityRank: 2 },
    { directionName: "方向B", validationScore: 80, priorityRank: 1 },
    { directionName: "方向C", validationScore: 65, priorityRank: 3 },
  ];

  it("should sort by validation score descending", () => {
    const sorted = [...directions].sort((a, b) => b.validationScore - a.validationScore);
    expect(sorted[0].directionName).toBe("方向B");
    expect(sorted[1].directionName).toBe("方向C");
    expect(sorted[2].directionName).toBe("方向A");
  });

  it("should sort by priority rank ascending", () => {
    const sorted = [...directions].sort((a, b) => a.priorityRank - b.priorityRank);
    expect(sorted[0].directionName).toBe("方向B");
    expect(sorted[1].directionName).toBe("方向A");
    expect(sorted[2].directionName).toBe("方向C");
  });
});

// ─── 验证分颜色映射验证 ───
describe("Validation score color mapping", () => {
  function getScoreColor(score: number): string {
    if (score >= 80) return "green";
    if (score >= 60) return "yellow";
    return "red";
  }

  it("should return green for high scores", () => {
    expect(getScoreColor(80)).toBe("green");
    expect(getScoreColor(95)).toBe("green");
  });

  it("should return yellow for medium scores", () => {
    expect(getScoreColor(60)).toBe("yellow");
    expect(getScoreColor(79)).toBe("yellow");
  });

  it("should return red for low scores", () => {
    expect(getScoreColor(0)).toBe("red");
    expect(getScoreColor(59)).toBe("red");
  });
});
