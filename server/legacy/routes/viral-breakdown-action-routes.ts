import { execFile } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { generateApolloImage } from "../../services/apollo-image.js";
import { callLLM, type LLMContentPart } from "../llm-gateway.js";
import { createModuleLogger } from "../logger.js";
import { parseVideo, transcribeVideo } from "../video-parser.js";
import { stripJsonFences } from "../json-extract.js";
import { readJsonBody, sendJson } from "../http-server-utils.js";

const log = createModuleLogger("ViralBreakdownActions");
const execFileAsync = promisify(execFile);
const GENERATION_TIMEOUT_MS = 180_000;

type JsonRecord = Record<string, unknown>;

interface ViralBreakdownActionBody {
  taskPayload?: JsonRecord;
  selectedPlanId?: string;
  resultTitle?: string;
  query?: string;
  rewriteStyle?: string;
  currentScript?: string;
}

interface CompleteScriptResult {
  title: string;
  openingHook: string;
  fullVoiceoverScript: string;
  storyboard: string[];
  shotList: string[];
  coverText: string;
  commentGuide: string;
  coverImagePrompt: string;
  coverImageUrl?: string | null;
  coverImageB64?: string | null;
  coverImageError?: string;
  model?: string;
}

interface TimelineSegmentResult {
  timeRange: string;
  stage: string;
  frameUrl?: string | null;
  visualSummary: string;
  subtitleSummary: string;
  narrationSummary: string;
  userPsychology: string[];
  viralFunction: string;
  copyMethod: string;
}

interface RewrittenScriptResult {
  style: string;
  styleLabel: string;
  title?: string;
  openingHook?: string;
  shortScript: string;
  styleNotes: string[];
  model?: string;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripLargeMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLargeMedia);
  const record = asRecord(value);
  if (!record) return value;
  const next: JsonRecord = {};
  for (const [key, raw] of Object.entries(record)) {
    if (/frameUrl|coverUrl/i.test(key) && typeof raw === "string") {
      next[key] = raw.startsWith("data:")
        ? "[真实图片数据已省略，服务端会单独传给模型]"
        : raw;
      continue;
    }
    next[key] = stripLargeMedia(raw);
  }
  return next;
}

function stringifyContext(payload: JsonRecord, extra: JsonRecord = {}) {
  return JSON.stringify(stripLargeMedia({ taskPayload: payload, ...extra }), null, 2).slice(0, 28_000);
}

function parseJson<T>(content: string): T {
  return JSON.parse(stripJsonFences(content || "{}")) as T;
}

function getVideoSourceUrl(payload: JsonRecord, body: ViralBreakdownActionBody) {
  const videoInfo = asRecord(payload.videoInfo);
  return asString(videoInfo?.sourceUrl) || asString(body.query);
}

function getSelectedPlan(payload: JsonRecord, selectedPlanId?: string) {
  const plans = asArray(payload.copyPlans).map(asRecord).filter(Boolean) as JsonRecord[];
  if (!plans.length) return undefined;
  return (
    plans.find(plan => asString(plan.id) === selectedPlanId) ??
    plans.find(plan => asString(plan.name) === selectedPlanId) ??
    plans[0]
  );
}

function buildCoverImagePrompt(
  script: CompleteScriptResult,
  payload: JsonRecord,
  selectedPlan?: JsonRecord
) {
  const videoInfo = asRecord(payload.videoInfo);
  const platform = asString(videoInfo?.platform) || "short video platform";
  const coverText = script.coverText || script.title;
  const planTitle = asString(selectedPlan?.title);
  const planHook = asString(selectedPlan?.openingHook) || asString(selectedPlan?.hook);
  const planAccount = asString(selectedPlan?.suitableAccount) || asString(selectedPlan?.accountType);
  return (
    script.coverImagePrompt ||
    `Create a complete premium vertical Chinese short-video cover poster for ${platform}, not a text-only graphic. ` +
      `Base the image scene on this shooting plan: title="${planTitle || script.title}", hook="${planHook}", account="${planAccount}". ` +
      `Show a concrete visual scene/object/person related to the plan, with editorial lighting, realistic product/content context, and a strong mobile composition. ` +
      `Include this exact Chinese headline as the main readable cover text: "${coverText}". ` +
      `High contrast, bold typography integrated into the scene, no brand logo, no watermark, no fake UI, 3:4 cover.`
  );
}

