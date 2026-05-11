/**
 * 剔除"低数据"小红书样本（保留高质量精品）。
 * 标准：
 *   - weighted_interaction < 200（互动太低，可能是冷启动账号或非爆款）
 *   - OR author_followers < 10（粉丝过少，疑似异常 / 抓取脏数据）
 *
 * 这两条标准均符合产品定义的"低粉爆款"——粉丝低且互动高才是爆款，
 * 互动太低或粉丝异常都不应在推荐位展示。
 */
import "dotenv/config";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";

async function main() {
  const before = (await query<RowDataPacket[]>(
    `SELECT video_id, video_title, weighted_interaction, author_followers, viral_score
       FROM low_follower_samples
       WHERE platform_id = 'xiaohongshu'
         AND (weighted_interaction < 200 OR author_followers < 10)`,
  )) as Array<Record<string, unknown>>;
  console.log(`will delete ${before.length} low-quality xhs samples:`);
  for (const r of before) {
    console.log(
      `  - viral=${r.viral_score} wInt=${r.weighted_interaction} fans=${r.author_followers} | ${(r.video_title as string ?? "").slice(0, 40)}`,
    );
  }
  const result = await execute(
    `DELETE FROM low_follower_samples
       WHERE platform_id = 'xiaohongshu'
         AND (weighted_interaction < 200 OR author_followers < 10)`,
  );
  console.log(`\ndeleted: ${(result as any).affectedRows} rows`);

  const remain = (await query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM low_follower_samples WHERE platform_id = 'xiaohongshu'`,
  )) as Array<{ n: number }>;
  console.log(`xhs remaining: ${remain[0]?.n}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
