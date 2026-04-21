/**
 * notification-routes.ts
 * ═══════════════════════════════════════════════════════════════
 * 通知渠道与飞书路由处理函数
 * 负责：通知渠道列表/验证/绑定/解绑/测试发送、飞书群列表、飞书状态
 * ═══════════════════════════════════════════════════════════════
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "../http-server-utils.js";
import {
  bindNotificationChannel,
  listNotificationChannels,
  testSendNotificationChannel,
  unbindNotificationChannel,
  verifyNotificationChannel,
} from "../notifications.js";
import { listFeishuChats, verifyFeishuCredentials } from "../feishu-app.js";
import type { NotificationChannelPayload, NotificationProvider } from "../types.js";

export async function handleListNotificationChannels(response: ServerResponse) {
  const items = await listNotificationChannels();
  sendJson(response, 200, { items });
}

export async function handleVerifyNotificationChannel(
  channelId: NotificationProvider,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<NotificationChannelPayload>(request);
  const result = await verifyNotificationChannel(channelId, payload);
  sendJson(response, 200, result);
}

export async function handleBindNotificationChannel(
  channelId: NotificationProvider,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<NotificationChannelPayload>(request);
  const item = await bindNotificationChannel(channelId, payload);
  sendJson(response, 200, { item });
}

export async function handleUnbindNotificationChannel(
  channelId: NotificationProvider,
  response: ServerResponse,
) {
  await unbindNotificationChannel(channelId);
  sendJson(response, 200, { ok: true });
}

export async function handleTestSendNotificationChannel(
  channelId: NotificationProvider,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const payload = await readJsonBody<NotificationChannelPayload>(request);
  const result = await testSendNotificationChannel(
    channelId,
    Object.keys(payload).length > 0 ? payload : undefined,
  );
  sendJson(response, 200, result);
}

export async function handleListFeishuChats(response: ServerResponse) {
  try {
    const chats = await listFeishuChats();
    sendJson(response, 200, { items: chats });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "获取飞书群列表失败",
    });
  }
}

export async function handleFeishuStatus(response: ServerResponse) {
  try {
    const configured = !!(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
    if (!configured) {
      sendJson(response, 200, { configured: false, verified: false });
      return;
    }
    const verified = await verifyFeishuCredentials();
    sendJson(response, 200, { configured: true, verified });
  } catch (error) {
    sendJson(response, 200, {
      configured: true,
      verified: false,
      error: error instanceof Error ? error.message : "飞书凭证验证失败",
    });
  }
}
