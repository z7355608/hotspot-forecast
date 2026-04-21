/**
 * payload-extractor.ts
 * Task Payload 动态生成服务
 *
 * 功能：
 * - 从用户 Prompt 中用 LLM 结构化提取任务参数（keyword/platform/awemeId 等）
 * - 避免用户必须精确填写表单，支持自然语言输入
 * - 输出内容必须源自用户输入，LLM 只做结构化提取，不自由发挥
 *
 * 原则：
 * - LLM 只提取用户明确提到的信息，不推断或补全
 * - 如果某字段用户没有提及，返回 null，不猜测
 * - mock 模式不调用此模块
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("PayloadExtractor");
import { callLLM } from "./llm-gateway.js";

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

export interface ExtractedTaskParams {
  /** 关键词/话题（从 Prompt 中提取） */
  keyword: string | null;
  /** 搜索关键词列表（最多3个，结合用户输入和个人资料扩展） */
  searchKeywords: string[];
  /** 平台（douyin/xiaohongshu/bilibili/kuaishou/wechat/weibo） */
  platform: string | null;
  /** 抖音视频 ID（aweme_id） */
  awemeId: string | null;
  /** 小红书笔记 ID */
  noteId: string | null;
  /** 账号 handle（@xxx） */
  uniqueId: string | null;
  /** 账号 UID */
  uid: string | null;
  /** 视频/内容 URL */
  contentUrl: string | null;
  /** 账号主页 URL */
  accountUrl: string | null;
  /** 赛道/行业 */
  industry: string | null;
  /** 赛道关键词（优先 industry，降级 keyword，用于选题策略 V2 Pipeline） */
  track: string | null;
  /** 任务类型提示（用于辅助意图识别） */
  taskHint: string | null;
  /** 原始 Prompt */
  rawPrompt: string;
  /** 提取置信度 */
  confidence: "high" | "medium" | "low";
  /** 提取耗时（ms） */
  extractedAt: string;
}

// ----------------------------------------------------------------
// 平台名称标准化
// ----------------------------------------------------------------

const PLATFORM_ALIASES: Record<string, string> = {
  抖音: "douyin",
  douyin: "douyin",
  小红书: "xiaohongshu",
  xhs: "xiaohongshu",
  xiaohongshu: "xiaohongshu",
  b站: "bilibili",
  哔哩哔哩: "bilibili",
  bilibili: "bilibili",
  快手: "kuaishou",
  kuaishou: "kuaishou",
  视频号: "wechat",
  微信视频号: "wechat",
  wechat: "wechat",
  微博: "weibo",
  weibo: "weibo",
};

function normalizePlatform(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return PLATFORM_ALIASES[lower] ?? PLATFORM_ALIASES[raw] ?? raw;
}

// ----------------------------------------------------------------
// 正则快速提取（无需 LLM 的简单情况）
// ----------------------------------------------------------------

function quickExtract(prompt: string): Partial<ExtractedTaskParams> {
  const result: Partial<ExtractedTaskParams> = {};

  // 抖音视频 ID（7位以上数字）
  const awemeMatch = prompt.match(/aweme[_\s]?id[：:=\s]+(\d{10,})/i) ||
    prompt.match(/视频[id\s]*[：:=\s]+(\d{10,})/i);
  if (awemeMatch) result.awemeId = awemeMatch[1];

  // 小红书笔记 ID
  const noteMatch = prompt.match(/note[_\s]?id[：:=\s]+([a-f0-9]{24})/i) ||
    prompt.match(/笔记[id\s]*[：:=\s]+([a-f0-9]{24})/i);
  if (noteMatch) result.noteId = noteMatch[1];

  // 账号 handle（@xxx）
  const handleMatch = prompt.match(/@([\w\u4e00-\u9fff]+)/);
  if (handleMatch) result.uniqueId = handleMatch[1];

  // URL 提取
  const urlMatch = prompt.match(/https?:\/\/[^\s\u3000-\u9fff]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    if (/douyin\.com\/video|aweme\.com/.test(url)) {
      result.contentUrl = url;
      // 从 URL 中提取 aweme_id
      const idFromUrl = url.match(/\/video\/(\d+)/);
      if (idFromUrl) result.awemeId = idFromUrl[1];
    } else if (/xiaohongshu\.com\/explore|xhslink\.com/.test(url)) {
      result.contentUrl = url;
    } else if (/bilibili\.com\/video/.test(url)) {
      result.contentUrl = url;
    } else if (
      /douyin\.com\/user|xiaohongshu\.com\/user/.test(url)
    ) {
      result.accountUrl = url;
    }
  }

  // 平台识别
  for (const [alias, id] of Object.entries(PLATFORM_ALIASES)) {
    if (prompt.includes(alias)) {
      result.platform = id;
      break;
    }
  }

  return result;
}

