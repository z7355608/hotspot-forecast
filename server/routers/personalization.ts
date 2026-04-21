/**
 * server/routers/personalization.ts
 * ═══════════════════════════════════════════════════════════════
 * 个性化分析 tRPC 路由
 *
 * 功能：
 * 1. analyze — 从已连接账号数据 + LLM 推断个性化画像
 * 2. getProfile — 获取当前个性化画像
 * 3. confirmProfile — 用户确认/编辑后保存
 * 4. fanInsight — 粉丝画像深度解读
 * ═══════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { query, execute } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import crypto from "node:crypto";

// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function computeInputHash(data: Record<string, unknown>): string {
  return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

/**
 * 从 creator_works 中提取高频话题标签
 */
async function extractTopHashtags(userId: string, platformId: string): Promise<string[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT hashtags FROM creator_works 
     WHERE user_id = ? AND platform_id = ? AND hashtags IS NOT NULL
     ORDER BY published_at DESC LIMIT 30`,
    [userId, platformId],
  );

  const tagCount: Record<string, number> = {};
  for (const row of rows as Record<string, unknown>[]) {
    const tags = String(row.hashtags || "").split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }

  return Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);
}

/**
 * 从 creator_works 中提取作品标题摘要
 */
async function extractWorkTitlesSummary(userId: string, platformId: string): Promise<string> {
  const rows = await query<RowDataPacket[]>(
    `SELECT title, description FROM creator_works 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY published_at DESC LIMIT 20`,
    [userId, platformId],
  );

  return (rows as Record<string, unknown>[])
    .map((r, i) => `${i + 1}. ${String(r.title || "")}${r.description ? ` — ${String(r.description).slice(0, 50)}` : ""}`)
    .join("\n");
}

/**
 * 从 creator_works 中提取作品特征摘要（用于风格打标）
 */
async function extractWorksFeatureSummary(userId: string, platformId: string): Promise<string> {
  const rows = await query<RowDataPacket[]>(
    `SELECT title, description, hashtags, duration, 
            view_count, like_count, comment_count, share_count
     FROM creator_works 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY published_at DESC LIMIT 20`,
    [userId, platformId],
  );

  return (rows as Record<string, unknown>[])
    .map((r, i) => {
      const duration = Number(r.duration || 0);
      const durationLabel = duration > 60 ? `${Math.round(duration / 60)}分钟` : `${duration}秒`;
      return `${i + 1}. 「${String(r.title || "无标题")}」 时长${durationLabel} | 播放${Number(r.view_count || 0)} 点赞${Number(r.like_count || 0)} 评论${Number(r.comment_count || 0)} | 标签: ${String(r.hashtags || "无")}`;
    })
    .join("\n");
}

/**
 * 从 creator_fan_profiles 中提取粉丝兴趣标签
 */
async function extractInterestTags(userId: string, platformId: string): Promise<string> {
  const rows = await query<RowDataPacket[]>(
    `SELECT interest_tags FROM creator_fan_profiles 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY synced_at DESC LIMIT 1`,
    [userId, platformId],
  );

  if (!rows.length) return "暂无数据";
  const tags = safeJsonParse(String((rows[0] as Record<string, unknown>).interest_tags || "[]"));
  return Array.isArray(tags) ? tags.join("、") : "暂无数据";
}

/**
 * 从 creator_fan_profiles 中提取完整粉丝画像摘要
 */
async function extractFanProfileSummary(userId: string, platformId: string): Promise<string> {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_fan_profiles 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY synced_at DESC LIMIT 1`,
    [userId, platformId],
  );

  if (!rows.length) return "暂无粉丝画像数据";
  const r = rows[0] as Record<string, unknown>;

  const parts: string[] = [];

  const genderDist = safeJsonParse(String(r.gender_distribution || "{}"));
  if (genderDist && typeof genderDist === "object") {
    parts.push(`性别分布: ${JSON.stringify(genderDist)}`);
  }

  const ageDist = safeJsonParse(String(r.age_distribution || "{}"));
  if (ageDist && typeof ageDist === "object") {
    parts.push(`年龄分布: ${JSON.stringify(ageDist)}`);
  }

  const regionDist = safeJsonParse(String(r.region_distribution || "{}"));
  if (regionDist && typeof regionDist === "object") {
    const regionObj = regionDist as Record<string, unknown>;
    const topRegions = Object.entries(regionObj).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
    parts.push(`Top 5 地域: ${topRegions.map(([k, v]) => `${k}(${v}%)`).join("、")}`);
  }

  const activeHours = safeJsonParse(String(r.active_hours || "[]"));
  if (Array.isArray(activeHours) && activeHours.length > 0) {
    parts.push(`活跃时段: ${activeHours.join("、")}`);
  }

  const interestTags = safeJsonParse(String(r.interest_tags || "[]"));
  if (Array.isArray(interestTags) && interestTags.length > 0) {
    parts.push(`兴趣标签: ${interestTags.join("、")}`);
  }

  return parts.length > 0 ? parts.join("\n") : "粉丝画像数据不完整";
}

