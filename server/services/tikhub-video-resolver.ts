/**
 * tikhub-video-resolver.ts
 *
 * 通过 TikHub API 按平台 + 视频 ID 解析视频，拿到一个新鲜的播放直链 +
 * 完整元信息。用来替代第三方 watermark API 那一跳。
 *
 * 已覆盖：抖音 / 小红书 / 快手。其他平台（B站 / 视频号 / TikTok）
 * 由调用方降级到 legacy/video-parser.ts。
 */

import { getTikHub } from "../legacy/tikhub";

export interface ResolvedVideo {
  videoUrl: string;
  coverUrl?: string;
  title?: string;
  author?: string;
  duration?: number; // 毫秒
  hasWatermark?: boolean;
}

/** 支持的平台标识，命名跟数据库 platform_id 对齐 */
export type ResolvablePlatform = "douyin" | "xiaohongshu" | "kuaishou";

interface DouyinAwemeDetail {
  desc?: string;
  author?: { nickname?: string };
  video?: {
    play_addr?: { url_list?: string[] };
    play_addr_h264?: { url_list?: string[] };
    download_addr?: { url_list?: string[] };
    cover?: { url_list?: string[] };
    origin_cover?: { url_list?: string[] };
    duration?: number;
    has_watermark?: boolean;
  };
}

/**
 * 抖音 aweme_id → 播放直链。实测端点：/api/v1/douyin/web/fetch_one_video。
 * @throws 当 TikHub 调用失败 / 返回里没有 play_addr 时抛出可读错误
 */
export async function fetchDouyinVideoByAwemeId(
  awemeId: string,
): Promise<ResolvedVideo> {
  if (!awemeId || !/^\d+$/.test(awemeId)) {
    throw new Error(`无效的抖音 aweme_id: ${awemeId}`);
  }

  const res = await getTikHub<{
    code?: number;
    data?: { aweme_detail?: DouyinAwemeDetail };
  }>("/api/v1/douyin/web/fetch_one_video", { aweme_id: awemeId });

  if (!res.ok) {
    throw new Error(
      `TikHub fetch_one_video 调用失败：HTTP ${res.httpStatus} businessCode ${res.businessCode}`,
    );
  }

  const detail = res.payload?.data?.aweme_detail;
  const video = detail?.video;
  const playUrl =
    video?.play_addr?.url_list?.[0] ??
    video?.play_addr_h264?.url_list?.[0] ??
    video?.download_addr?.url_list?.[0];

  if (!playUrl) {
    throw new Error(
      `TikHub 返回缺少视频直链字段（aweme_id=${awemeId} 可能已被删除或不存在）`,
    );
  }

  return {
    videoUrl: playUrl,
    coverUrl:
      video?.origin_cover?.url_list?.[0] ?? video?.cover?.url_list?.[0],
    title: detail?.desc,
    author: detail?.author?.nickname,
    duration: video?.duration,
    hasWatermark: video?.has_watermark,
  };
}

/**
 * 小红书 note_id → 播放直链。
 * 端点降级链：web/get_note_info → app/get_note_info → app_v2/fetch_one_note。
 * 不同端点返回的 schema 略有不同，这里做尽可能宽的字段提取。
 */
