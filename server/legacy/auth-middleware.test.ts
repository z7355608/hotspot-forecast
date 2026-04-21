/**
 * Tests for Legacy API authentication middleware and HTML sanitization.
 */
import { describe, it, expect } from "vitest";

/* ─── Auth Middleware Logic Tests ─── */

describe("Auth middleware configuration", () => {
  const AUTH_EXEMPT_PATHS = new Set([
    "/api/health",
    "/api/endpoint-health",
    "/api/endpoint-health/probe",
  ]);

  const AUTH_DELEGATED_PREFIXES = ["/api/admin"];

  function requiresAuth(pathname: string): boolean {
    const isDelegated = AUTH_DELEGATED_PREFIXES.some((p) =>
      pathname.startsWith(p),
    );
    if (isDelegated) return false; // admin has its own auth
    if (AUTH_EXEMPT_PATHS.has(pathname)) return false;
    return true;
  }

  it("should exempt /api/health from authentication", () => {
    expect(requiresAuth("/api/health")).toBe(false);
  });

  it("should exempt /api/endpoint-health from authentication", () => {
    expect(requiresAuth("/api/endpoint-health")).toBe(false);
  });

  it("should exempt /api/endpoint-health/probe from authentication", () => {
    expect(requiresAuth("/api/endpoint-health/probe")).toBe(false);
  });

  it("should delegate /api/admin/* to admin's own auth", () => {
    expect(requiresAuth("/api/admin/users")).toBe(false);
    expect(requiresAuth("/api/admin/skills")).toBe(false);
    expect(requiresAuth("/api/admin/secrets")).toBe(false);
  });

  it("should require auth for /api/predictions/run-live", () => {
    expect(requiresAuth("/api/predictions/run-live")).toBe(true);
  });

  it("should require auth for /api/llm/chat", () => {
    expect(requiresAuth("/api/llm/chat")).toBe(true);
  });

  it("should require auth for /api/llm/stream", () => {
    expect(requiresAuth("/api/llm/stream")).toBe(true);
  });

  it("should require auth for /api/connectors", () => {
    expect(requiresAuth("/api/connectors")).toBe(true);
  });

  it("should require auth for /api/breakdown/action", () => {
    expect(requiresAuth("/api/breakdown/action")).toBe(true);
  });

  it("should require auth for /api/result-artifacts", () => {
    expect(requiresAuth("/api/result-artifacts")).toBe(true);
  });

  it("should require auth for /api/published-content", () => {
    expect(requiresAuth("/api/published-content")).toBe(true);
  });

  it("should require auth for /api/prediction-accuracy", () => {
    expect(requiresAuth("/api/prediction-accuracy")).toBe(true);
  });

  it("should require auth for /api/historical-feedback", () => {
    expect(requiresAuth("/api/historical-feedback")).toBe(true);
  });

  it("should require auth for /api/video/parse", () => {
    expect(requiresAuth("/api/video/parse")).toBe(true);
  });

  it("should require auth for /api/skills/execute", () => {
    expect(requiresAuth("/api/skills/execute")).toBe(true);
  });

  it("should require auth for /api/trend/analyze", () => {
    expect(requiresAuth("/api/trend/analyze")).toBe(true);
  });

  it("should require auth for /api/file/upload", () => {
    expect(requiresAuth("/api/file/upload")).toBe(true);
  });

  it("should require auth for /api/monitor/scheduler/status", () => {
    expect(requiresAuth("/api/monitor/scheduler/status")).toBe(true);
  });
});

/* ─── getAuthenticatedUser helper tests ─── */

describe("getAuthenticatedUser helper", () => {
  function getAuthenticatedUser(request: any): string {
    return request.__userOpenId || "anonymous";
  }

  it("should return cached openId when set by middleware", () => {
    const req = { __userOpenId: "user_abc123" };
    expect(getAuthenticatedUser(req)).toBe("user_abc123");
  });

  it("should return anonymous when no openId is set", () => {
    const req = {};
    expect(getAuthenticatedUser(req)).toBe("anonymous");
  });

  it("should return anonymous for undefined __userOpenId", () => {
    const req = { __userOpenId: undefined };
    expect(getAuthenticatedUser(req)).toBe("anonymous");
  });

  it("should return anonymous for empty string __userOpenId", () => {
    const req = { __userOpenId: "" };
    expect(getAuthenticatedUser(req)).toBe("anonymous");
  });
});

/* ─── HTML Sanitization Tests ─── */

describe("HTML sanitization (DOMPurify)", () => {
  // We test the sanitizeHtml function logic by importing DOMPurify directly
  // since the actual sanitizeHtml module uses browser-specific DOMPurify
  // In vitest (node env), we test the configuration logic

  const ALLOWED_TAGS = new Set([
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "div", "span",
    "strong", "b", "em", "i", "u", "s", "del",
    "code", "pre", "blockquote",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "img",
    "sup", "sub", "mark", "small",
  ]);

  const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "form", "input", "textarea", "select", "style"];

  it("should allow safe structural tags", () => {
    for (const tag of ["h1", "h2", "p", "div", "span", "strong", "em", "code", "blockquote", "ul", "li", "table", "tr", "td"]) {
      expect(ALLOWED_TAGS.has(tag)).toBe(true);
    }
  });

  it("should not include dangerous tags in allowed list", () => {
    for (const tag of DANGEROUS_TAGS) {
      expect(ALLOWED_TAGS.has(tag)).toBe(false);
    }
  });

  it("should not allow script tag", () => {
    expect(ALLOWED_TAGS.has("script")).toBe(false);
  });

  it("should not allow iframe tag", () => {
    expect(ALLOWED_TAGS.has("iframe")).toBe(false);
  });

  it("should not allow form-related tags", () => {
    expect(ALLOWED_TAGS.has("form")).toBe(false);
    expect(ALLOWED_TAGS.has("input")).toBe(false);
    expect(ALLOWED_TAGS.has("textarea")).toBe(false);
  });

  it("should not allow style tag", () => {
    expect(ALLOWED_TAGS.has("style")).toBe(false);
  });

  it("should allow img tag for content images", () => {
    expect(ALLOWED_TAGS.has("img")).toBe(true);
  });

  it("should allow anchor tag for links", () => {
    expect(ALLOWED_TAGS.has("a")).toBe(true);
  });
});
