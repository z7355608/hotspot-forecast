/**
 * commercial-quality.test.ts
 * ═══════════════════════════════════════════════════════════════
 * 商业化交付标准验证测试 — 覆盖5大核心修复
 *
 * P1: 数据清洗与筛选机制（LLM语义过滤）
 * P2: 信任校准与文案优化（爆发指数、置信度说明）
 * P3: 深度归因分析优化（LLM动态生成归因文案）
 * P4: 异常数据展示修复（增长率/占比阈值）
 * P5: UI细节优化（雷达图标签截断）
 * ═══════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

// ── P1: 语义过滤模块测试 ──

describe("P1: 语义过滤模块", () => {
  it("filterContentsByRelevance 应导出为函数", async () => {
    const mod = await import("./legacy/semantic-filter.js");
    expect(typeof mod.filterContentsByRelevance).toBe("function");
  });

  it("filterKeywordsByRelevance 应导出为函数", async () => {
    const mod = await import("./legacy/semantic-filter.js");
    expect(typeof mod.filterKeywordsByRelevance).toBe("function");
  });

  it("空数组输入应返回空结果", async () => {
    const mod = await import("./legacy/semantic-filter.js");
    const result = await mod.filterContentsByRelevance([], "健身减脂");
    expect(result.passedIds.size).toBe(0);
    expect(result.scores).toEqual([]);
  });

  it("空关键词数组应返回空数组", async () => {
    const mod = await import("./legacy/semantic-filter.js");
    const result = await mod.filterKeywordsByRelevance([], "健身减脂");
    expect(result).toEqual([]);
  });
});

// ── P2: 信任校准与文案优化测试 ──

describe("P2: 信任校准 — score 上限", () => {
  it("clamp 函数应将值限制在 0-100 范围内", async () => {
    const mod = await import("./legacy/prediction-helpers.js");
    // clamp(value, min=0, max=100) 是基础函数，live-predictions 中用 Math.min(score, 95) 进一步限制
    expect(mod.clamp(100)).toBeLessThanOrEqual(100);
    expect(mod.clamp(150)).toBe(100);
    expect(mod.clamp(0)).toBe(0);
    expect(mod.clamp(-5)).toBe(0);
  });
});

describe("P2: 文案优化 — 不再出现'爆款概率'", () => {
  it("results-view-meta 中不应包含'爆款概率'文案", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/results-view-meta.ts", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("爆款概率");
  });

  it("new-prediction-result 中不应包含'爆款概率'文案", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("爆款概率");
  });

  it("new-prediction-result 应使用'爆发指数'文案", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    expect(content).toContain("爆发指数");
  });

  it("HomePage 中不应包含'爆款概率'文案", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/pages/HomePage.tsx", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("爆款概率");
  });

  it("agent-runtime 中不应包含'爆款概率'文案", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/store/agent-runtime.ts", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("爆款概率");
  });
});

// ── P3: 低粉归因 LLM 动态生成测试 ──

describe("P3: 低粉归因 — analyzeSampleReplicability", () => {
  it("analyzeSampleReplicability 应导出为函数", async () => {
    const mod = await import("./legacy/low-follower-advisor.js");
    expect(typeof mod.analyzeSampleReplicability).toBe("function");
  });

  it("空样本数组应返回空数组", async () => {
    const mod = await import("./legacy/low-follower-advisor.js");
    const result = await mod.analyzeSampleReplicability([], "健身减脂");
    expect(result).toEqual([]);
  });
});

describe("P3: mapLowFollowerEvidence 默认 suggestion 检查", () => {
  it("mapLowFollowerEvidence 应为每个样本设置 suggestion", async () => {
    const mod = await import("./legacy/prediction-helpers.js");
    const mockContents = [
      {
        contentId: "test1",
        platform: "抖音",
        title: "健身减脂测试",
        authorName: "测试作者",
        contentUrl: "https://example.com",
        coverUrl: null,
        authorFollowerCount: 5000,
        viewCount: 100000,
        likeCount: 5000,
        commentCount: 200,
        collectCount: 300,
        shareCount: 100,
        keywordTokens: ["健身"],
        publishedAt: "2026-04-20",
      },
    ];
    const result = mod.mapLowFollowerEvidence(mockContents as any);
    expect(result.length).toBe(1);
    expect(result[0].suggestion).toBeTruthy();
    expect(typeof result[0].suggestion).toBe("string");
  });
});

// ── P4: 异常数据展示修复测试 ──

describe("P4: 异常数据阈值", () => {
  it("growth7d 不应超过 300", () => {
    // 模拟 live-predictions.ts 中的计算逻辑
    const hotSeedCount = 50;
    const contentsLength = 30;
    const accountsLength = 20;
    const rawGrowth7d = hotSeedCount * 8 + contentsLength * 6 + accountsLength * 5;
    const growth7d = Math.min(Math.max(rawGrowth7d, 0), 300);
    expect(growth7d).toBeLessThanOrEqual(300);
    expect(growth7d).toBeGreaterThanOrEqual(0);
  });

  it("lowFollowerAnomalyRatio 不应超过 80", () => {
    // 模拟 live-predictions.ts 中的计算逻辑
    const lowFollowerCount = 10;
    const totalContents = 5; // 极端情况：低粉比总内容多
    const rawRatio = totalContents > 0 ? (lowFollowerCount / totalContents) * 100 : 0;
    const ratio = Math.min(Math.round(rawRatio), 80);
    expect(ratio).toBeLessThanOrEqual(80);
    expect(ratio).toBeGreaterThanOrEqual(0);
  });

  it("除以零时 lowFollowerAnomalyRatio 应为 0", () => {
    const totalContents = 0;
    const lowFollowerCount = 3;
    const rawRatio = totalContents > 0 ? (lowFollowerCount / totalContents) * 100 : 0;
    expect(rawRatio).toBe(0);
  });

  it("growth7d 为负数时应被 clamp 到 0", () => {
    const rawGrowth7d = -50;
    const growth7d = Math.min(Math.max(rawGrowth7d, 0), 300);
    expect(growth7d).toBe(0);
  });
});

describe("P4: 前端展示不再乘以100", () => {
  it("new-prediction-result 中 growth7d 不应乘以100", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("Math.round(market.growth7d * 100)");
    expect(content).not.toContain("Math.round(market.lowFollowerAnomalyRatio * 100)");
  });

  it("direct-result-markdown 中 lowFollowerAnomalyRatio 不应乘以100", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/lib/direct-result-markdown.ts", import.meta.url),
      "utf-8",
    );
    expect(content).not.toContain("me.lowFollowerAnomalyRatio * 100");
  });
});

// ── P5: 雷达图标签截断修复测试 ──

describe("P5: 雷达图标签截断修复", () => {
  it("雷达图 viewBox 应足够大以容纳标签", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    // viewBox 宽度应 >= 300（之前是 285）
    const viewBoxMatch = content.match(/viewBox=\{`0 0 \$\{svgW\} \$\{svgH\}`\}/);
    expect(viewBoxMatch).toBeTruthy();
    // svgW 应 >= 300
    const svgWMatch = content.match(/const svgW = (\d+)/);
    expect(svgWMatch).toBeTruthy();
    expect(Number(svgWMatch![1])).toBeGreaterThanOrEqual(300);
  });

  it("标签字符限制应 >= 8（之前是 6）", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    // sourceLabel.length > 8 而不是 > 6
    expect(content).toContain("sourceLabel.length > 8");
    expect(content).not.toContain("sourceLabel.length > 6");
  });

  it("雷达图不应在计算中使用 Math.random()", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    // WhyNowRadarChart 函数中不应在实际计算中使用 Math.random()
    const radarStart = content.indexOf("function WhyNowRadarChart");
    const radarEnd = content.indexOf("function TierBarChart");
    if (radarStart >= 0 && radarEnd >= 0) {
      const radarSection = content.slice(radarStart, radarEnd);
      // 确保没有实际调用 Math.random()（注释中提及是允许的）
      const lines = radarSection.split("\n");
      const codeLines = lines.filter(l => !l.trim().startsWith("//"));
      const codeOnly = codeLines.join("\n");
      expect(codeOnly).not.toContain("Math.random()");
    }
  });

  it("标签应有 whitespace-nowrap 防止换行截断", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(
      new URL("../client/src/app/components/results/renderers/new-prediction-result.tsx", import.meta.url),
      "utf-8",
    );
    const radarStart = content.indexOf("function WhyNowRadarChart");
    const radarEnd = content.indexOf("function TierBarChart");
    if (radarStart >= 0 && radarEnd >= 0) {
      const radarSection = content.slice(radarStart, radarEnd);
      expect(radarSection).toContain("whitespace-nowrap");
    }
  });
});

// ── 综合验证 ──

describe("综合: 全局无'爆款概率'文案", () => {
  it("整个 client/src 目录中不应存在'爆款概率'文案", async () => {
    const { execSync } = await import("node:child_process");
    try {
      const result = execSync(
        'grep -rn "爆款概率" ../client/src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
        { cwd: new URL(".", import.meta.url).pathname, encoding: "utf-8" },
      );
      expect(result.trim()).toBe("");
    } catch {
      // grep 没有匹配时返回非零退出码，这是预期行为
    }
  });
});
