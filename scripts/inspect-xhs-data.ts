/**
 * 看 xhs 13 条样本的数据完整度，决定：
 *   1. 哪些是"低数据"该剔除（互动 + 粉丝 + 标题）
 *   2. 哪些字段在前端展示会出问题
 */
import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  const rows = (await query<RowDataPacket[]>(
    `SELECT id, video_id, video_title, video_cover IS NULL AS cover_null,
            author_followers, video_views, video_likes, video_comments,
            video_shares, video_collects, weighted_interaction, viral_score,
            engagement_rate, follower_view_ratio
       FROM low_follower_samples
       WHERE platform_id = 'xiaohongshu'
       ORDER BY viral_score DESC`,
  )) as Array<Record<string, unknown>>;
  console.log(`xhs total: ${rows.length}`);
  console.log();
  // header
  console.log("viral | views | likes | comments | shares | collects | followers | wInteract | engageRate | fvRatio | title");
  console.log("------+-------+-------+----------+--------+----------+-----------+-----------+------------+---------+------");
  for (const r of rows) {
    const t = String(r.video_title ?? "").slice(0, 30);
    const fmt = (v: unknown) => String(v ?? "0").padStart(7);
    console.log(
      `${String(r.viral_score).padStart(5)} | ${fmt(r.video_views)} | ${fmt(r.video_likes)} | ${fmt(r.video_comments).padStart(8)} | ${fmt(r.video_shares).padStart(6)} | ${fmt(r.video_collects).padStart(8)} | ${fmt(r.author_followers).padStart(9)} | ${fmt(r.weighted_interaction).padStart(9)} | ${String(r.engagement_rate).padStart(10)} | ${String(r.follower_view_ratio).padStart(7)} | ${t}`,
    );
  }
  process.exit(0);
}
main().catch(console.error);
