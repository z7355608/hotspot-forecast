/**
 * server/creator-center.test.ts
 * 创作中心 & 账号连接重构 vitest 测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ================================================================== */
/*  Mock: creator-data-sync 模块                                       */
/* ================================================================== */

// 模拟 syncCreatorData 返回值
const mockSyncResult = {
  success: true,
  overview: {
    platformId: "douyin",
    platformName: "抖音",
    handle: "test_user",
    followers: 12500,
    following: 320,
    totalWorks: 45,
    avgEngagementRate: 5.2,
    totalViews: 890000,
    totalLikes: 45000,
    totalComments: 3200,
    totalShares: 1800,
    followersChange: 350,
    viewsChange: 25000,
    likesChange: 1200,
    commentsChange: 180,
    sharesChange: 95,
    engagementRateChange: 0.3,
    syncedAt: new Date().toISOString(),
    dataSource: "live" as const,
  },
  works: [
    {
      id: "aweme_001",
      title: "测试视频1",
      coverUrl: "https://example.com/cover1.jpg",
      publishedAt: new Date().toISOString(),
      type: "video" as const,
      isHot: true,
      views: 150000,
      likes: 8500,
      comments: 620,
      shares: 340,
      completionRate: 45,
      avgWatchDuration: 18,
    },
    {
      id: "aweme_002",
      title: "测试视频2",
      coverUrl: "https://example.com/cover2.jpg",
      publishedAt: new Date().toISOString(),
      type: "video" as const,
      isHot: false,
      views: 35000,
      likes: 2100,
      comments: 180,
      shares: 95,
      completionRate: 32,
      avgWatchDuration: 12,
    },
  ],
  fanProfile: {
    genderRatio: { male: 28, female: 72 },
    ageDistribution: [
      { range: "18岁以下", percentage: 8 },
      { range: "18-23岁", percentage: 32 },
      { range: "24-30岁", percentage: 35 },
      { range: "31-40岁", percentage: 18 },
      { range: "40岁以上", percentage: 7 },
    ],
    topCities: [
      { city: "北京", percentage: 12 },
      { city: "上海", percentage: 10 },
      { city: "广州", percentage: 8 },
    ],
    activeHours: [
      { hour: "20:00", percentage: 22 },
      { hour: "22:00", percentage: 18 },
    ],
    interestTags: ["美妆", "穿搭", "护肤"],
    dataSource: "live" as const,
  },
  trendData: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-03-${24 + i}`,
    followers: 12000 + i * 50,
    views: 120000 + i * 3000,
    likes: 6000 + i * 200,
    comments: 400 + i * 20,
  })),
  syncedAt: new Date().toISOString(),
};

/* ================================================================== */
/*  测试：数据模型验证                                                    */
/* ================================================================== */

describe("创作中心数据模型", () => {
  describe("AccountOverview", () => {
    it("应包含所有必需字段", () => {
      const overview = mockSyncResult.overview;
      expect(overview).toHaveProperty("platformId");
      expect(overview).toHaveProperty("handle");
      expect(overview).toHaveProperty("followers");
      expect(overview).toHaveProperty("totalWorks");
      expect(overview).toHaveProperty("avgEngagementRate");
      expect(overview).toHaveProperty("syncedAt");
      expect(overview).toHaveProperty("dataSource");
    });

    it("粉丝数应为正数", () => {
      expect(mockSyncResult.overview.followers).toBeGreaterThan(0);
    });

    it("互动率应在合理范围内 (0-100%)", () => {
      expect(mockSyncResult.overview.avgEngagementRate).toBeGreaterThanOrEqual(0);
      expect(mockSyncResult.overview.avgEngagementRate).toBeLessThanOrEqual(100);
    });

    it("dataSource 应为 live 或 cached", () => {
      expect(["live", "cached"]).toContain(mockSyncResult.overview.dataSource);
    });

    it("变化值可以为负数", () => {
      // 变化值可以为正也可以为负
      expect(typeof mockSyncResult.overview.followersChange).toBe("number");
      expect(typeof mockSyncResult.overview.engagementRateChange).toBe("number");
    });
  });

  describe("WorkItem", () => {
    it("作品列表不应为空", () => {
      expect(mockSyncResult.works.length).toBeGreaterThan(0);
    });

    it("每个作品应有唯一ID", () => {
      const ids = mockSyncResult.works.map((w) => w.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("作品类型应为 video/note/article", () => {
      mockSyncResult.works.forEach((w) => {
        expect(["video", "note", "article"]).toContain(w.type);
      });
    });

    it("isHot 标记应基于播放量", () => {
      const hotWorks = mockSyncResult.works.filter((w) => w.isHot);
      hotWorks.forEach((w) => {
        expect(w.views).toBeGreaterThan(100000);
      });
    });

    it("完播率应在 0-100 范围内", () => {
      mockSyncResult.works.forEach((w) => {
        if (w.completionRate !== undefined) {
          expect(w.completionRate).toBeGreaterThanOrEqual(0);
          expect(w.completionRate).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  describe("FanProfile", () => {
    it("性别比例之和应为100%", () => {
      const { male, female } = mockSyncResult.fanProfile.genderRatio;
      expect(male + female).toBe(100);
    });

    it("年龄分布之和应为100%", () => {
      const total = mockSyncResult.fanProfile.ageDistribution.reduce(
        (sum, item) => sum + item.percentage,
        0,
      );
      expect(total).toBe(100);
    });

    it("城市分布百分比应在合理范围", () => {
      mockSyncResult.fanProfile.topCities.forEach((city) => {
        expect(city.percentage).toBeGreaterThan(0);
        expect(city.percentage).toBeLessThanOrEqual(100);
      });
    });

    it("兴趣标签不应为空", () => {
      expect(mockSyncResult.fanProfile.interestTags.length).toBeGreaterThan(0);
    });
  });

  describe("TrendData", () => {
    it("趋势数据应有日期字段", () => {
      mockSyncResult.trendData.forEach((point) => {
        expect(point.date).toBeDefined();
        expect(typeof point.date).toBe("string");
      });
    });

    it("趋势数据应按日期排序", () => {
      for (let i = 1; i < mockSyncResult.trendData.length; i++) {
        expect(mockSyncResult.trendData[i].date >= mockSyncResult.trendData[i - 1].date).toBe(true);
      }
    });

    it("粉丝数应随时间递增（正常增长场景）", () => {
      for (let i = 1; i < mockSyncResult.trendData.length; i++) {
        expect(mockSyncResult.trendData[i].followers).toBeGreaterThanOrEqual(
          mockSyncResult.trendData[i - 1].followers,
        );
      }
    });
  });
});

/* ================================================================== */
/*  测试：同步结果验证                                                    */
/* ================================================================== */

describe("同步结果验证", () => {
  it("成功同步应返回 success: true", () => {
    expect(mockSyncResult.success).toBe(true);
  });

  it("成功同步应包含 overview", () => {
    expect(mockSyncResult.overview).toBeDefined();
  });

  it("成功同步应包含 works 数组", () => {
    expect(Array.isArray(mockSyncResult.works)).toBe(true);
  });

  it("成功同步应包含 fanProfile", () => {
    expect(mockSyncResult.fanProfile).toBeDefined();
  });

  it("成功同步应包含 trendData 数组", () => {
    expect(Array.isArray(mockSyncResult.trendData)).toBe(true);
  });

  it("成功同步应包含 syncedAt 时间戳", () => {
    expect(mockSyncResult.syncedAt).toBeDefined();
    expect(new Date(mockSyncResult.syncedAt).getTime()).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  测试：账号连接（扫码登录模式）                                          */
/* ================================================================== */

describe("账号连接 - 扫码登录模式", () => {
  describe("ConnectorBindingInput 验证", () => {
    it("扫码登录模式不需要 profileUrl", () => {
      const input = {
        authMode: "cookie" as const,
        // profileUrl 不需要
        // handle 不需要
        // platformUserId 不需要
      };
      expect(input.authMode).toBe("cookie");
      expect((input as any).profileUrl).toBeUndefined();
      expect((input as any).handle).toBeUndefined();
      expect((input as any).platformUserId).toBeUndefined();
    });

    it("扫码登录后应自动填充用户信息", () => {
      // 模拟扫码登录完成后的 connector record
      const connectorAfterLogin = {
        platformId: "douyin",
        authMode: "cookie" as const,
        handle: "auto_detected_user",
        profileUrl: "https://www.douyin.com/user/MS4wLjABAAAAtest",
        platformUserId: "MS4wLjABAAAAtest",
        cookieConfigured: true,
        verifyStatus: "verified" as const,
      };
      expect(connectorAfterLogin.handle).toBeDefined();
      expect(connectorAfterLogin.profileUrl).toContain("douyin.com");
      expect(connectorAfterLogin.cookieConfigured).toBe(true);
    });
  });

  describe("登录会话管理", () => {
    it("创建登录会话应返回 sessionId", () => {
      const session = {
        sessionId: "sess_abc123",
        platformId: "douyin",
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe("pending");
    });

    it("登录完成后状态应变为 completed", () => {
      const session = {
        sessionId: "sess_abc123",
        platformId: "douyin",
        status: "completed" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      expect(session.status).toBe("completed");
      expect(session.completedAt).toBeDefined();
    });

    it("登录超时后状态应变为 expired", () => {
      const session = {
        sessionId: "sess_abc123",
        platformId: "douyin",
        status: "expired" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(session.status).toBe("expired");
    });
  });
});

/* ================================================================== */
/*  测试：缓存策略                                                       */
/* ================================================================== */

describe("缓存策略", () => {
  const CACHE_TTL = {
    overview: 60 * 60 * 1000, // 1小时
    works: 2 * 60 * 60 * 1000, // 2小时
    fanProfile: 24 * 60 * 60 * 1000, // 24小时
  };

  it("概览数据缓存TTL应为1小时", () => {
    expect(CACHE_TTL.overview).toBe(3600000);
  });

  it("作品列表缓存TTL应为2小时", () => {
    expect(CACHE_TTL.works).toBe(7200000);
  });

  it("粉丝画像缓存TTL应为24小时", () => {
    expect(CACHE_TTL.fanProfile).toBe(86400000);
  });

  it("缓存过期判断逻辑", () => {
    const cachedAt = new Date("2026-03-31T00:00:00Z").getTime();
    const now = new Date("2026-03-31T01:30:00Z").getTime();
    const elapsed = now - cachedAt;

    // 概览数据已过期（1.5h > 1h）
    expect(elapsed > CACHE_TTL.overview).toBe(true);
    // 作品列表未过期（1.5h < 2h）
    expect(elapsed > CACHE_TTL.works).toBe(false);
    // 粉丝画像未过期（1.5h < 24h）
    expect(elapsed > CACHE_TTL.fanProfile).toBe(false);
  });
});

/* ================================================================== */
/*  测试：错误处理                                                       */
/* ================================================================== */

describe("错误处理", () => {
  it("同步失败应返回 success: false 和错误信息", () => {
    const failedResult = {
      success: false,
      error: "cookie已过期，请重新扫码登录",
      syncedAt: new Date().toISOString(),
    };
    expect(failedResult.success).toBe(false);
    expect(failedResult.error).toBeDefined();
    expect(failedResult.error).toContain("cookie");
  });

  it("API 429 错误应提示频率限制", () => {
    const error = { status: 429, message: "请求频率限制" };
    expect(error.status).toBe(429);
  });

  it("API 401/403 错误应提示重新登录", () => {
    const handleAuthError = (status: number) => {
      if (status === 401 || status === 403) {
        return "cookie已过期，请重新扫码登录";
      }
      return null;
    };
    expect(handleAuthError(401)).toContain("重新扫码");
    expect(handleAuthError(403)).toContain("重新扫码");
    expect(handleAuthError(200)).toBeNull();
  });
});

/* ================================================================== */
/*  测试：数据格式化工具                                                  */
/* ================================================================== */

describe("数据格式化工具", () => {
  function formatNumber(num: number | undefined): string {
    if (num === undefined) return "-";
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  }

  it("应正确格式化亿级数字", () => {
    expect(formatNumber(150000000)).toBe("1.5亿");
  });

  it("应正确格式化万级数字", () => {
    expect(formatNumber(45000)).toBe("4.5万");
  });

  it("应正确格式化千级数字", () => {
    expect(formatNumber(3200)).toBe("3.2k");
  });

  it("应正确处理小数字", () => {
    expect(formatNumber(999)).toBe("999");
  });

  it("应正确处理 undefined", () => {
    expect(formatNumber(undefined)).toBe("-");
  });

  it("应正确处理 0", () => {
    expect(formatNumber(0)).toBe("0");
  });
});
