/**
 * server/creator-data-sync.ts
 * ═══════════════════════════════════════════════════════════════
 * 模块五：创作数据聚合层
 *
 * 功能：
 * 1. 通过 TikHub API 拉取账号概览（粉丝数、互动指标）
 * 2. 拉取近 30 天作品列表（含播放量、互动率、完播率）
 * 3. 拉取粉丝画像（性别/年龄/地域/活跃时段/兴趣标签）
 * 4. 构建每日趋势数据（从作品发布时间倒推）
 * 5. 所有数据持久化到 MySQL，前端通过 API 读取
 *
 * 支持平台：douyin（完整），xiaohongshu/bilibili（部分），其他平台降级到基础数据
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("CreatorDataSync");
import { randomUUID } from "node:crypto";
import { getTikHub, postTikHub, isBusinessSuccess } from "./tikhub.js";
import { query, execute } from "./database.js";
import type { RowDataPacket } from "./database.js";
import { resolveCookieSecret } from "./storage.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface AccountOverview {
  platformId: string;
  platformName: string;
  handle: string;
  avatarUrl?: string;
  followers: number;
  following: number;
  totalWorks: number;
  avgEngagementRate: number;
  // 动态指标
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalCollects?: number;
  totalCoins?: number;
  totalFavorites?: number;
  totalReposts?: number;
  totalReads?: number;
  totalVoteups?: number;
  // 变化量（与上次快照对比）
  followersChange?: number;
  viewsChange?: number;
  likesChange?: number;
  commentsChange?: number;
  sharesChange?: number;
  collectsChange?: number;
  engagementRateChange?: number;
  // 元数据
  syncedAt: string;
  dataSource: "live" | "cached";
}

export interface WorkItem {
  id: string;
  title: string;
  coverUrl: string;
  contentUrl?: string;
  publishedAt: string;
  type: "video" | "note" | "article";
  isHot: boolean;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  coins?: number;
  favorites?: number;
  reposts?: number;
  reads?: number;
  voteups?: number;
  completionRate?: number;
  avgWatchDuration?: number;
  duration?: string;
  tags?: string[];
  trafficSources?: { source: string; percentage: number }[];
  audienceGender?: { male: number; female: number };
  audienceAge?: { range: string; percentage: number }[];
  rawPayload?: Record<string, unknown>;
}

export interface FanProfile {
  genderRatio: { male: number; female: number };
  ageDistribution: { range: string; percentage: number }[];
  topCities: { city: string; percentage: number }[];
  topProvinces?: { province: string; percentage: number }[];
  activeHours: { hour: string; percentage: number }[];
  interestTags: string[];
  deviceTypes?: { device: string; percentage: number }[];
  dataSource: "live" | "cached" | "estimated";
}

export interface TrendDataPoint {
  date: string;
  followers?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  engagementRate?: number;
}

export interface SyncResult {
  success: boolean;
  overview?: AccountOverview;
  works?: WorkItem[];
  fanProfile?: FanProfile;
  trendData?: TrendDataPoint[];
  error?: string;
  syncedAt: string;
}

// ─────────────────────────────────────────────
// 平台标识解析
// ─────────────────────────────────────────────

interface ConnectorPayloadMin {
  platformId: string;
  platformUserId?: string;
  handle?: string;
  profileUrl?: string;
  encryptedSecretRef?: string;
}

async function extractDouyinIdentifier(connector: ConnectorPayloadMin): Promise<{
  secUserId?: string;
  uid?: string;
  uniqueId?: string;
}> {
  const pid = connector.platformUserId?.trim();

  // 如果 platformUserId 是 sec_uid（MS4w 开头），直接返回
  if (pid?.startsWith("MS4w")) return { secUserId: pid };

  // 优先从 profileUrl/分享文本中解析 sec_uid（最可靠的标识符）
  const profileText = connector.profileUrl ?? "";
  const secUidFromText = await resolveSecUidFromText(profileText);
  if (secUidFromText) return { secUserId: secUidFromText };

  // 降级：用 platformUserId
  if (pid) {
    if (/^\d{8,}$/.test(pid)) return { uid: pid };
    return { uniqueId: pid };
  }

  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle) return { uniqueId: handle };
  return {};
}

/**
 * 从分享文本或URL中解析sec_uid
 * 支持：
 * 1. 标准主页URL（包含sec_user_id参数或/user/路径）
 * 2. 短链接（v.douyin.com）——跟随重定向提取sec_uid
 * 3. 分享文本（包含“长按复制…”等前缀和嵌入的链接）
 */
async function resolveSecUidFromText(text: string): Promise<string | null> {
  if (!text) return null;

  // 先尝试直接解析为 URL
  const directResult = extractSecUidFromUrl(text);
  if (directResult) return directResult;

  // 从文本中提取所有URL
  const urlPattern = /https?:\/\/[^\s"'<>]+/g;
  const urls = text.match(urlPattern) ?? [];

  for (const url of urls) {
    // 先直接解析
    const result = extractSecUidFromUrl(url);
    if (result) return result;

    // 如果是短链接，跟随重定向
    if (url.includes("v.douyin.com") || url.includes("iesdouyin.com")) {
      try {
        const resolved = await resolveShortLink(url);
        if (resolved) {
          const secUid = extractSecUidFromUrl(resolved);
          if (secUid) return secUid;
        }
      } catch { /* ignore */ }
    }
  }

  return null;
}

function extractSecUidFromUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr.trim());
    // 从查询参数中提取
    const secUid = url.searchParams.get("sec_uid") ?? url.searchParams.get("sec_user_id");
    if (secUid?.startsWith("MS4w")) return secUid;
    // 从路径中提取 /user/MS4w... 或 /share/user/MS4w...
    const pathMatch = url.pathname.match(/\/(?:share\/)?user\/([^/?]+)/);
    if (pathMatch?.[1]?.startsWith("MS4w")) return pathMatch[1];
  } catch { /* not a valid URL */ }
  return null;
}

async function resolveShortLink(shortUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.url || null;
  } catch {
    // HEAD失败时尝试GET（某些服务器不支持HEAD）
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(shortUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.url || null;
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────
// 抖音数据同步
// ─────────────────────────────────────────────

async function syncDouyinOverview(
  connector: ConnectorPayloadMin,
  cookie?: string,
): Promise<AccountOverview | null> {
  const ident = await extractDouyinIdentifier(connector);
  let profilePayload: unknown = null;

  // 尝试 L1（sec_user_id）
  if (ident.secUserId) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/douyin/web/handler_user_profile_v4",
        { sec_user_id: ident.secUserId, ...(cookie ? { cookie } : {}) },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough */ }
  }

  // L2（uid）
  if (!profilePayload && ident.uid) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/douyin/web/handler_user_profile_v3",
        { uid: ident.uid, ...(cookie ? { cookie } : {}) },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough */ }
  }

  // L3（unique_id）
  if (!profilePayload && ident.uniqueId) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/douyin/web/handler_user_profile_v2",
        { unique_id: ident.uniqueId, ...(cookie ? { cookie } : {}) },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough */ }
  }

  // L4（cookie 降级）：当所有 identifier-based API 都失败时，用 cookie 调用 fetch_author_diagnosis
  if (!profilePayload && cookie) {
    try {
      const res = await postTikHub<unknown>(
        "/api/v1/douyin/creator_v2/fetch_author_diagnosis",
        { cookie },
      );
      if (res.ok && res.payload) profilePayload = res.payload;
    } catch { /* fallthrough */ }
  }

  if (!profilePayload) return null;

  // 解析 TikHub 响应
  const user = extractUserFromProfile(profilePayload);
  if (!user) return null;

  const result: AccountOverview & { _secUid?: string } = {
    platformId: "douyin",
    platformName: "\u6296\u97f3",
    handle: user.uniqueId ? `@${user.uniqueId}` : (connector.handle ?? ""),
    avatarUrl: user.avatarUrl,
    followers: user.followerCount ?? 0,
    following: user.followingCount ?? 0,
    totalWorks: user.awemeCount ?? 0,
    totalLikes: user.totalFavorited ?? 0,
    avgEngagementRate: 0, // \u9700\u8981\u4ece\u4f5c\u54c1\u6570\u636e\u8ba1\u7b97
    syncedAt: new Date().toISOString(),
    dataSource: "live",
    _secUid: user.secUid,
  };
  return result;
}

function extractUserFromProfile(payload: unknown): {
  uniqueId?: string;
  nickname?: string;
  avatarUrl?: string;
  followerCount?: number;
  followingCount?: number;
  awemeCount?: number;
  totalFavorited?: number;
  secUid?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  let p = payload as Record<string, unknown>;

  // Handle TikHubResult wrapper (safety net)
  if (p.payload && typeof p.payload === "object" && (p.ok !== undefined || p.httpStatus !== undefined)) {
    p = p.payload as Record<string, unknown>;
  }

  // 尝试直接候选路径（profile API 标准格式）
  const candidates = [
    p.user,
    p.data,
    (p.data as Record<string, unknown> | undefined)?.user,
    (p.data as Record<string, unknown> | undefined)?.author,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const u = candidate as Record<string, unknown>;
    if (u.follower_count !== undefined || u.unique_id !== undefined) {
      return {
        uniqueId: typeof u.unique_id === "string" ? u.unique_id : undefined,
        nickname: typeof u.nickname === "string" ? u.nickname : undefined,
        avatarUrl: extractAvatarUrl(u),
        followerCount: typeof u.follower_count === "number" ? u.follower_count : undefined,
        followingCount: typeof u.following_count === "number" ? u.following_count : undefined,
        awemeCount: typeof u.aweme_count === "number" ? u.aweme_count : undefined,
        totalFavorited: typeof u.total_favorited === "number" ? u.total_favorited : undefined,
        secUid: typeof u.sec_uid === "string" ? u.sec_uid
          : typeof u.sec_user_id === "string" ? u.sec_user_id
          : undefined,
      };
    }
  }

  // 深度递归搜索（处理 diagnosis API 等嵌套较深的响应格式）
  const deepResult = deepFindUser(payload, 0);
  if (deepResult) return deepResult;

  return null;
}

