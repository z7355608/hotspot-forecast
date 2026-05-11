/**
 * LLM Gateway — 统一大模型调用网关
 * ═══════════════════════════════════════════════════════════════
 * 五个 modelId(一个 API 全覆盖):
 *   - doubao   → 豆包 2.0 seed(火山 ARK,1x 倍率)
 *   - gpt54    → GPT-5.5(第三方 OpenAI 兼容,1.5x 倍率)— modelId 名沿用 "gpt54" 是历史包袱,实际 apiModel 已升 5.5
 *   - claude46 → Claude Opus 4.7(第三方,2x 倍率)— modelId 同上,已升 4.7
 *   - forge    → Forge / gemini-2.5-flash(Manus 内部 API,复合内容/Tool/JSON Schema)— **2026-04-30 manus 弃用,API key 401,callsite 应迁移到 doubao 或 apollo**
 *   - apollo   → Apollo / gemini-3.1-pro-preview(视频理解,3 次重试)
 *
 * 公共能力：
 *   - 复合 content（text + image_url + file_url）
 *   - responseFormat: text | json_object | json_schema
 *   - 流式（streamLLM、streamLLMToSSE）
 *   - 积分倍率（calcChargedCredits）
 *   - 健康检查（checkGatewayHealth）
 *
 * 历史：原本拆成 _core/llm.ts (forge/apollo) + legacy/llm-gateway.ts (doubao/...)，
 * 2026-04-28 合并，让所有 LLM 调用过同一个入口。
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";
import { ENV } from "../_core/env.js";

const log = createModuleLogger("LLMGateway");
import type { ServerResponse } from "node:http";
import type { AIModelId } from "../../client/src/app/store/app-data-core.js";

/* ─────────────────────────────────────────────
   类型定义 — 公共
───────────────────────────────────────────── */

export type LLMServerOnlyModelId = "forge" | "apollo";
export type LLMModelId = AIModelId | LLMServerOnlyModelId;

export type LLMTextPart = { type: "text"; text: string };
export type LLMImagePart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
export type LLMFilePart = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};
export type LLMContentPart = LLMTextPart | LLMImagePart | LLMFilePart;
export type LLMContent = string | LLMContentPart[];

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: LLMContent;
}

export interface LLMJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export type LLMResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: LLMJsonSchema };

