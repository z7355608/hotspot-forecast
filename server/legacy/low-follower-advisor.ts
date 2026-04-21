/**
 * server/low-follower-advisor.ts
 * ═══════════════════════════════════════════════════════════════
 * 个性化建议生成器 — 模块四
 *
 * 功能：
 * 1. 基于低粉爆款样本，LLM 生成"可复制性分析"
 * 2. 结合用户上下文（平台/粉丝量/赛道）生成个性化执行建议
 * 3. 输出结构：核心策略 + 内容结构拆解 + 执行步骤 + 风险提示
 * 4. 降级机制：LLM 失败时使用规则模板生成基础建议
 * ═══════════════════════════════════════════════════════════════
 */

import { randomUUID } from "node:crypto";
import { createModuleLogger } from "./logger.js";
import { callLLM } from "./llm-gateway.js";

const log = createModuleLogger("LowFollowerAdvisor");
import type { AIModelId } from "../../client/src/app/store/app-data-core.js";
import { execute } from "./database.js";
import {
  type LowFollowerSample,
  formatFollowerLabel,
  formatViewLabel,
  formatInteractionLabel,
  getViralScoreLabel,
} from "./low-follower-algorithm.js";
import type { LowFollowerAlgorithmResult } from "./low-follower-algorithm.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 用户上下文（影响建议个性化程度） */
export interface UserContext {
  /** 用户所在平台 */
  platform?: string;
  /** 用户粉丝量 */
  followerCount?: number;
  /** 用户所在赛道 */
  industry?: string;
  /** 用户内容风格（如：知识分享/娱乐/生活记录） */
  contentStyle?: string;
  /** 用户 ID（可选，用于持久化） */
  userId?: string;
}

/** 单条样本的可复制性分析 */
export interface SampleReplicabilityAnalysis {
  /** 样本 ID */
  sampleId: string;
  /** 内容标题 */
  title: string;
  /** 爆款原因分析 */
  whyItWorked: string;
  /** 可复制的核心结构 */
  replicableStructure: string;
  /** 可复制性评分（0-100） */
  replicabilityScore: number;
  /** 适合的账号类型 */
  suitableAccountTypes: string[];
  /** 注意事项 */
  caveats: string[];
}

/** 执行步骤 */
export interface ExecutionStep {
  /** 步骤序号 */
  step: number;
  /** 步骤标题 */
  title: string;
  /** 具体操作说明 */
  action: string;
  /** 预期产出 */
  expectedOutput: string;
  /** 时间估计 */
  timeEstimate: string;
}

/** 风险提示 */
export interface RiskWarning {
  /** 风险类型 */
  type: "competition" | "platform_policy" | "content_quality" | "timing" | "audience_mismatch";
  /** 风险描述 */
  description: string;
  /** 应对建议 */
  mitigation: string;
}

/** 个性化建议完整结构 */
export interface PersonalizedAdvice {
  /** 建议 ID */
  adviceId: string;
  /** 检测任务 ID */
  detectionRunId: string;
  /** 种子话题 */
  seedTopic: string;

  /** 核心策略（一句话总结） */
  coreStrategy: string;
  /** 机会窗口描述 */
  opportunityWindow: string;
  /** 推荐行动级别 */
  actionLevel: "shoot_now" | "test_one" | "observe_first" | "not_recommended";
  /** 行动理由 */
  actionReason: string;

  /** 样本可复制性分析（最多 3 条） */
  sampleAnalyses: SampleReplicabilityAnalysis[];

  /** 内容创作建议 */
  contentCreationTips: string[];
  /** 差异化切入点 */
  differentiationAngles: string[];

  /** 执行步骤 */
  executionSteps: ExecutionStep[];

  /** 风险提示 */
  riskWarnings: RiskWarning[];

  /** 成功指标（什么算成功） */
  successMetrics: string[];

  /** 生成方法 */
  generationMethod: "llm" | "rule";
  /** 使用的模型 */
  modelUsed?: string;
  /** 生成时间 */
  generatedAt: string;
}

