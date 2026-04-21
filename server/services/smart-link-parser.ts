/**
 * smart-link-parser.ts — 智能链接解析服务
 *
 * 功能：
 *   1. 视频链接 → 调用去水印 API 解析视频信息
 *   2. 网页/文章链接 → 抓取内容转为 Markdown
 *   3. LLM 二次检查 → 检测平台限制（登录墙、反爬等），及时提醒用户
 *
 * 输出统一的 SmartParseLinkResult，前端据此在输入框中创建 ResourceItem
 */

import { invokeLLM } from "../_core/llm";

const VIDEO_PARSE_API = "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse";
const VIDEO_PARSE_KEY = "dw8uiZ3Z3TF0YqQA";
const PARSE_TIMEOUT_MS = 15_000;

/* ─────────────────────────────────────────────
   类型定义
───────────────────────────────────────────── */

export interface SmartParseLinkResult {
  ok: boolean;
  /** 链接类型 */
  kind: "video" | "article" | "webpage" | "restricted" | "error";
  /** 标题 */
  title: string;
  /** 来源 URL */
  sourceUrl: string;
  /** 平台名称 */
  platform?: string;
  /** 提取的文本内容（网页转 MD 后的内容） */
  content?: string;
  /** 封面图 */
  coverUrl?: string;
  /** 视频下载地址（仅视频类型） */
  videoUrl?: string;
  /** 音频地址（仅视频类型） */
  audioUrl?: string;
  /** 互动数据 */
  stats?: {
    likeCount: number;
    collectCount: number;
  };
  /** 平台限制警告（需要用户手动上传） */
  restrictionWarning?: string;
  /** 错误信息 */
  error?: string;
}

/* ─────────────────────────────────────────────
   URL 类型识别
───────────────────────────────────────────── */

const VIDEO_PLATFORM_PATTERNS = [
  { platform: "抖音", pattern: /douyin\.com|v\.douyin\.com|iesdouyin\.com/i },
  { platform: "B站", pattern: /bilibili\.com|b23\.tv/i },
  { platform: "小红书", pattern: /xiaohongshu\.com|xhslink\.com/i },
  { platform: "快手", pattern: /kuaishou\.com|gifshow\.com/i },
  { platform: "视频号", pattern: /channels\.weixin\.qq\.com|weixin\.qq\.com\/sph/i },
  { platform: "微博", pattern: /weibo\.com|m\.weibo\.cn/i },
  { platform: "YouTube", pattern: /youtube\.com|youtu\.be/i },
  { platform: "TikTok", pattern: /tiktok\.com/i },
];

/** 非视频的微信域名（公众号文章等） */
const WECHAT_ARTICLE_PATTERNS = /mp\.weixin\.qq\.com/i;

function isVideoUrl(url: string): { isVideo: boolean; platform: string } {
  // 微信公众号链接不是视频
  if (WECHAT_ARTICLE_PATTERNS.test(url)) {
    return { isVideo: false, platform: "" };
  }
  for (const { platform, pattern } of VIDEO_PLATFORM_PATTERNS) {
    if (pattern.test(url)) return { isVideo: true, platform };
  }
  return { isVideo: false, platform: "" };
}

function extractUrlFromText(text: string): string | null {
  const urlPattern = /https?:\/\/[^\s\u3000\u4e00-\u9fff，。！？【】「」]+/g;
  const matches = text.match(urlPattern);
  return matches?.[0]?.replace(/[）)]+$/, "") ?? null;
}

/* ─────────────────────────────────────────────
   视频链接解析
───────────────────────────────────────────── */

async function parseVideoUrl(url: string, platform: string): Promise<SmartParseLinkResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    const resp = await fetch(`${VIDEO_PARSE_API}?key=${VIDEO_PARSE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([url]),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      return {
        ok: false,
        kind: "error",
        title: "",
        sourceUrl: url,
        error: `视频解析接口返回 ${resp.status}`,
      };
    }

    const json = (await resp.json()) as {
      code: number;
      ok: boolean;
      data: (Record<string, unknown> | null)[];
    };

    if (!json.ok || !json.data?.[0]) {
      return {
        ok: false,
        kind: "restricted",
        title: "",
        sourceUrl: url,
        platform,
        restrictionWarning: `${platform}平台限制，无法自动获取视频信息。请手动下载视频后上传本地文件。`,
        error: "视频解析失败",
      };
    }

    const raw = json.data[0] as Record<string, unknown>;
    const videoUrls = ((raw.videos as { url: string }[]) ?? []).map(v => v.url).filter(Boolean);
    const audioUrls = ((raw.audios as { url: string }[]) ?? []).map(a => a.url).filter(Boolean);

    return {
      ok: true,
      kind: "video",
      title: (raw.title as string) || "未知标题",
      sourceUrl: url,
      platform: (raw.pt as string) || platform,
      coverUrl: (raw.cover as { url: string })?.url,
      videoUrl: videoUrls[0],
      audioUrl: audioUrls[0],
      stats: {
        likeCount: (raw.likeCount as number) ?? 0,
        collectCount: (raw.collectCount as number) ?? 0,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      kind: "error",
      title: "",
      sourceUrl: url,
      error: msg.includes("abort") ? "解析超时" : `解析失败: ${msg}`,
    };
  }
}

/* ─────────────────────────────────────────────
   网页内容抓取 → Markdown
───────────────────────────────────────────── */

async function fetchWebpageAsMarkdown(url: string): Promise<{
  title: string;
  markdown: string;
  rawHtml: string;
  error?: string;
}> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return { title: "", markdown: "", rawHtml: "", error: `HTTP ${resp.status}` };
    }

    const html = await resp.text();

    // 提取 title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // 清理 HTML → 提取纯文本
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    // 简单 HTML → Markdown 转换
    let markdown = cleaned
      // 标题
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n")
      // 段落和换行
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // 链接
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
      // 加粗和斜体
      .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, "**$2**")
      .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, "*$2*")
      // 列表
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      // 图片
      .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, "![$1]($2)")
      .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)")
      // 清除剩余标签
      .replace(/<[^>]+>/g, "")
      // 实体
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 清理多余空行
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

    // 截取前 8000 字符
    if (markdown.length > 8000) {
      markdown = markdown.slice(0, 8000) + "\n\n---\n（内容较长，已截取前 8000 字）";
    }

    // 添加来源信息
    markdown = `# ${title || "网页内容"}\n\n> 来源：${url}\n\n${markdown}`;

    return { title, markdown, rawHtml: html.slice(0, 2000) };
  } catch (error) {
    return {
      title: "",
      markdown: "",
      rawHtml: "",
      error: error instanceof Error ? error.message : "网页抓取失败",
    };
  }
}

