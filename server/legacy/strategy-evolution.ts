/**
 * strategy-evolution.ts
 * ═══════════════════════════════════════════════════════════════
 * 选题策略自进化模块 — 历史验证数据反哺模型
 *
 * 核心思路：
 * 1. 从 published_content + content_performance 中聚合历史效果数据
 * 2. 按赛道/方向/平台维度统计预测准确率和实际表现
 * 3. 生成 "历史反馈上下文" 注入 Stage 2 LLM prompt
 * 4. 让 LLM 基于真实效果数据调整方向生成策略
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";
import { query, type RowDataPacket } from "./database";

const log = createModuleLogger("StrategyEvolution");

/* ── Types ── */

/** 单个方向的历史效果摘要 */
export interface DirectionFeedback {
  directionName: string;
  platform: string;
  /** 该方向下发布的内容数量 */
  publishCount: number;
  /** 平均预测分 */
  avgPredictedScore: number;
  /** 平均实际表现分（基于互动率） */
  avgActualScore: number;
  /** 预测准确率 (0-100) */
  accuracy: number;
  /** 最佳表现内容的标题 */
  bestTitle: string | null;
  /** 最佳表现内容的实际分 */
  bestActualScore: number;
  /** 最差表现内容的标题 */
  worstTitle: string | null;
  /** 最差表现内容的实际分 */
  worstActualScore: number;
  /** 效果趋势：improving / declining / stable */
  trend: "improving" | "declining" | "stable";
}

/** 赛道级别的历史反馈摘要 */
export interface TrackFeedbackSummary {
  track: string;
  /** 该赛道下的总发布数 */
  totalPublished: number;
  /** 整体预测准确率 */
  overallAccuracy: number;
  /** 各方向的效果摘要 */
  directionFeedbacks: DirectionFeedback[];
  /** 表现最好的方向名称 */
  topDirections: string[];
  /** 表现最差的方向名称 */
  weakDirections: string[];
  /** 平台维度的效果对比 */
  platformComparison: Array<{
    platform: string;
    avgActualScore: number;
    publishCount: number;
  }>;
  /** 生成的自然语言反馈上下文（注入 LLM prompt） */
  feedbackContext: string;
}

/* ── Scoring Logic (mirrors performance-tracker.ts) ── */

function computeActualScore(perf: {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
}): number {
  const totalInteraction =
    (perf.likeCount || 0) +
    (perf.commentCount || 0) * 3 +
    (perf.shareCount || 0) * 5 +
    (perf.collectCount || 0) * 2;
  const viewCount = Math.max(perf.viewCount || 1, 1);
  const interactionRate = totalInteraction / viewCount;

  let score: number;
  if (interactionRate > 0.1) {
    score = Math.min(100, 80 + (interactionRate - 0.1) * 200);
  } else if (interactionRate > 0.05) {
    score = 60 + (interactionRate - 0.05) * 400;
  } else if (interactionRate > 0.01) {
    score = 30 + (interactionRate - 0.01) * 750;
  } else {
    score = interactionRate * 3000;
  }
  return Math.round(Math.min(100, Math.max(0, score)));
}

/* ── Core: Aggregate Historical Feedback ── */

/**
 * 聚合指定用户在指定赛道（或全部赛道）的历史效果数据
 * 用于注入 Stage 2 LLM prompt，让模型基于真实效果调整方向
 */
