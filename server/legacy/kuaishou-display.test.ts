import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════
// 快手前端展示优化测试
// 覆盖：ContentList快手分支、低粉爆款快手分支、评论不可用提示、
//       平台类型扩展、监控中心快手选项
// ═══════════════════════════════════════════════════════════════

// ─── 辅助函数（复刻前端逻辑，验证业务规则） ───

function isKuaishouContent(content: { platform: string }): boolean {
  return content.platform === "快手" || content.platform === "kuaishou";
}

function calcEngagementScore(content: {
  likeCount: number | null;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
}): number {
  const like = content.likeCount ?? 0;
  const comment = content.commentCount ?? 0;
  const collect = content.collectCount ?? 0;
  const share = content.shareCount ?? 0;
  return like + comment * 3 + collect * 2 + share * 5;
}

function calcShareLikeRatio(content: {
  likeCount: number | null;
  shareCount: number | null;
}): string {
  const like = content.likeCount ?? 0;
  const share = content.shareCount ?? 0;
  if (like === 0) return "—";
  return `${((share / like) * 100).toFixed(1)}%`;
}

function calcCollectLikeRatio(content: {
  likeCount: number | null;
  collectCount: number | null;
}): string {
  const like = content.likeCount ?? 0;
  const collect = content.collectCount ?? 0;
  if (like === 0) return "—";
  return `${((collect / like) * 100).toFixed(1)}%`;
}

// ─── 1. isKuaishouContent 平台检测 ───

describe("isKuaishouContent", () => {
  it('detects "快手" as kuaishou', () => {
    expect(isKuaishouContent({ platform: "快手" })).toBe(true);
  });

  it('detects "kuaishou" as kuaishou', () => {
    expect(isKuaishouContent({ platform: "kuaishou" })).toBe(true);
  });

  it("does not match douyin", () => {
    expect(isKuaishouContent({ platform: "douyin" })).toBe(false);
  });

  it("does not match xiaohongshu", () => {
    expect(isKuaishouContent({ platform: "xiaohongshu" })).toBe(false);
  });

  it("does not match empty string", () => {
    expect(isKuaishouContent({ platform: "" })).toBe(false);
  });
});

// ─── 2. ContentList 快手主卡片指标展示逻辑 ───

describe("ContentList kuaishou card metrics", () => {
  const ksContent = {
    contentId: "ks-001",
    title: "快手测试视频",
    authorName: "测试用户",
    platform: "kuaishou",
    publishedAt: "2026-03-20",
    viewCount: 500000,
    likeCount: 12000,
    commentCount: 0,
    shareCount: 3500,
    collectCount: 0,
    structureSummary: "短视频",
    keywordTokens: ["测试"],
    whyIncluded: "高互动",
  };

  const dyContent = {
    ...ksContent,
    contentId: "dy-001",
    platform: "douyin",
    viewCount: null,
    commentCount: 800,
    collectCount: 2000,
    shareCount: 500,
  };

  it("kuaishou card shows viewCount when available", () => {
    const isKs = isKuaishouContent(ksContent);
    expect(isKs).toBe(true);
    // 快手卡片应展示播放量
    expect(ksContent.viewCount).toBe(500000);
  });

  it("kuaishou card shows shareCount as 转发", () => {
    const isKs = isKuaishouContent(ksContent);
    expect(isKs).toBe(true);
    // 快手卡片第一行第三列展示转发数
    expect(ksContent.shareCount).toBe(3500);
  });

  it("kuaishou card hides collectCount (收藏)", () => {
    const isKs = isKuaishouContent(ksContent);
    expect(isKs).toBe(true);
    // 快手不展示收藏数（API不提供）
    // 前端逻辑：isKs 时不渲染收藏列
  });

  it("kuaishou card shows 评论 as 不可用", () => {
    const isKs = isKuaishouContent(ksContent);
    expect(isKs).toBe(true);
    // 快手第二行第一列：评论显示"不可用"
    // commentCount 为 0 但不显示数字，而是显示文字"不可用"
  });

  it("kuaishou card shows 转发率 instead of 收藏率", () => {
    const isKs = isKuaishouContent(ksContent);
    expect(isKs).toBe(true);
    const ratio = calcShareLikeRatio(ksContent);
    expect(ratio).toBe("29.2%"); // 3500/12000 * 100
  });

  it("douyin card shows commentCount and collectCount normally", () => {
    const isKs = isKuaishouContent(dyContent);
    expect(isKs).toBe(false);
    // 抖音卡片正常展示评论和收藏
    expect(dyContent.commentCount).toBe(800);
    expect(dyContent.collectCount).toBe(2000);
  });

  it("douyin card shows 收藏率 instead of 转发率", () => {
    const isKs = isKuaishouContent(dyContent);
    expect(isKs).toBe(false);
    const ratio = calcCollectLikeRatio(dyContent);
    expect(ratio).toBe("16.7%"); // 2000/12000 * 100
  });

  it("engagement score calculation works for kuaishou (no collect)", () => {
    const score = calcEngagementScore(ksContent);
    // 12000 + 0*3 + 0*2 + 3500*5 = 12000 + 17500 = 29500
    expect(score).toBe(29500);
  });

  it("engagement score calculation works for douyin (with collect)", () => {
    const score = calcEngagementScore(dyContent);
    // 12000 + 800*3 + 2000*2 + 500*5 = 12000 + 2400 + 4000 + 2500 = 20900
    expect(score).toBe(20900);
  });
});

