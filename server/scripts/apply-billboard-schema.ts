/**
 * 幂等地把 schema-v6-billboard-pipeline.sql 落到当前 MySQL
 * 不依赖 IF NOT EXISTS(MySQL 8 ADD COLUMN 不支持),手工查 information_schema
 *
 * 用法:
 *   pnpm tsx server/scripts/apply-billboard-schema.ts
 *
 * 安全性:
 *   - 不执行任何 DROP
 *   - ALTER COLUMN 前先查列是否已存在
 *   - CREATE TABLE 用 IF NOT EXISTS
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

const TABLE = "low_follower_samples";

interface ColumnRow extends RowDataPacket {
  COLUMN_NAME: string;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<ColumnRow[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(column: string, ddl: string) {
  if (await columnExists(TABLE, column)) {
    console.log(`  · ${TABLE}.${column} 已存在,跳过`);
    return;
  }
  console.log(`  + ALTER ${TABLE} ADD COLUMN ${column}`);
  await execute(`ALTER TABLE ${TABLE} ADD COLUMN ${ddl}`);
}

async function main() {
  console.log("=== ADR-0007 schema v6 apply ===\n");

  if (!(await tableExists(TABLE))) {
    console.error(`✗ 前置条件失败:${TABLE} 不存在,请先跑 schema-v5-low-follower-v2.sql`);
    process.exit(1);
  }

  console.log(`→ 扩展 ${TABLE} 列`);
  await addColumnIfMissing(
    "source",
    `source ENUM('seed_topic','billboard') NOT NULL DEFAULT 'seed_topic' COMMENT 'ADR-0007 入库管线来源'`,
  );
  await addColumnIfMissing(
    "industry_top",
    `industry_top VARCHAR(64) NULL COMMENT 'billboard 顶级类目名'`,
  );
  await addColumnIfMissing(
    "industry_sub",
    `industry_sub VARCHAR(64) NULL COMMENT 'billboard 子级类目(LLM 精化)'`,
  );
  await addColumnIfMissing(
    "prefilter_reason",
    `prefilter_reason TEXT NULL COMMENT 'LLM 预检查理由'`,
  );

  console.log(`→ 扩展 ${TABLE} 索引`);
  if (await indexExists(TABLE, "idx_source")) {
    console.log("  · idx_source 已存在,跳过");
  } else {
    console.log("  + ALTER ADD KEY idx_source");
    await execute(`ALTER TABLE ${TABLE} ADD KEY idx_source (source)`);
  }

  console.log(`\n→ 创建 douyin_billboard_categories(IF NOT EXISTS)`);
  await execute(`
    CREATE TABLE IF NOT EXISTS douyin_billboard_categories (
      id        BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      top_id    VARCHAR(64)  NOT NULL,
      top_name  VARCHAR(128) NOT NULL,
      sub_id    VARCHAR(64)  NULL,
      sub_name  VARCHAR(128) NULL,
      synced_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_top_sub (top_id, sub_id),
      KEY idx_synced (synced_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='ADR-0007 抖音 billboard 类目树缓存'
  `);
  console.log("  ✓ douyin_billboard_categories 就绪");

  console.log("\n=== schema v6 apply 完成 ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
