-- ============================================================
-- AI 爆款预测 - 模块四 V7:低粉爆款管线 C(搜索)schema 扩展
-- ADR-0008: source ENUM 加 'search' 值
-- 与 v6 关系:本文件**只 MODIFY ENUM,不动现有数据**,可对生产已有 7 条 billboard 数据安全运行
-- 配合 server/scripts/apply-search-schema.ts 幂等执行
-- Updated: 2026-04-30
-- ============================================================

-- MySQL 不支持 ALTER ENUM 增量加值,只能 MODIFY 整列。
-- 重复运行幂等性由 apply 脚本检查 information_schema.COLUMNS.COLUMN_TYPE 实现。
ALTER TABLE low_follower_samples
  MODIFY COLUMN source ENUM('seed_topic','billboard','search') NOT NULL DEFAULT 'seed_topic'
    COMMENT 'ADR-0007/0008 入库管线来源:seed_topic=用户输入种子词检索,billboard=抖音官方榜按行业拉,search=按关键词矩阵搜索';
