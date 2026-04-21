/**
 * intent-agent.ts
 * ---------------------------------------------------------------
 * LLM 意图识别 Agent
 *
 * 功能：
 * 1. 接收用户 prompt + 上下文信号，调用 LLM 进行意图分类
 * 2. 返回 TaskIntent + 置信度 + 分类理由
 * 3. 提供 /api/agent/intent 独立 HTTP 接口（供前端独立调用）
 * 4. 提供 classifyIntentWithLLM() 供 live-predictions.ts 内部调用
 *
 * 支持的意图类型（与 agent-runtime.ts 保持一致）：
 * - opportunity_prediction  机会判断
 * - trend_watch             趋势观察
 * - viral_breakdown         爆款拆解
 * - topic_strategy          选题策略
 * - copy_extraction         文案提取
 * - account_diagnosis       账号诊断
 * - breakdown_sample        样本拆解
 * - direct_request          智能分析（兜底）
 *
 * mock/live 隔离：
 * 本模块只在 live 模式下被调用（由 live-predictions.ts 调用）
 * mock 模式继续使用 agent-runtime.ts 中的正则规则
 * ---------------------------------------------------------------
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("IntentAgent");
import type { IncomingMessage, ServerResponse } from "http";
import { callLLM } from "./llm-gateway.js";

// ----------------------------------------------------------------
// 类型定义（与 prediction-types.ts 保持一致，避免循环依赖）
// ----------------------------------------------------------------

export type TaskIntent =
  | "opportunity_prediction"
  | "trend_watch"
  | "viral_breakdown"
  | "topic_strategy"
  | "copy_extraction"
  | "account_diagnosis"
  | "breakdown_sample"
  | "direct_request";

export type TaskIntentConfidence = "high" | "medium" | "low";

export interface LLMIntentResult {
  taskIntent: TaskIntent;
  confidence: TaskIntentConfidence;
  candidateIntents: TaskIntent[];
  reasons: string[];
  llmUsed: boolean; // 是否实际调用了 LLM（false 表示使用了快速路径）
}

export interface IntentClassifyRequest {
  prompt: string;
  selectedSkillId?: string;
  entryTemplateId?: string;
  hasExternalLinks?: boolean;
  hasMediaItems?: boolean;
  hasConnectedPlatforms?: boolean;
  modelId?: "doubao" | "gpt54" | "claude46";
}

// ----------------------------------------------------------------
// 快速路径：高置信度信号直接返回，不调用 LLM（节省 Token）
// ----------------------------------------------------------------

const FAST_PATH_SKILL_MAP: Record<string, TaskIntent> = {
  "douyin-copy-extraction": "copy_extraction",
  "xhs-topic-strategy": "topic_strategy",
  "viral-script-breakdown": "viral_breakdown",
  "account-positioning-diagnosis": "account_diagnosis",
  "account-diagnosis": "account_diagnosis",
  "douyin-creator-diagnosis": "account_diagnosis",
  "content-calendar": "topic_strategy",
  "douyin-profile-sync": "account_diagnosis",
  "douyin-niche-inference": "account_diagnosis",
  "douyin-style-tagging": "account_diagnosis",
  "douyin-personalization-gen": "account_diagnosis",
  "douyin-fan-insight": "account_diagnosis",
  // 机会判断类型的 skill
  "opportunity-prediction": "opportunity_prediction",
  "opportunity-forecast": "opportunity_prediction",
};

const FAST_PATH_TEMPLATE_MAP: Record<string, TaskIntent> = {
  "opportunity-forecast": "opportunity_prediction",
  "opportunity_prediction": "opportunity_prediction",
  "content-strategy": "topic_strategy",
  "topic_strategy": "topic_strategy",
  "hotspot-watch": "trend_watch",
  "trend_watch": "trend_watch",
  "viral-breakdown": "viral_breakdown",
  "viral_breakdown": "viral_breakdown",
  "copy-extraction": "copy_extraction",
  "copy_extraction": "copy_extraction",
  "account-diagnosis": "account_diagnosis",
  "account_diagnosis": "account_diagnosis",
};

function tryFastPath(req: IntentClassifyRequest): LLMIntentResult | null {
  // Skill 选择：最高置信度，直接返回
  if (req.selectedSkillId && FAST_PATH_SKILL_MAP[req.selectedSkillId]) {
    const intent = FAST_PATH_SKILL_MAP[req.selectedSkillId];
    return {
      taskIntent: intent,
      confidence: "high",
      candidateIntents: [intent],
      reasons: [`用户已选择「${req.selectedSkillId}」技能，直接路由到对应任务类型。`],
      llmUsed: false,
    };
  }

  // 模板选择：高置信度
  if (req.entryTemplateId && FAST_PATH_TEMPLATE_MAP[req.entryTemplateId]) {
    const intent = FAST_PATH_TEMPLATE_MAP[req.entryTemplateId];
    return {
      taskIntent: intent,
      confidence: "high",
      candidateIntents: [intent],
      reasons: [`用户通过「${req.entryTemplateId}」模板进入，直接路由到对应任务类型。`],
      llmUsed: false,
    };
  }

  return null;
}

// ----------------------------------------------------------------
// LLM Prompt 构建
// ----------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = `你是一个内容创作 AI 助手的意图识别模块。
你的任务是分析用户输入，判断用户最想要哪种类型的分析结果。

## 核心消歧规则（最高优先级）

本产品是一个「内容赛道机会分析工具」，用户来这里是为了判断某个内容方向/赛道是否值得做。
因此：
- 当用户输入的是一个内容方向、话题、赛道名称（如"美女跳舞"、"萌宠"、"健身减脂"、"AI教程"），
  即使它看起来像一个动作，也应该理解为「分析这个赛道的视频内容机会」，而不是「教用户怎么做这件事」。
- 例如：
  - "美女跳舞" → 分析「美女跳舞」这个内容赛道的机会 → opportunity_prediction
  - "做饭" → 分析「做饭/美食」赛道的视频机会 → opportunity_prediction
  - "健身减脂" → 分析「健身减脂」赛道的机会 → opportunity_prediction
  - "搞笑段子" → 分析「搞笑段子」赛道的机会 → opportunity_prediction
- 只有当用户明确说"帮我写一个xxx脚本"、"帮我拆解这条视频"、"帮我提取文案"等带有明确动作指令时，
  才分类到对应的非 opportunity_prediction 意图。
- 如果用户输入只是一个短名词/短语（2-8个字），没有动作动词，默认分类为 opportunity_prediction。

## 爆款预测识别强化（最高优先级，优先于选题策略）

当用户输入包含以下任意关键词时，必须分类为 opportunity_prediction：
- "什么会火"、"什么容易爆"、"什么内容火"、"什么内容爆"
- "爆款"、"爆款预测"、"爆款机会"、"爆款方向"
- "值得做"、"要不要做"、"还有机会"、"赛道分析"
- "判断"、"评估"、"赛道趋势"、"市场分析"
- "未来多少天"、"未来多少月"、"近期趋势"
- "现在发什么"、"现在做什么"、"现在什么火"（注意：这些是问「什么内容有爆款机会」，不是选题策略）
- "发什么会火"、"做什么会火"、"做什么容易火"
- "有没有机会"、"机会在哪"、"赛道机会"

注意区分：
- "现在发什么会火？" → opportunity_prediction（问爆款机会）
- "帮我规划下周发什么" → topic_strategy（要内容计划）
- "给我10个选题" → topic_strategy（要选题清单）

## 选题策略识别（次优先级）

当用户输入**明确要求生成选题清单、内容计划或内容排期**时，分类为 topic_strategy：
- "选题"、"选题策略"、"选题方向"、"选题计划"、"选题清单"
- "内容策略"、"内容规划"、"内容日历"、"内容排期"
- "帮我规划"、"帮我想选题"、"给我几个题目"、"给我10个"
- "一周内容"、"本月内容"

注意："内容方向"、"做什么"、"发什么" 单独出现时**不足以**判定为 topic_strategy，
需要结合"规划"、"清单"、"策略"等词才能确认是选题策略需求。

## 可选的意图类型（必须从以下选项中选择一个）

- opportunity_prediction：机会判断 - 用户想判断某个赛道/话题是否值得做，该不该下注
- trend_watch：趋势观察 - 用户想监控/观察某个热点或趋势，不急于执行
- viral_breakdown：爆款拆解 - 用户想拆解某个爆款内容的结构、可抄点和迁移方式
- topic_strategy：选题策略 - 用户想获得具体的内容选题方向和题目清单
- copy_extraction：文案提取 - 用户想提取可复用的钩子、文案结构、CTA 模式
- account_diagnosis：账号诊断 - 用户想诊断自己或他人账号的定位、问题和打法
- breakdown_sample：样本拆解 - 用户提供了具体的低粉爆款视频，想拆解其爆因
- direct_request：智能分析 - 用户的需求不属于以上任何类型，直接生成分析报告

## 输出格式（严格的 JSON，不要输出其他内容）

{
  "taskIntent": "意图类型",
  "confidence": "high|medium|low",
  "candidateIntents": ["第一候选", "第二候选"],
  "reasons": ["理由1（不超过30字）", "理由2（可选）"]
}

## 判断规则

- confidence=high：用户明确表达了某种意图，关键词高度匹配
- confidence=medium：有一定信号但不够明确，或有多个候选
- confidence=low：用户输入模糊，只能猜测
- candidateIntents 最多2个，按置信度排序，第一个必须与 taskIntent 一致
- reasons 最多2条，每条不超过30字，用中文`;

function buildIntentUserMessage(req: IntentClassifyRequest): string {
  const lines: string[] = [];
  lines.push(`用户输入：${req.prompt}`);

  if (req.hasExternalLinks) {
    lines.push("上下文信号：用户输入中包含外部链接（可能是视频链接或内容链接）");
  }
  if (req.hasMediaItems) {
    lines.push("上下文信号：用户上传了媒体文件（图片/视频）");
  }
  if (req.hasConnectedPlatforms) {
    lines.push("上下文信号：用户已连接了内容平台账号");
  }

  return lines.join("\n");
}

// ----------------------------------------------------------------
// LLM 意图分类核心函数
// ----------------------------------------------------------------

const VALID_INTENTS = new Set<TaskIntent>([
  "opportunity_prediction",
  "trend_watch",
  "viral_breakdown",
  "topic_strategy",
  "copy_extraction",
  "account_diagnosis",
  "breakdown_sample",
  "direct_request",
]);

function isValidIntent(value: unknown): value is TaskIntent {
  return typeof value === "string" && VALID_INTENTS.has(value as TaskIntent);
}

function isValidConfidence(value: unknown): value is TaskIntentConfidence {
  return value === "high" || value === "medium" || value === "low";
}

export async function classifyIntentWithLLM(
  req: IntentClassifyRequest,
): Promise<LLMIntentResult> {
  // 1. 尝试快速路径（不调用 LLM）
  const fastResult = tryFastPath(req);
  if (fastResult) {
    log.info(`快速路径命中: ${fastResult.taskIntent}`);
    return fastResult;
  }

  // 2. 调用 LLM 进行意图分类
  const modelId = req.modelId ?? "doubao";
  const userMessage = buildIntentUserMessage(req);

  log.info(`调用 LLM (${modelId}) 进行意图识别: "${req.prompt.slice(0, 60)}..."`);

  try {
    const response = await callLLM({
      modelId,
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1, // 低温度，保证分类稳定性
      maxTokens: 256,   // 意图分类不需要长输出
    });

    // 3. 解析 LLM 输出
    const content = response.content.trim();
    log.info(`LLM 原始输出: ${content.slice(0, 200)}`);

    // 提取 JSON（LLM 可能在 JSON 前后加了其他文字）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM 输出不包含 JSON: ${content.slice(0, 100)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      taskIntent?: unknown;
      confidence?: unknown;
      candidateIntents?: unknown;
      reasons?: unknown;
    };

    // 4. 验证并规范化输出
    const taskIntent: TaskIntent = isValidIntent(parsed.taskIntent)
      ? parsed.taskIntent
      : "direct_request";

    const confidence: TaskIntentConfidence = isValidConfidence(parsed.confidence)
      ? parsed.confidence
      : "medium";

    const candidateIntents: TaskIntent[] = Array.isArray(parsed.candidateIntents)
      ? (parsed.candidateIntents as unknown[])
          .filter(isValidIntent)
          .slice(0, 2)
      : [taskIntent];

    // 确保 taskIntent 在 candidateIntents 第一位
    if (!candidateIntents.includes(taskIntent)) {
      candidateIntents.unshift(taskIntent);
    }

    const reasons: string[] = Array.isArray(parsed.reasons)
      ? (parsed.reasons as unknown[])
          .filter((r): r is string => typeof r === "string")
          .slice(0, 2)
      : [`LLM 分类为 ${taskIntent}，置信度 ${confidence}。`];

    const result: LLMIntentResult = {
      taskIntent,
      confidence,
      candidateIntents,
      reasons,
      llmUsed: true,
    };

    log.info(`意图识别完成: ${taskIntent} (${confidence})`);
    return result;

  } catch (error) {
    // 5. LLM 调用失败时，降级到正则规则（在 live-predictions.ts 中处理）
    log.error({ err: error }, `LLM 意图识别失败，降级到正则规则`);
    throw error; // 让调用方处理降级
  }
}

// ----------------------------------------------------------------
// HTTP 处理函数：POST /api/agent/intent
// ----------------------------------------------------------------

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

export async function handleIntentClassify(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(req) as Partial<IntentClassifyRequest>;

    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "缺少 prompt 参数" }));
      return;
    }

    const request: IntentClassifyRequest = {
      prompt: body.prompt.trim(),
      selectedSkillId: body.selectedSkillId,
      entryTemplateId: body.entryTemplateId,
      hasExternalLinks: body.hasExternalLinks ?? false,
      hasMediaItems: body.hasMediaItems ?? false,
      hasConnectedPlatforms: body.hasConnectedPlatforms ?? false,
      modelId: body.modelId ?? "doubao",
    };

    const result = await classifyIntentWithLLM(request);

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, ...result }));

  } catch (error) {
    log.error({ err: error }, "handleIntentClassify error");
    // 降级：返回 direct_request
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      taskIntent: "direct_request",
      confidence: "low",
      candidateIntents: ["direct_request"],
      reasons: ["意图识别服务暂时不可用，使用兜底分类。"],
      llmUsed: false,
      degraded: true,
    }));
  }
}
