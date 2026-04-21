/**
 * server/decision-boundary.ts
 * ═══════════════════════════════════════════════════════════════
 * 决策边界与风险提示生成器 — 模块三核心
 *
 * 功能：
 * 1. 决策边界生成：基于 evidenceGaps 动态生成"为什么不建议现在做"
 * 2. 风险深度分析：LLM 生成具体的风险场景和应对建议
 * 3. 止损条件生成：明确的"什么情况下应该停止"
 * 4. 继续条件生成：明确的"什么情况下可以升级动作"
 *
 * 设计原则：
 * - 风险分析必须基于真实数据（evidenceGaps/scoreBreakdown）
 * - LLM 只做深度分析，不做数据推断
 * - 降级安全：LLM 失败时使用规则模板
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("DecisionBoundary");
import { callLLM, type LLMMessage } from "./llm-gateway.js";
import {
  TREND_THRESHOLDS,
  type EvidenceMetrics,
  type DataQualityReport,
  type IndustryProfile,
  type LowFollowerAnomalySample,
} from "./trend-intelligence.js";
import { type AIScoreBreakdown, getScoreLabel } from "./ai-scoring-engine.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 单条风险项 */
export interface RiskItem {
  /** 风险类型 */
  type: "data_gap" | "competition" | "timing" | "platform" | "evidence";
  /** 风险标题 */
  title: string;
  /** 风险描述（具体说明） */
  description: string;
  /** 严重程度 */
  severity: "high" | "medium" | "low";
  /** 数据依据 */
  dataBasis: string;
  /** 应对建议 */
  mitigation: string;
}

/** 决策边界分析结果 */
export interface DecisionBoundaryResult {
  /** 核心决策理由（一句话） */
  coreBet: string;
  /** 决策边界说明（这个结论的适用范围） */
  decisionBoundary: string;
  /** 为什么现在不建议做（evidenceGaps 驱动） */
  whyNotNow: string[];
  /** 风险深度分析 */
  riskItems: RiskItem[];
  /** 继续条件（什么情况下可以升级动作） */
  continueIf: string[];
  /** 止损条件（什么情况下应该停止） */
  stopIf: string[];
  /** 错过成本（如果继续观望会错过什么） */
  missIfWait: string | null;
  /** 最适合的人群 */
  bestFor: string[];
  /** 不适合的人群 */
  notFor: string[];
  /** 生成方法 */
  generationMethod: "ai" | "rule";
}

/** LLM 风险分析上下文 */
interface RiskAnalysisContext {
  industryProfile: IndustryProfile;
  evidenceGaps: string[];
  scoreBreakdown: AIScoreBreakdown;
  evidenceMetrics: EvidenceMetrics;
  dataQuality: DataQualityReport;
  lowFollowerAnomalies: LowFollowerAnomalySample[];
  verdict: "go_now" | "test_small" | "observe" | "not_now";
  inputKind: "topic" | "content_url" | "account";
  platforms: string[];
}

