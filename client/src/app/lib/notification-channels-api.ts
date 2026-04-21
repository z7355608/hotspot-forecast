import type { NotificationBindingInput } from "../store/prediction-types";
import { parseApiResponse, apiFetch } from "./api-utils";

export interface NotificationChannelServerRecord {
  channelId: "feishu" | "wecom" | "qq";
  provider: "feishu" | "wecom" | "qq";
  displayName: string;
  destinationLabelMasked?: string;
  enabled: boolean;
  connected: boolean;
  subscribedEvents: string[];
  verifyStatus: "idle" | "verified" | "failed";
  lastVerifiedAt?: string;
  lastDeliveredAt?: string;
  lastDeliveryStatus?: "idle" | "success" | "failed";
  lastDeliveryError?: string;
  /** 飞书应用模式字段 */
  feishuTargetId?: string;
  feishuTargetType?: string;
  feishuTargetName?: string;
  feishuAppMode?: boolean;
}

export interface FeishuChat {
  chat_id: string;
  name: string;
  avatar?: string;
  description?: string;
  owner_id?: string;
  owner_id_type?: string;
}

export async function fetchFeishuChats() {
  const response = await apiFetch("/api/feishu/chats");
  return parseApiResponse<{ items: FeishuChat[] }>(response);
}

export async function fetchFeishuStatus() {
  const response = await apiFetch("/api/feishu/status");
  return parseApiResponse<{ configured: boolean; verified: boolean; error?: string }>(response);
}

export async function fetchNotificationChannels() {
  const response = await apiFetch("/api/notification-channels");
  return parseApiResponse<{ items: NotificationChannelServerRecord[] }>(response);
}

export async function verifyNotificationChannel(
  channelId: string,
  payload: NotificationBindingInput,
) {
  const response = await apiFetch(`/api/notification-channels/${channelId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{
    verified: boolean;
    destinationLabelMasked?: string;
    responseSummary?: string;
  }>(response);
}

export async function bindNotificationChannel(
  channelId: string,
  payload: NotificationBindingInput,
) {
  const response = await apiFetch(`/api/notification-channels/${channelId}/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ item: NotificationChannelServerRecord }>(response);
}

export async function unbindNotificationChannel(channelId: string) {
  const response = await apiFetch(`/api/notification-channels/${channelId}/unbind`, {
    method: "POST",
  });
  return parseApiResponse<{ ok: boolean }>(response);
}

export async function testSendNotificationChannel(
  channelId: string,
  payload?: NotificationBindingInput,
) {
  const response = await apiFetch(`/api/notification-channels/${channelId}/test-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  return parseApiResponse<{
    sent: boolean;
    responseSummary?: string;
  }>(response);
}
