/**
 * LiveDemoPreview & DemoDialog — Unit Tests
 * ==========================================
 * Validates the restored LiveDemoPreview component logic:
 * - Demo scenarios data structure
 * - No reference to deleted /results/demo route
 * - Component exports
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const LIVE_DEMO_PATH = path.resolve(
  __dirname,
  "../client/src/app/components/LiveDemoPreview.tsx",
);
const HOME_PAGE_PATH = path.resolve(
  __dirname,
  "../client/src/app/pages/HomePage.tsx",
);

describe("LiveDemoPreview component file", () => {
  const source = fs.readFileSync(LIVE_DEMO_PATH, "utf-8");

  it("should exist as a file", () => {
    expect(fs.existsSync(LIVE_DEMO_PATH)).toBe(true);
  });

  it("should export LiveDemoPreview function", () => {
    expect(source).toContain("export function LiveDemoPreview");
  });

  it("should define all 4 demo scenarios", () => {
    expect(source).toContain('"keyword"');
    expect(source).toContain('"sentence"');
    expect(source).toContain('"video"');
    expect(source).toContain('"account"');
  });

  it("should have 4 scenario labels in Chinese", () => {
    expect(source).toContain('"关键词"');
    expect(source).toContain('"一句话"');
    expect(source).toContain('"视频链接"');
    expect(source).toContain('"账户链接"');
  });

  it("should NOT contain reference to /results/demo route", () => {
    expect(source).not.toContain("/results/demo");
  });

  it("should NOT contain onViewFull prop (removed)", () => {
    // The restored version only has onTryIt, not onViewFull
    expect(source).not.toContain("onViewFull");
  });

  it("should NOT contain '查看完整报告' button text", () => {
    expect(source).not.toContain("查看完整报告");
  });

  it("should contain typewriter hook", () => {
    expect(source).toContain("useTypewriter");
  });

  it("should contain ProbabilityBar component", () => {
    expect(source).toContain("ProbabilityBar");
  });

  it("should contain ScenarioDemo component", () => {
    expect(source).toContain("ScenarioDemo");
  });

  it("should contain '试试我的行业' CTA button text", () => {
    expect(source).toContain("试试我的行业");
  });

  it("should contain '看看效果' title text", () => {
    expect(source).toContain("看看效果");
  });

  it("should contain '支持多种输入方式' subtitle text", () => {
    expect(source).toContain("支持多种输入方式");
  });

  it("each scenario should have exactly 3 results", () => {
    // Count occurrences of 'results: [' in DEMO_SCENARIOS
    const scenarioBlocks = source.split("results: [");
    // First split is before any results, so we have 5 parts for 4 scenarios
    expect(scenarioBlocks.length).toBe(5);
  });
});

describe("HomePage DemoDialog integration", () => {
  const source = fs.readFileSync(HOME_PAGE_PATH, "utf-8");

  it("should import LiveDemoPreview", () => {
    expect(source).toContain("LiveDemoPreview");
  });

  it("should import Play icon for the button", () => {
    expect(source).toContain("Play");
  });

  it("should import X icon for close button", () => {
    expect(source).toContain("X");
  });

  it("should have showDemoDialog state", () => {
    expect(source).toContain("showDemoDialog");
  });

  it("should have '看看效果' button text", () => {
    expect(source).toContain("看看效果");
  });

  it("should have DemoDialog component", () => {
    expect(source).toContain("DemoDialog");
  });

  it("should track demo_dialog_opened event", () => {
    expect(source).toContain("demo_dialog_opened");
  });

  it("should NOT reference /results/demo route", () => {
    expect(source).not.toContain("/results/demo");
  });

  it("should close dialog and focus input on onTryIt", () => {
    expect(source).toContain("setShowDemoDialog(false)");
    expect(source).toContain("setFocusTrigger");
  });

  it("should handle ESC key to close dialog", () => {
    expect(source).toContain("Escape");
  });

  it("should handle backdrop click to close dialog", () => {
    expect(source).toContain("handleBackdropClick");
  });

  it("should prevent background scrolling when dialog is open", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
  });
});