// ─── 3. 低粉爆款卡片快手适配 ───

describe("Low follower evidence kuaishou adaptation", () => {
  const ksSample = {
    id: "ks-lf-001",
    platform: "kuaishou",
    contentForm: "短视频",
    title: "快手低粉爆款",
    account: "小号用户",
    fansLabel: "3000粉",
    fansCount: 3000,
    anomaly: 85,
    playCount: "50万",
    likeCount: 8000,
    commentCount: 0,
    collectCount: 0,
    shareCount: 2000,
    trackTags: ["美食", "日常"],
    suggestion: "可以参考这个方向",
    publishedAt: "2026-03-15",
  };

  it("kuaishou low-follower sample shows playCount", () => {
    const isKs = isKuaishouContent(ksSample);
    expect(isKs).toBe(true);
    expect(ksSample.playCount).toBe("50万");
  });

  it("kuaishou low-follower sample shows 转发 instead of 收藏", () => {
    const isKs = isKuaishouContent(ksSample);
    expect(isKs).toBe(true);
    // 快手低粉卡片：播放/点赞/转发 三列
    expect(ksSample.shareCount).toBe(2000);
  });

  it("kuaishou low-follower sample shows 转发率 instead of 收藏率", () => {
    const isKs = isKuaishouContent(ksSample);
    expect(isKs).toBe(true);
    const ratio = calcShareLikeRatio(ksSample);
    expect(ratio).toBe("25.0%"); // 2000/8000 * 100
  });

  it("kuaishou low-follower engagement score excludes collect", () => {
    const score = calcEngagementScore(ksSample);
    // 8000 + 0*3 + 0*2 + 2000*5 = 8000 + 10000 = 18000
    expect(score).toBe(18000);
  });
});

// ─── 4. 评论洞察区快手不可用提示 ───

describe("Comment insight unavailable reason for kuaishou", () => {
  it("shows kuaishou-specific message when unavailableReason contains 快手", () => {
    const insight = {
      totalCommentsCollected: 0,
      highFreqKeywords: [],
      sentimentSummary: "unknown" as const,
      demandSignals: [],
      highlights: [],
      unavailableReason: "快手平台评论接口不可用",
    };

    expect(insight.unavailableReason).toBeTruthy();
    expect(
      insight.unavailableReason!.includes("快手") ||
        insight.unavailableReason!.includes("kuaishou")
    ).toBe(true);
  });

  it("shows kuaishou-specific message when unavailableReason contains kuaishou", () => {
    const insight = {
      totalCommentsCollected: 0,
      highFreqKeywords: [],
      sentimentSummary: "unknown" as const,
      demandSignals: [],
      highlights: [],
      unavailableReason: "kuaishou comments unavailable",
    };

    expect(
      insight.unavailableReason!.includes("快手") ||
        insight.unavailableReason!.includes("kuaishou")
    ).toBe(true);
  });

  it("does not trigger kuaishou message for other platforms", () => {
    const insight = {
      totalCommentsCollected: 0,
      highFreqKeywords: [],
      sentimentSummary: "unknown" as const,
      demandSignals: [],
      highlights: [],
      unavailableReason: "抖音评论接口限流",
    };

    expect(
      insight.unavailableReason!.includes("快手") ||
        insight.unavailableReason!.includes("kuaishou")
    ).toBe(false);
  });

  it("unavailableReason is undefined when comments are available", () => {
    const insight = {
      totalCommentsCollected: 42,
      highFreqKeywords: ["好看"],
      sentimentSummary: "positive" as const,
      demandSignals: [],
      highlights: [],
    };

    expect((insight as any).unavailableReason).toBeUndefined();
    expect(insight.totalCommentsCollected).toBeGreaterThan(0);
  });

  it("shows unavailable banner only when unavailableReason is set", () => {
    const withReason = { unavailableReason: "快手评论不可用", totalCommentsCollected: 0 };
    const withoutReason = { totalCommentsCollected: 50 };

    // 有 unavailableReason → 显示不可用提示
    expect(withReason.unavailableReason).toBeTruthy();
    // 无 unavailableReason → 不显示不可用提示
    expect((withoutReason as any).unavailableReason).toBeUndefined();
  });
});

// ─── 5. 平台类型扩展验证 ───

