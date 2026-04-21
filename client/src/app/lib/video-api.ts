/**
 * video-api.ts — 前端视频解析公共服务 API 客户端
 *
 * 对应后端路由：
 *   POST /api/video/parse      — 解析视频链接/口令，返回视频基础信息
 *   POST /api/video/transcribe — 解析视频 + ASR 语音识别，返回文案文本
 *
 * 注意：这些接口只在 dataMode === "live" 时调用，mock 模式下不使用。
 */

import { parseApiResponse, apiFetch } from "./api-utils";

/* ─────────────────────────────────────────────
   类型定义（与 server/video-parser.ts 保持一致）
───────────────────────────────────────────── */

export interface ParsedVideoInfo {
  ok: boolean;
  error?: string;
  title: string;
  platform: string;
  coverUrl?: string;
  originalLink: string;
  videoUrl?: string;
  videoUrls: string[];
  audioUrl?: string;
  stats: {
    likeCount: number;
    collectCount: number;
    publishTime?: number;
  };
}

export interface TranscribeResult {
  ok: boolean;
  error?: string;
  /** 识别出的完整文案 */
  transcript: string;
  /** 视频基础信息 */
  videoInfo?: ParsedVideoInfo;
}

/* ─────────────────────────────────────────────
   API 函数
───────────────────────────────────────────── */

/**
 * 解析视频分享口令或链接
 * 支持：抖音口令、抖音短链、快手、B站、小红书等
 *
 * @param url 用户输入的视频链接或分享口令（如 "7.72 复制打开抖音... https://v.douyin.com/xxx"）
 * @returns 视频基础信息（标题、平台、封面、视频地址、互动数据等）
 */
export async function parseVideo(url: string): Promise<ParsedVideoInfo> {
  const response = await apiFetch("/api/video/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return parseApiResponse<ParsedVideoInfo>(response);
}

/**
 * 解析视频链接并进行 ASR 语音识别，提取口播文案
 * 流程：解析链接 → 下载视频 → ffmpeg 提取音频 → ASR 识别 → 返回文案
 *
 * 注意：此操作耗时较长（通常 30-120 秒），建议在 UI 上显示进度提示
 *
 * @param url 用户输入的视频链接或分享口令
 * @returns 识别出的文案文本和视频基础信息
 */
export async function transcribeVideo(url: string): Promise<TranscribeResult> {
  const response = await apiFetch("/api/video/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return parseApiResponse<TranscribeResult>(response);
}

/**
 * 从文本中检测是否包含视频平台链接或口令
 * 用于判断用户输入是否可以触发视频解析流程
 */
export function detectVideoInput(text: string): boolean {
  const videoPlatternPatterns = [
    /https?:\/\/v\.douyin\.com\//,
    /https?:\/\/www\.douyin\.com\/video\//,
    /https?:\/\/www\.kuaishou\.com\//,
    /https?:\/\/www\.bilibili\.com\/video\//,
    /https?:\/\/b23\.tv\//,
    /https?:\/\/www\.xiaohongshu\.com\//,
    /https?:\/\/xhslink\.com\//,
    /https?:\/\/channels\.weixin\.qq\.com\//,
    /https?:\/\/www\.tiktok\.com\//,
    // 抖音口令（数字+空格+中文+链接）
    /\d+\.\d+\s+.+https?:\/\//,
  ];
  return videoPlatternPatterns.some(p => p.test(text));
}
