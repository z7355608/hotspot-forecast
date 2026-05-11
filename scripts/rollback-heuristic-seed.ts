/**
 * 回滚 v3 启发式 seed 错误写入的 xhs/ks 行。
 * 它们都用了 run_id LIKE 'seed_xiaohongshu_%' / 'seed_kuaishou_%' 标识。
 * 这些数据没经过低粉爆款算法严格判定，不符合产品定义，必须删掉。
 */
import "dotenv/config";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  const before = (await query<RowDataPacket[]>(
    `SELECT platform_id, COUNT(*) AS n FROM low_follower_samples
     WHERE run_id LIKE 'seed_xiaohongshu_%' OR run_id LIKE 'seed_kuaishou_%'
     GROUP BY platform_id`,
  )) as Array<{ platform_id: string; n: number }>;
  console.log("rows to delete:");
  for (const r of before) console.log(`  ${r.platform_id}: ${r.n}`);

  const result = await execute(
    `DELETE FROM low_follower_samples
     WHERE run_id LIKE 'seed_xiaohongshu_%' OR run_id LIKE 'seed_kuaishou_%'`,
  );
  const deleted = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
  console.log(`\nrolled back ${deleted} rows.`);

  // 同步清理可能在 video_stats_history 里的对应快照（之前 mock_seed_baseline 的也清掉以免误导）
  const statsResult = await execute(
    `DELETE FROM video_stats_history WHERE source = 'mock_seed_baseline'`,
  );
  console.log(`video_stats_history mock_seed_baseline rows removed: ${(statsResult as any)?.affectedRows ?? 0}`);

  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
