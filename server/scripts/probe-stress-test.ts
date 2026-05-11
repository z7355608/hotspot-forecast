/**
 * 压力测试：gemini-3-pro-preview 和 gemini-2.5-pro-preview-05-06 连续各跑 N 次。
 * 看 ablai 在这两个 channel 上的 429 命中率，以及成功时的耗时分布。
 * 同一段视频，复用同一次解析的 videoUrl。
 */
import "dotenv/config";
import { query } from "../legacy/database";
import { smartParseLink } from "../services/smart-link-parser";
import { parseVideo } from "../legacy/video-parser";

const SHARE_TEXT = `3.30 07/07 JVy:/ Z@M.Jv 跨境电商11月最新爆品，aSeller选品参考 # 跨境选品 # 亚马逊选品 # TikTok选品 # aSeller  https://v.douyin.com/A0AOKnfVKB8/ 复制此链接，打开Dou音搜索，直接观看视频！`;
const APOLLO_BASE = (process.env.THIRD_PARTY_LLM_BASE_URL || "https://api.ablai.top/v1").replace(/\/$/, "");
const APOLLO_KEY = process.env.THIRD_PARTY_LLM_API_KEY ?? "";
const ROUNDS_PER_MODEL = 3;
const COOLDOWN_MS = 5000;
const MODELS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview"];

const VIRAL_SCHEMA = {
  type: "object",
  properties: {
    breakdownSummary: { type: "string" },
    overallScore: { type: "number" },
    scoreDimensions: { type: "object", properties: { logic: { type: "number" }, emotion: { type: "number" }, visual: { type: "number" }, commercial: { type: "number" } }, required: ["logic","emotion","visual","commercial"], additionalProperties: false },
    coreLabels: { type: "array", items: { type: "string" } },
    oneLinerComment: { type: "string" },
    hookAnalysis: { type: "object", properties: { visualHook: { type: "string" }, audioHook: { type: "string" }, copyHookType: { type: "string" }, copyHookReason: { type: "string" }, hookImitationTip: { type: "string" } }, required: ["visualHook","audioHook","copyHookType","copyHookReason","hookImitationTip"], additionalProperties: false },
    rhythmAnalysis: { type: "object", properties: { stimulusIntervalSeconds: { type: "number" }, emotionCurve: { type: "string" }, dopamineNodes: { type: "array", items: { type: "string" } } }, required: ["stimulusIntervalSeconds","emotionCurve","dopamineNodes"], additionalProperties: false },
    scriptLogic: { type: "object", properties: { structureModules: { type: "array", items: { type: "string" } }, powerWords: { type: "array", items: { type: "string" } }, goldenQuotes: { type: "array", items: { type: "string" } } }, required: ["structureModules","powerWords","goldenQuotes"], additionalProperties: false },
    monetizationAnalysis: { type: "object", properties: { personaType: { type: "string" }, monetizationPoints: { type: "array", items: { type: "string" } }, conversionScript: { type: "string" } }, required: ["personaType","monetizationPoints","conversionScript"], additionalProperties: false },
    engagementEngineering: { type: "object", properties: { controversyTraps: { type: "string" }, predictedTopComments: { type: "array", items: { type: "string" } }, ctaType: { type: "string" } }, required: ["controversyTraps","predictedTopComments","ctaType"], additionalProperties: false },
    copyPoints: { type: "array", items: { type: "string" } },
    avoidPoints: { type: "array", items: { type: "string" } },
    migrationSteps: { type: "array", items: { type: "string" } },
    scriptSkeleton: { type: "string" },
    shootingGuide: { type: "object", properties: { shotComposition: { type: "string" }, performanceStyle: { type: "string" }, bgmStyle: { type: "string" } }, required: ["shotComposition","performanceStyle","bgmStyle"], additionalProperties: false },
    hookType: { type: "string" },
    contentStructure: { type: "string" },
    estimatedDuration: { type: "string" },
    targetAudience: { type: "string" },
  },
  required: ["breakdownSummary","overallScore","scoreDimensions","coreLabels","oneLinerComment","hookAnalysis","rhythmAnalysis","scriptLogic","monetizationAnalysis","engagementEngineering","copyPoints","avoidPoints","migrationSteps","scriptSkeleton","shootingGuide","hookType","contentStructure","estimatedDuration","targetAudience"],
  additionalProperties: false,
};

interface AttemptResult {
  model: string;
  round: number;
  ok: boolean;
  status: number;
  latencyMs: number;
  finishReason?: string;
  tokens?: { prompt?: number; completion?: number; total?: number };
  error?: string;
  jsonValid?: boolean;
}

