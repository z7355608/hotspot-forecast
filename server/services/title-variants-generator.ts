/**
 * title-variants-generator.ts — 可复用标题变体 LLM 生成 + 服务端缓存
 *
 * 用途：HotTopicRecommendationsPage 的 featured 卡片在「同赛道高分样本」不足时，
 * 基于原标题 + metadata 调 doubao 生成 4 个标题变体，按 featured.id 缓存 7 天。
 *
 * 容错：缓存读写失败、LLM 失败都不抛错，返回空数组让前端走兜底文案。
 * 与主流程关系：完全旁路，不在 runLivePrediction 调用链上，不增加主流程 LLM 预算。
 * 详见 docs/llm-budget.md「旁路调用」一节、docs/prompts.md `title-variants.generate`。
 */

import { callLLM } from "../legacy/llm-gateway";
import { query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

const TITLE_VARIANTS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天，与 viral_breakdown_cache 一致
const MODEL_ID = "doubao" as const;

export interface TitleVariant {
  title: string;
  style: string;
}

export interface TitleVariantsContext {
  platform?: string;
  seedTopic?: string | null;
  trackTags?: string[];
  burstReasons?: string[];
  viralScore?: number;
}

export interface TitleVariantsResult {
  variants: TitleVariant[];
  cached: boolean;
}

interface CachedPayload {
  variants: TitleVariant[];
  originalTitle: string;
  modelId: string;
}

async function readCache(cacheKey: string): Promise<TitleVariant[] | null> {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT payload
       FROM title_variants_cache
       WHERE cache_key = ?
         AND created_at + INTERVAL ttl_seconds SECOND > NOW()
       LIMIT 1`,
      [cacheKey],
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (!row?.payload) return null;
    const parsed = (typeof row.payload === "string"
      ? JSON.parse(row.payload)
      : row.payload) as CachedPayload;
    return Array.isArray(parsed?.variants) ? parsed.variants : null;
  } catch (err) {
    console.warn("[titleVariants] cache read failed, falling through:", err);
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  platform: string | undefined,
  payload: CachedPayload,
): Promise<void> {
  try {
    await query(
      `INSERT INTO title_variants_cache
         (cache_key, platform, payload, ttl_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         payload = VALUES(payload),
         ttl_seconds = VALUES(ttl_seconds),
         updated_at = NOW()`,
      [
        cacheKey,
        platform ?? null,
        JSON.stringify(payload),
        TITLE_VARIANTS_TTL_SECONDS,
      ],
    );
  } catch (err) {
    console.warn("[titleVariants] cache write failed (non-fatal):", err);
  }
}

function buildUserPrompt(
  originalTitle: string,
  ctx: TitleVariantsContext,
): string {
  const lines: string[] = [`原标题：${originalTitle}`];
  if (ctx.platform) lines.push(`平台：${ctx.platform}`);
  if (ctx.seedTopic) lines.push(`赛道：${ctx.seedTopic}`);
  if (ctx.trackTags?.length) {
    lines.push(`标签：${ctx.trackTags.slice(0, 5).join(" / ")}`);
  }
  if (typeof ctx.viralScore === "number") {
    lines.push(`爆款分：${ctx.viralScore}`);
  }
  if (ctx.burstReasons?.length) {
    lines.push(`爆发原因：${ctx.burstReasons.slice(0, 3).join("；")}`);
  }
  lines.push(
    "",
    "请基于上面信息，给出 4 个不同风格的标题变体。要求：",
    "- 不要照抄原标题；保留赛道关键词，但角度换新",
    "- 风格至少覆盖 2 种：数字 hook、反问/反差、情绪共鸣、数据点证",
    "- 每条 8–22 字，不堆砌 emoji；不带平台话题（# 号）",
    "- style 字段用 4 字以内中文标签（如「数字 hook」「反差」「共鸣」「点证」）",
    "",
    "严格按以下 JSON 格式输出，不要任何额外文本/Markdown：",
    '{"variants":[{"title":"...","style":"..."},{"title":"...","style":"..."},{"title":"...","style":"..."},{"title":"...","style":"..."}]}',
  );
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "你是短视频标题改写专家。基于一条爆款视频的原标题与元信息，产出几条可复用的标题变体，每条配一个风格标签。只输出 JSON 对象，不要任何前言/后语/Markdown 围栏。";

export async function generateTitleVariants(
  featuredId: string,
  originalTitle: string,
  ctx: TitleVariantsContext,
): Promise<TitleVariantsResult> {
  const cleanedTitle = originalTitle.trim();
  if (!featuredId || cleanedTitle.length < 2) {
    return { variants: [], cached: false };
  }

  const cached = await readCache(featuredId);
  if (cached && cached.length > 0) {
    return { variants: cached, cached: true };
  }

  let variants: TitleVariant[] = [];
  try {
    const response = await callLLM({
      modelId: MODEL_ID,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(cleanedTitle, ctx) },
      ],
      maxTokens: 600,
      temperature: 0.7,
      timeoutMs: 8000,
      // doubao endpoint 不支持 json_schema，只接受 json_object；
      // schema 已在 user prompt 末尾以示例形式写明。
      responseFormat: { type: "json_object" },
    });
    const parsed = JSON.parse(response.content) as { variants?: TitleVariant[] };
    variants = (parsed.variants ?? [])
      .filter((v) => v && typeof v.title === "string" && v.title.trim().length >= 4)
      .slice(0, 6)
      .map((v) => ({
        title: v.title.trim(),
        style: (v.style ?? "").trim() || "改写",
      }));
  } catch (err) {
    console.warn("[titleVariants] LLM call failed (non-fatal):", err);
    return { variants: [], cached: false };
  }

  if (variants.length > 0) {
    await writeCache(featuredId, ctx.platform, {
      variants,
      originalTitle: cleanedTitle,
      modelId: MODEL_ID,
    });
  }

  return { variants, cached: false };
}
