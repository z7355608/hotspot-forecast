/**
 * LLM-based Data Extraction — 用 LLM 从 TikHub API 返回的 JSON 中抽取结构化数据
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * 使用内置 invokeLLM (Forge API / gemini-2.5-flash) 进行结构化数据抽取。
 * 支持 json_schema response_format，强制输出符合 schema 的 JSON。
 *
 * 优势：
 *   1. 不依赖硬编码字段名，API 改版后无需修改代码
 *   2. 自动理解嵌套 JSON 语义，对数据格式变化天然容错
 *   3. 使用 json_schema response_format 强制输出结构化数据
 *   4. 通过 Forge API 调用，无需额外配置 API Key
 *
 * 降级策略：
 *   如果 LLM 抽取失败（超时、解析错误等），自动降级到 walkObjects 代码抽取
 */

import { createModuleLogger } from "./logger.js";
import { invokeLLM } from "../_core/llm";

const log = createModuleLogger("LLMExtract");

/* ── 类型定义（与 topic-strategy-engine.ts 中的 RawContentEntry / RawAccountEntry 对齐） ── */

export interface ExtractedContent {
  contentId: string;
  title: string;
  authorName: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  authorFollowerCount: number | null;
}

export interface ExtractedAccount {
  accountId: string;
  displayName: string;
  handle: string;
  followerCount: number | null;
}

interface LLMExtractionResult {
  contents: ExtractedContent[];
  accounts: ExtractedAccount[];
}

/* ── JSON Schema 定义（用于 response_format） ── */

const EXTRACTION_SCHEMA = {
  name: "social_media_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      contents: {
        type: "array",
        description: "从 API 返回数据中提取的所有视频/笔记/作品内容",
        items: {
          type: "object",
          properties: {
            contentId: {
              type: "string",
              description: "内容的唯一ID（如 aweme_id, note_id, photo_id 等），转为字符串",
            },
            title: {
              type: "string",
              description: "内容标题或描述文本（如 desc, title, content, caption 等字段）",
            },
            authorName: {
              type: "string",
              description: "作者昵称/用户名",
            },
            viewCount: {
              type: ["number", "null"],
              description: "播放量/浏览量，没有则为 null",
            },
            likeCount: {
              type: ["number", "null"],
              description: "点赞数，没有则为 null",
            },
            commentCount: {
              type: ["number", "null"],
              description: "评论数，没有则为 null",
            },
            shareCount: {
              type: ["number", "null"],
              description: "分享/转发数，没有则为 null",
            },
            collectCount: {
              type: ["number", "null"],
              description: "收藏数，没有则为 null",
            },
            authorFollowerCount: {
              type: ["number", "null"],
              description: "作者粉丝数，没有则为 null",
            },
          },
          required: [
            "contentId",
            "title",
            "authorName",
            "viewCount",
            "likeCount",
            "commentCount",
            "shareCount",
            "collectCount",
            "authorFollowerCount",
          ],
          additionalProperties: false,
        },
      },
      accounts: {
        type: "array",
        description: "从 API 返回数据中提取的所有作者/账号信息",
        items: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "账号唯一ID（如 sec_uid, uid, user_id 等），转为字符串",
            },
            displayName: {
              type: "string",
              description: "账号显示名称/昵称",
            },
            handle: {
              type: "string",
              description: "账号用户名/handle（如 unique_id, short_id 等）",
            },
            followerCount: {
              type: ["number", "null"],
              description: "粉丝数，没有则为 null",
            },
          },
          required: ["accountId", "displayName", "handle", "followerCount"],
          additionalProperties: false,
        },
      },
    },
    required: ["contents", "accounts"],
    additionalProperties: false,
  },
};

/* ── System Prompt ── */

function buildSystemPrompt(platform: string): string {
  return `你是一个专业的社交媒体数据解析助手。你的任务是从${platform}搜索 API 返回的 JSON 数据中，提取所有视频/笔记/作品的结构化信息。

规则：
1. 提取所有能找到的内容条目（视频、笔记、短视频等），不要遗漏
2. 每个内容必须有一个唯一 ID（contentId）和标题/描述（title），标题长度至少 8 个字符
3. 如果标题太短（少于 8 个字符），跳过该条目
4. 数值字段（播放量、点赞数等）如果找不到就填 null，不要猜测
5. ID 字段统一转为字符串类型
6. 同时提取作者/账号信息到 accounts 数组
7. 去重：相同 contentId 只保留一条，相同 accountId 只保留一条
8. 不要编造数据，只提取 JSON 中实际存在的信息

平台特征提示：
- 抖音(douyin): ID 字段通常是 aweme_id，标题在 desc 字段，统计在 statistics 子对象中
- 小红书(xiaohongshu): ID 字段通常是 note_id，标题在 display_title 或 title 字段
- 快手(kuaishou): ID 字段通常是 photo_id（数字类型，需转字符串），标题在 caption 字段，统计字段在顶层（like_count, view_count 等）`;
}

