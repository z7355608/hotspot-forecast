import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encryptSecret, decryptSecret } from "./crypto.js";
import type {
  EndpointHealthRecord,
  StoredNotificationChannel,
  StoredNotificationDelivery,
  StoredConnectorRecord,
  StoredResultArtifact,
  StoredSecret,
  StoredWatchTask,
  StoredWatchTaskRun,
} from "./types.js";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const CONNECTOR_FILE = path.join(DATA_DIR, "connectors.json");
const SECRET_FILE = path.join(DATA_DIR, "connector-secrets.json");
const NOTIFICATION_CHANNEL_FILE = path.join(DATA_DIR, "notification-channels.json");
const NOTIFICATION_DELIVERY_FILE = path.join(DATA_DIR, "notification-deliveries.json");
const RESULT_ARTIFACT_FILE = path.join(DATA_DIR, "result-artifacts.json");
const WATCH_TASK_FILE = path.join(DATA_DIR, "watch-tasks.json");
const WATCH_TASK_RUN_FILE = path.join(DATA_DIR, "watch-task-runs.json");
const ENDPOINT_HEALTH_FILE = path.join(DATA_DIR, "endpoint-health.json");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  await ensureDataDir();
  try {
    const raw = await readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(targetPath: string, payload: unknown) {
  await ensureDataDir();
  await writeFile(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

export async function readConnectorStore() {
  return readJsonFile<Record<string, StoredConnectorRecord>>(CONNECTOR_FILE, {});
}

export async function writeConnectorStore(store: Record<string, StoredConnectorRecord>) {
  await writeJsonFile(CONNECTOR_FILE, store);
}

export async function readSecretStore() {
  return readJsonFile<Record<string, StoredSecret>>(SECRET_FILE, {});
}

export async function writeSecretStore(store: Record<string, StoredSecret>) {
  await writeJsonFile(SECRET_FILE, store);
}

export async function readResultArtifactStore() {
  return readJsonFile<Record<string, StoredResultArtifact>>(RESULT_ARTIFACT_FILE, {});
}

export async function writeResultArtifactStore(store: Record<string, StoredResultArtifact>) {
  await writeJsonFile(RESULT_ARTIFACT_FILE, store);
}

export async function readWatchTaskStore() {
  return readJsonFile<Record<string, StoredWatchTask>>(WATCH_TASK_FILE, {});
}

export async function writeWatchTaskStore(store: Record<string, StoredWatchTask>) {
  await writeJsonFile(WATCH_TASK_FILE, store);
}

export async function readWatchTaskRunStore() {
  return readJsonFile<Record<string, StoredWatchTaskRun>>(WATCH_TASK_RUN_FILE, {});
}

export async function writeWatchTaskRunStore(store: Record<string, StoredWatchTaskRun>) {
  await writeJsonFile(WATCH_TASK_RUN_FILE, store);
}

export async function readEndpointHealthStore() {
  return readJsonFile<Record<string, EndpointHealthRecord>>(ENDPOINT_HEALTH_FILE, {});
}

export async function writeEndpointHealthStore(store: Record<string, EndpointHealthRecord>) {
  await writeJsonFile(ENDPOINT_HEALTH_FILE, store);
}

export async function readNotificationChannelStore() {
  return readJsonFile<Record<string, StoredNotificationChannel>>(NOTIFICATION_CHANNEL_FILE, {});
}

export async function writeNotificationChannelStore(
  store: Record<string, StoredNotificationChannel>,
) {
  await writeJsonFile(NOTIFICATION_CHANNEL_FILE, store);
}

export async function readNotificationDeliveryStore() {
  return readJsonFile<Record<string, StoredNotificationDelivery>>(NOTIFICATION_DELIVERY_FILE, {});
}

export async function writeNotificationDeliveryStore(
  store: Record<string, StoredNotificationDelivery>,
) {
  await writeJsonFile(NOTIFICATION_DELIVERY_FILE, store);
}

export async function persistEncryptedSecret(secretRef: string, secretValue: string) {
  const store = await readSecretStore();
  const encrypted = encryptSecret(secretValue);
  store[secretRef] = {
    ref: secretRef,
    ...encrypted,
    updatedAt: new Date().toISOString(),
  };
  await writeSecretStore(store);
}

export async function removeEncryptedSecret(secretRef: string | undefined) {
  if (!secretRef) return;
  const store = await readSecretStore();
  delete store[secretRef];
  await writeSecretStore(store);
}

export async function resolveEncryptedSecret(secretRef: string | undefined) {
  if (!secretRef) return null;
  const store = await readSecretStore();
  const secret = store[secretRef];
  if (!secret) return null;
  return decryptSecret(secret);
}

export async function persistCookieSecret(secretRef: string, cookie: string) {
  await persistEncryptedSecret(secretRef, cookie);
}

export async function removeCookieSecret(secretRef: string | undefined) {
  await removeEncryptedSecret(secretRef);
}

export async function resolveCookieSecret(secretRef: string | undefined) {
  return resolveEncryptedSecret(secretRef);
}
