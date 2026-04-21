/**
 * input-parser.ts
 * 多模态输入解析公共服务
 *
 * 支持：
 * 1. URL 内容抓取（网页正文提取）
 * 2. 图片 OCR（LLM Vision 识别文字）
 * 3. 文档文本提取（PDF/Word/TXT）
 * 4. 视频分享口令 → 视频基础信息（复用 video-parser）
 *
 * 原则：
 * - 所有输出内容必须源自真实数据，禁止 LLM 纯文本自由发挥
 * - mock 模式不调用此模块
 */

import { execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
// callLLM reserved for future image OCR via LLM Vision

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

export type ParsedInputKind =
  | "url_article"       // 网页文章
  | "url_video"         // 视频链接（抖音/B站/小红书等）
  | "url_social"        // 社交媒体帖子
  | "image_ocr"         // 图片 OCR
  | "document_text"     // 文档（PDF/Word/TXT）
  | "plain_text"        // 纯文本（无需解析）
  | "unknown";

export interface ParsedInput {
  kind: ParsedInputKind;
  rawInput: string;
  extractedText: string;
  title?: string;
  sourceUrl?: string;
  platform?: string;
  metadata?: Record<string, unknown>;
  parseError?: string;
  parsedAt: string;
}

// ----------------------------------------------------------------
// URL 类型识别
// ----------------------------------------------------------------

const VIDEO_PLATFORM_PATTERNS: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "douyin", pattern: /douyin\.com|v\.douyin\.com|iesdouyin\.com/i },
  { platform: "bilibili", pattern: /bilibili\.com|b23\.tv/i },
  { platform: "xiaohongshu", pattern: /xiaohongshu\.com|xhslink\.com/i },
  { platform: "kuaishou", pattern: /kuaishou\.com|gifshow\.com/i },
  { platform: "wechat", pattern: /channels\.weixin\.qq\.com|weixin\.qq\.com\/sph/i },
  { platform: "weibo", pattern: /weibo\.com|m\.weibo\.cn/i },
  { platform: "youtube", pattern: /youtube\.com|youtu\.be/i },
];

const ARTICLE_PATTERNS = [
  /mp\.weixin\.qq\.com/i,
  /zhihu\.com\/p\//i,
  /toutiao\.com\/article/i,
  /36kr\.com\/p\//i,
  /jianshu\.com\/p\//i,
  /juejin\.cn\/post\//i,
];

function detectUrlKind(url: string): ParsedInputKind {
  for (const { pattern } of VIDEO_PLATFORM_PATTERNS) {
    if (pattern.test(url)) return "url_video";
  }
  for (const pattern of ARTICLE_PATTERNS) {
    if (pattern.test(url)) return "url_article";
  }
  // 通用 URL 尝试抓取
  if (/^https?:\/\//i.test(url)) return "url_article";
  return "unknown";
}

function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s\u3000-\u9fff]+/);
  return match ? match[0] : null;
}

// ----------------------------------------------------------------
// URL 网页内容抓取
// ----------------------------------------------------------------

async function fetchUrlContent(url: string): Promise<{
  title: string;
  text: string;
  error?: string;
}> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      return { title: "", text: "", error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();

    // 提取 title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // 移除 script/style/nav/footer 标签
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    // 提取纯文本
    const text = cleaned
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000); // 限制长度

    return { title, text };
  } catch (error) {
    return {
      title: "",
      text: "",
      error: error instanceof Error ? error.message : "fetch error",
    };
  }
}

// ----------------------------------------------------------------
// 图片 OCR（LLM Vision）
// ----------------------------------------------------------------