function deepFindUser(
  obj: unknown,
  depth: number,
): {
  uniqueId?: string;
  nickname?: string;
  avatarUrl?: string;
  followerCount?: number;
  followingCount?: number;
  awemeCount?: number;
  totalFavorited?: number;
  secUid?: string;
} | null {
  if (depth > 6 || !obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  // 检查当前层级是否包含用户信息字段
  if (
    (typeof record.follower_count === "number" || typeof record.unique_id === "string" || typeof record.nickname === "string") &&
    (record.follower_count !== undefined || record.unique_id !== undefined)
  ) {
    return {
      uniqueId: typeof record.unique_id === "string" ? record.unique_id : undefined,
      nickname: typeof record.nickname === "string" ? record.nickname : undefined,
      avatarUrl: extractAvatarUrl(record),
      followerCount: typeof record.follower_count === "number" ? record.follower_count : undefined,
      followingCount: typeof record.following_count === "number" ? record.following_count : undefined,
      awemeCount: typeof record.aweme_count === "number" ? record.aweme_count : undefined,
      totalFavorited: typeof record.total_favorited === "number" ? record.total_favorited : undefined,
      secUid: typeof record.sec_uid === "string" ? record.sec_uid
        : typeof record.sec_user_id === "string" ? record.sec_user_id
        : undefined,
    };
  }
  // 递归搜索子对象
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = deepFindUser(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractAvatarUrl(user: Record<string, unknown>): string | undefined {
  const avatar = user.avatar_larger ?? user.avatar_medium ?? user.avatar_thumb;
  if (!avatar || typeof avatar !== "object") return undefined;
  const a = avatar as Record<string, unknown>;
  const urlList = a.url_list;
  if (Array.isArray(urlList) && urlList.length > 0) {
    return String(urlList[0]);
  }
  return undefined;
}

// ─────────────────────────────────────────────
// 抖音作品列表同步
// ─────────────────────────────────────────────

async function syncDouyinWorks(
  connector: ConnectorPayloadMin,
  cookie?: string,
  days: number = 30,
): Promise<WorkItem[]> {
  const ident = await extractDouyinIdentifier(connector);
  log.info({ ident }, "syncDouyinWorks");
  const secUserId = ident.secUserId;
  if (!secUserId) {
    log.info("syncDouyinWorks: no secUserId, returning empty");
    return [];
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const works: WorkItem[] = [];

  try {
    // 拉取最新 20 条作品
    const res = await getTikHub<unknown>(
      "/api/v1/douyin/app/v3/fetch_user_post_videos",
      {
        sec_user_id: secUserId,
        max_cursor: 0,
        count: 20,
        sort_type: 1,
        ...(cookie ? { cookie } : {}),
      },
    );

    log.info({ ok: res.ok, httpStatus: res.httpStatus }, "works API response");
    if (!res.ok) {
      log.info({ businessCode: res.businessCode }, "works API not ok");
      return [];
    }

    const awemeList = extractAwemeList(res.payload);
    log.info({ awemeListLength: awemeList.length }, "awemeList fetched");
    let filteredCount = 0;
    for (const item of awemeList) {
      const createTime = Number(item.create_time ?? 0);
      const publishedAt = new Date(createTime * 1000);
      // 不再按时间窗口过滤，保留所有拉取到的作品
      // 旧逻辑：if (publishedAt.getTime() < cutoff.getTime()) continue;
      if (createTime === 0) {
        // create_time 为 0 说明 API 没返回时间，仍然保留
        log.info(`work ${item.aweme_id} has create_time=0, keeping anyway`);
      }

      const stats = (item.statistics ?? {}) as Record<string, number>;
      const video = (item.video ?? {}) as Record<string, unknown>;
      // duration from API is in milliseconds, convert to seconds
      const durationMs = typeof video.duration === "number" ? video.duration : 0;
      const durationSec = Math.round(durationMs / 1000);

      const likes = stats.digg_count ?? 0;
      const comments = stats.comment_count ?? 0;
      const shares = stats.share_count ?? 0;
      const collects = stats.collect_count ?? 0;
      // isHot: based on engagement (likes > 100k or total engagement > 200k)
      const totalEngagement = likes + comments + shares + collects;
      const isHot = likes > 100000 || totalEngagement > 200000;

      const work: WorkItem = {
        id: String(item.aweme_id ?? randomUUID()),
        title: String(item.desc ?? ""),
        coverUrl: extractCoverUrl(video),
        contentUrl: `https://www.douyin.com/video/${item.aweme_id}`,
        publishedAt: publishedAt.toISOString(),
        type: "video",
        isHot,
        // play_count is always 0 from Douyin APP API, omit views
        likes,
        comments,
        shares,
        collects,
        duration: durationSec > 0 ? formatDuration(durationSec) : undefined,
        tags: extractTags(item),
      };
      works.push(work);
    }
  } catch (err) {
    log.error({ err: err }, "syncDouyinWorks error");
  }

  return works;
}

function extractAwemeList(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;

  // Handle TikHubResult wrapper (safety net in case caller passes res instead of res.payload)
  const raw = (p.payload && typeof p.payload === "object") ? p.payload as Record<string, unknown> : p;

  const data = raw.data as Record<string, unknown> | undefined;
  const list = data?.aweme_list ?? raw.aweme_list ?? data?.items ?? raw.items;
  if (Array.isArray(list)) return list as Array<Record<string, unknown>>;
  return [];
}

function extractCoverUrl(video: Record<string, unknown>): string {
  // Try cover sources in order: cover > origin_cover > dynamic_cover
  for (const key of ["cover", "origin_cover", "dynamic_cover"]) {
    const cover = video[key];
    if (!cover || typeof cover !== "object") continue;
    const c = cover as Record<string, unknown>;
    const urlList = c.url_list;
    if (!Array.isArray(urlList) || urlList.length === 0) continue;

    // Prefer browser-compatible formats (jpeg/webp/png) over heic
    const urls = urlList.map(String);
    const compatible = urls.find(
      (u) => /\.(jpe?g|webp|png)/i.test(u) || !/\.heic/i.test(u),
    );
    if (compatible) return compatible;

    // If all are heic, convert the URL by replacing .heic with .jpeg in the path
    // Douyin CDN supports format conversion via the tplv parameter
    const heicUrl = urls[0];
    const jpegUrl = heicUrl.replace(/\.heic/i, ".jpeg");
    return jpegUrl;
  }
  return "";
}

function extractTags(item: Record<string, unknown>): string[] {
  const textExtra = item.text_extra;
  if (!Array.isArray(textExtra)) return [];
  return textExtra
    .filter((t) => t && typeof t === "object" && (t as Record<string, unknown>).hashtag_name)
    .map((t) => String((t as Record<string, unknown>).hashtag_name))
    .slice(0, 10);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
// 粉丝画像（抖音 Cookie 模式）
// ─────────────────────────────────────────────

async function syncDouyinFanProfile(cookie?: string): Promise<FanProfile | null> {
  if (!cookie) return null;

  try {
    // 抖音创作者中心粉丝画像（需要 Cookie）
    const res = await getTikHub<unknown>(
      "/api/v1/douyin/creator/fetch_creator_fan_portrait",
      { cookie },
    );

    if (res.ok) {
      return parseFanPortrait(res.payload);
    }
  } catch (err) {
    log.error({ err: err }, "syncDouyinFanProfile error");
  }

  return null;
}

function parseFanPortrait(payload: unknown): FanProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;

  // 性别分布
  const genderData = data.gender_distribution ?? data.gender ?? {};
  const genderObj = genderData as Record<string, unknown>;
  const malePct = Number(genderObj.male_ratio ?? genderObj.male ?? 30);
  const femalePct = Number(genderObj.female_ratio ?? genderObj.female ?? 70);

  // 年龄分布
  const ageRaw = data.age_distribution ?? data.age ?? [];
  const ageDistribution = Array.isArray(ageRaw)
    ? ageRaw.map((a: unknown) => {
        const item = a as Record<string, unknown>;
        return {
          range: String(item.age_range ?? item.range ?? "未知"),
          percentage: Number(item.ratio ?? item.percentage ?? 0),
        };
      })
    : buildDefaultAgeDistribution();

  // 城市分布
  const cityRaw = data.city_distribution ?? data.top_cities ?? [];
  const topCities = Array.isArray(cityRaw)
    ? cityRaw.slice(0, 8).map((c: unknown) => {
        const item = c as Record<string, unknown>;
        return {
          city: String(item.city ?? item.name ?? "未知"),
          percentage: Number(item.ratio ?? item.percentage ?? 0),
        };
      })
    : [];

  // 活跃时段
  const hourRaw = data.active_time_distribution ?? data.active_hours ?? [];
  const activeHours = Array.isArray(hourRaw)
    ? hourRaw.map((h: unknown) => {
        const item = h as Record<string, unknown>;
        return {
          hour: String(item.hour ?? item.time ?? "0"),
          percentage: Number(item.ratio ?? item.percentage ?? 0),
        };
      })
    : buildDefaultActiveHours();

  // 兴趣标签
  const tagRaw = data.interest_tags ?? data.tags ?? [];
  const interestTags = Array.isArray(tagRaw)
    ? tagRaw.map((t: unknown) => String(typeof t === "object" ? (t as Record<string, unknown>).name ?? t : t))
    : [];

  return {
    genderRatio: { male: malePct, female: femalePct },
    ageDistribution,
    topCities,
    activeHours,
    interestTags,
    dataSource: "live",
  };
}

function buildDefaultAgeDistribution() {
  return [
    { range: "18岁以下", percentage: 8 },
    { range: "18-23岁", percentage: 32 },
    { range: "24-30岁", percentage: 35 },
    { range: "31-40岁", percentage: 18 },
    { range: "40岁以上", percentage: 7 },
  ];
}

function buildDefaultActiveHours() {
  return [
    { hour: "7-9", percentage: 12 },
    { hour: "12-14", percentage: 18 },
    { hour: "17-19", percentage: 22 },
    { hour: "20-23", percentage: 35 },
    { hour: "其他", percentage: 13 },
  ];
}

// ─────────────────────────────────────────────
// 趋势数据构建（从作品发布数据倒推）
// ─────────────────────────────────────────────

function buildTrendFromWorks(works: WorkItem[], days: number = 30): TrendDataPoint[] {
  const trendMap = new Map<string, TrendDataPoint>();
  const now = new Date();

  // 初始化 30 天的空数据
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    trendMap.set(dateStr, {
      date: dateStr,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      collects: 0,
    });
  }

  // 将作品数据聚合到对应日期
  for (const work of works) {
    const dateStr = work.publishedAt.slice(0, 10);
    const existing = trendMap.get(dateStr);
    if (!existing) continue;

    existing.views = (existing.views ?? 0) + (work.views ?? 0);
    existing.likes = (existing.likes ?? 0) + (work.likes ?? 0);
    existing.comments = (existing.comments ?? 0) + (work.comments ?? 0);
    existing.shares = (existing.shares ?? 0) + (work.shares ?? 0);
    existing.collects = (existing.collects ?? 0) + (work.collects ?? 0);
  }

  return Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────
// MySQL 持久化
// ─────────────────────────────────────────────

async function persistOverview(
  userId: string,
  overview: AccountOverview,
): Promise<void> {
  await execute(
    `INSERT INTO creator_account_snapshots
     (user_id, platform_id, handle, nickname, avatar_url, followers, following,
      total_works, avg_engagement_rate,
      total_views, total_likes, total_comments, total_shares, total_collects,
      total_coins, total_favorites, total_reposts, total_reads, total_voteups,
      sync_source, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'tikhub',NOW())`,
    [
      userId,
      overview.platformId,
      overview.handle,
      overview.handle,
      overview.avatarUrl ?? null,
      overview.followers,
      overview.following,
      overview.totalWorks,
      overview.avgEngagementRate,
      overview.totalViews ?? 0,
      overview.totalLikes ?? 0,
      overview.totalComments ?? 0,
      overview.totalShares ?? 0,
      overview.totalCollects ?? 0,
      overview.totalCoins ?? 0,
      overview.totalFavorites ?? 0,
      overview.totalReposts ?? 0,
      overview.totalReads ?? 0,
      overview.totalVoteups ?? 0,
    ],
  );
}

async function persistWorks(
  userId: string,
  platformId: string,
  works: WorkItem[],
): Promise<void> {
  log.info(`Starting: userId=${userId}, platformId=${platformId}, worksCount=${works.length}`);
  if (works.length === 0) {
    log.info("No works to persist, returning");
    return;
  }

  for (const work of works) {
    try {
      // Calculate per-work engagement rate (capped at 9999999.999 to fit DECIMAL(10,3))
      const totalInteraction = (work.likes ?? 0) + (work.comments ?? 0) + (work.shares ?? 0) + (work.collects ?? 0);
      const views = work.views ?? 0;
      // When views=0 (common for Douyin APP API), use totalInteraction as a raw score instead of percentage
      const rawRate = views > 0
        ? Math.round(totalInteraction / views * 100 * 10) / 10
        : (totalInteraction > 0 ? Math.min(totalInteraction, 9999999) : 0);
      const engagementRate = Math.min(rawRate, 9999999.999);

      await execute(
        `INSERT INTO creator_works
         (user_id, platform_id, work_id, work_type, title, description, cover_url, video_url,
          duration, published_at, views, likes, comments, shares, collects, coins, favorites,
          reposts, \`reads\`, voteups, engagement_rate, hashtags, music_title, sync_source, synced_at, raw_payload)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)
         ON DUPLICATE KEY UPDATE
           views=VALUES(views), likes=VALUES(likes), comments=VALUES(comments),
           shares=VALUES(shares), collects=VALUES(collects), coins=VALUES(coins),
           favorites=VALUES(favorites), reposts=VALUES(reposts), \`reads\`=VALUES(\`reads\`),
           voteups=VALUES(voteups), engagement_rate=VALUES(engagement_rate),
           cover_url=IF(cover_url IS NULL OR cover_url='', VALUES(cover_url), cover_url),
           raw_payload=IF(raw_payload IS NULL, VALUES(raw_payload), raw_payload),
           synced_at=NOW()`,
        [
          userId,
          platformId,
          work.id,                                       // work_id (varchar)
          work.type ?? "video",                           // work_type
          work.title,                                     // title
          null,                                           // description
          work.coverUrl ?? null,                           // cover_url
          work.contentUrl ?? null,                         // video_url
          work.duration ? parseDurationToSec(work.duration) : null, // duration (int seconds)
          work.publishedAt ? new Date(work.publishedAt) : null,     // published_at
          work.views ?? 0,
          work.likes ?? 0,
          work.comments ?? 0,
          work.shares ?? 0,
          work.collects ?? 0,
          work.coins ?? 0,
          work.favorites ?? 0,
          work.reposts ?? 0,
          work.reads ?? 0,
          work.voteups ?? 0,
          engagementRate,                                  // engagement_rate
          JSON.stringify(work.tags ?? []),                  // hashtags (json)
          null,                                            // music_title
          "tikhub",                                        // sync_source
          work.rawPayload ? JSON.stringify(work.rawPayload) : null, // raw_payload
        ],
      );
      log.info(`Persisted work ${work.id} successfully`);
    } catch (err) {
      log.error({ err: err }, `Failed to persist work ${work.id}`);
    }
  }
}

function parseDurationToSec(duration: string): number {
  const parts = duration.split(":").map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  return 0;
}

async function persistFanProfile(
  userId: string,
  platformId: string,
  profile: FanProfile,
): Promise<void> {
  await execute(
    `INSERT INTO creator_fan_profiles
     (user_id, platform_id, gender_male_pct, gender_female_pct,
      age_distribution, top_cities, active_hours, interest_tags, data_source, synced_at)
     VALUES (?,?,?,?,?,?,?,?,'tikhub',NOW())
     ON DUPLICATE KEY UPDATE
       gender_male_pct=VALUES(gender_male_pct),
       gender_female_pct=VALUES(gender_female_pct),
       age_distribution=VALUES(age_distribution),
       top_cities=VALUES(top_cities),
       active_hours=VALUES(active_hours),
       interest_tags=VALUES(interest_tags),
       synced_at=NOW()`,
    [
      userId,
      platformId,
      profile.genderRatio.male,
      profile.genderRatio.female,
      JSON.stringify(profile.ageDistribution),
      JSON.stringify(profile.topCities),
      JSON.stringify(profile.activeHours),
      JSON.stringify(profile.interestTags),
    ],
  );
}

async function persistTrends(
  userId: string,
  platformId: string,
  trends: TrendDataPoint[],
): Promise<void> {
  for (const t of trends) {
    await execute(
      `INSERT INTO creator_daily_trends
       (user_id, platform_id, trend_date, new_views, new_likes, new_comments,
        new_shares, new_collects, total_followers, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE
         new_views=VALUES(new_views), new_likes=VALUES(new_likes),
         new_comments=VALUES(new_comments), new_shares=VALUES(new_shares),
         new_collects=VALUES(new_collects), total_followers=VALUES(total_followers),
         synced_at=NOW()`,
      [
        userId,
        platformId,
        t.date,
        t.views ?? 0,
        t.likes ?? 0,
        t.comments ?? 0,
        t.shares ?? 0,
        t.collects ?? 0,
        t.followers ?? 0,
      ],
    );
  }
}

// ─────────────────────────────────────────────
// 从数据库读取缓存数据
// ─────────────────────────────────────────────

export async function getCachedOverview(
  userId: string,
  platformId: string,
): Promise<AccountOverview | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_account_snapshots
     WHERE user_id=? AND platform_id=?
     ORDER BY synced_at DESC LIMIT 1`,
    [userId, platformId],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;

  // 计算变化量（与前一次快照对比）
  const prevRows = await query<RowDataPacket[]>(
    `SELECT followers, total_views, total_likes, total_comments, total_shares, avg_engagement_rate
     FROM creator_account_snapshots
     WHERE user_id=? AND platform_id=?
     ORDER BY synced_at DESC LIMIT 1 OFFSET 1`,
    [userId, platformId],
  );
  const prev = prevRows[0] as Record<string, unknown> | undefined;

  return {
    platformId: String(r.platform_id ?? platformId),
    platformName: platformId === "douyin" ? "抖音" : platformId === "xiaohongshu" ? "小红书" : String(platformId),
    handle: String(r.handle ?? ""),
    avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
    followers: Number(r.followers ?? 0),
    following: Number(r.following ?? 0),
    totalWorks: Number(r.total_works ?? 0),
    avgEngagementRate: Number(r.avg_engagement_rate ?? 0),
    totalViews: Number(r.total_views ?? 0),
    totalLikes: Number(r.total_likes ?? 0),
    totalComments: Number(r.total_comments ?? 0),
    totalShares: Number(r.total_shares ?? 0),
    totalCollects: Number(r.total_collects ?? 0),
    totalCoins: Number(r.total_coins ?? 0),
    totalFavorites: Number(r.total_favorites ?? 0),
    totalReposts: Number(r.total_reposts ?? 0),
    totalReads: Number(r.total_reads ?? 0),
    totalVoteups: Number(r.total_voteups ?? 0),
    followersChange: prev ? Number(r.followers ?? 0) - Number(prev.followers ?? 0) : 0,
    viewsChange: prev ? Number(r.total_views ?? 0) - Number(prev.total_views ?? 0) : 0,
    likesChange: prev ? Number(r.total_likes ?? 0) - Number(prev.total_likes ?? 0) : 0,
    commentsChange: prev ? Number(r.total_comments ?? 0) - Number(prev.total_comments ?? 0) : 0,
    sharesChange: prev ? Number(r.total_shares ?? 0) - Number(prev.total_shares ?? 0) : 0,
    collectsChange: prev ? Number(r.total_collects ?? 0) - Number(prev.total_collects ?? 0) : 0,
    engagementRateChange: prev
      ? Math.round((Number(r.avg_engagement_rate ?? 0) - Number(prev.avg_engagement_rate ?? 0)) * 10) / 10
      : 0,
    syncedAt: r.synced_at ? new Date(r.synced_at as string).toISOString() : new Date().toISOString(),
    dataSource: "cached",
  };
}

export async function getCachedWorks(
  userId: string,
  platformId: string,
  limit = 30,
  sortBy = "published_at",
): Promise<WorkItem[]> {
  const allowedSorts = ["published_at", "views", "likes", "comments", "shares", "collects"];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : "published_at";

  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_works
     WHERE user_id=? AND platform_id=?
     ORDER BY ${safeSort} DESC
     LIMIT ?`,
    [userId, platformId, limit],
  );

  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    const likes = Number(row.likes ?? 0);
    const comments = Number(row.comments ?? 0);
    const shares = Number(row.shares ?? 0);
    const collects = Number(row.collects ?? 0);
    const views = Number(row.views ?? 0);
    // Determine isHot: for douyin (no views), use likes threshold; otherwise use views
    const isHot = views > 0 ? views > 200000 : likes > 10000;
    return {
      id: String(row.work_id ?? row.id ?? ""),
      title: String(row.title ?? ""),
      coverUrl: row.cover_cdn_url ? String(row.cover_cdn_url) : String(row.cover_url ?? ""),
      contentUrl: row.video_url ? String(row.video_url) : undefined,
      publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : "",
      type: (row.work_type as WorkItem["type"]) ?? "video",
      isHot,
      views: views || undefined,  // omit if 0 (e.g. Douyin)
      likes,
      comments,
      shares,
      collects,
      coins: Number(row.coins ?? 0) || undefined,
      favorites: Number(row.favorites ?? 0) || undefined,
      reposts: Number(row.reposts ?? 0) || undefined,
      reads: Number(row.reads ?? 0) || undefined,
      voteups: Number(row.voteups ?? 0) || undefined,
      duration: row.duration ? formatDuration(Number(row.duration)) : undefined,
      tags: row.hashtags ? (typeof row.hashtags === "string" ? JSON.parse(row.hashtags) as string[] : row.hashtags as string[]) : [],
    };
  });
}