/**
 * 从 creator_works 中提取表现最好的 3 条作品摘要
 */
async function extractTopWorksSummary(userId: string, platformId: string): Promise<string> {
  const rows = await query<RowDataPacket[]>(
    `SELECT title, view_count, like_count, comment_count, share_count, hashtags
     FROM creator_works 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY (COALESCE(like_count,0) + COALESCE(comment_count,0)*2 + COALESCE(share_count,0)*3) DESC
     LIMIT 3`,
    [userId, platformId],
  );

  if (!rows.length) return "暂无作品数据";
  return (rows as Record<string, unknown>[])
    .map((r, i) => `${i + 1}. 「${String(r.title || "无标题")}」 播放${Number(r.view_count || 0)} 点赞${Number(r.like_count || 0)} 评论${Number(r.comment_count || 0)} 转发${Number(r.share_count || 0)} | 标签: ${String(r.hashtags || "无")}`)
    .join("\n");
}

/**
 * 从 creator_account_snapshots 中获取账号概览
 */
async function getAccountOverview(userId: string, platformId: string) {
  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM creator_account_snapshots 
     WHERE user_id = ? AND platform_id = ?
     ORDER BY synced_at DESC LIMIT 1`,
    [userId, platformId],
  );

  if (!rows.length) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    followers: Number(r.followers || 0),
    totalWorks: Number(r.total_works || 0),
    avgEngagementRate: Number(r.avg_engagement_rate || 0),
    totalViews: Number(r.total_views || 0),
    totalLikes: Number(r.total_likes || 0),
  };
}

/**
 * 从 connectors 中获取用户的粉丝量级
 */
function inferFollowerScale(followers: number): string {
  if (followers >= 1000000) return "100w+";
  if (followers >= 100000) return "10w-100w";
  if (followers >= 10000) return "1w-10w";
  return "0-1w";
}

// ─────────────────────────────────────────────
// LLM 调用封装
// ─────────────────────────────────────────────

async function callLLMWithJsonResponse(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; tokensUsed: number; durationMs: number }> {
  const start = Date.now();
  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";
  const tokensUsed = result.usage?.total_tokens || 0;

  return { content, tokensUsed, durationMs: Date.now() - start };
}

async function callLLMWithMarkdownResponse(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; tokensUsed: number; durationMs: number }> {
  const start = Date.now();
  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";
  const tokensUsed = result.usage?.total_tokens || 0;

  return { content, tokensUsed, durationMs: Date.now() - start };
}

// ─────────────────────────────────────────────
// 路由定义
// ─────────────────────────────────────────────

export const personalizationRouter = router({
  /**
   * 获取当前个性化画像
   */
  getProfile: protectedProcedure
    .input(z.object({ platformId: z.string().default("douyin") }))
    .query(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const rows = await query<RowDataPacket[]>(
        `SELECT * FROM creator_personalization_profiles 
         WHERE user_id = ? AND platform_id = ?
         LIMIT 1`,
        [userId, input.platformId],
      );

      if (!rows.length) return null;
      const r = rows[0] as Record<string, unknown>;

      return {
        suggestedNiche: r.suggested_niche ? String(r.suggested_niche) : null,
        suggestedStyleTags: safeJsonParse(String(r.suggested_style_tags || "[]")) as string[],
        suggestedInstructions: r.suggested_instructions ? String(r.suggested_instructions) : null,
        confidence: String(r.confidence || "medium"),
        userConfirmed: Number(r.user_confirmed || 0) === 1,
        userEditedNiche: r.user_edited_niche ? String(r.user_edited_niche) : null,
        userEditedStyleTags: safeJsonParse(String(r.user_edited_style_tags || "[]")) as string[],
        userEditedInstructions: r.user_edited_instructions ? String(r.user_edited_instructions) : null,
        inputWorksCount: Number(r.input_works_count || 0),
        inputFollowers: Number(r.input_followers || 0),
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || ""),
      };
    }),

  /**
   * 执行完整的个性化分析流水线
   * Step 1: 收集数据（作品、粉丝画像、账号概览）
   * Step 2: LLM 推断赛道
   * Step 3: LLM 打标风格
   * Step 4: LLM 生成个性化指令
   * Step 5: 持久化到 creator_personalization_profiles
   */
  analyze: protectedProcedure
    .input(z.object({ platformId: z.string().default("douyin") }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const { platformId } = input;

      // ── Step 0: 检查是否有足够的数据 ──
      const worksCountRows = await query<RowDataPacket[]>(
        `SELECT COUNT(*) as cnt FROM creator_works WHERE user_id = ? AND platform_id = ?`,
        [userId, platformId],
      );
      const worksCount = Number((worksCountRows[0] as Record<string, unknown>)?.cnt || 0);

      if (worksCount < 3) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "至少需要 3 条作品数据才能进行个性化分析。请先在「账号连接」中同步你的抖音数据。",
        });
      }

      // ── Step 1: 收集数据 ──
      const [
        topHashtags,
        workTitlesSummary,
        interestTags,
        worksFeatureSummary,
        fanProfileSummary,
        topWorksSummary,
        accountOverview,
      ] = await Promise.all([
        extractTopHashtags(userId, platformId),
        extractWorkTitlesSummary(userId, platformId),
        extractInterestTags(userId, platformId),
        extractWorksFeatureSummary(userId, platformId),
        extractFanProfileSummary(userId, platformId),
        extractTopWorksSummary(userId, platformId),
        getAccountOverview(userId, platformId),
      ]);

      const followers = accountOverview?.followers || 0;
      const totalWorks = accountOverview?.totalWorks || worksCount;
      const avgEngagementRate = accountOverview?.avgEngagementRate || 0;
      const followerScale = inferFollowerScale(followers);

      // 计算输入哈希（用于判断数据是否变化）
      const inputHash = computeInputHash({
        topHashtags,
        worksCount,
        followers,
      });

      // 检查是否已有相同输入的分析结果
      const existingRows = await query<RowDataPacket[]>(
        `SELECT input_hash, user_confirmed FROM creator_personalization_profiles 
         WHERE user_id = ? AND platform_id = ?`,
        [userId, platformId],
      );
      if (existingRows.length > 0) {
        const existing = existingRows[0] as Record<string, unknown>;
        if (String(existing.input_hash) === inputHash) {
          return {
            status: "unchanged",
            message: "数据未发生变化，无需重新分析。",
          };
        }
      }

      let totalTokens = 0;
      let totalDuration = 0;

      // ── Step 2: LLM 推断赛道 ──
      const nichePrompt = await loadPromptTemplate("niche-inference-v1");
      const nicheUserPrompt = nichePrompt.userTemplate
        .replace("{{topHashtags}}", topHashtags.join("、"))
        .replace("{{workTitlesSummary}}", workTitlesSummary)
        .replace("{{interestTags}}", interestTags);

      const nicheResult = await callLLMWithJsonResponse(nichePrompt.systemPrompt, nicheUserPrompt);
      totalTokens += nicheResult.tokensUsed;
      totalDuration += nicheResult.durationMs;

      let niche = "未知";
      let nicheConfidence = "medium";
      try {
        const nicheData = JSON.parse(nicheResult.content);
        niche = nicheData.niche || "未知";
        nicheConfidence = nicheData.confidence || "medium";
      } catch {
        // 降级：从标签中提取
        niche = topHashtags[0] || "未知";
      }

      // ── Step 3: LLM 打标风格 ──
      const stylePrompt = await loadPromptTemplate("style-tagging-v1");
      const styleUserPrompt = stylePrompt.userTemplate
        .replace("{{worksFeatureSummary}}", worksFeatureSummary)
        .replace("{{niche}}", niche);

      const styleResult = await callLLMWithJsonResponse(stylePrompt.systemPrompt, styleUserPrompt);
      totalTokens += styleResult.tokensUsed;
      totalDuration += styleResult.durationMs;

      let styleTags: string[] = [];
      try {
        const styleData = JSON.parse(styleResult.content);
        styleTags = Array.isArray(styleData.styleTags) ? styleData.styleTags : [];
      } catch {
        styleTags = ["口播"]; // 降级默认
      }

      // ── Step 4: LLM 生成个性化指令 ──
      const instrPrompt = await loadPromptTemplate("personalization-gen-v1");
      const instrUserPrompt = instrPrompt.userTemplate
        .replace("{{followers}}", String(followers))
        .replace("{{totalWorks}}", String(totalWorks))
        .replace("{{avgEngagementRate}}", String(avgEngagementRate))
        .replace("{{followerScale}}", followerScale)
        .replace("{{niche}}", niche)
        .replace("{{contentStyleTags}}", styleTags.join("、"))
        .replace("{{fanProfileSummary}}", fanProfileSummary)
        .replace("{{topWorksSummary}}", topWorksSummary);

      const instrResult = await callLLMWithJsonResponse(instrPrompt.systemPrompt, instrUserPrompt);
      totalTokens += instrResult.tokensUsed;
      totalDuration += instrResult.durationMs;

      let instructions = "";
      try {
        const instrData = JSON.parse(instrResult.content);
        instructions = instrData.instructions || "";
      } catch {
        instructions = `关注${niche}赛道，重点分析${styleTags.join("、")}类型内容的爆款规律。`;
      }

      // ── Step 5: 持久化 ──
      await execute(
        `INSERT INTO creator_personalization_profiles 
         (user_id, platform_id, suggested_niche, suggested_style_tags, suggested_instructions,
          confidence, model_used, tokens_used, analysis_duration_ms,
          input_works_count, input_followers, input_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           suggested_niche = VALUES(suggested_niche),
           suggested_style_tags = VALUES(suggested_style_tags),
           suggested_instructions = VALUES(suggested_instructions),
           confidence = VALUES(confidence),
           model_used = VALUES(model_used),
           tokens_used = VALUES(tokens_used),
           analysis_duration_ms = VALUES(analysis_duration_ms),
           input_works_count = VALUES(input_works_count),
           input_followers = VALUES(input_followers),
           input_hash = VALUES(input_hash),
           user_confirmed = 0`,
        [
          userId, platformId, niche, JSON.stringify(styleTags), instructions,
          nicheConfidence, "gemini-2.5-flash", totalTokens, totalDuration,
          worksCount, followers, inputHash,
        ],
      );

      return {
        status: "completed",
        suggestedNiche: niche,
        suggestedStyleTags: styleTags,
        suggestedInstructions: instructions,
        confidence: nicheConfidence,
        tokensUsed: totalTokens,
        durationMs: totalDuration,
      };
    }),

  /**
   * 用户确认/编辑个性化画像
   */
  confirmProfile: protectedProcedure
    .input(z.object({
      platformId: z.string().default("douyin"),
      niche: z.string().optional(),
      styleTags: z.array(z.string()).optional(),
      instructions: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);

      await execute(
        `UPDATE creator_personalization_profiles 
         SET user_confirmed = 1,
             user_edited_niche = COALESCE(?, user_edited_niche),
             user_edited_style_tags = COALESCE(?, user_edited_style_tags),
             user_edited_instructions = COALESCE(?, user_edited_instructions)
         WHERE user_id = ? AND platform_id = ?`,
        [
          input.niche || null,
          input.styleTags ? JSON.stringify(input.styleTags) : null,
          input.instructions || null,
          userId,
          input.platformId,
        ],
      );

      return { success: true };
    }),

  /**
   * 粉丝画像深度解读（独立 LLM 调用）
   */
  fanInsight: protectedProcedure
    .input(z.object({ platformId: z.string().default("douyin") }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const { platformId } = input;

      const [fanProfileSummary, accountOverview] = await Promise.all([
        extractFanProfileSummary(userId, platformId),
        getAccountOverview(userId, platformId),
      ]);

      if (fanProfileSummary === "暂无粉丝画像数据") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "暂无粉丝画像数据。请先同步你的抖音账号数据（需要 Cookie 认证模式）。",
        });
      }

      // 获取已有的个性化画像
      const profileRows = await query<RowDataPacket[]>(
        `SELECT suggested_niche, suggested_style_tags, user_edited_niche, user_edited_style_tags
         FROM creator_personalization_profiles 
         WHERE user_id = ? AND platform_id = ?`,
        [userId, platformId],
      );

      const profile = profileRows.length > 0 ? profileRows[0] as Record<string, unknown> : null;
      const niche = String(profile?.user_edited_niche || profile?.suggested_niche || "未知");
      const styleTagsRaw = safeJsonParse(String(profile?.user_edited_style_tags || profile?.suggested_style_tags || "[]"));
      const styleTags = Array.isArray(styleTagsRaw) ? styleTagsRaw.join("、") : "未知";

      const prompt = await loadPromptTemplate("fan-insight-v1");
      const userPrompt = prompt.userTemplate
        .replace("{{fanProfileSummary}}", fanProfileSummary)
        .replace("{{niche}}", niche)
        .replace("{{followerCount}}", String(accountOverview?.followers || 0))
        .replace("{{avgEngagementRate}}", String(accountOverview?.avgEngagementRate || 0))
        .replace("{{contentStyleTags}}", styleTags);

      const result = await callLLMWithMarkdownResponse(prompt.systemPrompt, userPrompt);

      return {
        insight: result.content,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
      };
    }),
});

// ─────────────────────────────────────────────
// Prompt 模板加载
// ─────────────────────────────────────────────

async function loadPromptTemplate(templateId: string): Promise<{
  systemPrompt: string;
  userTemplate: string;
}> {
  const rows = await query<RowDataPacket[]>(
    `SELECT system_prompt, user_prompt_template FROM prompt_templates WHERE id = ? AND is_active = 1`,
    [templateId],
  );

  if (!rows.length) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Prompt template ${templateId} not found`,
    });
  }

  const r = rows[0] as Record<string, unknown>;
  return {
    systemPrompt: String(r.system_prompt || ""),
    userTemplate: String(r.user_prompt_template || ""),
  };
}
