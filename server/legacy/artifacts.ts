import { randomUUID } from "node:crypto";
import {
  readResultArtifactStore,
  readWatchTaskRunStore,
  readWatchTaskStore,
  writeResultArtifactStore,
  writeWatchTaskRunStore,
  writeWatchTaskStore,
} from "./storage.js";
import type {
  ResultArtifactStatus,
  StoredResultArtifact,
  StoredWatchTask,
  StoredWatchTaskRun,
  WatchPresetPayload,
} from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function buildArtifactStatus(
  artifact: StoredResultArtifact,
  watchTask?: StoredWatchTask,
): ResultArtifactStatus {
  return {
    artifactId: artifact.artifactId,
    savedAt: artifact.createdAt,
    watchTaskId: watchTask?.taskId ?? artifact.watchTaskId,
    watchStatus: watchTask?.status,
    lastWatchRunAt: artifact.lastWatchRunAt ?? watchTask?.lastRunAt,
    lastExecutionStatus: artifact.lastExecutionStatus ?? watchTask?.lastExecutionStatus,
  };
}

function toArtifactSummary(artifact: StoredResultArtifact, watchTask?: StoredWatchTask) {
  return {
    artifactId: artifact.artifactId,
    clientResultId: artifact.clientResultId,
    taskIntent: artifact.taskIntent,
    artifactType: artifact.artifactType,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    query: artifact.query,
    type: artifact.type,
    title: artifact.title,
    summary: artifact.summary,
    platform: artifact.platform,
    score: artifact.score,
    scoreLabel: artifact.scoreLabel,
    verdict: artifact.verdict,
    windowStrength: artifact.windowStrength,
    confidenceLabel: artifact.confidenceLabel,
    opportunityTitle: artifact.opportunityTitle,
    coreBet: artifact.coreBet,
    watchable: artifact.watchable,
    shareable: artifact.shareable,
    artifactStatus: buildArtifactStatus(artifact, watchTask),
  };
}

function normalizeSnapshot(snapshot: Record<string, unknown>) {
  const query = typeof snapshot.query === "string" ? snapshot.query : "未命名结果";
  const type = typeof snapshot.type === "string" ? snapshot.type : "趋势判断";
  const opportunityTitle =
    typeof snapshot.opportunityTitle === "string" ? snapshot.opportunityTitle : query;
  const title =
    typeof snapshot.title === "string" && snapshot.title.trim()
      ? snapshot.title
      : opportunityTitle;
  const summary =
    typeof snapshot.summary === "string" && snapshot.summary.trim()
      ? snapshot.summary
      : typeof snapshot.coreBet === "string"
        ? snapshot.coreBet
        : undefined;
  const platform = Array.isArray(snapshot.platform)
    ? snapshot.platform.filter((value): value is string => typeof value === "string")
    : [];
  return {
    clientResultId: typeof snapshot.id === "string" ? snapshot.id : undefined,
    taskIntent: typeof snapshot.taskIntent === "string" ? snapshot.taskIntent : undefined,
    artifactType:
      typeof snapshot.primaryArtifact === "object" &&
      snapshot.primaryArtifact &&
      typeof (snapshot.primaryArtifact as Record<string, unknown>).artifactType === "string"
        ? ((snapshot.primaryArtifact as Record<string, unknown>).artifactType as string)
        : typeof snapshot.artifactType === "string"
          ? snapshot.artifactType
          : undefined,
    query,
    type,
    title,
    summary,
    platform,
    score: typeof snapshot.score === "number" ? snapshot.score : undefined,
    scoreLabel: typeof snapshot.scoreLabel === "string" ? snapshot.scoreLabel : undefined,
    verdict: typeof snapshot.verdict === "string" ? snapshot.verdict : undefined,
    windowStrength:
      typeof snapshot.windowStrength === "string" ? snapshot.windowStrength : undefined,
    confidenceLabel:
      typeof snapshot.confidenceLabel === "string" ? snapshot.confidenceLabel : undefined,
    opportunityTitle,
    coreBet: typeof snapshot.coreBet === "string" ? snapshot.coreBet : undefined,
    watchable: typeof snapshot.taskIntent === "string"
      ? (typeof snapshot.primaryArtifact === "object" &&
        snapshot.primaryArtifact &&
        typeof (snapshot.primaryArtifact as Record<string, unknown>).watchable === "boolean"
          ? ((snapshot.primaryArtifact as Record<string, unknown>).watchable as boolean)
          : undefined)
      : undefined,
    shareable:
      typeof snapshot.primaryArtifact === "object" &&
      snapshot.primaryArtifact &&
      typeof (snapshot.primaryArtifact as Record<string, unknown>).shareable === "boolean"
        ? ((snapshot.primaryArtifact as Record<string, unknown>).shareable as boolean)
        : undefined,
  };
}

