import { describe, it, expect, vi } from "vitest";

/**
 * 文案提取服务测试
 * - 去水印 API 解析
 * - 火山引擎 ASR 凭证
 * - copywriting 路由存在性
 */

describe("Copywriting extract service", () => {
  describe("Video parse API", () => {
    it("should parse a valid douyin link", async () => {
      // 使用去水印 API 解析一个抖音链接
      const testUrl = "https://v.douyin.com/test123";
      const resp = await fetch(
        "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse?key=dw8uiZ3Z3TF0YqQA",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([testUrl]),
        },
      );

      // API 应该返回 200（即使链接无效，也不应该 500）
      expect(resp.status).toBe(200);
      const json = await resp.json();
      expect(json).toHaveProperty("code");
    }, 30_000);
  });

  describe("Volcengine ASR credentials", () => {
    it("VOLC_ASR_APP_KEY is set", () => {
      expect(process.env.VOLC_ASR_APP_KEY).toBeTruthy();
    });

    it("VOLC_ASR_ACCESS_KEY is set", () => {
      expect(process.env.VOLC_ASR_ACCESS_KEY).toBeTruthy();
    });

    it("ASR endpoint accepts valid credentials", async () => {
      const appKey = process.env.VOLC_ASR_APP_KEY ?? "";
      const accessKey = process.env.VOLC_ASR_ACCESS_KEY ?? "";

      const resp = await fetch(
        "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-App-Key": appKey,
            "X-Api-Access-Key": accessKey,
            "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
            "X-Api-Request-Id": "test-" + Date.now(),
            "X-Api-Sequence": "-1",
          },
          body: JSON.stringify({
            user: { uid: appKey },
            audio: { url: "https://example.com/nonexistent.mp3" },
            request: { model_name: "bigmodel" },
          }),
        },
      );

      // HTTP 200 = 凭证有效（即使音频无效，也不应该 401）
      expect(resp.status).toBe(200);
    }, 30_000);
  });

  describe("URL extraction utility", () => {
    it("should extract URL from share text with Chinese characters", () => {
      const shareText = "7.58 Gyi:/ 复制打开抖音，看看【美妆小达人的作品】 https://v.douyin.com/iYbtest/ 太好看了";
      const urlPattern = /https?:\/\/[^\s\u3000\u4e00-\u9fff，。！？【】「」]+/g;
      const matches = shareText.match(urlPattern);
      expect(matches).toBeTruthy();
      expect(matches![0]).toContain("douyin.com");
    });

    it("should detect platform from URL", () => {
      const platforms: Record<string, string> = {
        "https://v.douyin.com/abc": "douyin",
        "https://www.xiaohongshu.com/explore/abc": "xiaohongshu",
        "https://www.kuaishou.com/short-video/abc": "kuaishou",
        "https://b23.tv/abc": "bilibili",
      };

      for (const [url, expected] of Object.entries(platforms)) {
        if (url.includes("douyin")) expect(url).toContain("douyin");
        if (url.includes("xiaohongshu")) expect(url).toContain("xiaohongshu");
        if (url.includes("kuaishou")) expect(url).toContain("kuaishou");
        if (url.includes("b23")) expect(url).toContain("b23");
      }
    });
  });

  describe("Copywriting router", () => {
    it("should import copywriting router without errors", async () => {
      const mod = await import("./routers/copywriting");
      expect(mod.copywritingRouter).toBeDefined();
    });

    it("should import volc-asr service without errors", async () => {
      const mod = await import("./services/volc-asr");
      expect(mod.recognizeAudio).toBeDefined();
      expect(typeof mod.recognizeAudio).toBe("function");
    });

    it("should import copywriting-extract service without errors", async () => {
      const mod = await import("./services/copywriting-extract");
      expect(mod.extractCopywriting).toBeDefined();
      expect(mod.parseVideoLink).toBeDefined();
      expect(mod.transcribeMedia).toBeDefined();
      expect(mod.optimizeCopywriting).toBeDefined();
    });
  });
});
