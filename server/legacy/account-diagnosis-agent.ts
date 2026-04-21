/**
 * server/account-diagnosis-agent.ts
 * ═══════════════════════════════════════════════════════════════
 * 模块五：账号诊断 Agent
 *
 * 功能：
 * 1. 表现评估与归因：LLM 分析"互动率上升/下降"的深层原因
 *    - 识别趋势（rising/stable/declining/volatile）
 *    - 找出关键驱动因素（内容类型/发布时间/话题选择等）
 *    - 生成 key_findings（含数据依据）
 *
 * 2. 账号打法生成：基于赛道趋势和历史表现
 *    - strategy_continue：继续做哪些（已验证有效的）
 *    - strategy_stop：停掉哪些（低效或有风险的）
 *    - strategy_add：补充哪些（缺口机会）
 *    - execution_roadmap：4 周执行路线图
 *    - risk_warnings：风险提示
 *
 * 3. 评论区 AI 摘要：提炼用户真实需求和情绪
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("AccountDiagnosis");
import { randomUUID } from "node:crypto";
import { callLLM } from "./llm-gateway.js";
import { execute, query } from "./database.js";
import type { RowDataPacket } from "./database.js";
import type { AccountOverview, WorkItem, FanProfile, TrendDataPoint } from "./creator-data-sync.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface KeyFinding {
  type: "positive" | "warning" | "critical" | "opportunity";
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  dataBasis: string; // 数据依据（引用具体数字）
  actionable: boolean;
}

export interface StrategyItem {
  action: string;       // 具体行动
  reason: string;       // 原因
  priority: "high" | "medium" | "low";
  expectedImpact?: string;
  risk?: string;
  timeframe?: string;
}

export interface WeeklyPlan {
  week: number;
  focus: string;        // 本周重点
  actions: string[];    // 具体行动列表
  kpi: string;          // 本周 KPI
}

export interface RiskWarning {
  type: "content" | "algorithm" | "competition" | "audience" | "platform";
  description: string;
  severity: "high" | "medium" | "low";
  mitigation: string;
}

export interface DiagnosisReport {
  id: string;
  userId: string;
  platformId: string;
  // 健康度
  healthScore: number;
  healthLevel: "excellent" | "good" | "warning" | "critical";
  // 互动率归因
  engagementTrend: "rising" | "stable" | "declining" | "volatile";
  engagementAnalysis: string;
  keyFindings: KeyFinding[];
  // 账号打法
  strategyContinue: StrategyItem[];
  strategyStop: StrategyItem[];
  strategyAdd: StrategyItem[];
  // 执行路线图
  executionRoadmap: WeeklyPlan[];
  // 风险提示
  riskWarnings: RiskWarning[];
  // 元数据
  modelUsed: string;
  tokensUsed: number;
  dataPeriodDays: number;
  generatedAt: string;
}

export interface DiagnosisInput {
  userId: string;
  platformId: string;
  overview: AccountOverview;
  works: WorkItem[];
  fanProfile?: FanProfile;
  trendData?: TrendDataPoint[];
  topicContext?: string;  // 当前赛道（如"美妆护肤"）
  userGoal?: string;      // 用户目标（如"涨粉10万"）
}

// ─────────────────────────────────────────────
// 数据预处理：构建诊断上下文
// ─────────────────────────────────────────────

interface DiagnosisContext {
  accountSummary: string;
  performanceMetrics: string;
  topWorks: string;
  lowWorks: string;
  trendSummary: string;
  fanSummary: string;
  engagementTrend: "rising" | "stable" | "declining" | "volatile";
  avgEngagementRate: number;
  engagementChange: number;
}

function buildDiagnosisContext(input: DiagnosisInput): DiagnosisContext {
  const { overview, works, fanProfile, trendData } = input;
  const isXhs = overview.platformId === "xiaohongshu";
  const isKuaishou = overview.platformId === "kuaishou";
  const followers = overview.followers || 0;

  // 计算互动率趋势
  const { trend: engagementTrend, avgRate, change } = analyzeEngagementTrend(works, trendData, followers);

  // 账号基本信息
  const accountSummary = [
    `平台：${overview.platformName || overview.platformId}`,
    `账号：${overview.handle}`,
    `粉丝数：${formatNumber(followers)}（近期变化：${overview.followersChange !== undefined ? (overview.followersChange >= 0 ? "+" : "") + formatNumber(overview.followersChange) : "未知"}）`,
    `作品总数：${overview.totalWorks}`,
    `平均互动率：${avgRate.toFixed(2)}%（${isXhs ? "基于粉丝数" : "基于播放量"}，变化：${change >= 0 ? "+" : ""}${change.toFixed(2)}%${isKuaishou ? "，注意：快手无收藏数据、无评论文本" : ""}）`,
    isKuaishou ? `快手特有指标：有转发数（代替分享），无收藏数，无评论文本采集` : null,
  ].filter(Boolean).join("\n");

  // 核心指标（小红书隐藏播放量，突出收藏）
  const performanceMetrics = isXhs
    ? [
        overview.totalLikes !== undefined ? `总点赞：${formatNumber(overview.totalLikes)}` : null,
        overview.totalCollects !== undefined ? `总收藏：${formatNumber(overview.totalCollects)}` : null,
        overview.totalComments !== undefined ? `总评论：${formatNumber(overview.totalComments)}` : null,
        overview.totalShares !== undefined ? `总分享：${formatNumber(overview.totalShares)}` : null,
      ].filter(Boolean).join("，")
    : [
        overview.totalViews !== undefined ? `总播放：${formatNumber(overview.totalViews)}` : null,
        overview.totalLikes !== undefined ? `总点赞：${formatNumber(overview.totalLikes)}` : null,
        overview.totalComments !== undefined ? `总评论：${formatNumber(overview.totalComments)}` : null,
        overview.totalShares !== undefined ? `总分享：${formatNumber(overview.totalShares)}` : null,
        overview.totalCollects !== undefined ? `总收藏：${formatNumber(overview.totalCollects)}` : null,
      ].filter(Boolean).join("，");

  // 作品表现排序
  const sortedByEngagement = [...works].sort((a, b) => {
    const eA = calcEngagementRate(a, followers);
    const eB = calcEngagementRate(b, followers);
    return eB - eA;
  });

  const top3 = sortedByEngagement.slice(0, 3);
  const bottom3 = sortedByEngagement.slice(-3).reverse();

  // 小红书：显示收藏率和笔记类型；快手：显示播放/点赞/转发（无收藏）；其他平台：显示播放量
  const topWorks = top3.map((w, i) => {
    const base = `${i + 1}. 《${w.title.slice(0, 30)}》`;
    const tags = ` 标签:[${(w.tags ?? []).slice(0, 3).join(",")}]`;
    if (isXhs) {
      const noteType = w.type === "video" ? "[视频]" : "[图文]";
      return base + ` ${noteType}` +
        ` 点赞:${formatNumber(w.likes ?? 0)} 收藏:${formatNumber(w.collects ?? 0)}` +
        ` 收藏率:${calcCollectRate(w).toFixed(1)}%` +
        ` 互动率:${calcEngagementRate(w, followers).toFixed(2)}%` + tags;
    }
    if (isKuaishou) {
      return base +
        ` 播放:${formatNumber(w.views ?? 0)} 点赞:${formatNumber(w.likes ?? 0)}` +
        ` 转发:${formatNumber(w.shares ?? 0)}` +
        ` 互动率:${calcEngagementRate(w, followers).toFixed(2)}%` + tags;
    }
    return base +
      ` 播放:${formatNumber(w.views ?? 0)} 点赞:${formatNumber(w.likes ?? 0)}` +
      ` 互动率:${calcEngagementRate(w, followers).toFixed(2)}%` + tags;
  }).join("\n");

  const lowWorks = bottom3.map((w, i) => {
    const base = `${i + 1}. 《${w.title.slice(0, 30)}》`;
    if (isXhs) {
      const noteType = w.type === "video" ? "[视频]" : "[图文]";
      return base + ` ${noteType}` +
        ` 点赞:${formatNumber(w.likes ?? 0)} 收藏:${formatNumber(w.collects ?? 0)}` +
        ` 互动率:${calcEngagementRate(w, followers).toFixed(2)}%`;
    }
    if (isKuaishou) {
      return base +
        ` 播放:${formatNumber(w.views ?? 0)} 点赞:${formatNumber(w.likes ?? 0)}` +
        ` 转发:${formatNumber(w.shares ?? 0)}` +
        ` 互动率:${calcEngagementRate(w, followers).toFixed(2)}%`;
    }
    return base +
      ` 播放:${formatNumber(w.views ?? 0)} 互动率:${calcEngagementRate(w, followers).toFixed(2)}%`;
  }).join("\n");

  // 趋势摘要
  const trendSummary = trendData && trendData.length > 0
    ? buildTrendSummary(trendData, overview.platformId)
    : "暂无趋势数据";

  // 粉丝画像摘要
  const fanSummary = fanProfile
    ? [
        `性别：男${fanProfile.genderRatio.male}% / 女${fanProfile.genderRatio.female}%`,
        `主要年龄段：${fanProfile.ageDistribution.slice(0, 3).map((a) => `${a.range}(${a.percentage}%)`).join("、")}`,
        `主要城市：${fanProfile.topCities.slice(0, 4).map((c) => c.city).join("、")}`,
        `兴趣标签：${fanProfile.interestTags.slice(0, 5).join("、")}`,
      ].join("\n")
    : "暂无粉丝画像数据";

  return {
    accountSummary,
    performanceMetrics,
    topWorks,
    lowWorks,
    trendSummary,
    fanSummary,
    engagementTrend,
    avgEngagementRate: avgRate,
    engagementChange: change,
  };
}

/**
 * 计算单条作品互动率
 * - 有播放量的平台（抖音/B站）：互动/播放 * 100
 * - 无播放量的平台（小红书）：互动/粉丝数 * 100（需外部传入 followers）
 * - followers=0 时用纯互动量排序（返回互动总数作为 score）
 */
