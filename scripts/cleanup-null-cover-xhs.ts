/**
 * 删除 video_cover IS NULL 的 xhs 样本（10 条历史无封面数据，
 * 重 seed 时 xhs 搜索结果排名变化导致它们不在新结果里、
 * ON DUPLICATE KEY UPDATE 也没机会触发更新；detail 端点又被反爬切断回填不了）。
 */
import "dotenv/config";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  const before = (await query<RowDataPacket[]>(
    `SELECT video_id, video_title FROM low_follower_samples
       WHERE platform_id = 'xiaohongshu' AND video_cover IS NULL`,
  )) as Array<{ video_id: string; video_title: string }>;
  console.log(`will delete ${before.length} NULL-cover xhs samples:`);
  for (const r of before) {
    console.log(`  - ${r.video_id}: ${(r.video_title || "").slice(0, 50)}`);
  }
  const result = await execute(
    `DELETE FROM low_follower_samples
       WHERE platform_id = 'xiaohongshu' AND video_cover IS NULL`,
  );
  console.log(`\ndeleted: ${(result as any).affectedRows} rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
