/**
 * feishu-app.test.ts — 飞书第三方应用凭证验证测试
 */
import { describe, it, expect } from "vitest";

describe("飞书应用凭证验证", () => {
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

  it("should successfully obtain tenant_access_token from Feishu API", async () => {
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
    expect(data.msg).toBe("ok");
    expect(data.tenant_access_token).toBeTruthy();
    expect(data.expire).toBeGreaterThan(0);
    console.log(`✅ tenant_access_token obtained, expires in ${data.expire}s`);
  }, 15000);

  it("should list chats the bot belongs to", async () => {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      console.warn("Skipping: FEISHU_APP_ID or FEISHU_APP_SECRET not set");
      return;
    }

    // 先获取 token
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

    // 获取群列表
    const chatRes = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/chats?page_size=10",
      {
        headers: { Authorization: `Bearer ${tokenData.tenant_access_token}` },
      },
    );
    const chatData = (await chatRes.json()) as {
      code: number;
      msg: string;
      data?: { items?: Array<{ chat_id: string; name: string }> };
    };

    // code 0 表示成功（可能没有群，但 API 调用成功）
    expect(chatData.code).toBe(0);
    console.log(`✅ Bot belongs to ${chatData.data?.items?.length ?? 0} chats`);
    if (chatData.data?.items) {
      for (const chat of chatData.data.items) {
        console.log(`  - ${chat.name} (${chat.chat_id})`);
      }
    }
  }, 15000);
});