export async function getCachedFanProfile(
  userId: string,
  platformId: string,
): Promise<FanProfile | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_fan_profiles WHERE user_id=? AND platform_id=?`,
    [userId, platformId],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;

  return {
    genderRatio: {
      male: Number(r.gender_male_pct ?? 30),
      female: Number(r.gender_female_pct ?? 70),
    },
    ageDistribution: r.age_distribution
      ? (JSON.parse(r.age_distribution as string) as FanProfile["ageDistribution"])
      : buildDefaultAgeDistribution(),
    topCities: r.top_cities
      ? (JSON.parse(r.top_cities as string) as FanProfile["topCities"])
      : [],
    activeHours: r.active_hours
      ? (JSON.parse(r.active_hours as string) as FanProfile["activeHours"])
      : buildDefaultActiveHours(),
    interestTags: r.interest_tags
      ? (JSON.parse(r.interest_tags as string) as string[])
      : [],
    dataSource: "cached",
  };
}

export async function getCachedTrends(
  userId: string,
  platformId: string,
  days = 30,
): Promise<TrendDataPoint[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_daily_trends
     WHERE user_id=? AND platform_id=?
       AND trend_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY trend_date ASC`,
    [userId, platformId, days],
  );

  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      date: row.trend_date ? String(row.trend_date).slice(0, 10) : "",
      views: Number(row.new_views ?? 0),
      likes: Number(row.new_likes ?? 0),
      comments: Number(row.new_comments ?? 0),
      shares: Number(row.new_shares ?? 0),
      collects: Number(row.new_collects ?? 0),
      followers: Number(row.total_followers ?? 0),
      engagementRate: Number(row.engagement_rate ?? 0),
    };
  });
}

