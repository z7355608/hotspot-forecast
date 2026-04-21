/**
 * artifact-routes.ts
 * ═══════════════════════════════════════════════════════════════
 * 结果存档与监控任务路由处理函数
 * 负责：结果存档列表/详情/创建、监控任务列表/运行/查询、端点健康检查
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { nowIso, buildAppLink, notifySafely, readJsonBody, sendJson } from "../http-server-utils.js";
import { readConnectorStore, resolveCookieSecret, readEndpointHealthStore, writeEndpointHealthStore } from "../storage.js";
import {
  ensureWatchTaskForArtifact,
  getResultArtifactById,
  getWatchTask,
  getWatchTaskRun,
  listResultArtifactSummaries,
  listWatchTaskSummaries,
  persistWatchRun,
  toWatchTaskSummary,
  upsertResultArtifact,
} from "../artifacts.js";
import { runWatchTaskWithFallback, probeEndpointHealth } from "../watch-runtime.js";
import type { WatchPresetPayload } from "../types.js";

export async function handleListResultArtifacts(response: ServerResponse) {
  const items = await listResultArtifactSummaries();
  sendJson(response, 200, { items });
}

export async function handleGetResultArtifact(artifactId: string, response: ServerResponse) {
  const artifact = await getResultArtifactById(artifactId);
  if (!artifact) {
    sendJson(response, 404, { error: `Artifact ${artifactId} was not found.` });
    return;
  }
  sendJson(response, 200, { item: artifact });
}

export async function handleCreateResultArtifact(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<{
    snapshot?: Record<string, unknown>;
    createWatch?: boolean;
    watchPreset?: WatchPresetPayload;
  }>(request);
  if (!payload.snapshot || typeof payload.snapshot !== "object") {
    sendJson(response, 400, { error: "snapshot is required." });
    return;
  }
  const result = await upsertResultArtifact({
    snapshot: payload.snapshot,
    createWatch: payload.createWatch,
    watchPreset: payload.watchPreset,
  });
  sendJson(response, 200, result);
}

export async function handleCreateWatchForArtifact(
  artifactId: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<{ watchPreset?: WatchPresetPayload }>(request);
  if (!payload.watchPreset) {
    sendJson(response, 400, { error: "watchPreset is required." });
    return;
  }
  const watchTask = await ensureWatchTaskForArtifact({
    artifactId,
    watchPreset: payload.watchPreset,
  });
  sendJson(response, 200, { watchTask: toWatchTaskSummary(watchTask) });
}

export async function handleListWatchTasks(response: ServerResponse) {
  const items = await listWatchTaskSummaries();
  sendJson(response, 200, { items });
}

export async function handleRunWatchTask(taskId: string, response: ServerResponse) {
  const task = await getWatchTask(taskId);
  if (!task) {
    sendJson(response, 404, { error: `Watch task ${taskId} was not found.` });
    return;
  }
  const store = await readConnectorStore();
  const douyinCookie =
    task.platform === "douyin"
      ? await resolveCookieSecret(store.douyin?.encryptedSecretRef)
      : undefined;
  const runId = `run_${randomUUID()}`;
  const result = await runWatchTaskWithFallback({
    task,
    runId,
    cookie: douyinCookie ?? undefined,
  });
  await persistWatchRun(result);
  await notifySafely({
    eventType:
      result.run.executionStatus === "failed"
        ? "watch_failed"
        : result.run.executionStatus === "partial_success"
          ? "watch_degraded"
          : "watch_succeeded",
    occurredAt: nowIso(),
    title:
      result.run.executionStatus === "failed"
        ? "观察任务执行失败"
        : result.run.executionStatus === "partial_success"
          ? "观察任务已降级完成"
          : "观察任务执行完成",
    summary:
      result.run.degradeReason ||
      `${result.task.taskType} 已完成一轮复查，状态 ${result.run.executionStatus}。`,
    statusLabel: result.run.executionStatus,
    platforms: [result.task.platform],
    artifactId: result.task.artifactId,
    watchTaskId: result.task.taskId,
    degradeFlags: result.run.degradeFlags,
    link: buildAppLink("/history"),
  });
  sendJson(response, 200, {
    taskId: result.task.taskId,
    taskType: result.task.taskType,
    platform: result.task.platform,
    executionStatus: result.run.executionStatus,
    budgetSnapshot: result.run.budgetSnapshot,
    degradeFlags: result.run.degradeFlags,
    degradeReason: result.run.degradeReason,
    resultSnapshotRef: result.run.resultSnapshotRef,
    usedRouteChain: result.run.usedRouteChain,
    run: result.run,
    watchTask: toWatchTaskSummary(result.task),
  });
}

export async function handleGetWatchTaskRun(runId: string, response: ServerResponse) {
  const run = await getWatchTaskRun(runId);
  if (!run) {
    sendJson(response, 404, { error: `Run ${runId} was not found.` });
    return;
  }
  sendJson(response, 200, { item: run });
}

export async function handleProbeEndpointHealth(response: ServerResponse) {
  const store = await readConnectorStore();
  const douyinCookie = await resolveCookieSecret(store.douyin?.encryptedSecretRef);
  const result = await probeEndpointHealth({
    includeDouyin: true,
    includeXhs: true,
    includeKuaishou: true,
    douyinCookie: douyinCookie ?? undefined,
  });
  await writeEndpointHealthStore(result.store);
  sendJson(response, 200, {
    verifiedAt: nowIso(),
    items: result.entries,
  });
}

export async function handleGetEndpointHealth(response: ServerResponse) {
  const store = await readEndpointHealthStore();
  sendJson(response, 200, {
    items: Object.values(store).sort((left, right) => {
      if (left.capability === right.capability) {
        return left.path.localeCompare(right.path);
      }
      return left.capability.localeCompare(right.capability);
    }),
  });
}
