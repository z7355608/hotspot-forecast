/**
 * scripts/seed-video-stats.ts
 *
 * 一次性数据 seed 脚本，让前端的"飙升角标 + surgingTopics 端点"立刻能看到数据。
 *
 * 流程：
 *   1. 确保 viral_breakdown_cache (v11) + video_stats_history (v12) 两张表都存在；
 *      不存在就跑 schema SQL
 *   2. 跑一次 runVideoStatsCollection() — 真实拉 TikHub 当前快照（NOW）
 *   3. 把刚插入的每行复制一份，sampled_at = NOW - 12h，view_count = 当前 × 0.88-0.95
 *      （模拟"12 小时前那个时间点的播放量"，让 SQL 能立刻算出 delta）
 *      —— 这只在 seed 阶段跑一次；之后真实的 06:00/18:00 cron 会自动采新行覆盖
 *   4. 验证：跑 computeTopicSurges 打印前 5 条赛道飙升数据
 *
 * 用法：
 *   npx tsx scripts/seed-video-stats.ts
 *
 * 部署后第二次自然采集（自然 06:00 或 18:00）发生时，mock 的 12h 前那行
 * 会自然被推到 rn=3 失效，被真实数据替换。
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execute, query } from "../server/legacy/database";
import type { RowDataPacket } from "../server/legacy/database";
import { runVideoStatsCollection } from "../server/services/video-stats-collector";
import { computeTopicSurges } from "../server/services/surging-analytics";

async function ensureSchema(): Promise<void> {
  const tables = [
    {
      name: "viral_breakdown_cache",
      sqlPath: "server/legacy/database/schema-v11-viral-breakdown-cache.sql",
    },
    {
      name: "video_stats_history",
      sqlPath: "server/legacy/database/schema-v12-video-stats-history.sql",
    },
  ];
  for (const t of tables) {
    const rows = await query<RowDataPacket[]>(`SHOW TABLES LIKE ?`, [t.name]);
    if (rows.length > 0) {
      console.log(`[schema] ${t.name} already exists`);
      continue;
    }
    const sql = readFileSync(path.resolve(t.sqlPath), "utf8");
    // schema 文件内可能有多个 statement（CREATE/COMMENT 等），用 mysql2 的多语句
    // 但 execute() 默认不允许多 statement；本项目 schema 文件实际只有一个 CREATE TABLE，
    // 拆成有效语句再逐条执行
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.replace(/--[^\n]*\n/g, "").trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await execute(stmt);
    }
    console.log(`[schema] created ${t.name}`);
  }
}

async function injectMockPreviousSnapshots(): Promise<number> {
  // 把刚插入的"最新一行"复制为"12h 前"那一行：
  //   sampled_at = NOW - 12h
  //   view_count = 当前 × 0.88-0.95（模拟 5-12% 自然增长）
  //   like/comment/share/collect 同理
  // 只对今天这次 seed 跑过的行操作（用 rn=1 的最新行）
  const result = await execute(
    `INSERT INTO video_stats_history
       (platform, video_id, view_count, like_count, comment_count, share_count, collect_count, sampled_at, source)
     SELECT
       latest.platform,
       latest.video_id,
       FLOOR(latest.view_count    * (0.88 + RAND() * 0.07)),
       FLOOR(latest.like_count    * (0.88 + RAND() * 0.07)),
       FLOOR(latest.comment_count * (0.88 + RAND() * 0.07)),
       FLOOR(latest.share_count   * (0.88 + RAND() * 0.07)),
       FLOOR(latest.collect_count * (0.88 + RAND() * 0.07)),
       DATE_SUB(NOW(), INTERVAL 12 HOUR),
       'mock_seed_baseline'
     FROM (
       SELECT vh.*, ROW_NUMBER() OVER (
         PARTITION BY platform, video_id ORDER BY sampled_at DESC
       ) AS rn
       FROM video_stats_history vh
     ) latest
     WHERE latest.rn = 1`,
  );
  const affected = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
  return affected;
}

async function main() {
  console.log("=== seed-video-stats start ===");

  console.log("\n[1/4] ensure schema...");
  await ensureSchema();

  console.log("\n[2/4] real-time TikHub collection (this may take a few minutes)...");
  const collectionResult = await runVideoStatsCollection();
  console.log("collection result:", collectionResult);

  if (collectionResult.collected === 0) {
    console.warn(
      "⚠️  采集到 0 条真实数据，可能是 TikHub 余额不足 / API 限流 / 候选库为空。\n" +
        "    如果是候选库为空，先去爆款选题推荐页让爬虫跑一会，再来 seed。",
    );
  }

  console.log("\n[3/4] inject mock 12h-ago baseline rows...");
  const mockInserted = await injectMockPreviousSnapshots();
  console.log(`injected mock baseline rows: ${mockInserted}`);

  console.log("\n[4/4] verify with computeTopicSurges()...");
  const surges = await computeTopicSurges({ limit: 5 });
  console.log(`top ${surges.length} topic surges:`);
  for (const s of surges) {
    console.log(
      `  · ${s.topic.padEnd(20)}  ` +
        `videos=${String(s.videoCount).padEnd(3)} ` +
        `totalΔ=${s.totalInteractionDelta.toLocaleString().padStart(12)} ` +
        `avgΔ=${s.avgInteractionDelta.toLocaleString().padStart(8)} ` +
        `top=${s.topVideoId ?? "-"}`,
    );
  }

  console.log("\n=== seed-video-stats done ===");
  // 显式退出，避免 mysql 连接池让进程吊住
  process.exit(0);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
