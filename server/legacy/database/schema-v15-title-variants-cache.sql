-- ============================================================
-- Schema V15: 可复用标题变体（title variants）缓存表
-- 版本: 2026-04-29
-- ============================================================
-- 用于：
--   1. 缓存 server/services/title-variants-generator.ts 的 LLM 标题变体生成结果
--   2. 同一 featured 视频被反复点击时复用缓存，避免重复 LLM 调用
--   3. 命中条件：cache_key 匹配 且 created_at + ttl_seconds > NOW()
--
-- 设计要点：
--   - cache_key 用 featured.id（同 LowFollowerItem.id），跨平台唯一
--   - payload 存 { variants: TitleVariant[], originalTitle, modelId } JSON
--   - TTL 默认 7 天，与 viral_breakdown_cache 一致
-- ============================================================

CREATE TABLE IF NOT EXISTS title_variants_cache (
  cache_key       VARCHAR(255)  NOT NULL PRIMARY KEY COMMENT 'featured.id（LowFollowerItem.id）',
  platform        VARCHAR(32)   NULL COMMENT '平台标识，便于按平台清理',
  payload         JSON          NOT NULL COMMENT '{ variants, originalTitle, modelId }',
  ttl_seconds     INT           NOT NULL DEFAULT 604800 COMMENT '过期时长（秒），默认 7 天',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_platform (platform),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='可复用标题变体 LLM 生成结果缓存，按 featured.id 复用';
