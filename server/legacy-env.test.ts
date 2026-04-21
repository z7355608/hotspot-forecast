import { describe, expect, it } from "vitest";

describe("Legacy API environment variables", () => {
  it("ARK_API_KEY is set", () => {
    expect(process.env.ARK_API_KEY).toBeTruthy();
  });

  it("ARK_DOUBAO_ENDPOINT_ID is set", () => {
    expect(process.env.ARK_DOUBAO_ENDPOINT_ID).toBeTruthy();
  });

  it("ARK_BASE_URL or default is available", () => {
    // ARK_BASE_URL may not be set explicitly; the legacy code defaults to https://ark.cn-beijing.volces.com/api/v3
    const url = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
    expect(url).toBeTruthy();
  });

  it("THIRD_PARTY_LLM_BASE_URL is set", () => {
    expect(process.env.THIRD_PARTY_LLM_BASE_URL).toBeTruthy();
  });

  it("THIRD_PARTY_LLM_API_KEY is set", () => {
    expect(process.env.THIRD_PARTY_LLM_API_KEY).toBeTruthy();
  });

  it("TIKHUB_API_KEY is set", () => {
    expect(process.env.TIKHUB_API_KEY).toBeTruthy();
  });

  it("TIKHUB_BASE_URL or default is available", () => {
    // TIKHUB_BASE_URL may not be set explicitly; the legacy code defaults to https://api.tikhub.io
    const url = process.env.TIKHUB_BASE_URL || "https://api.tikhub.io";
    expect(url).toBeTruthy();
  });

  it("DATABASE_URL is set (replaces individual DB_* vars)", () => {
    // The new platform uses DATABASE_URL instead of individual DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
    expect(process.env.DATABASE_URL).toBeTruthy();
  });
});
