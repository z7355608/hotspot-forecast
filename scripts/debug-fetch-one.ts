import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
import { getTikHub } from "../server/legacy/tikhub";
import { fetchVideoStats } from "../server/legacy/performance-tracker";

async function main() {
  // 拿一个真实的 aweme_id
  const rows = (await query<RowDataPacket[]>(
    `SELECT video_id FROM low_follower_samples
     WHERE platform_id = 'douyin' AND author_followers > 0 AND video_id IS NOT NULL
     ORDER BY viral_score DESC LIMIT 3`,
  )) as Array<{ video_id: string }>;

  for (const r of rows) {
    const id = r.video_id;
    console.log(`\n=== aweme_id ${id} ===`);

    const raw = await getTikHub<Record<string, unknown>>(
      "/api/v1/douyin/web/fetch_one_video",
      { aweme_id: id },
    );
    console.log("ok:", raw.ok, "businessCode:", raw.businessCode);

    // 找 statistics
    const payload = raw.payload as any;
    const detail = payload?.data?.aweme_detail;
    const stats = detail?.statistics;
    console.log("statistics keys:", stats ? Object.keys(stats) : "(none)");
    if (stats) {
      console.log("  play_count:", stats.play_count);
      console.log("  vv_count:", stats.vv_count);
      console.log("  digg_count:", stats.digg_count);
      console.log("  like_count:", stats.like_count);
      console.log("  comment_count:", stats.comment_count);
      console.log("  share_count:", stats.share_count);
      console.log("  collect_count:", stats.collect_count);
      console.log("  favorite_count:", stats.favorite_count);
    }

    const fresh = await fetchVideoStats("douyin", id);
    console.log("fetchVideoStats:", fresh);
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
