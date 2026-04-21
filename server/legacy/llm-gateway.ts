/**
 * LLM Gateway — 统一大模型调用网关
 * ═══════════════════════════════════════════════════════════════
 * 支持三个模型：
 *   - doubao   → 豆包 2.0 seed（火山引擎 ARK，1x 倍率）
 *   - gpt54    → GPT-5.4（第三方 OpenAI 兼容，1.5x 倍率）
 *   - claude46 → Claude Opus 4.6（第三方 OpenAI 兼容，2x 倍率）
 *
 * 功能：
 *   1. callLLM()        — 非流式调用，返回完整文本
 *   2. streamLLM()      — 流式调用，返回 AsyncGenerator<string>
 *   3. streamLLMToSSE() — 将流式输出写入 HTTP SSE 响应
 *   4. deductCredits()  — 调用前后扣减用户积分（含倍率计算）
 *   5. resolveModelName() — 产品 modelId → 实际 API model 参数
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LLMGateway");
import type { ServerResponse } from "node:http";
import type { AIModelId } from "../../client/src/app/store/app-data-core.js";

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  /** 产品侧模型 ID（doubao / gpt54 / claude46） */
  modelId: AIModelId;
  /** 对话消息列表 */
  messages: LLMMessage[];
  /** 最大输出 token 数，默认 2048 */
  maxTokens?: number;
  /** 温度，默认 0.7 */
  temperature?: number;
  /** 请求超时毫秒，默认 60000 */
  timeoutMs?: number;
}

export interface LLMCallResult {
  /** 模型返回的完整文本 */
  content: string;
  /** 实际使用的 model 参数 */
  model: string;
  /** prompt token 数（用于计费参考） */
  promptTokens: number;
  /** completion token 数 */
  completionTokens: number;
}

export interface StreamLLMOptions extends LLMCallOptions {
  /** 每个 delta chunk 的回调（可选，用于日志） */
  onChunk?: (chunk: string) => void;
}

/* ─────────────────────────────────────────────
   模型路由配置
───────────────────────────────────────────── */

interface ModelRoute {
  /** 实际传给 API 的 model 参数 */
  apiModel: string;
  /** API 端点 base URL */
  baseUrl: string;
  /** Authorization Bearer token */
  apiKey: string;
}

