/**
 * monitor-scheduler.ts
 * 模块六：智能监控系统 — 定时任务调度系统
 *
 * 功能：
 *   1. Node-cron 调度器：每分钟扫描到期任务，触发 daily/every_72h/weekly 执行
 *   2. 任务执行队列：内存队列 + 并发控制（最多 3 个并发）
 *   3. 限流保护：每分钟最多 10 次 TikHub API 调用，防止平台封禁
 *   4. 重试机制：失败任务最多重试 2 次，指数退避
 *   5. 超时控制：单任务最长执行 120 秒
 */

import cron from "node-cron";
import { createModuleLogger } from "./logger.js";
import { runDailyRefresh } from "./low-follower-daily-refresh.js";

const log = createModuleLogger("Scheduler");
const ksLog = createModuleLogger("KS-Comment-Probe");
import { runAutoTagging } from "./low-follower-tagger.js";
import { runWeeklyTopicRefresh } from "./weekly-topic-refresh.js";
import { runPerformanceCollection } from "./performance-tracker.js";
import { randomUUID } from "node:crypto";
import {
  readWatchTaskStore,
  writeWatchTaskStore,
  readWatchTaskRunStore,
  writeWatchTaskRunStore,
  readEndpointHealthStore,
  writeEndpointHealthStore,
} from "./storage.js";
import { runWatchTaskWithFallback } from "./watch-runtime.js";
import { getTikHub } from "./tikhub.js";
import type { StoredWatchTask, StoredWatchTaskRun, EndpointHealthRecord } from "./types.js";

// ─────────────────────────────────────────────
// 调度器配置
// ─────────────────────────────────────────────

const SCHEDULER_CONFIG = {
  /** 最大并发任务数 */
  maxConcurrent: 3,
  /** 每分钟最大 API 调用次数（限流） */
  maxApiCallsPerMinute: 10,
  /** 单任务最长执行时间（毫秒） */
  taskTimeoutMs: 120_000,
  /** 最大重试次数 */
  maxRetries: 2,
  /** 重试基础延迟（毫秒） */
  retryBaseDelayMs: 5_000,
  /** 调度扫描间隔（cron 表达式，每10分钟） */
  scanCron: "*/10 * * * *",
} as const;

// ─────────────────────────────────────────────
// 队列状态
// ─────────────────────────────────────────────

interface QueueItem {
  taskId: string;
  retryCount: number;
  scheduledAt: string;
  triggeredBy: "cron" | "manual";
}

interface SchedulerState {
  running: boolean;
  activeCount: number;
  queue: QueueItem[];
  /** 本分钟内 API 调用次数（用于限流） */
  apiCallsThisMinute: number;
  /** 限流窗口重置时间 */
  rateLimitWindowStart: number;
  /** 已处理任务 ID 集合（防止重复入队） */
  processingSet: Set<string>;
  /** 统计信息 */
  stats: {
    totalScheduled: number;
    totalCompleted: number;
    totalFailed: number;
    lastScanAt?: string;
  };
}

const state: SchedulerState = {
  running: false,
  activeCount: 0,
  queue: [],
  apiCallsThisMinute: 0,
  rateLimitWindowStart: Date.now(),
  processingSet: new Set(),
  stats: {
    totalScheduled: 0,
    totalCompleted: 0,
    totalFailed: 0,
  },
};

// ─────────────────────────────────────────────
// 限流工具
// ─────────────────────────────────────────────

function checkRateLimit(): boolean {
  const now = Date.now();
  // 每分钟重置计数器
  if (now - state.rateLimitWindowStart >= 60_000) {
    state.apiCallsThisMinute = 0;
    state.rateLimitWindowStart = now;
  }
  return state.apiCallsThisMinute < SCHEDULER_CONFIG.maxApiCallsPerMinute;
}

function consumeRateLimit(count: number) {
  state.apiCallsThisMinute += count;
}

// ─────────────────────────────────────────────
// 任务到期检测
// ─────────────────────────────────────────────

/**
 * 检查任务是否已到期需要执行
 */
