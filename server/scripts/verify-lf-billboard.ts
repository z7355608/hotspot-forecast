/** ADR-0007 验证脚本:看 source × trend 分布 + billboard 入库样本详情 */
import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const s = await query<any[]>(
    `SELECT source, viral_score_trend, COUNT(*) c
     FROM low_follower_samples GROUP BY source, viral_score_trend ORDER BY source, viral_score_trend`,
  );
  console.log("source × viral_score_trend:");
  console.table(s);

  const b = await query<any[]>(
    `SELECT video_id, SUBSTRING(video_title,1,55) AS title, industry_sub, prefilter_reason
     FROM low_follower_samples WHERE source='billboard'`,
  );
  console.log("\nbillboard 入库样本:");
  console.table(b);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
