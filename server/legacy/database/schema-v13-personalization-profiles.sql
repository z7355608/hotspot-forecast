-- ============================================================
-- Schema V13: 创作者个性化画像表
-- 版本: 2026-04-29
-- ============================================================
-- 用于 server/routers/personalization.ts:
--   - getProfile (SELECT)
--   - analyze (INSERT ... ON DUPLICATE KEY UPDATE)
--   - confirmProfile (UPDATE user_edited_*)
--
-- 字段全部来自 router 代码引用,不多不少。
-- (user_id, platform_id) 是逻辑唯一键,ON DUPLICATE KEY UPDATE 依赖它。
-- ============================================================

CREATE TABLE IF NOT EXISTS creator_personalization_profiles (
  id                       BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id                  VARCHAR(64)  NOT NULL,
  platform_id              VARCHAR(32)  NOT NULL,

  -- LLM 推断的画像(analyze 写)
  suggested_niche          VARCHAR(128) NULL,
  suggested_style_tags     JSON         NULL,
  suggested_instructions   TEXT         NULL,
  confidence               VARCHAR(16)  NULL DEFAULT 'medium',

  -- 用户确认/编辑(confirmProfile 写)
  user_confirmed           TINYINT(1)   NOT NULL DEFAULT 0,
  user_edited_niche        VARCHAR(128) NULL,
  user_edited_style_tags   JSON         NULL,
  user_edited_instructions TEXT         NULL,

  -- analyze 元数据
  model_used               VARCHAR(64)  NULL,
  tokens_used              INT          NULL,
  analysis_duration_ms     INT          NULL,
  input_works_count        INT          NOT NULL DEFAULT 0,
  input_followers          INT          NOT NULL DEFAULT 0,
  input_hash               VARCHAR(64)  NULL,

  created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_user_platform (user_id, platform_id),
  KEY idx_user (user_id)
);