function isTaskDue(task: StoredWatchTask): boolean {
  if (task.status === "failed") return false;
  // 'paused' is not a valid WatchTaskStatus; skip tasks with non-pending/running/completed status
  if ((task.status as string) === "paused") return false;
  if (!task.nextRunAt) {
    // 从未执行过的任务立即执行
    return true;
  }
  const nextRun = new Date(task.nextRunAt).getTime();
  return Date.now() >= nextRun;
}

/**
 * 计算下次执行时间（基于 scheduleTier）
 */
function calculateNextRunAt(task: StoredWatchTask): string {
  const now = new Date().toISOString();
  const base = task.lastRunAt ?? now;
  const baseMs = new Date(base).getTime();

  switch (task.scheduleTier) {
    case "daily":
      return new Date(baseMs + 24 * 60 * 60 * 1000).toISOString();
    case "every_72h":
      return new Date(baseMs + 72 * 60 * 60 * 1000).toISOString();
    case ("weekly" as string):
      return new Date(baseMs + 7 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return new Date(baseMs + 72 * 60 * 60 * 1000).toISOString();
  }
}

// ─────────────────────────────────────────────
// 任务执行
// ─────────────────────────────────────────────

/**
 * 执行单个监控任务（含超时控制）
 */
async function executeTask(item: QueueItem): Promise<void> {
  const { taskId } = item;
  state.activeCount++;
  state.processingSet.add(taskId);

  log.info({ taskId, retryCount: item.retryCount, trigger: item.triggeredBy }, "开始执行任务");

  try {
    // 读取最新任务状态
    const taskStore = await readWatchTaskStore();
    const task = taskStore[taskId];
    if (!task) {
      log.warn({ taskId }, "任务不存在，跳过");
      return;
    }

    // 更新状态为 running
    taskStore[taskId] = {
      ...task,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    await writeWatchTaskStore(taskStore);

    // 生成 runId
    const runId = `run_${randomUUID()}`;

    // 执行任务（含超时控制）
    const result = await Promise.race([
      runWatchTaskWithFallback({ task, runId }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`任务超时（${SCHEDULER_CONFIG.taskTimeoutMs / 1000}秒）`)),
          SCHEDULER_CONFIG.taskTimeoutMs,
        ),
      ),
    ]);

    // result is { task: StoredWatchTask; run: StoredWatchTaskRun }
    const completedRun = result.run;

    // 消耗限流配额（按实际使用量）
    consumeRateLimit(completedRun.budgetSnapshot?.actualUsed ?? 1);

    // 持久化执行记录（run 已由 runWatchTaskWithFallback 内部持久化，直接使用）
    const runRecord: StoredWatchTaskRun = completedRun;

    // runWatchTaskWithFallback 已内部持久化 run，确保 runStore 中有记录
    const runStore = await readWatchTaskRunStore();
    if (!runStore[runId]) {
      runStore[runId] = runRecord;
      await writeWatchTaskRunStore(runStore);
    }

    // 更新任务状态（runWatchTaskWithFallback 已更新 task，这里再次确保 nextRunAt 正确）
    const updatedTaskStore = await readWatchTaskStore();
    const updatedTask = updatedTaskStore[taskId] ?? result.task;
    updatedTaskStore[taskId] = {
      ...updatedTask,
      nextRunAt: calculateNextRunAt(updatedTask),
      updatedAt: new Date().toISOString(),
    };
    await writeWatchTaskStore(updatedTaskStore);

    state.stats.totalCompleted++;
    log.info({ taskId }, "任务执行完成");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ taskId, errMsg }, "任务执行失败");

    // 重试逻辑
    if (item.retryCount < SCHEDULER_CONFIG.maxRetries) {
      const delay = SCHEDULER_CONFIG.retryBaseDelayMs * Math.pow(2, item.retryCount);
      log.info({ taskId, delaySeconds: delay / 1000, retryCount: item.retryCount + 1 }, "任务将重试");
      setTimeout(() => {
        enqueueTask(taskId, item.retryCount + 1, item.triggeredBy);
      }, delay);
    } else {
      // 超过最大重试次数，标记为失败
      const taskStore = await readWatchTaskStore();
      const task = taskStore[taskId];
      if (task) {
        taskStore[taskId] = {
          ...task,
          status: "failed",
          lastExecutionStatus: "failed",
          degradeReason: `执行失败（已重试 ${SCHEDULER_CONFIG.maxRetries} 次）: ${errMsg}`,
          updatedAt: new Date().toISOString(),
        };
        await writeWatchTaskStore(taskStore);
      }
      state.stats.totalFailed++;
    }
  } finally {
    state.activeCount--;
    state.processingSet.delete(taskId);
    // 处理队列中的下一个任务
    processQueue();
  }
}

