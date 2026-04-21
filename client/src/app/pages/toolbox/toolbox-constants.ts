/**
 * 工具箱常量、类型和共享工具函数
 * 从 ToolboxPage.tsx 提取
 */
import {
  Download,
  FileText,
  Scissors,
  Video,
} from "lucide-react";

/* ================================================================== */
/*  类型定义                                                             */
/* ================================================================== */

export interface ToolDef {
  id: ToolId;
  name: string;
  desc: string;
  icon: typeof Video;
  cost: number;
  color: string;
  bgColor: string;
  supportedPlatforms: string[];
  inputPlaceholder: string;
  inputHint: string;
}

export type ToolId = "video_download" | "video_remove_subtitle" | "text_extract";

/* ================================================================== */
/*  工具列表                                                             */
/* ================================================================== */

export const TOOLS: ToolDef[] = [
  {
    id: "video_download",
    name: "视频万能下载",
    desc: "支持抖音、小红书、快手等平台的无水印视频下载，自动解析最高画质",
    icon: Download,
    cost: 5,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    supportedPlatforms: ["抖音", "小红书", "快手", "B站", "视频号", "TikTok"],
    inputPlaceholder: "粘贴视频链接或分享口令，支持抖音/小红书/快手/B站等",
    inputHint: "支持分享链接、短链接、完整链接、分享口令",
  },
  {
    id: "video_remove_subtitle",
    name: "视频去字幕",
    desc: "AI 智能识别并去除视频中的硬字幕，保持画面清晰度，适合二次创作",
    icon: Scissors,
    cost: 10,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    supportedPlatforms: ["抖音", "小红书", "快手", "本地上传"],
    inputPlaceholder: "粘贴视频链接，或直接上传本地视频文件",
    inputHint: "支持 MP4/MOV/AVI 格式，最大 500MB",
  },
  {
    id: "text_extract",
    name: "文案提取",
    desc: "一键提取视频语音文案，AI 智能优化排版，提取钩子句式和 CTA 模式",
    icon: FileText,
    cost: 3,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    supportedPlatforms: ["抖音", "小红书", "快手", "B站", "视频号"],
    inputPlaceholder: "粘贴视频链接或分享口令，自动识别并提取语音文案",
    inputHint: "支持中文、英文、中英混合识别，AI 自动优化排版",
  },

];

/* ================================================================== */
/*  工具函数                                                             */
/* ================================================================== */

export function formatNumber(num: number): string {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "未知";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/* ================================================================== */
/*  共享类型                                                             */
/* ================================================================== */

export interface VideoDownloadData {
  ok: boolean;
  error?: string;
  title: string;
  platform: string;
  coverUrl?: string;
  originalLink: string;
  videoUrl?: string;
  videoUrls: string[];
  audioUrl?: string;
  contentType: string;
  stats: {
    likeCount: number;
    collectCount: number;
    shareCount: number;
    commentCount: number;
    publishTime?: number;
  };
}

export interface CopywritingResult {
  ok: boolean;
  error?: string;
  mediaInfo?: {
    title: string;
    platform: string;
    coverUrl?: string;
    originalLink: string;
    stats: { likeCount: number; collectCount: number };
  };
  rawTranscript: string;
  audioDurationMs: number;
  optimizedCopy: string;
  structureAnalysis: string;
  hooks: string[];
  ctaPatterns: string[];
  keyPhrases: string[];
}