async function ocrImageWithLLM(imageUrl: string): Promise<{
  text: string;
  error?: string;
}> {
  try {
    // 使用 GPT-5.4 的 Vision 能力（第三方 API 支持）
    const response = await fetch("https://api.ablai.top/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.THIRD_PARTY_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请提取这张图片中的所有文字内容，保持原始格式，不要添加任何解释或评论。如果图片中没有文字，请回复「无文字内容」。",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return { text: "", error: `Vision API HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text };
  } catch (error) {
    return {
      text: "",
      error: error instanceof Error ? error.message : "OCR error",
    };
  }
}

// ----------------------------------------------------------------
// 文档文本提取
// ----------------------------------------------------------------

async function extractDocumentText(fileUrl: string): Promise<{
  text: string;
  title: string;
  error?: string;
}> {
  const tmpDir = join(tmpdir(), "hotspot-docs");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const ext = fileUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "bin";
  const tmpFile = join(tmpDir, `doc_${Date.now()}.${ext}`);

  try {
    // 下载文件
    const resp = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) {
      return { text: "", title: "", error: `HTTP ${resp.status}` };
    }
    const dest = createWriteStream(tmpFile);
    await pipeline(resp.body as unknown as NodeJS.ReadableStream, dest);

    let text = "";
    let title = "";

    if (ext === "pdf") {
      // 使用 pdftotext（poppler-utils 已预装）
      try {
        text = execSync(`pdftotext "${tmpFile}" -`, { timeout: 15_000 }).toString();
        title = text.split("\n")[0].trim().slice(0, 100);
      } catch {
        text = "";
      }
    } else if (ext === "txt" || ext === "md") {
      text = readFileSync(tmpFile, "utf-8");
      title = text.split("\n")[0].trim().slice(0, 100);
    } else {
      // 其他格式尝试 strings 命令提取可读文本
      try {
        text = execSync(`strings "${tmpFile}" | head -200`, { timeout: 5_000 }).toString();
      } catch {
        text = "";
      }
    }

    return {
      text: text.slice(0, 8000),
      title,
    };
  } catch (error) {
    return {
      text: "",
      title: "",
      error: error instanceof Error ? error.message : "document extract error",
    };
  } finally {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

// ----------------------------------------------------------------
// 视频口令解析（复用 video-parser 接口）
// ----------------------------------------------------------------

async function parseVideoInput(input: string): Promise<{
  title: string;
  platform: string;
  videoUrl: string;
  metadata: Record<string, unknown>;
  error?: string;
}> {
  try {
    const resp = await fetch("http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse?key=dw8uiZ3Z3TF0YqQA", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([input]),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      return { title: "", platform: "", videoUrl: "", metadata: {}, error: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as {
      code?: number;
      data?: {
        title?: string;
        pt?: string;
        videos?: Array<{ url?: string }>;
        likeCount?: number;
        collectCount?: number;
        publishTime?: string;
      };
    };
    if (data.code !== 0 || !data.data) {
      return { title: "", platform: "", videoUrl: "", metadata: {}, error: "解析失败" };
    }
    const d = data.data;
    return {
      title: d.title ?? "",
      platform: d.pt ?? "unknown",
      videoUrl: d.videos?.[0]?.url ?? "",
      metadata: {
        likeCount: d.likeCount,
        collectCount: d.collectCount,
        publishTime: d.publishTime,
      },
    };
  } catch (error) {
    return {
      title: "",
      platform: "",
      videoUrl: "",
      metadata: {},
      error: error instanceof Error ? error.message : "video parse error",
    };
  }
}

// ----------------------------------------------------------------
// 主入口：解析任意输入
// ----------------------------------------------------------------

export async function parseInput(rawInput: string): Promise<ParsedInput> {
  const now = new Date().toISOString();
  const trimmed = rawInput.trim();

  // 1. 检测是否包含 URL
  const urlInText = extractUrlFromText(trimmed);
  const isUrl = /^https?:\/\//i.test(trimmed);
  const targetUrl = isUrl ? trimmed : urlInText;

  if (targetUrl) {
    const urlKind = detectUrlKind(targetUrl);

    // 视频链接 → 调用视频解析接口
    if (urlKind === "url_video") {
      const result = await parseVideoInput(trimmed);
      if (result.error) {
        return {
          kind: "url_video",
          rawInput: trimmed,
          extractedText: "",
          parseError: result.error,
          parsedAt: now,
        };
      }
      return {
        kind: "url_video",
        rawInput: trimmed,
        extractedText: result.title,
        title: result.title,
        sourceUrl: targetUrl,
        platform: result.platform,
        metadata: { ...result.metadata, videoUrl: result.videoUrl },
        parsedAt: now,
      };
    }

    // 文档 URL（PDF/TXT/MD）
    const docExt = targetUrl.split("?")[0].split(".").pop()?.toLowerCase();
    if (docExt && ["pdf", "txt", "md", "docx"].includes(docExt)) {
      const result = await extractDocumentText(targetUrl);
      return {
        kind: "document_text",
        rawInput: trimmed,
        extractedText: result.text,
        title: result.title,
        sourceUrl: targetUrl,
        parseError: result.error,
        parsedAt: now,
      };
    }

    // 图片 URL
    if (docExt && ["jpg", "jpeg", "png", "gif", "webp"].includes(docExt)) {
      const result = await ocrImageWithLLM(targetUrl);
      return {
        kind: "image_ocr",
        rawInput: trimmed,
        extractedText: result.text,
        sourceUrl: targetUrl,
        parseError: result.error,
        parsedAt: now,
      };
    }

    // 通用网页抓取
    const result = await fetchUrlContent(targetUrl);
    return {
      kind: "url_article",
      rawInput: trimmed,
      extractedText: result.text,
      title: result.title,
      sourceUrl: targetUrl,
      parseError: result.error,
      parsedAt: now,
    };
  }

  // 2. 视频分享口令（包含中文口令但无 URL）
  if (/[\u4e00-\u9fff]/.test(trimmed) && trimmed.length < 200) {
    // 尝试当作视频口令解析
    const result = await parseVideoInput(trimmed);
    if (!result.error && result.title) {
      return {
        kind: "url_video",
        rawInput: trimmed,
        extractedText: result.title,
        title: result.title,
        platform: result.platform,
        metadata: result.metadata,
        parsedAt: now,
      };
    }
  }

  // 3. 纯文本（直接返回）
  return {
    kind: "plain_text",
    rawInput: trimmed,
    extractedText: trimmed,
    parsedAt: now,
  };
}

// ----------------------------------------------------------------
// HTTP 处理函数（供 http-server.ts 调用）
// ----------------------------------------------------------------

export async function handleParseInput(
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  if (
    !body ||
    typeof body !== "object" ||
    !("input" in body) ||
    typeof (body as Record<string, unknown>).input !== "string"
  ) {
    return {
      status: 400,
      data: { error: "缺少 input 字段（string）" },
    };
  }

  const input = (body as { input: string }).input;
  if (!input.trim()) {
    return { status: 400, data: { error: "input 不能为空" } };
  }

  try {
    const result = await parseInput(input);
    return { status: 200, data: result };
  } catch (error) {
    return {
      status: 500,
      data: {
        error: error instanceof Error ? error.message : "解析失败",
      },
    };
  }
}
