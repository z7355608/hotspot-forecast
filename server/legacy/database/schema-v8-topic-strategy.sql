-- ============================================================
-- Schema V8: Topic Strategy V2 — 选题策略 Pipeline 持久化
-- ============================================================
-- 存储选题策略会话、方向、验证结果、同行对标、跨行业迁移
-- 支持自循环验证和自进化能力

-- 1. 选题策略会话表（一次选题策略请求 = 一个 session）
CREATE TABLE IF NOT EXISTS topic_strategy_sessions (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  user_open_id    VARCHAR(64)   NOT NULL,
  -- 输入参数
  track           VARCHAR(128)  NOT NULL COMMENT '赛道/内容方向',
  account_stage   VARCHAR(32)   NOT NULL DEFAULT 'new' COMMENT '账号阶段: new/growing/mature',
  platforms       JSON          NOT NULL COMMENT '平台列表 ["douyin","xiaohongshu","kuaishou"]',
  user_prompt     TEXT          NULL COMMENT '用户自由输入的补充要求',
  -- 关联的已连接账号信息（快照）
  connected_accounts JSON      NULL COMMENT '已连接账号的快照信息',
  -- Pipeline 执行状态
  pipeline_status VARCHAR(32)   NOT NULL DEFAULT 'pending' COMMENT 'pending/collecting/generating/validating/evolving/completed/failed',
  pipeline_progress JSON        NULL COMMENT '各阶段耗时和状态 {stage1_ms, stage2_ms, ...}',
  total_duration_ms INT         NULL COMMENT 'Pipeline 总耗时(ms)',
  -- 搜索关键词（LLM 生成的）
  search_keywords JSON          NULL COMMENT '搜索关键词列表 [{keyword, source, platform}]',
  -- 原始采集数据摘要
  raw_data_summary JSON         NULL COMMENT '{totalContents, totalAccounts, totalHotSeeds, byPlatform: {...}}',
  -- 验证运行记录
  validation_runs JSON          NULL COMMENT '验证结果数组 [{directionId, score, breakdown, evolvedChildren}]',
  -- 最终结果快照（完整的前端 payload）
  result_snapshot LONGTEXT      NULL COMMENT '完整的 TopicStrategyV2Result JSON',
  -- 元数据
  artifact_id     VARCHAR(64)   NULL COMMENT '关联的 result artifact ID',
  entry_source    VARCHAR(32)   NOT NULL DEFAULT 'template' COMMENT 'template/cta/manual',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_openid (user_open_id),
  INDEX idx_track (track),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 选题方向表（一个 session 产生 3-5 个方向）
CREATE TABLE IF NOT EXISTS topic_strategy_directions (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  session_id      VARCHAR(64)   NOT NULL,
  -- 方向基本信息
  direction_name  VARCHAR(256)  NOT NULL COMMENT '方向名称',
  direction_logic TEXT          NOT NULL COMMENT '核心逻辑/为什么现在做',
  target_stage    VARCHAR(32)   NULL COMMENT '适合的账号阶段',
  test_plan       TEXT          NULL COMMENT '最小测试方案',
  -- 优先级矩阵
  traffic_potential   TINYINT   NULL COMMENT '流量潜力 1-5',
  production_cost     TINYINT   NULL COMMENT '制作难度 1-5',
  competition_level   TINYINT   NULL COMMENT '竞争强度 1-5',
  priority_rank       TINYINT   NULL COMMENT '综合优先级排名',
  -- 具体选题（每个方向 2-3 个可执行选题）
  executable_topics JSON        NULL COMMENT '[{title, angle, hookType, estimatedDuration}]',
  -- 验证结果
  validation_score    FLOAT     NULL COMMENT '验证分 0-100',
  validation_breakdown JSON     NULL COMMENT '{searchHitScore, lowFollowerScore, commentDemandScore, peerSuccessScore}',
  validation_status   VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending/validated/failed',
  validation_detail   JSON      NULL COMMENT '验证详情 {searchHits, lowFollowerCases, commentSignals, peerResults}',
  -- 自进化：子方向
  parent_direction_id VARCHAR(64) NULL COMMENT '父方向ID（递归生成时）',
  evolution_depth     TINYINT   NOT NULL DEFAULT 0 COMMENT '递归深度 0=原始, 1=子方向',
  -- 平台维度的验证数据
  platform_scores JSON          NULL COMMENT '{douyin: {score, details}, xiaohongshu: {...}, kuaishou: {...}}',
  sort_order      TINYINT       NOT NULL DEFAULT 0,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_parent_direction (parent_direction_id),
  INDEX idx_validation_score (validation_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 同行对标表（每个 session 的 top N 同行账号）
CREATE TABLE IF NOT EXISTS topic_strategy_peer_benchmarks (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  session_id      VARCHAR(64)   NOT NULL,
  -- 同行账号信息
  platform        VARCHAR(32)   NOT NULL COMMENT 'douyin/xiaohongshu/kuaishou',
  account_id      VARCHAR(128)  NOT NULL COMMENT '平台账号ID',
  display_name    VARCHAR(256)  NULL,
  handle          VARCHAR(128)  NULL,
  avatar_url      TEXT          NULL,
  follower_count  BIGINT        NULL,
  -- 最近作品摘要
  recent_works    JSON          NULL COMMENT '[{title, likeCount, viewCount, shareCount, publishedAt, contentUrl}]',
  avg_interaction_rate FLOAT    NULL COMMENT '近期作品平均互动率',
  -- 与用户的对比
  comparison_notes TEXT         NULL COMMENT 'LLM 生成的对比分析',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_platform_account (platform, account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 跨行业迁移灵感表
CREATE TABLE IF NOT EXISTS topic_strategy_cross_industry (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  session_id      VARCHAR(64)   NOT NULL,
  -- 来源信息
  source_industry VARCHAR(128)  NOT NULL COMMENT '来源行业/赛道',
  source_content_id VARCHAR(128) NULL COMMENT '来源内容ID',
  source_title    TEXT          NULL COMMENT '来源内容标题',
  source_platform VARCHAR(32)   NULL,
  -- 迁移分析
  transferable_elements JSON    NULL COMMENT '可迁移元素 [{element, reason, adaptationHint}]',
  migration_idea  TEXT          NULL COMMENT 'LLM 生成的迁移创意',
  confidence      FLOAT         NULL COMMENT '迁移可行性评分 0-1',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
