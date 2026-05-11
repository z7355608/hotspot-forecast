/**
 * ADR-0008 — 低粉爆款管线 C(搜索补样)的 service 层
 *
 * 三层 enrichment(详 ADR §Step 3):
 *   L1: search/fetch_general_search_v2 → aweme list + author.uid/sec_uid
 *   L2: app/v3/fetch_one_video_v2 → 真实 video stats(comment/collect/share/likes)
 *   L3: app/v3/handler_user_profile → 真实 follower_count(实测唯一可靠的源)
 *
 * 降级:L3 429/5xx → 退避重试 1 次;仍失败 → 跳过该样本(无 follower 不能判低粉)。
 *
 * 调用方:server/scripts/run-search-pipeline.ts
 */
import { createModuleLogger } from "../legacy/logger.js";
import { getTikHub, postTikHub } from "../legacy/tikhub.js";

const log = createModuleLogger("LFSearchPipeline");

const SEARCH_ENDPOINT = "/api/v1/douyin/search/fetch_general_search_v2";
const VIDEO_DETAIL_ENDPOINT = "/api/v1/douyin/app/v3/fetch_one_video_v2";
const USER_PROFILE_ENDPOINT = "/api/v1/douyin/app/v3/handler_user_profile";

export interface SearchKeywordSpec {
  keyword: string;
  industry: string;
  type: string;
}

/** 标准化的搜索候选样本(已经过三层 enrichment) */
export interface EnrichedSearchSample {
  awemeId: string;
  desc: string;
  hashtags: string[];
  authorUid: string;
  authorNickname: string;
  authorFollowers: number;
  authorSecUid: string;
  videoLikes: number;
  videoComments: number;
  videoCollects: number;
  videoShares: number;
  videoViews: number;
  publishTime: number | null;
  shareUrl: string | null;
  coverUrl: string | null;
  /** 来源关键词(写入 seedTopic) */
  fromKeyword: string;
  /** 关键词所属行业(写入 industry_top) */
  industry: string;
  /** 关键词所属内容类型(写入 prefilter_reason 前缀) */
  contentType: string;
}

export interface SearchAwemeRaw {
  aweme_id?: string;
  desc?: string;
  text_extra?: Array<{ hashtag_name?: string }>;
  author?: {
    uid?: string;
    sec_uid?: string;
    nickname?: string;
  };
  statistics?: {
    digg_count?: number;
    comment_count?: number;
    collect_count?: number;
    share_count?: number;
    play_count?: number;
  };
  create_time?: number;
  share_url?: string;
  video?: {
    cover?: { url_list?: string[] };
    origin_cover?: { url_list?: string[] };
  };
}

