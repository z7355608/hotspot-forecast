/** 幂等地把 schema-v7-search-pipeline.sql 落到当前 MySQL
 *
 * 用法:
 *   pnpm tsx server/scripts/apply-search-schema.ts
 *
 * 安全性:不 DROP / 不丢数据。检查 source 列 COLUMN_TYPE 是否已含 'search',含则跳过。
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

interface ColRow extends RowDataPacket { COLUMN_TYPE: string }

async function main() {
  console.log("=== ADR-0008 schema v7 apply ===\n");

  const cols = await query<ColRow[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'low_follower_samples' AND COLUMN_NAME = 'source'`,
  );
  if (cols.length === 0) {
    console.error("✗ 前置失败:low_follower_samples.source 不存在,请先跑 apply-billboard-schema.ts");
    process.exit(1);
  }
  const ct = cols[0].COLUMN_TYPE;
  console.log(`当前 source 列定义: ${ct}`);
  if (/'search'/.test(ct)) {
    console.log("  · 已包含 'search',跳过 ALTER");
    process.exit(0);
  }

  console.log("  + ALTER MODIFY source ENUM('seed_topic','billboard','search')");
  await execute(
    `ALTER TABLE low_follower_samples
     MODIFY COLUMN source ENUM('seed_topic','billboard','search') NOT NULL DEFAULT 'seed_topic'
     COMMENT 'ADR-0007/0008 入库管线来源'`,
  );

  const verify = await query<ColRow[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'low_follower_samples' AND COLUMN_NAME = 'source'`,
  );
  console.log(`\n✓ 升级后: ${verify[0].COLUMN_TYPE}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
