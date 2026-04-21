/**
 * server/ai-scoring-engine.ts
 * ═══════════════════════════════════════════════════════════════
 * AI 深度评分引擎 — 模块三核心
 *
 * 功能：
 * 1. 规则评分（基线）：基于 archive/rules.py 权重体系的确定性计算
 * 2. AI 深度评分：LLM 综合评估"需求度/竞争度/异常度/契合度"四维
 * 3. 混合评分：规则分 × 0.4 + AI 分 × 0.6，兼顾确定性与深度理解
 * 4. 评分置信度：根据数据质量和 LLM 响应质量计算置信区间
 *
 * 设计原则：
 * - LLM 不能无中生有：所有 AI 评分必须基于传入的真实数据指标
 * - 降级安全：LLM 调用失败时自动回退到规则评分
 * - 可解释性：每个维度评分必须附带 LLM 给出的理由
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("AIScoringEngine");
import { callLLM, type LLMMessage } from "./llm-gateway.js";
import {
  SCORE_WEIGHTS,
  TREND_THRESHOLDS,
  type EvidenceMetrics,
  type DataQualityReport,
  type IndustryProfile,
} from "./trend-intelligence.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 评分维度 */
export interface ScoreDimension {
  /** 0-100 分 */
  score: number;
  /** LLM 给出的评分理由（规则评分时为公式说明） */
  reason: string;
  /** 数据支撑强度 */
  dataSupport: "strong" | "medium" | "weak" | "none";
}

/** 完整评分结果 */
export interface AIScoreBreakdown {
  /** 需求度：市场需求的真实强度 */
  demand: ScoreDimension;
  /** 竞争度：赛道拥挤程度（越高越难进入） */
  competition: ScoreDimension;
  /** 异常度：低粉爆款/新创作者涌入信号 */
  anomaly: ScoreDimension;
  /** 契合度：与用户账号/赛道的匹配程度 */
  fit: ScoreDimension;
  /** 综合机会分 */
  opportunity: ScoreDimension;
  /** 时机分：现在入场的时机优势 */
  timing: ScoreDimension;
  /** 风险分：潜在风险程度（越高越危险） */
  risk: ScoreDimension;
  /** 评分方法：rule（纯规则）| ai（纯 AI）| hybrid（混合） */
  scoringMethod: "rule" | "ai" | "hybrid";
  /** 规则基线分（供对比参考） */
  ruleBaseline: {
    demand: number;
    competition: number;
    anomaly: number;
    fit: number;
    opportunity: number;
    timing: number;
    risk: number;
  };
  /** 数据质量对评分的影响说明 */
  dataQualityNote: string;
  /** 评分版本 */
  scoreEngineVersion: string;
}

/** LLM 评分请求上下文 */
interface ScoringContext {
  industryProfile: IndustryProfile;
  evidenceMetrics: EvidenceMetrics;
  dataQuality: DataQualityReport;
  inputKind: "topic" | "content_url" | "account";
  platforms: string[];
  ruleBaseline: AIScoreBreakdown["ruleBaseline"];
}

