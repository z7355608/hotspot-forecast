-- ═══════════════════════════════════════════════════════════════
-- Schema v9: TikHub API 调用追踪
-- 记录每次 TikHub API 调用的详情，用于成本监控和优化
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tikhub_api_calls (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  called_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  api_path      VARCHAR(255)    NOT NULL COMMENT 'API 路径，如 /api/v1/douyin/search/fetch_general_search_v2',
  method        VARCHAR(10)     NOT NULL DEFAULT 'GET' COMMENT 'HTTP 方法',
  http_status   SMALLINT        NOT NULL DEFAULT 200 COMMENT 'HTTP 状态码',
  success       TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否成功',
  cache_hit     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否命中缓存（命中则不计费）',
  cost_usd      DECIMAL(10,4)   NOT NULL DEFAULT 0.0100 COMMENT '预估费用（美元），默认 $0.01/次',
  task_type     VARCHAR(50)     NULL COMMENT '触发来源：topic_watch / validation_watch / topic_strategy / creator_sync / monitor 等',
  user_id       VARCHAR(100)    NULL COMMENT '触发用户 ID（如有）',
  keyword       VARCHAR(255)    NULL COMMENT '搜索关键词（如有）',
  platform      VARCHAR(50)     NULL COMMENT '平台：douyin / xiaohongshu / kuaishou',
  request_id    VARCHAR(100)    NULL COMMENT 'TikHub 返回的 request_id',
  error_msg     VARCHAR(500)    NULL COMMENT '错误信息（失败时）',
  INDEX idx_called_at   (called_at),
  INDEX idx_api_path    (api_path),
  INDEX idx_task_type   (task_type),
  INDEX idx_user_id     (user_id),
  INDEX idx_success     (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='TikHub API 调用追踪表';
