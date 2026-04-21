/**
 * Legacy API Bridge
 * ─────────────────────────────────────────────
 * Wraps the legacy Node.js HTTP request handler as an Express middleware.
 * No separate port is opened — all /api/* requests are handled in-process
 * on the same Express server (port 3000).
 */
import type { Request, Response, NextFunction } from "express";
import type { IncomingMessage, ServerResponse } from "http";

let legacyInitialized = false;
let legacyRequestHandler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

/**
 * Initialize the legacy API modules (load handlers, start scheduler).
 * Does NOT start a separate HTTP server.
 */
export async function initLegacyApi(): Promise<void> {
  if (legacyInitialized) return;

  try {
    // Dynamically import the legacy http-server module
    const legacyModule = await import("./legacy/http-server.js");

    // Use the exported getRequestHandler to get the handler function
    legacyRequestHandler = legacyModule.getRequestHandler();

    console.log("[Legacy Bridge] Legacy API handler loaded (in-process, no separate port)");

    // Start the scheduler
    try {
      const schedulerModule = await import("./legacy/monitor-scheduler.js");
      schedulerModule.startScheduler();
      console.log("[Legacy Bridge] Monitor scheduler started");
    } catch (err) {
      console.warn("[Legacy Bridge] Scheduler start failed (non-critical):", err);
    }

    legacyInitialized = true;
  } catch (err) {
    console.error("[Legacy Bridge] Failed to initialize legacy API:", err);
    throw err;
  }
}

/**
 * Creates Express middleware that handles /api/* requests using the legacy handler.
 * Skips /api/trpc and /api/oauth which are handled by webdev's own routes.
 */
export function createLegacyApiMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip webdev-owned routes
    if (req.path.startsWith("/api/trpc") || req.path.startsWith("/api/oauth")) {
      return next();
    }
    // Only handle /api/* routes
    if (!req.path.startsWith("/api")) {
      return next();
    }

    if (!legacyRequestHandler) {
      // Legacy not initialized yet, pass through
      return next();
    }

    // Forward the Express req/res directly to the legacy handler
    // Express req extends IncomingMessage, Express res extends ServerResponse
    legacyRequestHandler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
  };
}
