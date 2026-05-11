import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  console.log("=== low_follower_samples by platform ===");
  const byPlatform = (await query<RowDataPacket[]>(
    `SELECT platform_id, COUNT(*) AS total,
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN 1 ELSE 0 END) AS recent14d,
            MAX(created_at) AS latest_at
       FROM low_follower_samples
       GROUP BY platform_id`,
  )) as Array<{ platform_id: string; total: number; recent14d: number; latest_at: string }>;
  for (const r of byPlatform) {
    console.log(
      `  · ${String(r.platform_id).padEnd(15)} total=${String(r.total).padStart(6)} ` +
        `recent14d=${String(r.recent14d).padStart(5)} ` +
        `latest=${r.latest_at ?? "(none)"}`,
    );
  }

  console.log("\n=== sample raw rows (first 2 of each non-douyin platform) ===");
  const samples = (await query<RowDataPacket[]>(
    `SELECT platform_id, video_id, video_title, author_followers, viral_score, created_at
       FROM low_follower_samples
       WHERE platform_id IN ('xiaohongshu', 'kuaishou', 'bilibili')
       ORDER BY platform_id, created_at DESC
       LIMIT 6`,
  )) as Array<{ platform_id: string; video_id: string; video_title: string; viral_score: number; created_at: string }>;
  if (samples.length === 0) console.log("  (no rows for non-douyin platforms)");
  for (const s of samples) {
    console.log(
      `  · [${s.platform_id}] viral=${s.viral_score} ${s.video_id?.slice(0, 14)} ${(s.video_title ?? "").slice(0, 40)}`,
    );
  }

  console.log("\n=== video_stats_history by platform ===");
  const stats = (await query<RowDataPacket[]>(
    `SELECT platform, COUNT(*) AS rows, COUNT(DISTINCT video_id) AS distinct_videos
       FROM video_stats_history GROUP BY platform`,
  )) as Array<{ platform: string; rows: number; distinct_videos: number }>;
  for (const r of stats) {
    console.log(`  · ${r.platform.padEnd(15)} rows=${r.rows} distinct=${r.distinct_videos}`);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
