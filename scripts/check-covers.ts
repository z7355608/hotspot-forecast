import "dotenv/config";
import { query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
async function main() {
  const rows = (await query<RowDataPacket[]>(
    `SELECT platform_id, video_id, video_cover, video_title
       FROM low_follower_samples
       WHERE platform_id IN ('xiaohongshu', 'bilibili')
       ORDER BY platform_id, created_at DESC`,
  )) as Array<{ platform_id: string; video_id: string; video_cover: string | null; video_title: string }>;
  for (const r of rows) {
    const cover = r.video_cover ?? "(NULL)";
    const truncated = cover.length > 100 ? cover.slice(0, 100) + "..." : cover;
    console.log(`[${r.platform_id}] ${r.video_id}: cover=${truncated}`);
  }
  process.exit(0);
}
main().catch(console.error);
