-- ============================================================
-- Schema V12: 视频级时间序列采样表（"作品级飙升信号"）
-- 版本: 2026-04-29
-- ============================================================
-- 用于：
--   1. 对热榜 / 低粉爆款库 top N 视频每天采集 2 次播放量等指标
--   2. 算出"过去 12h 该视频的播放量增量"作为真上升信号，
--      替代当前基于"样本库聚合"的伪上升信号
--
-- 数据流：
--   monitor-scheduler.ts cron 06:00 / 18:00
--     → services/video-stats-collector.ts:runVideoStatsCollection()
--     → 选 candidates（默认从 low_follower_samples 近 7 天 top 50）
--     → fetchVideoStats(platform, video_id)（复用 performance-tracker.ts）
--     → INSERT 一行
--
-- 设计要点：
--   - 同一 video_id 每次采集都新增一行（时间序列），不覆盖
--   - source 字段标识候选来源，方便以后混合多种来源（hot list / 用户已发布 等）
--   - (platform, video_id, sampled_at) 联合索引：查询 "过去 N 小时这条视频涨了多少"
--     的典型 SQL 是 SELECT MAX/MIN view_count 在时间窗内，命中索引
--   - 为避免无限增长，建议运维侧定期清理 30 天前的数据（cron 单独清理任务）
-- ============================================================

CREATE TABLE IF NOT EXISTS video_stats_history (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform        VARCHAR(32)   NOT NULL COMMENT 'douyin / xiaohongshu / kuaishou',
  video_id        VARCHAR(128)  NOT NULL COMMENT '平台原始 id（aweme_id / note_id / photo_id）',

  -- 采集到的快照指标（来自 fetchVideoStats）
  view_count      BIGINT        NOT NULL DEFAULT 0,
  like_count      BIGINT        NOT NULL DEFAULT 0,
  comment_count   BIGINT        NOT NULL DEFAULT 0,
  share_count     BIGINT        NOT NULL DEFAULT 0,
  collect_count   BIGINT        NOT NULL DEFAULT 0,

  -- 元数据
  sampled_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '本次采集发生时间',
  source          VARCHAR(32)   NOT NULL DEFAULT 'low_follower_top'
                  COMMENT '候选来源：low_follower_top / native_hot_topic / manual',

  -- 联合索引：一条视频按时间序列查询命中
  INDEX idx_platform_video_time (platform, video_id, sampled_at),
  -- 时间索引：清理任务用
  INDEX idx_sampled (sampled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='视频级时间序列采样：每天 2 次（06:00/18:00），算 12h 播放量增量';
