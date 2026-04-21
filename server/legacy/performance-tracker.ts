/**
 * performance-tracker.ts
 * ═══════════════════════════════════════════════════════════════
 * P2-9: 发布后效果追踪服务
 *
 * 定期采集已发布内容的实际数据（播放量、点赞、评论等），
 * 在 1h/6h/24h/72h/7d 五个时间点各采集一次，
 * 并与预测验证分做对比。
 * ═══════════════════════════════════════════════════════════════
 */
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("PerformanceTracker");
import { execute, query } from "./database";
import type { RowDataPacket } from "./database";
import { getTikHub } from "./tikhub.js";

/** 采集时间点配置（小时） */
const CHECKPOINTS = [
  { label: "1h", hoursAfter: 1 },
  { label: "6h", hoursAfter: 6 },
  { label: "24h", hoursAfter: 24 },
  { label: "72h", hoursAfter: 72 },
  { label: "7d", hoursAfter: 168 },
];

interface FreshStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
}

/** 递归查找嵌套对象中的指定 key */
function extractNestedValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const found = extractNestedValue(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

/** 从 TikHub 获取视频最新数据 */
async function fetchVideoStats(
  platform: string,
  contentId: string,
): Promise<FreshStats | null> {
  try {
    if (platform === "douyin" && contentId) {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/douyin/web/fetch_one_video",
        { aweme_id: contentId },
      );
      const data = resp as unknown as Record<string, unknown>;
      const awemeDetail = extractNestedValue(data, "aweme_detail") as Record<string, unknown> | null;
      const statistics = (awemeDetail?.statistics ?? extractNestedValue(data, "statistics") ?? {}) as Record<string, unknown>;
      if (!statistics || Object.keys(statistics).length === 0) return null;
      return {
        viewCount: Number(statistics.play_count ?? statistics.vv_count ?? 0),
        likeCount: Number(statistics.digg_count ?? statistics.like_count ?? 0),
        commentCount: Number(statistics.comment_count ?? 0),
        shareCount: Number(statistics.share_count ?? 0),
        collectCount: Number(statistics.collect_count ?? statistics.favorite_count ?? 0),
      };
    }

    if (platform === "xiaohongshu" && contentId) {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/xiaohongshu/web/get_note_by_id",
        { note_id: contentId },
      );
      const data = resp as unknown as Record<string, unknown>;
      const noteDetail = extractNestedValue(data, "note_detail_data") as Record<string, unknown> | null;
      const interactInfo = (noteDetail?.interact_info ?? extractNestedValue(data, "interact_info") ?? {}) as Record<string, unknown>;
      if (!interactInfo || Object.keys(interactInfo).length === 0) return null;
      return {
        viewCount: 0, // 小红书不公开播放量
        likeCount: Number(interactInfo.liked_count ?? 0),
        commentCount: Number(interactInfo.comment_count ?? 0),
        shareCount: Number(interactInfo.share_count ?? 0),
        collectCount: Number(interactInfo.collected_count ?? 0),
      };
    }

    if (platform === "kuaishou" && contentId) {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/kuaishou/web/fetch_one_video",
        { share_text: `https://www.kuaishou.com/short-video/${contentId}` },
      );
      const data = resp as unknown as Record<string, unknown>;
      const photo = extractNestedValue(data, "photo") as Record<string, unknown> | null;
      if (!photo) return null;
      return {
        viewCount: Number(photo.viewCount ?? 0),
        likeCount: Number(photo.likeCount ?? 0),
        commentCount: Number(photo.commentCount ?? 0),
        shareCount: Number(photo.shareCount ?? 0),
        collectCount: Number(photo.collectCount ?? 0),
      };
    }

    return null;
  } catch (err) {
    log.warn({ err: err }, `获取 ${platform}/${contentId} 数据失败`);
    return null;
  }
}

/**
 * 扫描所有需要采集数据的已发布内容，并执行采集
 * 应由定时任务每小时调用一次
 */