// ----------------------------------------------------------------
// LLM 结构化提取（复杂情况）
// ----------------------------------------------------------------

async function llmExtract(
  prompt: string,
  userProfile?: { platforms?: string[]; industries?: string[]; followerCount?: number; accountName?: string },
): Promise<Partial<ExtractedTaskParams>> {
  // 构建用户资料上下文
  const profileLines: string[] = [];
  if (userProfile?.platforms?.length) {
    profileLines.push(`用户已连接平台：${userProfile.platforms.join("、")}`);
  }
  if (userProfile?.industries?.length) {
    profileLines.push(`用户关注的行业/赛道：${userProfile.industries.join("、")}`);
  }
  if (userProfile?.followerCount != null) {
    profileLines.push(`用户粉丝数：${userProfile.followerCount}`);
  }
  if (userProfile?.accountName) {
    profileLines.push(`用户账号名：${userProfile.accountName}`);
  }
  const profileContext = profileLines.length > 0
    ? `\n\n用户个人资料：\n${profileLines.join("\n")}`
    : "";

  const systemPrompt = `你是一个内容创作赛道分析助手。从用户输入中提取任务参数，并生成搜索关键词。

重要：用户输入的是他想分析的「内容赛道/方向」，不是他想学习的技能。
例如用户输入"美女跳舞"，意思是分析「美女跳舞」这个视频赛道的机会，不是教她跳舞。
搜索关键词应该是用来搜索这个赛道的热门视频内容，而不是搜索教程。

以 JSON 格式返回，所有字段如果用户没有提及则返回 null。

字段说明：
- keyword: 用户输入中的核心关键词/话题（如"宠物"、"职场干货"、"美女跳舞"）
- searchKeywords: 数组，最多2个搜索关键词。用于在抖音/小红书上搜索该赛道的热门视频。
  规则：
  1. 第1个关键词：用户输入中最核心的赛道/话题词（如"美女跳舞"、"萌宠"、"美妆护肤"）
  2. 第2个关键词：赛道内的热门内容形式（如"美女跳舞合集"、"宠物日常vlog"、"健身跟练"）
  注意：不要加"教程"二字，除非用户明确提到了教程。搜索关键词应该是在抖音/小红书搜索框中实际会用的短词，不要太长。
- platform: 平台（只能是 douyin/xiaohongshu/bilibili/kuaishou/wechat/weibo 之一）
- awemeId: 抖音视频ID（纯数字，通常10位以上）
- noteId: 小红书笔记ID（24位十六进制）
- uniqueId: 账号handle（@后面的用户名）
- uid: 账号UID（纯数字）
- contentUrl: 视频或内容链接
- accountUrl: 账号主页链接
- industry: 行业或赛道（如"美妆"、"职场教育"、"宠物"）
- taskHint: 用户想做什么（如"拆解视频"、"判断赛道"、"账号诊断"）
${profileContext}
只返回 JSON，不要任何解释。`;

  try {
    const response = await callLLM({
      modelId: "doubao",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      maxTokens: 500,
    });

    const text = response.content.trim();
    // 提取 JSON 部分
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    // 解析 searchKeywords 数组
    let searchKeywords: string[] = [];
    if (Array.isArray(parsed.searchKeywords)) {
      searchKeywords = (parsed.searchKeywords as unknown[])
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((k) => k.trim())
        .slice(0, 2);
    }
    return {
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : null,
      searchKeywords,
      platform: normalizePlatform(typeof parsed.platform === "string" ? parsed.platform : null),
      awemeId: typeof parsed.awemeId === "string" ? parsed.awemeId : null,
      noteId: typeof parsed.noteId === "string" ? parsed.noteId : null,
      uniqueId: typeof parsed.uniqueId === "string" ? parsed.uniqueId : null,
      uid: typeof parsed.uid === "string" ? parsed.uid : null,
      contentUrl: typeof parsed.contentUrl === "string" ? parsed.contentUrl : null,
      accountUrl: typeof parsed.accountUrl === "string" ? parsed.accountUrl : null,
      industry: typeof parsed.industry === "string" ? parsed.industry : null,
      taskHint: typeof parsed.taskHint === "string" ? parsed.taskHint : null,
    };
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------
// 主入口：提取任务参数
// ----------------------------------------------------------------

export async function extractTaskParams(
  prompt: string,
  useLLM = true,
  userProfile?: { platforms?: string[]; industries?: string[]; followerCount?: number; accountName?: string },
): Promise<ExtractedTaskParams> {
  const now = new Date().toISOString();

  // 先用正则快速提取
  const quick = quickExtract(prompt);

  // 始终调用 LLM 提取搜索关键词（因为需要 LLM 生成多个 searchKeywords）
  let llmResult: Partial<ExtractedTaskParams> = {};
  if (useLLM) {
    llmResult = await llmExtract(prompt, userProfile).catch(() => ({}));
  }

  // 构建 searchKeywords：优先用 LLM 结果，如果 LLM 没返回则从 keyword 构建
  let searchKeywords = llmResult.searchKeywords ?? [];
  const primaryKeyword = quick.keyword ?? llmResult.keyword ?? null;
  if (searchKeywords.length === 0 && primaryKeyword) {
    searchKeywords = [primaryKeyword];
  }
  // 去重并限制最多 2 个（节省 API 调用量）
  searchKeywords = [...new Set(searchKeywords)].slice(0, 2);

  // 合并结果（正则优先，LLM 补充）
  const merged: ExtractedTaskParams = {
    keyword: primaryKeyword,
    searchKeywords,
    platform: normalizePlatform(quick.platform ?? llmResult.platform ?? null),
    awemeId: quick.awemeId ?? llmResult.awemeId ?? null,
    noteId: quick.noteId ?? llmResult.noteId ?? null,
    uniqueId: quick.uniqueId ?? llmResult.uniqueId ?? null,
    uid: quick.uid ?? llmResult.uid ?? null,
    contentUrl: quick.contentUrl ?? llmResult.contentUrl ?? null,
    accountUrl: quick.accountUrl ?? llmResult.accountUrl ?? null,
    industry: quick.industry ?? llmResult.industry ?? null,
    track: (quick.industry ?? llmResult.industry ?? quick.keyword ?? llmResult.keyword ?? null),
    taskHint: quick.taskHint ?? llmResult.taskHint ?? null,
    rawPrompt: prompt,
    confidence: estimateConfidence(quick, llmResult),
    extractedAt: now,
  };

  log.info(`searchKeywords: [${searchKeywords.join(", ")}] (keyword: ${primaryKeyword}, industry: ${merged.industry})`);
  return merged;
}

function estimateConfidence(
  quick: Partial<ExtractedTaskParams>,
  llm: Partial<ExtractedTaskParams>,
): "high" | "medium" | "low" {
  const hasStrongSignal =
    quick.awemeId || quick.noteId || quick.contentUrl || quick.accountUrl;
  if (hasStrongSignal) return "high";

  const hasMediumSignal =
    quick.keyword || quick.platform || llm.keyword || llm.platform;
  if (hasMediumSignal) return "medium";

  return "low";
}

// ----------------------------------------------------------------
// HTTP 处理函数（供 http-server.ts 调用）
// ----------------------------------------------------------------

export async function handleExtractPayload(
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  if (
    !body ||
    typeof body !== "object" ||
    !("prompt" in body) ||
    typeof (body as Record<string, unknown>).prompt !== "string"
  ) {
    return {
      status: 400,
      data: { error: "缺少 prompt 字段（string）" },
    };
  }

  const prompt = (body as { prompt: string }).prompt;
  const useLLM = (body as Record<string, unknown>).useLLM !== false;

  if (!prompt.trim()) {
    return { status: 400, data: { error: "prompt 不能为空" } };
  }

  try {
    const result = await extractTaskParams(prompt, useLLM);
    return { status: 200, data: result };
  } catch (error) {
    return {
      status: 500,
      data: {
        error: error instanceof Error ? error.message : "提取失败",
      },
    };
  }
}