// ─────────────────────────────────────────────
// 队列管理
// ─────────────────────────────────────────────

/**
 * 将任务加入执行队列
 */
function enqueueTask(
  taskId: string,
  retryCount: number = 0,
  triggeredBy: "cron" | "manual" = "cron",
) {
  // 防止重复入队（正在处理中的任务不重复入队）
  if (state.processingSet.has(taskId)) {
    log.info({ taskId }, "任务正在处理中，跳过入队");
    return;
  }
  // 检查是否已在队列中
  const alreadyQueued = state.queue.some((item) => item.taskId === taskId);
  if (alreadyQueued) {
    log.info({ taskId }, "任务已在队列中，跳过");
    return;
  }

  state.queue.push({
    taskId,
    retryCount,
    scheduledAt: new Date().toISOString(),
    triggeredBy,
  });
  state.stats.totalScheduled++;
  log.info({ taskId, queueLength: state.queue.length }, "任务已入队");

  // 尝试立即处理
  processQueue();
}

/**
 * 处理队列（消费队列中的任务）
 */
function processQueue() {
  // 检查并发限制
  if (state.activeCount >= SCHEDULER_CONFIG.maxConcurrent) {
    return;
  }
  // 检查限流
  if (!checkRateLimit()) {
    log.warn({ apiCallsThisMinute: state.apiCallsThisMinute }, "限流触发，暂停处理队列");
    return;
  }
  // 取出队首任务
  const item = state.queue.shift();
  if (!item) return;

  // 异步执行（不等待）
  executeTask(item).catch((err) => {
    log.error({ err }, "executeTask 未捕获异常");
  });
}

// ─────────────────────────────────────────────
// 调度扫描
// ─────────────────────────────────────────────

/**
 * 扫描所有监控任务，将到期任务加入队列
 */
async function scanAndSchedule(): Promise<void> {
  state.stats.lastScanAt = new Date().toISOString();

  try {
    const taskStore = await readWatchTaskStore();
    const tasks = Object.values(taskStore);

    let scheduledCount = 0;
    for (const task of tasks) {
      if (isTaskDue(task)) {
        enqueueTask(task.taskId, 0, "cron");
        scheduledCount++;
      }
    }

    if (scheduledCount > 0) {
      log.info({ scheduledCount }, "扫描完成");
    }
  } catch (err) {
    log.error({ err }, "扫描任务失败");
  }
}

// ─────────────────────────────────────────────
// 公共 API
// ─────────────────────────────────────────────

let cronJob: ReturnType<typeof cron.schedule> | null = null;
let dailyCronJob: ReturnType<typeof cron.schedule> | null = null;
let ksCommentProbeCronJob: ReturnType<typeof cron.schedule> | null = null;
let weeklyTopicCronJob: ReturnType<typeof cron.schedule> | null = null;
let performanceCollectionCronJob: ReturnType<typeof cron.schedule> | null = null;
let membershipDowngradeCronJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * 启动调度器
 */