function calcEngagementRate(work: WorkItem, followers?: number): number {
  const interaction = (work.likes ?? 0) + (work.comments ?? 0) +
    (work.shares ?? 0) + (work.collects ?? 0) + (work.voteups ?? 0);

  const views = work.views ?? work.reads ?? 0;
  if (views > 0) {
    return (interaction / views) * 100;
  }

  // 无播放量（小红书）：基于粉丝数计算
  if (followers && followers > 0) {
    return (interaction / followers) * 100;
  }

  // 兜底：返回互动总数作为 score（仅用于排序，不是百分比）
  return interaction;
}

/** 计算小红书特有的收藏率 = collects / (likes + collects) * 100 */
function calcCollectRate(work: WorkItem): number {
  const likes = work.likes ?? 0;
  const collects = work.collects ?? 0;
  const total = likes + collects;
  if (total === 0) return 0;
  return (collects / total) * 100;
}

function analyzeEngagementTrend(
  works: WorkItem[],
  _trendData?: TrendDataPoint[],
  followers?: number,
): { trend: "rising" | "stable" | "declining" | "volatile"; avgRate: number; change: number } {
  if (works.length === 0) return { trend: "stable", avgRate: 0, change: 0 };

  // 按发布时间排序
  const sorted = [...works].sort((a, b) =>
    new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );

  // 分前半段和后半段
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const recent = sorted.slice(mid);

  const calcRate = (w: WorkItem) => calcEngagementRate(w, followers);

  const avgEarly = early.length > 0
    ? early.reduce((s, w) => s + calcRate(w), 0) / early.length
    : 0;
  const avgRecent = recent.length > 0
    ? recent.reduce((s, w) => s + calcRate(w), 0) / recent.length
    : 0;

  const avgRate = sorted.reduce((s, w) => s + calcRate(w), 0) / sorted.length;
  const change = avgRecent - avgEarly;

  // 判断趋势
  const variance = calcVariance(sorted.map(calcRate));
  const isVolatile = variance > avgRate * 0.5;

  let trend: "rising" | "stable" | "declining" | "volatile";
  if (isVolatile && sorted.length >= 5) {
    trend = "volatile";
  } else if (change > 0.5) {
    trend = "rising";
  } else if (change < -0.5) {
    trend = "declining";
  } else {
    trend = "stable";
  }

  return { trend, avgRate, change };
}

function calcVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
}

function buildTrendSummary(trendData: TrendDataPoint[], platformId?: string): string {
  const recent7 = trendData.slice(-7);
  const totalViews = recent7.reduce((s, t) => s + (t.views ?? 0), 0);
  const totalLikes = recent7.reduce((s, t) => s + (t.likes ?? 0), 0);
  const totalComments = recent7.reduce((s, t) => s + (t.comments ?? 0), 0);
  const totalCollects = recent7.reduce((s, t) => s + (t.collects ?? 0), 0);

  if (platformId === "xiaohongshu") {
    return `近7天：点赞${formatNumber(totalLikes)} 收藏${formatNumber(totalCollects)} 评论${formatNumber(totalComments)}`;
  }
  if (platformId === "kuaishou") {
    const totalShares = recent7.reduce((s, t) => s + (Number((t as unknown as Record<string, unknown>).shares ?? 0)), 0);
    return `近7天：播放${formatNumber(totalViews)} 点赞${formatNumber(totalLikes)} 转发${formatNumber(totalShares)}（无收藏数据，无评论文本）`;
  }
  return `近7天：播放${formatNumber(totalViews)} 点赞${formatNumber(totalLikes)} 评论${formatNumber(totalComments)}`;
}

function formatNumber(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

// ─────────────────────────────────────────────
// LLM 互动率归因分析
// ─────────────────────────────────────────────

async function runEngagementAnalysis(
  ctx: DiagnosisContext,
  input: DiagnosisInput,
): Promise<{
  engagementAnalysis: string;
  keyFindings: KeyFinding[];
  healthScore: number;
  healthLevel: DiagnosisReport["healthLevel"];
}> {
  const systemPrompt = `当前日期是 ${new Date().toISOString().slice(0, 10)}。
你是一位专业的社交媒体账号诊断专家，擅长分析创作者账号的表现数据，找出互动率变化的深层原因。

你的分析必须：
1. 基于真实数据，引用具体数字
2. 区分"现象"和"原因"，避免泛泛而谈
3. 识别内容类型、发布时机、话题选择、粉丝匹配度等维度的问题
4. 给出可操作的洞察，而非空洞建议

输出格式为 JSON：
{
  "healthScore": 0-100整数,
  "healthLevel": "excellent|good|warning|critical",
  "engagementAnalysis": "200字以内的互动率归因分析，引用具体数字",
  "keyFindings": [
    {
      "type": "positive|warning|critical|opportunity",
      "title": "发现标题（10字以内）",
      "description": "详细描述（50字以内）",
      "severity": "high|medium|low",
      "dataBasis": "数据依据（引用具体数字）",
      "actionable": true/false
    }
  ]
}

keyFindings 要求：3-6条，覆盖正面发现和问题发现。`;

  const userPrompt = `请分析以下账号数据，给出互动率归因分析和关键发现：

【账号基本信息】
${ctx.accountSummary}

【核心指标（近30天）】
${ctx.performanceMetrics}

【互动率趋势】
趋势方向：${ctx.engagementTrend === "rising" ? "上升" : ctx.engagementTrend === "declining" ? "下降" : ctx.engagementTrend === "volatile" ? "波动" : "稳定"}
变化幅度：${ctx.engagementChange >= 0 ? "+" : ""}${ctx.engagementChange.toFixed(2)}%

【近7天数据趋势】
${ctx.trendSummary}

【表现最好的3条作品】
${ctx.topWorks || "暂无数据"}

【表现最差的3条作品】
${ctx.lowWorks || "暂无数据"}

【粉丝画像】
${ctx.fanSummary}

${input.topicContext ? `【当前赛道】${input.topicContext}` : ""}
${input.userGoal ? `【用户目标】${input.userGoal}` : ""}`;

  try {
    const result = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      modelId: "gpt54" as const,
      temperature: 0.3,
      maxTokens: 1500,
    });

    const text = result.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      healthScore: number;
      healthLevel: DiagnosisReport["healthLevel"];
      engagementAnalysis: string;
      keyFindings: KeyFinding[];
    };

    return {
      healthScore: Math.min(100, Math.max(0, parsed.healthScore ?? 60)),
      healthLevel: parsed.healthLevel ?? "good",
      engagementAnalysis: parsed.engagementAnalysis ?? "暂无分析",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
    };
  } catch (err) {
    log.error({ err: err }, "engagementAnalysis LLM error");
    // 降级：规则生成
    return buildRuleBasedEngagementAnalysis(ctx);
  }
}

