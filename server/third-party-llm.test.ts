import { describe, it, expect } from "vitest";

describe("Third-party LLM (Apollo Gemini 3.1 Pro) credentials", () => {
  it("should have THIRD_PARTY_LLM_BASE_URL configured", () => {
    expect(process.env.THIRD_PARTY_LLM_BASE_URL).toBeTruthy();
    expect(process.env.THIRD_PARTY_LLM_BASE_URL).toContain("ablai.top");
  });

  it("should have THIRD_PARTY_LLM_API_KEY configured", () => {
    expect(process.env.THIRD_PARTY_LLM_API_KEY).toBeTruthy();
    expect(process.env.THIRD_PARTY_LLM_API_KEY!.startsWith("sk-")).toBe(true);
  });

  it("should successfully call the API with a simple prompt", async () => {
    const apiUrl = process.env.THIRD_PARTY_LLM_BASE_URL;
    const apiKey = process.env.THIRD_PARTY_LLM_API_KEY;

    // Skip if env vars not available in test runner
    if (!apiUrl || !apiKey) {
      console.log("Skipping API call test: env vars not available in vitest");
      return;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-3.1-pro-preview",
        messages: [
          { role: "user", content: "Say hello in one word" },
        ],
        max_tokens: 32,
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
    expect(data.choices[0].message.content).toBeTruthy();
  }, 30000);
});
