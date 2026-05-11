import { ENV } from "../_core/env.js";

const APOLLO_IMAGE_MODEL = "gpt-image-2-all";

export interface ApolloImageResult {
  model: string;
  url: string | null;
  b64Json: string | null;
  revisedPrompt: string | null;
}

export interface GenerateApolloImageOptions {
  prompt: string;
  size?: string;
  timeoutMs?: number;
}

function buildImageEndpoint() {
  const rawBase = (ENV.thirdPartyImageBaseUrl || ENV.thirdPartyLlmBaseUrl || "https://api.ablai.top/v1").trim();
  const cleaned = rawBase
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/generations$/i, "");
  return `${cleaned}/images/generations`;
}

function getImageApiKey() {
  return ENV.thirdPartyImageApiKey || ENV.thirdPartyLlmApiKey || ENV.thirdPartyLlmVideoApiKey;
}

function extractFirstImage(payload: unknown): ApolloImageResult {
  const record = payload as {
    model?: string;
    data?: Array<{
      url?: string;
      b64_json?: string;
      revised_prompt?: string;
    }>;
  };
  const first = record.data?.[0];
  return {
    model: record.model || APOLLO_IMAGE_MODEL,
    url: first?.url ?? null,
    b64Json: first?.b64_json ?? null,
    revisedPrompt: first?.revised_prompt ?? null,
  };
}

async function requestImage(prompt: string, size: string | undefined, timeoutMs: number) {
  const apiKey = getImageApiKey();
  if (!apiKey) {
    throw new Error("缺少 Apollo 图片生成 key：请配置 APOLLO_IMAGE_API_KEY 或 THIRD_PARTY_LLM_API_KEY");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: APOLLO_IMAGE_MODEL,
      prompt,
      n: 1,
    };
    if (size) body.size = size;

    const resp = await fetch(buildImageEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`Apollo image API error ${resp.status}: ${text}`);
    }

    return extractFirstImage(await resp.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function generateApolloImage(options: GenerateApolloImageOptions): Promise<ApolloImageResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const primarySize = options.size ?? "1024x1536";
  try {
    return await requestImage(options.prompt, primarySize, timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/size|尺寸|dimension|invalid/i.test(message)) throw err;
    return requestImage(options.prompt, "1024x1024", timeoutMs);
  }
}

