-- ============================================================
-- Schema V11: 爆款拆解结果缓存表
-- 版本: 2026-04-28
-- ============================================================
-- 用于：
--   1. 缓存 copywriting.viralBreakdownDirect 的 LLM 拆解结果
--   2. 同一作品被反复点击时复用缓存，避免重复 LLM 调用
--   3. 命中条件：cache_key 匹配 且 created_at + ttl_seconds > NOW()
--
-- 设计要点：
--   - cache_key 采用 "{platform}:{videoId}" 复合形式；videoId 缺失
--     时 fallback 用 videoUrl 的稳定 hash（在应用层计算）
--   - payload 直接存储完整 breakdown JSON（含 meta_strategy + shot_list）
--   - TTL 默认 7 天（604800 秒），单条可覆盖
-- ============================================================

CREATE TABLE IF NOT EXISTS viral_breakdown_cache (
  cache_key       VARCHAR(255)  NOT NULL PRIMARY KEY COMMENT '"{platform}:{videoId}" 或 url hash',
  platform        VARCHAR(32)   NULL COMMENT '平台标识，便于按平台清理',
  video_id        VARCHAR(128)  NULL COMMENT '原始 videoId（可空，仅 url 时为 null）',
  payload         JSON          NOT NULL COMMENT '完整 breakdown 结构 JSON',
  ttl_seconds     INT           NOT NULL DEFAULT 604800 COMMENT '过期时长（秒），默认 7 天',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_platform_video (platform, video_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='爆款拆解 LLM 结果缓存表，避免同一作品重复消耗 LLM 预算';
