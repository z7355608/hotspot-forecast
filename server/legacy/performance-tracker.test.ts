import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════
// 效果追踪系统测试
// 覆盖：准确率计算、互动评分算法、时间窗口判断、数据格式验证
// ═══════════════════════════════════════════════════════════════

// ─── 辅助函数（复刻后端逻辑，验证业务规则） ───

/** 采集时间点配置（小时） */
const CHECKPOINTS = [
  { label: "1h", hoursAfter: 1 },
  { label: "6h", hoursAfter: 6 },
  { label: "24h", hoursAfter: 24 },
  { label: "72h", hoursAfter: 72 },
  { label: "7d", hoursAfter: 168 },
];

/** 计算实际表现评分（0-100），复刻 computePredictionAccuracy 中的算法 */
function computeActualScore(stats: {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
}): number {
  const totalInteraction =
    stats.likeCount +
    stats.commentCount * 3 +
    stats.shareCount * 5 +
    stats.collectCount * 2;
  const viewCount = stats.viewCount || 1;
  const interactionRate = totalInteraction / Math.max(viewCount, 1);

  let actualScore: number;
  if (interactionRate > 0.1) {
    actualScore = Math.min(100, 80 + (interactionRate - 0.1) * 200);
  } else if (interactionRate > 0.05) {
    actualScore = 60 + (interactionRate - 0.05) * 400;
  } else if (interactionRate > 0.01) {
    actualScore = 30 + (interactionRate - 0.01) * 750;
  } else {
    actualScore = interactionRate * 3000;
  }
  return Math.round(Math.min(100, Math.max(0, actualScore)));
}

/** 计算预测准确率 */
function computeAccuracy(predicted: number, actual: number): number {
  const diff = Math.abs(predicted - actual);
  return Math.round(Math.max(0, 100 - diff));
}

/** 判断是否在采集窗口内 */
function isInCollectionWindow(
  hoursElapsed: number,
  checkpointHours: number,
): boolean {
  return hoursElapsed >= checkpointHours - 0.5 && hoursElapsed <= checkpointHours + 2;
}

