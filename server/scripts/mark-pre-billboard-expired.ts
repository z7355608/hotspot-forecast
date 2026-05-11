/**
 * ADR-0007 Step E — 把 ADR-0007 之前(全部 source='seed_topic')的低粉爆款样本
 * 标记为 viral_score_trend='expired'。
 *
 * **依赖**:必须先跑 apply-billboard-schema.ts(才有 source 字段)。
 *
 * **不删除**:与 ADR-0006 §Step C.5 一致——保留逃生口,后续算法回滚可以从 expired 池回捞。
 *
 * 用法:
 *   pnpm tsx server/scripts/mark-pre-billboard-expired.ts --dry-run   # 只看影响行数,不改库
 *   pnpm tsx server/scripts/mark-pre-billboard-expired.ts             # 真改
 *
 * 幂等:已经是 expired 的不重复改。
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

interface CountRow extends RowDataPacket {
  c: number;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== ADR-0007 mark pre-billboard samples expired ===`);
  console.log(`mode: ${dryRun ? "dry-run(只看不改)" : "真改"}`);

  // 前置:source 字段必须存在
  const colCheck = await query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'low_follower_samples' AND COLUMN_NAME = 'source'`,
  );
  if (colCheck.length === 0) {
    console.error("✗ 前置失败:low_follower_samples.source 列不存在,请先跑 apply-billboard-schema.ts");
    process.exit(1);
  }

  const total = await query<CountRow[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  const seedTopic = await query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples WHERE source = 'seed_topic'`,
  );
  const alreadyExpired = await query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples
     WHERE source = 'seed_topic' AND viral_score_trend = 'expired'`,
  );
  const willChange = await query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples
     WHERE source = 'seed_topic' AND viral_score_trend != 'expired'`,
  );

  console.log(`\n现状:`);
  console.log(`  总样本:       ${total[0]?.c ?? 0}`);
  console.log(`  source=seed_topic: ${seedTopic[0]?.c ?? 0}`);
  console.log(`    已 expired: ${alreadyExpired[0]?.c ?? 0}`);
  console.log(`    待改 expired: ${willChange[0]?.c ?? 0}  ← 本次会动这些`);

  if ((willChange[0]?.c ?? 0) === 0) {
    console.log("\n无需改动,退出");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\n[dry-run] 未实际改库");
    process.exit(0);
  }

  const r = await execute(
    `UPDATE low_follower_samples
     SET viral_score_trend = 'expired'
     WHERE source = 'seed_topic' AND viral_score_trend != 'expired'`,
  );
  console.log(`\n✓ 已标记 ${r.affectedRows} 行为 expired`);

  const verify = await query<CountRow[]>(
    `SELECT COUNT(*) AS c FROM low_follower_samples
     WHERE source = 'seed_topic' AND viral_score_trend = 'expired'`,
  );
  console.log(`  验证:source=seed_topic 且 expired = ${verify[0]?.c ?? 0}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