// ─────────────────────────────────────────────
// 小红书数据同步
// ─────────────────────────────────────────────

function extractXhsUserId(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  // 小红书 API 需要 hex 格式的内部 user_id（如 5e7b1ce50000000001009507）
  // 纯数字的小红书号（如 902474483）不能直接用于 API 调用
  if (pid && /^[a-f0-9]{16,}$/i.test(pid)) return pid;
  // 从 profileUrl 中提取 hex user_id
  const url = connector.profileUrl?.trim() || "";
  // https://www.xiaohongshu.com/user/profile/5a5c0e0be8ac2b04da76bca7
  const match = url.match(/\/user\/profile\/([a-f0-9]+)/i) || url.match(/\/user\/([a-f0-9]+)/i);
  if (match?.[1]) return match[1];
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle && /^[a-f0-9]{16,}$/i.test(handle)) return handle;
  return null;
}

async function syncXiaohongshuOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const userId = extractXhsUserId(connector);
  if (!userId) return null;

  let profilePayload: unknown = null;

  // L1: web_v2/fetch_user_info_app（最完整，返回 basic_info + interactions + tags）
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/xiaohongshu/web_v2/fetch_user_info_app",
      { user_id: userId },
    );
    if (res.ok) profilePayload = res.payload;
  } catch { /* fallthrough to L2 */ }

  // L2: web/get_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/xiaohongshu/web/get_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* fallthrough to L3 */ }
  }

  // L3: app/get_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/xiaohongshu/app/get_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* all levels failed */ }
  }

  if (!profilePayload) return null;

  try {
    const p = profilePayload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const basicInfo = (data.basic_info ?? data.user ?? data) as Record<string, unknown>;
    const interactions = (data.interactions ?? []) as Array<Record<string, unknown>>;

    let followers = 0, following = 0, totalLikes = 0;
    for (const item of interactions) {
      const name = String(item.name ?? "");
      const count = item.count;
      // v4.0 发现：粉丝数为纯数字（如 58814），不是中文格式
      const num = typeof count === "number" ? count : parseXhsCount(String(count ?? "0"));
      if (name.includes("粉丝") || item.type === "fans") followers = num;
      else if (name.includes("关注") || item.type === "follows") following = num;
      else if (name.includes("赞") || item.type === "interaction") totalLikes = num;
    }

    const nickname = String(basicInfo.nickname ?? basicInfo.name ?? "");
    const avatar = basicInfo.images ?? basicInfo.image;
    const avatarUrl = typeof avatar === "string" ? avatar
      : (avatar && typeof avatar === "object" && typeof (avatar as Record<string,unknown>).url === "string")
        ? String((avatar as Record<string,unknown>).url) : undefined;
    const redId = typeof basicInfo.red_id === "string" ? basicInfo.red_id : undefined;

    return {
      platformId: "xiaohongshu",
      platformName: "小红书",
      handle: redId ? `@${redId}` : (connector.handle ?? `@${nickname}`),
      avatarUrl,
      followers,
      following,
      totalWorks: 0, // will be updated from works count
      totalLikes,
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
    };
  } catch (err) {
    log.error({ err: err }, "syncXiaohongshuOverview error");
    return null;
  }
}

function parseXhsCount(str: string): number {
  str = str.trim();
  if (str.endsWith("万")) return Math.round(parseFloat(str) * 10000);
  if (str.endsWith("亿")) return Math.round(parseFloat(str) * 100000000);
  return parseInt(str.replace(/,/g, ""), 10) || 0;
}

async function syncXiaohongshuWorks(
  connector: ConnectorPayloadMin,
  days: number = 30,
): Promise<WorkItem[]> {
  const userId = extractXhsUserId(connector);
  if (!userId) return [];

  const works: WorkItem[] = [];
  // 小红书用户发布频率较低，不做时间截止过滤，获取所有可用作品
  const MAX_PAGES = 10;
  let cursor = "";

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      // L1: web_v2/fetch_home_notes（已包含完整互动数据）
      let notesPayload: unknown = null;
      try {
        const params: Record<string, unknown> = { user_id: userId };
        if (cursor) params.cursor = cursor;
        const res = await getTikHub<unknown>(
          "/api/v1/xiaohongshu/web_v2/fetch_home_notes",
          params,
        );
        // TikHub 小红书 API 有时返回 HTTP 400 但 payload 中包含有效数据
        if (res.ok || xhsPayloadHasNotes(res.payload)) notesPayload = res.payload;
      } catch { /* fallthrough to L2 */ }

      // L2: web_v2/fetch_home_notes_app
      if (!notesPayload) {
        try {
          const params: Record<string, unknown> = { user_id: userId };
          if (cursor) params.cursor = cursor;
          const res = await getTikHub<unknown>(
            "/api/v1/xiaohongshu/web_v2/fetch_home_notes_app",
            params,
          );
          if (res.ok || xhsPayloadHasNotes(res.payload)) notesPayload = res.payload;
        } catch { /* fallthrough to L3 */ }
      }

      // L3: web/get_user_notes_v2
      if (!notesPayload) {
        try {
          const params: Record<string, unknown> = { user_id: userId };
          if (cursor) params.cursor = cursor;
          const res = await getTikHub<unknown>(
            "/api/v1/xiaohongshu/web/get_user_notes_v2",
            params,
          );
          if (res.ok || xhsPayloadHasNotes(res.payload)) notesPayload = res.payload;
        } catch { /* all levels failed */ }
      }

      if (!notesPayload) break;

      const { notes, nextCursor, hasMore } = extractXhsNotes(notesPayload);
      if (notes.length === 0) break;

      for (const note of notes) {
        const work = parseXhsNoteToWork(note);
        works.push(work);
      }

      if (!hasMore || !nextCursor) break;
      cursor = nextCursor;
    }
  } catch (err) {
    log.error({ err: err }, "syncXiaohongshuWorks error");
  }
  return works;
}

/** TikHub 小红书 API 有时返回 HTTP 400 但 payload 中包含有效数据，检查 payload 是否包含 notes */
function xhsPayloadHasNotes(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;
  const innerData = (data.data ?? data) as Record<string, unknown>;
  const notes = innerData.notes ?? data.notes;
  return Array.isArray(notes) && notes.length > 0;
}

/** 从小红书作品列表 API 响应中提取 notes 数组、cursor 和 hasMore */
function extractXhsNotes(payload: unknown): {
  notes: Array<Record<string, unknown>>;
  nextCursor: string;
  hasMore: boolean;
} {
  if (!payload || typeof payload !== "object") return { notes: [], nextCursor: "", hasMore: false };
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;
  const innerData = (data.data ?? data) as Record<string, unknown>;

  // notes 可能在 data.notes 或 data.data.notes
  const notes = (innerData.notes ?? data.notes ?? []) as Array<Record<string, unknown>>;
  const nextCursor = String(innerData.cursor ?? data.cursor ?? "");
  const hasMore = Boolean(innerData.has_more ?? data.has_more ?? false);

  return { notes, nextCursor, hasMore };
}

