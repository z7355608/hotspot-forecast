/**
 * bilibili-collector.ts
 *
 * B 站数据采集 — 项目里第一个完整通畅的非抖音数据源。
 *
 * 为什么 B 站？详见 v6 seed 决策（在快手 / 视频号 API 全军覆没后的替代）：
 *   - TikHub 端点 100% 稳定，无中文反爬墙
 *   - 数据完整：公开播放数 + 全互动 + 粉丝数（粉丝需补一次接口）
 *   - 多两个独家信号：投币（coin）+ 弹幕（danmaku）
 *
 * 主入口：fetchBilibiliPopularSamples(pages, perPage)
 *   1. 调 web/fetch_com_popular?pn=1..N 拿最新综合热门 N 页（每页 20 条）
 *   2. 收集所有 owner.mid (作者 user_id)
 *   3. 批量调 web/fetch_user_relation_stat?uid=mid 补每个作者的粉丝数（500ms 限流）
 *   4. 把 B 站独有字段映射成项目通用 TikHubRawRecord：
 *        bvid → id
 *        stat.view → statistics.play_count
 *        stat.like → statistics.digg_count
 *        stat.reply → statistics.comment_count
 *        stat.share → statistics.share_count
 *        stat.favorite → statistics.collect_count
 *        owner.mid → author.uid
 *        owner.name → author.nickname
 *        follower (enrich 来) → author.follower_count
 *        pubdate → create_time
 *
 * 注：stat.coin / stat.danmaku 是 B 站独有信号，目前不进 cleaner 主流程
 *      （cleaner.statistics 没对应字段），但项目算法本来不依赖它们。
 *      未来如果想用，可以加到 contentUrl 旁的扩展字段里。
 */

import { getTikHub, isBalanceInsufficient } from "../legacy/tikhub";
import { createModuleLogger } from "../legacy/logger.js";
import type { TikHubRawRecord } from "../legacy/low-follower-cleaner";

const log = createModuleLogger("BilibiliCollector");

interface BiliPopularItem {
  aid?: number;
  bvid?: string;
  title?: string;
  desc?: string;
  pic?: string;
  pubdate?: number;
  ctime?: number;
  short_link_v2?: string;
  owner?: {
    mid?: number;
    name?: string;
    face?: string;
  };
  stat?: {
    aid?: number;
    view?: number;
    danmaku?: number;
    reply?: number;
    favorite?: number;
    coin?: number;
    share?: number;
    like?: number;
    now_rank?: number;
  };
}

interface BiliPopularResponse {
  code?: number;
  data?: {
    code?: number;
    data?: {
      list?: BiliPopularItem[];
    };
  };
}

interface BiliRelationStatResponse {
  code?: number;
  // 注意：与 fetch_com_popular 不同，这个端点 inner data 直接平铺，没有第二层 data
  data?: {
    mid?: number;
    follower?: number;
    following?: number;
    code?: number;
  };
}

/**
 * 拉单页"综合热门"（pn=页码，从 1 开始）。每页约 20 条。
 */
