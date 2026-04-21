import { describe, it, expect } from "vitest";

describe("Volcengine ASR credentials", () => {
  it("VOLC_ASR_APP_KEY is set", () => {
    expect(process.env.VOLC_ASR_APP_KEY).toBeTruthy();
  });

  it("VOLC_ASR_ACCESS_KEY is set", () => {
    expect(process.env.VOLC_ASR_ACCESS_KEY).toBeTruthy();
  });

  it("ASR endpoint is reachable with correct headers", async () => {
    const appKey = process.env.VOLC_ASR_APP_KEY ?? "";
    const accessKey = process.env.VOLC_ASR_ACCESS_KEY ?? "";

    // 发送一个空音频请求来验证凭证是否有效
    // 预期会返回参数错误（45000001/45000002）而不是鉴权错误
    const resp = await fetch(
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-App-Key": appKey,
          "X-Api-Access-Key": accessKey,
          "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
          "X-Api-Request-Id": "test-" + Date.now(),
          "X-Api-Sequence": "-1",
        },
        body: JSON.stringify({
          user: { uid: appKey },
          audio: { url: "https://example.com/nonexistent.mp3" },
          request: { model_name: "bigmodel" },
        }),
      },
    );

    // 只要不是 401/403 就说明凭证有效
    const statusCode = resp.headers.get("X-Api-Status-Code") ?? "";
    console.log(`ASR test response status: ${resp.status}, API status code: ${statusCode}`);

    // 凭证有效的标志：HTTP 200 且 API 状态码不是鉴权相关错误
    expect(resp.status).toBe(200);
    // 鉴权错误通常是 40x 开头的状态码
    expect(statusCode).not.toMatch(/^40[13]/);
  }, 30_000);
});
