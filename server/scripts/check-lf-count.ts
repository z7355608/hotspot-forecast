/**
 * 临时脚本：查看 low_follower_samples 当前规模与多样性
 * 用法：npx tsx server/scripts/check-lf-count.ts
 */
import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const total = await query<any[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  const recent = await query<any[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)`,
  );
  const platforms = await query<any[]>(
    `SELECT platform_id, COUNT(*) AS c FROM low_follower_samples GROUP BY platform_id ORDER BY c DESC`,
  );
  const topics = await query<any[]>(
    `SELECT seed_topic, COUNT(*) AS c FROM low_follower_samples WHERE seed_topic IS NOT NULL AND seed_topic <> '' GROUP BY seed_topic ORDER BY c DESC LIMIT 10`,
  );
  const filled = await query<any[]>(`
    SELECT
      SUM(CASE WHEN burst_reasons IS NOT NULL AND JSON_LENGTH(burst_reasons) > 0 THEN 1 ELSE 0 END) AS with_burst_reasons,
      SUM(CASE WHEN suggestion IS NOT NULL AND CHAR_LENGTH(suggestion) > 0 THEN 1 ELSE 0 END) AS with_suggestion,
      SUM(CASE WHEN track_tags IS NOT NULL AND JSON_LENGTH(track_tags) > 0 THEN 1 ELSE 0 END) AS with_tags,
      SUM(CASE WHEN video_cover IS NOT NULL AND CHAR_LENGTH(video_cover) > 0 THEN 1 ELSE 0 END) AS with_cover
    FROM low_follower_samples
  `);
  const top3 = await query<any[]>(
    `SELECT id, platform_id, video_title, viral_score, seed_topic FROM low_follower_samples ORDER BY viral_score DESC LIMIT 3`,
  );

  console.log("total:", total[0]?.c);
  console.log("recent14d:", recent[0]?.c);
  console.log("platforms:", JSON.stringify(platforms));
  console.log("seedTopics:", JSON.stringify(topics));
  console.log("filled fields:", JSON.stringify(filled[0]));
  console.log("top3 by viral_score:", JSON.stringify(top3, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