export async function fetchXhsNoteByNoteId(noteId: string): Promise<ResolvedVideo> {
  if (!noteId) throw new Error("无效的小红书 note_id");

  const endpoints = [
    "/api/v1/xiaohongshu/web/get_note_info",
    "/api/v1/xiaohongshu/app/get_note_info",
    "/api/v1/xiaohongshu/app_v2/fetch_one_note",
  ];

  let lastError = "";
  for (const path of endpoints) {
    try {
      const res = await getTikHub<Record<string, unknown>>(path, {
        note_id: noteId,
      });
      if (!res.ok) {
        lastError = `${path} HTTP ${res.httpStatus} biz ${res.businessCode}`;
        continue;
      }
      const resolved = extractXhsVideoFromPayload(res.payload);
      if (resolved.videoUrl) return resolved;
      lastError = `${path} 返回 schema 中无视频直链字段`;
    } catch (err) {
      lastError = `${path} 抛异常：${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`TikHub 小红书视频解析失败（note_id=${noteId}）：${lastError}`);
}

/**
 * 快手 photo_id → 播放直链。
 * 端点降级链：web/fetch_one_video → app/fetch_one_video → app/fetch_one_photo。
 */
export async function fetchKuaishouVideoByPhotoId(
  photoId: string,
): Promise<ResolvedVideo> {
  if (!photoId) throw new Error("无效的快手 photo_id");

  const endpoints = [
    "/api/v1/kuaishou/web/fetch_one_video",
    "/api/v1/kuaishou/app/fetch_one_video",
    "/api/v1/kuaishou/app/fetch_one_photo",
  ];

  let lastError = "";
  for (const path of endpoints) {
    try {
      const res = await getTikHub<Record<string, unknown>>(path, {
        photo_id: photoId,
      });
      if (!res.ok) {
        lastError = `${path} HTTP ${res.httpStatus} biz ${res.businessCode}`;
        continue;
      }
      const resolved = extractKuaishouVideoFromPayload(res.payload);
      if (resolved.videoUrl) return resolved;
      lastError = `${path} 返回 schema 中无视频直链字段`;
    } catch (err) {
      lastError = `${path} 抛异常：${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`TikHub 快手视频解析失败（photo_id=${photoId})：${lastError}`);
}

/**
 * 顶层入口：按已知 platform + videoId 拿播放直链。
 * 不带兜底——失败直接抛错让调用方决定降级。
 */
export async function resolveByPlatform(
  platform: ResolvablePlatform,
  videoId: string,
): Promise<ResolvedVideo> {
  switch (platform) {
    case "douyin":
      return fetchDouyinVideoByAwemeId(videoId);
    case "xiaohongshu":
      return fetchXhsNoteByNoteId(videoId);
    case "kuaishou":
      return fetchKuaishouVideoByPhotoId(videoId);
    default: {
      const _exhaustive: never = platform;
      throw new Error(`不支持的平台：${String(_exhaustive)}`);
    }
  }
}

/**
 * 从分享口令 / 链接里抽出 platform + videoId（best effort）。
 * 命中则可走 TikHub；不命中则交给 watermark API 兜底。
 */
export function detectPlatformFromShareUrl(
  shareUrl: string,
): { platform: ResolvablePlatform; videoId: string } | null {
  if (!shareUrl) return null;
  const url = shareUrl.trim();

  // 抖音：https://www.douyin.com/video/{aweme_id} 或短链 v.douyin.com（短链需先展开，这里只识别已展开的）
  const douyinMatch = url.match(/douyin\.com\/(?:video|note)\/(\d+)/);
  if (douyinMatch?.[1]) return { platform: "douyin", videoId: douyinMatch[1] };

  // 小红书：https://www.xiaohongshu.com/explore/{note_id} 或 /discovery/item/{note_id}
  const xhsMatch = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-f0-9]+)/i);
  if (xhsMatch?.[1]) return { platform: "xiaohongshu", videoId: xhsMatch[1] };

  // 快手：https://www.kuaishou.com/short-video/{photo_id} 或 /profile/.../photoId={id}
  const kuaiMatch =
    url.match(/kuaishou\.com\/short-video\/([a-zA-Z0-9_-]+)/) ??
    url.match(/kuaishou\.com\/.*photoId=([a-zA-Z0-9_-]+)/);
  if (kuaiMatch?.[1]) return { platform: "kuaishou", videoId: kuaiMatch[1] };

  return null;
}

/**
 * 一站式：用分享 URL 解析视频。
 * 1. 从 URL 推 platform + id
 * 2. 调对应 TikHub 端点
 * 失败抛错，由调用方决定是否降级到 watermark API。
 */
