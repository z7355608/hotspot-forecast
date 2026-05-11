/** ADR-0007 + ADR-0008 综合 verify:看 source × trend 分布 + 各 source 样本概览 */
import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const dist = await query<any[]>(
    `SELECT source, viral_score_trend, COUNT(*) AS c
     FROM low_follower_samples
     GROUP BY source, viral_score_trend
     ORDER BY source, viral_score_trend`,
  );
  console.log("source × viral_score_trend:");
  console.table(dist);

  const byIndustry = await query<any[]>(
    `SELECT source, IFNULL(industry_top,'(null)') AS industry, COUNT(*) AS c
     FROM low_follower_samples
     WHERE viral_score_trend != 'expired'
     GROUP BY source, industry
     ORDER BY source, c DESC`,
  );
  console.log("\nsource × industry_top(非 expired):");
  console.table(byIndustry);

  const searchSamples = await query<any[]>(
    `SELECT video_id,
            SUBSTRING(video_title,1,40) AS title,
            author_followers AS fans,
            video_likes AS likes,
            video_comments AS comments,
            industry_top, industry_sub,
            content_form, prefilter_reason
     FROM low_follower_samples
     WHERE source = 'search' AND viral_score_trend != 'expired'
     ORDER BY viral_score DESC
     LIMIT 30`,
  );
  console.log(`\nsource='search' 样本(top 30 by viral_score):`);
  for (const r of searchSamples) {
    console.log(`\n[${r.video_id}] ${r.title}...`);
    console.log(`  ${r.industry_top} / ${r.industry_sub}  | fans=${r.fans} likes=${r.likes} comments=${r.comments} | form=${r.content_form}`);
    console.log(`    ${r.prefilter_reason}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
