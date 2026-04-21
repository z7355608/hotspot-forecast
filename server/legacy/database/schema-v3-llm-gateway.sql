-- ═══════════════════════════════════════════════════════════════
-- Schema V3 — LLM 网关扩展表
-- 创建时间：2026-03-27
-- 说明：为统一 LLM 网关新增使用日志表
-- ═══════════════════════════════════════════════════════════════

-- LLM 调用使用日志
-- 记录每次 LLM 调用的模型、任务类型、token 消耗和积分扣减
CREATE TABLE IF NOT EXISTS llm_usage_logs (
  id            CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  model_id      VARCHAR(20)  NOT NULL COMMENT 'doubao | gpt54 | claude46',
  task_label    VARCHAR(100) NOT NULL COMMENT '任务描述，如 爆款拆解-借鉴建议',
  base_cost     INT          NOT NULL DEFAULT 0 COMMENT '基础积分消耗（不含倍率）',
  charged_cost  INT          NOT NULL DEFAULT 0 COMMENT '实际扣减积分（含倍率）',
  prompt_tokens INT          NOT NULL DEFAULT 0,
  completion_tokens INT      NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id   (user_id),
  INDEX idx_model_id  (model_id),
  INDEX idx_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
