/**
 * video-parser.ts — 视频解析公共服务
 *
 * 功能：
 *   1. parseVideo()      — 调用第三方接口解析分享口令/链接，返回视频基础信息
 *   2. transcribeVideo() — 从视频 URL 提取音频 → ASR 识别 → 返回文案文本
 *   3. HTTP 路由处理函数（供 http-server.ts 注册）
 *
 * 支持平台：抖音、快手、B站、小红书、视频号等（由第三方接口决定）
 *
 * 接口文档：
 *   POST http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse?key=dw8uiZ3Z3TF0YqQA
 *   Body: ["{{用户输入的视频链接或口令}}"]
 *   返回: { code: 0, ok: true, data: [VideoParseResult | null] }
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("VideoParser");
import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";

const execFileAsync = promisify(execFile);

/* ─────────────────────────────────────────────
   配置
───────────────────────────────────────────── */

const VIDEO_PARSE_API = "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse";
const VIDEO_PARSE_KEY = "dw8uiZ3Z3TF0YqQA";
const PARSE_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

/** 第三方接口返回的视频信息 */
export interface VideoParseResult {
  /** 内容类型：VIDEO / AUDIO / IMAGE */
  type: "VIDEO" | "AUDIO" | "IMAGE" | string;
  /** 视频标题 */
  title: string;
  /** 原始链接（展开后） */
  originalLink: string;
  /** 封面图 */
  cover?: { url: string };
  /** 视频地址列表（多个备用 CDN） */
  videos?: { url: string }[];
  /** 音频地址列表（部分平台有独立音频） */
  audios?: { url: string }[];
  /** 点赞数 */
  likeCount?: number;
  /** 收藏数 */
  collectCount?: number;
  /** 发布时间（Unix 时间戳，秒） */
  publishTime?: number;
  /** 平台名称（哔哩哔哩 / 抖音 / 快手 等） */
  pt?: string;
  /** 解析类型 */
  parseType?: string;
  /** 是否允许下载 */
  allowDownload?: boolean;
}

/** 我们对外暴露的标准化视频信息 */
export interface ParsedVideoInfo {
  /** 是否解析成功 */
  ok: boolean;
  /** 错误信息（失败时） */
  error?: string;
  /** 视频标题 */
  title: string;
  /** 平台名称 */
  platform: string;
  /** 封面图 URL */
  coverUrl?: string;
  /** 原始链接 */
  originalLink: string;
  /** 最佳视频播放地址（第一个 CDN） */
  videoUrl?: string;
  /** 所有视频地址（备用 CDN） */
  videoUrls: string[];
  /** 独立音频地址（如有） */
  audioUrl?: string;
  /** 互动数据 */
  stats: {
    likeCount: number;
    collectCount: number;
    publishTime?: number;
  };
  /** 原始接口返回（调试用） */
  raw?: VideoParseResult;
}

/** ASR 转录结果 */
export interface TranscribeResult {
  ok: boolean;
  error?: string;
  /** 识别出的完整文案 */
  transcript: string;
  /** 视频基础信息 */
  videoInfo?: ParsedVideoInfo;
}

/* ─────────────────────────────────────────────
   核心函数：解析视频链接/口令
───────────────────────────────────────────── */

/**
 * 解析视频分享口令或链接
 * 支持：抖音口令、抖音短链、快手、B站、小红书等
 */
export async function parseVideo(input: string): Promise<ParsedVideoInfo> {
  const trimmed = input.trim();

  if (!trimmed) {
    return makeErrorResult("输入内容不能为空");
  }

  // 尝试从口令文本中提取 URL
  const extractedUrl = extractUrlFromText(trimmed);
  const urlToUse = extractedUrl || trimmed;

  log.info(`解析: ${urlToUse.slice(0, 80)}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    const resp = await fetch(
      `${VIDEO_PARSE_API}?key=${VIDEO_PARSE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([urlToUse]),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return makeErrorResult(`接口请求失败 ${resp.status}: ${errText}`);
    }

    const json = (await resp.json()) as {
      code: number;
      ok: boolean;
      data: (VideoParseResult | null)[];
    };

    if (!json.ok || !json.data?.[0]) {
      // 如果是抖音短链，尝试展开后重试
      if (isDouyinShortUrl(urlToUse)) {
        log.info(`抖音短链解析失败，尝试展开重定向...`);
        const expandedUrl = await expandShortUrl(urlToUse);
        if (expandedUrl && expandedUrl !== urlToUse) {
          return parseVideo(expandedUrl);
        }
      }
      return makeErrorResult(`该链接无法解析，请检查链接是否有效或平台是否支持`);
    }

    const raw = json.data[0];
    return normalizeResult(raw, urlToUse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      return makeErrorResult("解析超时，请稍后重试");
    }
    return makeErrorResult(`解析失败: ${msg}`);
  }
}

/* ─────────────────────────────────────────────
   核心函数：视频转文案（ASR）
───────────────────────────────────────────── */

/**
 * 从视频链接提取音频并进行 ASR 语音识别
 * 流程：解析链接 → 下载视频 → ffmpeg 提取音频 → manus-speech-to-text → 返回文案
 */
