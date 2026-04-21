/**
 * toolbox-v2.test.ts — 视频下载 + 智能链接解析 测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 视频下载服务测试 ───

describe("video-download service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should export parseAndDownloadVideo function", async () => {
    const mod = await import("./services/video-download");
    expect(typeof mod.parseAndDownloadVideo).toBe("function");
  });

  it("should return error for empty input", async () => {
    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo("");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("不能为空");
  });

  it("should return error for whitespace-only input", async () => {
    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("不能为空");
  });

  it("should extract URL from share text", async () => {
    // Mock fetch to avoid real API call
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: true,
          data: [
            {
              type: "VIDEO",
              title: "测试视频",
              originalLink: "https://www.douyin.com/video/123",
              cover: { url: "https://cdn.example.com/cover.jpg" },
              videos: [{ url: "https://cdn.example.com/video.mp4" }],
              audios: [{ url: "https://cdn.example.com/audio.mp3" }],
              likeCount: 1000,
              collectCount: 500,
              shareCount: 200,
              commentCount: 100,
              pt: "抖音",
            },
          ],
        }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo(
      "3.82 复制打开抖音，看看【测试】的作品 https://v.douyin.com/abc123/ 更多精彩",
    );
    expect(result.ok).toBe(true);
    expect(result.title).toBe("测试视频");
    expect(result.platform).toBe("抖音");
    expect(result.videoUrl).toBe("https://cdn.example.com/video.mp4");
    expect(result.audioUrl).toBe("https://cdn.example.com/audio.mp3");
    expect(result.stats.likeCount).toBe(1000);
  });

  it("should handle API failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("Server Error"),
    } as Response);

    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo("https://v.douyin.com/test123/");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("should handle network timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("The operation was aborted"));

    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo("https://v.douyin.com/test123/");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("超时");
  });

  it("should detect platform from URL", async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: true,
          data: [
            {
              type: "VIDEO",
              title: "B站视频",
              originalLink: "https://www.bilibili.com/video/BV123",
              videos: [{ url: "https://cdn.example.com/bv.mp4" }],
              audios: [],
            },
          ],
        }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const { parseAndDownloadVideo } = await import("./services/video-download");
    const result = await parseAndDownloadVideo("https://www.bilibili.com/video/BV123");
    expect(result.ok).toBe(true);
    expect(result.title).toBe("B站视频");
  });
});

// ─── 智能链接解析服务测试 ───

describe("smart-link-parser service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should export smartParseLink function", async () => {
    const mod = await import("./services/smart-link-parser");
    expect(typeof mod.smartParseLink).toBe("function");
  });

  it("should return error for empty input", async () => {
    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("error");
  });

  it("should return error for non-URL input", async () => {
    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("not a url");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("error");
    expect(result.error).toContain("http");
  });

  it("should identify video URL and call video parser", async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: true,
          data: [
            {
              type: "VIDEO",
              title: "抖音视频",
              originalLink: "https://v.douyin.com/abc",
              pt: "抖音",
              cover: { url: "https://cdn.example.com/cover.jpg" },
              videos: [{ url: "https://cdn.example.com/video.mp4" }],
              audios: [{ url: "https://cdn.example.com/audio.mp3" }],
              likeCount: 5000,
              collectCount: 300,
            },
          ],
        }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://v.douyin.com/abc123/");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("video");
    expect(result.platform).toBe("抖音");
    expect(result.videoUrl).toBe("https://cdn.example.com/video.mp4");
  });

  it("should identify Bilibili URL as video", async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: true,
          data: [
            {
              type: "VIDEO",
              title: "B站视频",
              originalLink: "https://www.bilibili.com/video/BV123",
              pt: "B站",
              videos: [{ url: "https://cdn.example.com/bv.mp4" }],
              audios: [],
            },
          ],
        }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://www.bilibili.com/video/BV123");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("video");
  });

  it("should identify Xiaohongshu URL as video", async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: true,
          data: [
            {
              type: "VIDEO",
              title: "小红书笔记",
              originalLink: "https://www.xiaohongshu.com/explore/123",
              pt: "小红书",
              videos: [],
              audios: [],
            },
          ],
        }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://www.xiaohongshu.com/explore/123");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("video");
  });

  it("should parse webpage URL and return markdown content", async () => {
    const mockHtml = `
      <html>
        <head><title>测试文章</title></head>
        <body>
          <h1>文章标题</h1>
          <p>这是一篇测试文章的内容，包含足够多的文字来通过内容检测。</p>
          <p>第二段内容，确保有足够的文本长度来避免被判定为受限内容。</p>
          <p>第三段内容，继续添加更多文字以确保通过所有检查。</p>
        </body>
      </html>
    `;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://example.com/article");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("webpage");
    expect(result.title).toBe("测试文章");
    expect(result.content).toContain("文章标题");
  });

  it("should detect WeChat article as article type", async () => {
    const mockHtml = `
      <html>
        <head><title>微信公众号文章</title></head>
        <body>
          <h1>微信文章标题</h1>
          <p>这是一篇微信公众号文章的内容，包含足够多的文字来通过内容检测。</p>
          <p>第二段内容，确保有足够的文本长度。</p>
        </body>
      </html>
    `;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://mp.weixin.qq.com/s/abc123");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("article");
  });

  it("should detect login wall restriction", async () => {
    const mockHtml = `
      <html>
        <head><title>请登录</title></head>
        <body>
          <div>请登录后查看完整内容</div>
        </body>
      </html>
    `;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://example.com/protected");
    expect(result.kind).toBe("restricted");
    expect(result.restrictionWarning).toBeTruthy();
    expect(result.restrictionWarning).toContain("登录");
  });

  it("should detect app-only restriction", async () => {
    const mockHtml = `
      <html>
        <head><title>提示</title></head>
        <body>
          <div>请在App中打开查看完整内容</div>
        </body>
      </html>
    `;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://example.com/app-only");
    expect(result.kind).toBe("restricted");
    expect(result.restrictionWarning).toContain("App");
  });

  it("should handle video parse failure as restricted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 200,
          ok: false,
          data: [null],
        }),
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://v.douyin.com/restricted123/");
    expect(result.kind).toBe("restricted");
    expect(result.restrictionWarning).toBeTruthy();
  });

  it("should handle webpage fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response);

    const { smartParseLink } = await import("./services/smart-link-parser");
    const result = await smartParseLink("https://example.com/forbidden");
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("error");
    expect(result.error).toContain("403");
  });
});

// ─── tRPC 路由注册测试 ───

describe("copywriting router", () => {
  it("should export copywritingRouter with videoDownload and smartParse procedures", async () => {
    const { copywritingRouter } = await import("./routers/copywriting");
    expect(copywritingRouter).toBeDefined();

    // Check that the router has the expected procedures
    const procedures = Object.keys(copywritingRouter._def.procedures);
    expect(procedures).toContain("extract");
    expect(procedures).toContain("parseLink");
    expect(procedures).toContain("transcribe");
    expect(procedures).toContain("optimize");
    expect(procedures).toContain("videoDownload");
    expect(procedures).toContain("smartParse");
  });
});
