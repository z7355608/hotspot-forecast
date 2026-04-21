import type {
  AgentRun,
  PredictionRequestDraft,
  TaskArtifact,
} from "../store/prediction-types";
import { parseApiResponse, apiFetch } from "./api-utils";

export interface LivePredictionRuntimeMeta {
  sourceMode: "live";
  executionStatus: "success" | "partial_success" | "failed";
  usedPlatforms: string[];
  usedRouteChain: string[];
  degradeFlags: string[];
  endpointHealthVersion?: string;
}

export type ContentSampleItem = {
  title: string;
  platform: string;
  likeCount?: number;
  viewCount?: number;
};
export type AccountSampleItem = {
  displayName: string;
  platform: string;
  followerCount?: number;
  tierLabel?: string;
};
export type ProgressEvent =
  | { type: "platform_start"; platform: string; platformName: string }
  | { type: "platform_done"; platform: string; platformName: string; status: "success" | "failed"; contentCount?: number; hotCount?: number; topContent?: string }
  | { type: "llm_start" }
  | { type: "llm_done" }
  | { type: "cache_hit" }
  | {
      type: "data_collected";
      contentCount: number;
      accountCount: number;
      hotCount: number;
      contentSamples: ContentSampleItem[];
      accountSamples: AccountSampleItem[];
      highlights: string[];
    };

export type LivePredictionResult = {
  run: AgentRun;
  artifact?: TaskArtifact;
  result: Record<string, unknown>;
  taskPayload?: Record<string, unknown>;
  runtimeMeta: LivePredictionRuntimeMeta;
  degradeFlags: string[];
  usedRouteChain: string[];
  endpointHealthVersion?: string;
  _fromCache?: boolean;
};

/**
 * 前端超时时间（180秒）。
 * 选题策略的 5 阶段 Pipeline 可能耗时 60-120s，
 * 设置 180s 作为兆底保护，避免前端无限等待。
 */
const LIVE_PREDICTION_TIMEOUT_MS = 180_000;

/**
 * SSE流式调用：实时接收进度事件，最后返回完整结果
 * 如果SSE失败，自动降级到普通POST请求
 */
export async function runLivePredictionStream(
  payload: PredictionRequestDraft,
  onProgress: (event: ProgressEvent) => void,
): Promise<LivePredictionResult> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("分析请求超时（已等待 3 分钟），请稍后重试。"));
    }, LIVE_PREDICTION_TIMEOUT_MS);

    // 使用fetch + ReadableStream读取SSE（EventSource不支持POST）
    const controller = new AbortController();

    fetch("/api/predictions/run-live-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`分析服务返回错误 ${response.status}: ${text}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let currentData = "";

        const processLine = (line: string): boolean => {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6).trim();
          } else if (line === "" && currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData);
              if (currentEvent === "progress") {
                onProgress(parsed as ProgressEvent);
              } else if (currentEvent === "cache_hit") {
                onProgress({ type: "cache_hit" });
              } else if (currentEvent === "done") {
                clearTimeout(timeoutId);
                resolve(parsed as LivePredictionResult);
                return true; // signal: resolved
              } else if (currentEvent === "error") {
                clearTimeout(timeoutId);
                reject(new Error(parsed.message ?? "分析失败"));
                return true; // signal: rejected
              }
            } catch {
              // 忽略解析错误
            }
            currentEvent = "";
            currentData = "";
          }
          return false; // not yet resolved
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (processLine(line)) return;
          }
        }

        // 处理 buffer 中剩余的数据（流结束时可能还有未处理的行）
        if (buffer.trim()) {
          const remaining = buffer.split("\n");
          for (const line of remaining) {
            if (processLine(line)) return;
          }
          // 如果还有未触发的 event+data 对，尝试用空行触发
          if (currentEvent && currentData) {
            if (processLine("")) return;
          }
        }

        clearTimeout(timeoutId);
        reject(new Error("SSE流意外结束"));
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          reject(new Error("分析请求超时（已等待 3 分钟），请稍后重试。"));
        } else {
          reject(err);
        }
      });
  });
}

/**
 * 普通POST调用（降级备用）
 */
export async function runLivePrediction(payload: PredictionRequestDraft) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_PREDICTION_TIMEOUT_MS);

  try {
    const response = await apiFetch("/api/predictions/run-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return parseApiResponse<LivePredictionResult>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("分析请求超时（已等待 3 分钟），请稍后重试。如果问题持续出现，请尝试缩短问题描述或减少平台选择。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchApiHealth() {
  const response = await apiFetch("/api/health");
  return parseApiResponse<{
    ok: boolean;
    services: {
      livePrediction: boolean;
      notifications: boolean;
    };
    serverTime: string;
  }>(response);
}

export async function fetchEndpointHealth() {
  const response = await apiFetch("/api/endpoint-health");
  return parseApiResponse<{
    items: Array<{
      path: string;
      method: "GET" | "POST";
      capability: string;
      httpStatus: number;
      businessCode: number | null;
      stable: boolean;
      tier: "L1" | "L2" | "L3";
      verifiedAt: string;
      failureReason?: string;
    }>;
  }>(response);
}
