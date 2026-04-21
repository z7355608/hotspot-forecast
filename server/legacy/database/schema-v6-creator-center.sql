-- ═══════════════════════════════════════════════════════════════
-- schema-v6-creator-center.sql
-- 模块五：创作中心与账号诊断数据库表
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. 账号概览快照表（每次同步写入一条）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_account_snapshots (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL COMMENT '系统用户ID',
  platform_id   VARCHAR(32)  NOT NULL COMMENT '平台ID (douyin/xiaohongshu/bilibili等)',
  handle        VARCHAR(128) COMMENT '账号handle/@xxx',
  platform_uid  VARCHAR(128) COMMENT '平台用户ID (uid/sec_user_id)',
  nickname      VARCHAR(256) COMMENT '昵称',
  avatar_url    TEXT         COMMENT '头像URL',
  -- 通用指标
  followers     BIGINT       DEFAULT 0 COMMENT '粉丝数',
  following     BIGINT       DEFAULT 0 COMMENT '关注数',
  total_works   INT          DEFAULT 0 COMMENT '作品总数',
  avg_engagement_rate DECIMAL(6,3) DEFAULT 0 COMMENT '平均互动率(%)',
  -- 视频平台指标
  total_views   BIGINT       DEFAULT 0,
  total_likes   BIGINT       DEFAULT 0,
  total_comments BIGINT      DEFAULT 0,
  total_shares  BIGINT       DEFAULT 0,
  total_collects BIGINT      DEFAULT 0,
  total_coins   BIGINT       DEFAULT 0,
  total_favorites BIGINT     DEFAULT 0,
  total_reposts BIGINT       DEFAULT 0,
  total_reads   BIGINT       DEFAULT 0,
  total_voteups BIGINT       DEFAULT 0,
  -- 同步元数据
  sync_source   VARCHAR(32)  DEFAULT 'tikhub' COMMENT '数据来源',
  synced_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_payload   JSON         COMMENT '原始 API 响应（用于调试）',
  INDEX idx_user_platform (user_id, platform_id),
  INDEX idx_synced_at (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号概览快照';

-- ─────────────────────────────────────────────
-- 2. 作品列表表（近 30 天作品，每次同步覆盖）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_works (
  id              VARCHAR(128) NOT NULL COMMENT '作品ID (aweme_id/note_id等)',
  user_id         VARCHAR(64)  NOT NULL,
  platform_id     VARCHAR(32)  NOT NULL,
  title           TEXT         COMMENT '标题/描述',
  cover_url       TEXT         COMMENT '封面URL',
  content_url     TEXT         COMMENT '内容链接',
  work_type       VARCHAR(16)  DEFAULT 'video' COMMENT 'video/note/article',
  published_at    DATETIME     COMMENT '发布时间',
  -- 互动指标
  views           BIGINT       DEFAULT 0,
  likes           BIGINT       DEFAULT 0,
  comments        BIGINT       DEFAULT 0,
  shares          BIGINT       DEFAULT 0,
  collects        BIGINT       DEFAULT 0,
  coins           BIGINT       DEFAULT 0,
  favorites       BIGINT       DEFAULT 0,
  reposts         BIGINT       DEFAULT 0,
  read_count      BIGINT       DEFAULT 0,
  voteup_count    BIGINT       DEFAULT 0,
  -- 视频专属
  duration_sec    INT          COMMENT '时长(秒)',
  completion_rate DECIMAL(5,2) COMMENT '完播率(%)',
  avg_watch_sec   INT          COMMENT '平均观看时长(秒)',
  -- 标签
  tags            JSON         COMMENT '话题标签数组',
  is_hot          TINYINT(1)   DEFAULT 0,
  -- 流量来源（仅抖音等支持）
  traffic_sources JSON         COMMENT '[{source, percentage}]',
  -- 受众（仅部分平台支持）
  audience_gender JSON         COMMENT '{male, female}',
  audience_age    JSON         COMMENT '[{range, percentage}]',
  -- 同步元数据
  synced_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, platform_id),
  INDEX idx_user_platform_pub (user_id, platform_id, published_at),
  INDEX idx_synced_at (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创作者作品列表';

-- ─────────────────────────────────────────────
-- 3. 粉丝画像表（每次同步覆盖）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_fan_profiles (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL,
  platform_id   VARCHAR(32)  NOT NULL,
  -- 性别分布
  gender_male_pct   DECIMAL(5,2) COMMENT '男性占比(%)',
  gender_female_pct DECIMAL(5,2) COMMENT '女性占比(%)',
  -- 年龄分布（JSON数组）
  age_distribution  JSON COMMENT '[{range, percentage}]',
  -- 地域分布
  top_cities        JSON COMMENT '[{city, percentage}]',
  top_provinces     JSON COMMENT '[{province, percentage}]',
  -- 活跃时段
  active_hours      JSON COMMENT '[{hour, percentage}]',
  -- 兴趣标签
  interest_tags     JSON COMMENT '["标签1","标签2"]',
  -- 设备分布
  device_types      JSON COMMENT '[{device, percentage}]',
  -- 同步元数据
  data_source       VARCHAR(32) DEFAULT 'tikhub',
  synced_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_platform (user_id, platform_id),
  INDEX idx_synced_at (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='粉丝画像';

-- ─────────────────────────────────────────────
-- 4. 趋势数据表（每日一条，用于近 30 天折线图）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_daily_trends (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL,
  platform_id   VARCHAR(32)  NOT NULL,
  trend_date    DATE         NOT NULL COMMENT '日期',
  -- 当日增量指标
  new_followers INT          DEFAULT 0,
  new_views     BIGINT       DEFAULT 0,
  new_likes     BIGINT       DEFAULT 0,
  new_comments  BIGINT       DEFAULT 0,
  new_shares    BIGINT       DEFAULT 0,
  new_collects  BIGINT       DEFAULT 0,
  new_works     INT          DEFAULT 0,
  engagement_rate DECIMAL(6,3) DEFAULT 0,
  -- 累计指标（当日快照）
  total_followers BIGINT     DEFAULT 0,
  synced_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_platform_date (user_id, platform_id, trend_date),
  INDEX idx_user_platform (user_id, platform_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='创作者每日趋势数据';

-- ─────────────────────────────────────────────
-- 5. 账号诊断报告表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_diagnosis_reports (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '诊断报告ID',
  user_id         VARCHAR(64)  NOT NULL,
  platform_id     VARCHAR(32)  NOT NULL,
  -- 诊断结论
  health_score    INT          COMMENT '账号健康度(0-100)',
  health_level    VARCHAR(16)  COMMENT 'excellent/good/warning/critical',
  -- 互动率归因
  engagement_trend VARCHAR(16) COMMENT 'rising/stable/declining/volatile',
  engagement_analysis TEXT     COMMENT 'LLM生成的互动率归因分析',
  key_findings    JSON         COMMENT '[{type, title, description, severity, dataBasis}]',
  -- 账号打法建议
  strategy_continue JSON       COMMENT '继续做哪些 [{action, reason, priority}]',
  strategy_stop     JSON       COMMENT '停掉哪些 [{action, reason, risk}]',
  strategy_add      JSON       COMMENT '补充哪些 [{action, reason, expectedImpact}]',
  -- 执行路线图
  execution_roadmap JSON       COMMENT '[{week, focus, actions[]}]',
  -- 风险提示
  risk_warnings   JSON         COMMENT '[{type, description, mitigation}]',
  -- 元数据
  model_used      VARCHAR(64),
  tokens_used     INT,
  data_period_days INT         DEFAULT 30,
  generated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_platform (user_id, platform_id),
  INDEX idx_generated_at (generated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号诊断报告';
