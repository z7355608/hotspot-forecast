/**
 * scripts/check-video-stats.ts
 *
 * Seed 之后用一次性 sanity check：
 *   1. 表里有几行
 *   2. 多少个不同 video_id 有 ≥2 个采集点（这是能算 delta 的必要条件）
 *   3. computeTopicSurges 输出
 *   4. lowFollower.list 在 sortBy=recent_view_delta 下前 4 条的 viewDelta
 *
 * 用法：npx tsx scripts/check-video-stats.ts
 */

import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
import { computeTopicSurges, computeVideoSurges } from "../server/services/surging-analytics";

async function main() {
  const totalRows = (await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM video_stats_history`,
  )) as Array<{ n: number }>;
  console.log(`video_stats_history total rows: ${totalRows[0]?.n ?? 0}`);

  const platformBreakdown = (await query<RowDataPacket[]>(
    `SELECT platform, COUNT(*) AS n FROM video_stats_history GROUP BY platform`,
  )) as Array<{ platform: string; n: number }>;
  console.log("by platform:", platformBreakdown);

  const videosWithTwoPoints = (await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM (
       SELECT platform, video_id
       FROM video_stats_history
       GROUP BY platform, video_id
       HAVING COUNT(*) >= 2
     ) t`,
  )) as Array<{ n: number }>;
  console.log(
    `videos with ≥2 snapshots (delta-eligible): ${videosWithTwoPoints[0]?.n ?? 0}`,
  );

  const sourceBreakdown = (await query<RowDataPacket[]>(
    `SELECT source, COUNT(*) AS n FROM video_stats_history GROUP BY source`,
  )) as Array<{ source: string; n: number }>;
  console.log("by source:", sourceBreakdown);

  console.log("\n=== top 5 video surges (interactionDelta) ===");
  const videoSurges = await computeVideoSurges({ limit: 5 });
  for (const v of videoSurges) {
    console.log(
      `  · ${v.platform.padEnd(12)} ${v.videoId.padEnd(20)} ` +
        `Δ=${v.interactionDelta.toLocaleString().padStart(10)} ` +
        `(view=${v.viewDelta} like=${v.likeDelta} cmt=${v.commentDelta} col=${v.collectDelta} sh=${v.shareDelta}) ` +
        `span=${v.hoursSpan.toFixed(1)}h`,
    );
  }

  console.log("\n=== top 5 topic surges ===");
  const topicSurges = await computeTopicSurges({ limit: 5 });
  for (const t of topicSurges) {
    console.log(
      `  · ${t.topic.padEnd(20)} ` +
        `videos=${String(t.videoCount).padEnd(3)} ` +
        `totalΔ=${t.totalInteractionDelta.toLocaleString().padStart(12)} ` +
        `top=${t.topVideoId ?? "-"}`,
    );
  }

  console.log("\n=== sample SQL for low-follower.list?sortBy=recent_view_delta (top 4) ===");
  const interactionDeltaExpr = `(
    (latest_v.view_count    - prev_v.view_count)
    + (latest_v.like_count    - prev_v.like_count)    * 1
    + (latest_v.comment_count - prev_v.comment_count) * 3
    + (latest_v.collect_count - prev_v.collect_count) * 2
    + (latest_v.share_count   - prev_v.share_count)   * 4
  )`;
  const surgeRanked = (await query<RowDataPacket[]>(
    `WITH ranked AS (
       SELECT platform, video_id,
              view_count, like_count, comment_count, share_count, collect_count,
              sampled_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform, video_id ORDER BY sampled_at DESC
              ) AS rn
       FROM video_stats_history
       WHERE sampled_at >= DATE_SUB(NOW(), INTERVAL 36 HOUR)
     ),
     latest_v AS (SELECT * FROM ranked WHERE rn = 1),
     prev_v AS (
       SELECT * FROM ranked
       WHERE rn = 2 AND sampled_at <= DATE_SUB(NOW(), INTERVAL 6 HOUR)
     )
     SELECT
       low_follower_samples.video_id,
       low_follower_samples.video_title,
       low_follower_samples.platform_id,
       low_follower_samples.viral_score,
       COALESCE(${interactionDeltaExpr}, 0) AS interaction_delta
     FROM low_follower_samples
     LEFT JOIN latest_v ON latest_v.platform = low_follower_samples.platform_id
                        AND latest_v.video_id = low_follower_samples.video_id
     LEFT JOIN prev_v   ON prev_v.platform   = low_follower_samples.platform_id
                        AND prev_v.video_id   = low_follower_samples.video_id
     WHERE low_follower_samples.platform_id = 'douyin'
       AND low_follower_samples.author_followers > 0
     ORDER BY
       ${interactionDeltaExpr} IS NULL,
       ${interactionDeltaExpr} DESC,
       low_follower_samples.is_strict_hit DESC,
       low_follower_samples.viral_score DESC
     LIMIT 4`,
  )) as Array<{ video_id: string; video_title: string; platform_id: string; viral_score: number; interaction_delta: number }>;
  for (const r of surgeRanked) {
    console.log(
      `  · [${r.platform_id}] viral=${r.viral_score} Δ=${r.interaction_delta.toLocaleString().padStart(10)}  ${(r.video_title || "").slice(0, 40)}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("check failed:", err);
  process.exit(1);
});
