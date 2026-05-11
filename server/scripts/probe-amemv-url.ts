/**
 * 探针：用 hybrid 端点返回的 api.amemv.com 播放接口 URL（不是 zjcdn.com 直链）喂给 LLM。
 * 看 OpenAI / Gemini 两边是否都能下载成功。
 *
 * 跑：gpt-5.5（之前抖音 zjcdn 直链下载超时）+ gemini-2.5（之前能下载 zjcdn）
 * 用 amemv URL 替换后：
 *   - 如果 gpt-5.5 也能下载成功 → 证明 amemv URL 是海外可访问的 → 这条路可走
 *   - 如果 gpt-5.5 仍超时 → amemv URL 也被 geo-block → B 方案得搭 S3
 */
import "dotenv/config";
import { query } from "../legacy/database";
import { getTikHub } from "../legacy/tikhub";

const SHARE_URL = "https://v.douyin.com/A0AOKnfVKB8/";
const APOLLO_BASE = (process.env.THIRD_PARTY_LLM_BASE_URL || "https://api.ablai.top/v1").replace(/\/$/, "");
const APOLLO_KEY = process.env.THIRD_PARTY_LLM_API_KEY ?? "";

async function getAmemvUrl(): Promise<{ amemvUrl: string; zjcdnUrl: string; meta: any }> {
  const res = await getTikHub<any>("/api/v1/hybrid/video_data", {
    url: SHARE_URL,
    base64_url: false,
    minimal: false,
  });
  if (!res.ok) throw new Error(`hybrid endpoint failed: ${res.httpStatus}`);
  const data: any = res.payload?.data;
  const video: any = data?.video ?? data?.aweme_detail?.video;
  const urlList: string[] = video?.play_addr?.url_list ?? [];
  const amemv = urlList.find((u) => u.includes("amemv.com"));
  const zjcdn = urlList.find((u) => u.includes("zjcdn.com")) ?? urlList[0];
  if (!amemv) throw new Error("hybrid endpoint 没返回 amemv.com URL");
  return {
    amemvUrl: amemv,
    zjcdnUrl: zjcdn,
    meta: {
      title: data?.desc ?? data?.aweme_detail?.desc,
      likeCount: data?.statistics?.digg_count,
      collectCount: data?.statistics?.collect_count,
    },
  };
}

interface CallResult {
  model: string;
  videoUrlType: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  finishReason?: string;
  contentSnippet?: string;
}

async function callLLM(model: string, videoUrl: string, videoUrlType: string, systemPrompt: string, videoMeta: string): Promise<CallResult> {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${APOLLO_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${APOLLO_KEY}` },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
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
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const dt = Date.now() - t0;
    if (!resp.ok) {
      const text = await resp.text();
      return { model, videoUrlType, ok: false, status: resp.status, latencyMs: dt, error: text.slice(0, 250) };
    }
    const json: any = await resp.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    return {
      model,
      videoUrlType,
      ok: true,
      status: 200,
      latencyMs: dt,
      finishReason: json.choices?.[0]?.finish_reason,
      contentSnippet: content.slice(0, 350),
    };
  } catch (e: any) {
    return { model, videoUrlType, ok: false, status: 0, latencyMs: Date.now() - t0, error: e?.message?.slice(0, 250) };
  }
}

async function main() {
  if (!APOLLO_KEY) { console.error("✗ THIRD_PARTY_LLM_API_KEY 未配置"); process.exit(1); }

  console.log("=== Step 1: 拿 amemv 播放 URL ===");
  const { amemvUrl, zjcdnUrl, meta } = await getAmemvUrl();
  console.log(`  amemv URL: ${amemvUrl.slice(0, 130)}…`);
  console.log(`  zjcdn URL: ${zjcdnUrl.slice(0, 130)}…`);
  console.log(`  title: ${meta.title}`);

  console.log("\n=== Step 2: 读 prompt ===");
  const rows = await query<any[]>(`SELECT system_prompt_doubao FROM prompt_templates WHERE id = 'viral-breakdown-multimodal-v1' AND is_active = 1 ORDER BY version DESC LIMIT 1`);
  const systemPrompt = String(rows[0].system_prompt_doubao);
  const videoMeta = `标题：${meta.title}\n点赞数：${meta.likeCount}\n收藏数：${meta.collectCount}`;

  console.log("\n=== Step 3: 4 个组合各跑一次 ===");
  // 4 个组合：gpt-5.5 × {amemv, zjcdn} + gemini-2.5 × {amemv, zjcdn}
  // 主要看 gpt-5.5 + amemv 是否能成功
  const cases: { model: string; url: string; type: string }[] = [
    { model: "gpt-5.5",                       url: amemvUrl, type: "amemv (api gateway)" },
    { model: "gpt-5.5",                       url: zjcdnUrl, type: "zjcdn (CDN, 之前超时)" },
    { model: "gemini-2.5-pro-preview-05-06",  url: amemvUrl, type: "amemv (api gateway)" },
    { model: "gemini-2.5-pro-preview-05-06",  url: zjcdnUrl, type: "zjcdn (CDN, 基线)" },
  ];

  const results: CallResult[] = [];
  for (const c of cases) {
    console.log(`\n  → ${c.model.padEnd(35)} | ${c.type}`);
    const r = await callLLM(c.model, c.url, c.type, systemPrompt, videoMeta);
    results.push(r);
    if (r.ok) {
      console.log(`    ✓ 200 ${r.latencyMs}ms finish=${r.finishReason}`);
      console.log(`    content snippet: ${r.contentSnippet?.replace(/\n/g, " ")}`);
    } else {
      console.log(`    ✗ ${r.status} ${r.latencyMs}ms`);
      console.log(`    err: ${r.error}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log("\n\n========== 汇总 ==========");
  console.log(`| model                              | url 类型                     | ok | status | latencyMs |`);
  console.log(`|------------------------------------|------------------------------|----|--------|-----------|`);
  for (const r of results) {
    console.log(`| ${r.model.padEnd(34)} | ${r.videoUrlType.padEnd(28)} | ${r.ok ? "✓" : "✗"}  | ${String(r.status).padEnd(6)} | ${String(r.latencyMs).padEnd(9)} |`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
