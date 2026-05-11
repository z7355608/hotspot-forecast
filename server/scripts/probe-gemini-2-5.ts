/**
 * 直连 Apollo endpoint 测 gemini-2.5-pro-preview-05-06（降级模型候选）。
 * 用同一条抖音视频 + 同一个 system prompt（DB 真版本）+ 同一个 json_schema。
 * 不走 callLLM 的重试/降级链，纯 fetch，看 Gemini 2.5 是否更稳。
 */
import "dotenv/config";
import { query } from "../legacy/database";
import { smartParseLink } from "../services/smart-link-parser";
import { parseVideo } from "../legacy/video-parser";

const SHARE_TEXT = `3.30 07/07 JVy:/ Z@M.Jv 跨境电商11月最新爆品，aSeller选品参考 # 跨境选品 # 亚马逊选品 # TikTok选品 # aSeller  https://v.douyin.com/A0AOKnfVKB8/ 复制此链接，打开Dou音搜索，直接观看视频！`;
const APOLLO_BASE = (process.env.THIRD_PARTY_LLM_BASE_URL || "https://api.ablai.top/v1").replace(/\/$/, "");
const APOLLO_KEY = process.env.THIRD_PARTY_LLM_API_KEY ?? "";
const MODEL = process.env.PROBE_MODEL || "gemini-3.1-pro-preview-thinking-medium"; // 测 3.1 thinking-medium

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

async function main() {
  if (!APOLLO_KEY) {
    console.error("✗ THIRD_PARTY_LLM_API_KEY 未配置");
    process.exit(1);
  }
  console.log(`→ Apollo endpoint = ${APOLLO_BASE}/chat/completions`);
  console.log(`→ model = ${MODEL}`);

  console.log("\n=== Step 1: 读 DB system prompt（doubao 列） ===");
  const rows = await query<any[]>(
    `SELECT system_prompt_doubao FROM prompt_templates
     WHERE id = 'viral-breakdown-multimodal-v1' AND is_active = 1
     ORDER BY version DESC LIMIT 1`,
  );
  if (rows.length === 0) {
    console.error("✗ 没找到 active prompt");
    process.exit(1);
  }
  const systemPromptText = String(rows[0].system_prompt_doubao);
  console.log(`  prompt 长度: ${systemPromptText.length}`);

  console.log("\n=== Step 2: 解析视频拿 videoUrl ===");
  const smart = await smartParseLink(SHARE_TEXT);
  if (!smart.ok || !smart.sourceUrl) { console.error("✗ smartParseLink 失败"); process.exit(1); }
  const videoInfo = await parseVideo(smart.sourceUrl);
  if (!videoInfo.ok) { console.error(`✗ parseVideo 失败: ${videoInfo.error}`); process.exit(1); }
  const videoUrl = videoInfo.videoUrl ?? videoInfo.videoUrls[0];
  if (!videoUrl) { console.error("✗ 没拿到 videoUrl"); process.exit(1); }
  console.log(`  title=${videoInfo.title}`);
  console.log(`  videoUrl=${videoUrl.slice(0, 100)}…`);

  const videoMeta = [
    `标题：${videoInfo.title}`,
    `平台：${videoInfo.platform}`,
    `点赞数：${videoInfo.stats?.likeCount || "未知"}`,
    `收藏数：${videoInfo.stats?.collectCount || "未知"}`,
    `原始链接：${smart.sourceUrl}`,
  ].join("\n");

  console.log("\n=== Step 3: 直连 Apollo 调 Gemini 2.5（带 json_schema strict） ===");
  const t0 = Date.now();
  const reqBody = {
    model: MODEL,
    max_tokens: Number(process.env.PROBE_MAX_TOKENS) || 16000,
    messages: [
      { role: "system", content: systemPromptText },
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

  let resp;
  try {
    resp = await fetch(`${APOLLO_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${APOLLO_KEY}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e: any) {
    console.error(`✗ fetch 异常 (${Date.now() - t0}ms): ${e?.message}`);
    process.exit(1);
  }
  const dt = Date.now() - t0;

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`✗ HTTP ${resp.status} (${dt}ms): ${text.slice(0, 800)}`);
    process.exit(1);
  }

  const json: any = await resp.json();
  console.log(`✓ 200 OK (${dt}ms)`);
  console.log(`  usage: prompt=${json.usage?.prompt_tokens} completion=${json.usage?.completion_tokens} total=${json.usage?.total_tokens}`);
  const content = json.choices?.[0]?.message?.content ?? "";
  console.log(`  content len=${content.length}`);
  console.log(`  finish_reason=${json.choices?.[0]?.finish_reason}`);

  console.log("\n=== Step 4: 完整返回 JSON ===");
  try {
    const parsed = JSON.parse(content);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(content);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
