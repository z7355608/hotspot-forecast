/**
 * Eval runner: live-predictions.topic
 *
 * 跑法:
 *   ARK_API_KEY=xxx pnpm tsx evals/topic-suggest/run.ts --tag baseline
 *   ARK_API_KEY=xxx pnpm tsx evals/topic-suggest/run.ts --tag after-tweak
 *
 * 读 cases.jsonl,对每个 case 调用与生产**字符级一致**的 prompt builder,
 * 走 llm-gateway.callLLM(豆包),把输出 + 解析结果 + 耗时 + 成本 写到 reports/<tag>.jsonl。
 *
 * 改 prompt:改 server/legacy/prompts/topic-prompt-builder.ts(主流程也用这个文件)。
 *
 * 注意:
 * - 跑 evals 会真实消耗 LLM API 配额。10 case × 1 次调用 ≈ ¥0.05–0.15。
 * - 如果想快速 "干跑" 不消耗配额,加 --dry-run 只生成 prompt 不调用 LLM。
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { callLLM } from "../../server/legacy/llm-gateway.js";
import {
  buildTopicMessages,
  type TopicPromptInput,
} from "../../server/legacy/prompts/topic-prompt-builder.js";

// ───── 解析参数 ─────

const args = process.argv.slice(2);
const tagIdx = args.indexOf("--tag");
const tag = tagIdx >= 0 ? args[tagIdx + 1] : new Date().toISOString().replace(/[:.]/g, "-");
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = join(__dirname, "cases.jsonl");
const reportsDir = join(__dirname, "reports");

// ───── 读 cases ─────

interface Case {
  id: string;
  input: {
    prompt: string;
    userProfile?: { platforms?: string[]; industries?: string[] };
  };
  context_hint?: string;
  expected_qualities?: string[];
}

const cases: Case[] = readFileSync(casesPath, "utf8")
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l))
  .slice(0, limit);

console.log(`📋 Loaded ${cases.length} cases from cases.jsonl`);
console.log(`🏷  Tag: ${tag}${dryRun ? "  [DRY-RUN]" : ""}`);

// ───── Mock context 构造 ─────
//
// 真实生产里,topSampleTitles / lowFollowerInfo / commentKeywords / demandSignals
// 来自 TikHub 抓的实时数据。evals 离线跑,我们用一份"代表性 fixture"。
//
// 第一版:每个 case 用同一份"中等热度赛道"的占位文本,确保 prompt 不空。
// 后续:可以按 case.id 配置不同 fixture,模拟"冷启动 / 红海 / 黑马赛道"等场景。

function makeMockContext(seedTopic: string): Omit<TopicPromptInput, "seedTopic"> {
  return {
    topSampleTitles: [
      `1. 「${seedTopic}」相关爆款标题示例 A — 80 万赞 / 3.2 万评论 / 抖音`,
      `2. 「${seedTopic}」相关爆款标题示例 B — 45 万赞 / 1.8 万评论 / 小红书`,
      `3. 「${seedTopic}」相关爆款标题示例 C — 22 万赞 / 9 千评论 / 抖音`,
      `4. 「${seedTopic}」相关爆款标题示例 D — 12 万赞 / 4 千评论 / 快手`,
    ].join("\n"),
    lowFollowerInfo: [
      `账号「示例小账号 1」(粉丝 3,200) — 互动比平均高 4.2x`,
      `账号「示例小账号 2」(粉丝 8,500) — 互动比平均高 2.7x`,
    ].join("\n"),
    commentKeywords: "新手友好、价格、避坑、对比、真实",
    demandSignals: "用户重点想问:① 这个适合我吗 ② 性价比如何 ③ 有没有避坑指南",
    noSampleWarning: "",
    asOfDate: "2026-04-29",
  };
}

// ───── 跑每条 case ─────

interface Result {
  id: string;
  input: Case["input"];
  prompt: { system: string; user: string };
  output?: unknown;
  parsed?: unknown;
  error?: string;
  latencyMs: number;
  tokens?: { prompt: number; completion: number };
}

const results: Result[] = [];

for (const c of cases) {
  const t0 = Date.now();
  const ctx = makeMockContext(c.input.prompt);
  const messages = await buildTopicMessages({
    seedTopic: c.input.prompt,
    ...ctx,
  });

  if (dryRun) {
    results.push({
      id: c.id,
      input: c.input,
      prompt: messages,
      latencyMs: Date.now() - t0,
    });
    console.log(`  · ${c.id} dry-run prompt 长度=${messages.user.length}`);
    continue;
  }

  try {
    const resp = await callLLM({
      modelId: "doubao",
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      maxTokens: 2000,
      temperature: 0.4,
      timeoutMs: 30_000, // evals 给比生产更宽松的超时,排除网络抖动
    });

    let parsed: unknown = null;
    const jsonMatch = resp.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // ignore parse error,parsed 保持 null
      }
    }

    results.push({
      id: c.id,
      input: c.input,
      prompt: messages,
      output: resp.content,
      parsed,
      latencyMs: Date.now() - t0,
      tokens: { prompt: resp.promptTokens, completion: resp.completionTokens },
    });
    console.log(
      `  ✓ ${c.id}  ${Date.now() - t0}ms  tokens=${resp.promptTokens}+${resp.completionTokens}  parsed=${
        parsed ? "OK" : "FAIL"
      }`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      id: c.id,
      input: c.input,
      prompt: messages,
      error: msg,
      latencyMs: Date.now() - t0,
    });
    console.log(`  ✗ ${c.id}  ${msg}`);
  }
}

// ───── 写报告 ─────

if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

const reportPath = join(reportsDir, `${tag}.jsonl`);
writeFileSync(reportPath, results.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ───── 汇总 ─────

const ok = results.filter((r) => !r.error && r.parsed).length;
const failed = results.length - ok;
const avgLatency = Math.round(
  results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, results.length),
);
const totalPromptTokens = results.reduce((s, r) => s + (r.tokens?.prompt ?? 0), 0);
const totalCompletionTokens = results.reduce((s, r) => s + (r.tokens?.completion ?? 0), 0);

console.log(`\n📄 Wrote ${results.length} results to ${reportPath}`);
console.log(
  `📊 ok=${ok}  failed=${failed}  avg-latency=${avgLatency}ms  tokens=${totalPromptTokens}+${totalCompletionTokens}`,
);

// ───── 后续(还没接通)─────
//
// TODO: LLM-as-judge 阶段
//   for each result:
//     judge_prompt = `读 rubric.md,对照 expected_qualities,给输出打分(0/1 per quality)`
//     judge_output = await callLLM({ modelId: "claude46" or "gpt54", ... })
//     聚合到 reports/<tag>.summary.json
//
// TODO: 跨 tag diff
//   pnpm tsx evals/topic-suggest/diff.ts baseline after-tweak
//   → markdown 报告:每个 case 分数变化 + 几条值得人工看的样本

if (failed > 0 && !dryRun) {
  process.exitCode = 1;
}
