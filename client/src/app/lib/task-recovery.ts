import type { PredictionRequestDraft } from "../store/prediction-types";
import type { LivePredictionResult, ProgressEvent } from "./live-predictions-api";

/**
 * 进行中的预测任务的客户端持久化与恢复。
 *
 * 解决问题:用户在等待预测结果时切走栏目 → SSE abort → 切回来 server 端
 * 已经跑完了或还在跑,但客户端没有上下文。本模块用 localStorage 存活
 * 当前活跃 task_id,切回页面时 GET /api/predictions/:taskId/status
 * 拉快照恢复(详见 server/services/prediction-tasks/task-runner.ts)。
 */

const STORAGE_KEY = "active_prediction_task";
const MAX_AGE_MS = 10 * 60 * 1_000; // 10 分钟,超时认为 stale,丢弃

export interface ActiveTaskEntry {
  taskId: string;
  /** 完整 request,recovery 时用于 buildLiveResult。 */
  request: PredictionRequestDraft;
  startedAt: number;
}

export interface TaskSnapshot {
  taskId: string;
  status: "running" | "done" | "error" | "cancelled";
  progressEvents: ProgressEvent[];
  result: LivePredictionResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function generateTaskId(): string {
  // crypto.randomUUID 在所有现代浏览器(含 IE 之外)都支持
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 兜底:时间 + 随机
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function persistActiveTaskId(
  taskId: string,
  request: PredictionRequestDraft,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        taskId,
        request,
        startedAt: Date.now(),
      } satisfies ActiveTaskEntry),
    );
  } catch {
    // localStorage 满 / 隐私模式 / quota — 静默降级,resume 失败但主流程不受影响
  }
}

export function clearActiveTaskId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readActiveTaskId(): ActiveTaskEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTaskEntry;
    if (!parsed?.taskId || typeof parsed.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > MAX_AGE_MS) {
      clearActiveTaskId();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchTaskSnapshot(
  taskId: string,
): Promise<TaskSnapshot | null> {
  const r = await fetch(
    `/api/predictions/${encodeURIComponent(taskId)}/status`,
    { credentials: "include" },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`task status fetch failed: ${r.status}`);
  return (await r.json()) as TaskSnapshot;
}

/**
 * 轮询任务直到 done/error/cancelled/超时。返回 stop() 用于手动取消。
 * 适用场景:HomePage 切回来发现有 running 任务,启动 polling 直到完成。
 */
export function pollTaskUntilDone(
  taskId: string,
  onUpdate: (snapshot: TaskSnapshot) => void,
  options?: { intervalMs?: number; maxDurationMs?: number },
): { stop: () => void } {
  const intervalMs = options?.intervalMs ?? 3_000;
  const maxDurationMs = options?.maxDurationMs ?? 5 * 60 * 1_000;
  const startedAt = Date.now();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const snapshot = await fetchTaskSnapshot(taskId);
      if (stopped) return;
      if (!snapshot) {
        clearActiveTaskId();
        return;
      }
      onUpdate(snapshot);
      if (
        snapshot.status === "done" ||
        snapshot.status === "error" ||
        snapshot.status === "cancelled"
      ) {
        return;
      }
      if (Date.now() - startedAt > maxDurationMs) {
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    } catch {
      // 网络抖动:延长重试间隔
      timer = setTimeout(() => void tick(), intervalMs * 2);
    }
  };

  void tick();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
