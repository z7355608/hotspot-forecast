/**
 * TikHub API Key 验证测试
 * 通过调用轻量级 API 端点验证 key 是否有效
 */
import { describe, it, expect } from "vitest";

describe("TikHub API Key validation", () => {
  it("should authenticate successfully with the configured API key", async () => {
    const apiKey = process.env.TIKHUB_API_KEY;
    const baseUrl = process.env.TIKHUB_BASE_URL || "https://api.tikhub.io";

    expect(apiKey).toBeTruthy();

    // 调用轻量级端点验证 key 有效性
    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // 200 表示 key 有效，401/403 表示 key 无效
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);

    if (response.ok) {
      const data = await response.json();
      // 验证返回了用户信息
      expect(data).toBeDefined();
      console.log("[TikHub] API Key 验证成功，用户信息:", JSON.stringify(data).slice(0, 200));
    }
  }, 15000);
});