export async function aggregateHistoricalFeedback(
  userOpenId: string,
  track?: string,
): Promise<TrackFeedbackSummary | null> {
  try {
    // 查询所有已发布内容及其最新效果数据
    const rows = await query<RowDataPacket[]>(
      `SELECT
        pc.id,
        pc.directionName,
        pc.platform,
        pc.publishedTitle,
        pc.predictedScore,
        pc.strategySessionId,
        pc.publishedAt,
        (SELECT JSON_OBJECT(
          'viewCount', cp.viewCount,
          'likeCount', cp.likeCount,
          'commentCount', cp.commentCount,
          'shareCount', cp.shareCount,
          'collectCount', cp.collectCount,
          'checkpoint', cp.checkpoint
        ) FROM content_performance cp
         WHERE cp.publishedContentId = pc.id
         ORDER BY cp.collectedAt DESC LIMIT 1) as latestPerf
       FROM published_content pc
       WHERE pc.userOpenId = ?
         AND pc.predictedScore IS NOT NULL
         AND pc.directionName IS NOT NULL
       ORDER BY pc.publishedAt DESC
       LIMIT 100`,
      [userOpenId],
    );

    if (rows.length === 0) return null;

    // 如果指定了赛道，尝试通过 session 关联过滤
    let filteredRows = rows;
    if (track) {
      // 获取该赛道相关的 session IDs
      const sessionRows = await query<RowDataPacket[]>(
        `SELECT id FROM topic_strategy_sessions
         WHERE user_open_id = ? AND track = ?`,
        [userOpenId, track],
      ).catch(() => []);

      if (sessionRows.length > 0) {
        const sessionIds = new Set(sessionRows.map((r) => r.id));
        const trackFiltered = rows.filter(
          (r) => r.strategySessionId && sessionIds.has(r.strategySessionId),
        );
        if (trackFiltered.length > 0) {
          filteredRows = trackFiltered;
        }
        // 如果过滤后为空，仍然使用全部数据（跨赛道参考）
      }
    }

    // 按方向+平台聚合
    const directionMap = new Map<string, {
      directionName: string;
      platform: string;
      items: Array<{
        title: string | null;
        predictedScore: number;
        actualScore: number;
        publishedAt: Date | null;
      }>;
    }>();

    for (const row of filteredRows) {
      const perf = row.latestPerf
        ? (typeof row.latestPerf === "string" ? JSON.parse(row.latestPerf) : row.latestPerf)
        : null;
      if (!perf) continue;

      const actualScore = computeActualScore(perf);
      const key = `${row.directionName}__${row.platform}`;

      if (!directionMap.has(key)) {
        directionMap.set(key, {
          directionName: row.directionName,
          platform: row.platform,
          items: [],
        });
      }
      directionMap.get(key)!.items.push({
        title: row.publishedTitle,
        predictedScore: row.predictedScore ?? 50,
        actualScore,
        publishedAt: row.publishedAt,
      });
    }

    if (directionMap.size === 0) return null;

    // 构建方向级别的反馈
    const directionFeedbacks: DirectionFeedback[] = [];

    for (const [, group] of directionMap) {
      const { directionName, platform, items } = group;
      const avgPredicted = Math.round(items.reduce((s, i) => s + i.predictedScore, 0) / items.length);
      const avgActual = Math.round(items.reduce((s, i) => s + i.actualScore, 0) / items.length);
      const avgAccuracy = Math.round(
        items.reduce((s, i) => s + Math.max(0, 100 - Math.abs(i.predictedScore - i.actualScore)), 0) / items.length,
      );

      const sorted = [...items].sort((a, b) => b.actualScore - a.actualScore);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      // 趋势判断：比较前半和后半的平均分
      let trend: "improving" | "declining" | "stable" = "stable";
      if (items.length >= 4) {
        const mid = Math.floor(items.length / 2);
        const olderAvg = items.slice(mid).reduce((s, i) => s + i.actualScore, 0) / (items.length - mid);
        const newerAvg = items.slice(0, mid).reduce((s, i) => s + i.actualScore, 0) / mid;
        if (newerAvg > olderAvg + 5) trend = "improving";
        else if (newerAvg < olderAvg - 5) trend = "declining";
      }

      directionFeedbacks.push({
        directionName,
        platform,
        publishCount: items.length,
        avgPredictedScore: avgPredicted,
        avgActualScore: avgActual,
        accuracy: avgAccuracy,
        bestTitle: best?.title ?? null,
        bestActualScore: best?.actualScore ?? 0,
        worstTitle: worst?.title ?? null,
        worstActualScore: worst?.actualScore ?? 0,
        trend,
      });
    }

    // 排序：按实际表现分降序
    directionFeedbacks.sort((a, b) => b.avgActualScore - a.avgActualScore);

    const topDirections = directionFeedbacks
      .filter((d) => d.avgActualScore >= 60)
      .slice(0, 3)
      .map((d) => d.directionName);

    const weakDirections = directionFeedbacks
      .filter((d) => d.avgActualScore < 40 && d.publishCount >= 2)
      .slice(0, 3)
      .map((d) => d.directionName);

    // 平台维度对比
    const platformMap = new Map<string, { total: number; count: number }>();
    for (const fb of directionFeedbacks) {
      const existing = platformMap.get(fb.platform) ?? { total: 0, count: 0 };
      existing.total += fb.avgActualScore * fb.publishCount;
      existing.count += fb.publishCount;
      platformMap.set(fb.platform, existing);
    }
    const platformComparison = [...platformMap.entries()].map(([platform, data]) => ({
      platform,
      avgActualScore: Math.round(data.total / Math.max(data.count, 1)),
      publishCount: data.count,
    }));

    const totalPublished = directionFeedbacks.reduce((s, d) => s + d.publishCount, 0);
    const overallAccuracy = Math.round(
      directionFeedbacks.reduce((s, d) => s + d.accuracy * d.publishCount, 0) / Math.max(totalPublished, 1),
    );

    // 生成自然语言反馈上下文
    const feedbackContext = buildFeedbackContext({
      track: track ?? "全赛道",
      totalPublished,
      overallAccuracy,
      directionFeedbacks,
      topDirections,
      weakDirections,
      platformComparison,
    });

    return {
      track: track ?? "全赛道",
      totalPublished,
      overallAccuracy,
      directionFeedbacks,
      topDirections,
      weakDirections,
      platformComparison,
      feedbackContext,
    };
  } catch (err) {
    log.warn({ err: err }, "aggregateHistoricalFeedback failed");
    return null;
  }
}

