-- schema-v7-monitor.sql
-- 模块六：智能监控系统数据库表

-- ─────────────────────────────────────────────
-- 监控报告表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_reports (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id       VARCHAR(64)   NOT NULL UNIQUE COMMENT '报告唯一 ID',
  task_id         VARCHAR(64)   NOT NULL         COMMENT '关联的监控任务 ID',
  run_id          VARCHAR(64)   NOT NULL         COMMENT '关联的执行记录 ID',
  task_type       VARCHAR(32)   NOT NULL         COMMENT '任务类型：topic_watch/account_watch/content_watch/validation_watch',
  platform        VARCHAR(32)   NOT NULL         COMMENT '平台：douyin/xiaohongshu',
  title           VARCHAR(255)  NOT NULL         COMMENT '报告标题',
  markdown_content MEDIUMTEXT   NOT NULL         COMMENT 'Markdown 格式报告内容',
  signal_strength  VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '信号强度：strong/medium/weak/none',
  key_findings    JSON                           COMMENT '关键发现列表',
  generated_at    DATETIME      NOT NULL         COMMENT '生成时间',
  generation_method VARCHAR(32) NOT NULL DEFAULT 'llm' COMMENT '生成方式：llm/rule_fallback',
  llm_model       VARCHAR(64)                    COMMENT '使用的 LLM 模型',
  tokens_used     INT UNSIGNED                   COMMENT '消耗的 Token 数',
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_task_id         (task_id),
  INDEX idx_run_id          (run_id),
  INDEX idx_generated_at    (generated_at),
  INDEX idx_signal_strength (signal_strength)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能监控 AI 报告';

-- ─────────────────────────────────────────────
-- 监控任务快照对比记录表（增量对比结果缓存）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_diff_cache (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id             VARCHAR(64)  NOT NULL COMMENT '监控任务 ID',
  current_run_id      VARCHAR(64)  NOT NULL COMMENT '当前执行 ID',
  previous_run_id     VARCHAR(64)           COMMENT '上次执行 ID（首次为 NULL）',
  is_first_run        TINYINT(1)   NOT NULL DEFAULT 0,
  signal_strength     VARCHAR(16)  NOT NULL DEFAULT 'none',
  new_hot_content_count   INT UNSIGNED NOT NULL DEFAULT 0,
  surging_topic_count     INT UNSIGNED NOT NULL DEFAULT 0,
  new_hot_search_count    INT UNSIGNED NOT NULL DEFAULT 0,
  low_follower_anomaly_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_like_count      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  avg_engagement_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  key_findings        JSON,
  diff_data           JSON         COMMENT '完整 DiffResult JSON',
  computed_at         DATETIME     NOT NULL,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_run (task_id, current_run_id),
  INDEX idx_task_id    (task_id),
  INDEX idx_computed   (computed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='增量对比结果缓存';

-- ─────────────────────────────────────────────
-- 监控调度器状态表（记录调度器运行状态）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_scheduler_logs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type      VARCHAR(32)  NOT NULL COMMENT '事件类型：scan/enqueue/execute/complete/fail/retry',
  task_id         VARCHAR(64)           COMMENT '关联任务 ID（可为空）',
  run_id          VARCHAR(64)           COMMENT '关联执行 ID（可为空）',
  message         VARCHAR(512) NOT NULL COMMENT '日志消息',
  triggered_by    VARCHAR(16)  NOT NULL DEFAULT 'cron' COMMENT '触发方式：cron/manual',
  retry_count     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  occurred_at     DATETIME     NOT NULL,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_task_id    (task_id),
  INDEX idx_event_type (event_type),
  INDEX idx_occurred   (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='监控调度器运行日志';