function buildRuleBasedEngagementAnalysis(ctx: DiagnosisContext): {
  engagementAnalysis: string;
  keyFindings: KeyFinding[];
  healthScore: number;
  healthLevel: DiagnosisReport["healthLevel"];
} {
  const trendText = {
    rising: "上升",
    stable: "稳定",
    declining: "下降",
    volatile: "波动",
  }[ctx.engagementTrend];

  const healthScore = ctx.avgEngagementRate > 5 ? 80
    : ctx.avgEngagementRate > 3 ? 65
    : ctx.avgEngagementRate > 1 ? 50
    : 35;

  const healthLevel: DiagnosisReport["healthLevel"] = healthScore >= 80 ? "excellent"
    : healthScore >= 65 ? "good"
    : healthScore >= 50 ? "warning"
    : "critical";

  const findings: KeyFinding[] = [];

  if (ctx.engagementTrend === "rising") {
    findings.push({
      type: "positive",
      title: "互动率持续上升",
      description: `近期互动率呈上升趋势，变化幅度 +${ctx.engagementChange.toFixed(2)}%，内容方向正确`,
      severity: "medium",
      dataBasis: `平均互动率 ${ctx.avgEngagementRate.toFixed(2)}%，较前期 +${ctx.engagementChange.toFixed(2)}%`,
      actionable: false,
    });
  } else if (ctx.engagementTrend === "declining") {
    findings.push({
      type: "warning",
      title: "互动率下滑",
      description: `近期互动率下滑 ${Math.abs(ctx.engagementChange).toFixed(2)}%，需检查内容质量和话题选择`,
      severity: "high",
      dataBasis: `平均互动率 ${ctx.avgEngagementRate.toFixed(2)}%，较前期 ${ctx.engagementChange.toFixed(2)}%`,
      actionable: true,
    });
  }

  if (ctx.avgEngagementRate < 1) {
    findings.push({
      type: "critical",
      title: "互动率偏低",
      description: "互动率低于1%，远低于行业均值，需要重新审视内容策略",
      severity: "high",
      dataBasis: `当前互动率 ${ctx.avgEngagementRate.toFixed(2)}%，行业均值约 2-5%`,
      actionable: true,
    });
  }

  return {
    healthScore,
    healthLevel,
    engagementAnalysis: `账号互动率整体呈${trendText}趋势，平均互动率 ${ctx.avgEngagementRate.toFixed(2)}%，近期变化 ${ctx.engagementChange >= 0 ? "+" : ""}${ctx.engagementChange.toFixed(2)}%。建议重点关注表现好的内容类型，复制成功经验。`,
    keyFindings: findings.length > 0 ? findings : [{
      type: "opportunity",
      title: "数据积累中",
      description: "当前数据量较少，建议持续发布内容以获得更准确的诊断",
      severity: "low",
      dataBasis: "样本量不足",
      actionable: true,
    }],
  };
}

