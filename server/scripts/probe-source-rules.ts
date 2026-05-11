/** verify low-follower-source-rules.ts:打印 buildValidSampleClause + 跑 list/stats 模拟查询 */
import "dotenv/config";
import { query } from "../legacy/database";
import {
  buildValidSampleClause,
  buildValidSampleConditions,
  SOURCE_FIELD_SPECS,
} from "../legacy/low-follower-source-rules";

async function main() {
  console.log("=== SOURCE_FIELD_SPECS ===");
  console.table(SOURCE_FIELD_SPECS);

  console.log("\n=== buildValidSampleConditions() (router list 用) ===");
  for (const c of buildValidSampleConditions()) console.log("  ·", c);

  const clause = buildValidSampleClause();
  console.log("\n=== buildValidSampleClause() (router stats 用) ===");
  console.log(clause);

  console.log("\n=== 跑模拟 stats SELECT COUNT(*) ===");
  const rows = await query<any[]>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN source='billboard' THEN 1 ELSE 0 END) AS billboard,
            SUM(CASE WHEN source='search' THEN 1 ELSE 0 END) AS search_,
            SUM(CASE WHEN source='seed_topic' THEN 1 ELSE 0 END) AS seed_topic
     FROM low_follower_samples WHERE ${clause}`,
  );
  console.table(rows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
