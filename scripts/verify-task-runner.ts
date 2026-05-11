/**
 * 一次性 sanity check:验证 task-runner 模块端到端工作
 *   1. createTask 写入行
 *   2. appendProgress 节流写
 *   3. completeTask 落 final result + status='done'
 *   4. getTaskSnapshot 读回完整数据
 *
 * 跑法:pnpm tsx scripts/verify-task-runner.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  createTask,
  appendProgress,
  completeTask,
  failTask,
  getTaskSnapshot,
  _resetForTest,
} from "../server/services/prediction-tasks/task-runner.js";

async function main() {
  _resetForTest();

  const taskId = `test_${randomUUID()}`;
  console.log(`taskId = ${taskId}\n`);

  console.log("→ createTask");
  await createTask(taskId, "test-user-001", "ai 科技选题", { prompt: "ai 科技选题" });

  console.log("→ appendProgress × 3 (节流期内,只第一次写 DB)");
  appendProgress(taskId, { type: "platform_start", platform: "douyin", platformName: "抖音" });
  appendProgress(taskId, { type: "llm_start" });
  appendProgress(taskId, { type: "llm_done" });
  await new Promise((r) => setTimeout(r, 50));

  let snap = await getTaskSnapshot(taskId);
  console.log(`  status=${snap?.status} events=${snap?.progressEvents.length}`);

  console.log("→ 等 300ms 让节流过期,再写一次");
  await new Promise((r) => setTimeout(r, 300));
  appendProgress(taskId, { type: "platform_done", platform: "douyin", platformName: "抖音", status: "success", contentCount: 12, hotCount: 2 });
  await new Promise((r) => setTimeout(r, 50));

  console.log("→ completeTask(强制 flush 全部 in-memory events + final result)");
  await completeTask(taskId, { result: { suggestions: ["选题 A", "选题 B"] } });

  snap = await getTaskSnapshot(taskId);
  if (!snap) {
    console.error("❌ snapshot null after complete");
    process.exit(1);
  }
  console.log(`  status=${snap.status} events=${snap.progressEvents.length} hasResult=${snap.result !== null}`);
  console.log(`  events types: ${snap.progressEvents.map((e) => e.type).join(", ")}`);

  if (snap.status !== "done") throw new Error(`expected done, got ${snap.status}`);
  if (snap.progressEvents.length !== 4) throw new Error(`expected 4 events, got ${snap.progressEvents.length}`);
  if (!snap.result) throw new Error("expected result, got null");

  // failTask 测试
  const failTaskId = `test_${randomUUID()}`;
  await createTask(failTaskId, "test-user-001", "fail prompt", {});
  appendProgress(failTaskId, { type: "llm_start" });
  await failTask(failTaskId, "test failure message");
  const failSnap = await getTaskSnapshot(failTaskId);
  if (failSnap?.status !== "error") throw new Error(`expected error, got ${failSnap?.status}`);
  if (failSnap.error !== "test failure message") throw new Error(`error msg mismatch`);

  console.log("\n✅ all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ verify failed:", err);
    process.exit(1);
  });
