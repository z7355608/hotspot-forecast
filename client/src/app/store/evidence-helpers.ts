// evidence-helpers.ts — Utility functions for evidence scoring and formatting

import type {
  PredictionBestAction as PredictionAction,
  PredictionBrief,
  PredictionOpportunityType,
  PredictionSafeActionLevel,
} from "./prediction-types.js";
import type { TrendOpportunity } from "./trend-monitoring-types.js";
import type { TrendSeedFixture } from "./evidence-fixtures.js";
import { PLATFORM_LABELS, TIER_LABELS } from "./evidence-fixtures.js";

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "暂无";
  return `${Math.round(value > 1 ? value : value * 100)}%`;
}

export function formatGrowthLabel(value: number) {
  return value >= 0 ? `+${value}%` : `${value}%`;
}

export function formatCount(value: number | null) {
  if (value === null) return "未知";
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  }
  return `${value.toLocaleString("zh-CN")}`;
}

export function formatTimingWindowLabel(trend: TrendOpportunity) {
  return `${trend.evidenceWindow.lookbackDays} 天观测窗`;
}

export function buildOpportunityTitle(
  brief: PredictionBrief,
  opportunityType: PredictionOpportunityType,
  fixture: TrendSeedFixture,
) {
  const angle = brief.seedTopic === "爆款预测" ? fixture.trend.industryName : brief.seedTopic;
  switch (opportunityType) {
    case "structure_window":
      return `${angle} 当前更像可迁移的结构机会`;
    case "fit_window":
      return `${angle} 更像账号适配机会，不是普适窗口`;
    case "anomaly_window":
      return `${angle} 已出现样本级异常信号`;
    case "false_heat":
      return `${angle} 短期热度波动，需要精准切入`;
    default:
      return `${angle} 正在形成值得下注的窗口`;
  }
}

export function buildCoreBet(
  opportunityType: PredictionOpportunityType,
  fixture: TrendSeedFixture,
  bestActionNow: PredictionAction,
) {
  const trend = fixture.trend;
  const platformLabel = PLATFORM_LABELS[trend.platform];
  if (opportunityType === "structure_window") {
    return `真正值得下注的是结构，不是题材本身。当前跑起来的是「${fixture.contents[0]?.structureSummary ?? "结果先行 + 证明"}」这类表达。`;
  }
  if (opportunityType === "fit_window") {
    return `当前更值得判断的是谁来承接这波机会。支持账号里跑起来的主要是 ${TIER_LABELS[fixture.accounts[0]?.tierLabel ?? "standard_koc"]}，不是所有账号都能吃到。`;
  }
  if (bestActionNow.type === "monitor") {
    return `${platformLabel} 上已有 ${trend.similarContentCount} 条相关内容，但低粉异常占比只有 ${Math.round(
      trend.lowFollowerAnomalyRatio * 100,
    )}% ，更适合先收窄问题再下注。`;
  }
  return `${platformLabel} 上 ${trend.kolCount} 个 KOL、${trend.kocCount} 个 KOC 已在这个主题上出手，且近 7 天增长 ${formatGrowthLabel(
    trend.growth7d,
  )}，说明这不是一句判断，而是已被市场验证的窗口。`;
}

export function buildDecisionBoundary(
  brief: PredictionBrief,
  opportunityType: PredictionOpportunityType,
  fixture: TrendSeedFixture,
) {
  if (opportunityType === "structure_window") {
    return "这次结论成立的前提是你能迁移结构部件，而不是直接复刻竞品内容本身。";
  }
  if (opportunityType === "fit_window") {
    return `这更像账号分配问题。当前跑出来的支持账号多集中在 ${fixture.accounts
      .slice(0, 2)
      .map((account) => TIER_LABELS[account.tierLabel])
      .join(" / ")}，不是所有账号都适合直接承接。`;
  }
  if (brief.inputKind === "uploaded_asset") {
    return "这次结论默认你的素材还需要补证据，结果页优先告诉你缺什么，不直接替你承诺可执行性。";
  }
  return `这是「${fixture.trend.topicCluster}」窗口，不是整个赛道都能直接照做的普适建议。`;
}

export const SAFE_ACTION_ORDER: PredictionSafeActionLevel[] = [
  "not_now",
  "watch_first",
  "test_one",
  "shoot_now",
];

export function rankSafeAction(level: PredictionSafeActionLevel) {
  return SAFE_ACTION_ORDER.indexOf(level);
}

export function downgradeSafeAction(
  current: PredictionSafeActionLevel,
  limit: PredictionSafeActionLevel,
) {
  return rankSafeAction(current) > rankSafeAction(limit) ? limit : current;
}

export function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizePlatformId(value: string) {
  if (/抖音|douyin/i.test(value)) return "douyin";
  if (/小红书|xiaohongshu|xhs/i.test(value)) return "xiaohongshu";
  return value.toLowerCase();
}

export function containsAny(text: string, values: string[]) {
  return values.some((value) => value.length > 1 && text.includes(value.toLowerCase()));
}

export function scoreByTermMatches(text: string, values: string[], max: number, fallback = 0) {
  const normalizedValues = dedupeStrings(values.map((value) => value.trim().toLowerCase())).filter(
    (value) => value.length > 1,
  );
  if (normalizedValues.length === 0) return fallback;
  const matches = normalizedValues.filter((value) => text.includes(value)).length;
  const denominator = Math.min(normalizedValues.length, 4);
  return Math.max(fallback, Math.min(max, Math.round((matches / denominator) * max)));
}

export function buildReferenceTerms(brief: PredictionBrief, fixture: TrendSeedFixture) {
  return dedupeStrings([
    brief.seedTopic,
    brief.industry,
    fixture.trend.topicCluster,
    fixture.trend.industryName,
    ...fixture.accounts.flatMap((account) => account.recentTopicClusters.slice(0, 2)),
    ...fixture.contents.flatMap((content) => content.keywordTokens.slice(0, 3)),
  ]);
}

export function buildScenarioTerms(brief: PredictionBrief) {
  if (brief.inputKind === "content_url") {
    return ["结构", "开头", "拆解", "可抄", "试拍"];
  }
  if (brief.inputKind === "account") {
    return ["账号", "对标", "承接", "适配", "参考"];
  }
  if (brief.inputKind === "uploaded_asset") {
    return ["素材", "镜头", "补拍", "脚本", "承接"];
  }
  return ["问题", "场景", "需求", "窗口", "增长"];
}

export function buildIntentTerms(fixture: TrendSeedFixture) {
  return dedupeStrings(
    fixture.contents.flatMap((content) => content.performance.commentQuestionClusters ?? []).slice(0, 8),
  );
}

export function computeFreshnessScore(iso: string | undefined, maxScore = 25) {
  if (!iso) return Math.round(maxScore * 0.45);
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return Math.round(maxScore * 0.45);
  const diffDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return maxScore;
  if (diffDays <= 7) return Math.round(maxScore * 0.84);
  if (diffDays <= 14) return Math.round(maxScore * 0.68);
  if (diffDays <= 30) return Math.round(maxScore * 0.48);
  return Math.round(maxScore * 0.24);
}

export function buildCompletenessScore(fields: Array<string | number | null | undefined>, maxScore = 25) {
  const present = fields.filter((value) => value !== null && value !== undefined && `${value}`.trim() !== "").length;
  return Math.round((present / Math.max(fields.length, 1)) * maxScore);
}
