/**
 * ADR-0007 主入口 — 低粉爆款 billboard 入库管线(管线 B)
 *
 * **2026-04-30 实测降级**:fetch_hot_total_low_fan_list 接口的 `tags` 参数实测**所有结构都被拒**
 * (`code=5 参数不合法`),date_window 实际是预定义枚举(可用值:24=近1天、168=近7天),
 * 不是用户引用的"1=按小时 2=按天"。所以管线 B 降级为:
 *   - 不分行业(全网低粉爆款榜)
 *   - date_window=24(=近 24 小时,语义最接近"按天")
 *   - industry_top/industry_sub 字段本次都填 NULL,字段保留供未来 TikHub 增强 tags 支持时启用
 *
 * 流程:
 *   1. POST fetch_hot_total_low_fan_list,翻页 page=1..K 直到 objs 空或不满 page_size
 *      初始阶段(--init):只拉 1 页(20 条);正常阶段:拉满 MAX_PAGES_NORMAL 页
 *   2. dedup by item_id
 *   3. LLM 预检查批 10(prefilterBillboardSamples)
 *   4. 通过的样本走 cleanAndPersistLowFollowerSamples 入库
 *   5. 入库后 UPDATE source='billboard' + prefilter_reason
 *   6. 输出统计;通过率 < 10% 触发 log.error 报警(ADR §G)
 *
 * 用法:
 *   pnpm tsx server/scripts/run-billboard-pipeline.ts --init      # 初始阶段(1 页)
 *   pnpm tsx server/scripts/run-billboard-pipeline.ts             # 正常阶段(拉到接口空)
 *   pnpm tsx server/scripts/run-billboard-pipeline.ts --pages=3   # 显式覆盖页数
 *   pnpm tsx server/scripts/run-billboard-pipeline.ts --dry-run   # 不入库,只跑预检查并打印
 *
 * 调度:cron 每天 08:00,见 docs/deployment.md
 */
import "dotenv/config";
import { postTikHub } from "../legacy/tikhub";
import { execute } from "../legacy/database";
import { cleanAndPersistLowFollowerSamples, type TikHubRawRecord } from "../legacy/low-follower-cleaner";
import {
  prefilterBillboardSamples,
  type PrefilterInput,
} from "../services/low-follower-billboard-prefilter";
import { assessLowFollowerCommercialQuality } from "../legacy/low-follower-commercial-quality";
import { createModuleLogger } from "../legacy/logger";

const log = createModuleLogger("LFBillboardPipeline");

const ENDPOINT = "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list";
const PAGE_SIZE = 20;
const MAX_PAGES_NORMAL = 10; // 正常阶段安全上限,防止 API 异常时无限循环
const DEFAULT_DATE_WINDOW_HOURS = 24; // 实测可用枚举:24=近1天、168=近7天;cron 日常用 24,backfill 用 168
const PASS_RATE_ALERT_THRESHOLD = 0.1; // < 10% 触发报警(ADR §G)

interface BillboardItem {
  item_id?: string;
  item_title?: string;
  item_cover_url?: string;
  item_url?: string;
  nick_name?: string;
  fans_cnt?: number;
  like_cnt?: number;
  comment_cnt?: number;
  share_cnt?: number;
  collect_cnt?: number;
  play_cnt?: number;
  publish_time?: number;
}

interface CliArgs {
  init: boolean;
  pages: number | null;
  dryRun: boolean;
  dateWindow: number;
}

function parseCliArgs(): CliArgs {
  const init = process.argv.includes("--init");
  const dryRun = process.argv.includes("--dry-run");
  const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const pages = pagesArg ? Number(pagesArg.split("=")[1]) || null : null;
  const dwArg = process.argv.find((a) => a.startsWith("--date-window="));
  const dateWindow = dwArg ? Number(dwArg.split("=")[1]) || DEFAULT_DATE_WINDOW_HOURS : DEFAULT_DATE_WINDOW_HOURS;
  return { init, pages, dryRun, dateWindow };
}