/* ── Payload 截断 ── */

/**
 * 将 JSON payload 截断到合理大小，避免超出 LLM token 限制。
 * gemini-2.5-flash 支持 1M context，但为了速度和成本，限制在 ~80K 字符。
 */
function truncatePayload(payload: unknown, maxChars = 80000): string {
  const full = JSON.stringify(payload);
  if (full.length <= maxChars) return full;

  // 智能截断：尝试保留顶层结构，截断最大的数组
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    const truncated: Record<string, unknown> = {};
    let currentSize = 2; // {}

    for (const [key, value] of Object.entries(record)) {
      const valueStr = JSON.stringify(value);
      if (currentSize + key.length + valueStr.length + 4 > maxChars) {
        if (Array.isArray(value)) {
          const arr: unknown[] = [];
          let arrSize = 2;
          for (const item of value) {
            const itemStr = JSON.stringify(item);
            if (arrSize + itemStr.length + 1 > maxChars - currentSize - key.length - 4) break;
            arr.push(item);
            arrSize += itemStr.length + 1;
          }
          if (arr.length > 0) {
            truncated[key] = arr;
            currentSize += key.length + JSON.stringify(arr).length + 4;
          }
        }
        break;
      }
      truncated[key] = value;
      currentSize += key.length + valueStr.length + 4;
    }
    return JSON.stringify(truncated);
  }

  return full.slice(0, maxChars);
}

/* ── 核心抽取函数 ── */

/**
 * 使用 LLM 从 TikHub API 返回的 payload 中抽取结构化数据。
 * 通过内置 invokeLLM (Forge API / gemini-2.5-flash) 调用，
 * 使用 json_schema response_format 强制输出结构化 JSON。
 *
 * @param payload - TikHub API 返回的原始 JSON 对象
 * @param platform - 平台标识 (douyin / xiaohongshu / kuaishou)
 * @returns 抽取的内容和账号数组
 */
export async function llmExtractFromPayload(
  payload: Record<string, unknown>,
  platform: string,
): Promise<LLMExtractionResult> {
  const payloadStr = truncatePayload(payload);
  log.info(`LLM extract for ${platform}: payload ${payloadStr.length} chars`);

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(platform),
        },
        {
          role: "user",
          content: `请从以下 ${platform} 搜索 API 返回的 JSON 数据中提取所有内容和账号信息：\n\n${payloadStr}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: EXTRACTION_SCHEMA,
      },
      max_tokens: 16384,
    });

    const rawContent = result.choices?.[0]?.message?.content ?? "";
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const promptTokens = result.usage?.prompt_tokens ?? 0;
    const completionTokens = result.usage?.completion_tokens ?? 0;

    log.info(`LLM extract OK — prompt:${promptTokens} completion:${completionTokens}`);

    const parsed = JSON.parse(contentStr) as LLMExtractionResult;

    // 基本校验
    if (!Array.isArray(parsed.contents)) parsed.contents = [];
    if (!Array.isArray(parsed.accounts)) parsed.accounts = [];

    // 过滤无效条目
    parsed.contents = parsed.contents.filter(
      (c) => c.contentId && c.title && c.title.length >= 8,
    );
    parsed.accounts = parsed.accounts.filter(
      (a) => a.accountId && (a.displayName || a.handle),
    );

    // 去重
    const seenContentIds = new Set<string>();
    parsed.contents = parsed.contents.filter((c) => {
      if (seenContentIds.has(c.contentId)) return false;
      seenContentIds.add(c.contentId);
      return true;
    });

    const seenAccountIds = new Set<string>();
    parsed.accounts = parsed.accounts.filter((a) => {
      if (seenAccountIds.has(a.accountId)) return false;
      seenAccountIds.add(a.accountId);
      return true;
    });

    log.info(`LLM extracted ${parsed.contents.length} contents, ${parsed.accounts.length} accounts for ${platform}`);

    return parsed;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`LLM extraction failed for ${platform}: ${errMsg}`);
    return { contents: [], accounts: [] };
  }
}