// ─────────────────────────────────────────────
// LLM System Prompt
// ─────────────────────────────────────────────

const ADVISOR_SYSTEM_PROMPT = `当前日期是 ${new Date().toISOString().slice(0, 10)}。
你是一位专注于短视频/图文内容赛道的增长策略顾问，擅长从低粉爆款案例中提炼可复制的内容结构。

你的任务是：基于提供的低粉爆款样本数据，为用户生成具体可执行的内容创作建议。

【核心原则】
1. 所有建议必须基于提供的真实数据，禁止凭空捏造数据
2. 建议要具体可操作，避免空洞的"做好内容"等废话
3. 结合用户的粉丝量和平台，给出差异化的切入点
4. 识别低粉爆款的共同结构特征（钩子/节奏/情绪触发点）

【输出格式】严格按照 JSON Schema 输出，不要有任何多余文字：
{
  "coreStrategy": "一句话核心策略（30字以内）",
  "opportunityWindow": "机会窗口描述（50字以内，说明为什么现在是好时机）",
  "actionLevel": "shoot_now|test_one|observe_first|not_recommended",
  "actionReason": "行动理由（50字以内）",
  "sampleAnalyses": [
    {
      "sampleId": "样本ID",
      "title": "内容标题",
      "whyItWorked": "爆款原因分析（40字以内，引用具体数据）",
      "replicableStructure": "可复制的核心结构（40字以内）",
      "replicabilityScore": 0-100,
      "suitableAccountTypes": ["适合的账号类型"],
      "caveats": ["注意事项"]
    }
  ],
  "contentCreationTips": ["内容创作建议1", "内容创作建议2", "内容创作建议3"],
  "differentiationAngles": ["差异化切入点1", "差异化切入点2"],
  "executionSteps": [
    {
      "step": 1,
      "title": "步骤标题",
      "action": "具体操作（50字以内）",
      "expectedOutput": "预期产出（30字以内）",
      "timeEstimate": "时间估计（如：1-2小时）"
    }
  ],
  "riskWarnings": [
    {
      "type": "competition|platform_policy|content_quality|timing|audience_mismatch",
      "description": "风险描述（40字以内）",
      "mitigation": "应对建议（40字以内）"
    }
  ],
  "successMetrics": ["成功指标1（引用具体数字）", "成功指标2"]
}`;

// ─────────────────────────────────────────────
// 构建 LLM 输入
// ─────────────────────────────────────────────

function buildUserPrompt(
  seedTopic: string,
  algorithmResult: LowFollowerAlgorithmResult,
  userContext: UserContext,
  topSamples: LowFollowerSample[],
): string {
  const { lowFollowerAnomalyRatio, p75InteractionBenchmark, anomalyHitCount, totalContentCount } = algorithmResult;

  // 用户上下文描述
  const userDesc = [
    userContext.platform ? `平台：${userContext.platform}` : null,
    userContext.followerCount !== undefined
      ? `粉丝量：${formatFollowerLabel(userContext.followerCount)}`
      : null,
    userContext.industry ? `赛道：${userContext.industry}` : null,
    userContext.contentStyle ? `内容风格：${userContext.contentStyle}` : null,
  ].filter(Boolean).join("，");

  // 样本描述
  const sampleDescs = topSamples.slice(0, 3).map((s, i) => {
    const engLabel = `效率比 ${s.fanEfficiencyRatio?.toFixed(1) ?? '0.0'}x`;
    const anomalyLabel = getViralScoreLabel(s.anomalyScore);
    return `
样本${i + 1}：
- ID：${s.contentId}
- 标题：${s.title}
- 粉丝量：${formatFollowerLabel(s.followerCount)}（低粉账号）
- 播放量：${formatViewLabel(s.viewCount)}
- 互动率：${engLabel}
- 粉播比：${s.viewToFollowerRatio.toFixed(0)}x（超出粉丝量 ${s.viewToFollowerRatio.toFixed(0)} 倍）
- 互动超越P75基准：${s.engagementBenchmarkMultiplier.toFixed(1)} 倍
- 异常强度：${anomalyLabel}（${s.anomalyScore}分）
- 是否严格命中：${s.isStrictAnomaly ? "是（粉丝<1万+播放>10万+互动>P75）" : "否（宽松命中）"}
- 标签：${s.tags.slice(0, 5).join("、") || "无"}`;
  }).join("\n");

  return `【赛道分析请求】

种子话题：${seedTopic}
用户信息：${userDesc || "未提供"}

【低粉爆款算法结果】
- 样本池总量：${totalContentCount} 条内容
- 严格命中数：${anomalyHitCount} 条（粉丝<1万+播放>10万+互动>P75）
- lowFollowerAnomalyRatio：${lowFollowerAnomalyRatio.toFixed(1)}%
- P75互动量基准：${p75InteractionBenchmark} 次（点赞+评论+分享+收藏）

【低粉爆款样本详情】
${sampleDescs || "（当前无严格命中样本，请基于算法结果给出谨慎建议）"}

请基于以上真实数据，为该用户生成个性化的内容创作建议。
注意：若样本数量不足或 lowFollowerAnomalyRatio 较低，actionLevel 应设为 observe_first 或 not_recommended。`;
}

