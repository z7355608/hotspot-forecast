import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  console.log("=== ranked CTE first 6 rows ===");
  const ranked = await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id, view_count, sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
     )
     SELECT platform, video_id, view_count, sampled_at, rn FROM ranked
     ORDER BY platform, video_id, rn LIMIT 6`,
  );
  console.log(ranked);

  console.log("\n=== latest CTE count ===");
  const latestCnt = await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id, view_count, sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
     )
     SELECT COUNT(*) AS n FROM ranked WHERE rn = 1`,
  );
  console.log(latestCnt);

  console.log("\n=== prev CTE count (rn=2 + sampled_at <= NOW - 6 HOUR) ===");
  const prevCnt = await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id, view_count, sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
     )
     SELECT COUNT(*) AS n FROM ranked WHERE rn = 2 AND sampled_at <= DATE_SUB(NOW(), INTERVAL 6 HOUR)`,
  );
  console.log(prevCnt);

  console.log("\n=== 简化版 prev CTE (只 rn=2) ===");
  const prevCnt2 = await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id, view_count, sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
     )
     SELECT rn, COUNT(*) AS n,
            MIN(sampled_at) AS min_at, MAX(sampled_at) AS max_at
     FROM ranked GROUP BY rn`,
  );
  console.log(prevCnt2);

  console.log("\n=== current NOW vs typical sampled_at ===");
  const ages = await query<RowDataPacket[]>(
    `SELECT
        NOW() AS server_now,
        MIN(sampled_at) AS min_sample,
        MAX(sampled_at) AS max_sample,
        TIMESTAMPDIFF(MINUTE, MIN(sampled_at), NOW()) AS oldest_minutes_ago,
        TIMESTAMPDIFF(MINUTE, MAX(sampled_at), NOW()) AS newest_minutes_ago
      FROM video_stats_history`,
  );
  console.log(ages);

  process.exit(0);
}

main().catch((err) => {
  console.error("debug failed:", err);
  process.exit(1);
});
