/**
 * 复现「立即分析 / 实时拆解」流程，走和 viralBreakdownDirect 路由一致的预处理：
 *   1) URL 后缀校验（mp3 / 图片 直接拒绝）
 *   2) 抖音 → TikHub /api/v1/douyin/web/fetch_one_video（首选）
 *      其它 / 失败 → watermark API 兜底
 *   3) analyzeViralBreakdown LLM 拆解
 */
import "dotenv/config";
import { query } from "../legacy/database";
import { analyzeViralBreakdown } from "../services/viral-breakdown";
import { parseVideo } from "../legacy/video-parser";
import { fetchDouyinVideoByAwemeId } from "../services/tikhub-video-resolver";

async function probeOne(r: any): Promise<"success" | "rejected" | "failed"> {
  console.log("\n=== 拆解候选 ===");
  console.log(`id=${r.id}`);
  console.log(`title=${(r.video_title || "").slice(0, 60)}`);
  console.log(`video_url=${(r.video_url || "").slice(0, 120)}…`);

  const url = r.video_url || "";
  if (/\.(mp3|wav|aac|flac|m4a|ogg)(\?|#|$)/i.test(url)) {
    console.log(`✗ 前置拒绝：音频文件`);
    return "rejected";
  }
  if (/\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(url)) {
    console.log(`✗ 前置拒绝：图片文件`);
    return "rejected";
  }

  const platform = (r.platform_id || "").toLowerCase();
  const videoId = r.video_id || "";
  const isDouyin = platform === "douyin" || platform === "抖音";

  let resolvedVideoUrl: string | null = null;
  let source: "tikhub" | "watermark" | null = null;

  // 路径 A：抖音 TikHub 首选
  if (isDouyin && videoId) {
    console.log(`→ TikHub fetch_one_video aweme_id=${videoId}…`);
    try {
      const resolved = await fetchDouyinVideoByAwemeId(videoId);
      resolvedVideoUrl = resolved.videoUrl;
      source = "tikhub";
      console.log(`  TikHub videoUrl=${resolvedVideoUrl.slice(0, 80)}… duration=${resolved.duration}ms hasWatermark=${resolved.hasWatermark}`);
    } catch (e: any) {
      console.log(`  TikHub 失败，降级 watermark: ${e?.message?.slice(0, 200) ?? e}`);
    }
  }

  // 路径 B：watermark 兜底
  if (!resolvedVideoUrl) {
    let parseInput = url;
    if (videoId && isDouyin) parseInput = `https://www.douyin.com/video/${videoId}`;
    else if (videoId && platform === "tiktok") parseInput = `https://www.tiktok.com/@/video/${videoId}`;
    else if (videoId && (platform === "kuaishou" || platform === "快手")) parseInput = `https://www.kuaishou.com/short-video/${videoId}`;
    else if (videoId && (platform === "xiaohongshu" || platform === "小红书")) parseInput = `https://www.xiaohongshu.com/explore/${videoId}`;
    console.log(`→ watermark API parseVideo: ${parseInput}`);
    let parsed;
    try {
      parsed = await parseVideo(parseInput);
    } catch (e: any) {
      console.log(`✗ parseVideo 异常: ${e?.message?.slice(0, 200) ?? e}`);
      return "failed";
    }
    console.log(`  parseVideo.ok=${parsed.ok} type=${parsed.raw?.type} videoUrl=${(parsed.videoUrl || "").slice(0, 80)}…`);
    if (parsed.raw?.type && parsed.raw.type !== "VIDEO") {
      console.log(`✗ 类型拒绝：${parsed.raw.type}（非视频）`);
      return "rejected";
    }
    if (!parsed.ok || !parsed.videoUrl) {
      console.log(`✗ 解析失败: ${parsed.error ?? "未拿到 videoUrl"}`);
      return "failed";
    }
    resolvedVideoUrl = parsed.videoUrl;
    source = "watermark";
  }

  if (!resolvedVideoUrl) {
    console.log(`✗ 没拿到可用 videoUrl`);
    return "failed";
  }
  console.log(`→ 调用 analyzeViralBreakdown（source=${source}，60-180s）…`);
  try {
    const t0 = Date.now();
    const res = await analyzeViralBreakdown(resolvedVideoUrl);
    const dt = Date.now() - t0;
    console.log(`✓ 拆解成功 (${dt}ms, source=${source}) summary: ${(res.meta_strategy?.summary ?? "").slice(0, 80)}`);
    console.log(`  shot_list 数量: ${res.shot_list?.length ?? 0}`);
    if (res.shot_list?.[0]?.audio_layer?.script) {
      console.log(`  shot_1 口播: 「${res.shot_list[0].audio_layer.script.slice(0, 60)}」`);
    }
    return "success";
  } catch (e: any) {
    console.log(`✗ LLM 拆解失败 (source=${source}): ${e?.message?.slice(0, 400) ?? e}`);
    return "failed";
  }
}

async function main() {
  const rows = await query<any[]>(
    `SELECT id, video_id, video_title, video_url, video_cover, author_nickname, platform_id
     FROM low_follower_samples
     ORDER BY viral_score DESC
     LIMIT 5`,
  );
  const counts = { success: 0, rejected: 0, failed: 0 };
  for (const r of rows) {
    const result = await probeOne(r);
    counts[result]++;
    if (result === "success") break; // 一次成功就够，避免烧太多 token
  }
  console.log(`\n=== 汇总 ===`);
  console.log(`成功: ${counts.success}, 类型拒绝: ${counts.rejected}, 调用失败: ${counts.failed}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
