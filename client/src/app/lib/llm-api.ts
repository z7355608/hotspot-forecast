/**
 * LLM API 客户端 — 前端调用统一 LLM 网关
 * ═══════════════════════════════════════════════════════════════
 * 提供两种调用方式：
 *   1. chatLLM()   — 非流式，返回完整文本（Promise）
 *   2. streamLLM() — 流式 SSE，通过回调逐步接收文本
 *
 * 所有调用均通过同源 /api/llm/* 路由转发到 Node 后端网关。
 * ═══════════════════════════════════════════════════════════════
 */

import type { AIModelId } from "../store/app-data-core";
import { apiFetch } from "./api-utils";

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  /** 产品侧模型 ID */
  modelId?: AIModelId;
  /** 对话消息列表 */
  messages: LLMMessage[];
  /** 基础积分消耗（不含倍率，0 表示免费） */
  baseCost?: number;
  /** 任务描述（用于流水记录） */
  taskLabel?: string;
  /** 用户 ID（用于积分扣减，未登录时可省略） */
  userId?: string;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
}

export interface LLMChatResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  chargedCost: number;
  transactionId: string;
}

export interface LLMStreamCallbacks {
  /** 每收到一个文本片段时触发 */
  onDelta: (text: string) => void;
  /** 流式输出完成时触发 */
  onDone: (meta: { model: string; chargedCost: number; transactionId: string }) => void;
  /** 发生错误时触发 */
  onError: (message: string) => void;
}

export interface GatewayHealth {
  doubao: "ok" | "error";
  gpt54: "ok" | "error";
  claude46: "ok" | "error";
  checkedAt: string;
}

/* ─────────────────────────────────────────────
   非流式调用
───────────────────────────────────────────── */

/**
 * 非流式 LLM 调用，等待完整响应后返回。
 * 适合短文本生成或需要完整结果再渲染的场景。
 */
export async function chatLLM(options: LLMChatOptions): Promise<LLMChatResult> {
  const resp = await apiFetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: options.modelId ?? "doubao",
      messages: options.messages,
      baseCost: options.baseCost ?? 0,
      taskLabel: options.taskLabel ?? "LLM调用",
      userId: options.userId,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    }),
  });

  const data = (await resp.json()) as LLMChatResult & { error?: string };

  if (!resp.ok) {
    throw new Error(data.error ?? `LLM 调用失败 (HTTP ${resp.status})`);
  }

  return data;
}

/* ─────────────────────────────────────────────
   流式调用（SSE）
───────────────────────────────────────────── */

/**
 * 流式 LLM 调用，通过 SSE 逐步接收文本片段。
 * 适合长文本生成、需要实时展示打字机效果的场景。
 *
 * 返回一个 AbortController，可调用 .abort() 中断流式输出。
 *
 * 用法示例：
 * ```ts
 * const abort = streamLLM(
 *   { messages: [...], modelId: "gpt54", baseCost: 20 },
 *   {
 *     onDelta: (text) => setContent(prev => prev + text),
 *     onDone: ({ chargedCost }) => console.log("消耗积分:", chargedCost),
 *     onError: (msg) => console.error(msg),
 *   }
 * );
 * // 中断：abort.abort();
 * ```
 */