export async function runPerformanceCollection(): Promise<{
  scanned: number;
  collected: number;
  errors: number;
}> {
  let scanned = 0;
  let collected = 0;
  let errors = 0;

  try {
    // 查找所有已发布内容，且发布时间在 7 天内
    const publishedItems = await query<RowDataPacket[]>(
      `SELECT pc.id, pc.platform, pc.contentId, pc.publishedAt, pc.predictedScore
       FROM published_content pc
       WHERE pc.publishedAt IS NOT NULL
         AND pc.contentId IS NOT NULL
         AND pc.publishedAt > DATE_SUB(NOW(), INTERVAL 8 DAY)
       ORDER BY pc.publishedAt DESC`,
      []
    );

    for (const item of publishedItems) {
      scanned++;
      const publishedAt = new Date(item.publishedAt);
      const hoursElapsed = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);

      // 找到下一个需要采集的 checkpoint
      for (const cp of CHECKPOINTS) {
        if (hoursElapsed < cp.hoursAfter - 0.5) continue; // 还没到时间
        if (hoursElapsed > cp.hoursAfter + 2) continue; // 超过窗口太久

        // 检查是否已采集过这个 checkpoint
        const existing = await query<RowDataPacket[]>(
          `SELECT id FROM content_performance WHERE publishedContentId = ? AND checkpoint = ?`,
          [item.id, cp.label]
        );
        if (existing.length > 0) continue;

        // 采集数据
        const stats = await fetchVideoStats(item.platform, item.contentId);
        if (stats) {
          await execute(
            `INSERT INTO content_performance (publishedContentId, checkpoint, viewCount, likeCount, commentCount, shareCount, collectCount)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [item.id, cp.label, stats.viewCount, stats.likeCount, stats.commentCount, stats.shareCount, stats.collectCount]
          );
          collected++;
          log.info(`采集 ${item.platform}/${item.contentId} @${cp.label}: views=${stats.viewCount} likes=${stats.likeCount}`);
        } else {
          errors++;
        }
      }

      // 避免 API 限流
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    log.error({ err: err }, "采集任务异常");
    errors++;
  }

  log.info(`完成: scanned=${scanned} collected=${collected} errors=${errors}`);
  return { scanned, collected, errors };
}

/**
 * 计算预测准确率：对比预测验证分与实际表现
 * 返回每个已发布内容的预测分 vs 实际表现评分
 */
export async function computePredictionAccuracy(userOpenId: string): Promise<{
  items: Array<{
    publishedContentId: number;
    directionName: string | null;
    platform: string;
    publishedTitle: string | null;
    predictedScore: number | null;
    actualScore: number;
    accuracy: number; // 0-100
    latestPerformance: FreshStats | null;
  }>;
  overallAccuracy: number;
  totalItems: number;
}> {
  const items = await query<RowDataPacket[]>(
    `SELECT pc.id, pc.directionName, pc.platform, pc.publishedTitle, pc.predictedScore,
            (SELECT JSON_OBJECT(
              'viewCount', cp.viewCount, 'likeCount', cp.likeCount,
              'commentCount', cp.commentCount, 'shareCount', cp.shareCount,
              'collectCount', cp.collectCount, 'checkpoint', cp.checkpoint
            ) FROM content_performance cp
             WHERE cp.publishedContentId = pc.id
             ORDER BY cp.collectedAt DESC LIMIT 1) as latestPerf
     FROM published_content pc
     WHERE pc.userOpenId = ? AND pc.predictedScore IS NOT NULL
     ORDER BY pc.publishedAt DESC LIMIT 50`,
    [userOpenId]
  );

  const results: Array<{
    publishedContentId: number;
    directionName: string | null;
    platform: string;
    publishedTitle: string | null;
    predictedScore: number | null;
    actualScore: number;
    accuracy: number;
    latestPerformance: FreshStats | null;
  }> = [];

  for (const item of items) {
    const perf = item.latestPerf
      ? (typeof item.latestPerf === "string" ? JSON.parse(item.latestPerf) : item.latestPerf)
      : null;

    if (!perf) continue;

    // 计算实际表现评分（0-100）
    // 基于互动数据的综合评分
    const totalInteraction = (perf.likeCount || 0) + (perf.commentCount || 0) * 3 + (perf.shareCount || 0) * 5 + (perf.collectCount || 0) * 2;
    const viewCount = perf.viewCount || 1;
    const interactionRate = totalInteraction / Math.max(viewCount, 1);

    // 将互动率映射到 0-100 分
    // 互动率 > 10% 为优秀（80+），5-10% 为良好（60-80），1-5% 为一般（30-60），< 1% 为较差（0-30）
    let actualScore: number;
    if (interactionRate > 0.1) {
      actualScore = Math.min(100, 80 + (interactionRate - 0.1) * 200);
    } else if (interactionRate > 0.05) {
      actualScore = 60 + (interactionRate - 0.05) * 400;
    } else if (interactionRate > 0.01) {
      actualScore = 30 + (interactionRate - 0.01) * 750;
    } else {
      actualScore = interactionRate * 3000;
    }
    actualScore = Math.round(Math.min(100, Math.max(0, actualScore)));

    // 计算准确率：预测分与实际分的接近程度
    const predicted = item.predictedScore ?? 50;
    const diff = Math.abs(predicted - actualScore);
    const accuracy = Math.round(Math.max(0, 100 - diff));

    results.push({
      publishedContentId: item.id,
      directionName: item.directionName,
      platform: item.platform,
      publishedTitle: item.publishedTitle,
      predictedScore: item.predictedScore,
      actualScore,
      accuracy,
      latestPerformance: perf as FreshStats,
    });
  }

  const overallAccuracy = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.accuracy, 0) / results.length)
    : 0;

  return {
    items: results,
    overallAccuracy,
    totalItems: results.length,
  };
}