/* ── Feedback Context Builder ── */

function buildFeedbackContext(params: {
  track: string;
  totalPublished: number;
  overallAccuracy: number;
  directionFeedbacks: DirectionFeedback[];
  topDirections: string[];
  weakDirections: string[];
  platformComparison: Array<{ platform: string; avgActualScore: number; publishCount: number }>;
}): string {
  const { track, totalPublished, overallAccuracy, directionFeedbacks, topDirections, weakDirections, platformComparison } = params;

  const lines: string[] = [];
  lines.push(`## 历史效果反馈（${track}）`);
  lines.push(`用户已在该赛道发布 ${totalPublished} 条内容，整体预测准确率 ${overallAccuracy}%。`);

  if (topDirections.length > 0) {
    lines.push("");
    lines.push("### 表现优秀的方向（应优先推荐类似方向）");
    for (const dirName of topDirections) {
      const fb = directionFeedbacks.find((d) => d.directionName === dirName);
      if (!fb) continue;
      lines.push(`- 「${fb.directionName}」(${fb.platform})：发布 ${fb.publishCount} 条，平均实际分 ${fb.avgActualScore}，预测准确率 ${fb.accuracy}%${fb.trend === "improving" ? "，趋势上升 ↑" : fb.trend === "declining" ? "，趋势下降 ↓" : ""}${fb.bestTitle ? `，最佳：「${fb.bestTitle}」(${fb.bestActualScore}分)` : ""}`);
    }
  }

  if (weakDirections.length > 0) {
    lines.push("");
    lines.push("### 表现较差的方向（应避免或调整角度）");
    for (const dirName of weakDirections) {
      const fb = directionFeedbacks.find((d) => d.directionName === dirName);
      if (!fb) continue;
      lines.push(`- 「${fb.directionName}」(${fb.platform})：发布 ${fb.publishCount} 条，平均实际分 ${fb.avgActualScore}，预测准确率 ${fb.accuracy}%${fb.trend === "declining" ? "，持续下降 ↓" : ""}`);
    }
  }

  if (platformComparison.length > 1) {
    lines.push("");
    lines.push("### 平台效果对比");
    for (const pc of platformComparison) {
      lines.push(`- ${pc.platform}：平均实际分 ${pc.avgActualScore}，已发布 ${pc.publishCount} 条`);
    }
  }

  // 添加调整建议
  lines.push("");
  lines.push("### 策略调整建议");
  if (topDirections.length > 0 && weakDirections.length > 0) {
    lines.push(`基于历史数据，「${topDirections[0]}」方向效果最好，应优先推荐类似方向。「${weakDirections[0]}」方向效果不佳，建议避免或换角度。`);
  } else if (topDirections.length > 0) {
    lines.push(`「${topDirections[0]}」方向效果最好，生成新方向时应参考其成功模式。`);
  } else if (weakDirections.length > 0) {
    lines.push(`「${weakDirections[0]}」方向效果不佳，建议避免推荐类似方向。`);
  } else if (totalPublished > 0) {
    lines.push("历史数据尚不足以形成明确的方向偏好，继续积累数据。");
  }

  if (overallAccuracy < 50 && totalPublished >= 5) {
    lines.push("注意：整体预测准确率偏低，建议在评分时更保守，避免过高预测。");
  }

  return lines.join("\n");
}

