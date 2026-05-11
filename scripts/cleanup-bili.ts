import "dotenv/config";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
async function main() {
  const before = await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM low_follower_samples WHERE platform_id = 'bilibili'`,
  );
  console.log("bilibili rows before:", (before as any)[0]?.n);
  // upper layer's persist may have dropped 0 rows, but inspect anyway
  const result = await execute(
    `DELETE FROM low_follower_samples WHERE platform_id = 'bilibili'`,
  );
  console.log("deleted:", (result as any).affectedRows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
