import { describe, it, expect } from "vitest";

// ─── CORS 模块测试 ───

describe("CORS module", () => {
  it("should export isOriginAllowed, getCorsOrigin, setCorsHeaders, getCorsHeadersObj", async () => {
    const mod = await import("./cors.js");
    expect(typeof mod.isOriginAllowed).toBe("function");
    expect(typeof mod.getCorsOrigin).toBe("function");
    expect(typeof mod.setCorsHeaders).toBe("function");
    expect(typeof mod.getCorsHeadersObj).toBe("function");
  });

  it("should allow *.manus.space origins", async () => {
    const { isOriginAllowed } = await import("./cors.js");
    expect(isOriginAllowed("https://myapp.manus.space")).toBe(true);
    expect(isOriginAllowed("https://3000-abc123.manus.space")).toBe(true);
  });

  it("should allow *.manus.computer origins", async () => {
    const { isOriginAllowed } = await import("./cors.js");
    expect(isOriginAllowed("https://3000-abc.us1.manus.computer")).toBe(true);
  });

  it("should reject unknown origins in production mode", async () => {
    const { isOriginAllowed } = await import("./cors.js");
    // In non-production, localhost is allowed, but random domains should not be
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
    expect(isOriginAllowed("https://attacker.io")).toBe(false);
  });

  it("should return correct CORS headers object", async () => {
    const { getCorsHeadersObj } = await import("./cors.js");
    const mockReq = { headers: { origin: "https://myapp.manus.space" } } as any;
    const headers = getCorsHeadersObj(mockReq);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://myapp.manus.space");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("should not return wildcard * in CORS headers", async () => {
    const { getCorsHeadersObj } = await import("./cors.js");
    const mockReq = { headers: { origin: "https://myapp.manus.space" } } as any;
    const headers = getCorsHeadersObj(mockReq);
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });
});

// ─── Logger 模块测试 ───

describe("Logger module", () => {
  it("should export logger, createModuleLogger, createRequestLogger", async () => {
    const mod = await import("./logger.js");
    expect(mod.logger).toBeDefined();
    expect(typeof mod.createModuleLogger).toBe("function");
    expect(typeof mod.createRequestLogger).toBe("function");
  });

  it("should create module logger with correct module field", async () => {
    const { createModuleLogger } = await import("./logger.js");
    const log = createModuleLogger("TestModule");
    expect(log).toBeDefined();
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("should create request logger with requestId and userId", async () => {
    const { createRequestLogger } = await import("./logger.js");
    const log = createRequestLogger("TestModule", "req-123", "user-456");
    expect(log).toBeDefined();
    expect(typeof log.info).toBe("function");
  });

  it("should not throw when logging messages", async () => {
    const { createModuleLogger } = await import("./logger.js");
    const log = createModuleLogger("TestModule");
    expect(() => log.info("test message")).not.toThrow();
    expect(() => log.error({ err: new Error("test") }, "error message")).not.toThrow();
    expect(() => log.warn({ detail: "some detail" }, "warning")).not.toThrow();
  });
});

// ─── 全局迁移验证 ───

describe("Console migration verification", () => {
  it("should have zero console.log/error/warn calls in legacy modules (excluding tests and logger)", async () => {
    const { execSync } = await import("child_process");
    const result = execSync(
      `grep -rn "console\\.\\(log\\|error\\|warn\\)" server/legacy/ --include="*.ts" | grep -v test | grep -v logger.ts | wc -l`,
      { cwd: "/home/ubuntu/hotspot-forecast", encoding: "utf-8" },
    ).trim();
    expect(Number(result)).toBe(0);
  });

  it("should have all legacy modules importing logger (files with log. calls)", async () => {
    const { execSync } = await import("child_process");
    // Find files that use log. but don't import createModuleLogger
    const result = execSync(
      `for f in server/legacy/*.ts; do
        case "$f" in *.test.ts|*logger.ts|*cors.ts|*types.ts|*storage.ts|*platforms.ts) continue;; esac
        if grep -q "log\\." "$f" && ! grep -q "createModuleLogger" "$f"; then
          echo "$f"
        fi
      done`,
      { cwd: "/home/ubuntu/hotspot-forecast", encoding: "utf-8" },
    ).trim();
    expect(result).toBe("");
  });
});