/** 将小红书笔记原始数据解析为 WorkItem */
function parseXhsNoteToWork(note: Record<string, unknown>): WorkItem {
  const noteId = String(note.note_id ?? note.id ?? randomUUID());
  const displayTitle = String(note.display_title ?? note.title ?? note.name ?? "");

  // 封面图
  const cover = note.cover as Record<string, unknown> | undefined;
  let coverUrl = "";
  if (cover) {
    const urlList = cover.url_list ?? cover.info_list;
    if (Array.isArray(urlList) && urlList.length > 0) {
      const first = urlList[0];
      coverUrl = typeof first === "string" ? first : String((first as Record<string, unknown>)?.url ?? "");
    }
    if (!coverUrl) {
      coverUrl = String(cover.url ?? cover.url_default ?? "");
    }
  }
  // 回退：从 images_list[0].url 提取封面图（TikHub web_v2 接口返回格式）
  if (!coverUrl) {
    const imagesList = note.images_list ?? note.image_list;
    if (Array.isArray(imagesList) && imagesList.length > 0) {
      const firstImg = imagesList[0] as Record<string, unknown>;
      coverUrl = String(firstImg?.url ?? firstImg?.url_size_large ?? "");
    }
  }

  // 互动数据 - TikHub web_v2 接口直接在 note 顶层返回互动字段
  // 字段名：likes, collected_count, comments_count, share_count, nice_count, view_count
  const interactInfo = (note.interact_info ?? {}) as Record<string, unknown>;
  const likes = Number(interactInfo.liked_count ?? interactInfo.likedCount ?? note.likes ?? 0);
  const comments = Number(interactInfo.comment_count ?? interactInfo.commentCount ?? note.comments_count ?? note.comments ?? 0);
  const shares = Number(interactInfo.share_count ?? interactInfo.shareCount ?? note.share_count ?? note.shares ?? 0);
  const collects = Number(interactInfo.collected_count ?? interactInfo.collectedCount ?? note.collected_count ?? note.collects ?? 0);

  // 发布时间
  let publishedAt = "";
  const ts = note.time ?? note.create_time ?? note.timestamp;
  if (typeof ts === "number" && ts > 0) {
    publishedAt = new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
  } else if (typeof ts === "string" && ts) {
    publishedAt = new Date(ts).toISOString();
  }
  if (!publishedAt) publishedAt = new Date().toISOString();

  // 类型判断
  const noteType = String(note.type ?? note.note_type ?? "");
  const workType: WorkItem["type"] = noteType === "video" ? "video" : "note";

  // 标签
  const tagList = note.tag_list ?? note.topics ?? [];
  const tags = Array.isArray(tagList)
    ? tagList.map((t: unknown) => {
        if (typeof t === "string") return t;
        if (t && typeof t === "object") return String((t as Record<string, unknown>).name ?? (t as Record<string, unknown>).tag_name ?? "");
        return "";
      }).filter(Boolean).slice(0, 10)
    : [];

  return {
    id: noteId,
    title: displayTitle,
    coverUrl,
    contentUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
    publishedAt,
    type: workType,
    isHot: likes > 10000,
    likes,
    comments,
    shares,
    collects,
    tags,
  };
}

// ─────────────────────────────────────────────
// 小红书粉丝画像增强（通过粉丝列表采样推断）
// ─────────────────────────────────────────────

/**
 * 通过 TikHub 粉丝列表接口采样粉丝，推断粉丝画像
 * 由于小红书无官方粉丝画像 API，我们通过采样粉丝列表中的用户昵称、签名、标签等信息来估算
 * 返回增强后的 FanProfile，如果接口失败则返回 null（降级到估算画像）
 */
async function syncXiaohongshuFanProfile(
  connector: ConnectorPayloadMin,
): Promise<FanProfile | null> {
  const userId = extractXhsUserId(connector);
  if (!userId) return null;

  try {
    // 拉取粉丝列表（最多采样 100 个粉丝）
    const res = await getTikHub<unknown>(
      "/api/v1/xiaohongshu/web_v2/fetch_follower_list",
      { user_id: userId, limit: 50 },
    );
    if (!res.ok) {
      log.warn("syncXiaohongshuFanProfile: L1 failed, trying L2...");
      // L2: 尝试 web 接口
      const res2 = await getTikHub<unknown>(
        "/api/v1/xiaohongshu/web/get_user_followers",
        { user_id: userId, page: 1 },
      );
      if (!res2.ok) {
        log.warn("syncXiaohongshuFanProfile: L2 also failed");
        return null;
      }
      return parseXhsFollowerListToFanProfile(res2.payload);
    }

    return parseXhsFollowerListToFanProfile(res.payload);
  } catch (err) {
    log.error({ err: err }, "syncXiaohongshuFanProfile error");
    return null;
  }
}

/** 从粉丝列表响应中推断粉丝画像 */
function parseXhsFollowerListToFanProfile(payload: unknown): FanProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;
  const innerData = (data.data ?? data) as Record<string, unknown>;

  // 提取粉丝列表
  const followers = (innerData.followers ?? innerData.users ?? data.followers ?? data.users ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(followers) || followers.length === 0) return null;

  // 从粉丝昵称和签名中推断性别比例
  let maleHints = 0;
  let femaleHints = 0;
  const interestTagsMap = new Map<string, number>();

  for (const f of followers) {
    const nickname = String(f.nickname ?? f.name ?? "");
    const desc = String(f.desc ?? f.signature ?? f.bio ?? "");
    const tags = (f.tags ?? f.tag_list ?? []) as Array<unknown>;

    // 性别推断（简单启发式）
    const text = nickname + desc;
    if (/小姐姐|女生|女孩|姐姐|小仙女|美女|小姐|娘|妹妹|女王/.test(text)) {
      femaleHints++;
    } else if (/小哥哥|男生|帅哥|大叔|先生|先生|兄弟|老铁/.test(text)) {
      maleHints++;
    } else {
      // 小红书默认偏女性
      femaleHints += 0.6;
      maleHints += 0.4;
    }

    // 提取兴趣标签
    if (Array.isArray(tags)) {
      for (const t of tags) {
        const tagName = typeof t === "string" ? t : String((t as Record<string, unknown>)?.name ?? "");
        if (tagName) {
          interestTagsMap.set(tagName, (interestTagsMap.get(tagName) ?? 0) + 1);
        }
      }
    }
  }

  const total = maleHints + femaleHints;
  const malePct = total > 0 ? Math.round((maleHints / total) * 100) : 20;
  const femalePct = 100 - malePct;

  // 排序兴趣标签
  const sortedTags = [...interestTagsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  // 如果没有从粉丝列表中提取到标签，使用小红书默认标签
  const interestTags = sortedTags.length > 0
    ? sortedTags
    : ["美妆护肤", "穿搭", "生活方式", "美食", "旅行"];

  return {
    genderRatio: { male: malePct, female: femalePct },
    ageDistribution: buildDefaultAgeDistribution(),
    topCities: [
      { city: "上海", percentage: 12 },
      { city: "北京", percentage: 11 },
      { city: "广州", percentage: 9 },
      { city: "深圳", percentage: 8 },
      { city: "成都", percentage: 7 },
      { city: "杭州", percentage: 6 },
      { city: "武汉", percentage: 5 },
      { city: "其他", percentage: 42 },
    ],
    activeHours: buildDefaultActiveHours(),
    interestTags,
    dataSource: "estimated",  // 基于粉丝列表采样推断，仍属于估算类型
  };
}

// ─────────────────────────────────────────────
// 快手数据同步
// ─────────────────────────────────────────────

function extractKsUserId(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  if (pid && /^\d+$/.test(pid)) return pid;
  const url = connector.profileUrl?.trim() || "";
  const match = url.match(/\/profile\/(\d+)/);
  if (match?.[1]) return match[1];
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle && /^\d+$/.test(handle)) return handle;
  // 非数字的 platformUserId（可能是旧数据）也尝试作为 user_id
  if (pid) return pid;
  return null;
}

async function syncKuaishouOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const userId = extractKsUserId(connector);
  if (!userId) return null;

  let profilePayload: unknown = null;

  // L1: app/fetch_one_user_v2（最稳定）
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/kuaishou/app/fetch_one_user_v2",
      { user_id: userId },
    );
    if (res.ok) profilePayload = res.payload;
  } catch { /* fallthrough to L2 */ }

  // L2: web/fetch_user_info
  if (!profilePayload) {
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/kuaishou/web/fetch_user_info",
        { user_id: userId },
      );
      if (res.ok) profilePayload = res.payload;
    } catch { /* all levels failed */ }
  }

  if (!profilePayload) return null;

  try {
    const p = profilePayload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;

    // TikHub app/fetch_one_user_v2 returns nested: data.userProfile.profile + data.userProfile.ownerCount
    const userProfile = (data.userProfile ?? {}) as Record<string, unknown>;
    const profile = (userProfile.profile ?? {}) as Record<string, unknown>;
    const ownerCount = (userProfile.ownerCount ?? {}) as Record<string, unknown>;

    // Try nested structure first, then flat fallback
    const userName = String(profile.user_name ?? data.user_name ?? data.userName ?? data.nickname ?? "");
    const kwaiId = String(profile.kwaiId ?? data.kwaiId ?? data.kwai_id ?? "");
    const headUrl = profile.headurl ?? data.headurl ?? data.headUrl ?? data.head_url;
    const avatarUrl = typeof headUrl === "string" ? headUrl : undefined;
    const fansCount = Number(ownerCount.fan ?? data.fansCount ?? data.fans_count ?? data.fan ?? 0);
    const followCount = Number(ownerCount.follow ?? data.followCount ?? data.follow_count ?? data.following ?? 0);
    const photoCount = Number(ownerCount.photo ?? ownerCount.photo_public ?? data.photo_count ?? data.photoCount ?? data.photo ?? 0);

    // Validate: if we got a user_name, it's a valid response
    if (!userName && !kwaiId) {
      log.warn("syncKuaishouOverview: no user_name or kwaiId found in payload");
      return null;
    }

    return {
      platformId: "kuaishou",
      platformName: "快手",
      handle: kwaiId ? `@${kwaiId}` : (connector.handle ?? `@${userName}`),
      avatarUrl,
      followers: fansCount,
      following: followCount,
      totalWorks: photoCount,
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
    };
  } catch (err) {
    log.error({ err: err }, "syncKuaishouOverview error");
    return null;
  }
}

async function syncKuaishouWorks(
  connector: ConnectorPayloadMin,
  days: number = 30,
): Promise<WorkItem[]> {
  const userId = extractKsUserId(connector);
  if (!userId) return [];

  const works: WorkItem[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  // UI-4: 增大分页上限以支持更多作品（每页约20条，30页可获取约600条）
  const MAX_PAGES = 30;
  let pcursor = "";

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      // L1: app/fetch_user_post_v2（获取用户自己发布的作品，支持 pcursor 分页）
      let postsPayload: unknown = null;
      try {
        const params: Record<string, unknown> = { user_id: userId };
        if (pcursor) params.pcursor = pcursor;
        const res = await getTikHub<unknown>(
          "/api/v1/kuaishou/app/fetch_user_post_v2",
          params,
        );
        if (res.ok) postsPayload = res.payload;
      } catch { /* failed */ }

      if (!postsPayload) break;

      const { posts, nextCursor, hasMore } = extractKsPosts(postsPayload);
      if (posts.length === 0) break;

      let reachedCutoff = false;
      for (const post of posts) {
        const work = parseKsPostToWork(post);
        if (work.publishedAt && new Date(work.publishedAt) < cutoff) {
          reachedCutoff = true;
          continue;
        }
        works.push(work);
      }

      if (reachedCutoff || !hasMore || !nextCursor) break;
      pcursor = nextCursor;
    }
  } catch (err) {
    log.error({ err: err }, "syncKuaishouWorks error");
  }
  return works;
}

