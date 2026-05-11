/**
 * 一次性脚本:执行 schema-v14-running-predictions.sql。
 * 幂等(CREATE TABLE IF NOT EXISTS),可重复执行。
 *
 * 跑法:pnpm tsx scripts/apply-running-predictions-schema.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  const sqlPath = resolve(
    process.cwd(),
    "server/legacy/database/schema-v14-running-predictions.sql",
  );
  const raw = readFileSync(sqlPath, "utf-8");

  const statements = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`executing ${statements.length} statement(s) from schema-v14`);
  for (const stmt of statements) {
    await execute(stmt);
    console.log(`  ✓ ${stmt.slice(0, 60).replace(/\s+/g, " ")}...`);
  }

  const tables = (await query<RowDataPacket[]>(
    `SHOW TABLES LIKE 'running_predictions'`,
  )) as Array<Record<string, string>>;
  if (tables.length === 0) {
    console.error("❌ table still missing after CREATE");
    process.exit(1);
  }
  const cols = (await query<RowDataPacket[]>(
    `SHOW COLUMNS FROM running_predictions`,
  )) as Array<{ Field: string }>;
  console.log(`✅ table ready with ${cols.length} columns`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("apply failed:", err);
    process.exit(1);
  });
