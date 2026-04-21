import { createModuleLogger } from "./logger.js";
import { readConnectorStore, resolveCookieSecret, writeEndpointHealthStore } from "./storage.js";
import { probeEndpointHealth } from "./watch-runtime.js";

const log = createModuleLogger("Probe");

async function resolveDouyinCookieFromStore() {
  const connectors = await readConnectorStore();
  const douyin = connectors.douyin;
  if (!douyin?.encryptedSecretRef) {
    return undefined;
  }
  return resolveCookieSecret(douyin.encryptedSecretRef) ?? undefined;
}

async function main() {
  const douyinCookie =
    process.env.DOUYIN_CREATOR_COOKIE?.trim() || (await resolveDouyinCookieFromStore()) || undefined;
  const { store, entries } = await probeEndpointHealth({
    includeDouyin: true,
    includeXhs: true,
    douyinCookie,
  });
  await writeEndpointHealthStore(store);

  const summary = entries.reduce<Record<string, { stable: number; unstable: number }>>(
    (accumulator, entry) => {
      const bucket = accumulator[entry.capability] ?? { stable: 0, unstable: 0 };
      if (entry.stable) {
        bucket.stable += 1;
      } else {
        bucket.unstable += 1;
      }
      accumulator[entry.capability] = bucket;
      return accumulator;
    },
    {},
  );

  log.info({
    verifiedAt: new Date().toISOString(),
    summary,
    entries,
  }, "Probe completed");
}

void main().catch((error) => {
  log.error({ err: error }, "Unexpected error");
  process.exitCode = 1;
});
