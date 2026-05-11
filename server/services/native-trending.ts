/**
 * native-trending.ts
 *
 * 平台原生热榜聚合服务 — 替代之前基于 low_follower_samples 表跨时间窗 group by
 * 的"伪上升榜"。三平台直接调 TikHub 拿平台官方热榜数据，并 normalize 到统一结构。
 *
 * 端点（实测 2026-04-29 全部 HTTP 200）：
 *   - 抖音      /api/v1/douyin/billboard/fetch_hot_rise_list   (GET)
 *               必传：page, page_size, order
 *               返回每条话题自带最近 7h 的 hot_score 时间序列 trends[]
 *
 *   - 小红书    /api/v1/xiaohongshu/web_v2/fetch_hot_list       (GET, 无参数)
 *               返回每条 item 带 rank_change + word_type=="热" 标
 *
 *   - 快手      /api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2 (GET, board_type=1)
 *               返回每条 hot 带 hotValue + pvSoarSignal（飙升信号）
 *
 * 项目里之前用的快手 fetch_hot_search_list 端点已 404 失效，
 * tikhub.ts:CACHEABLE_PATHS 里要同步把那条路径换成新版。
 *
 * 关键设计：
 *   - 失败不抛异常：上层拿到 null/[] 时自动降级到样本聚合 SQL，保证页面不空白
 *   - tikhub.ts 自带 30min 请求缓存 + 402 余额不足冷却，本服务无需自实现
 *   - 输出统一 NativeTrendingTopic 类型，让上层 router 不区分平台
 */

import { getTikHub } from "../legacy/tikhub";
import { createModuleLogger } from "../legacy/logger.js";

const log = createModuleLogger("NativeTrending");

/**
 * 统一的"平台热榜话题"类型。
 * 注意：不同平台能填的字段不同（见各 fetch 函数的字段映射注释），
 * 上层渲染时只用 topic + hotScore + 视情况展示 rankDiff/pvSoar/trends。
 */
export interface NativeTrendingTopic {
  /** 话题文字（topic / keyword / sentence / title 都映射到这里） */
  topic: string;
  /** 平台原生热度值（已统一到 number） */
  hotScore: number;
  /**
   * 排名变化（仅抖音 rank_diff / 小红书 rank_change 可填）
   * - 正数 = 排名上升（rank 变小）
   * - 负数 = 排名下降
   * - 0 = 持平
   * - undefined = 平台不提供
   */
  rankDiff?: number;
  /** 平台标记的"热门"标签（小红书 word_type==='热'，快手 pvSoarSignal>0） */
  isHotMark?: boolean;
  /** 关联视频数量（仅抖音） */
  videoCount?: number;
  /** 抖音上升榜独有：每条话题自带最近 7h 的 hot_score 时间序列 */
  trends?: Array<{ datetime: string; hotScore: number }>;
}

// ─────────────────────────────────────────────────────
// 抖音上升榜
// ─────────────────────────────────────────────────────

interface DouyinRiseRawItem {
  rank?: number;
  rank_diff?: number;
  sentence?: string;
  sentence_id?: number;
  hot_score?: number;
  video_count?: number;
  trends?: Array<{ datetime?: string; hot_score?: number }>;
}

interface DouyinRiseResponse {
  code?: number;
  data?: {
    code?: number;
    data?: {
      objs?: DouyinRiseRawItem[];
    };
  };
}

/**
 * 抖音上升热点榜（fetch_hot_rise_list）
 *
 * @param pageSize 拉取条数，默认 20，最大 50
 * @returns 排序好的上升话题列表；调用失败返回 null（让上层降级）
 */
