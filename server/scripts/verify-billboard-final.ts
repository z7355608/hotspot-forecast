/** 看最终所有 billboard 样本的完整字段质量 */
import "dotenv/config";
import { query } from "../legacy/database";
async function main() {
  const rows = await query<any[]>(
    `SELECT video_id,
            SUBSTRING(video_title,1,40) AS title,
            video_likes, video_comments, video_collects, video_shares,
            content_form, JSON_UNQUOTE(track_tags) AS track_tags,
            JSON_UNQUOTE(burst_reasons) AS burst_reasons,
            newbie_friendly, suggestion,
            industry_sub, prefilter_reason
     FROM low_follower_samples
     WHERE source = 'billboard'
     ORDER BY video_likes DESC`,
  );
  console.log(`source=billboard 样本 ${rows.length} 条:`);
  for (const r of rows) {
    console.log(`\n[${r.video_id}] ${r.title}...`);
    console.log(`  互动: like ${r.video_likes} comment ${r.video_comments} collect ${r.video_collects} share ${r.video_shares}`);
    console.log(`  prefilter: ${r.industry_sub} — ${r.prefilter_reason}`);
    console.log(`  tagger: form=${r.content_form} | nf=${r.newbie_friendly}`);
    console.log(`    track_tags: ${r.track_tags}`);
    console.log(`    burst_reasons: ${r.burst_reasons}`);
    console.log(`    suggestion: ${r.suggestion}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
