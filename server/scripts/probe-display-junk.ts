/** 探针:模拟 low-follower router 的 WHERE,看含"猎奇/暗网/重口/吃瓜"等关键词的样本来自哪个 source/trend */
import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const junkRe = "猎奇|暗网|重口|吃瓜|娜塔莎|轻松熊|卡戴珊|周皮格";
  const rows = await query<any[]>(
    `SELECT
       id, source, viral_score_trend, viral_score,
       SUBSTRING(video_title, 1, 60) AS title,
       JSON_UNQUOTE(track_tags) AS track_tags,
       seed_topic
     FROM low_follower_samples
     WHERE author_followers > 0
       AND (source = 'billboard' OR (video_comments IS NOT NULL AND video_comments > 0))
       AND (source = 'billboard' OR (video_collects IS NOT NULL AND video_collects > 0))
       AND viral_score_trend != 'expired'
       AND (
         video_title REGEXP ?
         OR seed_topic REGEXP ?
         OR JSON_UNQUOTE(track_tags) REGEXP ?
       )
     ORDER BY is_strict_hit DESC, viral_score DESC`,
    [junkRe, junkRe, junkRe],
  );
  console.log(`命中"猎奇/暗网/重口/吃瓜/IP" 关键词的样本 ${rows.length} 条:`);
  console.table(rows);

  const summary = await query<any[]>(
    `SELECT source, viral_score_trend, COUNT(*) AS c
     FROM low_follower_samples
     WHERE author_followers > 0
       AND (source = 'billboard' OR (video_comments IS NOT NULL AND video_comments > 0))
       AND (source = 'billboard' OR (video_collects IS NOT NULL AND video_collects > 0))
       AND viral_score_trend != 'expired'
     GROUP BY source, viral_score_trend
     ORDER BY source, viral_score_trend`,
  );
  console.log("\n当前 router 实际能查到的样本(按 source × trend):");
  console.table(summary);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
