-- ============================================================
-- AI爆款预测 - 模块四：低粉爆款样本库 (V2 - 列名与代码对齐)
-- 新增/替换表：
--   low_follower_samples         — 低粉爆款样本持久化
--   low_follower_detection_runs  — 每次检测任务记录
--   low_follower_advice          — 个性化建议记录
--   low_follower_score_history   — 评分历史记录（新增）
--   low_follower_thresholds      — 动态阈值配置（新增）
-- MySQL 8.0 (兼容 5.7 语法)
-- Updated: 2026-04-01
-- ============================================================

-- 先 DROP 旧的列名不匹配的表（如果存在）
DROP TABLE IF EXISTS low_follower_samples;
DROP TABLE IF EXISTS low_follower_detection_runs;
DROP TABLE IF EXISTS low_follower_advice;
DROP TABLE IF EXISTS low_follower_score_history;
DROP TABLE IF EXISTS low_follower_thresholds;

-- ------------------------------------------------------------
-- low_follower_samples — 低粉爆款样本库
-- 列名与 persistSample / tRPC 路由 / daily-refresh / tagger 代码一致
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_samples (
  id                          VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '样本ID（lf_{contentId}）',
  run_id                      VARCHAR(128)  NULL COMMENT '关联的检测任务ID',
  platform_id                 VARCHAR(32)   NOT NULL DEFAULT 'douyin' COMMENT '平台（douyin/xiaohongshu/kuaishou）',
  author_id                   VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '作者ID',
  author_nickname             VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '作者名称',
  author_avatar               VARCHAR(1024) NULL COMMENT '作者头像URL',
  author_followers             INT           NOT NULL DEFAULT 0 COMMENT '粉丝量',
  video_id                    VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '内容原始ID',
  video_title                 TEXT          NULL COMMENT '内容标题',
  video_description           TEXT          NULL COMMENT '内容描述',
  video_cover                 VARCHAR(1024) NULL COMMENT '封面URL',
  video_url                   VARCHAR(1024) NULL COMMENT '内容URL',
  video_duration              INT           NULL DEFAULT 0 COMMENT '视频时长（秒）',
  video_published_at          DATETIME      NULL COMMENT '内容发布时间',
  video_views                 BIGINT        NOT NULL DEFAULT 0 COMMENT '播放量/阅读量',
  video_likes                 INT           NOT NULL DEFAULT 0 COMMENT '点赞数',
  video_comments              INT           NOT NULL DEFAULT 0 COMMENT '评论数',
  video_shares                INT           NOT NULL DEFAULT 0 COMMENT '分享数',
  video_collects              INT           NOT NULL DEFAULT 0 COMMENT '收藏数',
  follower_view_ratio         DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '粉播比',
  engagement_rate             DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT '互动率',
  weighted_interaction        DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '加权互动量',
  fan_efficiency_ratio        DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '粉丝效率比',
  viral_score                 TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '爆款评分（0-100）',
  viral_score_trend           ENUM('new','rising','stable','declining','expired') NOT NULL DEFAULT 'new' COMMENT '评分趋势',
  is_strict_hit               TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否严格命中（1=是）',
  content_form                VARCHAR(32)   NULL COMMENT '内容形式（竖屏视频/横屏视频/图文等）',
  track_tags                  JSON          NULL COMMENT '赛道标签数组',
  burst_reasons               JSON          NULL COMMENT '爆款原因标签数组',
  newbie_friendly             TINYINT UNSIGNED NULL DEFAULT 50 COMMENT '新手友好度（0-100）',
  suggestion                  TEXT          NULL COMMENT '一句话复制建议',
  hashtags                    JSON          NULL COMMENT '关键词标签数组',
  music_title                 VARCHAR(255)  NULL COMMENT '背景音乐标题',
  seed_topic                  VARCHAR(255)  NULL COMMENT '触发检测的种子话题',
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  last_refreshed_at           DATETIME      NULL COMMENT '最后刷新时间',
  score_updated_at            DATETIME      NULL COMMENT '评分更新时间',
  KEY idx_platform (platform_id),
  KEY idx_author (author_id),
  KEY idx_video (video_id),
  KEY idx_is_strict (is_strict_hit),
  KEY idx_viral_score (viral_score DESC),
  KEY idx_seed_topic (seed_topic(100)),
  KEY idx_created_at (created_at),
  KEY idx_run_id (run_id),
  KEY idx_trend (viral_score_trend),
  KEY idx_content_form (content_form)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款样本库 — 通过算法判定的低粉高播内容';

-- ------------------------------------------------------------
-- low_follower_detection_runs — 检测任务记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_detection_runs (
  run_id                      VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '检测任务ID',
  seed_topic                  VARCHAR(255)  NOT NULL COMMENT '种子话题',
  industry_name               VARCHAR(255)  NULL COMMENT '赛道名称',
  platforms                   JSON          NOT NULL COMMENT '检测平台列表',
  follower_ceiling            INT           NOT NULL DEFAULT 10000 COMMENT '粉丝上限阈值',
  min_view_count              INT           NOT NULL DEFAULT 0 COMMENT '最低播放量阈值',
  benchmark_percentile        DECIMAL(4,2)  NOT NULL DEFAULT 0.75 COMMENT 'P75分位数',
  recency_days                INT           NOT NULL DEFAULT 30 COMMENT '时效天数',
  total_content_count         INT           NOT NULL DEFAULT 0 COMMENT '总内容样本数',
  anomaly_hit_count           INT           NOT NULL DEFAULT 0 COMMENT '严格命中数',
  low_follower_anomaly_ratio  DECIMAL(6,2)  NOT NULL DEFAULT 0 COMMENT '低粉爆款比例（0-100）',
  p75_benchmark               INT           NOT NULL DEFAULT 0 COMMENT 'P75互动量基准',
  dynamic_follower_floor      INT           NOT NULL DEFAULT 0 COMMENT '动态粉丝地板',
  sample_count_persisted      INT           NOT NULL DEFAULT 0 COMMENT '持久化样本数',
  status                      ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  error_message               TEXT          NULL COMMENT '失败时的错误信息',
  compute_note                TEXT          NULL COMMENT '算法计算说明',
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at                DATETIME      NULL,
  KEY idx_seed_topic (seed_topic(100)),
  KEY idx_status (status),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款检测任务记录';

-- ------------------------------------------------------------
-- low_follower_advice — 个性化建议记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_advice (
  id                          VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '建议记录ID',
  detection_run_id            VARCHAR(128)  NOT NULL COMMENT '关联检测任务ID',
  user_id                     VARCHAR(64)   NULL COMMENT '用户ID',
  seed_topic                  VARCHAR(255)  NOT NULL COMMENT '种子话题',
  user_platform               VARCHAR(32)   NULL COMMENT '用户所在平台',
  user_follower_count         INT           NULL COMMENT '用户粉丝量',
  user_industry               VARCHAR(255)  NULL COMMENT '用户所在赛道',
  user_content_style          VARCHAR(255)  NULL COMMENT '用户内容风格',
  advice_json                 JSON          NOT NULL COMMENT '完整建议结构（JSON）',
  core_strategy               TEXT          NULL COMMENT '核心策略摘要',
  generation_method           ENUM('llm', 'rule') NOT NULL DEFAULT 'llm',
  model_used                  VARCHAR(64)   NULL COMMENT '使用的LLM模型',
  tokens_used                 INT           NULL COMMENT '消耗的Token数',
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_run_id (detection_run_id),
  KEY idx_user_id (user_id),
  KEY idx_seed_topic (seed_topic(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款个性化建议记录';

-- ------------------------------------------------------------
-- low_follower_score_history — 评分历史记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_score_history (
  id                          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sample_id                   VARCHAR(128)  NOT NULL COMMENT '关联样本ID',
  viral_score                 TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '爆款评分',
  video_likes                 INT           NOT NULL DEFAULT 0 COMMENT '点赞数',
  video_comments              INT           NOT NULL DEFAULT 0 COMMENT '评论数',
  video_shares                INT           NOT NULL DEFAULT 0 COMMENT '分享数',
  video_collects              INT           NOT NULL DEFAULT 0 COMMENT '收藏数',
  weighted_interaction        DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '加权互动量',
  fan_efficiency_ratio        DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '粉丝效率比',
  recorded_at                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  KEY idx_sample_id (sample_id),
  KEY idx_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款评分历史';

-- ------------------------------------------------------------
-- low_follower_thresholds — 动态阈值配置
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_thresholds (
  id                          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  threshold_key               VARCHAR(64)   NOT NULL UNIQUE COMMENT '阈值键名',
  threshold_value             DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '阈值数值',
  description                 VARCHAR(255)  NULL COMMENT '阈值说明',
  auto_optimized              TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否自动优化',
  last_optimized_at           DATETIME      NULL COMMENT '最后优化时间',
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款动态阈值配置';

INSERT IGNORE INTO low_follower_thresholds (threshold_key, threshold_value, description) VALUES
  ('follower_ceiling', 50000, '粉丝上限阈值'),
  ('min_viral_score', 40, '最低爆款评分'),
  ('benchmark_percentile', 0.75, 'P75互动量分位数'),
  ('recency_days', 30, '时效天数'),
  ('strict_hit_weight', 1.5, '严格命中权重系数');
