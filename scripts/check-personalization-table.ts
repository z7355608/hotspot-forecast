/**
 * 一次性诊断:确认 creator_personalization_profiles 表是否存在,以及字段对得上 router 用法。
 * 跑法:pnpm tsx scripts/check-personalization-table.ts
 */
import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  try {
    const tables = (await query<RowDataPacket[]>(
      `SHOW TABLES LIKE 'creator_personalization_profiles'`,
    )) as Array<Record<string, string>>;
    if (tables.length === 0) {
      console.log("❌ TABLE_NOT_EXISTS: creator_personalization_profiles");
      console.log("   →  这就是 personalization.getProfile 500 的根因");
      process.exit(0);
    }

    console.log("✅ table exists");
    const cols = (await query<RowDataPacket[]>(
      `SHOW COLUMNS FROM creator_personalization_profiles`,
    )) as Array<{ Field: string; Type: string; Null: string }>;
    console.log("columns:");
    for (const c of cols) console.log(`  - ${c.Field}  ${c.Type}  ${c.Null}`);

    const expected = [
      "user_id", "platform_id", "suggested_niche", "suggested_style_tags",
      "suggested_instructions", "confidence", "user_confirmed",
      "user_edited_niche", "user_edited_style_tags", "user_edited_instructions",
      "input_works_count", "input_followers", "created_at", "updated_at",
    ];
    const have = new Set(cols.map((c) => c.Field));
    const missing = expected.filter((f) => !have.has(f));
    if (missing.length > 0) {
      console.log("❌ MISSING COLUMNS:", missing.join(", "));
    } else {
      console.log("✅ all expected columns present");
    }

    const cntRows = (await query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM creator_personalization_profiles`,
    )) as Array<{ n: number }>;
    console.log("row count:", cntRows[0]?.n ?? 0);
  } catch (err) {
    console.error("❌ query failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("script failed:", err);
    process.exit(1);
  });
