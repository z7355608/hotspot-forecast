/**
 * next-action-agent.ts
 * 动态推荐流 + 上下文继承服务
 *
 * 功能：
 * 1. 动态推荐流：基于真实 Artifact 数据，LLM 生成个性化的下一步行动建议
 *    - 输入：当前任务的 Artifact（verdict/score/evidence/gaps 等真实数据）
 *    - 输出：3 条有理由、有边界的下一步行动建议
 *    - 原则：LLM 只做"把数据转成行动建议"，不自由发挥，所有建议必须引用真实数据字段
 *
 * 2. 上下文继承：后续任务继承前一次任务的上下文
 *    - 支持 parentArtifactId 字段，从数据库读取父任务数据
 *    - 继承 platform/keyword/industry/inputKind 等核心字段
 *
 * 原则：
 * - LLM 只做结构化转换，不凭空生成内容
 * - 所有推荐理由必须引用 Artifact 中的真实字段
 * - mock 模式不调用此模块
 */

import { callLLM } from "./llm-gateway.js";

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

export interface ArtifactContext {
  /** 任务意图 */
  taskIntent: string;
  /** 判断结论（go_now/test_small/observe/not_now） */
  verdict: string;
  /** 置信度标签 */
  confidenceLabel: string;
  /** 机会得分 */
  score: number;
  /** 核心押注描述 */
  coreBet?: string;
  /** 证据缺口 */
  evidenceGaps: string[];
  /** 支持账号数量 */
  supportingAccountCount: number;
  /** 支持内容数量 */
  supportingContentCount: number;
  /** 低粉异常样本数量 */
  lowFollowerEvidenceCount: number;
  /** 热点词数量 */
  hotSeedCount: number;
  /** 评论数量 */
  commentCount: number;
  /** 平台列表 */
  platforms: string[];
  /** 赛道/话题 */
  seedTopic: string;
  /** 降级标志 */
  degradeFlags: string[];
  /** 当前最佳动作类型 */
  bestActionType: string;
  /** 当前最佳动作标题 */
  bestActionTitle: string;
}

export interface RecommendedNextAction {
  /** 任务意图 */
  taskIntent: string;
  /** 行动标题（简洁，≤12字） */
  title: string;
  /** 行动理由（必须引用真实数据，≤60字） */
  reason: string;
  /** CTA 按钮文案（≤8字） */
  actionLabel: string;
  /** 优先级（1=最高） */
  priority: 1 | 2 | 3;
  /** 数据依据（引用的具体字段和值） */
  dataBasis: string;
}

export interface NextActionResult {
  recommendations: RecommendedNextAction[];
  generatedAt: string;
  llmUsed: boolean;
  fallbackUsed: boolean;
}

// ----------------------------------------------------------------
// 上下文继承
// ----------------------------------------------------------------

export interface InheritedContext {
  parentArtifactId: string;
  inheritedPlatforms: string[];
  inheritedKeyword: string;
  inheritedIndustry: string;
  inheritedInputKind: string;
  inheritedVerdict: string;
  inheritedScore: number;
  inheritedAt: string;
}

/**
 * 从父 Artifact 数据中提取可继承的上下文字段
 * 用于在 PredictionRequestDraft 中填充默认值
 */
