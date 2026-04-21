/**
 * copywriting.ts — 文案提取 & 视频下载 tRPC 路由
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
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
   * 低粉爆款视频拆解（直接传入视频 URL，无需去水印）
   * 需要登录
   */
  viralBreakdownDirect: protectedProcedure
    .input(
      z.object({
        videoUrl: z.string().url("请提供有效的视频 URL"),
        title: z.string().optional(),
        coverUrl: z.string().optional(),
        author: z.string().optional(),
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
      const breakdown = await analyzeViralBreakdown(
        input.videoUrl,
        input.transcript,
      );

      return {
        breakdown,
        videoInfo: {
          videoUrl: input.videoUrl,
          title: input.title,
          coverUrl: input.coverUrl,
          author: input.author,
        },
      };
    }),
});