// ─────────────────────────────────────────────
// LLM 账号打法生成
// ─────────────────────────────────────────────

async function runStrategyGeneration(
  ctx: DiagnosisContext,
  input: DiagnosisInput,
  engagementAnalysis: string,
  keyFindings: KeyFinding[],
): Promise<{
  strategyContinue: StrategyItem[];
  strategyStop: StrategyItem[];
  strategyAdd: StrategyItem[];
  executionRoadmap: WeeklyPlan[];
  riskWarnings: RiskWarning[];
}> {
  const systemPrompt = `当前日期是 ${new Date().toISOString().slice(0, 10)}。
你是一位顶级的社交媒体运营策略师，专门为内容创作者制定精准的账号增长策略。

你的策略必须：
1. 基于账号现有数据，而非通用建议
2. 区分"继续做"（已验证有效）、"停掉"（低效或有害）、"补充"（机会缺口）
3. 执行路线图要具体到每周的行动
4. 风险提示要有针对性，包含应对措施

输出格式为 JSON：
{
  "strategyContinue": [
    {
      "action": "具体行动（20字以内）",
      "reason": "原因（30字以内）",
      "priority": "high|medium|low",
      "expectedImpact": "预期效果",
      "timeframe": "时间周期"
    }
  ],
  "strategyStop": [...同上结构，额外有 "risk" 字段],
  "strategyAdd": [...同上结构，额外有 "expectedImpact" 字段],
  "executionRoadmap": [
    {
      "week": 1,
      "focus": "本周重点（15字以内）",
      "actions": ["行动1", "行动2", "行动3"],
      "kpi": "本周KPI"
    }
  ],
  "riskWarnings": [
    {
      "type": "content|algorithm|competition|audience|platform",
      "description": "风险描述（40字以内）",
      "severity": "high|medium|low",
      "mitigation": "应对措施（30字以内）"
    }
  ]
}

要求：
- strategyContinue：2-4条
- strategyStop：1-3条
- strategyAdd：2-4条
- executionRoadmap：4周计划
- riskWarnings：2-4条`;

  const findingsSummary = keyFindings
    .map((f) => `[${f.type}] ${f.title}：${f.description}`)
    .join("\n");

  const userPrompt = `基于以下账号诊断结果，制定账号增长策略：

【账号概况】
${ctx.accountSummary}

【互动率归因分析】
${engagementAnalysis}

【关键发现】
${findingsSummary}

【表现最好的内容特征】
${ctx.topWorks || "暂无数据"}

【表现最差的内容特征】
${ctx.lowWorks || "暂无数据"}

【粉丝画像】
${ctx.fanSummary}

${input.topicContext ? `【当前赛道】${input.topicContext}` : ""}
${input.userGoal ? `【用户目标】${input.userGoal}` : ""}

请给出具体的"继续做/停掉/补充"策略和4周执行路线图。`;

  try {
    const result = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      modelId: "gpt54" as const,
      temperature: 0.4,
      maxTokens: 2000,
    });

    const text = result.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      strategyContinue: StrategyItem[];
      strategyStop: StrategyItem[];
      strategyAdd: StrategyItem[];
      executionRoadmap: WeeklyPlan[];
      riskWarnings: RiskWarning[];
    };

    return {
      strategyContinue: Array.isArray(parsed.strategyContinue) ? parsed.strategyContinue : [],
      strategyStop: Array.isArray(parsed.strategyStop) ? parsed.strategyStop : [],
      strategyAdd: Array.isArray(parsed.strategyAdd) ? parsed.strategyAdd : [],
      executionRoadmap: Array.isArray(parsed.executionRoadmap) ? parsed.executionRoadmap : [],
      riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : [],
    };
  } catch (err) {
    log.error({ err: err }, "strategyGeneration LLM error");
    return buildRuleBasedStrategy(ctx, input);
  }
}