const COMPLETE_SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    openingHook: { type: "string" },
    fullVoiceoverScript: { type: "string" },
    storyboard: { type: "array", items: { type: "string" } },
    shotList: { type: "array", items: { type: "string" } },
    coverText: { type: "string" },
    commentGuide: { type: "string" },
    coverImagePrompt: { type: "string" },
  },
  required: [
    "title",
    "openingHook",
    "fullVoiceoverScript",
    "storyboard",
    "shotList",
    "coverText",
    "commentGuide",
    "coverImagePrompt",
  ],
  additionalProperties: false,
};

function hasOwnField(record: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseCompleteScriptResult(content: string): CompleteScriptResult {
  const parsed = parseJson<unknown>(content);
  const record = asRecord(parsed);
  if (!record) {
    throw new Error("生成结果不是合法 JSON 对象。");
  }

  const missing = COMPLETE_SCRIPT_SCHEMA.required.filter(
    field => !hasOwnField(record, field)
  );
  const storyboard = asArray(record.storyboard).map(asString).filter(Boolean);
  const shotList = asArray(record.shotList).map(asString).filter(Boolean);
  const errors = [
    ...missing.map(field => `缺少 ${field}`),
    !asString(record.fullVoiceoverScript) ? "fullVoiceoverScript 为空" : "",
    !storyboard.length ? "storyboard 为空" : "",
    !shotList.length ? "shotList 为空" : "",
    !asString(record.coverText) ? "coverText 为空" : "",
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`生成结果字段不完整：${errors.join("；")}`);
  }

  return {
    title: asString(record.title),
    openingHook: asString(record.openingHook),
    fullVoiceoverScript: asString(record.fullVoiceoverScript),
    storyboard,
    shotList,
    coverText: asString(record.coverText),
    commentGuide: asString(record.commentGuide),
    coverImagePrompt: asString(record.coverImagePrompt),
  };
}

