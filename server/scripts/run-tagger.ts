/** 入口:跑 ADR-0006 §Step C 的入库后 enrichment(给打 NULL 的样本批量补 content_form/track_tags/burst_reasons/newbie_friendly/suggestion) */
import "dotenv/config";
import { runAutoTagging } from "../legacy/low-follower-tagger";

async function main() {
  const r = await runAutoTagging();
  console.log(`tagger 完成: tagged=${r.tagged} failed=${r.failed}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
