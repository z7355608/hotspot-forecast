/**
 * 把 low_follower_samples.viral_score 改写成「批次内 rank 分布」
 *   - 按 weighted_interaction 倒序排（保留算法的相对排序）
 *   - rank 0  → 99 分
 *   - rank N-1 → 60 分
 *   - 中间线性映射
 *
 * 这样前端卡片不会再全是 100%，呈现合理的爆款梯度。
 *
 * 用法：npx tsx server/scripts/recompute-viral-scores.ts
 */
import "dotenv/config";
import { execute, query } from "../legacy/database";

const HIGH = 99;
const LOW = 60;

async function main() {
  const rows = await query<any[]>(
    `SELECT id, weighted_interaction, fan_efficiency_ratio, viral_score
     FROM low_follower_samples
     ORDER BY weighted_interaction DESC, fan_efficiency_ratio DESC, id ASC`,
  );
  const total = rows.length;
  if (total <= 1) {
    console.log("样本不足 2 条，无需重算。");
    process.exit(0);
  }
  console.log(`Recomputing viral_score for ${total} rows  (range ${LOW}–${HIGH})`);

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const newScore = Math.round(HIGH - ((HIGH - LOW) * i) / (total - 1));
    await execute(
      `UPDATE low_follower_samples SET viral_score = ? WHERE id = ?`,
      [newScore, rows[i].id],
    );
    updated++;
  }
  const stats = await query<any[]>(
    `SELECT MIN(viral_score) AS min_s, MAX(viral_score) AS max_s, AVG(viral_score) AS avg_s,
            SUM(CASE WHEN viral_score >= 90 THEN 1 ELSE 0 END) AS s_90,
            SUM(CASE WHEN viral_score >= 80 AND viral_score < 90 THEN 1 ELSE 0 END) AS s_80,
            SUM(CASE WHEN viral_score >= 70 AND viral_score < 80 THEN 1 ELSE 0 END) AS s_70,
            SUM(CASE WHEN viral_score < 70 THEN 1 ELSE 0 END) AS s_lt70
     FROM low_follower_samples`,
  );
  console.log(`updated ${updated} rows`);
  console.log("new score distribution:", JSON.stringify(stats[0]));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