function calculateNextRunAt(scheduleTier: WatchPresetPayload["scheduleTier"], fromIso: string) {
  const next = new Date(fromIso);
  next.setHours(next.getHours() + (scheduleTier === "daily" ? 24 : 72));
  return next.toISOString();
}

export async function listResultArtifactSummaries() {
  const [artifactStore, watchTaskStore] = await Promise.all([
    readResultArtifactStore(),
    readWatchTaskStore(),
  ]);
  return Object.values(artifactStore)
    .map((artifact) =>
      toArtifactSummary(artifact, artifact.watchTaskId ? watchTaskStore[artifact.watchTaskId] : undefined),
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function getResultArtifactById(artifactId: string) {
  const [artifactStore, watchTaskStore] = await Promise.all([
    readResultArtifactStore(),
    readWatchTaskStore(),
  ]);
  // 先按 artifactId 精确查找，再按 clientResultId 回退查找
  const artifact: StoredResultArtifact | undefined =
    artifactStore[artifactId] ??
    Object.values(artifactStore).find((a) => a.clientResultId === artifactId);
  if (!artifact) return null;
  const watchTask = artifact.watchTaskId ? watchTaskStore[artifact.watchTaskId] : undefined;
  return {
    ...toArtifactSummary(artifact, watchTask),
    snapshot: artifact.snapshot,
  };
}

export async function upsertResultArtifact(params: {
  snapshot: Record<string, unknown>;
  createWatch?: boolean;
  watchPreset?: WatchPresetPayload;
}) {
  const { snapshot, createWatch = false, watchPreset } = params;
  const [artifactStore, watchTaskStore] = await Promise.all([
    readResultArtifactStore(),
    readWatchTaskStore(),
  ]);
  const normalized = normalizeSnapshot(snapshot);
  const existing = normalized.clientResultId
    ? Object.values(artifactStore).find((artifact) => artifact.clientResultId === normalized.clientResultId)
    : undefined;
  const timestamp = nowIso();
  const artifactId = existing?.artifactId ?? `artifact_${randomUUID()}`;
  const artifact: StoredResultArtifact = {
    artifactId,
    clientResultId: normalized.clientResultId,
    taskIntent: normalized.taskIntent,
    artifactType: normalized.artifactType,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    query: normalized.query,
    type: normalized.type,
    title: normalized.title,
    summary: normalized.summary,
    platform: normalized.platform,
    score: normalized.score,
    scoreLabel: normalized.scoreLabel,
    verdict: normalized.verdict,
    windowStrength: normalized.windowStrength,
    confidenceLabel: normalized.confidenceLabel,
    opportunityTitle: normalized.opportunityTitle,
    coreBet: normalized.coreBet,
    watchable: normalized.watchable,
    shareable: normalized.shareable,
    watchTaskId: existing?.watchTaskId,
    lastWatchRunAt: existing?.lastWatchRunAt,
    lastExecutionStatus: existing?.lastExecutionStatus,
    snapshot,
  };

  artifactStore[artifactId] = artifact;
  await writeResultArtifactStore(artifactStore);

  let watchTask: StoredWatchTask | undefined;
  if (createWatch) {
    if (!watchPreset) {
      throw new Error("createWatch requires a watchPreset payload.");
    }
    watchTask = await ensureWatchTaskForArtifact({
      artifactId,
      watchPreset,
    });
    artifact.watchTaskId = watchTask.taskId;
    artifact.updatedAt = nowIso();
    artifactStore[artifactId] = artifact;
    await writeResultArtifactStore(artifactStore);
  } else if (artifact.watchTaskId) {
    watchTask = watchTaskStore[artifact.watchTaskId];
  }

  return {
    artifact: {
      ...toArtifactSummary(artifact, watchTask),
      snapshot: artifact.snapshot,
    },
    watchTask: watchTask ? toWatchTaskSummary(watchTask) : undefined,
  };
}

export async function ensureWatchTaskForArtifact(params: {
  artifactId: string;
  watchPreset: WatchPresetPayload;
}) {
  const { artifactId, watchPreset } = params;
  const [artifactStore, watchTaskStore] = await Promise.all([
    readResultArtifactStore(),
    readWatchTaskStore(),
  ]);
  const artifact = artifactStore[artifactId];
  if (!artifact) {
    throw new Error(`Artifact ${artifactId} was not found.`);
  }

  if (artifact.watchTaskId && watchTaskStore[artifact.watchTaskId]) {
    return watchTaskStore[artifact.watchTaskId];
  }

  const now = nowIso();
  const taskId = `watch_${randomUUID()}`;
  const task: StoredWatchTask = {
    taskId,
    artifactId,
    platform: watchPreset.platform,
    taskType: watchPreset.taskType,
    priority: watchPreset.priority,
    scheduleTier: watchPreset.scheduleTier,
    status: "pending",
    queryPayload: watchPreset.queryPayload,
    createdAt: now,
    updatedAt: now,
    nextRunAt: calculateNextRunAt(watchPreset.scheduleTier, now),
  };

  watchTaskStore[taskId] = task;
  artifact.watchTaskId = taskId;
  artifact.updatedAt = now;
  artifactStore[artifactId] = artifact;

  await Promise.all([
    writeWatchTaskStore(watchTaskStore),
    writeResultArtifactStore(artifactStore),
  ]);

  return task;
}

export function toWatchTaskSummary(task: StoredWatchTask) {
  return {
    taskId: task.taskId,
    artifactId: task.artifactId,
    platform: task.platform,
    taskType: task.taskType,
    priority: task.priority,
    scheduleTier: task.scheduleTier,
    status: task.status,
    lastRunAt: task.lastRunAt,
    nextRunAt: task.nextRunAt,
    resultSnapshotRef: task.resultSnapshotRef,
    lastExecutionStatus: task.lastExecutionStatus,
    degradeFlags: task.degradeFlags ?? [],
    degradeReason: task.degradeReason,
    budgetSnapshot: task.budgetSnapshot,
  };
}

export async function listWatchTaskSummaries() {
  const watchTaskStore = await readWatchTaskStore();
  return Object.values(watchTaskStore)
    .map(toWatchTaskSummary)
    .sort((left, right) => {
      const leftTime = left.lastRunAt ?? "";
      const rightTime = right.lastRunAt ?? "";
      return Date.parse(rightTime || "1970-01-01") - Date.parse(leftTime || "1970-01-01");
    });
}

export async function getWatchTask(taskId: string) {
  const watchTaskStore = await readWatchTaskStore();
  return watchTaskStore[taskId] ?? null;
}

export async function persistWatchRun(params: {
  task: StoredWatchTask;
  run: StoredWatchTaskRun;
}) {
  const { task, run } = params;
  const [artifactStore, watchTaskStore, watchRunStore] = await Promise.all([
    readResultArtifactStore(),
    readWatchTaskStore(),
    readWatchTaskRunStore(),
  ]);
  watchTaskStore[task.taskId] = task;
  watchRunStore[run.runId] = run;

  const artifact = artifactStore[task.artifactId];
  if (artifact) {
    artifact.watchTaskId = task.taskId;
    artifact.lastWatchRunAt = task.lastRunAt;
    artifact.lastExecutionStatus = task.lastExecutionStatus;
    artifact.updatedAt = nowIso();
    artifactStore[artifact.artifactId] = artifact;
  }

  await Promise.all([
    writeWatchTaskStore(watchTaskStore),
    writeWatchTaskRunStore(watchRunStore),
    writeResultArtifactStore(artifactStore),
  ]);
}

export async function getWatchTaskRun(runId: string) {
  const watchTaskRunStore = await readWatchTaskRunStore();
  return watchTaskRunStore[runId] ?? null;
}