export function startScheduler(): void {
  if (state.running) {
    log.info("调度器已在运行中");
    return;
  }

  state.running = true;
  log.info("启动监控任务调度器...");

  // 注册 cron 任务（每10分钟扫描一次）
  cronJob = cron.schedule(SCHEDULER_CONFIG.scanCron, () => {
    scanAndSchedule().catch((err) => {
      log.error({ err }, "定时扫描失败");
    });
  });

  // 启动时立即扫描一次
  scanAndSchedule().catch((err) => {
    log.error({ err }, "初始扫描失败");
  });

  // 注册低粉爆款每日刷新任务（每天凌晨2点执行）
  dailyCronJob = cron.schedule("0 2 * * *", () => {
    log.info("触发低粉爆款每日刷新...");
    runDailyRefresh().then(async (result) => {
      log.info({ refreshed: result.refreshed, failed: result.failed, expired: result.expired }, "低粉爆款刷新完成");
      // 刷新完成后自动打标签
      try {
        const tagResult = await runAutoTagging();
        log.info({ tagged: tagResult.tagged, failed: tagResult.failed }, "低粉爆款自动打标签完成");
      } catch (tagErr) {
        log.error({ err: tagErr }, "低粉爆款自动打标签失败");
      }
    }).catch((err) => {
      log.error({ err }, "低粉爆款刷新失败");
    });
  });

  // 注册快手评论接口周检测任务（每周一凌晨3点执行）
  ksCommentProbeCronJob = cron.schedule("0 3 * * 1", () => {
    log.info("触发快手评论接口周检测...");
    probeKuaishouCommentEndpoints().catch((err: unknown) => {
      log.error({ err }, "快手评论接口检测失败");
    });
  });

  // P2-10: 注册每周选题推荐刷新任务（每周一早上8点执行）
  weeklyTopicCronJob = cron.schedule("0 8 * * 1", () => {
    log.info("触发每周选题推荐刷新...");
    runWeeklyTopicRefresh().then((result) => {
      log.info({ success: result.success, failed: result.failed, total: result.total }, "每周选题刷新完成");
    }).catch((err) => {
      log.error({ err }, "每周选题刷新失败");
    });
  });

  // P2-9: 注册效果追踪数据采集任务（每4小时执行一次）
  performanceCollectionCronJob = cron.schedule("0 */4 * * *", () => {
    log.info("触发效果追踪数据采集...");
    runPerformanceCollection().then((result) => {
      log.info({ scanned: result.scanned, collected: result.collected, errors: result.errors }, "效果追踪采集完成");
    }).catch((err) => {
      log.error({ err }, "效果追踪采集失败");
    });
  });

  // 注册会员到期自动降级任务（每小时执行一次）
  membershipDowngradeCronJob = cron.schedule("30 * * * *", () => {
    log.info("触发会员到期降级扫描...");
    import("../routers/credits.js").then(({ downgradeAllExpiredSubscriptions }) => {
      return downgradeAllExpiredSubscriptions();
    }).then((result) => {
      if (result.downgraded > 0) {
        log.info({ downgraded: result.downgraded }, "会员到期降级完成");
      }
    }).catch((err) => {
      log.error({ err }, "会员到期降级失败");
    });
  });

  log.info("调度器已启动，扫描间隔: 每10分钟");
  log.info("低粉爆款每日刷新: 凌晨2:00");
  log.info("快手评论接口周检测: 每周一凌晨3:00");
  log.info("每周选题推荐刷新: 每周一早上8:00");
  log.info("效果追踪数据采集: 每4小时");
  log.info("会员到期降级扫描: 每小时");
}

/**
 * 停止调度器
 */
export function stopScheduler(): void {
  if (!state.running) return;
  state.running = false;
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  if (dailyCronJob) {
    dailyCronJob.stop();
    dailyCronJob = null;
  }
  if (ksCommentProbeCronJob) {
    ksCommentProbeCronJob.stop();
    ksCommentProbeCronJob = null;
  }
  if (weeklyTopicCronJob) {
    weeklyTopicCronJob.stop();
    weeklyTopicCronJob = null;
  }
  if (performanceCollectionCronJob) {
    performanceCollectionCronJob.stop();
    performanceCollectionCronJob = null;
  }
  if (membershipDowngradeCronJob) {
    membershipDowngradeCronJob.stop();
    membershipDowngradeCronJob = null;
  }
  log.info("调度器已停止");
}