/** LLM 返回的风险分析结构 */
interface LLMRiskAnalysis {
  whyNotNow: string[];
  riskItems: Array<{
    type: RiskItem["type"];
    title: string;
    description: string;
    severity: RiskItem["severity"];
    mitigation: string;
  }>;
  continueIf: string[];
  stopIf: string[];
  missIfWait: string | null;
  bestFor: string[];
  notFor: string[];
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function buildVerdictLabel(verdict: RiskAnalysisContext["verdict"]): string {
  switch (verdict) {
    case "go_now": return "直接开拍";
    case "test_small": return "先试一条";
    case "observe": return "探索中";
    case "not_now": return "蓄力中";
  }
}

// ─────────────────────────────────────────────
// LLM 风险分析 Prompt
// ─────────────────────────────────────────────

function buildRiskAnalysisSystemPrompt(): string {
  return `你是一个专业的短视频内容创业风险分析师，擅长识别赛道机会的潜在风险和决策边界。

你的任务是基于提供的真实数据，生成深度风险分析和决策边界说明。

## 输出要求

1. **whyNotNow**：基于 evidenceGaps（可探索方向），说明“还有哪些方向可以进一步探索来提升结论精准度”。每条必须引用具体方向，不能泛泛而谈。如果没有可探索方向（verdict=go_now），返回空数组。

2. **riskItems**：2-4条具体风险项，每条包含：
   - type：data_gap/competition/timing/platform/evidence 之一
   - title：简短风险标题（10字以内）
   - description：具体说明（引用数据）
   - severity：high/medium/low
   - mitigation：具体应对建议

3. **continueIf**：2-3条"什么情况下可以升级动作"，要具体可操作

4. **stopIf**：2-3条“什么情况下可以考虑调整方向”，要具体可操作

5. **missIfWait**：如果 verdict=go_now，说明现在行动能抓住什么机会；否则返回 null

6. **bestFor**：1-2条最适合的人群描述

7. **notFor**：1-2条不适合的人群描述

## 输出格式（严格 JSON）

{
  "whyNotNow": ["可探索方向1（引用具体数据）", "可探索方向2"],
  "riskItems": [
    {
      "type": "competition",
      "title": "头部集中风险",
      "description": "具体说明（引用数据）",
      "severity": "medium",
      "mitigation": "具体应对建议"
    }
  ],
  "continueIf": ["条件1", "条件2"],
  "stopIf": ["条件1", "条件2"],
  "missIfWait": null,
  "bestFor": ["人群描述1"],
  "notFor": ["人群描述1"]
}`;
}

function buildRiskAnalysisUserPrompt(ctx: RiskAnalysisContext): string {
  const {
    industryProfile,
    evidenceGaps,
    scoreBreakdown,
    evidenceMetrics,
    dataQuality,
    lowFollowerAnomalies,
    verdict,
    inputKind,
    platforms,
  } = ctx;

  return `## 赛道信息
- 赛道：${industryProfile.industryName}
- 平台：${platforms.join("、")}
- 输入类型：${inputKind === "topic" ? "赛道话题" : inputKind === "content_url" ? "内容链接" : "账号分析"}
- 当前判断：${buildVerdictLabel(verdict)}（${getScoreLabel(scoreBreakdown.opportunity.score)} ${scoreBreakdown.opportunity.score}分）

## 可探索方向
${evidenceGaps.length > 0 ? evidenceGaps.map((g, i) => `${i + 1}. ${g}`).join("\n") : "当前数据已较充分"}

## 评分结果
- 需求度：${scoreBreakdown.demand.score}分（${scoreBreakdown.demand.reason}）
- 竞争度：${scoreBreakdown.competition.score}分（${scoreBreakdown.competition.reason}）
- 异常度：${scoreBreakdown.anomaly.score}分（${scoreBreakdown.anomaly.reason}）
- 契合度：${scoreBreakdown.fit.score}分
- 综合机会：${scoreBreakdown.opportunity.score}分
- 时机分：${scoreBreakdown.timing.score}分
- 风险分：${scoreBreakdown.risk.score}分

## 关键数据指标
- 相关内容数：${evidenceMetrics.similarContentCount}
- 低粉爆款数：${lowFollowerAnomalies.length}
- KOL 数量：${evidenceMetrics.kolCount}，KOC 数量：${evidenceMetrics.kocCount}
- 头部集中度：${(evidenceMetrics.headConcentration * 100).toFixed(1)}%
- 数据稀疏度：${(dataQuality.sparsityScore * 100).toFixed(0)}%
- 降级标记：${dataQuality.degradeFlags.join("、") || "无"}

请基于以上信息，生成深度风险分析。`;
}

// ─────────────────────────────────────────────
// 调用 LLM 进行风险分析
// ─────────────────────────────────────────────

async function callLLMForRiskAnalysis(ctx: RiskAnalysisContext): Promise<LLMRiskAnalysis | null> {
  const messages: LLMMessage[] = [
    { role: "system", content: buildRiskAnalysisSystemPrompt() },
    { role: "user", content: buildRiskAnalysisUserPrompt(ctx) },
  ];

  try {
    const response = await callLLM({
      modelId: "doubao",
      messages,
      maxTokens: 1000,
      temperature: 0.3,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn("LLM 未返回有效 JSON，降级到规则模板");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<LLMRiskAnalysis>;

    // 基本验证
    if (!Array.isArray(parsed.riskItems) || !Array.isArray(parsed.continueIf)) {
      log.warn("LLM 返回结构不完整，降级到规则模板");
      return null;
    }

    return {
      whyNotNow: Array.isArray(parsed.whyNotNow) ? parsed.whyNotNow : [],
      riskItems: parsed.riskItems.slice(0, 4),
      continueIf: Array.isArray(parsed.continueIf) ? parsed.continueIf.slice(0, 3) : [],
      stopIf: Array.isArray(parsed.stopIf) ? parsed.stopIf.slice(0, 3) : [],
      missIfWait: typeof parsed.missIfWait === "string" ? parsed.missIfWait : null,
      bestFor: Array.isArray(parsed.bestFor) ? parsed.bestFor.slice(0, 2) : [],
      notFor: Array.isArray(parsed.notFor) ? parsed.notFor.slice(0, 2) : [],
    };
  } catch (err) {
    log.warn({ err: err }, "LLM 风险分析失败，降级到规则模板");
    return null;
  }
}

// ─────────────────────────────────────────────
// 规则模板（降级时使用）
// ─────────────────────────────────────────────

function buildRuleBasedDecisionBoundary(ctx: RiskAnalysisContext): LLMRiskAnalysis {
  const { evidenceGaps, scoreBreakdown, evidenceMetrics, verdict, inputKind } = ctx;

  // whyNotNow：基于 evidenceGaps
  const whyNotNow = evidenceGaps.length > 0
    ? evidenceGaps.map((gap) => `可进一步探索：${gap}`)
    : [];

  // riskItems：基于评分
  const riskItems: LLMRiskAnalysis["riskItems"] = [];

  if (scoreBreakdown.competition.score >= TREND_THRESHOLDS.mediumRisk) {
    riskItems.push({
      type: "competition",
      title: "竞争激烈",
      description: `竞争度评分 ${scoreBreakdown.competition.score} 分，头部集中度 ${(evidenceMetrics.headConcentration * 100).toFixed(1)}%，赛道已有明显头部账号占据流量。`,
      severity: scoreBreakdown.competition.score >= TREND_THRESHOLDS.highRisk ? "high" : "medium",
      mitigation: "建议找差异化切入点，避免与头部账号正面竞争，聚焦细分人群。",
    });
  }

  if (evidenceGaps.length >= 2) {
    riskItems.push({
      type: "data_gap",
      title: "数据积累中",
      description: `当前有 ${evidenceGaps.length} 个方向可以进一步探索，补充后结论会更精准。`,
      severity: evidenceGaps.length >= 3 ? "high" : "medium",
      mitigation: "可以通过追加支持账号、内容样本或评论数据来进一步验证。",
    });
  }

  if (scoreBreakdown.timing.score < 40) {
    riskItems.push({
      type: "timing",
      title: "时机不明朗",
      description: `时机分 ${scoreBreakdown.timing.score} 分，增长信号不够强，窗口期尚未明确。`,
      severity: "medium",
      mitigation: "继续观察 7-14 天，等待更明确的增长信号后再入场。",
    });
  }

  if (riskItems.length === 0) {
    riskItems.push({
      type: "evidence",
      title: "样本有限",
      description: `当前真实样本 ${evidenceMetrics.similarContentCount} 条，建议补充更多样本后再做决策。`,
      severity: "low",
      mitigation: "持续监控，等待更多真实数据积累。",
    });
  }

  // continueIf
  const continueIf: string[] = [];
  if (evidenceMetrics.similarContentCount < 4) {
    continueIf.push("下一轮复查补到 4 条以上真实相关内容样本时，可以升级到更强动作。");
  }
  if (evidenceMetrics.kolCount === 0) {
    continueIf.push("出现 KOL/大号开始布局该赛道时，说明机会已经被验证，可以加快入场。");
  }
  continueIf.push("低粉爆款样本数量持续增加时，说明赛道红利期仍在，可以加大投入。");

  // stopIf
  const stopIf = [
    "如果连续两轮复查后支持内容仍不足 2 条，可以考虑切换角度或调整方向。",
    "头部集中度超过 60% 时，说明需要找到更精准的差异化切入点。",
  ];
  if (inputKind === "account") {
    stopIf.push("账号粉丝量与赛道主流差距超过 10 倍时，建议先通过小样内容积累账号势能。");
  }

  // missIfWait
  const missIfWait = verdict === "go_now"
    ? `当前真实样本和热榜信号已经充足（机会分 ${scoreBreakdown.opportunity.score} 分），继续观望可能错过这波窗口期的前期红利。`
    : null;

  // bestFor / notFor
  const bestFor = inputKind === "account"
    ? ["已连接账号、需要判断能否接这波机会的创作者或操盘手。"]
    : ["希望基于真实平台样本快速判断是否值得下注的内容创作者。"];

  const notFor = evidenceGaps.length > 0
    ? ["适合结合自己的判断参考使用，同时可以通过追加数据获取更精准的建议。"]
    : ["只想看历史榜单、不关心动作编排的纯数据分析用户。"];

  return { whyNotNow, riskItems, continueIf, stopIf, missIfWait, bestFor, notFor };
}

// ─────────────────────────────────────────────
// 核心决策文案生成
// ─────────────────────────────────────────────

function buildCoreBet(
  verdict: RiskAnalysisContext["verdict"],
  opportunityScore: number,
  lowFollowerCount: number,
): string {
  switch (verdict) {
    case "go_now":
      return `这波机会已经补到足够的真实样本（机会分 ${opportunityScore} 分），可以直接进入执行。`;
    case "test_small":
      return lowFollowerCount > 0
        ? `真实信号已出现，低粉爆款样本 ${lowFollowerCount} 条，最适合先用小样验证可复制性。`
        : `真实信号已出现（机会分 ${opportunityScore} 分），但更适合先用小样验证，而不是全力投入。`;
    case "observe":
      return `已捕捉到早期信号（机会分 ${opportunityScore} 分），可以先用小样内容快速验证，同时继续积累数据。`;
    case "not_now":
      return `这个方向正在蓄力（机会分 ${opportunityScore} 分），可以先关注观察，等待更明确的信号再加大投入。`;
  }
}

function buildDecisionBoundaryText(
  inputKind: RiskAnalysisContext["inputKind"],
  verdict: RiskAnalysisContext["verdict"],
  dataQuality: DataQualityReport,
): string {
  const baseText = inputKind === "content_url"
    ? "这是基于特定内容链接的结构迁移判断，不是对整条赛道的普适建议。"
    : inputKind === "account"
      ? "这是账号承接能力判断，不是所有账号都适合照做。"
      : "这是基于本轮公开接口样本的下注判断，不是长期稳定结论。";

  if (dataQuality.sparsityScore > 0.4) {
    return `${baseText}当前数据还在积累中（完整度 ${(100 - dataQuality.sparsityScore * 100).toFixed(0)}%），追加更多数据后结论会更精准。`;
  }
  if (verdict === "not_now") {
    return `${baseText}当前方向正在蓄力，可以先关注观察，等待更明确的入场信号。`;
  }
  return baseText;
}

// ─────────────────────────────────────────────
// 主入口：生成完整决策边界分析
// ─────────────────────────────────────────────

/**
 * 生成完整的决策边界与风险提示
 * - 先尝试 LLM 深度分析
 * - 降级时使用规则模板
 */
export async function generateDecisionBoundary(
  industryProfile: IndustryProfile,
  evidenceGaps: string[],
  scoreBreakdown: AIScoreBreakdown,
  evidenceMetrics: EvidenceMetrics,
  dataQuality: DataQualityReport,
  lowFollowerAnomalies: LowFollowerAnomalySample[],
  verdict: "go_now" | "test_small" | "observe" | "not_now",
  inputKind: "topic" | "content_url" | "account",
  platforms: string[],
): Promise<DecisionBoundaryResult> {
  const ctx: RiskAnalysisContext = {
    industryProfile,
    evidenceGaps,
    scoreBreakdown,
    evidenceMetrics,
    dataQuality,
    lowFollowerAnomalies,
    verdict,
    inputKind,
    platforms,
  };

  // 尝试 LLM 深度分析
  let analysis: LLMRiskAnalysis | null = null;
  let generationMethod: DecisionBoundaryResult["generationMethod"] = "rule";

  // 只有在有足够数据时才调用 LLM（避免浪费 token）
  const shouldCallLLM = evidenceGaps.length > 0 ||
    scoreBreakdown.risk.score >= 50 ||
    scoreBreakdown.opportunity.score >= 60;

  if (shouldCallLLM) {
    analysis = await callLLMForRiskAnalysis(ctx);
    if (analysis) generationMethod = "ai";
  }

  // 降级到规则模板
  if (!analysis) {
    analysis = buildRuleBasedDecisionBoundary(ctx);
  }

  // 构建 riskItems（补充 dataBasis 字段）
  const riskItems: RiskItem[] = analysis.riskItems.map((item) => ({
    ...item,
    dataBasis: buildRiskItemDataBasis(item.type, evidenceMetrics, scoreBreakdown),
  }));

  return {
    coreBet: buildCoreBet(verdict, scoreBreakdown.opportunity.score, lowFollowerAnomalies.length),
    decisionBoundary: buildDecisionBoundaryText(inputKind, verdict, dataQuality),
    whyNotNow: analysis.whyNotNow,
    riskItems,
    continueIf: analysis.continueIf,
    stopIf: analysis.stopIf,
    missIfWait: analysis.missIfWait,
    bestFor: analysis.bestFor,
    notFor: analysis.notFor,
    generationMethod,
  };
}

function buildRiskItemDataBasis(
  type: RiskItem["type"],
  metrics: EvidenceMetrics,
  scores: AIScoreBreakdown,
): string {
  switch (type) {
    case "competition":
      return `竞争度 ${scores.competition.score} 分，头部集中度 ${(metrics.headConcentration * 100).toFixed(1)}%，KOL 数量 ${metrics.kolCount}`;
    case "data_gap":
      return `数据稀疏，相关内容 ${metrics.similarContentCount} 条，热榜数据 ${metrics.hotSeedCount} 条`;
    case "timing":
      return `时机分 ${scores.timing.score} 分，7天增长 ${metrics.growth7d.toFixed(0)}，热榜频次 ${metrics.hotRankFreq.toFixed(0)}`;
    case "platform":
      return `平台降级标记存在，数据完整性受限`;
    case "evidence":
      return `内容样本 ${metrics.similarContentCount} 条，创作者 ${metrics.creatorCount} 个，评论数据 ${metrics.commentCount} 条`;
    default:
      return "基于真实平台数据分析";
  }
}

// ─────────────────────────────────────────────
// 辅助函数：从评分和指标推断 verdict
// ─────────────────────────────────────────────

export function inferVerdictFromScores(
  scoreBreakdown: AIScoreBreakdown,
  evidenceMetrics: EvidenceMetrics,
  evidenceGaps: string[],
  lowFollowerCount: number,
): "go_now" | "test_small" | "observe" | "not_now" {
  const { opportunity, risk } = scoreBreakdown;

  // go_now：机会分高、风险低、证据充足
  if (
    opportunity.score >= TREND_THRESHOLDS.strongOpportunity &&
    risk.score < TREND_THRESHOLDS.mediumRisk &&
    evidenceGaps.length === 0 &&
    evidenceMetrics.similarContentCount >= 4
  ) {
    return "go_now";
  }

  // test_small：有低粉爆款或机会分中等
  if (
    lowFollowerCount > 0 ||
    (opportunity.score >= TREND_THRESHOLDS.goodOpportunity && evidenceMetrics.similarContentCount >= 2)
  ) {
    return "test_small";
  }

  // observe：有一定信号但不够强
  if (
    opportunity.score >= TREND_THRESHOLDS.minimumVisibleOpportunity ||
    evidenceMetrics.hotSeedCount > 0 ||
    evidenceMetrics.similarContentCount > 0
  ) {
    return "observe";
  }

  return "not_now";
}
