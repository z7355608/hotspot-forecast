/**
 * 临时脚本：检查低粉爆款库内容是否符合"中腰部创作者可复刻"的目标。
 * 维度：
 *  1) content_form 分布
 *  2) track_tags 全展开 top
 *  3) burst_reasons 全展开 top
 *  4) newbie_friendly 直方分布 + 整体均值
 *  5) seed_topic 全列表
 *  6) 抽样 8 条 viral_score 最高的看具体内容（标题 + 标签 + 新手友好度）
 *  7) 抽样 8 条 newbie_friendly 最低的
 */
import "dotenv/config";
import { query } from "../legacy/database";

async function main() {
  const total = await query<any[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  console.log("total =", total[0]?.c);

  const cf = await query<any[]>(
    `SELECT IFNULL(content_form,'(null)') AS cf, COUNT(*) AS c
     FROM low_follower_samples GROUP BY cf ORDER BY c DESC`,
  );
  console.log("\n[content_form 分布]");
  console.table(cf);

  const tags = await query<any[]>(`
    SELECT JSON_UNQUOTE(t.tag) AS tag, COUNT(*) AS c
    FROM low_follower_samples,
         JSON_TABLE(track_tags, '$[*]' COLUMNS(tag JSON PATH '$')) AS t
    WHERE track_tags IS NOT NULL AND JSON_LENGTH(track_tags) > 0
    GROUP BY tag
    ORDER BY c DESC
    LIMIT 25
  `);
  console.log("\n[track_tags top25]");
  console.table(tags);

  const reasons = await query<any[]>(`
    SELECT JSON_UNQUOTE(r.reason) AS reason, COUNT(*) AS c
    FROM low_follower_samples,
         JSON_TABLE(burst_reasons, '$[*]' COLUMNS(reason JSON PATH '$')) AS r
    WHERE burst_reasons IS NOT NULL AND JSON_LENGTH(burst_reasons) > 0
    GROUP BY reason
    ORDER BY c DESC
  `);
  console.log("\n[burst_reasons 全分布]");
  console.table(reasons);

  const nfBuckets = await query<any[]>(`
    SELECT
      CASE
        WHEN newbie_friendly IS NULL THEN 'null'
        WHEN newbie_friendly < 30 THEN '0-29 难复刻'
        WHEN newbie_friendly < 50 THEN '30-49'
        WHEN newbie_friendly < 70 THEN '50-69 中等'
        WHEN newbie_friendly < 85 THEN '70-84 较易'
        ELSE '85-100 极易'
      END AS bucket,
      COUNT(*) AS c,
      ROUND(AVG(newbie_friendly),1) AS avg_nf
    FROM low_follower_samples
    GROUP BY bucket
    ORDER BY bucket
  `);
  console.log("\n[newbie_friendly 分布]");
  console.table(nfBuckets);

  const overall = await query<any[]>(
    `SELECT ROUND(AVG(newbie_friendly),1) AS avg_nf,
            MIN(newbie_friendly) AS min_nf,
            MAX(newbie_friendly) AS max_nf
     FROM low_follower_samples WHERE newbie_friendly IS NOT NULL`,
  );
  console.log("newbie_friendly 整体:", overall[0]);

  const seeds = await query<any[]>(
    `SELECT IFNULL(seed_topic,'(null)') AS seed, COUNT(*) AS c
     FROM low_follower_samples GROUP BY seed ORDER BY c DESC`,
  );
  console.log("\n[seed_topic 全列表]");
  console.table(seeds);

  const topByScore = await query<any[]>(`
    SELECT platform_id, SUBSTRING(video_title,1,60) AS title,
           viral_score, newbie_friendly,
           track_tags, burst_reasons, seed_topic
    FROM low_follower_samples
    ORDER BY viral_score DESC LIMIT 8
  `);
  console.log("\n[viral_score top8 详情]");
  for (const r of topByScore) {
    console.log("--");
    console.log(JSON.stringify(r, null, 2));
  }

  const lowNf = await query<any[]>(`
    SELECT platform_id, SUBSTRING(video_title,1,60) AS title,
           viral_score, newbie_friendly,
           track_tags, burst_reasons, seed_topic
    FROM low_follower_samples
    WHERE newbie_friendly IS NOT NULL
    ORDER BY newbie_friendly ASC LIMIT 8
  `);
  console.log("\n[newbie_friendly 最低 8 条 — 难复刻样本]");
  for (const r of lowNf) {
    console.log("--");
    console.log(JSON.stringify(r, null, 2));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