/* ─────────────────────────────────────────────
   LLM 二次检查：检测平台限制
───────────────────────────────────────────── */

async function checkContentRestriction(
  url: string,
  content: string,
  rawHtml: string,
): Promise<{
  isRestricted: boolean;
  reason?: string;
}> {
  // 快速规则检测（不需要 LLM）
  const restrictionPatterns = [
    { pattern: /请登录|需要登录|login.*required|sign.*in.*to.*continue/i, reason: "该网站需要登录才能查看内容" },
    { pattern: /验证码|captcha|人机验证|请完成验证/i, reason: "该网站需要验证码验证" },
    { pattern: /访问受限|access.*denied|403.*forbidden|permission.*denied/i, reason: "该网站拒绝了访问请求" },
    { pattern: /内容已删除|内容不存在|page.*not.*found|404/i, reason: "该内容已被删除或不存在" },
    { pattern: /请在.*(?:app|客户端|微信).*(?:中|内|里).*(?:打开|查看|浏览)/i, reason: "该内容需要在特定App中打开" },
    { pattern: /该内容仅.*(?:可见|查看)|仅.*(?:粉丝|好友|关注).*可见/i, reason: "该内容设置了可见范围限制" },
  ];

  const combinedText = `${content}\n${rawHtml}`;
  for (const { pattern, reason } of restrictionPatterns) {
    if (pattern.test(combinedText)) {
      return { isRestricted: true, reason };
    }
  }

  // 内容太少，可能是限制
  if (content.length < 50 && rawHtml.length > 500) {
    // 用 LLM 做二次判断
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一个网页内容分析助手。你需要判断以下网页内容是否存在平台限制（如登录墙、反爬、内容限制等）。
请以 JSON 格式返回：
{
  "isRestricted": true/false,
  "reason": "限制原因（如果有的话）"
}`,
          },
          {
            role: "user",
            content: `URL: ${url}\n\n提取到的文本内容（${content.length}字）:\n${content.slice(0, 500)}\n\nHTML 片段:\n${rawHtml.slice(0, 1000)}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "restriction_check",
            strict: true,
            schema: {
              type: "object",
              properties: {
                isRestricted: { type: "boolean", description: "是否存在平台限制" },
                reason: { type: "string", description: "限制原因" },
              },
              required: ["isRestricted", "reason"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
      return {
        isRestricted: parsed.isRestricted ?? false,
        reason: parsed.reason || undefined,
      };
    } catch {
      // LLM 检查失败，不阻断流程
      return { isRestricted: false };
    }
  }

  return { isRestricted: false };
}

/* ─────────────────────────────────────────────
   主入口
───────────────────────────────────────────── */

/**
 * 智能解析链接
 * - 视频链接 → 调用去水印 API
 * - 网页/文章链接 → 抓取并转 Markdown + LLM 二次检查
 */
export async function smartParseLink(input: string): Promise<SmartParseLinkResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, kind: "error", title: "", sourceUrl: "", error: "输入不能为空" };
  }

  // 提取 URL
  const url = extractUrlFromText(trimmed) || trimmed;
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, kind: "error", title: "", sourceUrl: url, error: "请输入有效的 http/https 链接" };
  }

  // 判断链接类型
  const { isVideo, platform } = isVideoUrl(url);

  if (isVideo) {
    // 视频链接 → 调用去水印 API
    return parseVideoUrl(url, platform);
  }

  // 网页/文章链接 → 抓取内容
  const { title, markdown, rawHtml, error } = await fetchWebpageAsMarkdown(url);

  if (error) {
    return {
      ok: false,
      kind: "error",
      title: "",
      sourceUrl: url,
      error: `网页抓取失败: ${error}`,
    };
  }

  // LLM 二次检查平台限制
  const restriction = await checkContentRestriction(url, markdown, rawHtml);

  if (restriction.isRestricted) {
    return {
      ok: false,
      kind: "restricted",
      title: title || url,
      sourceUrl: url,
      restrictionWarning: `因网站限制无法获取完整内容：${restriction.reason}。请手动复制内容或上传本地文件。`,
      content: markdown.length > 50 ? markdown : undefined,
      error: restriction.reason,
    };
  }

  // 判断是文章还是普通网页
  const isArticle = /mp\.weixin\.qq\.com|zhihu\.com\/p\/|toutiao\.com|36kr\.com|jianshu\.com|juejin\.cn/i.test(url);

  return {
    ok: true,
    kind: isArticle ? "article" : "webpage",
    title: title || url.replace(/^https?:\/\//, "").slice(0, 60),
    sourceUrl: url,
    content: markdown,
  };
}
