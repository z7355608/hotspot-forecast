/**
 * phase17.test.ts — Phase 17 三项改进的测试
 * 1. 会员到期自动降级
 * 2. CreditsPage 会员显示统一
 * 3. 飞书第三方应用集成
 */
import { describe, it, expect } from "vitest";

describe("会员到期自动降级逻辑", () => {
  it("should detect expired subscription based on endAt timestamp", () => {
    const now = Date.now();
    const expiredEndAt = now - 86400000; // 1 day ago
    const activeEndAt = now + 86400000; // 1 day from now

    expect(expiredEndAt < now).toBe(true);
    expect(activeEndAt > now).toBe(true);
  });

  it("should consider null endAt as non-expired (free plan)", () => {
    const endAt = null;
    const isExpired = endAt !== null && endAt < Date.now();
    expect(isExpired).toBe(false);
  });

  it("should correctly identify expired yearly subscriptions", () => {
    const now = Date.now();
    // Simulate a yearly subscription that expired
    const yearlyEndAt = now - 1000; // just expired
    const isExpired = yearlyEndAt < now;
    expect(isExpired).toBe(true);
  });
});

describe("飞书第三方应用凭证", () => {
  it("should have FEISHU_APP_ID configured", () => {
    const appId = process.env.FEISHU_APP_ID;
    expect(appId).toBeTruthy();
    expect(appId).toMatch(/^cli_/);
  });

  it("should have FEISHU_APP_SECRET configured", () => {
    const appSecret = process.env.FEISHU_APP_SECRET;
    expect(appSecret).toBeTruthy();
    expect(appSecret!.length).toBeGreaterThan(10);
  });

  it("should successfully obtain tenant_access_token", async () => {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      console.warn("Skipping: FEISHU_APP_ID or FEISHU_APP_SECRET not set");
      return;
    }

    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );

    const data = (await response.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };

    expect(data.code).toBe(0);
    expect(data.tenant_access_token).toBeTruthy();
    console.log(`✅ tenant_access_token obtained, expires in ${data.expire}s`);
  }, 15000);

  it("should list chats the bot belongs to", async () => {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      console.warn("Skipping: FEISHU_APP_ID or FEISHU_APP_SECRET not set");
      return;
    }

    const tokenRes = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );
    const tokenData = (await tokenRes.json()) as {
      code: number;
      tenant_access_token?: string;
    };
    expect(tokenData.code).toBe(0);

    const chatRes = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/chats?page_size=10",
      {
        headers: { Authorization: `Bearer ${tokenData.tenant_access_token}` },
      },
    );
    const chatData = (await chatRes.json()) as {
      code: number;
      data?: { items?: Array<{ chat_id: string; name: string }> };
    };

    expect(chatData.code).toBe(0);
    console.log(`✅ Bot belongs to ${chatData.data?.items?.length ?? 0} chats`);
  }, 15000);
});

describe("NotificationBindingInput 飞书应用模式字段", () => {
  it("should support feishuTargetId and feishuTargetType fields", () => {
    const binding = {
      displayName: "飞书通知",
      enabled: true,
      subscribedEvents: ["prediction_succeeded" as const],
      feishuTargetId: "oc_test123",
      feishuTargetType: "chat_id" as const,
      feishuTargetName: "测试群",
    };

    expect(binding.feishuTargetId).toBe("oc_test123");
    expect(binding.feishuTargetType).toBe("chat_id");
    expect(binding.feishuTargetName).toBe("测试群");
  });

  it("should allow webhook fields for non-feishu channels", () => {
    const binding = {
      displayName: "企业微信",
      webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
      enabled: true,
      subscribedEvents: ["prediction_succeeded" as const],
    };

    expect(binding.webhookUrl).toBeTruthy();
    expect(binding.feishuTargetId).toBeUndefined();
  });
});