function buildRuleBasedStrategy(
  _ctx: DiagnosisContext,
  input: DiagnosisInput,
): {
  strategyContinue: StrategyItem[];
  strategyStop: StrategyItem[];
  strategyAdd: StrategyItem[];
  executionRoadmap: WeeklyPlan[];
  riskWarnings: RiskWarning[];
} {
  const topic = input.topicContext ?? "当前赛道";

  return {
    strategyContinue: [
      {
        action: `保持${topic}核心内容输出`,
        reason: "已有粉丝基础，内容方向基本正确",
        priority: "high",
        expectedImpact: "维持现有互动率水平",
        timeframe: "持续进行",
      },
      {
        action: "保持稳定的发布频率",
        reason: "算法偏好稳定更新的账号",
        priority: "medium",
        expectedImpact: "提升账号权重",
        timeframe: "每周3-5条",
      },
    ],
    strategyStop: [
      {
        action: "减少低互动率的内容类型",
        reason: "低互动内容拉低账号整体权重",
        priority: "medium",
        risk: "短期内容量下降",
        timeframe: "立即执行",
      },
    ],
    strategyAdd: [
      {
        action: "增加互动引导（提问/投票/评论话题）",
        reason: "提升评论互动是提高互动率最快的方式",
        priority: "high",
        expectedImpact: "互动率提升 20-30%",
        timeframe: "每条内容都加入",
      },
      {
        action: "测试不同发布时间段",
        reason: "找到粉丝最活跃的发布窗口",
        priority: "medium",
        expectedImpact: "播放量提升 15-25%",
        timeframe: "2周内完成测试",
      },
    ],
    executionRoadmap: [
      {
        week: 1,
        focus: "内容质量优化",
        actions: ["梳理高互动内容共同特征", "制定内容模板", "优化标题和封面"],
        kpi: "发布3条优化后的内容",
      },
      {
        week: 2,
        focus: "发布策略调整",
        actions: ["测试不同发布时间", "增加互动引导话术", "回复所有评论"],
        kpi: "互动率提升10%",
      },
      {
        week: 3,
        focus: "内容多样化测试",
        actions: ["尝试1条新内容形式", "复制最高互动内容的结构", "建立选题库"],
        kpi: "发布5条内容，至少1条爆款",
      },
      {
        week: 4,
        focus: "数据复盘与策略固化",
        actions: ["分析4周数据变化", "固化有效内容模板", "制定下月计划"],
        kpi: "粉丝增长超过上月",
      },
    ],
    riskWarnings: [
      {
        type: "algorithm",
        description: "频繁更改内容方向可能导致算法推荐权重下降",
        severity: "medium",
        mitigation: "保持核心赛道稳定，在此基础上小幅创新",
      },
      {
        type: "content",
        description: "内容同质化严重，难以从竞争中突围",
        severity: "medium",
        mitigation: "找到差异化角度，建立独特内容风格",
      },
    ],
  };
}

