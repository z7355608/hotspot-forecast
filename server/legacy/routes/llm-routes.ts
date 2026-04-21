/**
 * llm-routes.ts
 * ═══════════════════════════════════════════════════════════════
 * LLM 网关与积分路由处理函数
 * 负责：LLM 健康检查、积分查询、非流式 LLM 调用、流式 LLM 调用（SSE）
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "../http-server-utils.js";
import { streamLLMToSSE, callLLM, checkGatewayHealth, type LLMMessage } from "../llm-gateway.js";
import { chargeLLMCredits, refundCredits, getUserCredits } from "../credits.js";
import type { AIModelId } from "../../../client/src/app/store/app-data-core.js";

/** GET /api/llm/health — 检查三个模型连通性 */
export async function handleLLMHealth(response: ServerResponse) {
  const health = await checkGatewayHealth();
  sendJson(response, 200, health);
}

/** GET /api/llm/credits?userId=xxx — 查询用户积分 */
export async function handleGetCredits(url: URL, response: ServerResponse) {
  const userId = url.searchParams.get("userId");
  if (!userId) {
    sendJson(response, 400, { error: "userId 参数必填" });
    return;
  }
  const info = await getUserCredits(userId);
  if (!info) {
    sendJson(response, 404, { error: "用户不存在" });
    return;
  }
  sendJson(response, 200, info);
}

/**
 * POST /api/llm/chat — 非流式 LLM 调用
 *
 * Request body:
 * {
 *   userId: string,          // 用户 ID（用于积分扣减）
 *   modelId: AIModelId,      // doubao | gpt54 | claude46
 *   messages: LLMMessage[],  // 对话消息列表
 *   baseCost: number,        // 基础积分消耗（不含倍率）
 *   taskLabel: string,       // 任务描述（用于流水记录）
 *   maxTokens?: number,
 *   temperature?: number
 * }
 */
export async function handleLLMChat(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody<{
    userId?: string;
    modelId?: AIModelId;
    messages?: LLMMessage[];
    baseCost?: number;
    taskLabel?: string;
    maxTokens?: number;
    temperature?: number;
  }>(request);

  const {
    userId,
    modelId = "doubao",
    messages,
    baseCost = 0,
    taskLabel = "LLM调用",
    maxTokens,
    temperature,
  } = body;

  if (!messages || messages.length === 0) {
    sendJson(response, 400, { error: "messages 不能为空" });
    return;
  }

  // 积分扣减（如果提供了 userId）
  let txId = "free";
  let chargedCost = 0;
  if (userId && baseCost > 0) {
    const charge = await chargeLLMCredits(userId, modelId, baseCost, taskLabel);
    if (!charge.success) {
      sendJson(response, 402, { error: charge.reason ?? "积分不足" });
      return;
    }
    txId = charge.transactionId;
    chargedCost = charge.chargedCost;
  }

  try {
    const result = await callLLM({ modelId, messages, maxTokens, temperature });
    sendJson(response, 200, {
      content: result.content,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      chargedCost,
      transactionId: txId,
    });
  } catch (err) {
    // 调用失败时退还积分
    if (userId && txId !== "free" && chargedCost > 0) {
      await refundCredits(userId, chargedCost, "调用失败自动退款", txId);
    }
    const message = err instanceof Error ? err.message : "未知错误";
    sendJson(response, 500, { error: message });
  }
}

/**
 * POST /api/llm/stream — 流式 LLM 调用（SSE）
 *
 * Request body 与 /api/llm/chat 相同。
 * 响应为 SSE 流，事件格式：
 *   event: delta   data: {"text":"..."}
 *   event: done    data: {"model":"...","chargedCost":20}
 *   event: error   data: {"message":"..."}
 */
export async function handleLLMStream(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody<{
    userId?: string;
    modelId?: AIModelId;
    messages?: LLMMessage[];
    baseCost?: number;
    taskLabel?: string;
    maxTokens?: number;
    temperature?: number;
  }>(request);

  const {
    userId,
    modelId = "doubao",
    messages,
    baseCost = 0,
    taskLabel = "LLM流式调用",
    maxTokens,
    temperature,
  } = body;

  if (!messages || messages.length === 0) {
    sendJson(response, 400, { error: "messages 不能为空" });
    return;
  }

  // 积分扣减（如果提供了 userId）
  let txId = "free";
  let chargedCost = 0;
  if (userId && baseCost > 0) {
    const charge = await chargeLLMCredits(userId, modelId, baseCost, taskLabel);
    if (!charge.success) {
      // SSE 头还未发送，可以直接返回 JSON 错误
      sendJson(response, 402, { error: charge.reason ?? "积分不足" });
      return;
    }
    txId = charge.transactionId;
    chargedCost = charge.chargedCost;
  }

  // 将 chargedCost 和 txId 通过 done 事件返回给前端
  try {
    await streamLLMToSSE(
      { modelId, messages, maxTokens, temperature },
      response,
      { chargedCost, transactionId: txId },
    );
  } catch (err) {
    // 流式已开始时异常处理：退款积分
    if (userId && txId !== "free" && chargedCost > 0) {
      await refundCredits(userId, chargedCost, "流式调用失败自动退款", txId);
    }
  }
}
