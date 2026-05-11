import "dotenv/config";
import { query, execute } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
async function main() {
  const rows = (await query<RowDataPacket[]>(
    `SELECT platform_id, video_id, video_cover IS NULL AS is_null FROM low_follower_samples
       WHERE platform_id IN ('xiaohongshu', 'bilibili')`,
  )) as Array<{ platform_id: string; video_id: string; is_null: number }>;
  const stats: Record<string, { total: number; nullCovers: number }> = {};
  for (const r of rows) {
    if (!stats[r.platform_id]) stats[r.platform_id] = { total: 0, nullCovers: 0 };
    stats[r.platform_id].total++;
    if (r.is_null) stats[r.platform_id].nullCovers++;
  }
  for (const [p, s] of Object.entries(stats)) {
    console.log(`  ${p}: total=${s.total} nullCover=${s.nullCovers} hasCover=${s.total - s.nullCovers}`);
  }
  process.exit(0);
}
main().catch(console.error);
