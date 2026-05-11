/**
 * scripts/seed-bilibili-samples.ts
 *
 * 一次性脚本：把 B 站综合热门入低粉爆款库，作为快手 / 视频号 之外的稳定第三平台。
 *
 * 流程：
 *   1. fetchBilibiliPopularSamples(pages=3) — 拉 ~60 条最新综合热门视频
 *      内含 enrich：每个 UP 主调一次 fetch_user_relation_stat 拿 follower
 *   2. 喂给 cleanAndPersistLowFollowerSamples(platform: "bilibili")
 *      算法严格判定：follower < 10000 + 加权互动 >= p75 + fan_efficiency >= 0.5
 *   3. 入库 low_follower_samples 表
 *
 * 用法：npx tsx scripts/seed-bilibili-samples.ts
 */

import "dotenv/config";
import { fetchBilibiliPopularSamples } from "../server/services/bilibili-collector";
import { cleanAndPersistLowFollowerSamples } from "../server/legacy/low-follower-cleaner";

async function main() {
  console.log("=== seed-bilibili-samples start ===");

  console.log("\n[1/2] fetching bilibili popular feed (pages=3)...");
  const records = await fetchBilibiliPopularSamples(3);
  console.log(`    got ${records.length} records`);
  if (records.length === 0) {
    console.warn("    no records to persist — bilibili API may be down");
    process.exit(0);
  }

  // 统计粉丝分布让用户能看到多少条满足"低粉"条件
  const fanCounts = records.map((r) => r.author?.follower_count ?? 0);
  const lowFans = fanCounts.filter((f) => f > 0 && f < 10000).length;
  const sorted = [...fanCounts].sort((a, b) => a - b);
  console.log(
    `    follower distribution: 0=${fanCounts.filter((f) => f === 0).length} ` +
      `<10000=${lowFans} ` +
      `>=10000=${fanCounts.filter((f) => f >= 10000).length} ` +
      `median=${sorted[Math.floor(sorted.length / 2)] ?? 0}`,
  );

  console.log("\n[2/2] cleanAndPersistLowFollowerSamples (bilibili)...");
  try {
    const result = await cleanAndPersistLowFollowerSamples({
      rawRecords: records,
      platform: "bilibili",
      seedTopic: "B 站综合热门",
      industryName: "B 站综合",
      persist: true,
    });
    console.log(
      `    runId=${result.runId} persistedCount=${result.persistedCount} ` +
        `success=${result.persistSuccess} ` +
        `${result.error ? `error=${result.error}` : ""}`,
    );
    console.log(
      `    algorithm strictHits=${result.algorithmResult.samples.filter((s) => s.isStrictAnomaly).length} ` +
        `looseHits=${result.algorithmResult.samples.filter((s) => !s.isStrictAnomaly).length}`,
    );
  } catch (err) {
    console.error("persist failed:", err);
    process.exit(1);
  }

  console.log("\n=== seed-bilibili-samples done ===");
  process.exit(0);
}

main().catch((err) => { console.error("seed failed:", err); process.exit(1); });
