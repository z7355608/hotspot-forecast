import type { ServerResponse } from "node:http";
import { createModuleLogger } from "../../legacy/logger.js";
import { getTaskSnapshot } from "./task-runner.js";

const log = createModuleLogger("PredictionStatus");

/**
 * GET /api/predictions/:taskId/status
 *
 * 客户端在切回页面 / 重连时拉任务快照。
 * 返回:{ taskId, status, progressEvents[], result?, error?, timestamps }
 * 找不到 task → 404
 */
export async function handleGetTaskStatus(
  taskId: string,
  response: ServerResponse,
): Promise<void> {
  if (!taskId || taskId.length > 64) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "invalid taskId" }));
    return;
  }

  try {
    const snapshot = await getTaskSnapshot(taskId);
    if (!snapshot) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "task not found", taskId }));
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(snapshot));
  } catch (err) {
    log.error({ err, taskId }, "status handler failed");
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "internal error" }));
  }
}