/** LLM 返回的评分结构 */
interface LLMScoreResponse {
  demand: { score: number; reason: string };
  competition: { score: number; reason: string };
  anomaly: { score: number; reason: string };
  fit: { score: number; reason: string };
  opportunity: { score: number; reason: string };
  timing: { score: number; reason: string };
  risk: { score: number; reason: string };
  overallAssessment: string;
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scale0100(value: number | null, cap: number): number {
  if (value === null || !Number.isFinite(value) || cap <= 0) return 0;
  return clamp((value / cap) * 100);
}

// avg is available for future use in scoring calculations

// ─────────────────────────────────────────────
// Step 1：规则基线评分（确定性计算，archive 权重体系）
// ─────────────────────────────────────────────

/**
 * 基于 archive/rules.py 权重体系的确定性评分
 * 这是 AI 评分的基线，也是降级时的兜底
 */
export function computeRuleBaseline(
  metrics: EvidenceMetrics,
  dataQuality: DataQualityReport,
): AIScoreBreakdown["ruleBaseline"] {
  const {
    searchHeat,
    hotRankFreq,
    growth7d,
    newCreatorRatio,
    lowFollowerAnomalyRatio,
    headConcentration,
    contentDensity,
    topicVolatility,
  } = metrics;

  // 需求度
  const demand = clamp(
    searchHeat * SCORE_WEIGHTS.demandSearchHeat +
    growth7d * SCORE_WEIGHTS.demandGrowth7d +
    hotRankFreq * SCORE_WEIGHTS.demandHotRank,
  );

  // 竞争度
  const competition = clamp(
    scale0100(headConcentration, 1) * SCORE_WEIGHTS.competitionHeadConcentration +
    scale0100(contentDensity, 8) * SCORE_WEIGHTS.competitionContentDensity +
    scale0100(topicVolatility, 1) * SCORE_WEIGHTS.competitionVolatility,
  );

  // 异常度
  const anomaly = clamp(
    scale0100(lowFollowerAnomalyRatio, 0.5) * SCORE_WEIGHTS.anomalyLowFollowerRatio +
    scale0100(newCreatorRatio, 0.8) * SCORE_WEIGHTS.anomalyNewCreatorRatio,
  );

  // 契合度（基础值，AI 会根据上下文调整）
  const fit = clamp(
    scale0100(1.0, 1) * SCORE_WEIGHTS.fitPlatformMatch +
    scale0100(0.5, 1) * SCORE_WEIGHTS.fitIndustryMatch,
  );

  // 综合机会分
  const opportunity = clamp(
    demand * SCORE_WEIGHTS.opportunityDemand +
    anomaly * SCORE_WEIGHTS.opportunityAnomaly +
    fit * SCORE_WEIGHTS.opportunityFit +
    (100 - competition) * SCORE_WEIGHTS.opportunityInverseCompetition,
  );

  // 时机分
  const timing = clamp(
    growth7d * SCORE_WEIGHTS.timingGrowth7d +
    scale0100(newCreatorRatio, 0.8) * SCORE_WEIGHTS.timingNewCreatorRatio +
    hotRankFreq * SCORE_WEIGHTS.timingHotRank,
  );

  // 风险分
  const risk = clamp(
    scale0100(headConcentration, 1) * SCORE_WEIGHTS.riskHeadConcentration +
    scale0100(contentDensity, 8) * SCORE_WEIGHTS.riskContentDensity +
    scale0100(topicVolatility, 1) * SCORE_WEIGHTS.riskVolatility +
    scale0100(dataQuality.sparsityScore, 1) * SCORE_WEIGHTS.riskDataSparsity,
  );

  return { demand, competition, anomaly, fit, opportunity, timing, risk };
}

// ─────────────────────────────────────────────
// Step 2：构建 LLM 评分 Prompt
// ─────────────────────────────────────────────

function buildScoringSystemPrompt(): string {
  return `你是一个专业的短视频赛道机会评估专家，擅长分析抖音/小红书的内容机会。

你的任务是基于提供的真实数据指标，对赛道机会进行多维度评分（0-100分）。

## 评分维度说明

| 维度 | 含义 | 高分意味着 |
|------|------|-----------|
| demand（需求度） | 市场对该赛道内容的真实需求强度 | 搜索热、热榜频繁、增长快 |
| competition（竞争度） | 赛道的拥挤程度 | 头部集中、内容同质化严重 |
| anomaly（异常度） | 低粉爆款/新创作者涌入的信号强度 | 低粉账号能跑出高互动 |
| fit（契合度） | 赛道与当前输入场景的匹配程度 | 平台匹配、行业词高度相关 |
| opportunity（综合机会分） | 综合评估进入该赛道的机会大小 | 需求高+竞争低+异常强 |
| timing（时机分） | 现在入场的时机优势 | 窗口正在形成、增长加速 |
| risk（风险分） | 潜在风险程度 | 越高越危险，头部垄断/数据稀疏 |

## 评分规则

1. **必须基于数据**：每个维度的评分必须基于提供的真实数据指标，不能凭空推断
2. **参考规则基线**：规则基线分是确定性计算结果，你的评分应在基线 ±20 分范围内调整
3. **数据稀疏降级**：当 sparsityScore > 0.5 时，所有分数向中间值（50分）收敛
4. **reason 要具体**：必须引用具体数据指标（如"热榜出现3次"），不能只说"较高"
5. **competition 越高越差**：这是唯一"越高越危险"的维度

## 输出格式（严格 JSON，不要添加任何解释）

{
  "demand": { "score": 数字, "reason": "基于数据的具体理由" },
  "competition": { "score": 数字, "reason": "基于数据的具体理由" },
  "anomaly": { "score": 数字, "reason": "基于数据的具体理由" },
  "fit": { "score": 数字, "reason": "基于数据的具体理由" },
  "opportunity": { "score": 数字, "reason": "基于数据的具体理由" },
  "timing": { "score": 数字, "reason": "基于数据的具体理由" },
  "risk": { "score": 数字, "reason": "基于数据的具体理由" },
  "overallAssessment": "一句话总结这个赛道的机会特征"
}`;
}

function buildScoringUserPrompt(ctx: ScoringContext): string {
  const { industryProfile, evidenceMetrics, dataQuality, inputKind, platforms, ruleBaseline } = ctx;

  const metricsText = `
## 真实数据指标

**赛道信息**
- 赛道名称：${industryProfile.industryName}
- 核心关键词：${industryProfile.seedTerms.keywords.join("、") || "未提取到"}
- 目标平台：${platforms.join("、")}
- 输入类型：${inputKind === "topic" ? "赛道话题" : inputKind === "content_url" ? "内容链接" : "账号分析"}

**热度与增长指标**
- 搜索热度（0-100）：${evidenceMetrics.searchHeat.toFixed(1)}
- 热榜频次（0-100）：${evidenceMetrics.hotRankFreq.toFixed(1)}
- 7天增长率（0-100）：${evidenceMetrics.growth7d.toFixed(1)}
- 热榜数据条数：${evidenceMetrics.hotSeedCount}

**内容与账号样本**
- 相关内容数量：${evidenceMetrics.similarContentCount}
- 创作者数量：${evidenceMetrics.creatorCount}
- KOL 数量（粉丝>10万）：${evidenceMetrics.kolCount}
- KOC 数量（粉丝1万-10万）：${evidenceMetrics.kocCount}
- 评论意图数据：${evidenceMetrics.commentCount} 条

**竞争格局指标**
- 头部集中度（0-1，越高越集中）：${evidenceMetrics.headConcentration.toFixed(3)}
- 内容密度（每创作者平均内容数）：${evidenceMetrics.contentDensity.toFixed(2)}
- 话题波动性（0-1，越高越分散）：${evidenceMetrics.topicVolatility.toFixed(3)}

**低粉异常信号**
- 低粉爆款比例（0-1）：${evidenceMetrics.lowFollowerAnomalyRatio.toFixed(3)}
- 新创作者比例（0-1）：${evidenceMetrics.newCreatorRatio.toFixed(3)}

**数据质量**
- 数据稀疏度（0-1，越高越稀疏）：${dataQuality.sparsityScore.toFixed(2)}
- 有热榜数据：${dataQuality.hasHotSeed ? "是" : "否"}
- 有搜索数据：${dataQuality.hasSearchData ? "是" : "否"}
- 有评论数据：${dataQuality.hasCommentData ? "是" : "否"}
- 有粉丝数据：${dataQuality.hasFollowerData ? "是" : "否"}
- 降级标记：${dataQuality.degradeFlags.join("、") || "无"}

## 规则基线分（供参考）

| 维度 | 基线分 |
|------|--------|
| demand | ${ruleBaseline.demand} |
| competition | ${ruleBaseline.competition} |
| anomaly | ${ruleBaseline.anomaly} |
| fit | ${ruleBaseline.fit} |
| opportunity | ${ruleBaseline.opportunity} |
| timing | ${ruleBaseline.timing} |
| risk | ${ruleBaseline.risk} |

请基于以上真实数据，给出你的综合评分。记住：你的评分应在基线 ±20 分范围内，除非有充分的数据理由。`;

  return metricsText;
}

// ─────────────────────────────────────────────
// Step 3：调用 LLM 进行 AI 评分
// ─────────────────────────────────────────────

async function callLLMForScoring(ctx: ScoringContext): Promise<LLMScoreResponse | null> {
  const messages: LLMMessage[] = [
    { role: "system", content: buildScoringSystemPrompt() },
    { role: "user", content: buildScoringUserPrompt(ctx) },
  ];

  try {
    const response = await callLLM({
      modelId: "doubao",
      messages,
      maxTokens: 800,
      temperature: 0.2, // 低温度保证评分稳定性
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn("LLM 未返回有效 JSON，降级到规则评分");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<LLMScoreResponse>;

    // 验证必要字段
    const requiredFields = ["demand", "competition", "anomaly", "fit", "opportunity", "timing", "risk"];
    for (const field of requiredFields) {
      const dim = parsed[field as keyof LLMScoreResponse] as { score?: unknown } | undefined;
      if (!dim || typeof dim.score !== "number") {
        log.warn(`LLM 返回缺少字段 ${field}，降级到规则评分`);
        return null;
      }
    }

    return parsed as LLMScoreResponse;
  } catch (err) {
    log.warn({ err: err }, "LLM 评分调用失败，降级到规则评分");
    return null;
  }
}

// ─────────────────────────────────────────────
// Step 4：混合评分（规则 × 0.4 + AI × 0.6）
// ─────────────────────────────────────────────

function blendScores(
  ruleScore: number,
  aiScore: number,
  dataQuality: DataQualityReport,
): number {
  // 数据稀疏时，增加规则权重（更保守）
  const aiWeight = dataQuality.sparsityScore > 0.5 ? 0.3 : 0.6;
  const ruleWeight = 1 - aiWeight;
  return clamp(ruleScore * ruleWeight + aiScore * aiWeight);
}

function inferDataSupport(
  metrics: EvidenceMetrics,
  dimension: keyof AIScoreBreakdown["ruleBaseline"],
): ScoreDimension["dataSupport"] {
  // 根据维度和数据量判断数据支撑强度
  if (dimension === "demand") {
    if (metrics.hotSeedCount >= 5 || metrics.searchHeat >= 60) return "strong";
    if (metrics.hotSeedCount >= 2 || metrics.searchHeat >= 30) return "medium";
    return "weak";
  }
  if (dimension === "anomaly") {
    if (metrics.lowFollowerAnomalyRatio >= 0.3 || metrics.newCreatorRatio >= 0.4) return "strong";
    if (metrics.lowFollowerAnomalyRatio >= 0.1 || metrics.newCreatorRatio >= 0.2) return "medium";
    return "weak";
  }
  if (dimension === "competition") {
    if (metrics.similarContentCount >= 6 && metrics.kolCount >= 2) return "strong";
    if (metrics.similarContentCount >= 3) return "medium";
    return "weak";
  }
  if (metrics.similarContentCount >= 4) return "strong";
  if (metrics.similarContentCount >= 2) return "medium";
  return "weak";
}

// ─────────────────────────────────────────────
// 主入口：生成完整 AI 评分结果
// ─────────────────────────────────────────────

/**
 * 生成完整的 AI 深度评分结果
 * - 先计算规则基线
 * - 调用 LLM 进行深度评分
 * - 混合两者结果
 * - LLM 失败时自动降级到规则评分
 */
export async function generateAIScoreBreakdown(
  industryProfile: IndustryProfile,
  evidenceMetrics: EvidenceMetrics,
  dataQuality: DataQualityReport,
  inputKind: "topic" | "content_url" | "account",
  platforms: string[],
): Promise<AIScoreBreakdown> {
  const ruleBaseline = computeRuleBaseline(evidenceMetrics, dataQuality);

  const ctx: ScoringContext = {
    industryProfile,
    evidenceMetrics,
    dataQuality,
    inputKind,
    platforms,
    ruleBaseline,
  };

  // 尝试 LLM 评分
  const llmResult = await callLLMForScoring(ctx);

  let scoringMethod: AIScoreBreakdown["scoringMethod"] = "rule";
  let finalScores: Record<string, { score: number; reason: string }>;

  if (llmResult) {
    scoringMethod = "hybrid";
    // 混合规则分和 AI 分
    finalScores = {
      demand: {
        score: blendScores(ruleBaseline.demand, llmResult.demand.score, dataQuality),
        reason: llmResult.demand.reason,
      },
      competition: {
        score: blendScores(ruleBaseline.competition, llmResult.competition.score, dataQuality),
        reason: llmResult.competition.reason,
      },
      anomaly: {
        score: blendScores(ruleBaseline.anomaly, llmResult.anomaly.score, dataQuality),
        reason: llmResult.anomaly.reason,
      },
      fit: {
        score: blendScores(ruleBaseline.fit, llmResult.fit.score, dataQuality),
        reason: llmResult.fit.reason,
      },
      opportunity: {
        score: blendScores(ruleBaseline.opportunity, llmResult.opportunity.score, dataQuality),
        reason: llmResult.opportunity.reason,
      },
      timing: {
        score: blendScores(ruleBaseline.timing, llmResult.timing.score, dataQuality),
        reason: llmResult.timing.reason,
      },
      risk: {
        score: blendScores(ruleBaseline.risk, llmResult.risk.score, dataQuality),
        reason: llmResult.risk.reason,
      },
    };
  } else {
    // 降级到纯规则评分
    scoringMethod = "rule";
    finalScores = {
      demand: {
        score: ruleBaseline.demand,
        reason: buildRuleReason("demand", evidenceMetrics),
      },
      competition: {
        score: ruleBaseline.competition,
        reason: buildRuleReason("competition", evidenceMetrics),
      },
      anomaly: {
        score: ruleBaseline.anomaly,
        reason: buildRuleReason("anomaly", evidenceMetrics),
      },
      fit: {
        score: ruleBaseline.fit,
        reason: buildRuleReason("fit", evidenceMetrics),
      },
      opportunity: {
        score: ruleBaseline.opportunity,
        reason: buildRuleReason("opportunity", evidenceMetrics),
      },
      timing: {
        score: ruleBaseline.timing,
        reason: buildRuleReason("timing", evidenceMetrics),
      },
      risk: {
        score: ruleBaseline.risk,
        reason: buildRuleReason("risk", evidenceMetrics),
      },
    };
  }

  const dataQualityNote = buildDataQualityNote(dataQuality, scoringMethod);

  const toScoreDimension = (
    key: keyof AIScoreBreakdown["ruleBaseline"],
  ): ScoreDimension => ({
    score: finalScores[key].score,
    reason: finalScores[key].reason,
    dataSupport: inferDataSupport(evidenceMetrics, key),
  });

  return {
    demand: toScoreDimension("demand"),
    competition: toScoreDimension("competition"),
    anomaly: toScoreDimension("anomaly"),
    fit: toScoreDimension("fit"),
    opportunity: toScoreDimension("opportunity"),
    timing: toScoreDimension("timing"),
    risk: toScoreDimension("risk"),
    scoringMethod,
    ruleBaseline,
    dataQualityNote,
    scoreEngineVersion: "ai-scoring-engine.v1",
  };
}

// ─────────────────────────────────────────────
// 规则评分理由生成（降级时使用）
// ─────────────────────────────────────────────

function buildRuleReason(
  dimension: string,
  metrics: EvidenceMetrics,
): string {
  switch (dimension) {
    case "demand":
      return `基于规则计算：搜索热度 ${metrics.searchHeat.toFixed(0)}，热榜频次 ${metrics.hotRankFreq.toFixed(0)}，7天增长 ${metrics.growth7d.toFixed(0)}（权重 0.45/0.35/0.20）`;
    case "competition":
      return `基于规则计算：头部集中度 ${(metrics.headConcentration * 100).toFixed(1)}%，内容密度 ${metrics.contentDensity.toFixed(2)}，话题波动 ${(metrics.topicVolatility * 100).toFixed(1)}%`;
    case "anomaly":
      return `基于规则计算：低粉异常比例 ${(metrics.lowFollowerAnomalyRatio * 100).toFixed(1)}%，新创作者比例 ${(metrics.newCreatorRatio * 100).toFixed(1)}%`;
    case "fit":
      return `基于规则计算：平台匹配度基础分（AI 评分不可用时使用默认值）`;
    case "opportunity":
      return `基于规则计算：需求×0.35 + 异常×0.25 + 契合×0.20 + (100-竞争)×0.20`;
    case "timing":
      return `基于规则计算：7天增长 ${metrics.growth7d.toFixed(0)}×0.45 + 新创作者比例×0.30 + 热榜频次×0.25`;
    case "risk":
      return `基于规则计算：头部集中度×0.40 + 内容密度×0.30 + 话题波动×0.20 + 数据稀疏×0.10`;
    default:
      return "规则计算";
  }
}

function buildDataQualityNote(
  dataQuality: DataQualityReport,
  method: AIScoreBreakdown["scoringMethod"],
): string {
  const issues: string[] = [];
  if (!dataQuality.hasHotSeed) issues.push("缺少热榜数据");
  if (!dataQuality.hasSearchData) issues.push("缺少搜索数据");
  if (!dataQuality.hasFollowerData) issues.push("缺少粉丝数据");
  if (!dataQuality.hasCommentData) issues.push("缺少评论数据");

  const methodLabel = method === "hybrid" ? "AI+规则混合评分" : "规则基线评分";

  if (issues.length === 0) {
    return `数据完整，使用${methodLabel}。`;
  }
  return `数据存在缺口（${issues.join("、")}），评分已按更保守方式调整，使用${methodLabel}。`;
}

// ─────────────────────────────────────────────
// 评分标签生成
// ─────────────────────────────────────────────

export function getScoreLabel(opportunityScore: number): string {
  if (opportunityScore >= TREND_THRESHOLDS.strongOpportunity) return "强推";
  if (opportunityScore >= TREND_THRESHOLDS.goodOpportunity) return "可行";
  if (opportunityScore >= TREND_THRESHOLDS.minimumVisibleOpportunity) return "观望";
  return "谨慎";
}

export function getTimingLabel(timingScore: number): string {
  if (timingScore >= 75) return "窗口正在形成";
  if (timingScore >= 60) return "可进入验证";
  return "继续观察";
}

export function getMomentumLabel(
  hotSeedCount: number,
  growth7d: number,
  evidenceGapsCount: number,
): "accelerating" | "emerging" | "cooling" {
  if (hotSeedCount >= 5 && growth7d >= 50) return "accelerating";
  if (evidenceGapsCount >= 2) return "cooling";
  return "emerging";
}

// ─────────────────────────────────────────────
// 便捷函数：将 AIScoreBreakdown 转换为 live-predictions.ts 兼容格式
// ─────────────────────────────────────────────

export function toScoreBreakdownCompat(ai: AIScoreBreakdown): {
  demand: number;
  competition: number;
  anomaly: number;
  fit: number;
  opportunity: number;
  timing: number;
  risk: number;
} {
  return {
    demand: ai.demand.score,
    competition: ai.competition.score,
    anomaly: ai.anomaly.score,
    fit: ai.fit.score,
    opportunity: ai.opportunity.score,
    timing: ai.timing.score,
    risk: ai.risk.score,
  };
}
