import { createHmac, randomUUID } from "node:crypto";
import { createModuleLogger } from "./logger.js";
import {
  sendFeishuNotificationCard,
  verifyFeishuCredentials,
} from "./feishu-app.js";
import {
  persistEncryptedSecret,
  readNotificationChannelStore,
  readNotificationDeliveryStore,
  removeEncryptedSecret,
  resolveEncryptedSecret,
  writeNotificationChannelStore,
  writeNotificationDeliveryStore,
} from "./storage.js";
import type {
  NotificationChannelPayload,
  NotificationDispatchEvent,
  NotificationDispatchEventType,
  NotificationEventType,
  NotificationProvider,
  StoredNotificationChannel,
  StoredNotificationDelivery,
} from "./types.js";

type ChannelSecretPayload = {
  webhookUrl: string;
  secret?: string;
  /** 飞书应用模式字段 */
  feishuTargetId?: string;
  feishuTargetType?: string;
  feishuTargetName?: string;
};

type SendResult = {
  status: "success" | "failed";
  requestSummary: string;
  responseSummary?: string;
  error?: string;
};

type ChannelRuntimeConfig = {
  provider: NotificationProvider;
  displayName: string;
  destinationLabelMasked?: string;
  enabled: boolean;
  subscribedEvents: NotificationEventType[];
  webhookUrl: string;
  secret?: string;
  /** 飞书应用模式字段 */
  feishuTargetId?: string;
  feishuTargetType?: string;
  feishuTargetName?: string;
};

const DEFAULT_EVENTS: NotificationEventType[] = [
  "prediction_succeeded",
  "prediction_failed",
  "connector_bound",
  "connector_needs_auth",
  "connector_sync_failed",
  "watch_succeeded",
  "watch_degraded",
  "watch_failed",
];

const PROVIDER_LABELS: Record<NotificationProvider, string> = {
  feishu: "飞书机器人",
  wecom: "企业微信机器人",
  qq: "QQ 机器人",
};

/** 飞书应用凭证是否已配置 */
function isFeishuAppConfigured(): boolean {
  return !!(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
}

function nowIso() {
  return new Date().toISOString();
}

function getDefaultChannel(channelId: NotificationProvider): StoredNotificationChannel {
  return {
    channelId,
    provider: channelId,
    displayName: PROVIDER_LABELS[channelId],
    enabled: true,
    subscribedEvents: [...DEFAULT_EVENTS],
    verifyStatus: "idle",
    lastDeliveryStatus: "idle",
  };
}

function maskDestinationLabel(webhookUrl: string) {
  try {
    const url = new URL(webhookUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const tail = segments[segments.length - 1] || "";
    const maskedTail =
      tail.length <= 8 ? tail : `${tail.slice(0, 4)}...${tail.slice(-4)}`;
    return `${url.host}/${maskedTail}`;
  } catch {
    return "目标地址已配置";
  }
}

function normalizeEventList(events: NotificationEventType[] | undefined) {
  if (!Array.isArray(events) || events.length === 0) {
    return [...DEFAULT_EVENTS];
  }
  return DEFAULT_EVENTS.filter((event) => events.includes(event));
}

function parseSecretPayload(secretValue: string | null): ChannelSecretPayload | null {
  if (!secretValue) return null;
  try {
    const parsed = JSON.parse(secretValue) as Partial<ChannelSecretPayload>;
    if (!parsed.webhookUrl || typeof parsed.webhookUrl !== "string") return null;
    return {
      webhookUrl: parsed.webhookUrl,
      secret: typeof parsed.secret === "string" && parsed.secret.trim() ? parsed.secret : undefined,
    };
  } catch {
    return null;
  }
}

function assertWebhookUrl(provider: NotificationProvider, webhookUrl: string | undefined, allowEmpty = false) {
  if (!webhookUrl?.trim()) {
    if (allowEmpty) return "";
    throw new Error(`${PROVIDER_LABELS[provider]} 需要填写 webhook 地址。`);
  }
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("Webhook 地址格式不正确，需要以 https:// 开头。");
  }
  if (url.protocol !== "https:") {
    throw new Error("Webhook 地址必须使用 https://。");
  }
  return webhookUrl.trim();
}

function buildPlainText(event: NotificationDispatchEvent) {
  const lines = [
    event.title,
    event.summary,
    `状态：${event.statusLabel}`,
  ];
  if (event.platforms.length > 0) {
    lines.push(`平台：${event.platforms.join(" / ")}`);
  }
  if (event.degradeFlags.length > 0) {
    lines.push(`降级：${event.degradeFlags.join(", ")}`);
  }
  if (event.link) {
    lines.push(`链接：${event.link}`);
  }
  return lines.join("\n");
}

function buildMarkdown(event: NotificationDispatchEvent) {
  const lines = [
    `# ${event.title}`,
    "",
    event.summary,
    "",
    `- 状态：${event.statusLabel}`,
  ];
  if (event.platforms.length > 0) {
    lines.push(`- 平台：${event.platforms.join(" / ")}`);
  }
  if (event.degradeFlags.length > 0) {
    lines.push(`- 降级：${event.degradeFlags.join(", ")}`);
  }
  if (event.link) {
    lines.push(`- 链接：${event.link}`);
  }
  return lines.join("\n");
}

function buildFeishuSignature(secret: string) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const sign = createHmac("sha256", `${timestamp}\n${secret}`)
    .update("")
    .digest("base64");
  return { timestamp, sign };
}

