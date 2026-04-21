/**
 * video-download.ts — 视频万能下载服务
 *
 * 调用去水印 API 解析视频链接，返回无水印视频/音频下载地址
 * 支持：抖音、快手、B站、小红书、视频号等
 */

const VIDEO_PARSE_API = "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse";
const VIDEO_PARSE_KEY = "dw8uiZ3Z3TF0YqQA";
const PARSE_TIMEOUT_MS = 15_000;

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

interface RawVideoParseResult {
  type: "VIDEO" | "AUDIO" | "IMAGE" | string;
  title: string;
  originalLink: string;
  cover?: { url: string };
  videos?: { url: string }[];
  audios?: { url: string }[];
  likeCount?: number;
  collectCount?: number;
  shareCount?: number;
  commentCount?: number;
  publishTime?: number;
  pt?: string;
  allowDownload?: boolean;
}

export interface VideoDownloadResult {
  ok: boolean;
  error?: string;
  /** 视频标题 */
  title: string;
  /** 平台名称 */
  platform: string;
  /** 封面图 */
  coverUrl?: string;
  /** 原始链接 */
  originalLink: string;
  /** 无水印视频下载地址（首选） */
  videoUrl?: string;
  /** 所有可用视频地址 */
  videoUrls: string[];
  /** 独立音频下载地址 */
  audioUrl?: string;
  /** 内容类型 */
  contentType: string;
  /** 互动数据 */
  stats: {
    likeCount: number;
    collectCount: number;
    shareCount: number;
    commentCount: number;
    publishTime?: number;
  };
}

/* ─────────────────────────────────────────────
   工具函数
───────────────────────────────────────────── */

function extractUrlFromText(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s\u3000\u4e00-\u9fff，。！？【】「」]+/g;
  const matches = text.match(urlPattern);
  if (!matches) return null;

  const videoPlatforms = [
    "douyin.com", "v.douyin.com", "iesdouyin.com",
    "kuaishou.com", "gifshow.com",
    "bilibili.com", "b23.tv",
    "xiaohongshu.com", "xhslink.com",
    "weixin.qq.com", "channels.weixin.qq.com",
    "youtube.com", "youtu.be",
    "tiktok.com",
  ];

  for (const url of matches) {
    if (videoPlatforms.some(p => url.includes(p))) {
      return url.replace(/[）)]+$/, "");
    }
  }

  return matches[0] || null;
}

function detectPlatform(url: string): string {
  if (url.includes("douyin.com") || url.includes("iesdouyin.com")) return "抖音";
  if (url.includes("kuaishou.com") || url.includes("gifshow.com")) return "快手";
  if (url.includes("bilibili.com") || url.includes("b23.tv")) return "B站";
  if (url.includes("xiaohongshu.com") || url.includes("xhslink.com")) return "小红书";
  if (url.includes("weixin.qq.com") || url.includes("channels")) return "视频号";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  return "未知平台";
}

/* ─────────────────────────────────────────────
   核心函数
───────────────────────────────────────────── */

/**
 * 解析视频链接并返回无水印下载地址
 */
export async function parseAndDownloadVideo(input: string): Promise<VideoDownloadResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    return makeError("输入内容不能为空");
  }

  const extractedUrl = extractUrlFromText(trimmed);
  const urlToUse = extractedUrl || trimmed;

  console.log(`[VideoDownload] 解析: ${urlToUse.slice(0, 80)}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    const resp = await fetch(`${VIDEO_PARSE_API}?key=${VIDEO_PARSE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([urlToUse]),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return makeError(`接口请求失败 ${resp.status}: ${errText}`);
    }

    const json = (await resp.json()) as {
      code: number;
      ok: boolean;
      data: (RawVideoParseResult | null)[];
    };

    if (!json.ok || !json.data?.[0]) {
      return makeError("该链接无法解析，请检查链接是否有效或平台是否支持");
    }

    const raw = json.data[0];
    const videoUrls = (raw.videos ?? []).map(v => v.url).filter(Boolean);
    const audioUrls = (raw.audios ?? []).map(a => a.url).filter(Boolean);

    return {
      ok: true,
      title: raw.title || "未知标题",
      platform: raw.pt || detectPlatform(urlToUse),
      coverUrl: raw.cover?.url,
      originalLink: raw.originalLink || urlToUse,
      videoUrl: videoUrls[0],
      videoUrls,
      audioUrl: audioUrls[0],
      contentType: raw.type || "VIDEO",
      stats: {
        likeCount: raw.likeCount ?? 0,
        collectCount: raw.collectCount ?? 0,
        shareCount: raw.shareCount ?? 0,
        commentCount: raw.commentCount ?? 0,
        publishTime: raw.publishTime,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      return makeError("解析超时，请稍后重试");
    }
    return makeError(`解析失败: ${msg}`);
  }
}

function makeError(error: string): VideoDownloadResult {
  return {
    ok: false,
    error,
    title: "",
    platform: "",
    originalLink: "",
    videoUrls: [],
    contentType: "",
    stats: { likeCount: 0, collectCount: 0, shareCount: 0, commentCount: 0 },
  };
}
