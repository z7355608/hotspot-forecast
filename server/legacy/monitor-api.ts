/**
 * monitor-api.ts
 * 模块六：智能监控系统 — HTTP 处理器
 *
 * 端点列表：
 *   GET  /api/monitor/scheduler/status    — 调度器状态
 *   POST /api/monitor/scheduler/start     — 启动调度器
 *   POST /api/monitor/scheduler/stop      — 停止调度器
 *   POST /api/monitor/tasks/:id/trigger   — 手动触发任务立即执行
 *   GET  /api/monitor/tasks/:id/diff      — 获取最新增量对比结果
 *   GET  /api/monitor/tasks/:id/trend     — 获取历史趋势（最近 7 次）
 *   GET  /api/monitor/tasks/:id/report    — 获取最新 AI 报告
 *   GET  /api/monitor/tasks/:id/reports   — 获取历史报告列表
 *   POST /api/monitor/tasks/:id/report/generate — 手动触发生成报告
 *   GET  /api/monitor/dashboard           — 监控面板统计
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  startScheduler,
  stopScheduler,
  triggerTaskNow,
  getSchedulerStatus,
  getTaskRunHistory,
  getMonitorDashboardStats,
} from "./monitor-scheduler.js";
import { computeDiff, getTaskTrend } from "./monitor-diff-engine.js";
import {
  generateMonitorReport,
  getLatestReport,
  listReports,
} from "./monitor-report-generator.js";
import { readWatchTaskStore } from "./storage.js";

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ─────────────────────────────────────────────
// 任务元数据辅助
// ─────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  topic_watch: "赛道监控",
  account_watch: "账号监控",
  content_watch: "作品监控",
  validation_watch: "验证监控",
};

const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
};

const SCHEDULE_LABELS: Record<string, string> = {
  daily: "每天",
  every_72h: "每 3 天",
  weekly: "每周",
};

async function getTaskMeta(taskId: string) {
  const taskStore = await readWatchTaskStore();
  const task = taskStore[taskId];
  if (!task) return null;

  const queryPayload = task.queryPayload as Record<string, unknown>;
  const target =
    (queryPayload.query as string) ??
    (queryPayload.keyword as string) ??
    (queryPayload.handle as string) ??
    taskId;

  return {
    taskTypeLabel: TASK_TYPE_LABELS[task.taskType] ?? task.taskType,
    platformLabel: PLATFORM_LABELS[task.platform] ?? task.platform,
    target,
    scheduleTierLabel: SCHEDULE_LABELS[task.scheduleTier] ?? task.scheduleTier,
    nextRunAt: task.nextRunAt,
  };
}

// ─────────────────────────────────────────────
// 处理器函数
// ─────────────────────────────────────────────

export async function handleGetSchedulerStatus(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const status = getSchedulerStatus();
  sendJson(res, 200, { ok: true, scheduler: status });
}

export async function handleStartScheduler(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  startScheduler();
  sendJson(res, 200, { ok: true, message: "调度器已启动" });
}

export async function handleStopScheduler(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  stopScheduler();
  sendJson(res, 200, { ok: true, message: "调度器已停止" });
}

export async function handleTriggerTask(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const taskStore = await readWatchTaskStore();
  if (!taskStore[taskId]) {
    sendError(res, 404, `任务 ${taskId} 不存在`);
    return;
  }
  triggerTaskNow(taskId);
  sendJson(res, 200, {
    ok: true,
    message: `任务 ${taskId} 已加入执行队列`,
    taskId,
  });
}

export async function handleGetTaskDiff(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const diff = await computeDiff(taskId);
  if (!diff) {
    sendJson(res, 200, {
      ok: true,
      diff: null,
      message: "该任务尚无执行记录",
    });
    return;
  }
  sendJson(res, 200, { ok: true, diff });
}

export async function handleGetTaskTrend(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const trend = await getTaskTrend(taskId, 7);
  sendJson(res, 200, { ok: true, trend, taskId });
}

export async function handleGetLatestReport(
  _req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const report = await getLatestReport(taskId);
  if (!report) {
    sendJson(res, 200, {
      ok: true,
      report: null,
      message: "该任务尚无生成的报告",
    });
    return;
  }
  sendJson(res, 200, { ok: true, report });
}

export async function handleListReports(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);
  const reports = await listReports(taskId, limit);
  sendJson(res, 200, { ok: true, reports, total: reports.length });
}

export async function handleGenerateReport(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  // 获取任务元数据
  const taskMeta = await getTaskMeta(taskId);
  if (!taskMeta) {
    sendError(res, 404, `任务 ${taskId} 不存在`);
    return;
  }

  // 可选：从请求体中指定 runId
  let runId: string | undefined;
  try {
    const body = (await readBody(req)) as Record<string, unknown>;
    runId = body.runId as string | undefined;
  } catch {
    // 忽略解析错误
  }

  // 计算增量对比
  const diff = await computeDiff(taskId, runId);
  if (!diff) {
    sendError(res, 422, "该任务尚无执行记录，无法生成报告");
    return;
  }

  // 生成报告
  const report = await generateMonitorReport(diff, taskMeta);
  sendJson(res, 200, { ok: true, report });
}

export async function handleGetDashboard(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const [dashboardStats, schedulerStatus] = await Promise.all([
    getMonitorDashboardStats(),
    Promise.resolve(getSchedulerStatus()),
  ]);

  sendJson(res, 200, {
    ok: true,
    dashboard: {
      ...dashboardStats,
      scheduler: schedulerStatus,
    },
  });
}

export async function handleGetTaskRunHistory(
  req: IncomingMessage,
  res: ServerResponse,
  taskId: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);
  const runs = await getTaskRunHistory(taskId, limit);
  sendJson(res, 200, { ok: true, runs, total: runs.length });
}
