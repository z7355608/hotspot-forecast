/**
 * feishu-app.ts — 飞书第三方应用集成
 * ═══════════════════════════════════════════════════════════════
 * 功能：
 *   1. tenant_access_token 管理（获取 + 内存缓存 + 自动刷新）
 *   2. 消息发送（文本 / 富文本 / 卡片）
 *   3. 获取机器人所在群列表
 *   4. 飞书通知渠道绑定/解绑/测试
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("FeishuApp");

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

/* ── Token 缓存 ── */

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // Unix ms

/**
 * 获取 tenant_access_token（自建应用模式下等同于 app_access_token）
 * 自动缓存，提前 5 分钟刷新
 */
export async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("飞书应用凭证未配置：缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");
  }

  // 缓存有效（提前 5 分钟刷新）
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const response = await fetch(`${FEISHU_BASE}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = (await response.json()) as {
    code: number;
    msg: string;
    app_access_token?: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (data.code !== 0 || !data.tenant_access_token) {
    log.error({ code: data.code, msg: data.msg }, "获取飞书 tenant_access_token 失败");
    throw new Error(`飞书 token 获取失败: ${data.msg} (code: ${data.code})`);
  }

  cachedToken = data.tenant_access_token;
  tokenExpiresAt = Date.now() + (data.expire ?? 7200) * 1000;
  log.info({ expiresIn: data.expire }, "飞书 tenant_access_token 已刷新");

  return cachedToken;
}

/* ── 消息发送 ── */

export type FeishuReceiveIdType = "open_id" | "user_id" | "union_id" | "email" | "chat_id";

export interface FeishuSendMessageOptions {
  receiveId: string;
  receiveIdType: FeishuReceiveIdType;
  msgType: "text" | "interactive" | "post";
  content: string; // JSON 字符串
}

export interface FeishuSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 发送飞书消息
 * content 需要是 JSON 字符串，例如：
 *   文本: JSON.stringify({ text: "hello" })
 *   卡片: JSON.stringify({ ... interactive card ... })
 */
export async function sendFeishuMessage(options: FeishuSendMessageOptions): Promise<FeishuSendResult> {
  const token = await getTenantAccessToken();

  const response = await fetch(
    `${FEISHU_BASE}/im/v1/messages?receive_id_type=${options.receiveIdType}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: options.receiveId,
        msg_type: options.msgType,
        content: options.content,
      }),
    },
  );

  const data = (await response.json()) as {
    code: number;
    msg: string;
    data?: { message_id?: string };
  };

  if (data.code !== 0) {
    log.error({ code: data.code, msg: data.msg, receiveId: options.receiveId }, "飞书消息发送失败");
    return { success: false, error: `${data.msg} (code: ${data.code})` };
  }

  return { success: true, messageId: data.data?.message_id };
}

/**
 * 发送纯文本消息（便捷方法）
 */
export async function sendFeishuText(
  receiveId: string,
  receiveIdType: FeishuReceiveIdType,
  text: string,
): Promise<FeishuSendResult> {
  return sendFeishuMessage({
    receiveId,
    receiveIdType,
    msgType: "text",
    content: JSON.stringify({ text }),
  });
}

/**
 * 发送通知卡片消息
 */
export async function sendFeishuNotificationCard(
  receiveId: string,
  receiveIdType: FeishuReceiveIdType,
  title: string,
  content: string,
  link?: string,
): Promise<FeishuSendResult> {
  const elements: Record<string, unknown>[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content,
      },
    },
  ];

  if (link) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "查看详情" },
          type: "primary",
          url: link,
        },
      ],
    });
  }

  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `爆款预测Agent · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
      },
    ],
  });

  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: title },
      template: "blue",
    },
    elements,
  };

  return sendFeishuMessage({
    receiveId,
    receiveIdType,
    msgType: "interactive",
    content: JSON.stringify(card),
  });
}

/* ── 群列表 ── */

export interface FeishuChatInfo {
  chatId: string;
  name: string;
  description: string;
  ownerIdType: string;
  ownerId: string;
  chatMode: string;
  chatType: string;
  external: boolean;
  tenantKey: string;
}

/**
 * 获取机器人所在的群列表
 */
export async function listFeishuChats(pageSize = 50): Promise<FeishuChatInfo[]> {
  const token = await getTenantAccessToken();
  const allChats: FeishuChatInfo[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      page_size: String(pageSize),
    });
    if (pageToken) params.set("page_token", pageToken);

    const response = await fetch(`${FEISHU_BASE}/im/v1/chats?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = (await response.json()) as {
      code: number;
      msg: string;
      data?: {
        items?: Array<{
          chat_id: string;
          name: string;
          description: string;
          owner_id_type: string;
          owner_id: string;
          chat_mode: string;
          chat_type: string;
          external: boolean;
          tenant_key: string;
        }>;
        page_token?: string;
        has_more?: boolean;
      };
    };

    if (data.code !== 0) {
      log.error({ code: data.code, msg: data.msg }, "获取飞书群列表失败");
      break;
    }

    for (const item of data.data?.items ?? []) {
      allChats.push({
        chatId: item.chat_id,
        name: item.name,
        description: item.description,
        ownerIdType: item.owner_id_type,
        ownerId: item.owner_id,
        chatMode: item.chat_mode,
        chatType: item.chat_type,
        external: item.external,
        tenantKey: item.tenant_key,
      });
    }

    pageToken = data.data?.has_more ? data.data.page_token : undefined;
  } while (pageToken);

  return allChats;
}

/* ── 飞书通知集成 ── */

/**
 * 通过飞书应用 API 发送通知（替代 Webhook 方式）
 * 支持发送到群聊（chat_id）或个人（open_id）
 */
export async function sendFeishuNotification(
  target: { id: string; type: FeishuReceiveIdType },
  event: {
    title: string;
    summary: string;
    statusLabel: string;
    platforms: string[];
    degradeFlags: string[];
    link?: string;
    eventType: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const lines = [
    event.summary,
    `**状态：** ${event.statusLabel}`,
  ];
  if (event.platforms.length > 0) {
    lines.push(`**平台：** ${event.platforms.join(" / ")}`);
  }
  if (event.degradeFlags.length > 0) {
    lines.push(`**降级：** ${event.degradeFlags.join(", ")}`);
  }

  const result = await sendFeishuNotificationCard(
    target.id,
    target.type,
    event.title,
    lines.join("\n"),
    event.link,
  );

  return { success: result.success, error: result.error };
}

/**
 * 检查飞书应用凭证是否有效
 */
export async function verifyFeishuCredentials(): Promise<{
  valid: boolean;
  error?: string;
  appId?: string;
}> {
  try {
    const token = await getTenantAccessToken();
    return { valid: !!token, appId: process.env.FEISHU_APP_ID };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