/** 从快手作品列表 API 响应中提取 posts 数组、cursor 和 hasMore */
function extractKsPosts(payload: unknown): {
  posts: Array<Record<string, unknown>>;
  nextCursor: string;
  hasMore: boolean;
} {
  if (!payload || typeof payload !== "object") return { posts: [], nextCursor: "", hasMore: false };
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p) as Record<string, unknown>;

  // fetch_user_post_v2 返回的作品在 data.feeds，其他端点可能在 data.list / data.photos
  const posts = (data.feeds ?? data.list ?? data.photos ?? data.visionProfilePhotoList ?? []) as Array<Record<string, unknown>>;
  const pageInfo = data.page_info as Record<string, unknown> | undefined;
  const nextCursor = String(data.pcursor ?? data.cursor ?? pageInfo?.cursor ?? "");
  const hasMore = nextCursor !== "" && nextCursor !== "no_more";

  return { posts, nextCursor, hasMore };
}

/** 将快手作品原始数据解析为 WorkItem */
function parseKsPostToWork(post: Record<string, unknown>): WorkItem {
  const photoId = String(post.photo_id ?? post.photoId ?? post.id ?? randomUUID());
  const caption = String(post.caption ?? post.title ?? post.desc ?? "");

  // 封面图 - 多层级深度搜索
  let coverUrl = "";

  // L1: 直接顶层字段
  const directCoverFields = [
    "coverUrl", "cover_url", "headUrl", "webPcCover", "cover",
    "coverImage", "cover_image", "thumbnailUrl", "thumbnail_url",
    "poster", "pic", "image", "img", "firstFrame", "first_frame",
  ];
  for (const field of directCoverFields) {
    if (coverUrl) break;
    const val = post[field];
    if (typeof val === "string" && val.startsWith("http")) {
      coverUrl = val;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      const c = val as Record<string, unknown>;
      const u = c.url ?? c.cdn ?? c.src ?? c.uri ?? "";
      if (typeof u === "string" && u.startsWith("http")) coverUrl = u;
    }
  }

  // L2: 快手 API 返回的封面图字段为 cover_thumbnail_urls（数组格式）
  if (!coverUrl) {
    const thumbArrayFields = ["cover_thumbnail_urls", "coverThumbnailUrls", "thumbnails", "images"];
    for (const field of thumbArrayFields) {
      if (coverUrl) break;
      const thumbs = post[field];
      if (Array.isArray(thumbs) && thumbs.length > 0) {
        const first = thumbs[0];
        if (typeof first === "string" && first.startsWith("http")) {
          coverUrl = first;
        } else if (first && typeof first === "object") {
          const u = (first as Record<string, unknown>).url ?? (first as Record<string, unknown>).src ?? "";
          if (typeof u === "string" && u.startsWith("http")) coverUrl = u;
        }
      }
    }
  }

  // L3: 嵌套对象中的封面图（photo.coverUrl, photo.headUrl 等）
  if (!coverUrl) {
    const nestedContainers = ["photo", "video", "media", "ext_params", "extParams"];
    for (const container of nestedContainers) {
      if (coverUrl) break;
      const nested = post[container];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const n = nested as Record<string, unknown>;
        for (const field of directCoverFields) {
          if (coverUrl) break;
          const val = n[field];
          if (typeof val === "string" && val.startsWith("http")) {
            coverUrl = val;
          } else if (val && typeof val === "object" && !Array.isArray(val)) {
            const c = val as Record<string, unknown>;
            const u = c.url ?? c.cdn ?? c.src ?? c.uri ?? "";
            if (typeof u === "string" && u.startsWith("http")) coverUrl = u;
          }
        }
      }
    }
  }

  // L4: 深度递归搜索 - 在整个对象树中查找第一个图片 URL
  if (!coverUrl) {
    const findFirstImageUrl = (obj: unknown, depth: number): string => {
      if (depth > 4 || !obj) return "";
      if (typeof obj === "string" && /^https?:\/\/.*\.(jpg|jpeg|png|webp|gif|kvif)/i.test(obj)) return obj;
      if (Array.isArray(obj)) {
        for (const item of obj.slice(0, 5)) {
          const found = findFirstImageUrl(item, depth + 1);
          if (found) return found;
        }
      } else if (typeof obj === "object") {
        const o = obj as Record<string, unknown>;
        // 优先搜索 cover/image 相关键
        const priorityKeys = Object.keys(o).filter(k => /cover|image|thumb|poster|pic|head|first.?frame/i.test(k));
        const otherKeys = Object.keys(o).filter(k => !/cover|image|thumb|poster|pic|head|first.?frame/i.test(k));
        for (const k of [...priorityKeys, ...otherKeys].slice(0, 20)) {
          const found = findFirstImageUrl(o[k], depth + 1);
          if (found) return found;
        }
      }
      return "";
    };
    coverUrl = findFirstImageUrl(post, 0);
  }

  // 互动数据
  const viewCount = Number(post.viewCount ?? post.view_count ?? post.playCount ?? 0);
  const likeCount = Number(post.likeCount ?? post.like_count ?? post.realLikeCount ?? 0);
  const commentCount = Number(post.commentCount ?? post.comment_count ?? 0);
  const shareCount = Number(post.shareCount ?? post.share_count ?? post.forwardCount ?? 0);

  // 发布时间
  let publishedAt = "";
  const ts = post.timestamp ?? post.time ?? post.create_time;
  if (typeof ts === "number" && ts > 0) {
    publishedAt = new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
  } else if (typeof ts === "string" && ts) {
    publishedAt = new Date(ts).toISOString();
  }
  if (!publishedAt) publishedAt = new Date().toISOString();

  // 时长
  const dur = post.duration ?? post.video_duration;
  const duration = typeof dur === "number" ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : undefined;

  // 标签
  const tagList = post.tags ?? post.tag_list ?? [];
  const tags = Array.isArray(tagList)
    ? tagList.map((t: unknown) => {
        if (typeof t === "string") return t;
        if (t && typeof t === "object") return String((t as Record<string, unknown>).name ?? (t as Record<string, unknown>).tag ?? "");
        return "";
      }).filter(Boolean).slice(0, 10)
    : [];

  return {
    id: photoId,
    title: caption,
    coverUrl,
    contentUrl: `https://www.kuaishou.com/short-video/${photoId}`,
    publishedAt,
    type: "video",
    isHot: viewCount > 100000,
    views: viewCount,
    likes: likeCount,
    comments: commentCount,
    shares: shareCount,
    reposts: shareCount,
    duration,
    tags,
    rawPayload: post,
  };
}

// ─────────────────────────────────────────────
// YouTube 数据同步
// ─────────────────────────────────────────────

function extractYoutubeChannelId(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  if (pid) return pid;
  const url = connector.profileUrl?.trim() || "";
  // https://www.youtube.com/channel/UCxxxxxxx or https://www.youtube.com/@handle
  const channelMatch = url.match(/\/channel\/([\w-]+)/);
  if (channelMatch?.[1]) return channelMatch[1];
  // @handle format — we'll use it as channel_id (the API may accept it)
  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch?.[1]) return `@${handleMatch[1]}`;
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle) return handle;
  return null;
}

async function syncYoutubeOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const channelId = extractYoutubeChannelId(connector);
  if (!channelId) return null;

  try {
    const res = await getTikHub<unknown>(
      "/api/v1/youtube/web/get_channel_info",
      { channel_id: channelId },
    );
    if (!res.ok) return null;
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const meta = (data.metadata ?? data) as Record<string, unknown>;

    const subscriberText = String(meta.subscriberCountText ?? meta.subscriber_count ?? "0");
    const videoCount = Number(meta.videosCountText ?? meta.video_count ?? data.videosCountText ?? 0);

    return {
      platformId: "youtube",
      platformName: "YouTube",
      handle: connector.handle ?? String(meta.title ?? ""),
      avatarUrl: typeof meta.avatar === "string" ? meta.avatar
        : (Array.isArray(meta.avatar) && meta.avatar.length > 0) ? String((meta.avatar[0] as Record<string,unknown>).url ?? "") : undefined,
      followers: parseYoutubeCount(subscriberText),
      following: 0,
      totalWorks: typeof videoCount === "number" ? videoCount : parseInt(String(videoCount).replace(/,/g, ""), 10) || 0,
      totalViews: Number(meta.viewCountText ?? meta.view_count ?? 0) || undefined,
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
    };
  } catch (err) {
    log.error({ err: err }, "syncYoutubeOverview error");
    return null;
  }
}

function parseYoutubeCount(str: string): number {
  str = str.trim().replace(/,/g, "");
  if (/[\d.]+[KkMmBb]/.test(str)) {
    const num = parseFloat(str);
    if (/[Kk]/.test(str)) return Math.round(num * 1000);
    if (/[Mm]/.test(str)) return Math.round(num * 1000000);
    if (/[Bb]/.test(str)) return Math.round(num * 1000000000);
  }
  if (str.endsWith("万")) return Math.round(parseFloat(str) * 10000);
  if (str.endsWith("亿")) return Math.round(parseFloat(str) * 100000000);
  return parseInt(str, 10) || 0;
}