// ─────────────────────────────────────────────
// 规则降级模板
// ─────────────────────────────────────────────

function buildRuleBasedAdvice(
  adviceId: string,
  detectionRunId: string,
  seedTopic: string,
  algorithmResult: LowFollowerAlgorithmResult,
  userContext: UserContext,
): PersonalizedAdvice {
  const { lowFollowerAnomalyRatio, anomalyHitCount, samples } = algorithmResult;
  const topSamples = samples.filter((s) => s.isStrictAnomaly).slice(0, 3);

  const actionLevel: PersonalizedAdvice["actionLevel"] =
    lowFollowerAnomalyRatio >= 30 && anomalyHitCount >= 3 ? "test_one" :
    lowFollowerAnomalyRatio >= 15 && anomalyHitCount >= 1 ? "observe_first" :
    "not_recommended";

  const coreStrategy = lowFollowerAnomalyRatio >= 20
    ? `${seedTopic}赛道低粉爆款信号明显，建议先做 1 条结构验证`
    : `${seedTopic}赛道低粉爆款样本不足，建议先补充证据再入场`;

  return {
    adviceId,
    detectionRunId,
    seedTopic,
    coreStrategy,
    opportunityWindow: anomalyHitCount > 0
      ? `当前 ${anomalyHitCount} 条低粉爆款样本，低粉异常比例 ${lowFollowerAnomalyRatio.toFixed(1)}%，窗口期尚在。`
      : "当前缺少足够的低粉爆款样本，建议观察后再决策。",
    actionLevel,
    actionReason: actionLevel === "test_one"
      ? "低粉爆款信号充足，适合先做 1 条结构验证，控制成本"
      : actionLevel === "observe_first"
      ? "有初步信号但样本不足，先观察 3-5 天再决定"
      : "当前证据不足以支撑入场决策",
    sampleAnalyses: topSamples.map((s) => ({
      sampleId: s.contentId,
      title: s.title,
      whyItWorked: `粉播比 ${s.viewToFollowerRatio.toFixed(0)}x，互动超P75基准 ${s.engagementBenchmarkMultiplier.toFixed(1)} 倍`,
      replicableStructure: "低粉高播结构，关注内容本身的传播力而非账号权重",
      replicabilityScore: s.anomalyScore,
      suitableAccountTypes: ["新账号", "低粉账号（< 1万粉）"],
      caveats: ["需要验证内容结构的可复制性", "注意平台算法推荐机制差异"],
    })),
    contentCreationTips: [
      "优先复制低粉爆款的内容结构（开头钩子/节奏/情绪触发点），而非模仿表面形式",
      userContext.followerCount !== undefined && userContext.followerCount < 10_000
        ? "低粉账号优势：平台对新内容有初始流量扶持，抓住前 2 小时的互动率窗口"
        : "关注低粉账号的差异化切入角度，避免与头部账号正面竞争",
      `${seedTopic}赛道建议先做 1 条测试，验证完播率和互动率是否达到行业 P75 基准（${algorithmResult.p75InteractionBenchmark} 次互动）`,
    ],
    differentiationAngles: [
      "从低粉爆款的评论区挖掘用户真实需求，找到未被满足的细分角度",
      "关注低粉样本的发布时间窗口，找到平台推流的最佳时机",
    ],
    executionSteps: [
      {
        step: 1,
        title: "拆解低粉样本结构",
        action: `逐帧分析 ${topSamples.length > 0 ? topSamples[0].title : "已命中的低粉爆款"}，记录开头钩子/内容节奏/结尾 CTA`,
        expectedOutput: "一份结构拆解笔记（开头/中间/结尾各 1-2 句话）",
        timeEstimate: "30-60 分钟",
      },
      {
        step: 2,
        title: "制作结构复刻版本",
        action: "保留核心结构，替换为自己赛道的内容，不要逐字逐句模仿",
        expectedOutput: "1 条测试视频/图文",
        timeEstimate: "2-4 小时",
      },
      {
        step: 3,
        title: "发布并监测数据",
        action: `发布后监测前 2 小时的完播率和互动率，目标：互动数 ≥ ${Math.ceil(algorithmResult.p75InteractionBenchmark * 0.5)} 次`,
        expectedOutput: "数据报告（完播率/互动率/推流情况）",
        timeEstimate: "发布后持续 24 小时",
      },
    ],
    riskWarnings: [
      {
        type: "competition",
        description: "低粉爆款结构一旦被验证，会快速被其他创作者复制",
        mitigation: "尽快迭代，在窗口期内多发几条变体版本",
      },
      {
        type: "content_quality",
        description: "低粉爆款的成功可能依赖特定时机或平台推流，不一定可复制",
        mitigation: "先做 1 条测试，数据验证后再加大投入",
      },
    ],
    successMetrics: [
      `互动数超过 P75 基准（${algorithmResult.p75InteractionBenchmark} 次）`,
      "完播率 > 40%",
      `播放量 / 粉丝量 > 10x（粉播比超过 10 倍）`,
    ],
    generationMethod: "rule",
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// 主入口：生成个性化建议
// ─────────────────────────────────────────────

export async function generatePersonalizedAdvice(params: {
  detectionRunId: string;
  seedTopic: string;
  algorithmResult: LowFollowerAlgorithmResult;
  userContext?: UserContext;
  persist?: boolean;
}): Promise<PersonalizedAdvice> {
  const { detectionRunId, seedTopic, algorithmResult, userContext = {}, persist = true } = params;
  const adviceId = `advice_${randomUUID()}`;
  const topSamples = algorithmResult.samples
    .filter((s) => s.isStrictAnomaly)
    .slice(0, 3);

  let advice: PersonalizedAdvice;
  let modelUsed: string | undefined;
  let tokensUsed: number | undefined;

  // 尝试 LLM 生成
  try {
    const userPrompt = buildUserPrompt(seedTopic, algorithmResult, userContext, topSamples);

    const llmResult = await callLLM({
      messages: [
        { role: "system", content: ADVISOR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      modelId: "doubao" as AIModelId,
      temperature: 0.3,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(llmResult.content) as Partial<PersonalizedAdvice>;
    modelUsed = llmResult.model;
    tokensUsed = (llmResult.promptTokens ?? 0) + (llmResult.completionTokens ?? 0);

    advice = {
      adviceId,
      detectionRunId,
      seedTopic,
      coreStrategy: parsed.coreStrategy ?? "基于低粉爆款样本制定内容策略",
      opportunityWindow: parsed.opportunityWindow ?? "当前有低粉爆款信号",
      actionLevel: parsed.actionLevel ?? "observe_first",
      actionReason: parsed.actionReason ?? "基于算法结果",
      sampleAnalyses: parsed.sampleAnalyses ?? [],
      contentCreationTips: parsed.contentCreationTips ?? [],
      differentiationAngles: parsed.differentiationAngles ?? [],
      executionSteps: parsed.executionSteps ?? [],
      riskWarnings: parsed.riskWarnings ?? [],
      successMetrics: parsed.successMetrics ?? [],
      generationMethod: "llm",
      modelUsed,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.warn({ err: err }, "LLM 生成失败，降级到规则模板");
    advice = buildRuleBasedAdvice(adviceId, detectionRunId, seedTopic, algorithmResult, userContext);
  }

  // 持久化到 MySQL
  if (persist) {
    try {
      await execute(
        `INSERT INTO low_follower_advice (
          id, detection_run_id, user_id, seed_topic,
          user_platform, user_follower_count, user_industry, user_content_style,
          advice_json, core_strategy, generation_method, model_used, tokens_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adviceId,
          detectionRunId,
          userContext.userId ?? null,
          seedTopic,
          userContext.platform ?? null,
          userContext.followerCount ?? null,
          userContext.industry ?? null,
          userContext.contentStyle ?? null,
          JSON.stringify(advice),
          advice.coreStrategy,
          advice.generationMethod,
          modelUsed ?? null,
          tokensUsed ?? null,
        ],
      );
    } catch (dbErr) {
      log.warn({ err: dbErr }, "建议持久化失败");
    }
  }

  return advice;
}

// ─────────────────────────────────────────────
// 批量样本可复制性分析（轻量版，不生成完整建议）
// ─────────────────────────────────────────────

export async function analyzeSampleReplicability(
  samples: LowFollowerSample[],
  seedTopic: string,
): Promise<SampleReplicabilityAnalysis[]> {
  if (samples.length === 0) return [];

  const topSamples = samples.filter((s) => s.isStrictAnomaly).slice(0, 5);
  if (topSamples.length === 0) return [];

  const sampleList = topSamples.map((s) => ({
    id: s.contentId,
    title: s.title,
    followerCount: s.followerCount,
    viewCount: s.viewCount,
    engagementRate: s.engagementRate,
    viewToFollowerRatio: s.viewToFollowerRatio,
    anomalyScore: s.anomalyScore,
    tags: s.tags,
  }));

  try {
    const result = await callLLM({
      messages: [
        {
          role: "system",
          content: `你是内容结构分析专家。对每条低粉爆款样本，分析其爆款原因和可复制性。
输出 JSON 数组，每项包含：sampleId, title, whyItWorked（40字以内）, replicableStructure（40字以内）, replicabilityScore（0-100）, suitableAccountTypes（数组）, caveats（数组）。
严格基于提供的数据，禁止捏造。`,
        },
        {
          role: "user",
          content: `赛道：${seedTopic}\n样本数据：${JSON.stringify(sampleList, null, 2)}\n请分析每条样本的可复制性。`,
        },
      ],
      modelId: "doubao" as AIModelId,
      temperature: 0.2,
      maxTokens: 1500,
    });

    const parsed = JSON.parse(result.content) as SampleReplicabilityAnalysis[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 降级：基于算法数据生成基础分析
    return topSamples.map((s) => ({
      sampleId: s.contentId,
      title: s.title,
      whyItWorked: `粉播比 ${s.viewToFollowerRatio.toFixed(0)}x，互动超P75基准 ${s.engagementBenchmarkMultiplier.toFixed(1)} 倍`,
      replicableStructure: "低粉高播结构，内容本身具有强传播力",
      replicabilityScore: s.anomalyScore,
      suitableAccountTypes: ["新账号", "低粉账号"],
      caveats: ["需验证结构可复制性"],
    }));
  }
}
