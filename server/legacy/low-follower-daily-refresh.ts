/**
 * server/legacy/low-follower-daily-refresh.ts
 * ═══════════════════════════════════════════════════════════════
 * 低粉爆款每日自动刷新 + 动态阈值优化
 *
 * 功能：
 * 1. 每日从数据库取出所有低粉爆款样本
 * 2. 通过 TikHub API 重新拉取最新互动数据
 * 3. 使用 V2 算法重新计算评分
 * 4. 更新数据库中的评分和互动数据
 * 5. 记录评分历史到 low_follower_score_history
 * 6. 根据数据分布动态优化阈值参数
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LowFollowerRefresh");
import { query, execute } from "./database.js";
import type { RowDataPacket } from "./database.js";
import { getTikHub } from "./tikhub.js";
import {
  computeWeightedInteraction,
  DEFAULT_ALGORITHM_CONFIG,
  type RawContentItem,
  type LowFollowerAlgorithmConfig,
} from "./low-follower-algorithm.js";

// ─────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────

const REFRESH_CONFIG = {
  /** 每批处理的样本数 */
  batchSize: 10,
  /** 批次间延迟（毫秒），避免 TikHub 限流 */
  batchDelayMs: 2000,
  /** 单个请求超时（毫秒） */
  requestTimeoutMs: 10_000,
  /** 最多刷新的样本数（避免一次性刷新太多） */
  maxRefreshCount: 200,
  /** 样本过期天数（超过此天数的样本标记为 expired） */
  expireDays: 90,
};

// ─────────────────────────────────────────────
// 主函数：每日刷新
// ─────────────────────────────────────────────

export async function runDailyRefresh(): Promise<{
  refreshed: number;
  failed: number;
  expired: number;
  optimized: boolean;
}> {
  log.info("开始每日刷新...");
  const startTime = Date.now();

  let refreshed = 0;
  let failed = 0;
  let expired = 0;

  try {
    // Step 1: 标记过期样本
    expired = await markExpiredSamples();

    // Step 2: 获取需要刷新的样本（按 last_refreshed_at 最旧的优先）
    const samples = await fetchSamplesToRefresh();
    log.info(`待刷新样本: ${samples.length} 条`);

    if (samples.length === 0) {
      log.info("无需刷新的样本");
      return { refreshed: 0, failed: 0, expired, optimized: false };
    }

    // Step 3: 分批刷新
    for (let i = 0; i < samples.length; i += REFRESH_CONFIG.batchSize) {
      const batch = samples.slice(i, i + REFRESH_CONFIG.batchSize);
      const results = await Promise.allSettled(
        batch.map((s) => refreshSingleSample(s)),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          refreshed++;
        } else {
          failed++;
        }
      }

      // 批次间延迟
      if (i + REFRESH_CONFIG.batchSize < samples.length) {
        await sleep(REFRESH_CONFIG.batchDelayMs);
      }
    }

    // Step 4: 动态阈值优化
    const optimized = await optimizeThresholds();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info("刷新完成: ${refreshed} 成功, ${failed} 失败, ${expired} 过期, 耗时 ${elapsed}s");

    return { refreshed, failed, expired, optimized };
  } catch (err) {
    log.error({ err: err }, "刷新异常");
    return { refreshed, failed, expired, optimized: false };
  }
}

// ─────────────────────────────────────────────
// 标记过期样本
// ─────────────────────────────────────────────

async function markExpiredSamples(): Promise<number> {
  const result = await execute(
    `UPDATE low_follower_samples 
     SET viral_score_trend = 'expired'
     WHERE video_published_at IS NOT NULL 
       AND video_published_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND viral_score_trend != 'expired'`,
    [REFRESH_CONFIG.expireDays],
  );
  const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
  if (affected > 0) {
    log.info(`标记 ${affected} 条过期样本`);
  }
  return affected;
}

// ─────────────────────────────────────────────
// 获取需要刷新的样本
// ─────────────────────────────────────────────

interface SampleToRefresh {
  id: string;
  videoId: string;
  platformId: string;
  oldViralScore: number;
  oldLikes: number;
  oldComments: number;
  oldShares: number;
  oldCollects: number;
  authorFollowers: number;
  videoPublishedAt: string | null;
}