const TIMELINE_SCHEMA = {
  type: "object",
  properties: {
    timelineAnalysis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timeRange: { type: "string" },
          stage: { type: "string" },
          frameUrl: { type: "string" },
          visualSummary: { type: "string" },
          subtitleSummary: { type: "string" },
          narrationSummary: { type: "string" },
          userPsychology: { type: "array", items: { type: "string" } },
          viralFunction: { type: "string" },
          copyMethod: { type: "string" },
        },
        required: [
          "timeRange",
          "stage",
          "visualSummary",
          "subtitleSummary",
          "narrationSummary",
          "userPsychology",
          "viralFunction",
          "copyMethod",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["timelineAnalysis"],
  additionalProperties: false,
};

function getRewriteStyleConfig(style?: string) {
  switch (style) {
    case "xiaohongshu":
      return {
        key: "xiaohongshu",
        label: "小红书风格",
        instruction:
          "改成小红书笔记式口播：更像真实分享，语气轻一点，有种草感和个人体验感，但不能新增原始数据里没有的事实。",
      };
    case "douyin":
      return {
        key: "douyin",
        label: "抖音口播风格",
        instruction:
          "改成抖音强节奏口播：开头更抓人，句子更短，信息密度更高，适合真人出镜直接念，但不能夸大承诺。",
      };
    case "conversational":
    default:
      return {
        key: "conversational",
        label: "更口语",
        instruction:
          "改成更自然的口语表达：少用报告腔和书面语，像创作者面对镜头直接说话，但保留原有事实和爆款结构。",
      };
  }
}

export async function handleRewriteViralBreakdownScript(
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const body = await readJsonBody<ViralBreakdownActionBody>(request);
    const payload = asRecord(body.taskPayload);
    if (!payload || payload.kind !== "viral_breakdown") {
      sendJson(response, 400, { error: "缺少有效的爆款拆解结果。" });
      return;
    }

    const selectedPlan = getSelectedPlan(payload, body.selectedPlanId);
    const currentScript =
      asString(body.currentScript) ||
      asString(selectedPlan?.shortScript) ||
      asString(selectedPlan?.speechDraft) ||
      asString(selectedPlan?.voiceoverDraft);
    if (!currentScript) {
      sendJson(response, 422, { error: "当前方案缺少可改写的口播稿。" });
      return;
    }

    const style = getRewriteStyleConfig(body.rewriteStyle);
    const context = stringifyContext(payload, {
      selectedPlan,
      currentScript,
      rewriteStyle: style.label,
      resultTitle: body.resultTitle,
      query: body.query,
    });

    const resp = await callLLM({
      modelId: "doubao",
      messages: [
        {
          role: "system",
          content:
            "你是短视频口播改写专家。只能基于用户提供的真实拆解结果和原始口播稿改写，不要新增事实、数据、案例或承诺。只输出合法 JSON。",
        },
        {
          role: "user",
          content: `请把当前口播稿改写成「${style.label}」。\n\n改写要求：\n1. ${style.instruction}\n2. 必须保留原口播稿中的核心信息和原视频拆解出的可复制结构。\n3. 不要编造新数据、新案例、新平台表现、新截图信息。\n4. shortScript 控制在 80-180 个中文字符，创作者可以直接念。\n5. title 和 openingHook 如果能基于真实原方案优化就返回；如果真实信息不足就返回空字符串。\n6. styleNotes 返回 2-4 条，说明改写时做了哪些表达层调整。\n7. 不要输出 Markdown，只输出合法 JSON。\n\n输出结构：\n{\n  "title": "",\n  "openingHook": "",\n  "shortScript": "",\n  "styleNotes": []\n}\n\n真实上下文：\n${context}`,
        },
      ],
      maxTokens: 2500,
      timeoutMs: 90_000,
      retryDelaysMs: [],
    });

    const parsed = parseJson<Partial<RewrittenScriptResult>>(resp.content);
    const shortScript = asString(parsed.shortScript);
    if (!shortScript) {
      sendJson(response, 502, { error: "改写结果缺少口播稿。" });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      rewrittenScript: {
        style: style.key,
        styleLabel: style.label,
        title: asString(parsed.title),
        openingHook: asString(parsed.openingHook),
        shortScript,
        styleNotes: asArray(parsed.styleNotes).map(asString).filter(Boolean),
        model: resp.model,
      },
    });
  } catch (err) {
    log.error({ err }, "rewrite viral breakdown script failed");
    sendJson(response, 500, {
      error: err instanceof Error ? err.message : "改写口播稿失败",
    });
  }
}

