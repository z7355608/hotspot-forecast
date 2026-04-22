/**
 * semantic-filter.ts
 * ═══════════════════════════════════════════════════════════════
 * LLM 语义相关性过滤器
 *
 * 功能：
 * 1. 对搜索返回的内容列表做语义相关性打分，剔除与赛道无关的噪音
 * 2. 对评论高频词做语义过滤，只保留与赛道相关的关键词
 * 3. 使用 invokeLLM + json_schema 确保输出结构化
 *
 * 设计原则：
 * - 批量处理：一次 LLM 调用处理所有候选项，降低延迟和成本
 * - 严格阈值：只保留相关性得分 ≥ 7 的内容（满分 10）
 * - 降级策略：LLM 失败时使用关键词匹配降级
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";
import { invokeLLM } from "../_core/llm";

const log = createModuleLogger("SemanticFilter");

// ── 类型定义 ──

export interface ContentCandidate {
  id: string;
  title: string;
  authorName?: string;
  tags?: string[];
}

export interface ContentRelevanceResult {
  id: string;
  relevanceScore: number; // 0-10
  reason: string;
}

export interface KeywordRelevanceResult {
  keyword: string;
  isRelevant: boolean;
  reason: string;
}

// ── JSON Schema 定义 ──

const CONTENT_RELEVANCE_SCHEMA = {
  name: "content_relevance_scoring",
  strict: true,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "每条内容的相关性评分结果",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "内容的唯一ID",
            },
            relevanceScore: {
              type: "number",
              description: "与目标赛道的语义相关性得分，0-10分。0=完全无关，5=边缘相关，7=高度相关，10=完全匹配",
            },
            reason: {
              type: "string",
              description: "判断理由，20字以内",
            },
          },
          required: ["id", "relevanceScore", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

const KEYWORD_RELEVANCE_SCHEMA = {
  name: "keyword_relevance_filtering",
  strict: true,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "每个关键词的相关性判断结果",
        items: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "待判断的关键词",
            },
            isRelevant: {
              type: "boolean",
              description: "是否与目标赛道语义相关",
            },
            reason: {
              type: "string",
              description: "判断理由，15字以内",
            },
          },
          required: ["keyword", "isRelevant", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
};

// ── 内容语义过滤 ──

/**
 * 对内容列表执行 LLM 语义相关性过滤。
 *
 * @param candidates - 候选内容列表
 * @param seedTopic - 用户输入的赛道关键词（如"健身减脂"）
 * @param threshold - 相关性得分阈值，默认 7（满分 10）
 * @returns 过滤后的内容 ID 集合 + 每条内容的得分
 */
export async function filterContentsByRelevance(
  candidates: ContentCandidate[],
  seedTopic: string,
  threshold = 7,
): Promise<{ passedIds: Set<string>; scores: ContentRelevanceResult[] }> {
  if (candidates.length === 0) {
    return { passedIds: new Set(), scores: [] };
  }

  // 构建候选列表摘要
  const candidateList = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    author: c.authorName ?? "",
    tags: (c.tags ?? []).slice(0, 5).join(", "),
  }));

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是内容相关性评估专家。你的任务是判断每条社交媒体内容是否与目标赛道「${seedTopic}」在语义上高度相关。

评分标准：
- 10分：内容完全属于「${seedTopic}」赛道，标题/标签直接涉及该领域核心话题
- 7-9分：内容高度相关，属于「${seedTopic}」的子话题或密切关联话题
- 4-6分：内容边缘相关，可能涉及「${seedTopic}」但不是核心内容
- 1-3分：内容与「${seedTopic}」关系很弱，只是偶然包含相关词汇
- 0分：内容与「${seedTopic}」完全无关