async function fetchSamplesToRefresh(): Promise<SampleToRefresh[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, video_id, platform_id, viral_score, 
            video_likes, video_comments, video_shares, video_collects,
            author_followers, video_published_at
     FROM low_follower_samples
     WHERE viral_score_trend != 'expired'
     ORDER BY last_refreshed_at ASC
     LIMIT ?`,
    [REFRESH_CONFIG.maxRefreshCount],
  );

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    videoId: String(r.video_id ?? ""),
    platformId: String(r.platform_id ?? "douyin"),
    oldViralScore: Number(r.viral_score ?? 0),
    oldLikes: Number(r.video_likes ?? 0),
    oldComments: Number(r.video_comments ?? 0),
    oldShares: Number(r.video_shares ?? 0),
    oldCollects: Number(r.video_collects ?? 0),
    authorFollowers: Number(r.author_followers ?? 0),
    videoPublishedAt: r.video_published_at ? String(r.video_published_at) : null,
  }));
}

// ─────────────────────────────────────────────
// 刷新单个样本
// ─────────────────────────────────────────────

async function refreshSingleSample(sample: SampleToRefresh): Promise<boolean> {
  try {
    // 通过 TikHub 获取最新视频数据
    const freshData = await fetchFreshVideoData(sample.videoId, sample.platformId);
    if (!freshData) {
      // API 失败，仅更新 last_refreshed_at 避免反复重试
      await execute(
        `UPDATE low_follower_samples SET last_refreshed_at = NOW() WHERE id = ?`,
        [sample.id],
      );
      return false;
    }

    // 使用当前阈值配置（可能已被动态优化）
    const cfg = await loadCurrentConfig();

    // 重新计算加权互动分
    const rawContent: RawContentItem = {
      contentId: sample.videoId,
      authorId: "",
      authorName: "",
      title: "",
      platform: sample.platformId as RawContentItem["platform"],
      viewCount: freshData.viewCount,
      likeCount: freshData.likeCount,
      commentCount: freshData.commentCount,
      shareCount: freshData.shareCount,
      saveCount: freshData.saveCount,
      publishedAt: sample.videoPublishedAt,
      contentUrl: null,
      coverUrl: null,
      tags: [],
    };

    const weightedInteraction = computeWeightedInteraction(rawContent, cfg);
    const fanEfficiency = weightedInteraction / Math.max(sample.authorFollowers, 100);

    // 重新计算评分（简化版，不需要 P75 基准，直接用粉丝效率比和互动量）
    const efficiencyScore = Math.min((fanEfficiency / 5) * 40, 40);
    const interactionScore = Math.min((weightedInteraction / 5000) * 35, 35);
    const followerScore = Math.min(
      ((cfg.followerCeiling - sample.authorFollowers) / cfg.followerCeiling) * 25,
      25,
    );
    const newViralScore = Math.min(100, Math.max(0, efficiencyScore + interactionScore + followerScore));

    // 计算趋势
    const scoreDiff = newViralScore - sample.oldViralScore;
    let trend: string;
    if (scoreDiff > 5) trend = "rising";
    else if (scoreDiff < -5) trend = "falling";
    else trend = "stable";

    // 重新判定是否严格命中
    const isStrictHit = sample.authorFollowers < cfg.followerCeiling &&
      weightedInteraction >= cfg.minFanEfficiency * 100 && // 简化判定
      fanEfficiency >= cfg.minFanEfficiency;

    // 更新数据库（同时补充粉丝数和封面图）
    let updateSql = `UPDATE low_follower_samples SET
        video_views = ?,
        video_likes = ?,
        video_comments = ?,
        video_shares = ?,
        video_collects = ?,
        weighted_interaction = ?,
        fan_efficiency_ratio = ?,
        viral_score = ?,
        viral_score_trend = ?,
        is_strict_hit = ?,
        last_refreshed_at = NOW(),
        score_updated_at = NOW()`;
    const updateParams: unknown[] = [
      freshData.viewCount,
      freshData.likeCount,
      freshData.commentCount,
      freshData.shareCount,
      freshData.saveCount,
      weightedInteraction,
      fanEfficiency,
      newViralScore,
      trend,
      isStrictHit ? 1 : 0,
    ];

    // 补充粉丝数（仅当原值为 0 且新值 > 0 时）
    if (freshData.followerCount && freshData.followerCount > 0 && sample.authorFollowers <= 0) {
      updateSql += `, author_followers = ?`;
      updateParams.push(freshData.followerCount);
    }
    // 补充封面图（仅当原值为空时）
    if (freshData.coverUrl) {
      updateSql += `, video_cover = COALESCE(NULLIF(video_cover, ''), ?)`;
      updateParams.push(freshData.coverUrl);
    }

    updateSql += ` WHERE id = ?`;
    updateParams.push(sample.id);

    await execute(updateSql, updateParams);

    // 记录评分历史
    await execute(
      `INSERT INTO low_follower_score_history 
        (sample_id, viral_score, video_likes, video_comments, video_shares, video_collects,
         weighted_interaction, fan_efficiency_ratio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sample.id,
        newViralScore,
        freshData.likeCount,
        freshData.commentCount,
        freshData.shareCount,
        freshData.saveCount,
        weightedInteraction,
        fanEfficiency,
      ],
    );

    return true;
  } catch (err) {
    log.error({ err: err }, `刷新样本 ${sample.id} 失败`);
    return false;
  }
}