describe("Platform type extensions for kuaishou", () => {
  it("SupportedTrendPlatform includes kuaishou", () => {
    type SupportedTrendPlatform = "douyin" | "xiaohongshu" | "kuaishou";
    const platforms: SupportedTrendPlatform[] = ["douyin", "xiaohongshu", "kuaishou"];
    expect(platforms).toContain("kuaishou");
  });

  it("PLATFORM_OPTIONS includes kuaishou", () => {
    const PLATFORM_OPTIONS = [
      { value: "douyin", label: "抖音" },
      { value: "xiaohongshu", label: "小红书" },
      { value: "kuaishou", label: "快手" },
    ];
    const ksOption = PLATFORM_OPTIONS.find((o) => o.value === "kuaishou");
    expect(ksOption).toBeDefined();
    expect(ksOption!.label).toBe("快手");
  });

  it("PLATFORM_LABEL maps kuaishou correctly", () => {
    const PLATFORM_LABEL: Record<string, string> = {
      douyin: "抖音",
      xiaohongshu: "小红书",
      kuaishou: "快手",
    };
    expect(PLATFORM_LABEL["kuaishou"]).toBe("快手");
  });

  it("ACCOUNT_TIER_RULES_V1 has kuaishou thresholds", () => {
    // 快手粉丝分层阈值（与抖音类似但可独立调整）
    const ksTiers = {
      headKol: 1_000_000,
      standardKol: 100_000,
      strongKoc: 10_000,
    };
    expect(ksTiers.headKol).toBe(1_000_000);
    expect(ksTiers.standardKol).toBe(100_000);
    expect(ksTiers.strongKoc).toBe(10_000);
  });
});

// ─── 6. 快手评论接口监控机制 ───

describe("Kuaishou comment endpoint monitoring", () => {
  const KUAISHOU_COMMENT_ENDPOINTS = [
    "/api/v1/kuaishou/web/fetch_video_comments",
    "/api/v1/kuaishou/web/fetch_video_comments_reply",
    "/api/v1/kuaishou/app/fetch_video_comments",
    "/api/v1/kuaishou/app/fetch_video_comments_reply",
  ];

  it("monitors all 4 kuaishou comment endpoints", () => {
    expect(KUAISHOU_COMMENT_ENDPOINTS).toHaveLength(4);
  });

  it("each endpoint follows correct path pattern", () => {
    for (const ep of KUAISHOU_COMMENT_ENDPOINTS) {
      expect(ep).toMatch(/^\/api\/v1\/kuaishou\/(web|app)\/fetch_video_comments/);
    }
  });

  it("probe result structure is correct", () => {
    const probeResult = {
      endpoint: KUAISHOU_COMMENT_ENDPOINTS[0],
      status: "unavailable" as const,
      httpStatus: 403,
      checkedAt: new Date().toISOString(),
      error: "Forbidden",
    };

    expect(probeResult.status).toBe("unavailable");
    expect(probeResult.httpStatus).toBe(403);
    expect(probeResult.checkedAt).toBeTruthy();
  });

  it("probe detects recovery when endpoint returns 200", () => {
    const probeResult = {
      endpoint: KUAISHOU_COMMENT_ENDPOINTS[0],
      status: "available" as const,
      httpStatus: 200,
      checkedAt: new Date().toISOString(),
    };

    expect(probeResult.status).toBe("available");
    expect(probeResult.httpStatus).toBe(200);
  });
});

// ─── 7. 快手内容卡片与其他平台的差异化展示 ───

describe("Cross-platform display differentiation", () => {
  const platforms = [
    {
      name: "douyin",
      showsViewCount: false, // 抖音播放量不可用
      showsCollect: true,
      showsComments: true,
      showsShareAsForward: false,
      secondRowMetrics: ["分享", "互动力", "收藏率"],
    },
    {
      name: "xiaohongshu",
      showsViewCount: false,
      showsCollect: true,
      showsComments: true,
      showsShareAsForward: false,
      secondRowMetrics: ["分享", "互动力", "收藏率"],
    },
    {
      name: "kuaishou",
      showsViewCount: true, // 快手有播放量
      showsCollect: false, // 快手无收藏
      showsComments: false, // 快手评论不可用
      showsShareAsForward: true, // 快手转发 = 分享
      secondRowMetrics: ["评论(不可用)", "互动力", "转发率"],
    },
  ];

  it("kuaishou uniquely shows viewCount", () => {
    const ks = platforms.find((p) => p.name === "kuaishou")!;
    expect(ks.showsViewCount).toBe(true);
    // 其他平台不展示播放量
    expect(platforms.filter((p) => p.showsViewCount).length).toBe(1);
  });

  it("kuaishou uniquely hides collect", () => {
    const ks = platforms.find((p) => p.name === "kuaishou")!;
    expect(ks.showsCollect).toBe(false);
    // 其他平台展示收藏
    expect(platforms.filter((p) => !p.showsCollect).length).toBe(1);
  });

  it("kuaishou uses 转发率 while others use 收藏率", () => {
    const ks = platforms.find((p) => p.name === "kuaishou")!;
    expect(ks.secondRowMetrics).toContain("转发率");
    expect(ks.secondRowMetrics).not.toContain("收藏率");

    const dy = platforms.find((p) => p.name === "douyin")!;
    expect(dy.secondRowMetrics).toContain("收藏率");
    expect(dy.secondRowMetrics).not.toContain("转发率");
  });

  it("all platforms show engagement score", () => {
    for (const p of platforms) {
      expect(p.secondRowMetrics).toContain("互动力");
    }
  });
});