export async function resolveVideoByShareUrl(
  shareUrl: string,
): Promise<ResolvedVideo> {
  const detected = detectPlatformFromShareUrl(shareUrl);
  if (!detected) {
    throw new Error(
      `无法从 URL 中识别平台或视频 ID：${shareUrl.slice(0, 80)}`,
    );
  }
  return resolveByPlatform(detected.platform, detected.videoId);
}

// ─────────────────────────────────────────────
// 字段提取辅助（小红书 / 快手 schema 较杂，做宽松匹配）
// ─────────────────────────────────────────────

function pickFirstString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === "string" && item) return item;
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (typeof obj.url === "string" && obj.url) return obj.url;
          if (typeof obj.master_url === "string" && obj.master_url) return obj.master_url;
        }
      }
    }
  }
  return undefined;
}

function deepFindNoteOrVideo(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const queue: Record<string, unknown>[] = [payload as Record<string, unknown>];
  const visited = new WeakSet<object>();
  while (queue.length) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    // 命中常见挂载点
    for (const key of ["note", "note_info", "noteInfo", "data", "video", "photo", "item"]) {
      const v = node[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>;
        if (
          "video" in obj ||
          "image_list" in obj ||
          "play_addr" in obj ||
          "main_mv_urls" in obj ||
          "manifest" in obj
        ) {
          return obj;
        }
        queue.push(obj);
      }
    }
    // 兜底全量遍历
    for (const v of Object.values(node)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        queue.push(v as Record<string, unknown>);
      }
    }
  }
  return null;
}

function extractXhsVideoFromPayload(payload: unknown): ResolvedVideo {
  const node = deepFindNoteOrVideo(payload) ?? {};
  const video = node.video as Record<string, unknown> | undefined;
  const consumer = (video?.consumer as Record<string, unknown> | undefined) ?? video;
  const media = (video?.media as Record<string, unknown> | undefined) ?? consumer;
  const stream = media?.stream as Record<string, unknown> | undefined;

  const playUrl = pickFirstString(
    consumer?.origin_video_key,
    media?.video_url,
    media?.url,
    stream?.h264,
    stream?.h265,
    stream?.av1,
    media?.master_url,
    video?.url,
  );

  const coverUrl = pickFirstString(
    (node.cover as Record<string, unknown> | undefined)?.url,
    (node.cover as Record<string, unknown> | undefined)?.url_pre,
    (node.image_list as unknown[]) ?? [],
  );

  const author = (node.user as Record<string, unknown> | undefined)?.nickname
    ?? (node.author as Record<string, unknown> | undefined)?.nickname;

  return {
    videoUrl: playUrl ?? "",
    coverUrl,
    title: typeof node.title === "string" ? node.title
      : typeof node.desc === "string" ? node.desc : undefined,
    author: typeof author === "string" ? author : undefined,
  };
}

function extractKuaishouVideoFromPayload(payload: unknown): ResolvedVideo {
  const node = deepFindNoteOrVideo(payload) ?? {};
  const photo = (node.photo as Record<string, unknown> | undefined) ?? node;
  const mainMvUrls = photo?.main_mv_urls as unknown[] | undefined;
  const manifest = photo?.manifest as Record<string, unknown> | undefined;
  const adaptationSet = (manifest?.adaptationSet as unknown[] | undefined)?.[0] as
    | Record<string, unknown>
    | undefined;
  const representations = adaptationSet?.representation as unknown[] | undefined;

  const playUrl = pickFirstString(
    photo?.play_url,
    photo?.playUrl,
    mainMvUrls,
    representations,
  );

  const coverUrl = pickFirstString(
    photo?.cover_thumbnail_urls,
    photo?.cover_urls,
    photo?.thumbnail_url,
  );

  return {
    videoUrl: playUrl ?? "",
    coverUrl,
    title:
      typeof photo?.caption === "string" ? photo.caption
      : typeof photo?.photo_caption === "string" ? photo.photo_caption
      : undefined,
    author:
      typeof photo?.user_name === "string" ? photo.user_name
      : typeof photo?.userName === "string" ? photo.userName
      : undefined,
  };
}
