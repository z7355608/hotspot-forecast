/**
 * scripts/seed-xhs-ks-samples.ts (v5)
 *
 * 一次性脚本：为小红书 / 快手补低粉爆款样本。
 *
 * 历史：
 *   v1: cleanAndPersistLowFollowerSamples + 通用 walker —— 0 条
 *   v2/v3: 启发式 viral_score 直接 INSERT —— 违反"低粉爆款"产品定义，已回滚
 *   v4: 用 native trending hot list 做 keyword 池 + 真算法判定
 *       结果：xhs 入 2 条，ks 全军覆没（hot list 的词都是政治敏感+通用大词，
 *       触发快手 search_comprehensive 反爬墙 → HTTP 000 Empty reply）
 *
 * v5 关键变更：
 *   keyword 池从 "热榜话题"（"美食/搞笑/中央政治局会议/全国五一赏花地图"）
 *   换成项目里的 TRACK_KEYWORDS（13 个垂类赛道下的具体行业词）。
 *
 *   过滤规则：只用 ≥3 个汉字的词（避开"美食/宠物/搞笑"这类已实测被反爬的大词）。
 *   保留：美妆教程、宝宝辅食、升职加薪、家常菜、显瘦、减脂、自驾游、
 *         手机测评、好物推荐、养猫、冷知识、自我成长、沙雕等长尾垂类词。
 *
 *   预期效果：
 *   - 长尾词不会触发快手反爬墙
 *   - 长尾词搜出来的视频更可能是低粉创作者
 *   - 算法判定通过率应高于 v4
 *
 * 用法：npx tsx scripts/seed-xhs-ks-samples.ts
 */

import "dotenv/config";
import { getTikHub } from "../server/legacy/tikhub";
import {
  cleanAndPersistLowFollowerSamples,
  type TikHubRawRecord,
} from "../server/legacy/low-follower-cleaner";

// 与 server/legacy/topic-strategy-engine.ts:205 同步
const TRACK_KEYWORDS: Record<string, string[]> = {
  "美妆护肤": ["美妆教程", "护肤", "化妆", "底妆", "眼妆"],
  "母婴育儿": ["育儿", "母婴", "宝宝辅食", "亲子", "早教"],
  "职场干货": ["职场", "面试", "简历", "副业", "升职加薪"],
  "美食探店": ["美食", "探店", "做饭", "家常菜", "烘焙"],
  "穿搭时尚": ["穿搭", "ootd", "时尚", "搭配", "显瘦"],
  "健身运动": ["健身", "减脂", "瑜伽", "跑步", "增肌"],
  "旅行攻略": ["旅行", "旅游攻略", "自驾游", "景点", "民宿"],
  "数码科技": ["数码", "手机测评", "科技", "电脑", "AI"],
  "家居装修": ["家居", "装修", "收纳", "软装", "好物推荐"],
  "宠物": ["宠物", "猫咪", "狗狗", "养猫", "萌宠"],
  "知识科普": ["科普", "知识", "冷知识", "历史", "心理学"],
  "情感心理": ["情感", "恋爱", "婚姻", "心理", "自我成长"],
  "搞笑娱乐": ["搞笑", "段子", "整蛊", "沙雕", "日常"],
};

/**
 * 从 TRACK_KEYWORDS 拍平 + 过滤出长尾垂类词。
 * 跳过 ≤2 字符的"通用大词"（实测会触发快手反爬）。
 *
 * 返回的 keyword 数量：
 *   美妆教程 / 宝宝辅食 / 升职加薪 / 家常菜 / 显瘦 / 减脂 / 自驾游 /
 *   手机测评 / 好物推荐 / 养猫 / 冷知识 / 心理学 / 自我成长 / 沙雕 / ootd / 旅游攻略
 *   ... 约 30 个
 */
