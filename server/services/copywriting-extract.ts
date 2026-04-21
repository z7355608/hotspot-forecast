/**
 * copywriting-extract.ts — 文案提取完整服务
 *
 * 流程：
 *   1. 调用去水印 API 解析视频/音频链接 → 获取媒体下载 URL
 *   2. 调用火山引擎大模型录音文件极速版 ASR → 获取原始文案
 *   3. 调用 LLM 优化文案 → 返回结构化的优质文案
 */

import { invokeLLM } from "../_core/llm";
import { recognizeAudio, type ASRResult } from "./volc-asr";

/* ─────────────────────────────────────────────
   去水印 API 配置
───────────────────────────────────────────── */

const VIDEO_PARSE_API = "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse";
const VIDEO_PARSE_KEY = "dw8uiZ3Z3TF0YqQA";
const PARSE_TIMEOUT_MS = 15_000;

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

/** 去水印 API 返回的视频信息 */
interface VideoParseResult {
  type: "VIDEO" | "AUDIO" | "IMAGE" | string;
  title: string;
  originalLink: string;
  cover?: { url: string };
  videos?: { url: string }[];
  audios?: { url: string }[];
  likeCount?: number;
  collectCount?: number;
  publishTime?: number;
  pt?: string;
}

/** 解析后的视频信息 */
export interface ParsedMediaInfo {
  ok: boolean;
  error?: string;
  title: string;
  platform: string;
  coverUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  originalLink: string;
  stats: {
    likeCount: number;
    collectCount: number;
  };
}

/** 文案提取步骤进度 */
export interface ExtractStep {
  step: "parse" | "asr" | "optimize" | "done" | "error";
  message: string;
  progress: number; // 0-100
}

/** 文案提取最终结果 */
export interface CopywritingExtractResult {
  ok: boolean;
  error?: string;
  /** 视频/音频基础信息 */
  mediaInfo?: ParsedMediaInfo;
  /** ASR 原始文案 */
  rawTranscript: string;
  /** ASR 音频时长（毫秒） */
  audioDurationMs: number;
  /** LLM 优化后的文案 */
  optimizedCopy: string;
  /** 文案结构分析 */
  structureAnalysis: string;
  /** 可复用的钩子句式 */
  hooks: string[];
  /** CTA 模式 */
  ctaPatterns: string[];
  /** 关键金句 */
  keyPhrases: string[];
}

/* ─────────────────────────────────────────────
   Step 1: 去水印解析
───────────────────────────────────────────── */

/** 从口令文本中提取 URL */
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

/** 从 URL 推断平台名称 */
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

/**
 * 调用去水印 API 解析视频链接
 */
export async function parseVideoLink(input: string): Promise<ParsedMediaInfo> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "输入内容不能为空", title: "", platform: "", originalLink: "", stats: { likeCount: 0, collectCount: 0 } };
  }

  const extractedUrl = extractUrlFromText(trimmed);
  const urlToUse = extractedUrl || trimmed;

  console.log(`[CopyExtract] 解析链接: ${urlToUse.slice(0, 80)}`);

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
      return { ok: false, error: `解析失败 ${resp.status}: ${errText}`, title: "", platform: "", originalLink: urlToUse, stats: { likeCount: 0, collectCount: 0 } };
    }

    const json = (await resp.json()) as {
      code: number;
      ok: boolean;
      data: (VideoParseResult | null)[];
    };

    if (!json.ok || !json.data?.[0]) {
      return { ok: false, error: "该链接无法解析，请检查链接是否有效", title: "", platform: "", originalLink: urlToUse, stats: { likeCount: 0, collectCount: 0 } };
    }

    const raw = json.data[0];
    const videoUrls = (raw.videos ?? []).map(v => v.url).filter(Boolean);
    const audioUrls = (raw.audios ?? []).map(a => a.url).filter(Boolean);

    return {
      ok: true,
      title: raw.title || "未知标题",
      platform: raw.pt || detectPlatform(urlToUse),
      coverUrl: raw.cover?.url,
      videoUrl: videoUrls[0],
      audioUrl: audioUrls[0],
      originalLink: raw.originalLink || urlToUse,
      stats: {
        likeCount: raw.likeCount ?? 0,
        collectCount: raw.collectCount ?? 0,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      return { ok: false, error: "解析超时，请稍后重试", title: "", platform: "", originalLink: urlToUse, stats: { likeCount: 0, collectCount: 0 } };
    }
    return { ok: false, error: `解析失败: ${msg}`, title: "", platform: "", originalLink: urlToUse, stats: { likeCount: 0, collectCount: 0 } };
  }
}

/* ─────────────────────────────────────────────
   Step 2: ASR 语音识别
───────────────────────────────────────────── */

/**
 * 对媒体进行 ASR 语音识别
 * 优先使用音频 URL，其次使用视频 URL
 */
export async function transcribeMedia(mediaInfo: ParsedMediaInfo): Promise<ASRResult> {
  // 优先使用音频 URL（更小、更快），其次使用视频 URL
  const mediaUrl = mediaInfo.audioUrl || mediaInfo.videoUrl;

  if (!mediaUrl) {
    return {
      ok: false,
      error: "未找到可用的音频或视频地址",
      text: "",
      durationMs: 0,
      utterances: [],
    };
  }

  console.log(`[CopyExtract] 开始 ASR 识别: ${mediaUrl.slice(0, 80)}`);
  return recognizeAudio(mediaUrl);
}

/* ─────────────────────────────────────────────
   Step 3: LLM 优化文案
───────────────────────────────────────────── */

/**
 * 用 LLM 优化 ASR 识别出的原始文案
 */
