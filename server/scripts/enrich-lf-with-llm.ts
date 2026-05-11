/**
 * 用 LLM（豆包）给 low_follower_samples 补 burst_reasons + suggestion
 *
 * 用法：npx tsx server/scripts/enrich-lf-with-llm.ts [limit]
 *   - limit: 处理的样本上限（默认 25），按 viral_score DESC 取
 *
 * 也会顺便把空的 track_tags 用 hashtags 兜底，让前端卡片有标签可显示。
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import { callLLM } from "../legacy/llm-gateway";

interface Row {
  id: string;
  video_title: string | null;
  viral_score: number;
  author_followers: number;
  video_views: number;
  video_likes: number;
  video_comments: number;
  video_shares: number;
  video_collects: number;
  hashtags: string | null; // JSON 数组字符串
  burst_reasons: string | null;
  track_tags: string | null;
}

interface LLMResult {
  reasons: string[];
  suggestion: string;
}

function parseJsonOrNull<T>(s: unknown): T | null {
  if (!s) return null;
  try {
    return JSON.parse(String(s)) as T;
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT =
  "你是抖音爆款拆解专家，根据视频的标题与互动数据，分析它能火的原因。" +
  "回复必须是合法 JSON：{\"reasons\":[\"...\",\"...\",\"...\"],\"suggestion\":\"...\"}。" +
  "reasons 恰好 3 条，每条不超过 25 个汉字，从内容反差/情绪共鸣/结构钩子/视觉冲击/选题精准度等角度切入；" +
  "suggestion 一句话，不超过 35 个汉字，给可复刻的拍摄建议。" +
  "不要使用 markdown，不要加任何额外说明。";

function buildUserPrompt(r: Row): string {
  const tags = parseJsonOrNull<string[]>(r.hashtags) ?? [];
  return [
    `视频标题：${r.video_title || "（无标题）"}`,
    `话题标签：${tags.length > 0 ? tags.join("、") : "（无）"}`,
    `作者粉丝：${r.author_followers}`,
    `播放：${r.video_views}，点赞：${r.video_likes}，评论：${r.video_comments}，` +
      `分享：${r.video_shares}，收藏：${r.video_collects}`,
    `爆款分：${r.viral_score}`,
  ].join("\n");
}

function tryParseLlmJson(text: string): LLMResult | null {
  // 兜底：剥掉可能的 ``` json ``` 包裹
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  // 找第一段 { ... }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    if (!Array.isArray(obj.reasons) || typeof obj.suggestion !== "string") return null;
    const reasons = obj.reasons.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 3);
    if (reasons.length === 0) return null;
    return { reasons, suggestion: String(obj.suggestion).trim() };
  } catch {
    return null;
  }
}

async function main() {
  const limit = Number(process.argv[2] ?? 25);
  console.log(`=== 阶段 0：track_tags 用 hashtags 兜底 ===`);
  const updateTags = await execute(
    `UPDATE low_follower_samples
     SET track_tags = hashtags
     WHERE (track_tags IS NULL OR track_tags = '[]' OR JSON_LENGTH(track_tags) = 0)
       AND hashtags IS NOT NULL AND JSON_LENGTH(hashtags) > 0`,
  );
  console.log(`updated track_tags: ${(updateTags as any).affectedRows ?? "?"}`);

  console.log(`\n=== 阶段 1：选 ${limit} 条 viral_score 最高且 burst_reasons 为空的样本 ===`);
  const rows = (await query<any[]>(
    `SELECT id, video_title, viral_score, author_followers,
            video_views, video_likes, video_comments, video_shares, video_collects,
            hashtags, burst_reasons, track_tags
     FROM low_follower_samples
     WHERE (burst_reasons IS NULL OR JSON_LENGTH(burst_reasons) = 0)
       AND video_title IS NOT NULL AND CHAR_LENGTH(video_title) > 0
     ORDER BY viral_score DESC, video_views DESC
     LIMIT ?`,
    [limit],
  )) as Row[];
  console.log(`命中 ${rows.length} 条待补全`);

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    try {
      const userPrompt = buildUserPrompt(r);
      const res = await callLLM({
        modelId: "doubao",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 256,
        temperature: 0.6,
        timeoutMs: 30_000,
      });
      const parsed = tryParseLlmJson(res.content);
      if (!parsed) {
        console.warn(`  ✗ ${r.id} 解析失败：${res.content.slice(0, 120)}`);
        fail++;
        continue;
      }
      await execute(
        `UPDATE low_follower_samples
         SET burst_reasons = ?, suggestion = ?
         WHERE id = ?`,
        [JSON.stringify(parsed.reasons), parsed.suggestion, r.id],
      );
      ok++;
      console.log(`  ✓ ${r.id} score=${r.viral_score}  ${parsed.reasons[0]}`);
    } catch (e: any) {
      console.error(`  ✗ ${r.id} LLM 异常：${e?.message ?? e}`);
      fail++;
    }
    // 节流，避免触发限流
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n=== 完成：ok=${ok}, fail=${fail} ===`);
  const stats = await query<any[]>(
    `SELECT
       SUM(CASE WHEN burst_reasons IS NOT NULL AND JSON_LENGTH(burst_reasons) > 0 THEN 1 ELSE 0 END) AS with_burst,
       SUM(CASE WHEN suggestion IS NOT NULL AND CHAR_LENGTH(suggestion) > 0 THEN 1 ELSE 0 END) AS with_sugg,
       SUM(CASE WHEN track_tags IS NOT NULL AND JSON_LENGTH(track_tags) > 0 THEN 1 ELSE 0 END) AS with_tags,
       COUNT(*) AS total
     FROM low_follower_samples`,
  );
  console.log("最终字段填充率：", JSON.stringify(stats[0]));
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