export function extractInheritedContext(
  parentArtifactId: string,
  parentData: Record<string, unknown>,
): InheritedContext {
  const brief = parentData.normalizedBrief as Record<string, unknown> | undefined;
  const uiResult = parentData.uiResult as Record<string, unknown> | undefined;

  return {
    parentArtifactId,
    inheritedPlatforms:
      Array.isArray(parentData.platform)
        ? (parentData.platform as string[])
        : typeof parentData.platform === "string"
          ? [parentData.platform]
          : [],
    inheritedKeyword:
      typeof brief?.seedTopic === "string"
        ? brief.seedTopic
        : typeof parentData.seedTopic === "string"
          ? parentData.seedTopic
          : "",
    inheritedIndustry:
      typeof brief?.industry === "string" ? brief.industry : "",
    inheritedInputKind:
      typeof brief?.inputKind === "string" ? brief.inputKind : "text",
    inheritedVerdict:
      typeof uiResult?.verdict === "string"
        ? uiResult.verdict
        : typeof parentData.verdict === "string"
          ? parentData.verdict
          : "",
    inheritedScore:
      typeof uiResult?.score === "number"
        ? uiResult.score
        : typeof parentData.score === "number"
          ? parentData.score
          : 0,
    inheritedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------
// 静态降级推荐（数据驱动，不用 LLM）
// ----------------------------------------------------------------

function buildStaticRecommendations(ctx: ArtifactContext): RecommendedNextAction[] {
  const recs: RecommendedNextAction[] = [];

  // 基于 verdict 的主推荐
  if (ctx.verdict === "go_now" && ctx.confidenceLabel !== "低") {
    recs.push({
      taskIntent: "topic_strategy",
      title: "把判断收口成选题方向",
      reason: `当前得分 ${ctx.score} 分，${ctx.supportingContentCount} 条真实内容支撑，可直接进入选题执行。`,
      actionLabel: "继续到选题策略",
      priority: 1,
      dataBasis: `score=${ctx.score}, supportingContentCount=${ctx.supportingContentCount}, verdict=go_now`,
    });
  } else if (ctx.lowFollowerEvidenceCount > 0) {
    recs.push({
      taskIntent: "viral_breakdown",
      title: "先拆低粉异常样本",
      reason: `已发现 ${ctx.lowFollowerEvidenceCount} 个低粉爆款，先拆清楚可复制结构再决定是否执行。`,
      actionLabel: "去拆解爆款",
      priority: 1,
      dataBasis: `lowFollowerEvidenceCount=${ctx.lowFollowerEvidenceCount}`,
    });
  } else if (ctx.evidenceGaps.length > 0) {
    recs.push({
      taskIntent: "trend_watch",
      title: "建立智能监控，持续积累数据",
      reason: `还有 ${ctx.evidenceGaps.length} 个方向可以进一步探索，建立监控后系统会自动追踪并提醒你。`,
      actionLabel: "开启智能监控",
      priority: 1,
      dataBasis: `evidenceGaps=${ctx.evidenceGaps.length}, verdict=${ctx.verdict}`,
    });
  } else {
    recs.push({
      taskIntent: "topic_strategy",
      title: "把分析结果转成选题",
      reason: `基于 ${ctx.platforms.join("/")} 的真实数据，可以进一步收口到可执行选题方向。`,
      actionLabel: "继续到选题策略",
      priority: 1,
      dataBasis: `platforms=${ctx.platforms.join(",")}, taskIntent=${ctx.taskIntent}`,
    });
  }

  // 次推荐
  if (ctx.taskIntent !== "viral_breakdown" && ctx.supportingContentCount > 0) {
    recs.push({
      taskIntent: "viral_breakdown",
      title: "拆解支持内容结构",
      reason: `已有 ${ctx.supportingContentCount} 条真实内容样本，拆解结构可提取可迁移的表达框架。`,
      actionLabel: "继续到爆款拆解",
      priority: 2,
      dataBasis: `supportingContentCount=${ctx.supportingContentCount}`,
    });
  }

  // 第三推荐：根据任务类型给出不同建议
  if (ctx.taskIntent === "topic_strategy") {
    // 选题策略完成后，建议直接执行或建立监控
    if (!recs.some((r) => r.taskIntent === "trend_watch")) {
      recs.push({
        taskIntent: "trend_watch",
        title: "建立选题监控",
        reason: `选题策略已完成，建立智能监控可持续追踪 ${ctx.seedTopic} 赛道的数据变化。`,
        actionLabel: "开启智能监控",
        priority: 3,
        dataBasis: `seedTopic=${ctx.seedTopic}, platforms=${ctx.platforms.join(",")}`,
      });
    }
  } else if (ctx.supportingContentCount > 3 && !recs.some((r) => r.taskIntent === "viral_breakdown")) {
    recs.push({
      taskIntent: "viral_breakdown",
      title: "深度拆解爆款结构",
      reason: `已有 ${ctx.supportingContentCount} 条内容样本，拆解可提取可迁移的表达框架。`,
      actionLabel: "去拆解爆款",
      priority: 3,
      dataBasis: `supportingContentCount=${ctx.supportingContentCount}`,
    });
  } else if (ctx.commentCount > 0) {
    recs.push({
      taskIntent: "opportunity_prediction",
      title: "换个角度再看看",
      reason: `本轮采集到 ${ctx.commentCount} 条评论，可以从不同角度重新评估机会。`,
      actionLabel: "重新评估",
      priority: 3,
      dataBasis: `commentCount=${ctx.commentCount}`,
    });
  }

  return recs.slice(0, 3);
}

// ----------------------------------------------------------------
// LLM 增强推荐（基于真实 Artifact 数据）
// ----------------------------------------------------------------

async function buildLLMRecommendations(
  ctx: ArtifactContext,
): Promise<RecommendedNextAction[]> {
  const systemPrompt = `当前日期是 ${new Date().toISOString().slice(0, 10)}。
你是一个内容创作策略助手。根据以下真实数据分析结果，生成 3 条下一步行动建议。

规则：
1. 每条建议必须引用数据中的具体数字或字段，不能凭空编造
2. 建议必须有明确的任务意图（从以下选择：opportunity_prediction/viral_breakdown/topic_strategy/copy_extraction/account_diagnosis/trend_watch）
3. 理由必须简洁，≤60字，且必须包含具体数据依据
4. 标题≤12字，CTA≤8字
5. 按优先级排序（1=最高）

以 JSON 数组返回，格式：
[
  {
    "taskIntent": "...",
    "title": "...",
    "reason": "...",
    "actionLabel": "...",
    "priority": 1,
    "dataBasis": "..."
  }
]

只返回 JSON 数组，不要任何解释。`;

  const dataContext = `
当前分析数据：
- 任务类型：${ctx.taskIntent}
- 判断结论：${ctx.verdict}（${ctx.confidenceLabel}置信度）
- 机会得分：${ctx.score}分
- 核心押注：${ctx.coreBet ?? "未提供"}
- 平台：${ctx.platforms.join("/")}
- 话题：${ctx.seedTopic}
- 支持账号数：${ctx.supportingAccountCount}
- 支持内容数：${ctx.supportingContentCount}
- 低粉异常样本数：${ctx.lowFollowerEvidenceCount}
- 热点词数量：${ctx.hotSeedCount}
- 评论数量：${ctx.commentCount}
- 可探索方向：${ctx.evidenceGaps.length > 0 ? ctx.evidenceGaps.join("；") : "无"}
- 降级标志：${ctx.degradeFlags.length > 0 ? ctx.degradeFlags.join("；") : "无"}
- 当前最佳动作：${ctx.bestActionTitle}（${ctx.bestActionType}）
`;

  try {
    const response = await callLLM({
      modelId: "doubao",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: dataContext },
      ],
      temperature: 0.3,
      maxTokens: 800,
    });

    const text = response.content.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return parsed
      .slice(0, 3)
      .map((item, index) => ({
        taskIntent: typeof item.taskIntent === "string" ? item.taskIntent : "topic_strategy",
        title: typeof item.title === "string" ? item.title.slice(0, 20) : "继续深挖",
        reason: typeof item.reason === "string" ? item.reason.slice(0, 100) : "",
        actionLabel: typeof item.actionLabel === "string" ? item.actionLabel.slice(0, 12) : "继续",
        priority: (index + 1) as 1 | 2 | 3,
        dataBasis: typeof item.dataBasis === "string" ? item.dataBasis : "",
      }));
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------
// 主入口：生成下一步行动推荐
// ----------------------------------------------------------------

export async function generateNextActions(
  ctx: ArtifactContext,
  useLLM = true,
): Promise<NextActionResult> {
  const now = new Date().toISOString();

  // 先生成静态推荐（保底）
  const staticRecs = buildStaticRecommendations(ctx);

  if (!useLLM) {
    return {
      recommendations: staticRecs,
      generatedAt: now,
      llmUsed: false,
      fallbackUsed: false,
    };
  }

  // 尝试 LLM 增强推荐
  const llmRecs = await buildLLMRecommendations(ctx).catch(() => []);

  if (llmRecs.length >= 2) {
    return {
      recommendations: llmRecs,
      generatedAt: now,
      llmUsed: true,
      fallbackUsed: false,
    };
  }

  // LLM 失败，降级到静态推荐
  return {
    recommendations: staticRecs,
    generatedAt: now,
    llmUsed: false,
    fallbackUsed: true,
  };
}

// ----------------------------------------------------------------
// HTTP 处理函数（供 http-server.ts 调用）
// ----------------------------------------------------------------

export async function handleGenerateNextActions(
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  if (!body || typeof body !== "object") {
    return { status: 400, data: { error: "请求体必须是 JSON 对象" } };
  }

  const req = body as Record<string, unknown>;

  // 从请求体中构建 ArtifactContext
  const ctx: ArtifactContext = {
    taskIntent: typeof req.taskIntent === "string" ? req.taskIntent : "opportunity_prediction",
    verdict: typeof req.verdict === "string" ? req.verdict : "observe",
    confidenceLabel: typeof req.confidenceLabel === "string" ? req.confidenceLabel : "低",
    score: typeof req.score === "number" ? req.score : 50,
    coreBet: typeof req.coreBet === "string" ? req.coreBet : undefined,
    evidenceGaps: Array.isArray(req.evidenceGaps)
      ? (req.evidenceGaps as string[])
      : [],
    supportingAccountCount:
      typeof req.supportingAccountCount === "number" ? req.supportingAccountCount : 0,
    supportingContentCount:
      typeof req.supportingContentCount === "number" ? req.supportingContentCount : 0,
    lowFollowerEvidenceCount:
      typeof req.lowFollowerEvidenceCount === "number" ? req.lowFollowerEvidenceCount : 0,
    hotSeedCount: typeof req.hotSeedCount === "number" ? req.hotSeedCount : 0,
    commentCount: typeof req.commentCount === "number" ? req.commentCount : 0,
    platforms: Array.isArray(req.platforms) ? (req.platforms as string[]) : [],
    seedTopic: typeof req.seedTopic === "string" ? req.seedTopic : "",
    degradeFlags: Array.isArray(req.degradeFlags) ? (req.degradeFlags as string[]) : [],
    bestActionType: typeof req.bestActionType === "string" ? req.bestActionType : "monitor",
    bestActionTitle: typeof req.bestActionTitle === "string" ? req.bestActionTitle : "继续探索",
  };

  const useLLM = req.useLLM !== false;

  try {
    const result = await generateNextActions(ctx, useLLM);
    return { status: 200, data: result };
  } catch (error) {
    return {
      status: 500,
      data: {
        error: error instanceof Error ? error.message : "生成失败",
      },
    };
  }
}
