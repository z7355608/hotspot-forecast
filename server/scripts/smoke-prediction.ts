/**
 * P0-A 验证 smoke:跑一次最小预测,证明主链路 5 处原 forge 调用切到 doubao 后真能跑通。
 * 用法:pnpm tsx server/scripts/smoke-prediction.ts
 */
import "dotenv/config";
import { runLivePrediction } from "../legacy/live-predictions";
import type { PredictionRequestDraft } from "../../client/src/app/store/prediction-types";

async function main() {
  const draft: PredictionRequestDraft = {
    prompt: "AI 工具 干货",
    evidenceItems: [],
    selectedPlatforms: ["douyin"],
    connectedPlatforms: [],
    personalizationMode: "public",
  };

  console.log("=== smoke: runLivePrediction with prompt='AI 工具 干货' ===\n");
  const t0 = Date.now();
  const events: string[] = [];
  try {
    const result = await runLivePrediction(draft, (ev) => {
      events.push(`${(Date.now() - t0)}ms: ${ev.type ?? "?"}`);
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✅ 主链路完成:${elapsed}s`);
    console.log(`progress events: ${events.length}`);
    for (const e of events.slice(0, 30)) console.log(`  · ${e}`);

    // 关键字段:topic suggestions(主流程产出物)
    const r = result as Record<string, unknown>;
    const topics = (r.aiTopicSuggestions as unknown[]) ?? (r.topicSuggestions as unknown[]) ?? [];
    console.log(`\n选题数: ${topics.length}`);
    for (const t of (topics as Array<Record<string, unknown>>).slice(0, 3)) {
      console.log(`  · ${t.title ?? t.topic ?? "(unknown)"}`);
    }
  } catch (err) {
    console.error("\n❌ runLivePrediction 失败:", err instanceof Error ? err.message : String(err));
    console.log(`progress events 已触发 ${events.length} 个:`);
    for (const e of events.slice(0, 30)) console.log(`  · ${e}`);
    process.exit(1);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