function getModelRoute(modelId: AIModelId): ModelRoute {
  const arkKey = process.env.ARK_API_KEY ?? "";
  const arkEndpoint = process.env.ARK_DOUBAO_ENDPOINT_ID ?? "";
  const arkBase = (process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");

  const thirdKey = process.env.THIRD_PARTY_LLM_API_KEY ?? "";
  const thirdBase = (process.env.THIRD_PARTY_LLM_BASE_URL ?? "https://api.ablai.top/v1").replace(/\/$/, "");

  switch (modelId) {
    case "doubao":
      return { apiModel: arkEndpoint, baseUrl: arkBase, apiKey: arkKey };
    case "gpt54":
      return { apiModel: "gpt-5.4", baseUrl: thirdBase, apiKey: thirdKey };
    case "claude46":
      return { apiModel: "claude-opus-4-6", baseUrl: thirdBase, apiKey: thirdKey };
    default: {
      // 未知模型降级为豆包
      log.warn(`Unknown modelId "${String(modelId)}", falling back to doubao`);
      return { apiModel: arkEndpoint, baseUrl: arkBase, apiKey: arkKey };
    }
  }
}

/** 返回实际 API model 参数（供外部展示或日志） */
export function resolveModelName(modelId: AIModelId): string {
  return getModelRoute(modelId).apiModel;
}

/* ─────────────────────────────────────────────
   积分倍率映射（与前端 app-data-core.ts 保持一致）
───────────────────────────────────────────── */

const MODEL_MULTIPLIER: Record<AIModelId, number> = {
  doubao: 1,
  gpt54: 1.5,
  claude46: 2,
};

/**
 * 计算实际扣减积分（向上取整到 5 的倍数）
 * 与前端 getChargedCost() 逻辑完全一致
 */
export function calcChargedCredits(baseCost: number, modelId: AIModelId): number {
  if (baseCost <= 0) return 0;
  const multiplier = MODEL_MULTIPLIER[modelId] ?? 1;
  return Math.ceil((baseCost * multiplier) / 5) * 5;
}

/* ─────────────────────────────────────────────
   非流式调用
───────────────────────────────────────────── */

/**
 * 非流式 LLM 调用，返回完整文本。
 * 内置超时、错误重试（最多 2 次）和降级日志。
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  const {
    modelId,
    messages,
    maxTokens = 2048,
    temperature = 0.7,
    timeoutMs = 60_000,
  } = options;

  const route = getModelRoute(modelId);
  const url = `${route.baseUrl}/chat/completions`;

  // 显式禁用 doubao-seed-2.0-pro 的 thinking（推理）功能以降低延迟和 token 消耗
  const isArk = modelId === "doubao";
  const body = JSON.stringify({
    model: route.apiModel,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
    ...(isArk ? { thinking: { type: "disabled" } } : {}),
  });

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${route.apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        throw new Error(`LLM API error ${resp.status}: ${errText}`);
      }

      const data = (await resp.json()) as {
        choices: { message: { content: string } }[];
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;

      log.info("${modelId}(${route.apiModel}) non-stream OK — prompt:${promptTokens} completion:${completionTokens}");

      return {
        content,
        model: data.model ?? route.apiModel,
        promptTokens,
        completionTokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(`attempt ${attempt} failed for ${modelId}: ${lastError.message}`);
      if (attempt < 2) await sleep(1000);
    }
  }

  // 降级：使用内置 invokeLLM
  log.warn(`callLLM all attempts failed for ${modelId}, falling back to invokeLLM`);
  try {
    const { invokeLLM } = await import("../_core/llm.js");
    const fallbackMessages = messages.map(m => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));
    const fallbackResult = await invokeLLM({
      messages: fallbackMessages,
      maxTokens: maxTokens,
    });
    const fallbackContent = fallbackResult.choices?.[0]?.message?.content ?? "";
    const text = typeof fallbackContent === "string" ? fallbackContent : JSON.stringify(fallbackContent);
    return {
      content: text,
      model: "invokeLLM-fallback",
      promptTokens: fallbackResult.usage?.prompt_tokens ?? 0,
      completionTokens: fallbackResult.usage?.completion_tokens ?? 0,
    };
  } catch (fallbackErr) {
    log.error({ err: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) }, `invokeLLM fallback also failed`);
    throw lastError ?? new Error(`[LLM] callLLM failed for ${modelId}`);
  }
}

/* ─────────────────────────────────────────────
   流式调用 — AsyncGenerator
───────────────────────────────────────────── */

/**
 * 流式 LLM 调用，返回 AsyncGenerator<string>。
 * 每次 yield 一个 delta 文本片段。
 */
export async function* streamLLM(options: StreamLLMOptions): AsyncGenerator<string> {
  const {
    modelId,
    messages,
    maxTokens = 2048,
    temperature = 0.7,
    timeoutMs = 90_000,
    onChunk,
  } = options;

  const route = getModelRoute(modelId);
  const url = `${route.baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify({
        model: route.apiModel,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        // 显式禁用 doubao-seed-2.0-pro 的 thinking
        ...(modelId === "doubao" ? { thinking: { type: "disabled" } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`[LLM] stream fetch failed for ${modelId}: ${String(err)}`);
  }

  if (!resp.ok) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`[LLM] stream API error ${resp.status}: ${errText}`);
  }

  if (!resp.body) {
    clearTimeout(timer);
    throw new Error("[LLM] stream response body is null");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 格式：每行以 "data: " 开头，空行分隔
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 最后一行可能不完整，留到下次

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr) as {
            choices?: { delta?: { content?: string; reasoning_content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta;
          // 只输出 content，跳过 reasoning_content 思维链
          // 豆包推理模型会先输出大量 reasoning_content，不应展示给用户
          const text = delta?.content;
          if (text) {
            onChunk?.(text);
            yield text;
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/* ─────────────────────────────────────────────
   流式输出 → HTTP SSE 响应
───────────────────────────────────────────── */

/**
 * 将 LLM 流式输出直接写入 HTTP SSE 响应。
 *
 * SSE 事件格式：
 *   event: delta
 *   data: {"text":"..."}
 *
 *   event: done
 *   data: {"model":"...","promptTokens":0,"completionTokens":0}
 *
 *   event: error
 *   data: {"message":"..."}
 */
export async function streamLLMToSSE(
  options: StreamLLMOptions,
  response: ServerResponse,
  headersAlreadySentOrBillingMeta?: boolean | { chargedCost: number; transactionId: string },
): Promise<void> {
  const headersAlreadySent = headersAlreadySentOrBillingMeta === true;
  const billingMeta = typeof headersAlreadySentOrBillingMeta === "object" ? headersAlreadySentOrBillingMeta : undefined;

  // 如果响应头尚未发送，设置 SSE 响应头
  if (!headersAlreadySent) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  }

  const route = getModelRoute(options.modelId);
  let totalCompletion = 0;

  try {
    for await (const chunk of streamLLM(options)) {
      totalCompletion += chunk.length;
      writeSSE(response, "delta", { text: chunk });
    }

    writeSSE(response, "done", {
      model: route.apiModel,
      completionChars: totalCompletion,
      chargedCost: billingMeta?.chargedCost ?? 0,
      transactionId: billingMeta?.transactionId ?? "free",
    });

    log.info(`${options.modelId}(${route.apiModel}) stream done — chars:${totalCompletion}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message }, `streamLLMToSSE stream failed for ${options.modelId}, falling back to invokeLLM`);

    // 降级：使用内置 invokeLLM 非流式调用
    try {
      const { invokeLLM } = await import("../_core/llm.js");
      const fallbackMessages = options.messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));
      const fallbackResult = await invokeLLM({
        messages: fallbackMessages,
        maxTokens: options.maxTokens ?? 4096,
      });
      const fallbackContent = fallbackResult.choices?.[0]?.message?.content ?? "";
      const text = typeof fallbackContent === "string" ? fallbackContent : JSON.stringify(fallbackContent);
      if (text) {
        writeSSE(response, "delta", { text });
        totalCompletion = text.length;
      }
      writeSSE(response, "done", {
        model: "invokeLLM-fallback",
        completionChars: totalCompletion,
        chargedCost: billingMeta?.chargedCost ?? 0,
        transactionId: billingMeta?.transactionId ?? "free",
      });
      log.info(`Fallback invokeLLM succeeded — chars:${totalCompletion}`);
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      log.error({ err: fallbackMessage }, `invokeLLM fallback also failed`);
      writeSSE(response, "error", { message: `生成失败，请稍后重试。(${fallbackMessage.slice(0, 60)})` });
    }
  } finally {
    response.end();
  }
}

/* ─────────────────────────────────────────────
   SSE 工具函数
───────────────────────────────────────────── */

function writeSSE(response: ServerResponse, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  response.write(payload);
}

/* ─────────────────────────────────────────────
   工具函数
───────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────
   网关健康检查
───────────────────────────────────────────── */

export interface GatewayHealthResult {
  doubao: "ok" | "error";
  gpt54: "ok" | "error";
  claude46: "ok" | "error";
  checkedAt: string;
}

/**
 * 快速检查三个模型的连通性（max_tokens=1，仅用于健康检查）
 */
export async function checkGatewayHealth(): Promise<GatewayHealthResult> {
  const probe = async (modelId: AIModelId): Promise<"ok" | "error"> => {
    try {
      await callLLM({
        modelId,
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 1,
        timeoutMs: 15_000,
      });
      return "ok";
    } catch {
      return "error";
    }
  };

  const [doubao, gpt54, claude46] = await Promise.all([
    probe("doubao"),
    probe("gpt54"),
    probe("claude46"),
  ]);

  return { doubao, gpt54, claude46, checkedAt: new Date().toISOString() };
}