/**
 * 手动触发单个任务立即执行
 */
export function triggerTaskNow(taskId: string): void {
  log.info({ taskId }, "手动触发任务");
  enqueueTask(taskId, 0, "manual");
}

/**
 * 获取调度器状态快照
 */
export function getSchedulerStatus(): {
  running: boolean;
  activeCount: number;
  queueLength: number;
  stats: SchedulerState["stats"];
  rateLimitInfo: {
    apiCallsThisMinute: number;
    maxApiCallsPerMinute: number;
    windowResetIn: number;
  };
} {
  return {
    running: state.running,
    activeCount: state.activeCount,
    queueLength: state.queue.length,
    stats: { ...state.stats },
    rateLimitInfo: {
      apiCallsThisMinute: state.apiCallsThisMinute,
      maxApiCallsPerMinute: SCHEDULER_CONFIG.maxApiCallsPerMinute,
      windowResetIn: Math.max(
        0,
        60_000 - (Date.now() - state.rateLimitWindowStart),
      ),
    },
  };
}

/**
 * 获取队列中的任务列表
 */
export function getQueueSnapshot(): QueueItem[] {
  return [...state.queue];
}

/**
 * 暂停任务（从队列移除，不再自动执行）
 */
export async function pauseScheduledTask(taskId: string): Promise<void> {
  // 从队列中移除
  state.queue = state.queue.filter((item) => item.taskId !== taskId);

  // 更新任务状态
  const taskStore = await readWatchTaskStore();
  const task = taskStore[taskId];
  if (task) {
    taskStore[taskId] = {
      ...task,
      status: "pending" as StoredWatchTask["status"], // paused is not in WatchTaskStatus, use pending
      updatedAt: new Date().toISOString(),
    };
    await writeWatchTaskStore(taskStore);
  }
}

/**
 * 恢复任务（重新计算下次执行时间）
 */
export async function resumeScheduledTask(taskId: string): Promise<void> {
  const taskStore = await readWatchTaskStore();
  const task = taskStore[taskId];
  if (task) {
    taskStore[taskId] = {
      ...task,
      status: "pending",
      // 恢复后立即执行一次
      nextRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeWatchTaskStore(taskStore);
    // 立即入队
    enqueueTask(taskId, 0, "manual");
  }
}

/**
 * 获取任务的执行历史（最近 N 条）
 */
export async function getTaskRunHistory(
  taskId: string,
  limit: number = 10,
): Promise<StoredWatchTaskRun[]> {
  const runStore = await readWatchTaskRunStore();
  return Object.values(runStore)
    .filter((run) => run.taskId === taskId)
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, limit);
}

/**
 * 获取所有任务的执行统计（用于监控面板）
 */
