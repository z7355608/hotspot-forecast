-- ============================================================
-- AI爆款预测 - 模块四：低粉爆款样本库
-- 新增表：
--   low_follower_samples       — 低粉爆款样本持久化
--   low_follower_detection_runs — 每次检测任务记录
-- MySQL 8.0 (兼容 5.7 语法)
-- Created: 2026-03-27
-- ============================================================
USE hotspot_forecast;

-- ------------------------------------------------------------
-- low_follower_samples — 低粉爆款样本库
-- 每条记录对应一个通过算法判定的低粉爆款内容
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_samples (
  id                          VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '样本ID（lf_{contentId}）',
  content_id                  VARCHAR(128)  NOT NULL COMMENT '内容原始ID（TikHub返回）',
  author_id                   VARCHAR(128)  NOT NULL COMMENT '作者ID',
  author_name                 VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '作者名称',
  title                       TEXT          NOT NULL COMMENT '内容标题',
  platform                    VARCHAR(32)   NOT NULL COMMENT '平台（douyin/xiaohongshu/kuaishou/bilibili）',

  -- 核心指标
  follower_count              INT           NOT NULL DEFAULT 0 COMMENT '粉丝量',
  view_count                  BIGINT        NOT NULL DEFAULT 0 COMMENT '播放量/阅读量',
  like_count                  INT           NOT NULL DEFAULT 0 COMMENT '点赞数',
  comment_count               INT           NOT NULL DEFAULT 0 COMMENT '评论数',
  share_count                 INT           NOT NULL DEFAULT 0 COMMENT '分享数',
  save_count                  INT           NOT NULL DEFAULT 0 COMMENT '收藏数（小红书）',
  interaction_count           INT           NOT NULL DEFAULT 0 COMMENT '互动总数（点赞+评论+分享+收藏）',

  -- 算法计算结果
  engagement_rate             DECIMAL(10,6) NOT NULL DEFAULT 0 COMMENT '互动率（互动数/播放量）',
  view_to_follower_ratio      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '粉播比（播放量/粉丝量）',
  engagement_benchmark_mult   DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '互动率超越P75基准的倍数',
  anomaly_score               TINYINT       NOT NULL DEFAULT 0 COMMENT '异常强度评分（0-100）',
  is_strict_anomaly           TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否满足严格三条件（1=是）',

  -- 检测上下文
  p75_benchmark               INT           NOT NULL DEFAULT 0 COMMENT '本次检测的P75互动量基准',
  dynamic_follower_floor      INT           NOT NULL DEFAULT 0 COMMENT '本次检测的动态粉丝地板（P30）',
  detection_run_id            VARCHAR(128)  NULL COMMENT '关联的检测任务ID',
  seed_topic                  VARCHAR(255)  NULL COMMENT '触发检测的种子话题',
  industry_name               VARCHAR(255)  NULL COMMENT '所属赛道名称',

  -- 内容元数据
  tags                        JSON          NULL COMMENT '关键词标签数组',
  content_url                 VARCHAR(1024) NULL COMMENT '内容URL',
  cover_url                   VARCHAR(1024) NULL COMMENT '封面URL',
  published_at                DATETIME      NULL COMMENT '内容发布时间',
  detected_at                 DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '检测时间',
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 索引
  KEY idx_platform (platform),
  KEY idx_author (author_id),
  KEY idx_content (content_id),
  KEY idx_is_strict (is_strict_anomaly),
  KEY idx_anomaly_score (anomaly_score DESC),
  KEY idx_seed_topic (seed_topic(100)),
  KEY idx_industry (industry_name(100)),
  KEY idx_detected_at (detected_at),
  KEY idx_run_id (detection_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='低粉爆款样本库 — 通过严格三条件算法判定的低粉高播内容';

-- ------------------------------------------------------------
-- low_follower_detection_runs — 检测任务记录
-- 每次调用低粉爆款算法的元数据记录
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_detection_runs (
  run_id                      VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '检测任务ID',
  seed_topic                  VARCHAR(255)  NOT NULL COMMENT '种子话题',
  industry_name               VARCHAR(255)  NULL COMMENT '赛道名称',
  platforms                   JSON          NOT NULL COMMENT '检测平台列表',

  -- 算法配置快照
  follower_ceiling            INT           NOT NULL DEFAULT 10000 COMMENT '粉丝上限阈值',
  min_view_count              INT           NOT NULL DEFAULT 100000 COMMENT '最低播放量阈值',
  benchmark_percentile        DECIMAL(4,2)  NOT NULL DEFAULT 0.75 COMMENT 'P75分位数',
  recency_days                INT           NOT NULL DEFAULT 30 COMMENT '时效天数',

  -- 计算结果摘要
  total_content_count         INT           NOT NULL DEFAULT 0 COMMENT '总内容样本数',
  anomaly_hit_count           INT           NOT NULL DEFAULT 0 COMMENT '严格命中数',
  low_follower_anomaly_ratio  DECIMAL(6,2)  NOT NULL DEFAULT 0 COMMENT '低粉爆款比例（0-100）',
  p75_benchmark               INT           NOT NULL DEFAULT 0 COMMENT 'P75互动量基准',
  dynamic_follower_floor      INT           NOT NULL DEFAULT 0 COMMENT '动态粉丝地板',
  sample_count_persisted      INT           NOT NULL DEFAULT 0 COMMENT '持久化样本数',

  -- 状态
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
-- 个性化建议记录表 (low_follower_advice)
-- 存储 LLM 基于低粉样本生成的个性化建议
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS low_follower_advice (
  id                          VARCHAR(128)  NOT NULL PRIMARY KEY COMMENT '建议记录ID',
  detection_run_id            VARCHAR(128)  NOT NULL COMMENT '关联检测任务ID',
  user_id                     VARCHAR(64)   NULL COMMENT '用户ID（可选，支持匿名）',
  seed_topic                  VARCHAR(255)  NOT NULL COMMENT '种子话题',

  -- 用户上下文
  user_platform               VARCHAR(32)   NULL COMMENT '用户所在平台',
  user_follower_count         INT           NULL COMMENT '用户粉丝量',
  user_industry               VARCHAR(255)  NULL COMMENT '用户所在赛道',
  user_content_style          VARCHAR(255)  NULL COMMENT '用户内容风格',

  -- LLM 生成结果
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
