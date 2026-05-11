import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const top = await query<any[]>(
    `SELECT id, viral_score,
            JSON_LENGTH(burst_reasons) AS br_len,
            burst_reasons,
            suggestion
     FROM low_follower_samples
     ORDER BY viral_score DESC LIMIT 6`,
  );
  console.log("top6 burst_reasons：");
  for (const r of top) {
    console.log(`  ${r.id} score=${r.viral_score} br_len=${r.br_len} sugg=${r.suggestion ? "yes" : "no"}`);
    if (r.br_len > 0) console.log(`    sample reason: ${JSON.stringify(r.burst_reasons).slice(0, 200)}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