async function callOnce(model: string, systemPrompt: string, videoUrl: string, videoMeta: string): Promise<AttemptResult> {
  const t0 = Date.now();
  const reqBody = {
    model,
    max_tokens: 16000,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `请拆解以下视频：\n\n${videoMeta}\n\n（视频内容请从下面的视频本身分析）` },
          { type: "image_url", image_url: { url: videoUrl, detail: "high" } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "viral_breakdown", strict: true, schema: VIRAL_SCHEMA },
    },
  };
  try {
    const resp = await fetch(`${APOLLO_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${APOLLO_KEY}` },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(180_000),
    });
    const dt = Date.now() - t0;
    if (!resp.ok) {
      const text = await resp.text();
      return { model, round: 0, ok: false, status: resp.status, latencyMs: dt, error: text.slice(0, 200) };
    }
    const json: any = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    let jsonValid = false;
    try { JSON.parse(content); jsonValid = true; } catch { /* invalid */ }
    return {
      model,
      round: 0,
      ok: true,
      status: 200,
      latencyMs: dt,
      finishReason: json.choices?.[0]?.finish_reason,
      tokens: { prompt: json.usage?.prompt_tokens, completion: json.usage?.completion_tokens, total: json.usage?.total_tokens },
      jsonValid,
    };
  } catch (e: any) {
    return { model, round: 0, ok: false, status: 0, latencyMs: Date.now() - t0, error: e?.message?.slice(0, 200) };
  }
}

async function main() {
  if (!APOLLO_KEY) { console.error("✗ THIRD_PARTY_LLM_API_KEY 未配置"); process.exit(1); }

  console.log(`Apollo endpoint: ${APOLLO_BASE}/chat/completions`);
  console.log(`每个模型连跑 ${ROUNDS_PER_MODEL} 次，间隔 ${COOLDOWN_MS}ms`);
  console.log(`模型: ${MODELS.join(", ")}\n`);

  const rows = await query<any[]>(
    `SELECT system_prompt_doubao FROM prompt_templates WHERE id = 'viral-breakdown-multimodal-v1' AND is_active = 1 ORDER BY version DESC LIMIT 1`,
  );
  const systemPrompt = String(rows[0].system_prompt_doubao);

  const smart = await smartParseLink(SHARE_TEXT);
  if (!smart.ok || !smart.sourceUrl) { console.error("✗ smartParseLink 失败"); process.exit(1); }
  const videoInfo = await parseVideo(smart.sourceUrl);
  if (!videoInfo.ok) { console.error(`✗ parseVideo 失败`); process.exit(1); }
  const videoUrl = videoInfo.videoUrl ?? videoInfo.videoUrls[0];
  const videoMeta = [
    `标题：${videoInfo.title}`,
    `平台：${videoInfo.platform}`,
    `点赞数：${videoInfo.stats?.likeCount || "未知"}`,
    `收藏数：${videoInfo.stats?.collectCount || "未知"}`,
    `原始链接：${smart.sourceUrl}`,
  ].join("\n");
  console.log(`videoUrl 已就绪（复用同一份）\n`);

  const results: AttemptResult[] = [];
  for (const model of MODELS) {
    console.log(`\n========== 模型: ${model} ==========`);
    for (let round = 1; round <= ROUNDS_PER_MODEL; round++) {
      console.log(`  → round ${round}/${ROUNDS_PER_MODEL} 开始…`);
      const r = await callOnce(model, systemPrompt, videoUrl, videoMeta);
      r.round = round;
      results.push(r);
      if (r.ok) {
        console.log(`    ✓ 200 ${r.latencyMs}ms finish=${r.finishReason} tokens=${r.tokens?.total} jsonValid=${r.jsonValid}`);
      } else {
        console.log(`    ✗ ${r.status} ${r.latencyMs}ms err=${r.error?.slice(0, 120)}`);
      }
      if (round < ROUNDS_PER_MODEL) {
        await new Promise(r => setTimeout(r, COOLDOWN_MS));
      }
    }
    // 跑下一个 model 前也冷却一下
    if (model !== MODELS[MODELS.length - 1]) {
      await new Promise(r => setTimeout(r, COOLDOWN_MS));
    }
  }

  console.log(`\n\n========== 汇总 ==========`);
  console.log(`| model                              | r | ok    | status | latencyMs | finish    | tokens   | jsonValid |`);
  console.log(`|------------------------------------|---|-------|--------|-----------|-----------|----------|-----------|`);
  for (const r of results) {
    console.log(`| ${r.model.padEnd(34)} | ${r.round} | ${(r.ok ? "✓" : "✗").padEnd(5)} | ${String(r.status).padEnd(6)} | ${String(r.latencyMs).padEnd(9)} | ${(r.finishReason ?? "-").padEnd(9)} | ${String(r.tokens?.total ?? "-").padEnd(8)} | ${r.jsonValid === true ? "yes" : (r.jsonValid === false ? "NO" : "-")} |`);
  }

  for (const model of MODELS) {
    const mResults = results.filter(r => r.model === model);
    const ok = mResults.filter(r => r.ok);
    const okRate = (ok.length / mResults.length * 100).toFixed(0);
    const avgMs = ok.length > 0 ? Math.round(ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length) : 0;
    const jsonValid = ok.filter(r => r.jsonValid).length;
    console.log(`\n${model}: 成功率 ${ok.length}/${mResults.length} (${okRate}%) | 平均耗时(成功): ${avgMs}ms | JSON 有效: ${jsonValid}/${ok.length}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
