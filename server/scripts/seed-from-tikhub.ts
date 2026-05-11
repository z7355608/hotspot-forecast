/**
 * 从 TikHub 拉真实低粉爆款数据，写入 low_follower_samples。
 *
 * 用法：
 *   npx tsx server/scripts/seed-from-tikhub.ts                # 全平台
 *   npx tsx server/scripts/seed-from-tikhub.ts --platform=douyin
 *   npx tsx server/scripts/seed-from-tikhub.ts --platform=xiaohongshu
 *   npx tsx server/scripts/seed-from-tikhub.ts --platform=kuaishou
 *
 * 各平台采集策略：
 *   - 抖音：3 个原生 billboard × 5 页 × 10 条
 *   - 小红书：原生热点 web_v2/fetch_hot_list（无低粉榜，靠后置过滤）
 *   - 快手：原生 web/fetch_kuaishou_hot_list_v2（无低粉榜，靠后置过滤）
 *
 * 共同后置：cleanAndPersistLowFollowerSamples 内会算 P75 + 粉丝地板，
 * 通过算法配置 followerCeiling=10000 自动剔除大粉账号。
 */
import "dotenv/config";
import { getTikHub, postTikHub } from "../legacy/tikhub";
import {
  cleanAndPersistLowFollowerSamples,
  type TikHubRawRecord,
} from "../legacy/low-follower-cleaner";
import { execute, query } from "../legacy/database";

type SupportedPlatform = "douyin" | "xiaohongshu" | "kuaishou";

const DOUYIN_ENDPOINTS = [
  "/api/v1/douyin/billboard/fetch_hot_total_low_fan_list",
  "/api/v1/douyin/billboard/fetch_hot_total_high_like_list",
  "/api/v1/douyin/billboard/fetch_hot_total_high_play_list",
];
const PAGES_PER_ENDPOINT = 5;
const PAGE_SIZE = 10;

interface BillboardItem {
  item_id: string;
  item_title: string;
  item_cover_url?: string;
  item_url?: string;
  nick_name?: string;
  fans_cnt?: number;
  play_cnt?: number;
  like_cnt?: number;
  publish_time?: number;
}

