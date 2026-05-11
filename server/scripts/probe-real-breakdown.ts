/**
 * 复刻 viral-breakdown-branch.ts 的真实 LLM 调用，用于诊断「输入到底是什么 / 返回是不是泛」。
 * 不动 prod 路径，只跑一次实测。
 */
import "dotenv/config";
import { query } from "../legacy/database";
import { smartParseLink } from "../services/smart-link-parser";
import { parseVideo } from "../legacy/video-parser";
import { resolveSystemPrompt } from "../legacy/prompt-engine";
import { callLLM } from "../legacy/llm-gateway";

// 用户原始抖音口令文本（含短链 + 标题 + tag）
const SHARE_TEXT = `3.30 07/07 JVy:/ Z@M.Jv 跨境电商11月最新爆品，aSeller选品参考 # 跨境选品 # 亚马逊选品 # TikTok选品 # aSeller  https://v.douyin.com/A0AOKnfVKB8/ 复制此链接，打开Dou音搜索，直接观看视频！`;

async function main() {
  console.log("=== Step 1: 读 DB 真 prompt ===");
  const rows = await query<any[]>(
    `SELECT id, version, is_active, preferred_model,
            LENGTH(system_prompt_doubao) AS doubao_len,
            LENGTH(system_prompt_gpt54)  AS gpt_len,
            LENGTH(system_prompt_claude46) AS claude_len,
            system_prompt_doubao
     FROM prompt_templates
     WHERE id = 'viral-breakdown-multimodal-v1'
     ORDER BY version DESC LIMIT 5`,
  );
  console.log(`命中 ${rows.length} 条版本：`);
  for (const r of rows) {
    console.log(`  v${r.version} active=${r.is_active} preferred=${r.preferred_model} doubao_len=${r.doubao_len} gpt_len=${r.gpt_len} claude_len=${r.claude_len}`);
  }
  if (rows.length > 0) {
    const top = rows[0];
    console.log(`\n--- top version system_prompt_doubao 前 1500 字 ---\n${String(top.system_prompt_doubao).slice(0, 1500)}\n...\n`);
  } else {
    console.log("⚠️ DB 没这条 prompt，会走文件 fallback");
  }

  console.log("\n=== Step 2a: smartParseLink 把口令展开成 URL ===");
  const t0 = Date.now();
  const smart = await smartParseLink(SHARE_TEXT);
  const smartMs = Date.now() - t0;
  console.log(`  smartParseLink ok=${smart.ok} kind=${smart.kind} (${smartMs}ms)`);
  console.log(`  sourceUrl=${smart.sourceUrl}`);
  console.log(`  platform=${smart.platform}`);
  if (!smart.ok || !smart.sourceUrl) {
    console.error(`✗ smartParseLink 失败: ${smart.error}`);
    process.exit(1);
  }

  console.log("\n=== Step 2b: parseVideo（线上链路同款） ===");
  const t1 = Date.now();
  const videoInfo = await parseVideo(smart.sourceUrl);
  const parseMs = Date.now() - t1;
  if (!videoInfo.ok) {
    console.error(`✗ parseVideo 失败: ${videoInfo.error}`);
    process.exit(1);
  }
  console.log(`✓ parseVideo 成功 (${parseMs}ms)`);
  console.log(`  title=${videoInfo.title}`);
  console.log(`  platform=${videoInfo.platform}`);
  console.log(`  coverUrl=${(videoInfo.coverUrl ?? "").slice(0, 100)}…`);
  console.log(`  videoUrl=${(videoInfo.videoUrl ?? "").slice(0, 100)}…`);
  console.log(`  videoUrls.len=${videoInfo.videoUrls.length}`);
  console.log(`  likeCount=${videoInfo.stats?.likeCount}`);

  console.log("\n=== Step 3: 加载 system prompt（resolveSystemPrompt 实际行为） ===");
  const systemPromptText = await resolveSystemPrompt(
    "viral-breakdown-multimodal-v1",
    "doubao",
    {},
    "FALLBACK_PLACEHOLDER", // 真实代码里是 BREAKDOWN_SYSTEM_PROMPT 常量，这里只看是否走了 DB
  );
  const usedFallback = systemPromptText === "FALLBACK_PLACEHOLDER";
  console.log(`  实际使用的 prompt 来源: ${usedFallback ? "❗ 文件 fallback（DB 无对应 active 行）" : "✓ DB prompt_templates"}`);
  console.log(`  prompt 长度: ${systemPromptText.length}`);
  console.log(`\n--- system prompt 前 600 字 ---\n${systemPromptText.slice(0, 600)}\n...\n`);

  const videoUrlForLlm = videoInfo.videoUrl ?? videoInfo.videoUrls[0];
  if (!videoUrlForLlm) {
    console.error("✗ 没拿到 videoUrl，跳过 LLM 测试");
    process.exit(1);
  }

  console.log("\n=== Step 4: 复刻真实 LLM 调用（apollo=Gemini-3.1-Pro + image_url=videoUrl + json_schema strict） ===");
  console.log(`  传给 LLM 的视频 URL: ${videoUrlForLlm.slice(0, 120)}…`);
  const videoMeta = [
    `标题：${videoInfo.title}`,
    `平台：${videoInfo.platform}`,
    `点赞数：${videoInfo.stats?.likeCount || "未知"}`,
    `收藏数：${videoInfo.stats?.collectCount || "未知"}`,
    `原始链接：${smart.sourceUrl}`,
  ].join("\n");

  const tLlm = Date.now();
  try {
    const resp = await callLLM({
      modelId: "apollo",
      maxTokens: 4000, // 对齐 Apollo 官方文档示例（生产用默认 65536，疑似 429 根因）
      messages: [
        { role: "system", content: systemPromptText },
        {
          role: "user",
          content: [
            { type: "text", text: `请拆解以下视频：\n\n${videoMeta}\n\n（视频内容请从下面的视频本身分析）` },
            { type: "image_url", image_url: { url: videoUrlForLlm, detail: "high" } },
          ],
        },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "viral_breakdown",
          strict: true,
          schema: {
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
          },
        },
      },
    });
    const llmMs = Date.now() - tLlm;
    console.log(`✓ LLM 返回 (${llmMs}ms)`);
    console.log(`  raw content len=${(resp.content ?? "").length}`);
    const parsed = JSON.parse(resp.content ?? "{}");
    console.log("\n=== Step 5: 完整返回 JSON ===");
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e: any) {
    const llmMs = Date.now() - tLlm;
    console.error(`✗ LLM 失败 (${llmMs}ms): ${e?.message?.slice(0, 500)}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