export async function getMonitorDashboardStats(): Promise<{
  totalTasks: number;
  activeTasks: number;
  pausedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  totalRuns: number;
  successRate: number;
  tasksByScheduleTier: Record<string, number>;
  recentRuns: Array<{
    runId: string;
    taskId: string;
    taskType: string;
    executedAt: string;
    executionStatus: string;
  }>;
}> {
  const [taskStore, runStore] = await Promise.all([
    readWatchTaskStore(),
    readWatchTaskRunStore(),
  ]);

  const tasks = Object.values(taskStore);
  const runs = Object.values(runStore);

  const statusCounts = tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const tierCounts = tasks.reduce(
    (acc, task) => {
      acc[task.scheduleTier] = (acc[task.scheduleTier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const successRuns = runs.filter((r) => r.executionStatus === "success").length;
  const successRate = runs.length > 0 ? Math.round((successRuns / runs.length) * 100) : 0;

  const recentRuns = runs
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, 10)
    .map((run) => ({
      runId: run.runId,
      taskId: run.taskId,
      taskType: run.taskType,
      executedAt: run.executedAt,
      executionStatus: run.executionStatus,
    }));

  return {
    totalTasks: tasks.length,
    activeTasks: statusCounts["completed"] ?? 0,
    pausedTasks: statusCounts["paused"] ?? 0,
    failedTasks: statusCounts["failed"] ?? 0,
    pendingTasks: statusCounts["pending"] ?? 0,
    runningTasks: statusCounts["running"] ?? 0,
    totalRuns: runs.length,
    successRate,
    tasksByScheduleTier: tierCounts,
    recentRuns,
  };
}

// ─────────────────────────────────────────────
// 快手评论接口周检测
// ─────────────────────────────────────────────

/**
 * 快手评论接口 4 个端点列表
 * 当前全部返回 403/500，每周检测一次是否恢复
 */
const KS_COMMENT_ENDPOINTS = [
  { path: "/api/v1/kuaishou/web/fetch_video_comments", method: "GET" as const },
  { path: "/api/v1/kuaishou/web/fetch_video_comments_v2", method: "GET" as const },
  { path: "/api/v1/kuaishou/app/fetch_video_comments", method: "GET" as const },
  { path: "/api/v1/kuaishou/app/fetch_video_comments_v2", method: "GET" as const },
];

/**
 * 探测快手评论接口可用性
 * 逐一调用 4 个端点，记录 HTTP 状态和是否返回有效评论数据
 * 结果写入 endpoint-health store，同时返回汇总
 */
export async function probeKuaishouCommentEndpoints(): Promise<{
  results: Array<{ path: string; httpStatus: number; stable: boolean; failureReason?: string }>;
  anyRecovered: boolean;
}> {
  const testPhotoId = process.env.KS_PROBE_PHOTO_ID?.trim() || "3xbfhbrasqm2ndu";
  const healthStore = await readEndpointHealthStore();
  const results: Array<{ path: string; httpStatus: number; stable: boolean; failureReason?: string }> = [];
  let anyRecovered = false;

  for (const endpoint of KS_COMMENT_ENDPOINTS) {
    const key = `${endpoint.method}:${endpoint.path}`;
    let httpStatus = 0;
    let stable = false;
    let failureReason: string | undefined;

    try {
      const response = await getTikHub<Record<string, unknown>>(endpoint.path, {
        photo_id: testPhotoId,
        cursor: 0,
        count: 10,
      });

      httpStatus = response.httpStatus;

      if (response.ok && response.payload) {
        const data = response.payload as Record<string, unknown>;
        // 检查是否真的返回了评论数据
        const comments = (data as Record<string, unknown>).comments ?? (data as Record<string, unknown>).comment_list;
        const hasComments = Array.isArray(comments) && comments.length > 0;
        if (hasComments) {
          stable = true;
          anyRecovered = true;
          ksLog.info({ path: endpoint.path }, "✅ 已恢复！发现评论数据");
        } else {
          failureReason = "http_200_but_no_comments";
          ksLog.warn({ path: endpoint.path }, "⚠️ HTTP 200 但无评论数据");
        }
      } else {
        failureReason = `http_${httpStatus}`;
        ksLog.warn({ path: endpoint.path, httpStatus, failureReason }, "❌ HTTP 请求失败");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failureReason = `request_error: ${errMsg}`;
      ksLog.error({ path: endpoint.path, errMsg }, "❌ 请求异常");
    }

    const entry: EndpointHealthRecord = {
      path: endpoint.path,
      method: endpoint.method,
      capability: "comments",
      sampleParams: { photo_id: testPhotoId, cursor: 0, count: 10 },
      httpStatus,
      businessCode: null,
      requestId: null,
      stable,
      tier: "L1" as const,
      verifiedAt: new Date().toISOString(),
      failureReason,
    };

    healthStore[key] = entry;
    results.push({ path: endpoint.path, httpStatus, stable, failureReason });
  }

  await writeEndpointHealthStore(healthStore);

  if (anyRecovered) {
    ksLog.info("🎉 检测到快手评论接口恢复！请更新 platforms.ts 中 supportsComments 配置");
  } else {
    ksLog.info("快手评论接口仍全部不可用，下周继续检测");
  }

  return { results, anyRecovered };
}