/* ── Prompt Injection Helper ── */

/**
 * 为 Stage 2 LLM prompt 生成历史反馈注入段落
 * 如果没有历史数据，返回空字符串（不影响 prompt）
 */
export async function getHistoricalFeedbackForPrompt(
  userOpenId: string,
  track: string,
): Promise<string> {
  const feedback = await aggregateHistoricalFeedback(userOpenId, track);
  if (!feedback || feedback.totalPublished === 0) return "";
  return `\n${feedback.feedbackContext}\n`;
}

/**
 * 为 evolveDirection 生成历史反馈注入段落
 * 聚焦于特定方向的历史表现
 */
export async function getDirectionFeedbackForPrompt(
  userOpenId: string,
  directionName: string,
): Promise<string> {
  const feedback = await aggregateHistoricalFeedback(userOpenId);
  if (!feedback) return "";

  const dirFeedback = feedback.directionFeedbacks.find(
    (d) => d.directionName === directionName || d.directionName.includes(directionName) || directionName.includes(d.directionName),
  );

  if (!dirFeedback) return "";

  const lines: string[] = [];
  lines.push(`\n## 该方向的历史效果`);
  lines.push(`「${dirFeedback.directionName}」已发布 ${dirFeedback.publishCount} 条内容：`);
  lines.push(`- 平均实际表现分：${dirFeedback.avgActualScore}/100`);
  lines.push(`- 预测准确率：${dirFeedback.accuracy}%`);
  lines.push(`- 趋势：${dirFeedback.trend === "improving" ? "上升 ↑" : dirFeedback.trend === "declining" ? "下降 ↓" : "稳定"}`);
  if (dirFeedback.bestTitle) {
    lines.push(`- 最佳内容：「${dirFeedback.bestTitle}」(${dirFeedback.bestActualScore}分)`);
  }
  if (dirFeedback.worstTitle && dirFeedback.publishCount >= 2) {
    lines.push(`- 最差内容：「${dirFeedback.worstTitle}」(${dirFeedback.worstActualScore}分)`);
  }
  lines.push(`\n请基于以上历史效果数据，生成更精准的子方向。${dirFeedback.trend === "declining" ? "注意该方向效果在下降，子方向应寻找新的切入角度。" : dirFeedback.trend === "improving" ? "该方向效果在上升，子方向可以继续深挖。" : ""}`);

  return lines.join("\n");
}