export interface LLMCallOptions {
  /** 产品侧模型 ID（doubao / gpt54 / claude46 / forge / apollo） */
  modelId: LLMModelId;
  /** 对话消息列表 */
  messages: LLMMessage[];
  /** 最大输出 token 数。默认 doubao/gpt54/claude46=2048，forge=32768，apollo=65536 */
  maxTokens?: number;
  /** 温度。默认 0.7。forge/apollo 默认不传（用模型默认） */
  temperature?: number;
  /** 请求超时毫秒，默认 60000 */
  timeoutMs?: number;
  /** 结构化输出：text | json_object | json_schema */
  responseFormat?: LLMResponseFormat;
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

export interface StreamLLMOptions extends Omit<LLMCallOptions, "responseFormat"> {
  /** 每个 delta chunk 的回调（可选，用于日志） */
  onChunk?: (chunk: string) => void;
}

/* ─────────────────────────────────────────────
   模型路由配置
───────────────────────────────────────────── */

interface ModelRoute {
  /** 实际传给 API 的 model 参数 */
  apiModel: string;
  /** API 端点 base URL（不含 /chat/completions 后缀） */
  baseUrl: string;
  /** chat 接口路径（doubao/third-party 用 "/chat/completions"，forge 用 "/v1/chat/completions"） */
  apiPath: string;
  /** Authorization Bearer token */
  apiKey: string;
}

function getModelRoute(modelId: LLMModelId): ModelRoute {
  const arkKey = process.env.ARK_API_KEY ?? "";
  const arkEndpoint = process.env.ARK_DOUBAO_ENDPOINT_ID ?? "";
  const arkBase = (process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");

  const thirdKey = ENV.thirdPartyLlmApiKey;
  const thirdBaseRaw = ENV.thirdPartyLlmBaseUrl || "https://api.ablai.top/v1";
  // 第三方 base URL 末尾去掉 /，如果用户填到具体 endpoint 也兼容
  const thirdBase = thirdBaseRaw.replace(/\/$/, "");

  const forgeKey = ENV.forgeApiKey;
  const forgeBase = (ENV.forgeApiUrl || "https://forge.manus.im").replace(/\/$/, "");

  switch (modelId) {
    case "doubao":
      return { apiModel: arkEndpoint, baseUrl: arkBase, apiPath: "/chat/completions", apiKey: arkKey };
    case "gpt54":
      // modelId 名沿用 "gpt54",实际 apiModel 升级到 gpt-5.5(2026-04-30)
      return { apiModel: "gpt-5.5", baseUrl: thirdBase, apiPath: "/chat/completions", apiKey: thirdKey };
    case "claude46":
      // modelId 名沿用 "claude46",实际 apiModel 升级到 claude-opus-4-7(2026-04-30)
      return { apiModel: "claude-opus-4-7", baseUrl: thirdBase, apiPath: "/chat/completions", apiKey: thirdKey };
    case "forge":
      return { apiModel: "gemini-2.5-flash", baseUrl: forgeBase, apiPath: "/v1/chat/completions", apiKey: forgeKey };
    case "apollo":
      // 2026-04-30: 通用 thirdKey 走的「文本通道」上游饱和（实测 gemini-3.x 在该通道 0/3）。
      // 现切到「视频理解专用分组 key」（独立分组、不与文本争容量），实测 gemini-3.1 单次 100% 成功 + 输出更尖锐。
      return { apiModel: "gemini-3.1-pro-preview", baseUrl: thirdBase, apiPath: "/chat/completions",
               apiKey: ENV.thirdPartyLlmVideoApiKey || thirdKey };
    default: {
      log.warn(`Unknown modelId "${String(modelId)}", falling back to doubao`);
      return { apiModel: arkEndpoint, baseUrl: arkBase, apiPath: "/chat/completions", apiKey: arkKey };
    }
  }
}

/** 返回实际 API model 参数（供外部展示或日志） */
export function resolveModelName(modelId: LLMModelId): string {
  return getModelRoute(modelId).apiModel;
}

/* ─────────────────────────────────────────────
   积分倍率（仅 doubao/gpt54/claude46，forge/apollo 走免费路径）
───────────────────────────────────────────── */

const MODEL_MULTIPLIER: Record<LLMModelId, number> = {
  doubao: 1,
  gpt54: 1.5,
  claude46: 2,
  forge: 0,
  apollo: 0,
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
   实际成本估算（USD per million tokens）
   ⚠️ 这是粗估,签合同 / 控成本需用账单核对
───────────────────────────────────────────── */

interface ModelPricing {
  /** 输入 token 单价 (USD per 1M tokens) */
  inputPerM: number;
  /** 输出 token 单价 (USD per 1M tokens) */
  outputPerM: number;
}

/**
 * 模型价格表(每百万 token,USD)。
 * 来源:各供应商 2026-04 公开定价的粗估,非合同价。
 * **改这张表前先核对真实账单**,数字偏离 50%+ 时单位经济模型会错。
 */
const MODEL_PRICE: Record<LLMModelId, ModelPricing> = {
  doubao: { inputPerM: 0.07, outputPerM: 0.21 }, // 豆包 1.5 pro,人民币换算 ~7:1
  gpt54: { inputPerM: 5.0, outputPerM: 15.0 }, // 第三方代理 GPT-5.4,~ GPT-4 Turbo 价
  claude46: { inputPerM: 15.0, outputPerM: 75.0 }, // 第三方代理 Claude Opus 4.6
  forge: { inputPerM: 0, outputPerM: 0 }, // 内部免费
  apollo: { inputPerM: 0, outputPerM: 0 }, // 内部免费
};

/**
 * 计算单次调用的真实成本(USD)。
 * 已知 token 数时调用,用于打点 / 月度成本汇总。
 */
export function calculateCostUsd(
  modelId: LLMModelId,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = MODEL_PRICE[modelId] ?? MODEL_PRICE.doubao;
  const inputCost = (promptTokens / 1_000_000) * price.inputPerM;
  const outputCost = (completionTokens / 1_000_000) * price.outputPerM;
  return Number((inputCost + outputCost).toFixed(6));
}

/* ─────────────────────────────────────────────
   归一化器（消息、内容、ResponseFormat）
───────────────────────────────────────────── */

const ensureArray = (value: LLMContent): LLMContentPart[] => {
  if (typeof value === "string") return [{ type: "text", text: value }];
  return value;
};

function normalizeMessage(message: LLMMessage) {
  const parts = ensureArray(message.content);
  // 单一文本内容收敛为字符串（多数模型对 string content 兼容更好）
  if (parts.length === 1 && parts[0].type === "text") {
    return { role: message.role, content: parts[0].text };
  }
  return { role: message.role, content: parts };
}

function normalizeResponseFormat(rf: LLMResponseFormat | undefined): LLMResponseFormat | undefined {
  if (!rf) return undefined;
  if (rf.type === "json_schema" && !rf.json_schema?.schema) {
    throw new Error("responseFormat json_schema requires a defined schema object");
  }
  return rf;
}

/* ─────────────────────────────────────────────
   非流式调用
───────────────────────────────────────────── */

/**
 * 非流式 LLM 调用，返回完整文本。
 * 内置超时、错误重试和降级日志。apollo 模型用更激进的退避（5xx/429 时 3 次重试）。
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  const { modelId, messages, temperature, timeoutMs = 60_000, responseFormat } = options;
  const route = getModelRoute(modelId);
  const url = `${route.baseUrl}${route.apiPath}`;

  // 默认 maxTokens 因模型而异
  const defaultMaxTokens =
    modelId === "forge" ? 32768 : modelId === "apollo" ? 65536 : 2048;
  const maxTokens = options.maxTokens ?? defaultMaxTokens;

  // forge/apollo 默认不传 temperature（保留原 _core/llm.ts 行为）
  const shouldSendTemperature =
    modelId !== "forge" && modelId !== "apollo";
  const effectiveTemp = temperature ?? 0.7;

  const isArk = modelId === "doubao";
  const isForge = modelId === "forge";

  const body: Record<string, unknown> = {
    model: route.apiModel,
    messages: messages.map(normalizeMessage),
    max_tokens: maxTokens,
    stream: false,
  };
  if (shouldSendTemperature) body.temperature = effectiveTemp;
  if (isArk) body.thinking = { type: "disabled" };
  if (isForge) body.thinking = { budget_tokens: 128 };

  const normalizedRf = normalizeResponseFormat(responseFormat);
  if (normalizedRf) body.response_format = normalizedRf;

  // apollo 用 [2000, 6000] 退避，3 次（视频专用分组 key 实测单次 100% 成功，激进 retry 已无必要）；其它用 [1000] 退避，2 次
  const retryDelays = modelId === "apollo" ? [2000, 6000] : [1000];
  const maxAttempts = retryDelays.length + 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${route.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        const isTransient = resp.status === 429 || resp.status >= 500;
        const err = new Error(`LLM API error ${resp.status}: ${errText}`);
        // 打点:失败也要记录,否则错误率算不出
        log.warn(
          {
            event: "llm_call",
            modelId,
            apiModel: route.apiModel,
            attempt,
            httpStatus: resp.status,
            latencyMs: Date.now() - t0,
            success: false,
            transient: isTransient,
          },
          `${modelId} HTTP ${resp.status}`,
        );
        if (isTransient && attempt < maxAttempts) {
          lastError = err;
          await sleep(retryDelays[attempt - 1]);
          continue;
        }
        throw err;
      }

      const data = (await resp.json()) as {
        choices: { message: { content: string | LLMContentPart[] } }[];
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const rawContent = data.choices?.[0]?.message?.content ?? "";
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;
      const latencyMs = Date.now() - t0;
      const costUsd = calculateCostUsd(modelId, promptTokens, completionTokens);

      // 打点:成功调用——pino 结构化日志,字段可被聚合工具(grafana/loki/...)
      // 解析。每条日志包含一次调用的完整事实:成本、token、延时、重试次数。
      log.info(
        {
          event: "llm_call",
          modelId,
          apiModel: route.apiModel,
          attempt,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd,
          latencyMs,
          success: true,
        },
        `${modelId} OK ${latencyMs}ms tokens=${promptTokens}+${completionTokens} $${costUsd}`,
      );

      return {
        content,
        model: data.model ?? route.apiModel,
        promptTokens,
        completionTokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(
        {
          event: "llm_call",
          modelId,
          apiModel: route.apiModel,
          attempt,
          latencyMs: Date.now() - t0,
          success: false,
          err: lastError.message,
        },
        `${modelId} attempt ${attempt} failed`,
      );
      if (attempt < maxAttempts) {
        await sleep(retryDelays[attempt - 1]);
      }
    }
  }

  // 终极降级:用 doubao 兜底(forge 已弃用,P0-A 改;doubao 不支持 response_format 所以兜底时丢弃)
  // 2026-04-30: apollo 不降级到 doubao —— apollo 的语义是"视频理解"，doubao 不支持 mp4 当 image_url
  //   (实测返回 InvalidParameter.UnsupportedImageFormat 必败)。让上层捕获 apollo 失败并友好提示用户重试。
  if (modelId !== "doubao" && modelId !== "apollo") {
    log.warn(`callLLM all attempts failed for ${modelId}, falling back to doubao`);
    try {
      return await callLLM({
        modelId: "doubao",
        messages,
        maxTokens: options.maxTokens,
        timeoutMs,
        // 注意:不传 responseFormat,因为 doubao 不支持;调用方应预期兜底场景下需自行 stripJsonFences 解析
      });
    } catch (fallbackErr) {
      log.error(
        { err: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) },
        `doubao fallback also failed`,
      );
    }
  }

  throw lastError ?? new Error(`[LLM] callLLM failed for ${modelId}`);
}

/* ─────────────────────────────────────────────
   流式调用 — AsyncGenerator
───────────────────────────────────────────── */

/**
 * 流式 LLM 调用，返回 AsyncGenerator<string>。
 * 每次 yield 一个 delta 文本片段。
 */
export async function* streamLLM(options: StreamLLMOptions): AsyncGenerator<string> {
  const { modelId, messages, temperature, timeoutMs = 90_000, onChunk } = options;
  const route = getModelRoute(modelId);
  const url = `${route.baseUrl}${route.apiPath}`;

  const defaultMaxTokens =
    modelId === "forge" ? 32768 : modelId === "apollo" ? 65536 : 2048;
  const maxTokens = options.maxTokens ?? defaultMaxTokens;

  const shouldSendTemperature = modelId !== "forge" && modelId !== "apollo";
  const isArk = modelId === "doubao";
  const isForge = modelId === "forge";

  const body: Record<string, unknown> = {
    model: route.apiModel,
    messages: messages.map(normalizeMessage),
    max_tokens: maxTokens,
    stream: true,
  };
  if (shouldSendTemperature) body.temperature = temperature ?? 0.7;
  if (isArk) body.thinking = { type: "disabled" };
  if (isForge) body.thinking = { budget_tokens: 128 };

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
      body: JSON.stringify(body),
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

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

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
 *   data: {"model":"...","completionChars":0,"chargedCost":0,"transactionId":"..."}
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
    log.warn({ err: message }, `streamLLMToSSE stream failed for ${options.modelId}, falling back to doubao non-stream(forge 已弃用)`);

    try {
      const fallback = await callLLM({
        modelId: "doubao",
        messages: options.messages,
        maxTokens: options.maxTokens ?? 4096,
      });
      const text = fallback.content;
      if (text) {
        writeSSE(response, "delta", { text });
        totalCompletion = text.length;
      }
      writeSSE(response, "done", {
        model: fallback.model,
        completionChars: totalCompletion,
        chargedCost: billingMeta?.chargedCost ?? 0,
        transactionId: billingMeta?.transactionId ?? "free",
      });
      log.info(`Fallback forge succeeded — chars:${totalCompletion}`);
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      log.error({ err: fallbackMessage }, `forge fallback also failed`);
      writeSSE(response, "error", { message: `生成失败，请稍后重试。(${fallbackMessage.slice(0, 60)})` });
    }
  } finally {
    response.end();
  }
}

/* ─────────────────────────────────────────────
   工具函数
───────────────────────────────────────────── */

function writeSSE(response: ServerResponse, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  response.write(payload);
}

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
 * 快速检查三个面向用户的模型连通性（max_tokens=1，仅用于健康检查）。
 * forge/apollo 不在这个 dashboard 里，因为它们是内部 fallback / 特殊用途。
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
