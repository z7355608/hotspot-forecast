-- ============================================================
-- Schema V14: 进行中的预测任务表(支持「切走再回来」恢复)
-- 版本: 2026-04-29
-- ============================================================
-- 解决问题:用户在等待 30-60s 预测结果时切栏目 → SSE abort →
-- 任务结果丢失。本表持久化任务状态,server 不依赖 HTTP 连接生死。
--
-- 数据流:
--   1. SSE 端点(handleRunLivePredictionStream)收到请求,生成 task_id
--      或使用客户端 x-task-id header,INSERT row(status='running')
--   2. 每个 progress event 通过 task-runner.appendProgress() 节流写 DB
--   3. runLivePrediction 完成 → completeTask() 写 result + status='done'
--   4. 客户端切回页面 → GET /api/predictions/:taskId/status 拿快照
--
-- 设计要点:
--   - task_id 是客户端生成的 UUID,server 用它做幂等(同 task_id 只跑一次)
--   - progress_events 是累积数组,前端 resume 时一次拉完
--   - status 用 ENUM 限制状态机:running → done | error | cancelled
--   - 不存敏感数据;result 是 LLM 输出的非个人化分析,可保留
--   - 30 天前的 done/error 任务可单独清理(不在本 schema 内)
-- ============================================================

CREATE TABLE IF NOT EXISTS running_predictions (
  task_id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_open_id     VARCHAR(128) NULL,
  prompt           TEXT         NULL,
  payload          JSON         NULL,

  status           ENUM('running', 'done', 'error', 'cancelled') NOT NULL DEFAULT 'running',
  progress_events  JSON         NULL,        -- 累积的 progress events 数组
  result           JSON         NULL,        -- 完成后的最终结果(status='done')
  error            TEXT         NULL,        -- 错误信息(status='error')

  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at     TIMESTAMP    NULL,

  -- 用户查自己的进行中任务(切回页面时)
  KEY idx_user_status (user_open_id, status),
  -- 后台清理:status + updated_at
  KEY idx_status_updated (status, updated_at)
);