async function syncYoutubeWorks(
  connector: ConnectorPayloadMin,
  days: number = 30,
): Promise<WorkItem[]> {
  const channelId = extractYoutubeChannelId(connector);
  if (!channelId) return [];

  const works: WorkItem[] = [];
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/youtube/web/get_channel_videos_v2",
      { channel_id: channelId },
    );
    if (!res.ok) return [];
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const items = (data.items ?? data.contents ?? []) as Array<Record<string, unknown>>;

    for (const item of items) {
      if (item.type !== "video") continue;
      const videoId = String(item.id ?? item.videoId ?? randomUUID());
      const title = String(item.title ?? "");
      const viewText = String(item.viewCountText ?? "0");
      const views = parseYoutubeCount(viewText);
      const lengthText = String(item.lengthText ?? "0:00");

      // Parse thumbnails
      const thumbs = (item.thumbnails ?? []) as Array<Record<string, unknown>>;
      const coverUrl = thumbs.length > 0 ? String(thumbs[thumbs.length - 1].url ?? "") : "";

      const work: WorkItem = {
        id: videoId,
        title,
        coverUrl,
        contentUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: new Date().toISOString(),
        type: "video",
        isHot: views > 1000000,
        views,
        duration: lengthText,
        tags: [],
      };
      works.push(work);
    }
  } catch (err) {
    log.error({ err: err }, "syncYoutubeWorks error");
  }
  return works;
}

// ─────────────────────────────────────────────
// Twitter/X 数据同步
// ─────────────────────────────────────────────

function extractTwitterScreenName(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  if (pid) return pid.replace(/^@+/, "");
  const url = connector.profileUrl?.trim() || "";
  // https://twitter.com/elonmusk or https://x.com/elonmusk
  const match = url.match(/(?:twitter|x)\.com\/([\w]+)/);
  if (match?.[1] && match[1] !== "i" && match[1] !== "intent") return match[1];
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle) return handle;
  return null;
}

async function syncTwitterOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const screenName = extractTwitterScreenName(connector);
  if (!screenName) return null;

  try {
    const res = await getTikHub<unknown>(
      "/api/v1/twitter/web/fetch_user_profile",
      { screen_name: screenName },
    );
    if (!res.ok) return null;
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const user = (data.user ?? data) as Record<string, unknown>;
    const legacy = (user.legacy ?? user) as Record<string, unknown>;

    return {
      platformId: "twitter",
      platformName: "Twitter/X",
      handle: `@${screenName}`,
      avatarUrl: typeof legacy.profile_image_url_https === "string"
        ? legacy.profile_image_url_https.replace("_normal", "") : undefined,
      followers: Number(legacy.followers_count ?? legacy.sub_count ?? 0),
      following: Number(legacy.friends_count ?? legacy.friends ?? 0),
      totalWorks: Number(legacy.statuses_count ?? 0),
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
    };
  } catch (err) {
    log.error({ err: err }, "syncTwitterOverview error");
    return null;
  }
}

async function syncTwitterWorks(
  connector: ConnectorPayloadMin,
  days: number = 30,
): Promise<WorkItem[]> {
  const screenName = extractTwitterScreenName(connector);
  if (!screenName) return [];

  const works: WorkItem[] = [];
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/twitter/web/fetch_user_post_tweet",
      { screen_name: screenName, cursor: "" },
    );
    if (!res.ok) return [];
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const timeline = (data.timeline ?? []) as Array<Record<string, unknown>>;

    for (const tweet of timeline) {
      const tweetId = String(tweet.tweet_id ?? tweet.id ?? randomUUID());
      const text = String(tweet.text ?? tweet.full_text ?? "");
      const createdAt = tweet.created_at ? new Date(String(tweet.created_at)).toISOString() : new Date().toISOString();
      const likes = Number(tweet.favorite_count ?? tweet.likes ?? 0);
      const retweets = Number(tweet.retweet_count ?? tweet.retweets ?? 0);
      const replies = Number(tweet.reply_count ?? tweet.replies ?? 0);
      const views = Number(tweet.views ?? tweet.view_count ?? 0);

      const work: WorkItem = {
        id: tweetId,
        title: text.slice(0, 100),
        coverUrl: "",
        contentUrl: `https://x.com/${screenName}/status/${tweetId}`,
        publishedAt: createdAt,
        type: "article",
        isHot: likes > 10000 || views > 1000000,
        views: views || undefined,
        likes,
        comments: replies,
        shares: retweets,
        tags: [],
      };
      works.push(work);
    }
  } catch (err) {
    log.error({ err: err }, "syncTwitterWorks error");
  }
  return works;
}

// ─────────────────────────────────────────────
// Instagram 数据同步
// ─────────────────────────────────────────────

function extractInstagramUsername(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  if (pid) return pid.replace(/^@+/, "");
  const url = connector.profileUrl?.trim() || "";
  // https://www.instagram.com/natgeo/
  const match = url.match(/instagram\.com\/([\w.]+)/);
  if (match?.[1] && match[1] !== "p" && match[1] !== "reel") return match[1];
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle) return handle;
  return null;
}

async function syncInstagramOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const username = extractInstagramUsername(connector);
  if (!username) return null;

  try {
    const res = await getTikHub<unknown>(
      "/api/v1/instagram/v1/fetch_user_info_by_username",
      { username },
    );
    if (!res.ok) return null;
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const user = (data.user ?? data) as Record<string, unknown>;

    return {
      platformId: "instagram",
      platformName: "Instagram",
      handle: `@${username}`,
      avatarUrl: typeof user.profile_pic_url_hd === "string" ? user.profile_pic_url_hd
        : typeof user.profile_pic_url === "string" ? user.profile_pic_url : undefined,
      followers: Number(user.follower_count ?? (user.edge_followed_by as Record<string,unknown>|undefined)?.count ?? 0),
      following: Number(user.following_count ?? (user.edge_follow as Record<string,unknown>|undefined)?.count ?? 0),
      totalWorks: Number(user.media_count ?? (user.edge_owner_to_timeline_media as Record<string,unknown>|undefined)?.count ?? 0),
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
      _instagramPk: String(user.pk ?? user.id ?? ""),
    } as AccountOverview & { _instagramPk?: string };
  } catch (err) {
    log.error({ err: err }, "syncInstagramOverview error");
    return null;
  }
}

async function syncInstagramWorks(
  connector: ConnectorPayloadMin,
  instagramPk?: string,
  days: number = 30,
): Promise<WorkItem[]> {
  // Need user_id (pk) to fetch posts
  let pk = instagramPk;
  if (!pk) {
    const username = extractInstagramUsername(connector);
    if (!username) return [];
    // Fetch user info to get pk
    try {
      const res = await getTikHub<unknown>(
        "/api/v1/instagram/v1/fetch_user_info_by_username",
        { username },
      );
      if (res.ok) {
        const p = res.payload as Record<string, unknown>;
        const data = (p.data ?? p) as Record<string, unknown>;
        const user = (data.user ?? data) as Record<string, unknown>;
        pk = String(user.pk ?? user.id ?? "");
      }
    } catch { return []; }
  }
  if (!pk) return [];

  const works: WorkItem[] = [];
  try {
    const res = await getTikHub<unknown>(
      "/api/v1/instagram/v1/fetch_user_posts",
      { user_id: pk, count: 20 },
    );
    if (!res.ok) return [];
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const items = (data.items ?? []) as Array<Record<string, unknown>>;

    for (const item of items) {
      const postId = String(item.pk ?? item.id ?? randomUUID());
      const caption = (item.caption ?? {}) as Record<string, unknown>;
      const text = String(caption.text ?? "");
      const createdAt = item.taken_at ? new Date(Number(item.taken_at) * 1000).toISOString() : new Date().toISOString();
      const likes = Number(item.like_count ?? 0);
      const comments = Number(item.comment_count ?? 0);
      const views = Number(item.view_count ?? item.play_count ?? 0);

      // Cover image
      const imageVersions = (item.image_versions2 ?? {}) as Record<string, unknown>;
      const candidates = (imageVersions.candidates ?? []) as Array<Record<string, unknown>>;
      const coverUrl = candidates.length > 0 ? String(candidates[0].url ?? "") : "";

      const shortcode = String(item.code ?? item.shortcode ?? "");

      const work: WorkItem = {
        id: postId,
        title: text.slice(0, 100),
        coverUrl,
        contentUrl: shortcode ? `https://www.instagram.com/p/${shortcode}/` : undefined,
        publishedAt: createdAt,
        type: "video",
        isHot: likes > 100000 || views > 1000000,
        views: views || undefined,
        likes,
        comments,
        tags: [],
      };
      works.push(work);
    }
  } catch (err) {
    log.error({ err: err }, "syncInstagramWorks error");
  }
  return works;
}

// ─────────────────────────────────────────────
// 微博数据同步
// ─────────────────────────────────────────────

function extractWeiboUid(connector: ConnectorPayloadMin): string | null {
  const pid = connector.platformUserId?.trim();
  if (pid && /^\d+$/.test(pid)) return pid;
  const url = connector.profileUrl?.trim() || "";
  // https://weibo.com/u/1669879400 or https://m.weibo.cn/u/1669879400
  const match = url.match(/\/u\/(\d+)/);
  if (match?.[1]) return match[1];
  const handle = connector.handle?.replace(/^@+/, "").trim();
  if (handle && /^\d+$/.test(handle)) return handle;
  return null;
}

async function syncWeiboOverview(
  connector: ConnectorPayloadMin,
): Promise<AccountOverview | null> {
  const uid = extractWeiboUid(connector);
  if (!uid) return null;

  try {
    const res = await getTikHub<unknown>(
      "/api/v1/weibo/web_v2/fetch_user_info",
      { uid },
    );
    if (!res.ok) return null;
    const p = res.payload as Record<string, unknown>;
    const data = (p.data ?? p) as Record<string, unknown>;
    const user = (data.user ?? data) as Record<string, unknown>;

    const statusCounter = (user.status_total_counter ?? {}) as Record<string, unknown>;

    return {
      platformId: "weibo",
      platformName: "微博",
      handle: `@${String(user.screen_name ?? connector.handle ?? "")}`,
      avatarUrl: typeof user.profile_image_url === "string" ? user.profile_image_url : undefined,
      followers: Number(user.followers_count ?? 0),
      following: Number(user.friends_count ?? 0),
      totalWorks: Number(user.statuses_count ?? 0),
      totalLikes: parseWeiboCount(String(statusCounter.like_cnt ?? "0")),
      totalComments: parseWeiboCount(String(statusCounter.comment_cnt ?? "0")),
      totalShares: parseWeiboCount(String(statusCounter.repost_cnt ?? "0")),
      avgEngagementRate: 0,
      syncedAt: new Date().toISOString(),
      dataSource: "live",
    };
  } catch (err) {
    log.error({ err: err }, "syncWeiboOverview error");
    return null;
  }
}

