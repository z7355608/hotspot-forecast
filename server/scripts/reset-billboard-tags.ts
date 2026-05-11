/** 重置 source='billboard' 样本的 tag 字段为 NULL,让 runAutoTagging 重新拾起来用新的 doubao 模型打标 */
import "dotenv/config";
import { execute } from "../legacy/database";
async function main() {
  const r = await execute(
    `UPDATE low_follower_samples
     SET content_form = NULL, track_tags = NULL, burst_reasons = NULL,
         newbie_friendly = NULL, suggestion = NULL
     WHERE source = 'billboard'`,
  );
  console.log(`重置 ${r.affectedRows} 条 billboard 样本字段为 NULL`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
