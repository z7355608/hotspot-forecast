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
import { resolveSystemPrompt } from "./prompt-engine.js";

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
  /** parseInput 解析后的输入摘要（来自 input-parser.ts） */
  parsedInputSummary?: {
    kind: "url_video" | "url_article" | "url_social" | "image_ocr" | "document_text" | "plain_text" | "unknown";
    platform?: string;
    title?: string;
    hasContent: boolean;
  };
  /** payload-extractor 提取的关键参数摘要 */
  extractedPayloadSummary?: {
    hasAwemeId: boolean;
    hasNoteId: boolean;
    hasUniqueId: boolean;
    industry?: string;
  };
  /** evidenceItems 中各类媒体的数量统计 */
  mediaCount?: { video: number; image: number; file: number };
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

export function tryFastPath(req: IntentClassifyRequest): LLMIntentResult | null {
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
用户的输入形态多样：关键词、一句话需求、视频/账号链接、上传的图片/视频/文档。
你的任务是综合「输入形态信号」和「用户文字诉求」，判断最匹配的意图。
不要预设用户一定在做赛道分析。

## 输入形态优先级（结合上下文信号判断）

1. 用户提供视频链接或视频文件 → 优先 viral_breakdown 或 breakdown_sample
   - 仅链接、无其他诉求 → viral_breakdown
   - 含「为什么爆 / 拆解爆因 / 低粉爆款」 → breakdown_sample
2. 用户上传图片 / 文档 / 文章链接 → 优先 copy_extraction
3. 用户已连接平台 + prompt 含「我是 XX 博主 / 我的账号 / 我粉丝 / 我主页」 → account_diagnosis
4. 否则按 prompt 文字诉求判断（见下方意图说明）

## 意图说明（必须从中选一个）

- opportunity_prediction：用户问「值得做吗 / 有没有机会 / 这个赛道怎么样 / 要不要下注 / 有没有爆款机会」
- trend_watch：用户问「最近什么火 / 趋势如何 / 监控热点」，重观察轻执行
- viral_breakdown：用户给出某条爆款视频链接，想拆解结构和可抄点
- breakdown_sample：用户提供「低粉爆款」样本，想分析爆因机制
- topic_strategy：用户要「选题清单 / 内容规划 / 排期 / 给我 N 个选题」
- copy_extraction：用户要「提取文案 / 钩子 / CTA / 标题模板」
- account_diagnosis：用户要诊断账号定位、问题、打法
- direct_request：以上都不匹配，或用户输入过于模糊。这是兜底选项，不要回避使用。

## 关键规则

- **不要把短关键词默认归到任何特定意图**。短词（2-8 字）若无任何动作动词/上下文信号，归 direct_request 并标 confidence=low。
- "现在发什么会火"类提问：用户问大方向 → opportunity_prediction；用户要具体题目（含"清单/几个/规划"）→ topic_strategy。
- 当输入形态信号（如有视频 URL）与文字诉求冲突时，**文字诉求优先**。例：URL + "帮我规划一周选题" → topic_strategy。
- 用户明确说"帮我写脚本/拆解视频/提取文案/做账号诊断"时，按动作指令分类。

## 输出格式（严格的 JSON，不要输出其他内容）

{
  "taskIntent": "意图类型",
  "confidence": "high|medium|low",
  "candidateIntents": ["第一候选", "第二候选"],
  "reasons": ["理由1（不超过30字）", "理由2（可选）"]
}

## 判断规则

- confidence=high：形态+文字双重命中，意图明确
- confidence=medium：单一信号命中，或有多个候选
- confidence=low：用户输入模糊，仅靠猜测
- candidateIntents 最多 2 个，按置信度排序，第一个必须与 taskIntent 一致
- reasons 最多 2 条，每条不超过 30 字，用中文`;

function buildIntentUserMessage(req: IntentClassifyRequest): string {
  const lines: string[] = [];
  lines.push(`用户输入：${req.prompt}`);

  // ── 输入形态信号（结构化解析结果） ──
  if (req.parsedInputSummary) {
    const p = req.parsedInputSummary;
    const platformPart = p.platform ? `（平台：${p.platform}）` : "";
    const titlePart = p.title ? `，标题摘要：「${p.title.slice(0, 80)}」` : "";
    lines.push(`输入形态：${p.kind}${platformPart}${titlePart}`);
  }

  if (req.extractedPayloadSummary) {
    const e = req.extractedPayloadSummary;
    const flags: string[] = [];
    if (e.hasAwemeId) flags.push("含抖音视频ID");
    if (e.hasNoteId) flags.push("含小红书笔记ID");
    if (e.hasUniqueId) flags.push("含账号唯一标识");
    if (e.industry) flags.push(`行业：${e.industry}`);
    if (flags.length > 0) {
      lines.push(`提取参数：${flags.join("、")}`);
    }
  }

  if (req.mediaCount && (req.mediaCount.video > 0 || req.mediaCount.image > 0 || req.mediaCount.file > 0)) {
    const parts: string[] = [];
    if (req.mediaCount.video > 0) parts.push(`${req.mediaCount.video} 个视频`);
    if (req.mediaCount.image > 0) parts.push(`${req.mediaCount.image} 张图片`);
    if (req.mediaCount.file > 0) parts.push(`${req.mediaCount.file} 个文档`);
    lines.push(`上传素材：${parts.join("、")}`);
  }

  // ── 布尔信号（向后兼容） ──
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
  const modelId = req.modelId ?? "gpt54";
  const userMessage = buildIntentUserMessage(req);

  log.info(`调用 LLM (${modelId}) 进行意图识别: "${req.prompt.slice(0, 60)}..."`);

  const systemPrompt = await resolveSystemPrompt(
    "intent-classification-v1",
    modelId,
    {},
    INTENT_SYSTEM_PROMPT,
  );

  try {
    const response = await callLLM({
      modelId,
      messages: [
        { role: "system", content: systemPrompt },
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
    // 5. LLM 调用失败时，直接降级到 direct_request（不再抛错让上游兜底为赛道）
    log.error({ err: error }, `LLM 意图识别失败，降级 direct_request`);
    return {
      taskIntent: "direct_request",
      confidence: "low",
      candidateIntents: ["direct_request"],
      reasons: ["LLM 意图识别失败，使用兜底分类。"],
      llmUsed: false,
    };
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
      modelId: body.modelId ?? "gpt54",
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