export function streamLLM(
  options: LLMChatOptions,
  callbacks: LLMStreamCallbacks,
): AbortController {
  const controller = new AbortController();

  void (async () => {
    let resp: Response;
    try {
      resp = await apiFetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: options.modelId ?? "doubao",
          messages: options.messages,
          baseCost: options.baseCost ?? 0,
          taskLabel: options.taskLabel ?? "LLM流式调用",
          userId: options.userId,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      callbacks.onError((err as Error)?.message ?? "网络请求失败");
      return;
    }

    if (!resp.ok) {
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      callbacks.onError(data.error ?? `请求失败 (HTTP ${resp.status})`);
      return;
    }

    if (!resp.body) {
      callbacks.onError("响应体为空");
      return;
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
          if (!trimmed) continue;

          // 解析 SSE 事件名
          if (trimmed.startsWith("event: ")) continue; // 事件名在下一行 data 中隐含

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr) as {
                text?: string;
                model?: string;
                chargedCost?: number;
                transactionId?: string;
                completionChars?: number;
                message?: string;
              };

              // delta 事件
              if (parsed.text !== undefined) {
                callbacks.onDelta(parsed.text);
              }
              // done 事件（包含 model 字段）
              else if (parsed.model !== undefined) {
                callbacks.onDone({
                  model: parsed.model,
                  chargedCost: parsed.chargedCost ?? 0,
                  transactionId: parsed.transactionId ?? "free",
                });
              }
              // error 事件
              else if (parsed.message !== undefined) {
                callbacks.onError(parsed.message);
              }
            } catch {
              // 忽略无法解析的行
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      callbacks.onError((err as Error)?.message ?? "流式读取失败");
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}

/* ─────────────────────────────────────────────
   网关健康检查
───────────────────────────────────────────── */

export async function checkLLMGatewayHealth(): Promise<GatewayHealth> {
  const resp = await apiFetch("/api/llm/health");
  if (!resp.ok) throw new Error("健康检查请求失败");
  return resp.json() as Promise<GatewayHealth>;
}

/* ─────────────────────────────────────────────
   查询用户积分
───────────────────────────────────────────── */

export async function fetchUserCredits(userId: string): Promise<{
  credits: number;
  membershipPlan: string;
}> {
  const resp = await apiFetch(`/api/llm/credits?userId=${encodeURIComponent(userId)}`);
  if (!resp.ok) throw new Error("积分查询失败");
  return resp.json() as Promise<{ credits: number; membershipPlan: string }>;
}

/* ─────────────────────────────────────────────
   原始 SSE 流式调用（任意 URL + body）
   用于 CozeEditorDrawer 等需要向非 /api/llm/stream
   端点发起流式请求的场景。
───────────────────────────────────────────── */
/**
 * 向任意后端 SSE 端点发起流式请求，通过回调逐步接收文本片段。
 * 返回 AbortController，可调用 .abort() 中断。
 */
export function streamLLMRaw(
  url: string,
  body: Record<string, unknown>,
  callbacks: {
    onDelta: (text: string) => void;
    onDone: () => void;
    onError: (message: string) => void;
  },
): AbortController {
  const controller = new AbortController();
  void (async () => {
    let resp: Response;
    try {
      resp = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      callbacks.onError((err as Error)?.message ?? "网络请求失败");
      return;
    }
    if (!resp.ok) {
      callbacks.onError(`请求失败 (HTTP ${resp.status})`);
      return;
    }
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            // 解析 SSE event 类型
            if (trimmed.startsWith("event: ")) {
              currentEvent = trimmed.slice(7).trim();
              continue;
            }
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6).trim();
              if (data === "[DONE]") { callbacks.onDone(); return; }
              // 处理 error 事件
              if (currentEvent === "error") {
                try {
                  const parsed = JSON.parse(data) as { message?: string };
                  callbacks.onError(parsed.message ?? "生成失败");
                } catch {
                  callbacks.onError("生成失败");
                }
                return;
              }
              // 处理 done 事件
              if (currentEvent === "done") {
                callbacks.onDone();
                return;
              }
              // 处理 delta / 普通数据事件
              try {
                const parsed = JSON.parse(data) as { delta?: string; text?: string; content?: string };
                const text = parsed.delta ?? parsed.text ?? parsed.content ?? "";
                if (text) callbacks.onDelta(text);
              } catch { /* ignore */ }
              currentEvent = ""; // 重置事件类型
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      callbacks.onDone();
    } else {
      const data = await resp.json() as { content?: string; markdown?: string; error?: string };
      if (data.error) { callbacks.onError(data.error); return; }
      const text = data.content ?? data.markdown ?? JSON.stringify(data);
      callbacks.onDelta(text);
      callbacks.onDone();
    }
  })();
  return controller;
}
