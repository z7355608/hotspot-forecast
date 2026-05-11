-- ============================================================
-- AI 爆款预测 - 模块四 V6:低粉爆款 billboard 双管线 schema 扩展
-- ADR-0007: low_follower_samples + douyin_billboard_categories
-- 与 v5 的关系:本文件**只 ALTER 与 CREATE,绝不 DROP**,可对生产已有 116 条数据安全运行
-- 配合 server/scripts/apply-billboard-schema.ts 幂等执行
-- Updated: 2026-04-30
-- ============================================================

-- 1) low_follower_samples 加 4 列(由 apply 脚本检查 information_schema 后再 ALTER,不在此文件用 IF NOT EXISTS)
--    手工执行此 SQL 时需注意:重复 ALTER 同一列会报 1060 Duplicate column
ALTER TABLE low_follower_samples
  ADD COLUMN source ENUM('seed_topic','billboard') NOT NULL DEFAULT 'seed_topic'
    COMMENT 'ADR-0007 入库管线来源:seed_topic=用户输入种子词检索,billboard=抖音官方榜按行业拉';

ALTER TABLE low_follower_samples
  ADD COLUMN industry_top VARCHAR(64) NULL
    COMMENT 'billboard 顶级类目名(如:数码科技);仅 source=billboard 时填';

ALTER TABLE low_follower_samples
  ADD COLUMN industry_sub VARCHAR(64) NULL
    COMMENT 'billboard 子级类目(LLM 预检查精化);仅 source=billboard 时填';

ALTER TABLE low_follower_samples
  ADD COLUMN prefilter_reason TEXT NULL
    COMMENT 'LLM 预检查理由(为什么判定 is_target_audience=true/false);仅 source=billboard 时填';

ALTER TABLE low_follower_samples
  ADD KEY idx_source (source);

-- 2) douyin_billboard_categories — 抖音类目树缓存
--    数据来源:fetch_hot_category_list,每天 pipeline 跑前 refresh
CREATE TABLE IF NOT EXISTS douyin_billboard_categories (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  top_id        VARCHAR(64)  NOT NULL COMMENT '顶级类目 ID(billboard tags.value)',
  top_name      VARCHAR(128) NOT NULL COMMENT '顶级类目名',
  sub_id        VARCHAR(64)  NULL COMMENT '子级类目 ID(billboard tags.children.value);NULL 表示该 row 是顶级',
  sub_name      VARCHAR(128) NULL COMMENT '子级类目名',
  synced_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后同步时间',
  UNIQUE KEY uniq_top_sub (top_id, sub_id),
  KEY idx_synced (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ADR-0007 抖音 billboard 类目树缓存 — 每天 refresh';
