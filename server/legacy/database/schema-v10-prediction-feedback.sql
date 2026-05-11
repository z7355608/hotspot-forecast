-- ============================================================
-- Schema V10: 预测质量反馈表
-- 版本: 2026-04-28
-- ============================================================
-- 用于：
--   1. 用户/客服对单次预测结果的"好/差"打分
--   2. bad case 回流：标记为 bad 的样本进入 prompt 优化输入源
--   3. 与 skill_execution_logs.session_id / artifact_id 关联，
--      实现"预测质量 → 具体技能 → 具体 prompt 模板"的全链路追溯
-- ============================================================

CREATE TABLE IF NOT EXISTS prediction_feedback (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- 关联键（任一非空）
  session_id      VARCHAR(128)  NULL COMMENT '关联 skill_execution_logs.session_id',
  artifact_id     VARCHAR(128)  NULL COMMENT '关联 artifact / 单次预测产出',

  -- 反馈来源
  source          VARCHAR(16)   NOT NULL DEFAULT 'admin' COMMENT 'user|admin|cs',
  reporter_id     VARCHAR(64)   NULL COMMENT '反馈者 user_id 或 admin_phone',

  -- 反馈内容
  rating          VARCHAR(8)    NOT NULL COMMENT 'good|bad',
  note            TEXT          NULL COMMENT '具体问题描述 / 备注',

  -- 关联到 prompt 模板（便于回流到 prompt 优化）
  prompt_template_id VARCHAR(64) NULL COMMENT '若已知问题出在哪个模板，记录此字段',

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_session   (session_id),
  INDEX idx_artifact  (artifact_id),
  INDEX idx_rating    (rating, created_at),
  INDEX idx_template  (prompt_template_id, rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='预测质量反馈表，bad case 回流入口';