export async function handleGenerateViralBreakdownScript(
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const startedAt = Date.now();
    const body = await readJsonBody<ViralBreakdownActionBody>(request);
    const payload = asRecord(body.taskPayload);
    if (!payload || payload.kind !== "viral_breakdown") {
      sendJson(response, 400, { error: "缺少有效的爆款拆解结果。" });
      return;
    }

    const selectedPlan = getSelectedPlan(payload, body.selectedPlanId);
    const context = stringifyContext(payload, {
      selectedPlan,
      resultTitle: body.resultTitle,
      query: body.query,
    });
    const resp = await callLLM({
      modelId: "doubao",
      messages: [
        {
          role: "system",
          content:
            "你是短视频爆款复制脚本专家。只能基于用户提供的真实拆解结果生成创作方案，不要编造原视频没有的事实。只输出合法 JSON。",
        },
        {
          role: "user",
          content: `基于以下真实爆款拆解结果，生成一版可直接拍的完整 60 秒口播脚本，并给出完整封面图文案和图片生成提示词。\n\n要求：\n1. fullVoiceoverScript 必须是创作者可以直接念的口播稿，180-320 字。\n2. 保留原视频的爆款结构，但替换成适合用户账号改编的表达，不要直接抄原文。\n3. storyboard 和 shotList 各返回 4-7 项。\n4. coverText 必须短、狠，适合放在完整封面图里。\n5. coverImagePrompt 必须是英文图片生成提示词，要求 image 模型生成完整封面图：必须有具体画面主体/场景/情绪氛围，不要做成纯文字海报；无 logo、无水印。\n6. 如果真实数据不足，字段返回空字符串或空数组，不要编造。\n\n真实上下文：\n${context}`,
        },
      ],
      maxTokens: 6000,
      timeoutMs: 120_000,
      retryDelaysMs: [],
    });

    const script = parseCompleteScriptResult(resp.content);
    let image: Awaited<ReturnType<typeof generateApolloImage>> | null = null;
    let imageError = "";
    const imagePrompt = buildCoverImagePrompt(script, payload, selectedPlan);
    const imageTimeoutMs = GENERATION_TIMEOUT_MS - (Date.now() - startedAt);
    if (imageTimeoutMs < 15_000) {
      imageError = "脚本生成已完成，但封面图生成超出总时间预算。";
    } else {
      try {
        image = await generateApolloImage({
          prompt: imagePrompt,
          size: "1024x1536",
          timeoutMs: Math.min(90_000, imageTimeoutMs),
        });
      } catch (err) {
        imageError = err instanceof Error ? err.message : String(err);
        log.warn({ err: imageError }, "cover image generation failed");
      }
    }

    sendJson(response, 200, {
      ok: true,
      degraded: Boolean(imageError),
      script: {
        ...script,
        coverImagePrompt: imagePrompt,
        coverImageUrl: image?.url ?? null,
        coverImageB64: image?.b64Json ?? null,
        coverImageError: imageError || undefined,
        model: image?.model ? `${resp.model} + ${image.model}` : resp.model,
      },
    });
  } catch (err) {
    log.error({ err }, "generate complete script failed");
    sendJson(response, 500, {
      error: err instanceof Error ? err.message : "生成完整口播脚本失败",
    });
  }
}

