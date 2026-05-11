/**
 * ADR-0008 主入口 — 低粉爆款管线 C(搜索补样)
 *
 * 流程(每个 keyword):
 *   L1 search → L2 video_detail → L3 user_profile → 过滤 → LLM prefilter(带 SEO 反堆词约束)→ cleaner 入库 → UPDATE source/industry/reason
 *
 * 用法:
 *   pnpm tsx server/scripts/run-search-pipeline.ts --backfill   # 首次:30kw × 2页 × 20条
 *   pnpm tsx server/scripts/run-search-pipeline.ts              # cron: 30kw × 1页
 *   pnpm tsx server/scripts/run-search-pipeline.ts --keywords=口播文案,健身干货  # 限定关键词
 *   pnpm tsx server/scripts/run-search-pipeline.ts --dry-run    # 跑全链不入库
 *
 * 调度(cron):每周一 09:00 默认模式,见 docs/deployment.md
 */
import "dotenv/config";
import { execute } from "../legacy/database";
import { cleanAndPersistLowFollowerSamples, type TikHubRawRecord } from "../legacy/low-follower-cleaner";
import {
  prefilterBillboardSamples,
  SEARCH_EXTRA_INSTRUCTIONS,
  type PrefilterInput,
} from "../services/low-follower-billboard-prefilter";
import { assessLowFollowerCommercialQuality } from "../legacy/low-follower-commercial-quality";
import {
  searchVideosByKeyword,
  enrichSearchSamples,
  type SearchKeywordSpec,
  type EnrichedSearchSample,
  type SearchAwemeRaw,
} from "../services/low-follower-search-pipeline";
import { createModuleLogger } from "../legacy/logger";

const log = createModuleLogger("LFSearchPipelineRun");

const PASS_RATE_ALERT_THRESHOLD = 0.1;
const PAGE_SIZE_PER_KW = 20; // search 接口实测一次返 ~19 条

/** ADR-0008 §Step 1 校准结果 — 30 关键词,行业 × 内容类型矩阵 */
const SEARCH_KEYWORDS: SearchKeywordSpec[] = [
  { keyword: "美食教程",       industry: "美食",     type: "干货" },
  { keyword: "美食测评 平替",  industry: "美食",     type: "带货" },
  { keyword: "美妆干货",       industry: "美妆",     type: "口播/干货" },
  { keyword: "美妆测评 平替",  industry: "美妆",     type: "带货" },
  { keyword: "穿搭干货",       industry: "穿搭",     type: "口播/干货" },
  { keyword: "平价穿搭 推荐",  industry: "穿搭",     type: "带货" },
  { keyword: "健身干货",       industry: "健身",     type: "干货" },
  { keyword: "减脂教程",       industry: "健身",     type: "干货" },
  { keyword: "育儿干货",       industry: "母婴",     type: "口播/干货" },
  { keyword: "母婴好物 推荐",  industry: "母婴",     type: "带货" },
  { keyword: "数码测评",       industry: "数码",     type: "带货" },
  { keyword: "AI工具 教程",    industry: "数码/AI",  type: "干货" },
  { keyword: "AI工具 推荐",    industry: "数码/AI",  type: "带货" },
  { keyword: "家居好物 推荐",  industry: "家居",     type: "带货" },
  { keyword: "收纳干货",       industry: "家居",     type: "干货" },
  { keyword: "汽车测评",       industry: "汽车",     type: "带货" },
  { keyword: "养猫干货",       industry: "宠物",     type: "干货" },
  { keyword: "养狗教程",       industry: "宠物",     type: "干货" },
  { keyword: "职场干货",       industry: "职场",     type: "口播/干货" },
  { keyword: "副业 攻略",      industry: "职场",     type: "干货" },
  { keyword: "考研干货",       industry: "教育",     type: "干货" },
  { keyword: "英语学习 教程",  industry: "教育",     type: "干货" },
  { keyword: "旅行攻略",       industry: "旅行",     type: "干货" },
  { keyword: "穷游 攻略",      industry: "旅行",     type: "干货" },
  { keyword: "情感干货",       industry: "情感心理", type: "口播" },
  { keyword: "心理学 科普",    industry: "情感心理", type: "口播/干货" },
  { keyword: "生活小窍门",     industry: "生活技能", type: "干货" },
  { keyword: "省钱攻略",       industry: "生活技能", type: "干货" },
  { keyword: "拍照教程",       industry: "摄影",     type: "干货" },
  { keyword: "口播文案 模板",  industry: "通用",     type: "口播" },
];

interface CliArgs {
  backfill: boolean;
  keywords: string[] | null; // null = all
  dryRun: boolean;
}

function parseCliArgs(): CliArgs {
  const backfill = process.argv.includes("--backfill");
  const dryRun = process.argv.includes("--dry-run");
  const kwArg = process.argv.find((a) => a.startsWith("--keywords="));
  const keywords = kwArg ? kwArg.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  return { backfill, keywords, dryRun };
}

