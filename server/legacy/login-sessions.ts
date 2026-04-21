import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { persistCookieSecret, resolveCookieSecret } from "./storage.js";
import type { LoginSessionRecord } from "./types.js";

type BrowserContextLike = {
  cookies: () => Promise<Array<{ name: string; value: string; domain: string; path: string }>>;
  close: () => Promise<void>;
};

type BrowserPageLike = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<void>;
  screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
  waitForSelector: (selector: string, options?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  $: (selector: string) => Promise<{ screenshot: (options?: Record<string, unknown>) => Promise<Buffer> } | null>;
};

type SessionRuntime = {
  context?: BrowserContextLike;
  page?: BrowserPageLike;
  timer?: NodeJS.Timeout;
  userDataDir?: string;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;
const sessions = new Map<string, LoginSessionRecord>();
const runtimes = new Map<string, SessionRuntime>();

function nowIso() {
  return new Date().toISOString();
}

function getCreatorHomeUrl() {
  return "https://creator.douyin.com/creator-micro/home";
}

function resolveLocalChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean) as string[];
  return candidates.find((target) => existsSync(target)) || null;
}

async function loadPlaywright() {
  try {
    const loader = Function("return import('playwright')");
    return (await loader()) as {
      chromium: {
        launchPersistentContext: (
          userDataDir: string,
          options: Record<string, unknown>,
        ) => Promise<
          BrowserContextLike & {
            newPage?: () => Promise<BrowserPageLike>;
            pages?: () => BrowserPageLike[];
          }
        >;
      };
    };
  } catch (error) {
    throw new Error(
      "Built-in platform login requires the optional `playwright` package. Run `npm install` first.",
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function serializeCookies(
  cookies: Array<{ name: string; value: string; domain: string; path: string }>,
) {
  return cookies
    .filter(
      (item) =>
        item.value &&
        (item.domain.includes("douyin.com") || item.domain.includes("creator.douyin.com")),
    )
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
}

function looksLikeLoggedInCookie(cookieHeader: string) {
  return /(sessionid|sessionid_ss|uid_tt|uid_tt_ss|sid_guard|sid_tt|passport_auth_status)=/i.test(
    cookieHeader,
  );
}

async function cleanupRuntime(sessionId: string) {
  const runtime = runtimes.get(sessionId);
  if (!runtime) return;
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }
  if (runtime.context) {
    await runtime.context.close().catch(() => undefined);
  }
  if (runtime.userDataDir) {
    await rm(runtime.userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
  runtimes.delete(sessionId);
}

async function finalizeSession(sessionId: string, cookieHeader: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const secretRef = `login_${session.platformId}_${sessionId}`;
  await persistCookieSecret(secretRef, cookieHeader);
  sessions.set(sessionId, {
    ...session,
    status: "completed",
    updatedAt: nowIso(),
    completedAt: nowIso(),
    cookieSecretRef: secretRef,
    previewCookie: cookieHeader.slice(0, 120),
    error: undefined,
  });
  await cleanupRuntime(sessionId);
}

async function failSession(sessionId: string, message: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.set(sessionId, {
    ...session,
    status: "failed",
    updatedAt: nowIso(),
    error: message,
  });
  await cleanupRuntime(sessionId);
}

/**
 * Capture a screenshot of the current page (for QR code display).
 * Returns base64-encoded PNG or null if page is unavailable.
 */
async function capturePageScreenshot(sessionId: string): Promise<string | null> {
  const runtime = runtimes.get(sessionId);
  if (!runtime?.page) return null;
  try {
    const buf = await runtime.page.screenshot({ type: "png", fullPage: false });
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function pollSessionCookies(sessionId: string) {
  const runtime = runtimes.get(sessionId);
  if (!runtime?.context) return;
  const session = sessions.get(sessionId);
  if (!session) return;
  if (Date.now() - new Date(session.createdAt).getTime() > SESSION_TTL_MS) {
    sessions.set(sessionId, {
      ...session,
      status: "expired",
      updatedAt: nowIso(),
      error: "登录会话已过期，请重新发起扫码登录。",
    });
    await cleanupRuntime(sessionId);
    return;
  }
  try {
    const cookies = await runtime.context.cookies();
    const cookieHeader = serializeCookies(cookies);
    if (looksLikeLoggedInCookie(cookieHeader)) {
      await finalizeSession(sessionId, cookieHeader);
      return;
    }

    // Capture screenshot for QR code display on each poll
    const screenshot = await capturePageScreenshot(sessionId);

    sessions.set(sessionId, {
      ...session,
      status: "pending",
      updatedAt: nowIso(),
      previewCookie: cookieHeader.slice(0, 120),
      qrScreenshot: screenshot ?? session.qrScreenshot,
    });
  } catch (error) {
    await failSession(
      sessionId,
      error instanceof Error ? error.message : "Failed to inspect Douyin login session cookies.",
    );
  }
}

export async function startDouyinLoginSession() {
  const playwright = await loadPlaywright();
  const executablePath = resolveLocalChromeExecutable();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "douyin-login-"));

  // Always use headless mode in server environments
  const hasDisplay = !!process.env.DISPLAY || process.platform === "darwin" || process.platform === "win32";
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: !hasDisplay,
    executablePath: executablePath || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--new-window"],
    viewport: { width: 1280, height: 800 },
  });
  const persistentContext = context as BrowserContextLike & {
    newPage?: () => Promise<BrowserPageLike>;
    pages?: () => BrowserPageLike[];
  };
  const existingPage = persistentContext.pages?.()?.[0];
  const page = existingPage || (await persistentContext.newPage?.());
  if (!page) {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("无法打开抖音登录页面，请检查服务端浏览器环境。");
  }
  await page.goto(getCreatorHomeUrl(), { waitUntil: "domcontentloaded" });

  // Wait for the QR code to render - try waiting for canvas or iframe
  try {
    // Try to wait for the QR code canvas element
    await page.waitForSelector('canvas, iframe[src*="sso"], img[src*="qrcode"], .qrcode-image, [class*="qr"]', { timeout: 8000 });
    // Give extra time for the QR code to fully render
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch {
    // If no QR element found, wait a fixed time
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Capture initial screenshot with QR code
  let initialScreenshot: string | null = null;
  try {
    // Try to capture just the QR code area first
    const qrElement = await page.$('canvas, .qrcode-image, [class*="qr-code"], [class*="qrcode"]');
    if (qrElement) {
      const buf = await qrElement.screenshot({ type: "png" });
      initialScreenshot = `data:image/png;base64,${buf.toString("base64")}`;
    }
    // If QR element screenshot failed or not found, capture full page
    if (!initialScreenshot) {
      const buf = await page.screenshot({ type: "png", fullPage: false });
      initialScreenshot = `data:image/png;base64,${buf.toString("base64")}`;
    }
  } catch {
    // Screenshot may fail, continue without it
  }

  const sessionId = randomUUID();
  const record: LoginSessionRecord = {
    sessionId,
    platformId: "douyin",
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    qrScreenshot: initialScreenshot ?? undefined,
  };
  sessions.set(sessionId, record);

  const timer = setInterval(() => {
    void pollSessionCookies(sessionId);
  }, POLL_INTERVAL_MS);
  runtimes.set(sessionId, { context, page, timer, userDataDir });
  return record;
}

export function getLoginSession(sessionId: string) {
  return sessions.get(sessionId) ?? null;
}

export async function resolveLoginSessionCookie(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "completed" || !session.cookieSecretRef) {
    return null;
  }
  return resolveCookieSecret(session.cookieSecretRef);
}