export async function fetchDouyinRisingTopics(
  pageSize = 20,
): Promise<NativeTrendingTopic[] | null> {
  try {
    const res = await getTikHub<DouyinRiseResponse>(
      "/api/v1/douyin/billboard/fetch_hot_rise_list",
      { page: 1, page_size: Math.min(50, Math.max(1, pageSize)), order: "hot" },
    );
    if (!res.ok) {
      log.warn(
        `Douyin rise list fetch failed: HTTP ${res.httpStatus} businessCode=${res.businessCode}`,
      );
      return null;
    }
    // TikHub 包了一层，再包一层："payload.data.data.objs"
    const objs = res.payload?.data?.data?.objs ?? [];
    return objs
      .filter((it): it is DouyinRiseRawItem => !!it && typeof it.sentence === "string")
      .map<NativeTrendingTopic>((it) => ({
        topic: String(it.sentence ?? "").trim(),
        hotScore: Number(it.hot_score ?? 0),
        rankDiff: typeof it.rank_diff === "number" ? it.rank_diff : undefined,
        videoCount: typeof it.video_count === "number" ? it.video_count : undefined,
        trends: Array.isArray(it.trends)
          ? it.trends
              .filter((t) => t && typeof t.datetime === "string")
              .map((t) => ({
                datetime: String(t.datetime),
                hotScore: Number(t.hot_score ?? 0),
              }))
          : undefined,
      }))
      .filter((it) => it.topic.length > 0);
  } catch (err) {
    log.warn(
      `Douyin rise list threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────
// 小红书热榜
// ─────────────────────────────────────────────────────

interface XhsHotRawItem {
  id?: string;
  title?: string;
  /** 平台返回是字符串如 "901.6万" / "8501" */
  score?: string | number;
  rank_change?: number;
  /** "热" / "新" / "无" 等 */
  word_type?: string;
}

interface XhsHotResponse {
  code?: number;
  data?: {
    code?: number;
    data?: {
      items?: XhsHotRawItem[];
    };
  };
}

/**
 * 把小红书的 score 字符串（如 "901.6万"）转成数字。
 * "万" → ×10000；"亿" → ×100000000；纯数字直接 parseFloat。
 */
function parseXhsScore(input: unknown): number {
  if (typeof input === "number") return input;
  if (typeof input !== "string") return 0;
  const m = input.match(/([\d.]+)\s*(万|亿)?/);
  if (!m) return 0;
  const base = parseFloat(m[1]);
  if (Number.isNaN(base)) return 0;
  if (m[2] === "万") return Math.round(base * 10_000);
  if (m[2] === "亿") return Math.round(base * 100_000_000);
  return base;
}

/**
 * 小红书热榜（fetch_hot_list）
 */
export async function fetchXhsHotTopics(): Promise<NativeTrendingTopic[] | null> {
  try {
    const res = await getTikHub<XhsHotResponse>(
      "/api/v1/xiaohongshu/web_v2/fetch_hot_list",
      {},
    );
    if (!res.ok) {
      log.warn(
        `Xiaohongshu hot list fetch failed: HTTP ${res.httpStatus} businessCode=${res.businessCode}`,
      );
      return null;
    }
    const items = res.payload?.data?.data?.items ?? [];
    return items
      .filter((it): it is XhsHotRawItem => !!it && typeof it.title === "string")
      .map<NativeTrendingTopic>((it) => ({
        topic: String(it.title ?? "").trim(),
        hotScore: parseXhsScore(it.score),
        rankDiff: typeof it.rank_change === "number" ? it.rank_change : undefined,
        isHotMark: it.word_type === "热",
      }))
      .filter((it) => it.topic.length > 0);
  } catch (err) {
    log.warn(
      `Xiaohongshu hot list threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────
// 快手热榜
// ─────────────────────────────────────────────────────

interface KsHotRawItem {
  keyword?: string;
  hotValue?: number;
  pvSoarSignal?: number;
  hotWordType?: number;
}

interface KsHotResponse {
  code?: number;
  // ks v2 端点的 inner data 直接平铺，不像 xhs/抖音那样还有 .data.data 二层包裹
  data?: {
    hots?: KsHotRawItem[];
    topHots?: KsHotRawItem[];
  };
}

/**
 * 快手热榜（fetch_kuaishou_hot_list_v2）
 *
 * 旧的 fetch_hot_search_list 路径在 2026-04-29 实测 HTTP 404，已废。
 * tikhub.ts:CACHEABLE_PATHS 同步换成本路径。
 *
 * 字段说明：
 *   - hots: 主榜单
 *   - topHots: 置顶榜单（通常 1 条）
 *   - hotValue: 平台热度值
 *   - pvSoarSignal: 飙升信号（>0 = 飙升中）
 */
export async function fetchKuaishouHotTopics(): Promise<NativeTrendingTopic[] | null> {
  try {
    const res = await getTikHub<KsHotResponse>(
      "/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2",
      { board_type: "1" },
    );
    if (!res.ok) {
      log.warn(
        `Kuaishou hot list v2 fetch failed: HTTP ${res.httpStatus} businessCode=${res.businessCode}`,
      );
      return null;
    }
    // path: payload.data.{topHots, hots}（无第二层 data 包裹）
    const innerData = res.payload?.data ?? {};
    // 把 topHots 放到最前面，再接 hots
    const merged = [...(innerData.topHots ?? []), ...(innerData.hots ?? [])];
    return merged
      .filter((it): it is KsHotRawItem => !!it && typeof it.keyword === "string")
      .map<NativeTrendingTopic>((it) => ({
        topic: String(it.keyword ?? "").trim(),
        hotScore: Number(it.hotValue ?? 0),
        // 快手没有 rank_change 字段，但 pvSoarSignal>0 等价于"飙升中"
        rankDiff: undefined,
        isHotMark: typeof it.pvSoarSignal === "number" && it.pvSoarSignal > 0,
      }))
      .filter((it) => it.topic.length > 0);
  } catch (err) {
    log.warn(
      `Kuaishou hot list threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────
// 统一入口
// ─────────────────────────────────────────────────────

/**
 * 按平台拉取 native 热榜。
 * 不支持的平台返回 null，由调用方降级到样本聚合 SQL。
 */
export async function fetchNativeTrendingTopics(
  platform: string | undefined,
  limit: number,
): Promise<NativeTrendingTopic[] | null> {
  const p = (platform ?? "").toLowerCase();
  if (p === "douyin" || p === "抖音") {
    const out = await fetchDouyinRisingTopics(Math.max(limit, 20));
    return out ? out.slice(0, limit) : null;
  }
  if (p === "xiaohongshu" || p === "小红书" || p === "xhs") {
    const out = await fetchXhsHotTopics();
    return out ? out.slice(0, limit) : null;
  }
  if (p === "kuaishou" || p === "快手" || p === "ks") {
    const out = await fetchKuaishouHotTopics();
    return out ? out.slice(0, limit) : null;
  }
  return null;
}
