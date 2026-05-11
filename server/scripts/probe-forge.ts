/** ad-hoc probe — forge LLM 健康度(2026-04-30) */
import "dotenv/config";
import { callLLM } from "../legacy/llm-gateway";

async function main() {
  console.log("=== probe forge ===");
  try {
    const r = await callLLM({ modelId: "forge", messages: [{ role: "user", content: "hi" }], maxTokens: 5, timeoutMs: 10000 });
    console.log("forge OK:", r.content.slice(0, 50));
  } catch (e) {
    console.log("forge FAIL:", String(e).slice(0, 200));
  }
  console.log("\n=== probe doubao ===");
  try {
    const r = await callLLM({ modelId: "doubao", messages: [{ role: "user", content: "hi" }], maxTokens: 5, timeoutMs: 10000 });
    console.log("doubao OK:", r.content.slice(0, 50));
  } catch (e) {
    console.log("doubao FAIL:", String(e).slice(0, 200));
  }
  console.log("\n=== probe apollo ===");
  try {
    const r = await callLLM({ modelId: "apollo", messages: [{ role: "user", content: "hi" }], maxTokens: 5, timeoutMs: 15000 });
    console.log("apollo OK:", r.content.slice(0, 50));
  } catch (e) {
    console.log("apollo FAIL:", String(e).slice(0, 200));
  }
  console.log("\n=== probe gpt54 ===");
  try {
    const r = await callLLM({ modelId: "gpt54", messages: [{ role: "user", content: "hi" }], maxTokens: 5, timeoutMs: 15000 });
    console.log("gpt54 OK:", r.content.slice(0, 50));
  } catch (e) {
    console.log("gpt54 FAIL:", String(e).slice(0, 200));
  }
  console.log("\n=== probe claude46 ===");
  try {
    const r = await callLLM({ modelId: "claude46", messages: [{ role: "user", content: "hi" }], maxTokens: 5, timeoutMs: 15000 });
    console.log("claude46 OK:", r.content.slice(0, 50));
  } catch (e) {
    console.log("claude46 FAIL:", String(e).slice(0, 200));
  }
  process.exit(0);
}
main();
