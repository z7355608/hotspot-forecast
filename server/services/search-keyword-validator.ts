/**
 * 校验 LLM 提取的 searchKeywords 与用户原始 prompt 是否同主题，
 * 偏离度过高则回退用原始 prompt 片段作为搜索词。
 */

import { createModuleLogger } from "../legacy/logger.js";
import { callLLM } from "../legacy/llm-gateway.js";

const log = createModuleLogger("SearchKeywordValidator");

export type SearchKeywordValidation = {
  aligned: boolean;
  /** 0–1，越高表示关键词与 prompt 越一致 */
  confidence: number;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 轻量 LLM 调用：比对 prompt 与关键词主题一致性。
 * 失败时保守返回 aligned: true，避免打断主流程。
 */
export async function validateSearchKeywords(
  prompt: string,
  keywords: string[],
): Promise<SearchKeywordValidation> {
  const joined = keywords.map((k) => k.trim()).filter(Boolean).join("、");
  if (!joined || !prompt.trim()) {
    return { aligned: true, confidence: 1 };
  }

  try {
    const { content } = await callLLM({
      modelId: "doubao",
      maxTokens: 200,
      temperature: 0.2,
      timeoutMs: 12_000,
      messages: [
        {
          role: "system",
          content:
            "你是搜索词质量校验器。只输出一行 JSON：{\"aligned\":true/false,\"driftScore\":0-100}。driftScore 表示提取的关键词相对用户问题的主题偏离度，0 为完全同主题，100 为完全不同主题。不要解释。",
        },
        {
          role: "user",
          content: `用户原问题：\n${prompt.slice(0, 2000)}\n\n提取出的搜索关键词：${joined}\n\n注意：关键词只要属于用户问题主题的核心或子领域即视为对齐，不要因措辞差异（如"AI"vs"人工智能"、中英文混合）判为偏离。只在关键词明显跑题（属于完全不同的赛道）时才把 aligned 设为 false。若 driftScore>70，则 aligned 必须为 false。`,
        },
      ],
    });

    const obj = parseJsonObject(content);
    if (!obj) {
      log.warn("关键词校验 JSON 解析失败，跳过校验");
      return { aligned: true, confidence: 0.85 };
    }
    const drift =
      typeof obj.driftScore === "number" && Number.isFinite(obj.driftScore)
        ? Math.max(0, Math.min(100, obj.driftScore))
        : 0;
    const aligned = typeof obj.aligned === "boolean" ? obj.aligned : drift <= 40;
    const confidence = Math.max(0, Math.min(1, 1 - drift / 100));
    return { aligned, confidence };
  } catch (err) {
    log.warn({ err }, "validateSearchKeywords LLM 失败，默认 aligned");
    return { aligned: true, confidence: 0.8 };
  }
}