// ─────────────────────────────────────────────
// 评论区 AI 摘要
// ─────────────────────────────────────────────

export async function generateCommentSummary(
  comments: Array<{ content: string; sentiment?: string; likes?: number }>,
  workTitle: string,
): Promise<string> {
  if (comments.length === 0) return "暂无评论数据";

  const topComments = comments
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 10)
    .map((c) => `[${c.sentiment ?? "neutral"}] ${c.content}`)
    .join("\n");

  try {
    const result = await callLLM({
      messages: [
        {
          role: "system",
          content: "你是评论分析专家，用50字以内总结评论区的核心声音，包括用户需求、情绪倾向和高频话题。语言简洁有力，不用客套话。",
        },
        {
          role: "user",
          content: `作品《${workTitle}》的评论：\n${topComments}\n\n请用50字以内总结评论区核心声音。`,
        },
      ],
      modelId: "doubao" as const,
      temperature: 0.3,
      maxTokens: 200,
    });
    return result.content.trim();
  } catch {
    // 降级：规则统计
    const positiveCount = comments.filter((c) => c.sentiment === "positive").length;
    const negativeCount = comments.filter((c) => c.sentiment === "negative").length;
    const total = comments.length;
    const posRatio = Math.round((positiveCount / total) * 100);
    return `评论${total}条，${posRatio}%正向反馈，${Math.round((negativeCount / total) * 100)}%负向反馈。用户主要关注内容实用性和产品效果。`;
  }
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

/**
 * 安全解析 MySQL JSON 字段
 * MySQL JSON 类型在 mysql2 中返回时已经是 object，无需 JSON.parse
 * 但 TEXT 类型存储的 JSON 字符串需要 JSON.parse
 */
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T; // MySQL JSON 类型，已解析
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// ─────────────────────────────────────────────
// MySQL 持久化
// ─────────────────────────────────────────────