export async function optimizeCopywriting(
  rawTranscript: string,
  videoTitle: string,
  platform: string,
): Promise<{
  optimizedCopy: string;
  structureAnalysis: string;
  hooks: string[];
  ctaPatterns: string[];
  keyPhrases: string[];
}> {
  const systemPrompt = `你是一位专业的短视频文案分析师。你的任务是对 ASR（语音识别）提取的原始文案进行优化和结构化分析。

请完成以下工作：
1. **文案优化**：修正 ASR 识别错误（错别字、断句不当），优化标点符号和分段，使文案更加通顺易读
2. **结构分析**：分析文案的叙事结构（开头钩子 → 内容展开 → 结尾 CTA）
3. **提取钩子**：找出文案中的开头钩子句式（吸引注意力的句子）
4. **CTA 模式**：找出文案中的行动号召（引导关注、点赞、评论等）
5. **关键金句**：提取文案中最有传播力、最值得复用的表达

请以 JSON 格式返回，结构如下：
{
  "optimizedCopy": "优化后的完整文案（保留原意，修正错误，优化排版）",
  "structureAnalysis": "文案结构分析（用 2-3 句话概括叙事节奏和结构特点）",
  "hooks": ["钩子句式1", "钩子句式2"],
  "ctaPatterns": ["CTA模式1", "CTA模式2"],
  "keyPhrases": ["金句1", "金句2", "金句3"]
}`;

  const userPrompt = `以下是从${platform}视频「${videoTitle}」中通过语音识别提取的原始文案：

---
${rawTranscript.slice(0, 5000)}${rawTranscript.length > 5000 ? "\n\n（文案较长，已截取前 5000 字）" : ""}
---

请对这段文案进行优化和结构化分析。`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "copywriting_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              optimizedCopy: { type: "string", description: "优化后的完整文案" },
              structureAnalysis: { type: "string", description: "文案结构分析" },
              hooks: { type: "array", items: { type: "string" }, description: "钩子句式列表" },
              ctaPatterns: { type: "array", items: { type: "string" }, description: "CTA模式列表" },
              keyPhrases: { type: "array", items: { type: "string" }, description: "关键金句列表" },
            },
            required: ["optimizedCopy", "structureAnalysis", "hooks", "ctaPatterns", "keyPhrases"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content ?? "";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);

    return {
      optimizedCopy: parsed.optimizedCopy || rawTranscript,
      structureAnalysis: parsed.structureAnalysis || "暂无结构分析",
      hooks: parsed.hooks || [],
      ctaPatterns: parsed.ctaPatterns || [],
      keyPhrases: parsed.keyPhrases || [],
    };
  } catch (err) {
    console.error(`[CopyExtract] LLM 优化失败:`, err);
    // 降级：直接返回原始文案
    return {
      optimizedCopy: rawTranscript,
      structureAnalysis: "LLM 优化暂时不可用，已返回原始识别文案",
      hooks: [],
      ctaPatterns: [],
      keyPhrases: [],
    };
  }
}

/* ─────────────────────────────────────────────
   完整流程
───────────────────────────────────────────── */

/**
 * 完整的文案提取流程
 * @param input 视频链接或分享口令
 * @param onProgress 进度回调
 */
export async function extractCopywriting(
  input: string,
  onProgress?: (step: ExtractStep) => void,
): Promise<CopywritingExtractResult> {
  const emitProgress = (step: ExtractStep) => {
    console.log(`[CopyExtract] ${step.step}: ${step.message} (${step.progress}%)`);
    onProgress?.(step);
  };

  // Step 1: 解析视频链接
  emitProgress({ step: "parse", message: "正在解析视频链接...", progress: 10 });
  const mediaInfo = await parseVideoLink(input);

  if (!mediaInfo.ok) {
    emitProgress({ step: "error", message: mediaInfo.error ?? "链接解析失败", progress: 0 });
    return {
      ok: false,
      error: mediaInfo.error,
      mediaInfo,
      rawTranscript: "",
      audioDurationMs: 0,
      optimizedCopy: "",
      structureAnalysis: "",
      hooks: [],
      ctaPatterns: [],
      keyPhrases: [],
    };
  }

  emitProgress({ step: "parse", message: `解析成功：${mediaInfo.title}`, progress: 25 });

  // Step 2: ASR 语音识别
  emitProgress({ step: "asr", message: "正在进行语音识别...", progress: 35 });
  const asrResult = await transcribeMedia(mediaInfo);

  if (!asrResult.ok || !asrResult.text) {
    emitProgress({ step: "error", message: asrResult.error ?? "语音识别失败", progress: 0 });
    return {
      ok: false,
      error: asrResult.error || "语音识别未返回文本",
      mediaInfo,
      rawTranscript: "",
      audioDurationMs: 0,
      optimizedCopy: "",
      structureAnalysis: "",
      hooks: [],
      ctaPatterns: [],
      keyPhrases: [],
    };
  }

  emitProgress({ step: "asr", message: `识别完成，共 ${asrResult.text.length} 字`, progress: 60 });

  // Step 3: LLM 优化
  emitProgress({ step: "optimize", message: "AI 正在优化文案...", progress: 70 });
  const optimized = await optimizeCopywriting(
    asrResult.text,
    mediaInfo.title,
    mediaInfo.platform,
  );

  emitProgress({ step: "done", message: "文案提取完成", progress: 100 });

  return {
    ok: true,
    mediaInfo,
    rawTranscript: asrResult.text,
    audioDurationMs: asrResult.durationMs,
    optimizedCopy: optimized.optimizedCopy,
    structureAnalysis: optimized.structureAnalysis,
    hooks: optimized.hooks,
    ctaPatterns: optimized.ctaPatterns,
    keyPhrases: optimized.keyPhrases,
  };
}
