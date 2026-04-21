import type {
  TaskArtifactType,
  TaskIntent,
  PredictionExecutionStatus,
  PredictionResultArtifactStatus,
  PredictionWatchPreset,
  PredictionWatchScheduleTier,
  PredictionWatchTaskPriority,
  PredictionWatchTaskStatus,
  PredictionWatchTaskType,
} from "../store/prediction-types";
import { parseApiResponse, apiFetch } from "./api-utils";

export interface SavedResultArtifactSummary {
  artifactId: string;
  clientResultId?: string;
  taskIntent?: TaskIntent;
  artifactType?: TaskArtifactType;
  createdAt: string;
  updatedAt: string;
  query: string;
  type: string;
  title?: string;
  summary?: string;
  platform: string[];
  score?: number;
  scoreLabel?: string;
  verdict?: string;
  windowStrength?: string;
  confidenceLabel?: string;
  opportunityTitle: string;
  coreBet?: string;
  watchable?: boolean;
  shareable?: boolean;
  artifactStatus: PredictionResultArtifactStatus;
}

export interface SavedResultArtifactDetail extends SavedResultArtifactSummary {
  snapshot: Record<string, unknown>;
}

export interface WatchTaskSummary {
  taskId: string;
  artifactId: string;
  platform: "douyin" | "xiaohongshu" | "kuaishou";
  taskType: PredictionWatchTaskType;
  priority: PredictionWatchTaskPriority;
  scheduleTier: PredictionWatchScheduleTier;
  status: PredictionWatchTaskStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  resultSnapshotRef?: string;
  lastExecutionStatus?: PredictionExecutionStatus;
  degradeFlags: string[];
  degradeReason?: string;
  budgetSnapshot?: {
    baseBudget: number;
    actualUsed: number;
    cookieExtraBudget?: number;
  };
  /** 监控任务显示名称（独立创建时填写） */
  title?: string;
  /** 监控目标描述（赛道关键词 / 账号 URL / 作品 URL） */
  target?: string;
  /** 监控维度标签（如 "粉丝增长", "爆款率", "互动率" 等） */
  dimensions?: string[];
  /** 创建来源：result = 从结果页创建, standalone = 从监控中心独立创建 */
  source?: "result" | "standalone";
  /** 创建时间 */
  createdAt?: string;
}

export interface WatchRunSummary {
  runId: string;
  taskId: string;
  artifactId: string;
  platform: "douyin" | "xiaohongshu" | "kuaishou";
  taskType: PredictionWatchTaskType;
  executedAt: string;
  executionStatus: PredictionExecutionStatus;
  degradeFlags: string[];
  degradeReason?: string;
  resultSnapshotRef: string;
  usedRouteChain: string[];
  budgetSnapshot: {
    baseBudget: number;
    actualUsed: number;
    cookieExtraBudget?: number;
  };
  snapshot: Record<string, unknown>;
}

export async function fetchResultArtifacts() {
  const response = await apiFetch("/api/result-artifacts");
  return parseApiResponse<{ items: SavedResultArtifactSummary[] }>(response);
}

export async function fetchResultArtifact(artifactId: string) {
  const response = await apiFetch(`/api/result-artifacts/${artifactId}`);
  return parseApiResponse<{ item: SavedResultArtifactDetail }>(response);
}

export async function saveResultArtifact(payload: {
  snapshot: Record<string, unknown>;
  createWatch?: boolean;
  watchPreset?: PredictionWatchPreset;
}) {
  const response = await apiFetch("/api/result-artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{
    artifact: SavedResultArtifactDetail;
    watchTask?: WatchTaskSummary;
  }>(response);
}

export async function ensureArtifactWatch(artifactId: string, watchPreset: PredictionWatchPreset) {
  const response = await apiFetch(`/api/result-artifacts/${artifactId}/watch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watchPreset }),
  });
  return parseApiResponse<{ watchTask: WatchTaskSummary }>(response);
}

export async function fetchWatchTasks() {
  const response = await apiFetch("/api/watch-tasks");
  return parseApiResponse<{ items: WatchTaskSummary[] }>(response);
}

export async function runWatchTask(taskId: string) {
  const response = await apiFetch(`/api/watch-tasks/${taskId}/run`, {
    method: "POST",
  });
  return parseApiResponse<{
    taskId: string;
    taskType: PredictionWatchTaskType;
    platform: "douyin" | "xiaohongshu" | "kuaishou";
    executionStatus: PredictionExecutionStatus;
    budgetSnapshot: {
      baseBudget: number;
      actualUsed: number;
      cookieExtraBudget?: number;
    };
    degradeFlags: string[];
    degradeReason?: string;
    resultSnapshotRef: string;
    usedRouteChain: string[];
    run: WatchRunSummary;
    watchTask: WatchTaskSummary;
  }>(response);
}

/* ── 监控报告 API ────────────────────────────────── */

export interface MonitorReportSummary {
  reportId: string;
  taskId: string;
  runId: string;
  taskType: string;
  platform: string;
  title: string;
  markdown: string;
  signalStrength: string;
  keyFindings: string[];
  generatedAt: string;
  generationMethod: "llm" | "rule_fallback";
  llmModel?: string;
  tokensUsed?: number;
}

/** 获取最新报告（如果已有） */
export async function fetchLatestMonitorReport(taskId: string) {
  const response = await apiFetch(`/api/monitor/tasks/${taskId}/report`);
  return parseApiResponse<{ ok: boolean; report: MonitorReportSummary | null }>(response);
}

/** 生成新报告（基于最近一次执行的真实数据） */
export async function generateMonitorReport(taskId: string, runId?: string) {
  const response = await apiFetch(`/api/monitor/tasks/${taskId}/report/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  return parseApiResponse<{ ok: boolean; report: MonitorReportSummary }>(response);
}

/** 获取历史报告列表 */
export async function fetchMonitorReports(taskId: string) {
  const response = await apiFetch(`/api/monitor/tasks/${taskId}/reports`);
  return parseApiResponse<{ ok: boolean; reports: MonitorReportSummary[] }>(response);
}

/** 获取任务执行历史 */
export async function fetchMonitorTaskRuns(taskId: string, limit = 10) {
  const response = await apiFetch(`/api/monitor/tasks/${taskId}/runs?limit=${limit}`);
  return parseApiResponse<{ ok: boolean; runs: WatchRunSummary[]; total: number }>(response);
}