interface VideoDetailStats {
  digg_count?: number;
  comment_count?: number;
  collect_count?: number;
  share_count?: number;
  play_count?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractHashtags(text: string): string[] {
  if (!text) return [];
  return (text.match(/#([^\s#]+)/g) ?? []).map((m) => m.slice(1).trim()).filter(Boolean);
}

/**
 * L1 — 搜索拿 video 列表
 * 走 ADR-0008 §Step 2 的 fetch_general_search_v2,与 topic-strategy-engine.ts:441 保持一致的参数格式。
 */
export async function searchVideosByKeyword(keyword: string): Promise<SearchAwemeRaw[]> {
  const r = await postTikHub<unknown>(SEARCH_ENDPOINT, {
    keyword,
    cursor: "0",
    sort_type: "0",
    publish_time: "0",
    filter_duration: "0",
    content_type: "0",
    search_id: "",
    backtrace: "",
  });
  if (!r.ok) {
    log.warn({ keyword, httpStatus: r.httpStatus, businessCode: r.businessCode }, "search failed");
    return [];
  }
  const root = r.payload as Record<string, unknown> | null;
  const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
  const biz = (inner.business_data as Array<Record<string, unknown>>) ?? [];
  const out: SearchAwemeRaw[] = [];
  for (const item of biz) {
    const data = item.data as Record<string, unknown> | undefined;
    const aweme = data?.aweme_info as SearchAwemeRaw | undefined;
    if (aweme && aweme.aweme_id) out.push(aweme);
  }
  return out;
}

/**
 * L2 — 拿真实 video stats(复用 backfill-billboard-stats 的 fetch_one_video_v2)
 */
export async function fetchVideoDetailStats(awemeId: string): Promise<VideoDetailStats | null> {
  const r = await getTikHub<unknown>(VIDEO_DETAIL_ENDPOINT, { aweme_id: awemeId });
  if (!r.ok) return null;
  const root = r.payload as Record<string, unknown> | null;
  const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
  const aweme = inner.aweme_detail as Record<string, unknown> | undefined;
  return ((aweme?.statistics as VideoDetailStats) ?? null);
}

/**
 * L3 — 拿真实 follower_count(实测唯一返真值的接口)
 * 429/5xx → 退避重试 1 次;仍失败返 null,由调用方决定丢弃。
 */
export async function fetchAuthorFollowerCount(secUid: string): Promise<number | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await getTikHub<unknown>(USER_PROFILE_ENDPOINT, { sec_user_id: secUid });
    if (r.ok) {
      const root = r.payload as Record<string, unknown> | null;
      const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
      const user = inner.user as Record<string, unknown> | undefined;
      const fc = Number(user?.follower_count ?? user?.mplatform_followers_count ?? 0);
      if (Number.isFinite(fc) && fc > 0) return fc;
      // 接口返了 user 但 follower 是 0(可能账号脱敏) — 视为不可用
      return null;
    }
    if (r.httpStatus === 429 || (r.httpStatus >= 500 && r.httpStatus < 600)) {
      log.warn({ secUid, attempt, httpStatus: r.httpStatus }, "user_profile transient,退避重试");
      await sleep(1500 * attempt);
      continue;
    }
    return null;
  }
  return null;
}

/**
 * 完整 enrichment 链:对一批 aweme(来自 L1)做 L2 + L3 合并。
 * 串行调用,每条 200ms 间隔避免 TikHub 限流。
 *
 * 过滤门槛(ADR §Step 4):
 *   - follower <= followerCeiling(默认 50_000)
 *   - likes >= minLikes(默认 1_000)
 */
export async function enrichSearchSamples(params: {
  awemeList: SearchAwemeRaw[];
  fromKeyword: string;
  industry: string;
  contentType: string;
  followerCeiling?: number;
  minLikes?: number;
}): Promise<{
  enriched: EnrichedSearchSample[];
  skipped: { reason: string; awemeId: string }[];
}> {
  const followerCeiling = params.followerCeiling ?? 50_000;
  const minLikes = params.minLikes ?? 1_000;
  const enriched: EnrichedSearchSample[] = [];
  const skipped: { reason: string; awemeId: string }[] = [];

  for (const aweme of params.awemeList) {
    const awemeId = String(aweme.aweme_id ?? "");
    if (!awemeId) continue;
    const author = aweme.author ?? {};
    const secUid = String(author.sec_uid ?? "");
    if (!secUid) {
      skipped.push({ awemeId, reason: "no sec_uid" });
      continue;
    }

    // L2 拿真实 stats
    const detailStats = await fetchVideoDetailStats(awemeId);
    const stats = detailStats ?? aweme.statistics ?? {};
    const likes = Number(stats.digg_count ?? 0);
    if (likes < minLikes) {
      skipped.push({ awemeId, reason: `likes ${likes} < ${minLikes}` });
      await sleep(200);
      continue;
    }

    // L3 拿真实 follower
    const follower = await fetchAuthorFollowerCount(secUid);
    if (follower === null) {
      skipped.push({ awemeId, reason: "L3 follower unavailable" });
      await sleep(200);
      continue;
    }
    if (follower > followerCeiling) {
      skipped.push({ awemeId, reason: `follower ${follower} > ${followerCeiling}` });
      await sleep(200);
      continue;
    }

    const cover =
      aweme.video?.cover?.url_list?.[0] ?? aweme.video?.origin_cover?.url_list?.[0] ?? null;

    enriched.push({
      awemeId,
      desc: String(aweme.desc ?? ""),
      hashtags: extractHashtags(String(aweme.desc ?? "")).concat(
        (aweme.text_extra ?? []).map((t) => String(t.hashtag_name ?? "")).filter(Boolean),
      ),
      authorUid: String(author.uid ?? ""),
      authorNickname: String(author.nickname ?? "未知作者"),
      authorFollowers: follower,
      authorSecUid: secUid,
      videoLikes: likes,
      videoComments: Number(stats.comment_count ?? 0),
      videoCollects: Number(stats.collect_count ?? 0),
      videoShares: Number(stats.share_count ?? 0),
      videoViews: Number(stats.play_count ?? 0),
      publishTime: aweme.create_time ?? null,
      shareUrl: aweme.share_url ?? null,
      coverUrl: cover,
      fromKeyword: params.fromKeyword,
      industry: params.industry,
      contentType: params.contentType,
    });
    await sleep(200);
  }

  return { enriched, skipped };
}