严格要求：
1. 只根据标题、作者名、标签来判断，不要猜测
2. 标题中包含赛道关键词但实际内容明显不相关的（如"安全驾驶"出现在"健身减脂"搜索中），必须给低分
3. 泛娱乐、泛生活内容如果不直接涉及目标赛道，不能给高分
4. 宁可漏掉边缘内容，也不要放过噪音`,
        },
        {
          role: "user",
          content: `目标赛道：「${seedTopic}」\n\n请对以下 ${candidateList.length} 条内容逐一评分：\n${JSON.stringify(candidateList, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: CONTENT_RELEVANCE_SCHEMA,
      },
      max_tokens: 4096,
    });

    const rawContent = result.choices?.[0]?.message?.content ?? "";
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(contentStr) as { results: ContentRelevanceResult[] };

    if (!Array.isArray(parsed.results)) {
      log.warn("LLM 语义过滤返回格式异常，降级到关键词匹配");
      return fallbackKeywordFilter(candidates, seedTopic, threshold);
    }

    const scores = parsed.results;
    const passedIds = new Set<string>();
    for (const item of scores) {
      if (item.relevanceScore >= threshold) {
        passedIds.add(item.id);
      }
    }

    log.info(
      `语义过滤完成: ${candidates.length} 条候选 → ${passedIds.size} 条通过 (阈值=${threshold}, 赛道="${seedTopic}")`,
    );

    // 记录被过滤掉的内容（用于调试）
    const filtered = scores.filter((s) => s.relevanceScore < threshold);
    if (filtered.length > 0) {
      log.info(
        `被过滤的内容: ${filtered.map((f) => `[${f.id.slice(0, 8)}] score=${f.relevanceScore} "${f.reason}"`).join("; ")}`,
      );
    }

    return { passedIds, scores };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`LLM 语义过滤失败: ${errMsg}，降级到关键词匹配`);
    return fallbackKeywordFilter(candidates, seedTopic, threshold);
  }
}

// ── 评论关键词语义过滤 ──

/**
 * 对评论高频关键词执行 LLM 语义过滤，剔除与赛道无关的词汇。
 *
 * @param keywords - 高频关键词列表
 * @param seedTopic - 用户输入的赛道关键词
 * @returns 过滤后的关键词列表
 */
export async function filterKeywordsByRelevance(
  keywords: string[],
  seedTopic: string,
): Promise<string[]> {
  if (keywords.length === 0) return [];

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是关键词相关性评估专家。判断每个关键词是否与目标赛道「${seedTopic}」在语义上相关。

判断标准：
- 相关：关键词直接涉及「${seedTopic}」的核心话题、子话题、常见术语、用户需求
- 不相关：关键词与「${seedTopic}」无语义关联，属于其他领域的噪音词

示例（赛道"健身减脂"）：
- "减肥" → 相关（核心话题）
- "蛋白质" → 相关（健身营养）
- "保安" → 不相关（完全无关）
- "高考" → 不相关（完全无关）
- "遥控车" → 不相关（完全无关）`,
        },
        {
          role: "user",
          content: `目标赛道：「${seedTopic}」\n\n请判断以下关键词的相关性：\n${JSON.stringify(keywords)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: KEYWORD_RELEVANCE_SCHEMA,
      },
      max_tokens: 2048,
    });

    const rawContent = result.choices?.[0]?.message?.content ?? "";
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(contentStr) as { results: KeywordRelevanceResult[] };

    if (!Array.isArray(parsed.results)) {
      log.warn("关键词过滤返回格式异常，返回原始列表");
      return keywords;
    }

    const filtered = parsed.results
      .filter((r) => r.isRelevant)
      .map((r) => r.keyword);

    log.info(
      `关键词过滤完成: ${keywords.length} 个 → ${filtered.length} 个通过 (赛道="${seedTopic}")`,
    );

    return filtered;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`关键词语义过滤失败: ${errMsg}，返回原始列表`);
    return keywords;
  }
}

// ── 降级策略：关键词匹配 ──

function fallbackKeywordFilter(
  candidates: ContentCandidate[],
  seedTopic: string,
  _threshold: number,
): { passedIds: Set<string>; scores: ContentRelevanceResult[] } {
  // 将 seedTopic 拆分为关键词
  const topicTokens = seedTopic
    .toLowerCase()
    .split(/[\s,，、/]+/)
    .filter((t) => t.length >= 2);

  const passedIds = new Set<string>();
  const scores: ContentRelevanceResult[] = [];

  for (const c of candidates) {
    const text = [c.title, ...(c.tags ?? [])].join(" ").toLowerCase();
    const matchCount = topicTokens.filter((token) => text.includes(token)).length;
    const score = topicTokens.length > 0 ? Math.round((matchCount / topicTokens.length) * 10) : 5;

    scores.push({
      id: c.id,
      relevanceScore: score,
      reason: matchCount > 0 ? `关键词匹配${matchCount}/${topicTokens.length}` : "无关键词匹配",
    });

    if (score >= 5) {
      passedIds.add(c.id);
    }
  }

  log.info(
    `降级关键词过滤: ${candidates.length} 条 → ${passedIds.size} 条通过`,
  );

  return { passedIds, scores };
}