async function extractFrameAt(
  videoUrl: string,
  seconds: number,
  index: number
): Promise<string | null> {
  const outputPath = join(
    tmpdir(),
    `viral-timeline-frame-${Date.now()}-${index}.jpg`
  );
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(seconds),
        "-i",
        videoUrl,
        "-frames:v",
        "1",
        "-vf",
        "scale=560:-1",
        "-q:v",
        "7",
        "-y",
        outputPath,
      ],
      { timeout: 15_000 }
    );
    const image = readFileSync(outputPath);
    return `data:image/jpeg;base64,${image.toString("base64")}`;
  } catch (err) {
    log.warn({ err, seconds }, "deep timeline frame extraction failed");
    return null;
  } finally {
    try {
      unlinkSync(outputPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function extractFrameDataUrls(videoUrl?: string | null) {
  if (!videoUrl) return [];
  const marks = [1, 4, 8, 14, 22];
  const settled = await Promise.allSettled(
    marks.map((mark, index) => extractFrameAt(videoUrl, mark, index))
  );
  return settled
    .map(item => (item.status === "fulfilled" ? item.value : null))
    .filter((url): url is string => Boolean(url));
}

function attachFrameUrls(
  segments: TimelineSegmentResult[],
  frameDataUrls: string[]
) {
  return segments.map((segment, index) => ({
    ...segment,
    frameUrl: frameDataUrls[index] ?? segment.frameUrl ?? "",
  }));
}

export async function handleRegenerateViralBreakdownTimeline(
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    const body = await readJsonBody<ViralBreakdownActionBody>(request);
    const payload = asRecord(body.taskPayload);
    if (!payload || payload.kind !== "viral_breakdown") {
      sendJson(response, 400, { error: "缺少有效的爆款拆解结果。" });
      return;
    }

    const sourceUrl = getVideoSourceUrl(payload, body);
    if (!sourceUrl) {
      sendJson(response, 422, { error: "当前结果缺少原视频链接，无法重新生成深度时间轴。" });
      return;
    }

    const parsedVideo = await parseVideo(sourceUrl);
    if (!parsedVideo.ok) {
      sendJson(response, 422, { error: parsedVideo.error ?? "视频解析失败" });
      return;
    }
    const videoUrl = parsedVideo.videoUrl ?? parsedVideo.videoUrls[0] ?? null;
    const [transcriptResult, frameDataUrls] = await Promise.all([
      transcribeVideo(sourceUrl).catch(err => ({
        ok: false as const,
        transcript: "",
        error: err instanceof Error ? err.message : String(err),
      })),
      extractFrameDataUrls(videoUrl),
    ]);

    const transcript = transcriptResult.ok ? transcriptResult.transcript : "";
    const context = stringifyContext(payload, {
      parsedVideo: {
        title: parsedVideo.title,
        platform: parsedVideo.platform,
        stats: parsedVideo.stats,
      },
      transcript,
      frameCount: frameDataUrls.length,
    });
    const imageParts: LLMContentPart[] = frameDataUrls.map(url => ({
      type: "image_url",
      image_url: { url, detail: "high" },
    }));

    const messages = [
      {
        role: "system" as const,
        content:
          "你是短视频时间轴拆解专家。只能基于真实标题、ASR 文本、关键帧和已有拆解结果生成逐秒时间轴。只输出合法 JSON。",
      },
      {
        role: "user" as const,
        content:
          imageParts.length > 0
            ? [
                {
                  type: "text" as const,
                  text: `请重新生成深度视频时间轴，返回 3-6 段 timelineAnalysis。\n\n要求：每段必须有 timeRange、stage、visualSummary、subtitleSummary 或 narrationSummary、userPsychology、viralFunction、copyMethod。不要编造输入中没有的事实。\n\n真实上下文：\n${context}\n\n后续图片是真实关键帧截图，请结合图片和 ASR 拆解。`,
                },
                ...imageParts,
              ]
            : `请重新生成深度视频时间轴，返回 3-6 段 timelineAnalysis。\n\n要求：每段必须有 timeRange、stage、visualSummary、subtitleSummary 或 narrationSummary、userPsychology、viralFunction、copyMethod。没有关键帧时根据真实 ASR 和已有拆解结果输出 visualSummary，不要编造画面。\n\n真实上下文：\n${context}`,
      },
    ];

    let timeline: TimelineSegmentResult[] = [];
    try {
      const resp = await callLLM({
        modelId: imageParts.length > 0 ? "apollo" : "doubao",
        messages,
        responseFormat:
          imageParts.length > 0
            ? {
                type: "json_schema",
                json_schema: {
                  name: "viral_deep_timeline",
                  strict: true,
                  schema: TIMELINE_SCHEMA,
                },
              }
            : undefined,
        maxTokens: 5000,
        timeoutMs: GENERATION_TIMEOUT_MS,
        retryDelaysMs: [],
      });
      timeline = parseJson<{ timelineAnalysis?: TimelineSegmentResult[] }>(
        resp.content
      ).timelineAnalysis ?? [];
    } catch (err) {
      log.warn({ err }, "deep timeline multimodal/text call failed");
      throw err;
    }

    sendJson(response, 200, {
      ok: true,
      timelineAnalysis: attachFrameUrls(timeline, frameDataUrls),
      frameCount: frameDataUrls.length,
      transcriptAvailable: Boolean(transcript),
    });
  } catch (err) {
    log.error({ err }, "regenerate deep timeline failed");
    sendJson(response, 500, {
      error: err instanceof Error ? err.message : "重新生成深度时间轴失败",
    });
  }
}
