/** ADR-0007 实施 changelog (2026-04-30 二次决策):
 * PM 推翻 ADR-0006 §Step C.5 "不删只标 expired"决议,改为物理 DELETE 所有 expired 样本。
 * 理由:这些样本(115 条 seed_topic + 1 条 billboard 撞 ID 合并到的)都是 ADR-0006 §1 列出的
 * "猎奇/IP/吃瓜/纯娱乐"型,业务上不再使用,留着会增加表体积 + DB 备份成本。
 * 不可逆。
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

interface CountRow extends RowDataPacket { c: number }

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== ADR-0007 二次决策:DELETE 所有 expired 样本 ===`);
  console.log(`mode: ${dryRun ? "dry-run" : "真删"}`);

  const before = await query<CountRow[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  const willDel = await query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples WHERE viral_score_trend = 'expired'`,
  );
  const distBefore = await query<any[]>(
    `SELECT source, viral_score_trend, COUNT(*) AS c FROM low_follower_samples GROUP BY source, viral_score_trend ORDER BY source, viral_score_trend`,
  );
  console.log(`\n库总数:${before[0]?.c} | 待 DELETE 行数:${willDel[0]?.c}`);
  console.log("\n现状:");
  console.table(distBefore);

  if ((willDel[0]?.c ?? 0) === 0) {
    console.log("无 expired 行,退出");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\n[dry-run] 不执行 DELETE");
    process.exit(0);
  }

  // 同步删 score_history 里的孤儿(防止外键悬空 — 即便没有外键约束,数据干净)
  const histDel = await execute(
    `DELETE FROM low_follower_score_history
     WHERE sample_id IN (SELECT id FROM low_follower_samples WHERE viral_score_trend = 'expired')`,
  );
  console.log(`\n  · 同步删 score_history 孤儿:${histDel.affectedRows} 行`);

  const r = await execute(
    `DELETE FROM low_follower_samples WHERE viral_score_trend = 'expired'`,
  );
  console.log(`  ✓ DELETE low_follower_samples:${r.affectedRows} 行`);

  const after = await query<CountRow[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  const distAfter = await query<any[]>(
    `SELECT source, viral_score_trend, COUNT(*) AS c FROM low_follower_samples GROUP BY source, viral_score_trend ORDER BY source, viral_score_trend`,
  );
  console.log(`\n清理后:总数 ${after[0]?.c}`);
  console.table(distAfter);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
