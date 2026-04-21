import type { ConnectorBindingInput } from "../store/prediction-types";
import { parseApiResponse, apiFetch } from "./api-utils";

export interface ConnectorServerRecord {
  platformId: string;
  authMode: "public" | "cookie";
  profileUrl?: string;
  handle?: string;
  platformUserId?: string;
  cookieConfigured?: boolean;
  verifyStatus?: "verified" | "needs_auth" | "idle";
  syncStatus?: "verified" | "stale" | "needs_auth" | "idle";
  lastVerifiedAt?: string;
  lastSyncedAt?: string;
}

export interface ConnectorLoginSession {
  sessionId: string;
  platformId: string;
  status: "pending" | "completed" | "failed" | "expired";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  /** Base64-encoded screenshot of the login page (for QR code display in headless mode) */
  qrScreenshot?: string;
}

export async function fetchConnectors() {
  const response = await apiFetch("/api/connectors");
  return parseApiResponse<{ items: ConnectorServerRecord[] }>(response);
}

export async function verifyConnector(platformId: string, payload: ConnectorBindingInput) {
  const response = await apiFetch(`/api/connectors/${platformId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{
    verified: boolean;
    resolvedPlatformUserId?: string;
    profileSnapshot?: Record<string, unknown>;
    cookieConfigured?: boolean;
  }>(response);
}

export async function bindConnector(platformId: string, payload: ConnectorBindingInput) {
  const response = await apiFetch(`/api/connectors/${platformId}/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<{ item: ConnectorServerRecord }>(response);
}

export async function createConnectorLoginSession(platformId: string) {
  const response = await apiFetch(`/api/connectors/${platformId}/login-session`, {
    method: "POST",
  });
  return parseApiResponse<{ session: ConnectorLoginSession }>(response);
}

export async function fetchConnectorLoginSession(platformId: string, sessionId: string) {
  const response = await apiFetch(`/api/connectors/${platformId}/login-session/${sessionId}`);
  return parseApiResponse<{ session: ConnectorLoginSession }>(response);
}

export async function unbindConnector(platformId: string) {
  const response = await apiFetch(`/api/connectors/${platformId}/unbind`, {
    method: "POST",
  });
  return parseApiResponse<{ ok: boolean }>(response);
}

export async function syncConnectorProfile(platformId: string) {
  const response = await apiFetch(`/api/connectors/${platformId}/sync-profile`, {
    method: "POST",
  });
  return parseApiResponse<{ item: ConnectorServerRecord }>(response);
}
