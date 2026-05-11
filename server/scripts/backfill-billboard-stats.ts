/** ADR-0007 补丁:billboard 接口 payload 不含 comment/collect/share,
 * 用 fetch_one_video_v2 按 video_id 拉真实统计回填 low_follower_samples。
 *
 * 用法:
 *   pnpm tsx server/scripts/backfill-billboard-stats.ts            # 真补
 *   pnpm tsx server/scripts/backfill-billboard-stats.ts --dry-run  # 只看影响 + 拉一条样本展示
 *
 * 调用预算:每条样本 1 次 TikHub fetch_one_video_v2 ≈ $0.001。
 * 选谁:source='billboard' 且 (video_comments=0 OR video_collects=0)。
 *
 * 顺序:run-billboard-pipeline.ts 入库后 → 本脚本 → 然后 run-tagger.ts(让打标看到真实数据)。
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import { getTikHub } from "../legacy/tikhub";

interface SampleRow extends RowDataPacket {
  id: string;
  video_id: string;
  video_title: string;
  video_likes: number;
  video_comments: number;
  video_collects: number;
}

interface AwemeStatistics {
  digg_count?: number;
  comment_count?: number;
  collect_count?: number;
  share_count?: number;
  play_count?: number;
}

async function fetchOneVideoStats(awemeId: string): Promise<AwemeStatistics | null> {
  const r = await getTikHub<unknown>("/api/v1/douyin/app/v3/fetch_one_video_v2", { aweme_id: awemeId });
  if (!r.ok) return null;
  const root = r.payload as Record<string, unknown> | null;
  const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
  const aweme = (inner.aweme_detail as Record<string, unknown> | undefined) ?? inner;
  const stats = (aweme?.statistics as AwemeStatistics | undefined) ?? null;
  return stats;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== backfill billboard stats (fetch_one_video_v2) ===`);
  console.log(`mode: ${dryRun ? "dry-run" : "真补"}`);

  const targets = await query<SampleRow[]>(
    `SELECT id, video_id, video_title, video_likes, video_comments, video_collects
     FROM low_follower_samples
     WHERE source = 'billboard' AND (video_comments = 0 OR video_collects = 0)
     ORDER BY created_at DESC`,
  );
  console.log(`\n待补条数: ${targets.length}`);
  if (targets.length === 0) {
    console.log("无需补,退出");
    process.exit(0);
  }

  let updated = 0;
  let failed = 0;
  for (const row of targets) {
    const stats = await fetchOneVideoStats(row.video_id);
    if (!stats) {
      console.log(`  ✗ [${row.video_id}] fetch_one_video_v2 失败`);
      failed++;
      continue;
    }
    const newLikes = Number(stats.digg_count ?? row.video_likes ?? 0);
    const newComments = Number(stats.comment_count ?? 0);
    const newCollects = Number(stats.collect_count ?? 0);
    const newShares = Number(stats.share_count ?? 0);
    const newViews = Number(stats.play_count ?? 0);

    console.log(
      `  · [${row.video_id}] ${row.video_title?.slice(0, 30)}... | ` +
        `like ${row.video_likes}→${newLikes} comment ${row.video_comments}→${newComments} collect ${row.video_collects}→${newCollects}`,
    );

    if (dryRun) continue;

    // 重新算 weighted_interaction(与 low-follower-algorithm.ts 默认权重一致):
    // = like*1 + comment*3 + collect*2 + share*4(不含时间衰减,简单估)
    const weighted = newLikes + newComments * 3 + newCollects * 2 + newShares * 4;

    const r = await execute(
      `UPDATE low_follower_samples
       SET video_likes = ?, video_comments = ?, video_collects = ?, video_shares = ?, video_views = ?,
           weighted_interaction = ?, last_refreshed_at = NOW()
       WHERE id = ?`,
      [newLikes, newComments, newCollects, newShares, newViews, weighted, row.id],
    );
    updated += r.affectedRows;

    await new Promise((r) => setTimeout(r, 200)); // 平滑请求
  }

  console.log(`\n=== 完成 ===`);
  console.log(`目标 ${targets.length} 条 | 更新 ${updated} | 失败 ${failed}`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