function enrichedToRaw(s: EnrichedSearchSample): TikHubRawRecord {
  return {
    aweme_id: s.awemeId,
    desc: s.desc,
    title: s.desc,
    statistics: {
      play_count: s.videoViews,
      digg_count: s.videoLikes,
      like_count: s.videoLikes,
      comment_count: s.videoComments,
      collect_count: s.videoCollects,
      share_count: s.videoShares,
    },
    author: {
      uid: s.authorUid,
      sec_uid: s.authorSecUid,
      nickname: s.authorNickname,
      follower_count: s.authorFollowers,
      fans_count: s.authorFollowers,
    },
    create_time: s.publishTime ?? undefined,
    publish_time: s.publishTime ?? undefined,
    share_url: s.shareUrl ?? undefined,
    video_cover: s.coverUrl ? { url_list: [s.coverUrl] } : undefined,
    text_extra: s.hashtags.map((name) => ({ hashtag_name: name })),
    platform: "douyin",
  };
}

async function main() {
  const args = parseCliArgs();
  const startedAt = Date.now();

  // 选关键词子集
  const targetKws = args.keywords
    ? SEARCH_KEYWORDS.filter((k) => args.keywords!.some((q) => k.keyword.includes(q)))
    : SEARCH_KEYWORDS;
  const pagesPerKw = args.backfill ? 2 : 1;

  console.log("=== ADR-0008 search pipeline ===");
  console.log(
    `mode: ${args.backfill ? "backfill" : "cron"} | keywords: ${targetKws.length}/${SEARCH_KEYWORDS.length} | pages/kw: ${pagesPerKw}` +
      `${args.dryRun ? " [dry-run 不入库]" : ""}`,
  );

  // ---------- Step 1+2+3:每个关键词 search→detail→profile,合并去重 ----------
  console.log("\n→ Step 1-3:遍历关键词,L1 search → L2 detail → L3 user_profile");
  // dedup by aweme_id;value 包含 enrichment 后的样本
  const enrichedMap = new Map<string, EnrichedSearchSample>();
  let totalRawCandidates = 0;
  let totalSkipped = 0;
  const skippedByReason: Record<string, number> = {};

  for (const kw of targetKws) {
    const allAwemes: SearchAwemeRaw[] = [];
    for (let p = 0; p < pagesPerKw; p++) {
      // 注:fetch_general_search_v2 用 cursor 翻页,但本 ADR backfill 简化为单次"search"调用
      // 多页可在后续优化(目前 search 单调用返 ~19 条已足够 backfill)
      const list = await searchVideosByKeyword(kw.keyword);
      allAwemes.push(...list);
      if (p === 0 && list.length === 0) break; // 首页空就别试 page 2
    }
    totalRawCandidates += allAwemes.length;

    const { enriched, skipped } = await enrichSearchSamples({
      awemeList: allAwemes,
      fromKeyword: kw.keyword,
      industry: kw.industry,
      contentType: kw.type,
      followerCeiling: 50_000,
      minLikes: 1_000,
    });
    totalSkipped += skipped.length;
    for (const s of skipped) {
      const reason = s.reason.split(/\s/)[0] + (s.reason.includes(">") ? " 超低粉上限" : "");
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    }

    let added = 0;
    for (const e of enriched) {
      if (!enrichedMap.has(e.awemeId)) {
        enrichedMap.set(e.awemeId, e);
        added++;
      }
    }
    console.log(
      `  · [${kw.industry}/${kw.type}] "${kw.keyword}" — search ${allAwemes.length} | enrich ${enriched.length} (skip ${skipped.length}) | new ${added}`,
    );
  }

  const totalEnriched = enrichedMap.size;
  console.log(`\n  汇总:候选 ${totalRawCandidates} → enrichment 通过 ${totalEnriched}(去重后)| 跳过 ${totalSkipped}`);
  console.log("  skip reasons:", skippedByReason);
  if (totalEnriched === 0) {
    console.log("无样本通过 enrichment,管线结束");
    process.exit(0);
  }

  // ---------- Step 4:LLM 预检查(SEO 反堆词约束) ----------
  console.log("\n→ Step 4:LLM 预检查(doubao + SEARCH_EXTRA_INSTRUCTIONS)");
  const prefilterInputs: PrefilterInput[] = [];
  for (const [, e] of enrichedMap) {
    prefilterInputs.push({
      platformId: e.awemeId,
      title: e.desc,
      hashtags: e.hashtags,
      industryTop: e.industry,
      industrySubGuess: e.contentType,
    });
  }
  const { results, batchesAttempted, batchesFailed } = await prefilterBillboardSamples(
    prefilterInputs,
    SEARCH_EXTRA_INSTRUCTIONS,
  );
  const llmPassed = results.filter((r) => r.isTargetAudience);
  const commercialRejected = llmPassed.filter((r) => {
    const e = enrichedMap.get(r.platformId);
    const quality = assessLowFollowerCommercialQuality({
      source: "search",
      title: e?.desc ?? "",
      hashtags: e?.hashtags ?? [],
      trackTags: [e?.industry, e?.contentType, r.industrySubRefined].filter(Boolean) as string[],
      prefilterReason: r.reason,
      seedTopic: e ? `search:${e.fromKeyword}` : "search",
    });
    return !quality.accepted;
  });
  const commercialRejectedIds = new Set(commercialRejected.map((r) => r.platformId));
  const passed = llmPassed.filter((r) => !commercialRejectedIds.has(r.platformId));
  const passRate = totalEnriched > 0 ? passed.length / totalEnriched : 0;
  console.log(
    `  ✓ 预检查完成:批 ${batchesAttempted}(失败 ${batchesFailed}),通过 ${passed.length}/${totalEnriched}` +
      ` (${(passRate * 100).toFixed(1)}%),商业化规则拦截 ${commercialRejected.length} 条`,
  );
  for (const r of commercialRejected.slice(0, 5)) {
    const e = enrichedMap.get(r.platformId);
    const quality = assessLowFollowerCommercialQuality({
      source: "search",
      title: e?.desc ?? "",
      hashtags: e?.hashtags ?? [],
      trackTags: [e?.industry, e?.contentType, r.industrySubRefined].filter(Boolean) as string[],
      prefilterReason: r.reason,
      seedTopic: e ? `search:${e.fromKeyword}` : "search",
    });
    console.log(`    - 商业化拦截 [${r.platformId}] ${e?.desc.slice(0, 42)} | ${quality.reasons.join("；")}`);
  }
  if (passRate < PASS_RATE_ALERT_THRESHOLD) {
    log.error(
      { passRate, total: totalEnriched, passed: passed.length, threshold: PASS_RATE_ALERT_THRESHOLD },
      `🚨 预检查通过率 < 10%,请检查 prompt 或关键词集`,
    );
  }
  if (passed.length === 0) {
    console.log("无样本通过预检查,管线结束");
    process.exit(0);
  }

  if (args.dryRun) {
    console.log("\n[dry-run] 通过样本前 10 条:");
    for (const r of passed.slice(0, 10)) {
      const e = enrichedMap.get(r.platformId);
      console.log(
        `  + [${r.platformId}] [${e?.industry}/${e?.contentType}] fans=${e?.authorFollowers} likes=${e?.videoLikes} | ${e?.desc.slice(0, 50)} | ${r.reason}`,
      );
    }
    process.exit(0);
  }

  // ---------- Step 5:入库(走 cleaner) ----------
  console.log("\n→ Step 5:入库(走 cleaner)");
  // cleaner 按 platform/seedTopic 分组算 P75,所以按 keyword 分组入库,保持算法语义
  const byKeyword = new Map<string, EnrichedSearchSample[]>();
  for (const r of passed) {
    const e = enrichedMap.get(r.platformId);
    if (!e) continue;
    if (!byKeyword.has(e.fromKeyword)) byKeyword.set(e.fromKeyword, []);
    byKeyword.get(e.fromKeyword)!.push(e);
  }

  let totalPersisted = 0;
  for (const [kw, samples] of byKeyword) {
    const rawRecords = samples.map(enrichedToRaw);
    const res = await cleanAndPersistLowFollowerSamples({
      rawRecords,
      platform: "douyin",
      seedTopic: `search:${kw}`,
      algorithmConfig: {
        followerCeiling: 50_000, // 与 ADR-0008 §Step 4 一致
        minFanEfficiency: 0.05,
        recencyDays: 90, // 搜索结果可能不那么新,放宽
      },
      persist: true,
    });
    totalPersisted += res.persistedCount;
    console.log(`  · [${kw}] cleaner 入库 ${res.persistedCount}/${samples.length}`);
  }

  // ---------- Step 6:回填 source / industry_top / industry_sub / prefilter_reason ----------
  console.log("\n→ Step 6:回填 source / industry_*/ prefilter_reason");
  let updated = 0;
  for (const r of passed) {
    const e = enrichedMap.get(r.platformId);
    if (!e) continue;
    const u = await execute(
      `UPDATE low_follower_samples
       SET source = 'search',
           industry_top = ?,
           industry_sub = ?,
           prefilter_reason = ?
       WHERE video_id = ? AND platform_id = 'douyin'`,
      [
        e.industry,
        r.industrySubRefined ?? e.contentType,
        `[${e.contentType}] ${r.reason}`,
        e.awemeId,
      ],
    );
    updated += u.affectedRows;
  }
  console.log(`  ✓ 回填 ${updated} 行`);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n=== 管线完成 ===");
  console.log(`耗时:${elapsedSec}s`);
  console.log(`关键词:${targetKws.length} | 候选拉取:${totalRawCandidates} | enrich 通过:${totalEnriched}`);
  console.log(`预检查通过:${passed.length} (${(passRate * 100).toFixed(1)}%)`);
  console.log(`cleaner 入库:${totalPersisted} | 回填:${updated}`);
  console.log(`报警阈值:${passRate < PASS_RATE_ALERT_THRESHOLD ? "🚨 触发" : "✓ 正常"}`);
  process.exit(0);
}

main().catch((e) => {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "FATAL");
  console.error("FATAL:", e);
  process.exit(1);
});
