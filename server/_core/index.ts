import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initLegacyApi, createLegacyApiMiddleware } from "../legacy-bridge";
import { bootstrapAugmenters } from "../services/content-augmentation/bootstrap";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // Trust reverse proxy headers (x-forwarded-proto, x-forwarded-for, etc.)
  // Required for correct cookie secure flag detection behind proxy
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Initialize legacy API handler (in-process, no separate port)
  try {
    await initLegacyApi();
    const legacyMiddleware = createLegacyApiMiddleware();
    app.use(legacyMiddleware);
    console.log(`[Server] Legacy API middleware configured (in-process)`);
  } catch (err) {
    console.error("[Server] Failed to initialize legacy API, /api routes will not work:", err);
  }

  // 旁路内容注入器(默认未启用,详见 docs/decisions/0005-x-augmenter-bootstrap.md)
  await bootstrapAugmenters();

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Healthcheck — used by Docker / load balancer / uptime monitors.
  // Lightweight by design: no DB / LLM / TikHub probes here (those have their own checks).
  // Returns 200 if the process is up and event loop responsive.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      ts: Date.now(),
      uptime: process.uptime(),
      pid: process.pid,
    });
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // 爆款拆解 LLM 调用单次可能 70-180s，加上 5xx 重试可能 200+s。
  // 拉宽 server.requestTimeout / headersTimeout，避免长响应被默认值掐断。
  server.requestTimeout = 600_000; // 10 分钟
  server.headersTimeout = 605_000; // 必须 ≥ requestTimeout
  server.keepAliveTimeout = 120_000; // 2 分钟，避免 LLM 期间 socket 被回收

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/ (requestTimeout=${server.requestTimeout}ms)`);
  });
}

startServer().catch(console.error);