function extractHashtags(title: string): string[] {
  if (!title) return [];
  return (title.match(/#([^\s#]+)/g) ?? []).map((m) => m.slice(1).trim()).filter(Boolean);
}

function extractItems(payload: unknown): BillboardItem[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  const inner = data?.data as Record<string, unknown> | undefined;
  const objs = inner?.objs ?? data?.objs ?? data?.list;
  return Array.isArray(objs) ? (objs as BillboardItem[]) : [];
}

async function fetchAllPages(maxPages: number, dateWindow: number): Promise<BillboardItem[]> {
  const all: BillboardItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await postTikHub<unknown>(ENDPOINT, {
      page,
      page_size: PAGE_SIZE,
      date_window: dateWindow,
    });
    if (!r.ok) {
      log.warn(
        { page, httpStatus: r.httpStatus, businessCode: r.businessCode },
        `billboard fetch failed,终止翻页`,
      );
      break;
    }
    const items = extractItems(r.payload);
    if (items.length === 0) break;
    all.push(...items);
    console.log(`  · page ${page}: +${items.length} 条`);
    if (items.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return all;
}

function billboardItemToRaw(item: BillboardItem): TikHubRawRecord {
  const title = item.item_title ?? "";
  return {
    aweme_id: String(item.item_id ?? ""),
    desc: title,
    title,
    statistics: {
      play_count: item.play_cnt,
      like_count: item.like_cnt,
      digg_count: item.like_cnt,
      comment_count: item.comment_cnt,
      share_count: item.share_cnt,
      collect_count: item.collect_cnt,
    },
    author: {
      nickname: item.nick_name ?? "未知作者",
      fans_count: item.fans_cnt,
    },
    create_time: item.publish_time,
    publish_time: item.publish_time,
    share_url: item.item_url,
    video_cover: item.item_cover_url ? { url_list: [item.item_cover_url] } : undefined,
    text_extra: extractHashtags(title).map((name) => ({ hashtag_name: name })),
    platform: "douyin",
  };
}

async function main() {
  const args = parseCliArgs();
  const startedAt = Date.now();
  console.log("=== ADR-0007 billboard pipeline(全网模式)===");
  console.log(
    `mode: ${args.init ? "init(1 页)" : `normal(最多 ${args.pages ?? MAX_PAGES_NORMAL} 页)`}` +
      `${args.dryRun ? " [dry-run 不入库]" : ""} | date_window=${args.dateWindow}h`,
  );

  // ---------- Step 1:翻页拉 billboard ----------
  console.log("\n→ Step 1:翻页拉 fetch_hot_total_low_fan_list");
  const maxPages = args.init ? 1 : (args.pages ?? MAX_PAGES_NORMAL);
  const items = await fetchAllPages(maxPages, args.dateWindow);

  const dedup = new Map<string, BillboardItem>();
  for (const it of items) {
    const id = String(it.item_id ?? "");
    if (!id) continue;
    dedup.set(id, it);
  }
  const totalCandidates = dedup.size;
  console.log(`  ✓ 共拉 ${items.length} 条,去重后 ${totalCandidates} 条候选`);
  if (totalCandidates === 0) {
    console.log("无候选样本,管线结束");
    process.exit(0);
  }

  // ---------- Step 2:LLM 预检查 ----------
  console.log("\n→ Step 2:LLM 预检查(doubao,thinking 默认关,批 10)");
  const prefilterInputs: PrefilterInput[] = [];
  for (const [id, item] of dedup) {
    prefilterInputs.push({
      platformId: id,
      title: item.item_title ?? "",
      hashtags: extractHashtags(item.item_title ?? ""),
      industryTop: "全网",
      industrySubGuess: null,
    });
  }

  const { results, batchesAttempted, batchesFailed } = await prefilterBillboardSamples(prefilterInputs);
  const llmPassed = results.filter((r) => r.isTargetAudience);
  const commercialRejected = llmPassed.filter((r) => {
    const item = dedup.get(r.platformId);
    const quality = assessLowFollowerCommercialQuality({
      source: "billboard",
      title: item?.item_title ?? "",
      hashtags: extractHashtags(item?.item_title ?? ""),
      trackTags: r.industrySubRefined ? [r.industrySubRefined] : [],
      prefilterReason: r.reason,
      seedTopic: "billboard",
    });
    return !quality.accepted;
  });
  const commercialRejectedIds = new Set(commercialRejected.map((r) => r.platformId));
  const passed = llmPassed.filter((r) => !commercialRejectedIds.has(r.platformId));
  const passRate = totalCandidates > 0 ? passed.length / totalCandidates : 0;
  console.log(
    `  ✓ 预检查完成:批 ${batchesAttempted}(失败 ${batchesFailed}),通过 ${passed.length}/${totalCandidates}` +
      ` (${(passRate * 100).toFixed(1)}%),商业化规则拦截 ${commercialRejected.length} 条`,
  );
  for (const r of commercialRejected.slice(0, 5)) {
    const item = dedup.get(r.platformId);
    const quality = assessLowFollowerCommercialQuality({
      source: "billboard",
      title: item?.item_title ?? "",
      hashtags: extractHashtags(item?.item_title ?? ""),
      trackTags: r.industrySubRefined ? [r.industrySubRefined] : [],
      prefilterReason: r.reason,
      seedTopic: "billboard",
    });
    console.log(`    - 商业化拦截 [${r.platformId}] ${item?.item_title?.slice(0, 42)} | ${quality.reasons.join("；")}`);
  }

  if (passRate < PASS_RATE_ALERT_THRESHOLD) {
    log.error(
      { passRate, total: totalCandidates, passed: passed.length, threshold: PASS_RATE_ALERT_THRESHOLD },
      `🚨 预检查通过率 ${(passRate * 100).toFixed(1)}% < ${PASS_RATE_ALERT_THRESHOLD * 100}%,请检查 prompt`,
    );
  }

  if (passed.length === 0) {
    console.log("\n无样本通过预检查,管线结束");
    process.exit(0);
  }

  if (args.dryRun) {
    console.log("\n[dry-run] 通过样本前 10 条:");
    for (const r of passed.slice(0, 10)) {
      const item = dedup.get(r.platformId);
      console.log(
        `  + [${r.platformId}] sub=${r.industrySubRefined ?? "?"} | ${item?.item_title?.slice(0, 50)} | ${r.reason}`,
      );
    }
    console.log("\n=== dry-run 完成,未入库 ===");
    process.exit(0);
  }

  // ---------- Step 3:入库(走 cleaner) ----------
  console.log("\n→ Step 3:入库(走 cleaner)");
  const passedRecords: TikHubRawRecord[] = [];
  const passedMeta = new Map<string, { industrySub: string | null; reason: string }>();
  for (const r of passed) {
    const item = dedup.get(r.platformId);
    if (!item) continue;
    passedRecords.push(billboardItemToRaw(item));
    passedMeta.set(r.platformId, { industrySub: r.industrySubRefined, reason: r.reason });
  }

  const cleanerResult = await cleanAndPersistLowFollowerSamples({
    rawRecords: passedRecords,
    platform: "douyin",
    seedTopic: "billboard",
    algorithmConfig: {
      followerCeiling: 1_000_000, // billboard 已限低粉,放宽避免 cleaner 二次卡死
      minFanEfficiency: 0.05,
      recencyDays: 60,
    },
    persist: true,
  });
  console.log(`  ✓ cleaner 入库 ${cleanerResult.persistedCount}/${passedRecords.length} 条`);

  // ---------- Step 4:回填 source / industry_sub / prefilter_reason ----------
  // industry_top 留 NULL(全网管线本就无行业);industry_sub 由 LLM 推断
  console.log("\n→ Step 4:回填 source / industry_sub / prefilter_reason");
  let updated = 0;
  for (const [platformId, meta] of passedMeta) {
    const r = await execute(
      `UPDATE low_follower_samples
       SET source = 'billboard',
           industry_sub = ?,
           prefilter_reason = ?
       WHERE video_id = ? AND platform_id = 'douyin'`,
      [meta.industrySub, meta.reason, platformId],
    );
    updated += r.affectedRows;
  }
  console.log(`  ✓ 回填 ${updated} 行`);

  // ---------- Step 5:统计输出 ----------
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n=== 管线完成 ===");
  console.log(`耗时:${elapsedSec}s`);
  console.log(`候选拉取:${totalCandidates}`);
  console.log(`预检查通过:${passed.length} (${(passRate * 100).toFixed(1)}%)`);
  console.log(`cleaner 入库:${cleanerResult.persistedCount}`);
  console.log(`回填字段:${updated}`);
  console.log(`报警阈值:${passRate < PASS_RATE_ALERT_THRESHOLD ? "🚨 触发" : "✓ 正常"}`);

  process.exit(0);
}

main().catch((e) => {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "FATAL");
  console.error("FATAL:", e);
  process.exit(1);
});