async function persistDiagnosisReport(report: DiagnosisReport): Promise<void> {
  await execute(
    `INSERT INTO creator_diagnosis_reports
     (id, user_id, platform_id, health_score, health_level, engagement_trend,
      engagement_analysis, key_findings, strategy_continue, strategy_stop,
      strategy_add, execution_roadmap, risk_warnings, model_used, tokens_used,
      data_period_days, generated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [
      report.id,
      report.userId,
      report.platformId,
      report.healthScore,
      report.healthLevel,
      report.engagementTrend,
      report.engagementAnalysis,
      JSON.stringify(report.keyFindings),
      JSON.stringify(report.strategyContinue),
      JSON.stringify(report.strategyStop),
      JSON.stringify(report.strategyAdd),
      JSON.stringify(report.executionRoadmap),
      JSON.stringify(report.riskWarnings),
      report.modelUsed,
      report.tokensUsed,
      report.dataPeriodDays,
    ],
  );
}

export async function getLatestDiagnosisReport(
  userId: string,
  platformId: string,
): Promise<DiagnosisReport | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_diagnosis_reports
     WHERE user_id=? AND platform_id=?
     ORDER BY generated_at DESC LIMIT 1`,
    [userId, platformId],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;

  return {
    id: String(r.id ?? ""),
    userId: String(r.user_id ?? ""),
    platformId: String(r.platform_id ?? ""),
    healthScore: Number(r.health_score ?? 0),
    healthLevel: (r.health_level as DiagnosisReport["healthLevel"]) ?? "good",
    engagementTrend: (r.engagement_trend as DiagnosisReport["engagementTrend"]) ?? "stable",
    engagementAnalysis: String(r.engagement_analysis ?? ""),
    keyFindings: parseJsonField<KeyFinding[]>(r.key_findings, []),
    strategyContinue: parseJsonField<StrategyItem[]>(r.strategy_continue, []),
    strategyStop: parseJsonField<StrategyItem[]>(r.strategy_stop, []),
    strategyAdd: parseJsonField<StrategyItem[]>(r.strategy_add, []),
    executionRoadmap: parseJsonField<WeeklyPlan[]>(r.execution_roadmap, []),
    riskWarnings: parseJsonField<RiskWarning[]>(r.risk_warnings, []),
    modelUsed: String(r.model_used ?? ""),
    tokensUsed: Number(r.tokens_used ?? 0),
    dataPeriodDays: Number(r.data_period_days ?? 30),
    generatedAt: r.generated_at ? new Date(r.generated_at as string).toISOString() : new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// 主入口：运行完整诊断
// ─────────────────────────────────────────────

export async function runAccountDiagnosis(
  input: DiagnosisInput,
): Promise<DiagnosisReport> {
  const reportId = `diag_${randomUUID()}`;
  let totalTokens = 0;
  let modelUsed = "gpt-4.1-mini";

  // 1. 构建诊断上下文
  const ctx = buildDiagnosisContext(input);

  // 2. 互动率归因分析
  const {
    healthScore,
    healthLevel,
    engagementAnalysis,
    keyFindings,
  } = await runEngagementAnalysis(ctx, input);

  // 3. 账号打法生成
  const {
    strategyContinue,
    strategyStop,
    strategyAdd,
    executionRoadmap,
    riskWarnings,
  } = await runStrategyGeneration(ctx, input, engagementAnalysis, keyFindings);

  const report: DiagnosisReport = {
    id: reportId,
    userId: input.userId,
    platformId: input.platformId,
    healthScore,
    healthLevel,
    engagementTrend: ctx.engagementTrend,
    engagementAnalysis,
    keyFindings,
    strategyContinue,
    strategyStop,
    strategyAdd,
    executionRoadmap,
    riskWarnings,
    modelUsed,
    tokensUsed: totalTokens,
    dataPeriodDays: 30,
    generatedAt: new Date().toISOString(),
  };

  // 4. 持久化
  try {
    await persistDiagnosisReport(report);
  } catch (err) {
    log.error({ err: err }, "persist error");
  }

  return report;
}