// ─────────────────────────────────────────────
// TikHub 获取最新视频数据
// ─────────────────────────────────────────────

interface FreshVideoData {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  followerCount?: number;
  coverUrl?: string;
}

async function fetchFreshVideoData(
  videoId: string,
  platform: string,
): Promise<FreshVideoData | null> {
  try {
    if (platform === "douyin") {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/douyin/web/fetch_one_video",
        { aweme_id: videoId },
      );

      // 从 TikHub 响应中提取互动数据
      const data = resp as unknown as Record<string, unknown>;
      const awemeDetail = extractNestedValue(data, "aweme_detail") as Record<string, unknown> | null;
      if (!awemeDetail) {
        // 尝试从 data 直接提取
        const statistics = extractNestedValue(data, "statistics") as Record<string, unknown> | null;
        if (statistics) {
          return {
            viewCount: Number(statistics.play_count ?? statistics.vv_count ?? 0),
            likeCount: Number(statistics.digg_count ?? statistics.like_count ?? 0),
            commentCount: Number(statistics.comment_count ?? 0),
            shareCount: Number(statistics.share_count ?? 0),
            saveCount: Number(statistics.collect_count ?? statistics.favorite_count ?? 0),
          };
        }
        return null;
      }

      const statistics = (awemeDetail.statistics ?? {}) as Record<string, unknown>;

      // 补充获取粉丝数
      let followerCount: number | undefined;
      const author = awemeDetail.author as Record<string, unknown> | undefined;
      if (author) {
        const fc = typeof author.mplatform_followers_count === "number" ? author.mplatform_followers_count :
          typeof author.follower_count === "number" ? author.follower_count : undefined;
        if (fc && fc > 0) followerCount = fc;
      }

      // 补充获取封面图
      let coverUrl: string | undefined;
      const video = awemeDetail.video as Record<string, unknown> | undefined;
      if (video) {
        const coverPaths = [
          (video.cover as Record<string, unknown>)?.url_list,
          (video.origin_cover as Record<string, unknown>)?.url_list,
          (video.dynamic_cover as Record<string, unknown>)?.url_list,
        ];
        for (const urls of coverPaths) {
          if (Array.isArray(urls) && urls.length > 0) {
            coverUrl = urls[0] as string;
            break;
          }
        }
      }

      return {
        viewCount: Number(statistics.play_count ?? statistics.vv_count ?? 0),
        likeCount: Number(statistics.digg_count ?? statistics.like_count ?? 0),
        commentCount: Number(statistics.comment_count ?? 0),
        shareCount: Number(statistics.share_count ?? 0),
        saveCount: Number(statistics.collect_count ?? statistics.favorite_count ?? 0),
        followerCount,
        coverUrl,
      };
    }

    // 其他平台暂不支持刷新
    return null;
  } catch (err) {
    log.warn({ err: err }, `TikHub 请求失败 (${videoId})`);
    return null;
  }
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

// ─────────────────────────────────────────────
// 动态阈值优化
// ─────────────────────────────────────────────