export async function transcribeVideo(input: string): Promise<TranscribeResult> {
  // 第一步：解析视频信息
  const videoInfo = await parseVideo(input);

  if (!videoInfo.ok) {
    return { ok: false, error: videoInfo.error, transcript: "" };
  }

  const videoUrl = videoInfo.videoUrl;
  if (!videoUrl) {
    return { ok: false, error: "未找到可用的视频地址", transcript: "", videoInfo };
  }

  log.info(`开始 ASR 转录: ${videoInfo.title}`);

  // 创建临时目录
  const tmpDir = join(tmpdir(), "hotspot-video-asr");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const timestamp = Date.now();
  const videoFile = join(tmpDir, `video-${timestamp}.mp4`);
  const audioFile = join(tmpDir, `audio-${timestamp}.mp3`);

  try {
    // 第二步：下载视频（最多 50MB，超过截断）
    await downloadFile(videoUrl, videoFile, DOWNLOAD_TIMEOUT_MS);

    // 第三步：用 ffmpeg 提取音频（前 5 分钟，短视频足够）
    await extractAudio(videoFile, audioFile);

    // 第四步：调用 manus-speech-to-text 进行 ASR
    const { stdout } = await execFileAsync(
      "manus-speech-to-text",
      [audioFile],
      { timeout: 120_000 },
    );

    const transcript = stdout.trim();
    log.info(`ASR 完成，字符数: ${transcript.length}`);

    return { ok: true, transcript, videoInfo };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, `ASR 失败`);
    return { ok: false, error: `语音识别失败: ${msg}`, transcript: "", videoInfo };
  } finally {
    // 清理临时文件
    cleanupFile(videoFile);
    cleanupFile(audioFile);
  }
}

/* ─────────────────────────────────────────────
   HTTP 路由处理函数
───────────────────────────────────────────── */

/** POST /api/video/parse — 解析视频链接/口令 */
export async function handleVideoParseRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  body: { url: string },
): Promise<void> {
  if (!body.url) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "缺少 url 参数" }));
    return;
  }

  try {
    const result = await parseVideo(body.url);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}

/** POST /api/video/transcribe — 视频转文案（解析 + ASR） */
export async function handleVideoTranscribeRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  body: { url: string },
): Promise<void> {
  if (!body.url) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "缺少 url 参数" }));
    return;
  }

  try {
    const result = await transcribeVideo(body.url);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}

/* ─────────────────────────────────────────────
   工具函数
───────────────────────────────────────────── */

/** 从口令文本中提取 URL */
function extractUrlFromText(text: string): string | null {
  // 匹配常见视频平台 URL
  const urlPattern = /https?:\/\/[^\s\u3000\u4e00-\u9fff，。！？【】「」]+/g;
  const matches = text.match(urlPattern);
  if (!matches) return null;

  // 优先返回视频平台链接
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
      return url.replace(/[）\)]+$/, ""); // 去掉末尾括号
    }
  }

  return matches[0] || null;
}

/** 判断是否是抖音短链 */
function isDouyinShortUrl(url: string): boolean {
  return url.includes("v.douyin.com") || url.includes("iesdouyin.com");
}

/** 展开短链（跟随重定向） */
async function expandShortUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    return resp.url || null;
  } catch {
    return null;
  }
}

/** 标准化接口返回结果 */
function normalizeResult(raw: VideoParseResult, inputUrl: string): ParsedVideoInfo {
  const videoUrls = (raw.videos ?? []).map(v => v.url).filter(Boolean);
  const audioUrls = (raw.audios ?? []).map(a => a.url).filter(Boolean);

  return {
    ok: true,
    title: raw.title || "未知标题",
    platform: raw.pt || detectPlatformFromUrl(inputUrl),
    coverUrl: raw.cover?.url,
    originalLink: raw.originalLink || inputUrl,
    videoUrl: videoUrls[0],
    videoUrls,
    audioUrl: audioUrls[0],
    stats: {
      likeCount: raw.likeCount ?? 0,
      collectCount: raw.collectCount ?? 0,
      publishTime: raw.publishTime,
    },
    raw,
  };
}

/** 从 URL 推断平台名称 */
function detectPlatformFromUrl(url: string): string {
  if (url.includes("douyin.com") || url.includes("iesdouyin.com")) return "抖音";
  if (url.includes("kuaishou.com") || url.includes("gifshow.com")) return "快手";
  if (url.includes("bilibili.com") || url.includes("b23.tv")) return "B站";
  if (url.includes("xiaohongshu.com") || url.includes("xhslink.com")) return "小红书";
  if (url.includes("weixin.qq.com") || url.includes("channels")) return "视频号";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  return "未知平台";
}

/** 构造错误结果 */
function makeErrorResult(error: string): ParsedVideoInfo {
  return {
    ok: false,
    error,
    title: "",
    platform: "",
    originalLink: "",
    videoUrls: [],
    stats: { likeCount: 0, collectCount: 0 },
  };
}

/** 下载文件到本地（带超时和大小限制） */
async function downloadFile(
  url: string,
  destPath: string,
  timeoutMs: number,
  maxBytes = 50 * 1024 * 1024, // 50MB
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`下载失败 ${resp.status}: ${resp.statusText}`);
    }
    if (!resp.body) {
      throw new Error("响应体为空");
    }

    const writer = createWriteStream(destPath);
    let downloaded = 0;

    const reader = resp.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.length;
        if (downloaded > maxBytes) {
          log.warn(`文件超过 ${maxBytes / 1024 / 1024}MB，截断下载`);
          break;
        }
        writer.write(value);
      }
    } finally {
      reader.releaseLock();
    }

    await new Promise<void>((resolve, reject) => {
      writer.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 用 ffmpeg 从视频文件提取音频 */
async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  // 提取前 5 分钟的音频，转为 16kHz mono mp3（ASR 最优格式）
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-t", "300",          // 最多 5 分钟
    "-vn",                // 不要视频流
    "-ar", "16000",       // 16kHz 采样率
    "-ac", "1",           // 单声道
    "-ab", "64k",         // 64kbps 码率
    "-f", "mp3",
    "-y",                 // 覆盖已有文件
    audioPath,
  ], { timeout: 60_000 });
}

/** 清理临时文件 */
function cleanupFile(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // 忽略清理失败
  }
}
