/**
 * video-stats-collector.ts
 *
 * 视频级时间序列采集器 — 每天 2 次（06:00 / 18:00），对 top N 候选视频
 * 拉取 TikHub 实时 stats 落到 video_stats_history 表。
 *
 * 设计逻辑：
 *   - 时间点：创作者两个决策窗前各采一次，让用户在思考"今天/明天发什么"时
 *     就能看到"过去 12 小时该选题的播放增量"
 *   - 候选来源（第一阶段）：低粉爆款样本库（low_follower_samples）近 7 天的
 *     top N 高分作品；不直接用 native 热榜返回的 video_id（hot_rise_list 给
 *     的是话题不是视频，要再调一次接口拿视频列表，第二阶段做）
 *   - 失败容忍：单条失败不影响整批；TikHub 余额不足时直接退出（避免烧
 *     402 冷却额度）
 *   - 限流：每条间隔 500ms（与 performance-tracker.ts 一致）
 *
 * 成本估算（单平台 50 条 × 2 次/天 × 3 平台）：
 *   = 300 次/天 × $0.01 = $3/天 ≈ ¥21/天 ≈ ¥630/月
 *   比每小时采贵 12 倍的方案省 12 倍
 */

import { execute, query } from "../legacy/database";
import type { RowDataPacket } from "../legacy/database";
import { createModuleLogger } from "../legacy/logger.js";
import { isBalanceInsufficient } from "../legacy/tikhub";
import { fetchVideoStats } from "../legacy/performance-tracker";

const log = createModuleLogger("VideoStatsCollector");

/** 单平台单次采集的候选条数上限（控制成本） */
const PER_PLATFORM_LIMIT = 50;

/** 每条采集间隔（ms），避免 TikHub 限流 */
const PER_REQUEST_DELAY_MS = 500;

/** 候选作品来源类型 */
type CandidateSource = "low_follower_top" | "native_hot_topic" | "manual";

interface Candidate {
  platform: string;
  videoId: string;
  source: CandidateSource;
}

/**
 * 从 low_follower_samples 表挑选近 7 天 top N 的爆款作品作为采集候选。
 *
 * 注意：仅返回有 video_id 的非脏样本（粉丝数 > 0、video_id 非空）。
 * 多平台分别取 top N，三平台合并后总数最多 PER_PLATFORM_LIMIT × 3。
 */
async function selectCandidatesFromLowFollower(
  platforms: string[],
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const platform of platforms) {
    const rows = await query<RowDataPacket[]>(
      `SELECT video_id
       FROM low_follower_samples
       WHERE platform_id = ?
         AND author_followers > 0
         AND video_id IS NOT NULL
         AND video_id <> ''
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY viral_score DESC
       LIMIT ?`,
      [platform, PER_PLATFORM_LIMIT],
    );
    for (const row of rows as Array<{ video_id?: unknown }>) {
      const vid = String(row.video_id ?? "").trim();
      if (vid) {
        out.push({ platform, videoId: vid, source: "low_follower_top" });
      }
    }
  }
  return out;
}

/**
 * 执行一次完整的视频级时间序列采集。
 * 由 monitor-scheduler.ts cron（06:00 / 18:00）调用。
 */
export async function runVideoStatsCollection(): Promise<{
  scanned: number;
  collected: number;
  errors: number;
  skippedByBalance: boolean;
}> {
  const startedAt = Date.now();
  let scanned = 0;
  let collected = 0;
  let errors = 0;

  // 三平台都采。如果未来要单平台跑，把 platforms 改成参数即可。
  const platforms = ["douyin", "xiaohongshu", "kuaishou"];

  // TikHub 余额不足时直接退出，避免烧 402 冷却额度
  if (isBalanceInsufficient()) {
    log.warn("TikHub 余额不足冷却中，跳过本次采集");
    return { scanned: 0, collected: 0, errors: 0, skippedByBalance: true };
  }

  let candidates: Candidate[] = [];
  try {
    candidates = await selectCandidatesFromLowFollower(platforms);
  } catch (err) {
    log.error({ err }, "选取候选失败");
    return { scanned: 0, collected: 0, errors: 1, skippedByBalance: false };
  }

  log.info({ candidateCount: candidates.length, platforms }, "开始视频时序采集");

  for (const cand of candidates) {
    scanned++;
    // 每轮再次检查余额，避免一波 402 后继续烧
    if (isBalanceInsufficient()) {
      log.warn({ scanned }, "中途检测到 TikHub 余额不足，提前结束");
      break;
    }
    try {
      const stats = await fetchVideoStats(cand.platform, cand.videoId);
      if (!stats) {
        errors++;
        continue;
      }
      await execute(
        `INSERT INTO video_stats_history
          (platform, video_id, view_count, like_count, comment_count, share_count, collect_count, sampled_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          cand.platform,
          cand.videoId,
          stats.viewCount,
          stats.likeCount,
          stats.commentCount,
          stats.shareCount,
          stats.collectCount,
          cand.source,
        ],
      );
      collected++;
    } catch (err) {
      errors++;
      log.warn(
        { err, platform: cand.platform, videoId: cand.videoId },
        "单条采集失败，跳过",
      );
    }
    // 限流
    await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS));
  }

  const elapsedMs = Date.now() - startedAt;
  log.info(
    { scanned, collected, errors, elapsedMs },
    "视频时序采集完成",
  );
  return { scanned, collected, errors, skippedByBalance: false };
}

/**
 * 清理 N 天前的 video_stats_history 数据，避免无限增长。
 * 默认保留 30 天（足够算 12h 增量；旧数据无业务价值）。
 *
 * 由 monitor-scheduler.ts cron 每周日凌晨 03:00 调用。
 */
export async function cleanupOldVideoStatsHistory(
  retentionDays = 30,
): Promise<{ deletedRows: number }> {
  const startedAt = Date.now();
  const result = await execute(
    `DELETE FROM video_stats_history WHERE sampled_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [retentionDays],
  );
  const deletedRows = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
  log.info(
    { deletedRows, retentionDays, elapsedMs: Date.now() - startedAt },
    "video_stats_history 旧数据清理完成",
  );
  return { deletedRows };
}