function parseWeiboCount(str: string): number {
  str = str.trim().replace(/,/g, "");
  if (str.endsWith("万")) return Math.round(parseFloat(str) * 10000);
  if (str.endsWith("亿")) return Math.round(parseFloat(str) * 100000000);
  return parseInt(str, 10) || 0;
}

// ─────────────────────────────────────────────
// 通用平台同步入口
// ─────────────────────────────────────────────

const SUPPORTED_SYNC_PLATFORMS = new Set(["douyin", "xiaohongshu", "kuaishou", "youtube", "twitter", "instagram", "weibo"]);

async function syncPlatformOverview(
  platformId: string,
  connector: ConnectorPayloadMin,
  cookie?: string,
): Promise<AccountOverview | null> {
  switch (platformId) {
    case "douyin": return syncDouyinOverview(connector, cookie);
    case "xiaohongshu": return syncXiaohongshuOverview(connector);
    case "youtube": return syncYoutubeOverview(connector);
    case "twitter": return syncTwitterOverview(connector);
    case "instagram": return syncInstagramOverview(connector);
    case "weibo": return syncWeiboOverview(connector);
    case "kuaishou": return syncKuaishouOverview(connector);
    default: return null;
  }
}

async function syncPlatformWorks(
  platformId: string,
  connector: ConnectorPayloadMin,
  overview: AccountOverview | null,
  cookie?: string,
  days: number = 30,
): Promise<WorkItem[]> {
  switch (platformId) {
    case "douyin": return syncDouyinWorks(connector, cookie, days);
    case "xiaohongshu": return syncXiaohongshuWorks(connector, days);
    case "youtube": return syncYoutubeWorks(connector, days);
    case "twitter": return syncTwitterWorks(connector, days);
    case "instagram": {
      const pk = (overview as AccountOverview & { _instagramPk?: string })?._instagramPk;
      return syncInstagramWorks(connector, pk, days);
    }
    case "kuaishou": return syncKuaishouWorks(connector, days);
    default: return [];
  }
}

// ─────────────────────────────────────────────
// 主入口：完整同步
// ─────────────────────────────────────────────

export interface SyncInput {
  userId: string;
  platformId: string;
  platformUserId?: string;
  handle?: string;
  profileUrl?: string;
  encryptedSecretRef?: string;
  days?: number;
  persist?: boolean;
  forceRefresh?: boolean;
}

// 同步频率限制：同一账号 24 小时内不自动重复同步（优化API调用量）
const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const lastSyncMap = new Map<string, { ts: number; result: SyncResult }>();

export async function syncCreatorData(input: SyncInput): Promise<SyncResult> {
  const {
    userId,
    platformId,
    platformUserId,
    handle,
    profileUrl,
    encryptedSecretRef,
    days = 30,
    persist = true,
  } = input;

  const syncedAt = new Date().toISOString();

  // ★ 频率限制：同一账号 24 小时内自动同步返回缓存结果（用户手动刷新可绕过）
  const syncKey = `${userId}:${platformId}:${platformUserId || handle || profileUrl}`;
  const forceRefresh = input.forceRefresh === true;
  const lastSync = lastSyncMap.get(syncKey);
  if (!forceRefresh && lastSync && Date.now() - lastSync.ts < SYNC_COOLDOWN_MS) {
    log.info(`[SYNC-THROTTLE] Skipping sync for ${syncKey}, last synced ${Math.round((Date.now() - lastSync.ts) / 60000)}min ago. Use forceRefresh=true to bypass.`);
    return { ...lastSync.result, syncedAt };
  }

  // 解析 Cookie（如果有）
  let cookie: string | undefined;
  if (encryptedSecretRef) {
    try {
      cookie = await resolveCookieSecret(encryptedSecretRef) ?? undefined;
    } catch { /* ignore */ }
  }

  const connector: ConnectorPayloadMin = {
    platformId,
    platformUserId,
    handle,
    profileUrl,
    encryptedSecretRef,
  };

  try {
    // 检查是否支持实时同步
    if (!SUPPORTED_SYNC_PLATFORMS.has(platformId)) {
      // 不支持的平台：从缓存读取
      const cachedOverview = await getCachedOverview(userId, platformId);
      const cachedWorks = await getCachedWorks(userId, platformId);
      const cachedFan = await getCachedFanProfile(userId, platformId);
      const cachedTrends = await getCachedTrends(userId, platformId, days);

      if (cachedOverview) {
        return {
          success: true,
          overview: cachedOverview,
          works: cachedWorks,
          fanProfile: cachedFan ?? buildEstimatedFanProfile(platformId),
          trendData: cachedTrends,
          syncedAt,
        };
      }

      return {
        success: false,
        error: `平台 ${platformId} 暂不支持数据同步，API接入开发中`,
        syncedAt,
      };
    }

    // ========== 统一的多平台同步流程 ==========

    // 1. 同步账号概览
    const overview = await syncPlatformOverview(platformId, connector, cookie);
    if (!overview) {
      return { success: false, error: "无法获取账号信息，请检查账号标识是否正确", syncedAt };
    }

    // 2. 抽取平台特定的元数据（如抖音的secUid）
    if (platformId === "douyin") {
      const overviewWithMeta = overview as AccountOverview & { _secUid?: string };
      if (overviewWithMeta._secUid && !connector.platformUserId?.startsWith("MS4w")) {
        connector.platformUserId = overviewWithMeta._secUid;
      }
    }

    // 3. 同步作品列表
    const works = await syncPlatformWorks(platformId, connector, overview, cookie, days);

    // 4. 计算平均互动率（基于粉丝数）
    if (works.length > 0) {
      const followers = overview.followers || 1;
      const totalEngagement = works.reduce((sum, w) => {
        const interaction = (w.likes ?? 0) + (w.comments ?? 0) + (w.shares ?? 0) + (w.collects ?? 0);
        return sum + interaction;
      }, 0);
      overview.avgEngagementRate = Math.round((totalEngagement / works.length / followers) * 100 * 10) / 10;

      // 汇总作品级指标（保留 profile API 的 totalLikes 如果已有）
      if (!overview.totalComments) {
        overview.totalComments = works.reduce((s, w) => s + (w.comments ?? 0), 0);
      }
      if (!overview.totalShares) {
        overview.totalShares = works.reduce((s, w) => s + (w.shares ?? 0), 0);
      }
      if (!overview.totalCollects) {
        overview.totalCollects = works.reduce((s, w) => s + (w.collects ?? 0), 0);
      }
      if (!overview.totalViews) {
        const totalViews = works.reduce((s, w) => s + (w.views ?? 0), 0);
        if (totalViews > 0) overview.totalViews = totalViews;
      }
      overview.totalWorks = overview.totalWorks || works.length;
    }

    // 5. 同步粉丝画像（抖音用 Creator API，小红书用粉丝列表采样，其他平台用估算）
    let fanProfile: FanProfile | null = null;
    if (platformId === "douyin") {
      fanProfile = await syncDouyinFanProfile(cookie);
    } else if (platformId === "xiaohongshu") {
      fanProfile = await syncXiaohongshuFanProfile(connector);
    }

    // 6. 构建趋势数据（并注入当天粉丝数）
    const trendData = buildTrendFromWorks(works, days);
    if (trendData.length > 0 && overview.followers > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const todayTrend = trendData.find(t => t.date === today);
      if (todayTrend) {
        todayTrend.followers = overview.followers;
      }
    }

    // 7. 持久化
    log.info(`persist=${persist}, userId=${userId}, platformId=${platformId}, worksCount=${works.length}`);
    if (persist) {
      try {
        log.info("Starting persistOverview...");
        await persistOverview(userId, overview);
        log.info("persistOverview done. Starting persistWorks...");
        await persistWorks(userId, platformId, works);
        log.info("persistWorks done.");
        if (fanProfile) await persistFanProfile(userId, platformId, fanProfile);
        await persistTrends(userId, platformId, trendData);
        log.info("All persist operations completed.");
      } catch (dbErr) {
        log.error({ err: dbErr }, "persist error");
      }
    }

    const successResult: SyncResult = {
      success: true,
      overview,
      works,
      fanProfile: fanProfile ?? buildEstimatedFanProfile(platformId),
      trendData,
      syncedAt,
    };
    // ★ 缓存成功结果用于频率限制
    lastSyncMap.set(syncKey, { ts: Date.now(), result: successResult });
    // 清理过期缓存
    if (lastSyncMap.size > 50) {
      const now = Date.now();
      for (const [k, v] of lastSyncMap) {
        if (now - v.ts > SYNC_COOLDOWN_MS) lastSyncMap.delete(k);
      }
    }
    return successResult;
  } catch (err) {
    log.error({ err: err }, "syncCreatorData error");
    return {
      success: false,
      error: err instanceof Error ? err.message : "同步失败，请稍后重试",
      syncedAt,
    };
  }
}

/** 估算粉丝画像（无真实数据时的降级方案） */
function buildEstimatedFanProfile(platformId: string): FanProfile {
  const isDouyin = platformId === "douyin";
  const isXhs = platformId === "xiaohongshu";
  const isKuaishou = platformId === "kuaishou";
  return {
    genderRatio: isDouyin ? { male: 28, female: 72 } : isXhs ? { male: 15, female: 85 } : isKuaishou ? { male: 42, female: 58 } : { male: 35, female: 65 },
    ageDistribution: buildDefaultAgeDistribution(),
    topCities: isKuaishou
      ? [
          { city: "哈尔滨", percentage: 8 },
          { city: "北京", percentage: 7 },
          { city: "沈阳", percentage: 6 },
          { city: "长春", percentage: 5 },
          { city: "成都", percentage: 5 },
          { city: "郑州", percentage: 5 },
          { city: "石家庄", percentage: 4 },
          { city: "其他", percentage: 60 },
        ]
      : [
          { city: "上海", percentage: 12 },
          { city: "北京", percentage: 11 },
          { city: "广州", percentage: 9 },
          { city: "深圳", percentage: 8 },
          { city: "成都", percentage: 7 },
          { city: "杭州", percentage: 6 },
          { city: "武汉", percentage: 5 },
          { city: "其他", percentage: 42 },
        ],
    activeHours: buildDefaultActiveHours(),
    interestTags: isXhs
      ? ["美妆护肤", "穿搭", "生活方式", "美食", "旅行"]
      : isKuaishou
        ? ["生活记录", "搞笑幽默", "美食", "手工艺", "农村"]
        : ["生活", "娱乐", "知识", "美食", "旅行"],
    dataSource: "estimated",
  };
}
