/**
 * 用 TikHub /api/v1/douyin/web/fetch_one_video 给排名前 N 的样本补真实
 * 评论/分享/收藏数（billboard 不返回这些）。
 *
 * 用法：npx tsx server/scripts/enrich-detail-stats.ts [limit]
 *   limit 默认 30
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import { getTikHub } from "../legacy/tikhub";

interface Row {
  id: string;
  video_id: string;
  video_views: number;
  video_likes: number;
  video_comments: number;
  video_shares: number;
  video_collects: number;
}

function pickStats(payload: any): Record<string, number> | null {
  if (!payload) return null;
  // 兼容 v1 / v2 两种 payload 嵌套层级
  const aweme =
    payload?.data?.aweme_detail ??
    payload?.data?.data?.aweme_detail ??
    payload?.aweme_detail ??
    null;
  const stats = aweme?.statistics;
  if (!stats || typeof stats !== "object") return null;
  const out: Record<string, number> = {};
  for (const k of [
    "play_count", "view_count", "digg_count", "like_count",
    "comment_count", "share_count", "collect_count", "save_count",
  ]) {
    if (typeof stats[k] === "number") out[k] = stats[k];
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function main() {
  const limit = Number(process.argv[2] ?? 30);
  const rows = (await query<any[]>(
    `SELECT id, video_id, video_views, video_likes, video_comments, video_shares, video_collects
     FROM low_follower_samples
     WHERE platform_id = 'douyin'
       AND (video_comments = 0 OR video_shares = 0 OR video_collects = 0)
     ORDER BY viral_score DESC
     LIMIT ?`,
    [limit],
  )) as Row[];
  console.log(`待补 ${rows.length} 条详情`);

  let ok = 0, fail = 0, recompute = 0;
  for (const r of rows) {
    try {
      // fetch_one_video 接受 aweme_id 或 item_ids
      const res = await getTikHub<any>("/api/v1/douyin/web/fetch_one_video", {
        aweme_id: r.video_id,
      });
      if (!res.ok) {
        fail++;
        console.warn(`  ✗ ${r.id} HTTP ${res.httpStatus}`);
        continue;
      }
      const stats = pickStats(res.payload);
      if (!stats) {
        fail++;
        console.warn(`  · ${r.id} payload 没有 statistics`);
        continue;
      }
      // 关键：返回值为 0 视为「未知」而非真实 0，使用原值兜底
      const pickPositive = (v: any, fallback: number) =>
        typeof v === "number" && v > 0 ? v : fallback;
      const view = pickPositive(stats.play_count ?? stats.view_count, r.video_views);
      const like = pickPositive(stats.digg_count ?? stats.like_count, r.video_likes);
      const comment = pickPositive(stats.comment_count, r.video_comments);
      const share = pickPositive(stats.share_count, r.video_shares);
      const save = pickPositive(stats.collect_count ?? stats.save_count, r.video_collects);

      // 再算一遍 engagement_rate（分子=互动总和、分母=播放）
      const interactions = like + comment + share + save;
      const engagementRate = view > 0 ? interactions / view : 0;

      await execute(
        `UPDATE low_follower_samples
         SET video_views = ?, video_likes = ?, video_comments = ?,
             video_shares = ?, video_collects = ?, engagement_rate = ?
         WHERE id = ?`,
        [view, like, comment, share, save, engagementRate, r.id],
      );
      ok++;
      recompute++;
      console.log(
        `  ✓ ${r.id}  views=${view} likes=${like} c=${comment} s=${share} save=${save} eng=${(engagementRate * 100).toFixed(2)}%`,
      );
    } catch (e: any) {
      fail++;
      console.error(`  ✗ ${r.id} 异常: ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n=== 完成: ok=${ok}, fail=${fail}, engagement_rate updated for ${recompute} rows ===`);
  const summary = await query<any[]>(`
    SELECT
      SUM(CASE WHEN video_comments > 0 THEN 1 ELSE 0 END) AS with_comments,
      SUM(CASE WHEN video_shares > 0 THEN 1 ELSE 0 END) AS with_shares,
      SUM(CASE WHEN video_collects > 0 THEN 1 ELSE 0 END) AS with_saves,
      SUM(CASE WHEN engagement_rate > 0 THEN 1 ELSE 0 END) AS with_engagement
    FROM low_follower_samples
  `);
  console.log("dataset 完整度:", JSON.stringify(summary[0]));
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