function extractHashtags(title: string): string[] {
  if (!title) return [];
  return (title.match(/#([^\s#]+)/g) ?? [])
    .map((m) => m.slice(1).trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────
// 抖音：原生 billboard
// ─────────────────────────────────────────────

function douyinItemToRaw(item: BillboardItem): TikHubRawRecord {
  const tags = extractHashtags(item.item_title || "");
  return {
    aweme_id: String(item.item_id),
    desc: item.item_title,
    title: item.item_title,
    statistics: {
      play_count: item.play_cnt,
      digg_count: item.like_cnt,
    },
    author: {
      nickname: item.nick_name ?? "未知作者",
      fans_count: item.fans_cnt,
    },
    create_time: item.publish_time,
    publish_time: item.publish_time,
    share_url: item.item_url,
    video_cover: item.item_cover_url ? { url_list: [item.item_cover_url] } : undefined,
    text_extra: tags.map((name) => ({ hashtag_name: name })),
    platform: "douyin",
  };
}

async function fetchDouyinBillboard(path: string): Promise<BillboardItem[]> {
  const all: BillboardItem[] = [];
  for (let page = 1; page <= PAGES_PER_ENDPOINT; page++) {
    const r = await postTikHub<any>(path, {
      page,
      page_size: PAGE_SIZE,
      date_window: 168,
    });
    if (!r.ok) {
      console.warn(`  ✗ ${path} page ${page} failed HTTP ${r.httpStatus}`);
      break;
    }
    const objs = r.payload?.data?.data?.objs ?? [];
    if (!Array.isArray(objs) || objs.length === 0) break;
    all.push(...objs);
    console.log(`  · ${path} page ${page}: +${objs.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  return all;
}

async function seedDouyin(): Promise<number> {
  console.log("\n→ 抖音 billboard");
  const raws: BillboardItem[] = [];
  for (const path of DOUYIN_ENDPOINTS) {
    raws.push(...(await fetchDouyinBillboard(path)));
  }
  const seen = new Map<string, BillboardItem>();
  for (const it of raws) {
    if (it.item_id && !seen.has(String(it.item_id))) seen.set(String(it.item_id), it);
  }
  const dedup = Array.from(seen.values());
  if (dedup.length === 0) return 0;

  const rawRecords = dedup.map(douyinItemToRaw);
  const res = await cleanAndPersistLowFollowerSamples({
    rawRecords,
    platform: "douyin",
    seedTopic: "全网热门",
    algorithmConfig: {
      followerCeiling: 1_000_000,
      minFanEfficiency: 0.1,
      recencyDays: 60,
    },
    persist: true,
  });
  console.log(`  抖音 persisted=${res.persistedCount}/${rawRecords.length}`);
  return res.persistedCount;
}

// ─────────────────────────────────────────────
// 小红书：原生热点 → 取出笔记记录
// ─────────────────────────────────────────────

async function seedXiaohongshu(): Promise<number> {
  console.log("\n→ 小红书 hot_list");
  // 原生热榜接口：web_v2/fetch_hot_list（已在 tikhub.ts 的可缓存白名单里）
  const r = await getTikHub<any>("/api/v1/xiaohongshu/web_v2/fetch_hot_list");
  if (!r.ok) {
    console.warn(`  ✗ 小红书热榜 HTTP ${r.httpStatus}`);
    return 0;
  }
  // 不同版本 schema 不一定一致，做尽量宽的字段提取
  const data = (r.payload?.data ?? r.payload) as Record<string, any> | undefined;
  const rawList: any[] =
    data?.note_list ??
    data?.notes ??
    data?.items ??
    data?.data ??
    [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.warn(`  ✗ 小红书热榜无数据 schema:${Object.keys(data ?? {}).join(",")}`);
    return 0;
  }

  const rawRecords: TikHubRawRecord[] = rawList.map((n) => {
    const note = (n?.note_card ?? n?.note ?? n) as Record<string, any>;
    const interactInfo = (note?.interact_info ?? note?.interactInfo ?? {}) as Record<string, any>;
    const user = (note?.user ?? note?.author ?? {}) as Record<string, any>;
    const cover = (note?.cover ?? note?.image_list?.[0] ?? {}) as Record<string, any>;

    const noteId = note?.note_id ?? note?.id ?? note?.noteId ?? "";
    return {
      note_id: String(noteId),
      desc: note?.title ?? note?.desc ?? "",
      title: note?.title ?? "",
      statistics: {
        like_count: Number(interactInfo.liked_count ?? interactInfo.likeCount ?? 0) || undefined,
        comment_count: Number(interactInfo.comment_count ?? interactInfo.commentCount ?? 0) || undefined,
        collect_count: Number(interactInfo.collected_count ?? interactInfo.collectCount ?? 0) || undefined,
        share_count: Number(interactInfo.shared_count ?? interactInfo.shareCount ?? 0) || undefined,
      },
      author: {
        uid: String(user?.user_id ?? user?.userId ?? ""),
        nickname: user?.nickname ?? user?.nick_name ?? "未知作者",
        // 列表接口里通常没有粉丝数；交给 cleaner 的 enrichXhsAuthor 补
        fans_count: typeof user?.fans === "number" ? user.fans : undefined,
      },
      publish_time: note?.time ? Math.floor(Number(note.time) / 1000) : undefined,
      share_url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : undefined,
      video_cover: cover?.url ? { url_list: [String(cover.url)] } : undefined,
      platform: "xiaohongshu",
    };
  });

  const valid = rawRecords.filter((r) => r.note_id);
  if (valid.length === 0) return 0;

  const res = await cleanAndPersistLowFollowerSamples({
    rawRecords: valid,
    platform: "xiaohongshu",
    seedTopic: "小红书热门",
    algorithmConfig: {
      followerCeiling: 1_000_000,
      minFanEfficiency: 0.05,
      recencyDays: 60,
    },
    persist: true,
  });
  console.log(`  小红书 persisted=${res.persistedCount}/${valid.length}`);
  return res.persistedCount;
}

// ─────────────────────────────────────────────
// 快手：原生热点
// ─────────────────────────────────────────────

async function seedKuaishou(): Promise<number> {
  console.log("\n→ 快手 hot_list_v2");
  const r = await getTikHub<any>(
    "/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2",
  );
  if (!r.ok) {
    console.warn(`  ✗ 快手热榜 HTTP ${r.httpStatus}`);
    return 0;
  }
  const data = (r.payload?.data ?? r.payload) as Record<string, any> | undefined;
  const rawList: any[] =
    data?.feeds ??
    data?.photos ??
    data?.list ??
    data?.items ??
    data?.data ??
    [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.warn(`  ✗ 快手热榜无数据 schema:${Object.keys(data ?? {}).join(",")}`);
    return 0;
  }

  const rawRecords: TikHubRawRecord[] = rawList.map((n) => {
    const photo = (n?.photo ?? n) as Record<string, any>;
    const photoId = photo?.photo_id ?? photo?.photoId ?? photo?.id ?? "";
    return {
      aweme_id: String(photoId), // 复用 aweme_id 作为通用 ID 字段
      desc: photo?.caption ?? photo?.photo_caption ?? "",
      title: photo?.caption ?? "",
      statistics: {
        play_count: Number(photo?.view_count ?? photo?.viewCount ?? 0) || undefined,
        like_count: Number(photo?.like_count ?? photo?.likeCount ?? 0) || undefined,
        comment_count: Number(photo?.comment_count ?? photo?.commentCount ?? 0) || undefined,
        share_count: Number(photo?.share_count ?? photo?.shareCount ?? 0) || undefined,
        collect_count: Number(photo?.collect_count ?? photo?.collectCount ?? 0) || undefined,
      },
      author: {
        uid: String(photo?.user_id ?? photo?.userId ?? ""),
        nickname: photo?.user_name ?? photo?.userName ?? "未知作者",
        fans_count: typeof photo?.fansCount === "number" ? photo.fansCount : undefined,
      },
      create_time: photo?.timestamp ? Math.floor(Number(photo.timestamp) / 1000) : undefined,
      publish_time: photo?.timestamp ? Math.floor(Number(photo.timestamp) / 1000) : undefined,
      share_url: photoId ? `https://www.kuaishou.com/short-video/${photoId}` : undefined,
      video_cover: photo?.thumbnail_url
        ? { url_list: [String(photo.thumbnail_url)] }
        : Array.isArray(photo?.cover_thumbnail_urls) && photo.cover_thumbnail_urls[0]?.url
          ? { url_list: [String(photo.cover_thumbnail_urls[0].url)] }
          : undefined,
      platform: "kuaishou",
    };
  });

  const valid = rawRecords.filter((r) => r.aweme_id);
  if (valid.length === 0) return 0;

  const res = await cleanAndPersistLowFollowerSamples({
    rawRecords: valid,
    platform: "kuaishou",
    seedTopic: "快手热门",
    algorithmConfig: {
      followerCeiling: 1_000_000,
      minFanEfficiency: 0.05,
      recencyDays: 60,
    },
    persist: true,
  });
  console.log(`  快手 persisted=${res.persistedCount}/${valid.length}`);
  return res.persistedCount;
}

// ─────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────

function parseTargetPlatforms(): SupportedPlatform[] {
  const arg = process.argv.find((a) => a.startsWith("--platform="));
  const value = (arg?.split("=")[1] ?? "all").toLowerCase();
  if (value === "all") return ["douyin", "xiaohongshu", "kuaishou"];
  if (value === "douyin" || value === "xiaohongshu" || value === "kuaishou") return [value];
  console.error(`未知 --platform=${value}，可选 douyin|xiaohongshu|kuaishou|all`);
  process.exit(1);
}

async function main() {
  const targets = parseTargetPlatforms();
  console.log(`=== 阶段 1：从 TikHub 抓取（platforms=${targets.join(",")}）===`);

  let totalPersisted = 0;
  for (const platform of targets) {
    if (platform === "douyin") totalPersisted += await seedDouyin();
    else if (platform === "xiaohongshu") totalPersisted += await seedXiaohongshu();
    else if (platform === "kuaishou") totalPersisted += await seedKuaishou();
  }
  console.log(`\n累计入库：${totalPersisted}`);

  console.log("\n=== 阶段 2：按 video_title 首个 #hashtag 改写 seed_topic ===");
  const rows = await query<any[]>(
    `SELECT id, video_title FROM low_follower_samples`,
  );
  let updated = 0;
  for (const row of rows) {
    const tags = extractHashtags(row.video_title || "");
    const seed = tags[0];
    if (!seed) continue;
    await execute(`UPDATE low_follower_samples SET seed_topic = ? WHERE id = ?`, [
      seed,
      row.id,
    ]);
    updated++;
  }
  console.log(`updated seed_topic for ${updated}/${rows.length} rows`);

  console.log("\n=== 阶段 3：DB 校验 ===");
  const total = await query<any[]>(`SELECT COUNT(*) AS c FROM low_follower_samples`);
  const platformDist = await query<any[]>(
    `SELECT platform_id, COUNT(*) AS c FROM low_follower_samples GROUP BY platform_id ORDER BY c DESC`,
  );
  const distinctTopics = await query<any[]>(
    `SELECT COUNT(DISTINCT seed_topic) AS c FROM low_follower_samples WHERE seed_topic IS NOT NULL AND seed_topic <> ''`,
  );
  const scoreDist = await query<any[]>(
    `SELECT
       SUM(CASE WHEN viral_score >= 80 THEN 1 ELSE 0 END) AS s_hi,
       SUM(CASE WHEN viral_score >= 60 AND viral_score < 80 THEN 1 ELSE 0 END) AS s_mid,
       SUM(CASE WHEN viral_score < 60 THEN 1 ELSE 0 END) AS s_lo,
       AVG(viral_score) AS avg_score, MIN(viral_score) AS min_s, MAX(viral_score) AS max_s
     FROM low_follower_samples`,
  );
  console.log(`总入库：${total[0]?.c}`);
  console.log(`平台分布：`, JSON.stringify(platformDist));
  console.log(`distinct seed_topics：${distinctTopics[0]?.c}`);
  console.log(`score 分布：`, JSON.stringify(scoreDist[0]));

  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