async function sendToProvider(
  config: ChannelRuntimeConfig,
  event: NotificationDispatchEvent,
): Promise<SendResult> {
  const plainText = buildPlainText(event);
  const markdown = buildMarkdown(event);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: Record<string, unknown>;

  if (config.provider === "feishu" && isFeishuAppConfigured() && config.feishuTargetId) {
    // 飞书应用模式：通过飞书开放平台 API 发送
    const targetType = (config.feishuTargetType || "chat_id") as "open_id" | "user_id" | "chat_id";
    const result = await sendFeishuNotificationCard(
      config.feishuTargetId,
      targetType,
      event.title,
      markdown,
      event.link,
    );
    return {
      status: result.success ? "success" : "failed",
      requestSummary: `FEISHU_APP -> ${config.feishuTargetName || config.feishuTargetId}`,
      responseSummary: result.messageId || result.error,
      error: result.success ? undefined : result.error,
    };
  } else if (config.provider === "feishu") {
    // 飞书 Webhook 降级模式
    body = {
      msg_type: "text",
      content: {
        text: plainText,
      },
    };
    if (config.secret) {
      Object.assign(body, buildFeishuSignature(config.secret));
    }
  } else if (config.provider === "wecom") {
    body = {
      msgtype: "markdown",
      markdown: {
        content: markdown,
      },
    };
    if (config.secret) {
      headers["X-Webhook-Secret"] = config.secret;
    }
  } else {
    body = {
      msgtype: "markdown",
      title: event.title,
      summary: event.summary,
      status: event.statusLabel,
      content: markdown,
      plainText,
      platforms: event.platforms,
      link: event.link,
      eventType: event.eventType,
    };
    if (config.secret) {
      headers["X-Webhook-Secret"] = config.secret;
    }
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  let success = response.ok;
  if (success && config.provider === "feishu" && parsed) {
    success =
      parsed.StatusCode === 0 ||
      parsed.code === 0 ||
      parsed.msg === "success" ||
      parsed.StatusMessage === "success";
  }
  if (success && config.provider === "wecom" && parsed) {
    success = parsed.errcode === 0 || parsed.errmsg === "ok";
  }

  return {
    status: success ? "success" : "failed",
    requestSummary: `${config.provider.toUpperCase()} -> ${config.destinationLabelMasked || "webhook"}`,
    responseSummary: raw ? raw.slice(0, 240) : `HTTP ${response.status}`,
    error: success ? undefined : raw || `HTTP ${response.status}`,
  };
}

async function resolveRuntimeConfig(
  channelId: NotificationProvider,
  payload?: NotificationChannelPayload,
) {
  const store = await readNotificationChannelStore();
  const existing = store[channelId];
  const secretBlob = existing?.encryptedSecretRef
    ? await resolveEncryptedSecret(existing.encryptedSecretRef)
    : null;
  const storedSecret = parseSecretPayload(secretBlob);

  // 飞书应用模式：不需要 webhookUrl
  const isFeishuApp = channelId === "feishu" && isFeishuAppConfigured() &&
    (payload?.feishuTargetId || existing?.feishuTargetId || storedSecret?.feishuTargetId);

  const webhookUrl = assertWebhookUrl(
    channelId,
    payload?.webhookUrl ?? storedSecret?.webhookUrl,
    !!isFeishuApp, // 飞书应用模式允许空 webhookUrl
  );
  const secret =
    typeof payload?.secret === "string" && payload.secret.trim()
      ? payload.secret.trim()
      : storedSecret?.secret;

  // 飞书应用模式字段
  const feishuTargetId = payload?.feishuTargetId ?? existing?.feishuTargetId ?? storedSecret?.feishuTargetId;
  const feishuTargetType = payload?.feishuTargetType ?? existing?.feishuTargetType ?? storedSecret?.feishuTargetType;
  const feishuTargetName = payload?.feishuTargetName ?? existing?.feishuTargetName ?? storedSecret?.feishuTargetName;

  const destinationLabel = isFeishuApp && feishuTargetName
    ? feishuTargetName
    : webhookUrl ? maskDestinationLabel(webhookUrl) : undefined;

  return {
    existing,
    config: {
      provider: channelId,
      displayName:
        payload?.displayName?.trim() ||
        existing?.displayName ||
        PROVIDER_LABELS[channelId],
      destinationLabelMasked: destinationLabel,
      enabled: payload?.enabled ?? existing?.enabled ?? true,
      subscribedEvents: normalizeEventList(payload?.subscribedEvents ?? existing?.subscribedEvents),
      webhookUrl,
      secret,
      feishuTargetId,
      feishuTargetType,
      feishuTargetName,
    } as ChannelRuntimeConfig,
  };
}

function toChannelResponse(record: StoredNotificationChannel) {
  return {
    channelId: record.channelId,
    provider: record.provider,
    displayName: record.displayName,
    destinationLabelMasked: record.destinationLabelMasked,
    enabled: record.enabled,
    connected: !!record.encryptedSecretRef || !!record.feishuTargetId,
    subscribedEvents: record.subscribedEvents,
    verifyStatus: record.verifyStatus,
    lastVerifiedAt: record.lastVerifiedAt,
    lastDeliveredAt: record.lastDeliveredAt,
    lastDeliveryStatus: record.lastDeliveryStatus,
    lastDeliveryError: record.lastDeliveryError,
    feishuTargetId: record.feishuTargetId,
    feishuTargetType: record.feishuTargetType,
    feishuTargetName: record.feishuTargetName,
    feishuAppMode: record.provider === "feishu" && isFeishuAppConfigured(),
  };
}

async function appendDelivery(delivery: StoredNotificationDelivery) {
  const store = await readNotificationDeliveryStore();
  store[delivery.deliveryId] = delivery;
  await writeNotificationDeliveryStore(store);
}

async function persistChannelDeliveryStatus(
  channelId: NotificationProvider,
  result: SendResult,
  persistStatus: boolean,
) {
  if (!persistStatus) return;
  const store = await readNotificationChannelStore();
  const existing = store[channelId];
  if (!existing) return;
  store[channelId] = {
    ...existing,
    lastDeliveredAt: nowIso(),
    lastDeliveryStatus: result.status,
    lastDeliveryError: result.error,
  };
  await writeNotificationChannelStore(store);
}

export async function listNotificationChannels() {
  const store = await readNotificationChannelStore();
  return (Object.keys(PROVIDER_LABELS) as NotificationProvider[])
    .map((channelId) => toChannelResponse(store[channelId] ?? getDefaultChannel(channelId)))
    .sort((left, right) => left.channelId.localeCompare(right.channelId));
}

export async function verifyNotificationChannel(
  channelId: NotificationProvider,
  payload: NotificationChannelPayload,
) {
  const { config } = await resolveRuntimeConfig(channelId, payload);
  const result = await sendToProvider(config, {
    eventType: "test_message",
    occurredAt: nowIso(),
    title: `${config.displayName} 连接验证`,
    summary: "这是一条连接验证消息，用于确认 webhook 地址可用。",
    statusLabel: "验证中",
    platforms: [],
    degradeFlags: [],
  });
  if (result.status !== "success") {
    throw new Error(result.error || `${PROVIDER_LABELS[channelId]} 验证失败。`);
  }
  return {
    verified: true,
    destinationLabelMasked: config.destinationLabelMasked,
    responseSummary: result.responseSummary,
  };
}

export async function bindNotificationChannel(
  channelId: NotificationProvider,
  payload: NotificationChannelPayload,
) {
  const verifyResult = await verifyNotificationChannel(channelId, payload);
  const { existing, config } = await resolveRuntimeConfig(channelId, payload);
  const store = await readNotificationChannelStore();
  const secretRef = existing?.encryptedSecretRef || `notify_${channelId}_${randomUUID()}`;
  await persistEncryptedSecret(
    secretRef,
    JSON.stringify({
      webhookUrl: config.webhookUrl,
      secret: config.secret,
      feishuTargetId: config.feishuTargetId,
      feishuTargetType: config.feishuTargetType,
      feishuTargetName: config.feishuTargetName,
    } satisfies ChannelSecretPayload),
  );
  store[channelId] = {
    channelId,
    provider: channelId,
    displayName: config.displayName,
    destinationLabelMasked: verifyResult.destinationLabelMasked,
    enabled: config.enabled,
    subscribedEvents: config.subscribedEvents,
    encryptedSecretRef: secretRef,
    verifyStatus: "verified",
    lastVerifiedAt: nowIso(),
    lastDeliveredAt: existing?.lastDeliveredAt,
    lastDeliveryStatus: existing?.lastDeliveryStatus ?? "idle",
    lastDeliveryError: existing?.lastDeliveryError,
    feishuTargetId: config.feishuTargetId,
    feishuTargetType: config.feishuTargetType as any,
    feishuTargetName: config.feishuTargetName,
  };
  await writeNotificationChannelStore(store);
  return toChannelResponse(store[channelId]);
}

export async function unbindNotificationChannel(channelId: NotificationProvider) {
  const store = await readNotificationChannelStore();
  const existing = store[channelId];
  if (existing?.encryptedSecretRef) {
    await removeEncryptedSecret(existing.encryptedSecretRef);
  }
  delete store[channelId];
  await writeNotificationChannelStore(store);
}

export async function testSendNotificationChannel(
  channelId: NotificationProvider,
  payload?: NotificationChannelPayload,
) {
  const { existing, config } = await resolveRuntimeConfig(channelId, payload);
  const event: NotificationDispatchEvent = {
    eventType: "test_message",
    occurredAt: nowIso(),
    title: `${config.displayName} 测试通知`,
    summary: "这是一条模拟业务通知，用于确认目标群和 webhook 配置可正常收消息。",
    statusLabel: "测试发送",
    platforms: ["系统"],
    degradeFlags: [],
  };
  const result = await sendToProvider(config, event);
  if (result.status !== "success") {
    throw new Error(result.error || `${PROVIDER_LABELS[channelId]} 测试发送失败。`);
  }
  const delivery: StoredNotificationDelivery = {
    deliveryId: `delivery_${randomUUID()}`,
    channelId,
    eventType: "test_message",
    status: result.status,
    sentAt: nowIso(),
    requestSummary: result.requestSummary,
    responseSummary: result.responseSummary,
    error: result.error,
  };
  await appendDelivery(delivery);
  if (existing && !payload) {
    await persistChannelDeliveryStatus(channelId, result, true);
  }
  return {
    sent: true,
    responseSummary: result.responseSummary,
  };
}

export async function dispatchNotificationEvent(event: NotificationDispatchEvent) {
  const store = await readNotificationChannelStore();
  const channels = Object.values(store).filter(
    (channel) =>
      (!!channel.encryptedSecretRef || !!channel.feishuTargetId) &&
      channel.enabled &&
      channel.subscribedEvents.includes(event.eventType as NotificationEventType),
  );

  for (const channel of channels) {
    const secretBlob = await resolveEncryptedSecret(channel.encryptedSecretRef);
    const configPayload = parseSecretPayload(secretBlob);
    if (!configPayload) {
      continue;
    }
    let result: SendResult;
    try {
      result = await sendToProvider(
        {
          provider: channel.provider,
          displayName: channel.displayName,
          destinationLabelMasked: channel.destinationLabelMasked,
          enabled: channel.enabled,
          subscribedEvents: channel.subscribedEvents,
          webhookUrl: configPayload.webhookUrl,
          secret: configPayload.secret,
          feishuTargetId: configPayload.feishuTargetId || channel.feishuTargetId,
          feishuTargetType: configPayload.feishuTargetType || channel.feishuTargetType,
          feishuTargetName: configPayload.feishuTargetName || channel.feishuTargetName,
        },
        event,
      );
    } catch (error) {
      result = {
        status: "failed",
        requestSummary: `${channel.provider.toUpperCase()} -> ${channel.destinationLabelMasked || "webhook"}`,
        responseSummary: undefined,
        error: error instanceof Error ? error.message : "Notification delivery failed.",
      };
    }

    const delivery: StoredNotificationDelivery = {
      deliveryId: `delivery_${randomUUID()}`,
      channelId: channel.channelId,
      eventType: event.eventType as NotificationDispatchEventType,
      status: result.status,
      sentAt: nowIso(),
      requestSummary: result.requestSummary,
      responseSummary: result.responseSummary,
      error: result.error,
    };
    await appendDelivery(delivery);
    await persistChannelDeliveryStatus(channel.channelId, result, true);
  }
}
