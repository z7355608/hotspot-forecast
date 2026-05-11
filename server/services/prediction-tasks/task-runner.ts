import { execute, query } from "../../legacy/database.js";
import type { RowDataPacket } from "../../legacy/database.js";
import { createModuleLogger } from "../../legacy/logger.js";
import type { ProgressEvent } from "../../legacy/live-predictions.js";

const log = createModuleLogger("PredictionTasks");

/**
 * 进行中的预测任务持久化层。
 *
 * 解决问题:用户在等待 30-60s 预测期间切栏目 → SSE abort → 中间进度
 * 与最终结果都丢失。本模块把任务状态写入 running_predictions 表(schema-v14),
 * server 侧 runLivePrediction 不依赖 HTTP 连接生死,客户端切回页面时
 * 通过 GET /api/predictions/:taskId/status 拿快照恢复。
 *
 * 详见 docs/decisions/0006-prediction-task-persistence.md(待写)。
 */

export type TaskStatusEnum = "running" | "done" | "error" | "cancelled";

export interface TaskSnapshot {
  taskId: string;
  status: TaskStatusEnum;
  progressEvents: ProgressEvent[];
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

const PROGRESS_THROTTLE_MS = 250;
const inMemoryEvents = new Map<string, ProgressEvent[]>();
const lastWriteAt = new Map<string, number>();
const lastWritePromise = new Map<string, Promise<unknown>>();

/** 创建任务行(幂等;同 task_id 重复创建时复用并 reset 为 running)。 */
export async function createTask(
  taskId: string,
  userOpenId: string | undefined,
  prompt: string,
  payload: unknown,
): Promise<void> {
  inMemoryEvents.set(taskId, []);
  lastWriteAt.delete(taskId);
  lastWritePromise.delete(taskId);
  await execute(
    `INSERT INTO running_predictions
       (task_id, user_open_id, prompt, payload, status, progress_events, created_at, updated_at)
     VALUES (?, ?, ?, CAST(? AS JSON), 'running', JSON_ARRAY(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       status = 'running',
       progress_events = JSON_ARRAY(),
       result = NULL,
       error = NULL,
       completed_at = NULL,
       updated_at = NOW()`,
    [taskId, userOpenId ?? null, prompt, JSON.stringify(payload)],
  );
  log.info({ taskId, userOpenId }, "task created");
}

/**
 * 追加 progress event。**节流写 DB**(默认 250ms),但 in-memory 累积是即时的,
 * 完成时会在 completeTask 里强制 flush 一次,确保最后状态完整。
 */
export function appendProgress(taskId: string, event: ProgressEvent): void {
  const events = inMemoryEvents.get(taskId);
  if (!events) {
    log.warn({ taskId, eventType: event.type }, "appendProgress on unknown task (skip)");
    return;
  }
  events.push(event);

  const now = Date.now();
  const last = lastWriteAt.get(taskId) ?? 0;
  if (now - last < PROGRESS_THROTTLE_MS) return;
  lastWriteAt.set(taskId, now);

  // fire-and-forget,不阻塞 SSE 推送;保留 promise 让 completeTask 能 await 最后一次
  const p = execute(
    `UPDATE running_predictions
     SET progress_events = CAST(? AS JSON), updated_at = NOW()
     WHERE task_id = ?`,
    [JSON.stringify(events), taskId],
  ).catch((err) => {
    log.warn({ err, taskId }, "appendProgress write failed (event still in memory)");
  });
  lastWritePromise.set(taskId, p);
}

export async function completeTask(
  taskId: string,
  result: Record<string, unknown>,
): Promise<void> {
  // 先把节流期间漏写的 events flush 掉
  const events = inMemoryEvents.get(taskId) ?? [];
  await lastWritePromise.get(taskId);
  await execute(
    `UPDATE running_predictions
     SET status = 'done',
         progress_events = CAST(? AS JSON),
         result = CAST(? AS JSON),
         completed_at = NOW(),
         updated_at = NOW()
     WHERE task_id = ?`,
    [JSON.stringify(events), JSON.stringify(result), taskId],
  );
  inMemoryEvents.delete(taskId);
  lastWriteAt.delete(taskId);
  lastWritePromise.delete(taskId);
  log.info({ taskId, eventCount: events.length }, "task completed");
}

export async function failTask(taskId: string, errorMessage: string): Promise<void> {
  const events = inMemoryEvents.get(taskId) ?? [];
  await lastWritePromise.get(taskId);
  await execute(
    `UPDATE running_predictions
     SET status = 'error',
         progress_events = CAST(? AS JSON),
         error = ?,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE task_id = ?`,
    [JSON.stringify(events), errorMessage.slice(0, 2000), taskId],
  );
  inMemoryEvents.delete(taskId);
  lastWriteAt.delete(taskId);
  lastWritePromise.delete(taskId);
  log.warn({ taskId, error: errorMessage.slice(0, 200) }, "task failed");
}

/** 客户端切回页面时调用,拿任务当前快照。 */
export async function getTaskSnapshot(taskId: string): Promise<TaskSnapshot | null> {
  const rows = await query<RowDataPacket[]>(
    `SELECT task_id, status, progress_events, result, error,
            created_at, updated_at, completed_at
     FROM running_predictions
     WHERE task_id = ?
     LIMIT 1`,
    [taskId],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    taskId: String(r.task_id),
    status: String(r.status) as TaskStatusEnum,
    progressEvents: Array.isArray(r.progress_events)
      ? (r.progress_events as ProgressEvent[])
      : [],
    result: (r.result as Record<string, unknown> | null) ?? null,
    error: r.error ? String(r.error) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

/** 仅供测试使用。生产代码不要调。 */
export function _resetForTest(): void {
  inMemoryEvents.clear();
  lastWriteAt.clear();
  lastWritePromise.clear();
}
