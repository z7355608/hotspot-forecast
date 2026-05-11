/**
 * copywriting.ts — 文案提取 & 视频下载 tRPC 路由
 */

import { z } from "zod";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import {
  BASE_ANALYSIS_COST,
  deductCreditsInternal,
  getCreditBalance,
} from "./credits";
import {
  extractCopywriting,
  parseVideoLink,
  transcribeMedia,
  optimizeCopywriting,
} from "../services/copywriting-extract";
import { recognizeAudio } from "../services/volc-asr";
import { parseAndDownloadVideo } from "../services/video-download";
import { smartParseLink, type SmartParseLinkResult } from "../services/smart-link-parser";
import {
  analyzeViralBreakdown,
  resolveVideoUrl,
  type BreakdownResult,
} from "../services/viral-breakdown";
import { generateTitleVariants } from "../services/title-variants-generator";
import { parseVideo } from "../legacy/video-parser";
import {
  resolveByPlatform,
  type ResolvablePlatform,
  type ResolvedVideo,
} from "../services/tikhub-video-resolver";
import { query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";

/**
 * 缓存表 viral_breakdown_cache（schema-v11）的读写工具
 * ─────────────────────────────────────────────────────
 * 同一作品被重复点击（"立即分析"→"深度拆解" 或 反复进 BreakdownPage）时，
 * 命中缓存即可跳过单次约 1 次 LLM 视频理解调用。
 *
 * 容错原则：缓存表缺失或读写出错都不应阻断主流程，
 *           只打日志、降级为重新调用 LLM。
 */

const VIRAL_BREAKDOWN_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

type CachedBreakdownPayload = {
  breakdown: BreakdownResult;
  videoInfo: {
    videoUrl: string;
    title?: string;
    coverUrl?: string;
    author?: string;
  };
};

function buildBreakdownCacheKey(
  platform: string | undefined,
  videoId: string | undefined,
  videoUrl: string,
): string {
  const p = (platform ?? "unknown").toLowerCase();
  const id = (videoId ?? "").trim();
  if (id) return `${p}:${id}`;
  // 无 videoId 时退化为 url 的稳定 hash，避免 url 过长撑爆主键
  const urlHash = crypto.createHash("sha1").update(videoUrl).digest("hex").slice(0, 32);
  return `${p}:url:${urlHash}`;
}

async function readBreakdownCache(
  cacheKey: string,
): Promise<CachedBreakdownPayload | null> {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT payload, ttl_seconds, created_at
       FROM viral_breakdown_cache
       WHERE cache_key = ?
         AND created_at + INTERVAL ttl_seconds SECOND > NOW()
       LIMIT 1`,
      [cacheKey],
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) return null;
    const payload = row.payload;
    if (!payload) return null;
    // mysql2 驱动对 JSON 列既可能返回字符串、也可能直接反序列化为对象，两种都兼容
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    return parsed as CachedBreakdownPayload;
  } catch (err) {
    console.warn("[viralBreakdownDirect] cache read failed, falling through:", err);
    return null;
  }
}

async function writeBreakdownCache(
  cacheKey: string,
  platform: string | undefined,
  videoId: string | undefined,
  payload: CachedBreakdownPayload,
): Promise<void> {
  try {
    await query(
      `INSERT INTO viral_breakdown_cache
         (cache_key, platform, video_id, payload, ttl_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         payload = VALUES(payload),
         ttl_seconds = VALUES(ttl_seconds),
         updated_at = NOW()`,
      [
        cacheKey,
        platform ?? null,
        videoId ?? null,
        JSON.stringify(payload),
        VIRAL_BREAKDOWN_CACHE_TTL_SECONDS,
      ],
    );
  } catch (err) {
    console.warn("[viralBreakdownDirect] cache write failed (non-fatal):", err);
  }
}

/**
 * 把数据库里的（不可直接重解析的）CDN 签名 URL，转成 watermark API 能识别的分享页 URL。
 * watermark API 只认平台分享页 URL（如 https://www.douyin.com/video/<aweme_id>），
 * 不接受 CDN 直链。
 *
 * 入参 fallbackUrl 是数据库存的原始 video_url；只有当 platform+videoId 无法构造
 * 分享页 URL 时才作为兜底（大概率 watermark 也认不出来）。
 */
function buildParseInputUrl(
  platform: string | undefined,
  videoId: string | undefined,
  fallbackUrl: string,
): string {
  const p = (platform ?? "").toLowerCase();
  const id = (videoId ?? "").trim();
  if (!id) return fallbackUrl;
  if (p === "douyin" || p === "抖音") return `https://www.douyin.com/video/${id}`;
  if (p === "tiktok") return `https://www.tiktok.com/@/video/${id}`;
  if (p === "kuaishou" || p === "快手") return `https://www.kuaishou.com/short-video/${id}`;
  if (p === "xiaohongshu" || p === "小红书") return `https://www.xiaohongshu.com/explore/${id}`;
  return fallbackUrl;
}

/**
 * 解析视频拿到一个公开 mp4 直链 + 元信息。
 *
 * 双轨：
 *   - 抖音 + 有 videoId → 优先 TikHub（一手聚合，比第三方 watermark 稳）
 *   - 其它平台 / TikHub 失败 → 降级 watermark API
 *
 * 抛出错误时附带哪条路径失败，方便前端调试。
 */
async function resolveVideoForBreakdown(args: {
  videoUrl: string;
  videoId?: string;
  platform?: string;
  inputTitle?: string;
  inputCoverUrl?: string;
}): Promise<ResolvedVideo & { source: "tikhub" | "watermark" }> {
  const platform = (args.platform ?? "").toLowerCase();
  const tikhubPlatform: ResolvablePlatform | null =
    platform === "douyin" || platform === "抖音"
      ? "douyin"
      : platform === "xiaohongshu" || platform === "小红书"
        ? "xiaohongshu"
        : platform === "kuaishou" || platform === "快手"
          ? "kuaishou"
          : null;

  // 路径 A：TikHub（首选，覆盖抖音 / 小红书 / 快手）
  if (tikhubPlatform && args.videoId) {
    try {
      const resolved = await resolveByPlatform(tikhubPlatform, args.videoId);
      if (resolved.videoUrl) {
        return {
          ...resolved,
          title: resolved.title || args.inputTitle,
          coverUrl: resolved.coverUrl || args.inputCoverUrl,
          source: "tikhub",
        };
      }
    } catch (e) {
      // 不直接抛，降级到 watermark 再试一次
      console.warn(
        `[viralBreakdownDirect] TikHub 路径失败，降级到 watermark API: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  // 路径 B：watermark API 兜底
  const parseInput = buildParseInputUrl(args.platform, args.videoId, args.videoUrl);
  const parsed = await parseVideo(parseInput);

  const rawType = parsed.raw?.type;
  if (rawType && rawType !== "VIDEO") {
    throw new Error(
      `该链接经解析为「${rawType}」类型（非视频），无法做爆款拆解`,
    );
  }
  if (!parsed.ok || !parsed.videoUrl) {
    throw new Error(
      `视频链接解析失败：${parsed.error ?? "未知原因"}。请确认链接来自支持的平台（抖音 / 快手 / 小红书 等）。`,
    );
  }

  return {
    videoUrl: parsed.videoUrl,
    coverUrl: parsed.coverUrl || args.inputCoverUrl,
    title: parsed.title || args.inputTitle,
    duration: undefined,
    hasWatermark: undefined,
    source: "watermark",
  };
}

export const copywritingRouter = router({
  /**
   * 完整文案提取流程（去水印 → ASR → LLM 优化）
   * 需要登录
   */
  extract: protectedProcedure
    .input(
      z.object({
        url: z.string().min(1, "请输入视频链接"),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await extractCopywriting(input.url);
      return result;
    }),

  /**
   * 仅解析视频链接（去水印）
   * 公开接口，用于预览
   */
  parseLink: publicProcedure
    .input(
      z.object({
        url: z.string().min(1, "请输入视频链接"),
      }),
    )
    .mutation(async ({ input }) => {
      return parseVideoLink(input.url);
    }),

  /**
   * 仅 ASR 语音识别（需要先解析链接获取媒体 URL）
   */
  transcribe: protectedProcedure
    .input(
      z.object({
        audioUrl: z.string().url("请提供有效的音频 URL"),
      }),
    )
    .mutation(async ({ input }) => {
      return recognizeAudio(input.audioUrl);
    }),

  /**
   * 仅 LLM 优化文案
   */
  optimize: protectedProcedure
    .input(
      z.object({
        rawTranscript: z.string().min(1, "请提供原始文案"),
        videoTitle: z.string().default("视频"),
        platform: z.string().default("短视频平台"),
      }),
    )
    .mutation(async ({ input }) => {
      return optimizeCopywriting(
        input.rawTranscript,
        input.videoTitle,
        input.platform,
      );
    }),

  /**
   * 视频万能下载（去水印 → 返回下载链接）
   * 需要登录
   */
  videoDownload: protectedProcedure
    .input(
      z.object({
        url: z.string().min(1, "请输入视频链接"),
      }),
    )
    .mutation(async ({ input }) => {
      return parseAndDownloadVideo(input.url);
    }),

  /**
   * 智能链接解析（视频解析 / 网页转MD / LLM二次检查平台限制）
   * 公开接口
   */
  smartParse: publicProcedure
    .input(
      z.object({
        url: z.string().min(1, "请输入链接"),
      }),
    )
    .mutation(async ({ input }): Promise<SmartParseLinkResult> => {
      return smartParseLink(input.url);
    }),

  /**
   * 爆款拆解（视频理解模型 + 结构化 JSON 输出）
   * 需要登录
   */
  viralBreakdown: protectedProcedure
    .input(
      z.object({
        url: z.string().min(1, "请输入视频链接"),
        transcript: z.string().optional(),
      }),
    )
    .mutation(async ({ input }): Promise<{
      breakdown: BreakdownResult;
      videoInfo: {
        videoUrl: string;
        title?: string;
        coverUrl?: string;
        author?: string;
      };
    }> => {
      // Step 1: 解析视频链接获取直链
      const videoInfo = await resolveVideoUrl(input.url);

      // Step 2: 调用视频理解模型进行爆款拆解
      const breakdown = await analyzeViralBreakdown(
        videoInfo.videoUrl,
        input.transcript,
      );

      return { breakdown, videoInfo };
    }),

  /**
   * 低粉爆款视频拆解（结构化场景：从选题推荐等已知作品入口直拆）
   *
   * 流水线：
   *   1) URL 后缀快速校验 — 直接拒绝音频/图片
   *   2) parseVideo 去水印 — 数据库里的抖音 CDN 签名链接 LLM 端会被 403，
   *      也无法直接喂给 watermark API；必须先用 platform+videoId 构造分享页 URL
   *      （如 https://www.douyin.com/video/<aweme_id>），watermark API 才能重新拿到
   *      一个公开可访问的视频直链
   *   3) parseVideo 返回的 type 字段做最终校验 — 必须是 VIDEO
   *   4) 用解析后的公开 URL + 解析出的 title/cover 作为元信息送给 LLM
   *
   * 需要登录
   */
  viralBreakdownDirect: protectedProcedure
    .input(
      z.object({
        videoUrl: z.string().url("请提供有效的视频 URL"),
        videoId: z.string().optional(),
        platform: z.string().optional(),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
        author: z.string().optional(),
        transcript: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{
      breakdown: BreakdownResult;
      videoInfo: {
        videoUrl: string;
        title?: string;
        coverUrl?: string;
        author?: string;
      };
      /**
       * 本次调用的计费摘要（前端用于：刷新本地余额、显示「本次消耗 X 积分」、
       * 区分缓存命中与否，避免给用户造成"莫名其妙扣了钱"的错觉）。
       */
      charge: {
        cost: number;          // 本次"应消耗"积分（默认 BASE_ANALYSIS_COST）
        deducted: boolean;     // 实际是否扣减（缓存命中或灰度未开 → false）
        cacheHit: boolean;     // 是否走的缓存
        balanceAfter: number;  // 调用结束后的真实积分余额
      };
    }> => {
      const openId = ctx.user.openId;
      const cost = BASE_ANALYSIS_COST; // 单平台 20 积分

      // P0b 第一道：URL 后缀快速拒绝（音频 / 图片）
      if (/\.(mp3|wav|aac|flac|m4a|ogg)(\?|#|$)/i.test(input.videoUrl)) {
        throw new Error("该链接是音频文件（非视频），无法做爆款拆解");
      }
      if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?|#|$)/i.test(input.videoUrl)) {
        throw new Error("该链接是图片文件（非视频），无法做爆款拆解");
      }

      // ── 缓存命中检查：同作品 7 天内不重复消耗 LLM 预算 ──────────
      // 用户提供 transcript 时跳过缓存，因为 transcript 会改变 LLM 输入
      const cacheKey = buildBreakdownCacheKey(
        input.platform,
        input.videoId,
        input.videoUrl,
      );
      if (!input.transcript) {
        const cached = await readBreakdownCache(cacheKey);
        if (cached) {
          // 缓存命中：不扣费、不消耗 LLM。仍取一次余额给前端用于展示
          const balance = await getCreditBalance(openId);
          return {
            breakdown: cached.breakdown,
            videoInfo: {
              ...cached.videoInfo,
              author: cached.videoInfo.author || input.author,
            },
            charge: {
              cost,
              deducted: false,
              cacheHit: true,
              balanceAfter: balance,
            },
          };
        }
      }

      // ── 灰度计费：缓存未命中 → 真实消耗 LLM。按 ENV 决定是否扣积分 ──
      // 余额检查：始终先查（即便 flag 未开，UI 也能拿到真实数）
      const balanceBefore = await getCreditBalance(openId);
      let deducted = false;
      let balanceAfter = balanceBefore;

      if (ENV.creditDeductionEnabled) {
        if (balanceBefore < cost) {
          // 用 FORBIDDEN 配 message=INSUFFICIENT_CREDITS:{cost}:{balance}，
          // 前端解析后弹 PaywallModal（见 BreakdownPage / HotTopicRecommendationsPage）
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `INSUFFICIENT_CREDITS:${cost}:${balanceBefore}`,
          });
        }
        const r = await deductCreditsInternal(
          openId,
          cost,
          `深度拆解：${input.title?.slice(0, 30) ?? input.videoId ?? "未命名作品"}`,
          input.videoId,
        );
        if (!r.success) {
          // 极端竞态：检查通过但扣减失败（如并发耗尽）。同样让前端弹 paywall
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `INSUFFICIENT_CREDITS:${cost}:${r.balance}`,
          });
        }
        deducted = true;
        balanceAfter = r.balance;
      }

      // P0a：抖音优先走 TikHub（一手聚合），失败/非抖音降级 watermark API
      const resolved = await resolveVideoForBreakdown({
        videoUrl: input.videoUrl,
        videoId: input.videoId,
        platform: input.platform,
        inputTitle: input.title,
        inputCoverUrl: input.coverUrl,
      });

      const breakdown = await analyzeViralBreakdown(
        resolved.videoUrl,
        input.transcript,
      );

      const payload: CachedBreakdownPayload = {
        breakdown,
        videoInfo: {
          videoUrl: resolved.videoUrl,
          title: resolved.title,
          coverUrl: resolved.coverUrl,
          author: resolved.author || input.author,
        },
      };

      // 异步落库；写入失败不影响本次返回
      if (!input.transcript) {
        void writeBreakdownCache(cacheKey, input.platform, input.videoId, payload);
      }

      return {
        ...payload,
        charge: {
          cost,
          deducted,
          cacheHit: false,
          balanceAfter,
        },
      };
    }),

  /**
   * 可复用标题变体生成（旁路 LLM 调用，按 featured.id 缓存 7 天）
   * 用于 HotTopicRecommendationsPage 的 featured 卡片在「同赛道高分样本」不足时填补。
   * 详见 docs/llm-budget.md「旁路调用」、docs/prompts.md `title-variants.generate`。
   */
  generateTitleVariants: protectedProcedure
    .input(
      z.object({
        featuredId: z.string().min(1),
        originalTitle: z.string().min(2),
        platform: z.string().optional(),
        seedTopic: z.string().nullable().optional(),
        trackTags: z.array(z.string()).optional(),
        burstReasons: z.array(z.string()).optional(),
        viralScore: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      const result = await generateTitleVariants(
        input.featuredId,
        input.originalTitle,
        {
          platform: input.platform,
          seedTopic: input.seedTopic ?? null,
          trackTags: input.trackTags,
          burstReasons: input.burstReasons,
          viralScore: input.viralScore,
        },
      );
      return result;
    }),
});