async function optimizeThresholds(): Promise<boolean> {
  try {
    // 获取当前数据库中所有样本的统计数据
    const [statsRow] = await query<RowDataPacket[]>(
      `SELECT 
        COUNT(*) as total,
        AVG(weighted_interaction) as avg_weighted,
        AVG(fan_efficiency_ratio) as avg_efficiency,
        AVG(viral_score) as avg_score,
        STDDEV(weighted_interaction) as std_weighted,
        STDDEV(fan_efficiency_ratio) as std_efficiency,
        SUM(CASE WHEN is_strict_hit = 1 THEN 1 ELSE 0 END) as strict_count,
        SUM(CASE WHEN viral_score_trend = 'rising' THEN 1 ELSE 0 END) as rising_count,
        SUM(CASE WHEN viral_score_trend = 'falling' THEN 1 ELSE 0 END) as falling_count
      FROM low_follower_samples
      WHERE viral_score_trend != 'expired'`,
    );

    const stats = statsRow as Record<string, unknown>;
    const total = Number(stats?.total ?? 0);

    if (total < 10) {
      log.info("样本不足10条，跳过阈值优化");
      return false;
    }

    const avgWeighted = Number(stats?.avg_weighted ?? 0);
    const avgEfficiency = Number(stats?.avg_efficiency ?? 0);
    const strictCount = Number(stats?.strict_count ?? 0);
    const strictRatio = strictCount / total;

    // 动态调整策略：
    // - 如果严格命中率太高（>70%），适当提高阈值
    // - 如果严格命中率太低（<20%），适当降低阈值
    // - 目标命中率在 30%-60% 之间

    let newMinFanEfficiency = DEFAULT_ALGORITHM_CONFIG.minFanEfficiency;
    let newFollowerCeiling = DEFAULT_ALGORITHM_CONFIG.followerCeiling;

    if (strictRatio > 0.7) {
      // 命中率过高，提高门槛
      newMinFanEfficiency = Math.min(avgEfficiency * 0.8, 3.0);
      log.info(`命中率 ${(strictRatio * 100).toFixed(0)}% 偏高，提高粉丝效率比阈值到 ${newMinFanEfficiency.toFixed(2)}`);
    } else if (strictRatio < 0.2) {
      // 命中率过低，降低门槛
      newMinFanEfficiency = Math.max(avgEfficiency * 0.3, 0.1);
      log.info(`命中率 ${(strictRatio * 100).toFixed(0)}% 偏低，降低粉丝效率比阈值到 ${newMinFanEfficiency.toFixed(2)}`);
    }

    // 更新阈值到数据库
    const thresholds = [
      { key: "follower_ceiling", value: newFollowerCeiling, desc: "低粉上限（粉丝量阈值）" },
      { key: "min_fan_efficiency", value: newMinFanEfficiency, desc: "最低粉丝效率比" },
      { key: "benchmark_percentile", value: DEFAULT_ALGORITHM_CONFIG.benchmarkPercentile, desc: "P75基准分位数" },
      { key: "recency_days", value: DEFAULT_ALGORITHM_CONFIG.recencyDays, desc: "时效性天数" },
      { key: "like_weight", value: DEFAULT_ALGORITHM_CONFIG.likeWeight, desc: "点赞权重" },
      { key: "comment_weight", value: DEFAULT_ALGORITHM_CONFIG.commentWeight, desc: "评论权重" },
      { key: "save_weight", value: DEFAULT_ALGORITHM_CONFIG.saveWeight, desc: "收藏权重" },
      { key: "share_weight", value: DEFAULT_ALGORITHM_CONFIG.shareWeight, desc: "分享权重" },
      { key: "time_decay_halflife", value: DEFAULT_ALGORITHM_CONFIG.timeDecayHalflife, desc: "时间衰减半衰期（天）" },
    ];

    for (const t of thresholds) {
      await execute(
        `INSERT INTO low_follower_thresholds (threshold_key, threshold_value, description, auto_optimized, last_optimized_at)
         VALUES (?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE
           threshold_value = VALUES(threshold_value),
           auto_optimized = 1,
           last_optimized_at = NOW()`,
        [t.key, t.value, t.desc],
      );
    }

    log.info("阈值优化完成");
    return true;
  } catch (err) {
    log.error({ err: err }, "阈值优化失败");
    return false;
  }
}

// ─────────────────────────────────────────────
// 加载当前配置（从数据库或默认值）
// ─────────────────────────────────────────────

async function loadCurrentConfig(): Promise<LowFollowerAlgorithmConfig> {
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT threshold_key, threshold_value FROM low_follower_thresholds`,
    );

    const configMap = new Map<string, number>();
    for (const row of rows as Record<string, unknown>[]) {
      configMap.set(String(row.threshold_key), Number(row.threshold_value));
    }

    return {
      followerCeiling: configMap.get("follower_ceiling") ?? DEFAULT_ALGORITHM_CONFIG.followerCeiling,
      benchmarkPercentile: configMap.get("benchmark_percentile") ?? DEFAULT_ALGORITHM_CONFIG.benchmarkPercentile,
      followerFloorPercentile: DEFAULT_ALGORITHM_CONFIG.followerFloorPercentile,
      recencyDays: configMap.get("recency_days") ?? DEFAULT_ALGORITHM_CONFIG.recencyDays,
      minFanEfficiency: configMap.get("min_fan_efficiency") ?? DEFAULT_ALGORITHM_CONFIG.minFanEfficiency,
      likeWeight: configMap.get("like_weight") ?? DEFAULT_ALGORITHM_CONFIG.likeWeight,
      commentWeight: configMap.get("comment_weight") ?? DEFAULT_ALGORITHM_CONFIG.commentWeight,
      saveWeight: configMap.get("save_weight") ?? DEFAULT_ALGORITHM_CONFIG.saveWeight,
      shareWeight: configMap.get("share_weight") ?? DEFAULT_ALGORITHM_CONFIG.shareWeight,
      timeDecayHalflife: configMap.get("time_decay_halflife") ?? DEFAULT_ALGORITHM_CONFIG.timeDecayHalflife,
    };
  } catch {
    return { ...DEFAULT_ALGORITHM_CONFIG };
  }
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