/** 递归查找嵌套对象中的指定 key */
function extractNestedValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const found = extractNestedValue(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

/** 格式化数字 */
function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ═══════════════════════════════════════════════════════════════
// 1. 互动评分算法测试
// ═══════════════════════════════════════════════════════════════

describe("computeActualScore - 互动评分算法", () => {
  it("优秀互动率（>10%）应返回 80+ 分", () => {
    const score = computeActualScore({
      viewCount: 10000,
      likeCount: 800,
      commentCount: 100,
      shareCount: 50,
      collectCount: 200,
    });
    // totalInteraction = 800 + 300 + 250 + 400 = 1750
    // interactionRate = 1750 / 10000 = 0.175
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("良好互动率（5-10%）应返回 60-80 分", () => {
    const score = computeActualScore({
      viewCount: 10000,
      likeCount: 400,
      commentCount: 30,
      shareCount: 10,
      collectCount: 50,
    });
    // totalInteraction = 400 + 90 + 50 + 100 = 640
    // interactionRate = 640 / 10000 = 0.064
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(80);
  });

  it("一般互动率（1-5%）应返回 30-60 分", () => {
    const score = computeActualScore({
      viewCount: 10000,
      likeCount: 100,
      commentCount: 10,
      shareCount: 5,
      collectCount: 20,
    });
    // totalInteraction = 100 + 30 + 25 + 40 = 195
    // interactionRate = 195 / 10000 = 0.0195
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(60);
  });

  it("较差互动率（<1%）应返回 0-30 分", () => {
    const score = computeActualScore({
      viewCount: 100000,
      likeCount: 50,
      commentCount: 5,
      shareCount: 1,
      collectCount: 10,
    });
    // totalInteraction = 50 + 15 + 5 + 20 = 90
    // interactionRate = 90 / 100000 = 0.0009
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(30);
  });

  it("零互动应返回 0 分", () => {
    const score = computeActualScore({
      viewCount: 10000,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      collectCount: 0,
    });
    expect(score).toBe(0);
  });

  it("播放量为 0 时不应崩溃", () => {
    const score = computeActualScore({
      viewCount: 0,
      likeCount: 100,
      commentCount: 10,
      shareCount: 5,
      collectCount: 20,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("分数应始终在 0-100 范围内", () => {
    // 极端高互动
    const highScore = computeActualScore({
      viewCount: 100,
      likeCount: 1000,
      commentCount: 500,
      shareCount: 200,
      collectCount: 300,
    });
    expect(highScore).toBeLessThanOrEqual(100);
    expect(highScore).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. 预测准确率计算测试
// ═══════════════════════════════════════════════════════════════

describe("computeAccuracy - 预测准确率", () => {
  it("预测分与实际分完全一致时准确率为 100%", () => {
    expect(computeAccuracy(75, 75)).toBe(100);
  });

  it("预测分与实际分差 10 分时准确率为 90%", () => {
    expect(computeAccuracy(80, 70)).toBe(90);
  });

  it("预测分与实际分差 50 分时准确率为 50%", () => {
    expect(computeAccuracy(80, 30)).toBe(50);
  });

  it("预测分与实际分差 100 分时准确率为 0%", () => {
    expect(computeAccuracy(100, 0)).toBe(0);
  });

  it("准确率不应为负数", () => {
    // 差值超过 100 的极端情况不会发生（分数范围 0-100），但算法应安全
    const accuracy = computeAccuracy(0, 100);
    expect(accuracy).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. 采集窗口判断测试
// ═══════════════════════════════════════════════════════════════

describe("isInCollectionWindow - 采集窗口判断", () => {
  it("1h 检查点：0.5h 后应在窗口内", () => {
    expect(isInCollectionWindow(0.5, 1)).toBe(true);
  });

  it("1h 检查点：1h 后应在窗口内", () => {
    expect(isInCollectionWindow(1, 1)).toBe(true);
  });

  it("1h 检查点：3h 后应在窗口边界（hoursAfter+2=3）", () => {
    expect(isInCollectionWindow(3, 1)).toBe(true); // 3 == 1+2，刚好在边界
  });

  it("1h 检查点：3.1h 后应在窗口外", () => {
    expect(isInCollectionWindow(3.1, 1)).toBe(false);
  });

  it("24h 检查点：23.5h 后应在窗口内", () => {
    expect(isInCollectionWindow(23.5, 24)).toBe(true);
  });

  it("24h 检查点：26h 后应在窗口内", () => {
    expect(isInCollectionWindow(26, 24)).toBe(true);
  });

  it("24h 检查点：27h 后应在窗口外", () => {
    expect(isInCollectionWindow(27, 24)).toBe(false);
  });

  it("7d 检查点：167.5h 后应在窗口内", () => {
    expect(isInCollectionWindow(167.5, 168)).toBe(true);
  });

  it("7d 检查点：170h 后应在窗口内", () => {
    expect(isInCollectionWindow(170, 168)).toBe(true);
  });

  it("7d 检查点：171h 后应在窗口外", () => {
    expect(isInCollectionWindow(171, 168)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. 检查点配置验证
// ═══════════════════════════════════════════════════════════════

describe("CHECKPOINTS 配置", () => {
  it("应有 5 个检查点", () => {
    expect(CHECKPOINTS).toHaveLength(5);
  });

  it("检查点应按时间递增排列", () => {
    for (let i = 1; i < CHECKPOINTS.length; i++) {
      expect(CHECKPOINTS[i].hoursAfter).toBeGreaterThan(
        CHECKPOINTS[i - 1].hoursAfter,
      );
    }
  });

  it("最后一个检查点应为 7d（168h）", () => {
    expect(CHECKPOINTS[CHECKPOINTS.length - 1].label).toBe("7d");
    expect(CHECKPOINTS[CHECKPOINTS.length - 1].hoursAfter).toBe(168);
  });

  it("所有检查点标签应唯一", () => {
    const labels = CHECKPOINTS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. extractNestedValue 工具函数测试
// ═══════════════════════════════════════════════════════════════

describe("extractNestedValue", () => {
  it("应从顶层对象中提取值", () => {
    const obj = { play_count: 1000 };
    expect(extractNestedValue(obj, "play_count")).toBe(1000);
  });

  it("应从嵌套对象中提取值", () => {
    const obj = {
      data: {
        aweme_detail: {
          statistics: { play_count: 5000 },
        },
      },
    };
    expect(extractNestedValue(obj, "play_count")).toBe(5000);
  });

  it("找不到 key 时应返回 null", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(extractNestedValue(obj, "nonexistent")).toBeNull();
  });

  it("输入 null 时应返回 null", () => {
    expect(extractNestedValue(null, "key")).toBeNull();
  });

  it("输入非对象时应返回 null", () => {
    expect(extractNestedValue("string", "key")).toBeNull();
    expect(extractNestedValue(123, "key")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. 前端数字格式化测试
// ═══════════════════════════════════════════════════════════════

describe("formatNumber - 数字格式化", () => {
  it("小于 1000 的数字直接显示", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
  });

  it("1000-9999 显示为 k", () => {
    expect(formatNumber(1000)).toBe("1.0k");
    expect(formatNumber(5500)).toBe("5.5k");
  });

  it("10000+ 显示为 w", () => {
    expect(formatNumber(10000)).toBe("1.0w");
    expect(formatNumber(15000)).toBe("1.5w");
    expect(formatNumber(100000)).toBe("10.0w");
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. 平台标签和颜色映射测试
// ═══════════════════════════════════════════════════════════════

describe("平台标签映射", () => {
  const PLATFORM_LABELS: Record<string, string> = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    kuaishou: "快手",
  };

  it("应正确映射所有支持的平台", () => {
    expect(PLATFORM_LABELS.douyin).toBe("抖音");
    expect(PLATFORM_LABELS.xiaohongshu).toBe("小红书");
    expect(PLATFORM_LABELS.kuaishou).toBe("快手");
  });

  it("不支持的平台应返回 undefined", () => {
    expect(PLATFORM_LABELS.bilibili).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. 数据格式验证测试
// ═══════════════════════════════════════════════════════════════

describe("数据格式验证", () => {
  it("PublishedContent 对象应包含必要字段", () => {
    const item = {
      id: 1,
      userOpenId: "test-user",
      platform: "douyin",
      contentId: "123456",
      contentUrl: "https://www.douyin.com/video/123456",
      publishedTitle: "测试视频",
      directionName: "美食探店",
      strategySessionId: "session-1",
      predictedScore: 75,
      publishedAt: new Date().toISOString(),
      performanceData: [],
    };

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("platform");
    expect(item).toHaveProperty("publishedAt");
    expect(typeof item.id).toBe("number");
    expect(typeof item.platform).toBe("string");
  });

  it("PerformanceCheckpoint 对象应包含所有指标字段", () => {
    const checkpoint = {
      checkpoint: "24h",
      viewCount: 10000,
      likeCount: 500,
      commentCount: 50,
      shareCount: 20,
      collectCount: 100,
      collectedAt: new Date().toISOString(),
    };

    expect(checkpoint).toHaveProperty("checkpoint");
    expect(checkpoint).toHaveProperty("viewCount");
    expect(checkpoint).toHaveProperty("likeCount");
    expect(checkpoint).toHaveProperty("commentCount");
    expect(checkpoint).toHaveProperty("shareCount");
    expect(checkpoint).toHaveProperty("collectCount");
    expect(typeof checkpoint.viewCount).toBe("number");
  });

  it("AccuracyResult 应包含汇总字段", () => {
    const result = {
      items: [],
      overallAccuracy: 75,
      totalItems: 10,
    };

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("overallAccuracy");
    expect(result).toHaveProperty("totalItems");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.overallAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.overallAccuracy).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. 整体准确率计算测试
// ═══════════════════════════════════════════════════════════════

describe("整体准确率计算", () => {
  function computeOverallAccuracy(
    items: Array<{ accuracy: number }>,
  ): number {
    if (items.length === 0) return 0;
    return Math.round(
      items.reduce((s, r) => s + r.accuracy, 0) / items.length,
    );
  }

  it("空列表应返回 0", () => {
    expect(computeOverallAccuracy([])).toBe(0);
  });

  it("单个项目应返回该项目的准确率", () => {
    expect(computeOverallAccuracy([{ accuracy: 85 }])).toBe(85);
  });

  it("多个项目应返回平均准确率", () => {
    const items = [
      { accuracy: 90 },
      { accuracy: 80 },
      { accuracy: 70 },
    ];
    expect(computeOverallAccuracy(items)).toBe(80);
  });

  it("结果应四舍五入到整数", () => {
    const items = [
      { accuracy: 90 },
      { accuracy: 85 },
    ];
    // (90 + 85) / 2 = 87.5 → 88
    expect(computeOverallAccuracy(items)).toBe(88);
  });
});