function buildKeywordPool(): { track: string; keyword: string }[] {
  const out: { track: string; keyword: string }[] = [];
  for (const [track, words] of Object.entries(TRACK_KEYWORDS)) {
    for (const w of words) {
      // 长度 ≥ 3（中文按字符数算，"美食"=2 跳过；"美妆教程"=4 保留）
      if (w.length >= 3) out.push({ track, keyword: w });
    }
  }
  return out;
}

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}
function asStr(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

// ───────────── xhs 适配 ─────────────
function adaptXhsPayload(payload: unknown): TikHubRawRecord[] {
  const items = (payload as any)?.data?.data?.items;
  if (!Array.isArray(items)) return [];
  const out: TikHubRawRecord[] = [];
  for (const wrapper of items) {
    const note = (wrapper as Record<string, unknown>)?.note as Record<string, unknown> | undefined;
    if (!note) continue;
    const id = asStr(note.id) ?? asStr(note.note_id);
    if (!id) continue;
    const user = note.user as Record<string, unknown> | undefined;
    const interact = note.interact_info as Record<string, unknown> | undefined;
    // xhs 封面：images_list[0].url（每个 image 含 fileid/height/width/url）
    // cleaner 期望 cover.url_list 结构，这里把 xhs 字符串 URL 包成等价形式
    const imagesList = (note.images_list ?? note.image_list) as
      | Array<Record<string, unknown>>
      | undefined;
    let coverUrl: string | undefined;
    if (Array.isArray(imagesList) && imagesList.length > 0) {
      const first = imagesList[0];
      coverUrl =
        asStr(first?.url) ??
        asStr(first?.url_default) ??
        asStr(first?.url_pre) ??
        undefined;
    }
    const coverEnvelope = coverUrl ? { url_list: [coverUrl] } : undefined;
    out.push({
      note_id: id,
      title: asStr(note.title),
      desc: asStr(note.desc),
      statistics: {
        play_count: 0,
        digg_count: asNum(note.liked_count) || asNum(note.likes_count) || asNum(interact?.liked_count) || asNum(interact?.like_count),
        comment_count: asNum(note.comments_count) || asNum(note.comment_count) || asNum(interact?.comment_count),
        share_count: asNum(note.shared_count) || asNum(note.share_count) || asNum(interact?.share_count),
        collect_count: asNum(note.collected_count) || asNum(note.collect_count) || asNum(interact?.collected_count),
      },
      author: {
        uid: asStr(user?.user_id) ?? asStr(user?.userid) ?? asStr(user?.id),
        nickname: asStr(user?.nickname) ?? asStr(user?.name),
        follower_count: asNum(user?.fans) || asNum(user?.fans_count) || asNum(user?.follower_count),
      },
      create_time: asNum(note.time) || asNum(note.timestamp) || asNum(note.create_time) || undefined,
      cover: coverEnvelope,
      video_cover: coverEnvelope,
    });
  }
  return out;
}

// ───────────── ks 适配 ─────────────
function adaptKsPayload(payload: unknown): TikHubRawRecord[] {
  const mixFeeds = (payload as any)?.data?.mixFeeds;
  if (!Array.isArray(mixFeeds)) return [];
  const out: TikHubRawRecord[] = [];
  for (const feed of mixFeeds) {
    let iti = (feed as Record<string, unknown>)?.itemTransferInfo;
    if (typeof iti === "string") {
      try { iti = JSON.parse(iti); } catch { continue; }
    }
    if (!iti || typeof iti !== "object") continue;
    const item = iti as Record<string, unknown>;
    const photoId = asStr(item.photo_id) ?? asStr(item.photoId) ?? asStr(item.id);
    if (!photoId) continue;
    const user = (item.user ?? item.author) as Record<string, unknown> | undefined;
    out.push({
      id: photoId,
      title: asStr(item.caption) ?? asStr(item.title),
      desc: asStr(item.caption),
      statistics: {
        play_count: asNum(item.view_count) || asNum(item.viewCount) || asNum(item.show_count),
        digg_count: asNum(item.like_count) || asNum(item.likeCount),
        comment_count: asNum(item.comment_count) || asNum(item.commentCount),
        share_count: asNum(item.share_count) || asNum(item.shareCount) || asNum(item.forward_count),
        collect_count: asNum(item.collect_count) || asNum(item.favorite_count),
      },
      author: {
        uid: asStr(user?.user_id) ?? asStr(user?.userId) ?? asStr(user?.id),
        nickname: asStr(user?.user_name) ?? asStr(user?.name),
        follower_count: asNum(user?.fan) || asNum(user?.fan_count) || asNum(user?.follower_count),
      },
      create_time: asNum(item.timestamp) || asNum(item.create_time) || undefined,
    });
  }
  return out;
}

async function searchAndAdapt(
  platform: "xiaohongshu" | "kuaishou",
  keyword: string,
): Promise<TikHubRawRecord[]> {
  if (platform === "xiaohongshu") {
    const resp = await getTikHub<Record<string, unknown>>(
      "/api/v1/xiaohongshu/app/search_notes",
      { keyword, page: 1, sort: "general" },
    );
    if (!resp.ok || !resp.payload) return [];
    return adaptXhsPayload(resp.payload);
  } else {
    const resp = await getTikHub<Record<string, unknown>>(
      "/api/v1/kuaishou/app/search_comprehensive",
      { keyword, pcursor: "" },
    );
    if (!resp.ok || !resp.payload) return [];
    return adaptKsPayload(resp.payload);
  }
}

async function seedPlatform(
  platform: "xiaohongshu" | "kuaishou",
  keywords: { track: string; keyword: string }[],
): Promise<{ keywordsTried: number; rawTotal: number; persistedTotal: number; errors: number }> {
  let keywordsTried = 0;
  let rawTotal = 0;
  let persistedTotal = 0;
  let errors = 0;

  for (const { track, keyword } of keywords) {
    keywordsTried++;
    console.log(`\n  [${platform}] track=${track} keyword="${keyword}"`);
    let records: TikHubRawRecord[] = [];
    try {
      records = await searchAndAdapt(platform, keyword);
    } catch (err) {
      errors++;
      console.warn(`    search threw:`, err instanceof Error ? err.message : err);
      // 等待 3s 再继续，不让一次断连拖垮整批
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    console.log(`    raw: ${records.length}`);
    if (records.length === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    rawTotal += records.length;

    try {
      const result = await cleanAndPersistLowFollowerSamples({
        rawRecords: records,
        platform,
        seedTopic: keyword,
        industryName: track,
        persist: true,
      });
      console.log(`    algorithm passed: ${result.persistedCount}`);
      persistedTotal += result.persistedCount;
    } catch (err) {
      errors++;
      console.warn(`    persist threw:`, err instanceof Error ? err.message : err);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  return { keywordsTried, rawTotal, persistedTotal, errors };
}

async function main() {
  console.log("=== seed-xhs-ks-samples v5 (vertical track keywords) start ===");

  const pool = buildKeywordPool();
  console.log(`\nkeyword pool: ${pool.length} terms (≥3 字符) from TRACK_KEYWORDS`);
  console.log("  e.g.", pool.slice(0, 8).map((k) => k.keyword).join(", "), "...");

  console.log("\n[xhs] seeding xiaohongshu (algorithm-judged)...");
  const xhsR = await seedPlatform("xiaohongshu", pool);
  console.log(`\n  xhs SUMMARY: triedKeywords=${xhsR.keywordsTried} raw=${xhsR.rawTotal} errors=${xhsR.errors} persisted=${xhsR.persistedTotal}`);

  console.log("\n[ks] seeding kuaishou (algorithm-judged)...");
  const ksR = await seedPlatform("kuaishou", pool);
  console.log(`\n  ks SUMMARY: triedKeywords=${ksR.keywordsTried} raw=${ksR.rawTotal} errors=${ksR.errors} persisted=${ksR.persistedTotal}`);

  console.log("\n=== v5 done ===");
  process.exit(0);
}

main().catch((err) => { console.error("v5 failed:", err); process.exit(1); });