async function fetchOnePopularPage(
  pn: number,
): Promise<BiliPopularItem[]> {
  try {
    const res = await getTikHub<BiliPopularResponse>(
      "/api/v1/bilibili/web/fetch_com_popular",
      { pn },
    );
    if (!res.ok) {
      log.warn(
        `bilibili popular page ${pn} failed: HTTP ${res.httpStatus} businessCode=${res.businessCode}`,
      );
      return [];
    }
    const list = res.payload?.data?.data?.list ?? [];
    return list;
  } catch (err) {
    log.warn(
      `bilibili popular page ${pn} threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * 单次调用 fetch_user_relation_stat 拿 follower 数；失败返 null
 */
async function fetchOneFollower(uid: string): Promise<number | null> {
  try {
    const res = await getTikHub<BiliRelationStatResponse>(
      "/api/v1/bilibili/web/fetch_user_relation_stat",
      { uid },
    );
    if (!res.ok) return null;
    // 单层 data：res.payload.data.follower
    const follower = res.payload?.data?.follower;
    return typeof follower === "number" ? follower : null;
  } catch (err) {
    log.warn(`bilibili user_relation_stat ${uid} threw`);
    return null;
  }
}

/**
 * 把 BiliPopularItem 适配成项目通用的 TikHubRawRecord
 */
function adaptToRawRecord(
  item: BiliPopularItem,
  followerByMid: Map<string, number>,
): TikHubRawRecord | null {
  const id = item.bvid ?? (item.aid != null ? String(item.aid) : null);
  if (!id) return null;
  const mid = item.owner?.mid != null ? String(item.owner.mid) : null;
  const stat = item.stat ?? {};
  const followerCount = mid ? followerByMid.get(mid) ?? 0 : 0;

  // 把 B 站的 pic 字段（顶层字符串 URL）适配成 cleaner 期望的 cover.url_list 结构
  // cleaner 里：record.video_cover?.url_list?.[0] ?? record.cover?.url_list?.[0]
  const coverEnvelope = item.pic ? { url_list: [item.pic] } : undefined;

  return {
    id,
    title: item.title,
    desc: item.desc,
    statistics: {
      play_count: stat.view ?? 0,
      digg_count: stat.like ?? 0,
      comment_count: stat.reply ?? 0,
      share_count: stat.share ?? 0,
      collect_count: stat.favorite ?? 0,
    },
    author: {
      uid: mid ?? id,
      nickname: item.owner?.name ?? "未知 UP 主",
      follower_count: followerCount,
    },
    create_time: item.pubdate ?? item.ctime ?? undefined,
    share_url: item.short_link_v2 ?? `https://www.bilibili.com/video/${id}`,
    video: undefined,
    cover: coverEnvelope,
    video_cover: coverEnvelope,
  };
}

/**
 * 主入口：拉 N 页 popular + enrich follower + 适配成 TikHubRawRecord 数组
 *
 * @param pages 拉几页（每页约 20 条，默认 3 页 = ~60 条候选）
 * @returns TikHubRawRecord[]，可直接喂给 cleanAndPersistLowFollowerSamples
 */
export async function fetchBilibiliPopularSamples(
  pages = 3,
): Promise<TikHubRawRecord[]> {
  if (isBalanceInsufficient()) {
    log.warn("TikHub 余额冷却中，跳过 B 站采集");
    return [];
  }

  // 1. 拉 N 页爆款
  const items: BiliPopularItem[] = [];
  for (let pn = 1; pn <= pages; pn++) {
    const page = await fetchOnePopularPage(pn);
    items.push(...page);
    // 每页之间 1s 限流
    await new Promise((r) => setTimeout(r, 1000));
  }
  log.info(`B 站 popular 采集到 ${items.length} 条候选`);
  if (items.length === 0) return [];

  // 2. 收集所有不同的 mid
  const mids = new Set<string>();
  for (const it of items) {
    if (it.owner?.mid != null) mids.add(String(it.owner.mid));
  }
  log.info(`需要补 follower 的 UP 主: ${mids.size} 个`);

  // 3. 逐个补粉丝数（500ms 限流，避免 TikHub 被打）
  const followerMap = new Map<string, number>();
  let enriched = 0;
  for (const mid of mids) {
    if (isBalanceInsufficient()) {
      log.warn("中途余额耗尽，提前终止 enrich");
      break;
    }
    const fc = await fetchOneFollower(mid);
    if (fc !== null) {
      followerMap.set(mid, fc);
      enriched++;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  log.info(`成功 enrich ${enriched}/${mids.size} 个 UP 主粉丝数`);

  // 4. 适配
  const records: TikHubRawRecord[] = [];
  for (const it of items) {
    const r = adaptToRawRecord(it, followerMap);
    if (r) records.push(r);
  }
  return records;
}
