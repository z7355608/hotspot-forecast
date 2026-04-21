/**
 * volc-asr.ts — 火山引擎大模型录音文件极速版识别服务
 *
 * 接口文档：https://www.volcengine.com/docs/6561/1631584
 * 接口地址：POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash
 *
 * 鉴权方式（旧版控制台）：
 *   X-Api-App-Key:     VOLC_ASR_APP_KEY
 *   X-Api-Access-Key:  VOLC_ASR_ACCESS_KEY
 *   X-Api-Resource-Id: volc.bigasr.auc_turbo
 *   X-Api-Request-Id:  UUID
 *   X-Api-Sequence:    -1
 */

import { randomUUID } from "node:crypto";

/* ─────────────────────────────────────────────
   常量
───────────────────────────────────────────── */

const ASR_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";

const RESOURCE_ID = "volc.bigasr.auc_turbo";

const TIMEOUT_MS = 120_000; // 2 分钟超时（大文件可能需要较长时间）

/* ─────────────────────────────────────────────
   类型
───────────────────────────────────────────── */

export interface VolcASRWord {
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

export interface VolcASRUtterance {
  text: string;
  start_time: number;
  end_time: number;
  words?: VolcASRWord[];
}

export interface VolcASRResponse {
  audio_info?: {
    duration: number; // 毫秒
  };
  result?: {
    text: string;
    additions?: {
      duration?: string;
    };
    utterances?: VolcASRUtterance[];
  };
}

export interface ASRResult {
  ok: boolean;
  error?: string;
  /** 完整识别文本 */
  text: string;
  /** 音频时长（毫秒） */
  durationMs: number;
  /** 分句列表 */
  utterances: VolcASRUtterance[];
  /** 原始响应 */
  raw?: VolcASRResponse;
}

/* ─────────────────────────────────────────────
   核心函数
───────────────────────────────────────────── */

/**
 * 调用火山引擎大模型录音文件极速版识别 API
 * @param audioUrl 音频文件的公网可访问 URL
 * @returns ASR 识别结果
 */
export async function recognizeAudio(audioUrl: string): Promise<ASRResult> {
  const appKey = process.env.VOLC_ASR_APP_KEY ?? "";
  const accessKey = process.env.VOLC_ASR_ACCESS_KEY ?? "";

  if (!appKey || !accessKey) {
    return {
      ok: false,
      error: "火山引擎 ASR 凭证未配置（VOLC_ASR_APP_KEY / VOLC_ASR_ACCESS_KEY）",
      text: "",
      durationMs: 0,
      utterances: [],
    };
  }

  const requestId = randomUUID();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-App-Key": appKey,
    "X-Api-Access-Key": accessKey,
    "X-Api-Resource-Id": RESOURCE_ID,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  };

  const body = {
    user: {
      uid: appKey,
    },
    audio: {
      url: audioUrl,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,   // 逆文本正则化（数字、日期等）
      enable_punc: true,   // 标点符号
    },
  };

  console.log(`[VolcASR] 开始识别，requestId=${requestId}, url=${audioUrl.slice(0, 80)}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resp = await fetch(ASR_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    // 检查响应头中的状态码
    const statusCode = resp.headers.get("X-Api-Status-Code") ?? "";
    const apiMessage = resp.headers.get("X-Api-Message") ?? "";
    const logId = resp.headers.get("X-Tt-Logid") ?? "";

    console.log(`[VolcASR] 响应: status=${statusCode}, message=${apiMessage}, logId=${logId}`);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return {
        ok: false,
        error: `火山引擎 ASR 请求失败 ${resp.status}: ${errText}`,
        text: "",
        durationMs: 0,
        utterances: [],
      };
    }

    // 检查 API 层面的错误
    if (statusCode && statusCode !== "20000000" && statusCode !== "20000003") {
      return {
        ok: false,
        error: `火山引擎 ASR 错误 [${statusCode}]: ${apiMessage}`,
        text: "",
        durationMs: 0,
        utterances: [],
      };
    }

    const json = (await resp.json()) as VolcASRResponse;

    const text = json.result?.text ?? "";
    const durationMs = json.audio_info?.duration ?? 0;
    const utterances = json.result?.utterances ?? [];

    if (!text && statusCode === "20000003") {
      return {
        ok: true,
        text: "(静音音频，未检测到语音内容)",
        durationMs,
        utterances: [],
        raw: json,
      };
    }

    console.log(`[VolcASR] 识别成功，文本长度=${text.length}，时长=${durationMs}ms，分句数=${utterances.length}`);

    return {
      ok: true,
      text,
      durationMs,
      utterances,
      raw: json,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      return {
        ok: false,
        error: "语音识别超时，请稍后重试",
        text: "",
        durationMs: 0,
        utterances: [],
      };
    }
    console.error(`[VolcASR] 异常:`, msg);
    return {
      ok: false,
      error: `语音识别失败: ${msg}`,
      text: "",
      durationMs: 0,
      utterances: [],
    };
  }
}
