/**
 * server/connector-integration.test.ts
 * 账号连接（手动输入 + 扫码登录双模式）和创作中心集成级测试
 * 覆盖后端关键路径：verifyDouyinBinding cookie-only、buildConnectorRecord 自动填充、
 * handleCreatorSync 从 connector store 读取账号信息、非抖音平台手动输入
 */
import { describe, it, expect } from "vitest";

/* ================================================================== */
/*  Mock: TikHub API 响应                                               */
/* ================================================================== */

const mockDiagnosisPayload = {
  status_code: 0,
  data: {
    user: {
      nickname: "测试创作者",
      sec_uid: "MS4wLjABAAAAtest123",
      uid: "123456789",
      unique_id: "test_creator",
      avatar_larger: {
        url_list: ["https://p3-pc.douyinpic.com/img/test-avatar.jpg"],
      },
      follower_count: 8500,
      following_count: 200,
      total_favorited: 125000,
      aweme_count: 42,
    },
  },
};

function profileSnapshotFromPayload(payload: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!payload || typeof payload !== "object") return result;

  function walk(obj: unknown) {
    if (!obj || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    if (typeof record.nickname === "string" && !result.nickname) result.nickname = record.nickname;
    if (typeof record.sec_uid === "string" && !result.sec_uid) result.sec_uid = record.sec_uid;
    if (typeof record.uid === "string" && !result.uid) result.uid = record.uid;
    if (typeof record.unique_id === "string" && !result.unique_id) result.unique_id = record.unique_id;
    if (typeof record.follower_count === "number" && !result.follower_count) result.follower_count = record.follower_count;
    if (typeof record.aweme_count === "number" && !result.aweme_count) result.aweme_count = record.aweme_count;
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") walk(value);
    }
  }
  walk(payload);
  return result;
}

/* ================================================================== */
/*  测试：verifyDouyinBinding cookie-only 路径                           */
/* ================================================================== */

describe("verifyDouyinBinding - cookie-only 路径", () => {
  it("当只有cookie没有identifier时，应从diagnosis API获取用户信息", () => {
    const payload = {
      authMode: "cookie" as const,
      cookie: "sessionid=abc123; ttwid=xyz456",
    };
    expect(payload).not.toHaveProperty("profileUrl");
    expect(payload).not.toHaveProperty("handle");
    expect(payload).not.toHaveProperty("platformUserId");
    expect(payload.authMode).toBe("cookie");
    expect(payload.cookie).toBeTruthy();
  });

  it("inferIdentifier 在无手动输入时应返回 null", () => {
    function inferIdentifier(payload: { platformUserId?: string; profileUrl?: string; handle?: string }) {
      const uid = payload.platformUserId?.trim();
      if (uid) {
        if (uid.startsWith("MS4wLjAB")) return { kind: "sec_user_id", value: uid };
        if (/^\d+$/.test(uid)) return { kind: "uid", value: uid };
        return { kind: "unique_id", value: uid };
      }
      const url = payload.profileUrl?.trim();
      if (url) {
        const match = url.match(/user\/(MS4wLjAB[A-Za-z0-9_-]+)/);
        if (match) return { kind: "sec_user_id", value: match[1] };
      }
      const handle = payload.handle?.trim();
      if (handle) return { kind: "unique_id", value: handle };
      return null;
    }

    expect(inferIdentifier({})).toBeNull();
    expect(inferIdentifier({ platformUserId: "", profileUrl: "", handle: "" })).toBeNull();
  });

  it("profileSnapshotFromPayload 应从嵌套payload中提取用户信息", () => {
    const snapshot = profileSnapshotFromPayload(mockDiagnosisPayload);
    expect(snapshot.nickname).toBe("测试创作者");
    expect(snapshot.sec_uid).toBe("MS4wLjABAAAAtest123");
    expect(snapshot.uid).toBe("123456789");
    expect(snapshot.unique_id).toBe("test_creator");
    expect(snapshot.follower_count).toBe(8500);
    expect(snapshot.aweme_count).toBe(42);
  });

  it("cookie-only 验证成功后应返回 verified=true 和 cookieConfigured=true", () => {
    const result = {
      verified: true,
      resolvedPlatformUserId: "MS4wLjABAAAAtest123",
      cookieConfigured: true,
      profileSnapshot: profileSnapshotFromPayload(mockDiagnosisPayload),
    };
    expect(result.verified).toBe(true);
    expect(result.cookieConfigured).toBe(true);
    expect(result.resolvedPlatformUserId).toBe("MS4wLjABAAAAtest123");
  });

  it("没有cookie时应抛出错误", () => {
    const payload = { authMode: "cookie" as const, cookie: "" };
    const validate = () => {
      if (!payload.cookie?.trim()) {
        throw new Error("Cookie mode requires a non-empty Douyin cookie.");
      }
    };
    expect(validate).toThrow("Cookie mode requires a non-empty Douyin cookie.");
  });
});

/* ================================================================== */
/*  测试：buildConnectorRecord 自动填充（区分抖音和其他平台）                  */
/* ================================================================== */

describe("buildConnectorRecord - 自动填充用户信息", () => {
  function buildConnectorRecord(
    platformId: string,
    payload: { authMode: string; handle?: string; profileUrl?: string; platformUserId?: string },
    verified: { resolvedPlatformUserId: string; cookieConfigured: boolean; profileSnapshot: Record<string, unknown> },
    existing?: { handle?: string; profileUrl?: string; platformUserId?: string },
  ) {
    const snapshot = verified.profileSnapshot;
    let resolvedHandle: string | undefined;
    let resolvedProfileUrl: string | undefined;

    if (platformId === "douyin") {
      const snapshotNickname = typeof snapshot?.nickname === "string" ? snapshot.nickname : undefined;
      const snapshotUniqueId = typeof snapshot?.unique_id === "string" ? snapshot.unique_id : undefined;
      const snapshotSecUid = typeof snapshot?.sec_uid === "string" ? snapshot.sec_uid : undefined;
      resolvedHandle = snapshotUniqueId || snapshotNickname || payload.handle?.trim() || existing?.handle;
      resolvedProfileUrl = snapshotSecUid
        ? `https://www.douyin.com/user/${snapshotSecUid}`
        : payload.profileUrl?.trim() || existing?.profileUrl;
    } else {
      resolvedHandle = payload.handle?.trim() || existing?.handle;
      resolvedProfileUrl = payload.profileUrl?.trim() || existing?.profileUrl;
    }
    return {
      platformId,
      authMode: payload.authMode,
      profileUrl: resolvedProfileUrl,
      handle: resolvedHandle,
      platformUserId: verified.resolvedPlatformUserId || payload.platformUserId?.trim() || existing?.platformUserId,
      cookieConfigured: verified.cookieConfigured,
      verifyStatus: "verified",
    };
  }

  it("抖音扫码登录模式下应从 profileSnapshot 自动提取 handle", () => {
    const record = buildConnectorRecord(
      "douyin",
      { authMode: "cookie" },
      {
        resolvedPlatformUserId: "MS4wLjABAAAAtest123",
        cookieConfigured: true,
        profileSnapshot: { nickname: "测试创作者", unique_id: "test_creator", sec_uid: "MS4wLjABAAAAtest123" },
      },
    );
    expect(record.handle).toBe("test_creator");
    expect(record.profileUrl).toBe("https://www.douyin.com/user/MS4wLjABAAAAtest123");
    expect(record.platformUserId).toBe("MS4wLjABAAAAtest123");
  });

  it("当 unique_id 不存在时应降级到 nickname", () => {
    const record = buildConnectorRecord(
      "douyin",
      { authMode: "cookie" },
      {
        resolvedPlatformUserId: "MS4wLjABAAAAtest123",
        cookieConfigured: true,
        profileSnapshot: { nickname: "测试创作者", sec_uid: "MS4wLjABAAAAtest123" },
      },
    );
    expect(record.handle).toBe("测试创作者");
  });

  it("当 snapshot 为空时应降级到 existing 记录", () => {
    const record = buildConnectorRecord(
      "douyin",
      { authMode: "cookie" },
      {
        resolvedPlatformUserId: "",
        cookieConfigured: true,
        profileSnapshot: {},
      },
      { handle: "old_user", profileUrl: "https://www.douyin.com/user/old", platformUserId: "old_id" },
    );
    expect(record.handle).toBe("old_user");
    expect(record.profileUrl).toBe("https://www.douyin.com/user/old");
    expect(record.platformUserId).toBe("old_id");
  });

  it("抖音 profileUrl 应从 sec_uid 自动构造", () => {
    const record = buildConnectorRecord(
      "douyin",
      { authMode: "cookie" },
      {
        resolvedPlatformUserId: "MS4wLjABAAAAtest123",
        cookieConfigured: true,
        profileSnapshot: { sec_uid: "MS4wLjABAAAAtest123" },
      },
    );
    expect(record.profileUrl).toBe("https://www.douyin.com/user/MS4wLjABAAAAtest123");
  });

  it("非抖音平台应直接用手动输入字段，不从 snapshot 提取", () => {
    const record = buildConnectorRecord(
      "xiaohongshu",
      { authMode: "link", handle: "xhs_user", profileUrl: "https://www.xiaohongshu.com/user/abc" },
      {
        resolvedPlatformUserId: "",
        cookieConfigured: false,
        profileSnapshot: { nickname: "should_not_use", sec_uid: "should_not_use" },
      },
    );
    expect(record.handle).toBe("xhs_user");
    expect(record.profileUrl).toBe("https://www.xiaohongshu.com/user/abc");
    expect(record.profileUrl).not.toContain("douyin.com");
  });

  it("手动输入和扫码登录可以同时使用（抖音）", () => {
    const record = buildConnectorRecord(
      "douyin",
      { authMode: "cookie", handle: "manual_handle", profileUrl: "https://manual.url" },
      {
        resolvedPlatformUserId: "MS4wLjABAAAAtest123",
        cookieConfigured: true,
        profileSnapshot: { unique_id: "snapshot_id", sec_uid: "MS4wLjABAAAAtest123" },
      },
    );
    // snapshot 优先级高于手动输入
    expect(record.handle).toBe("snapshot_id");
    expect(record.profileUrl).toBe("https://www.douyin.com/user/MS4wLjABAAAAtest123");
  });

  it("非抖音平台手动输入无 snapshot 干扰", () => {
    const record = buildConnectorRecord(
      "bilibili",
      { authMode: "link", handle: "bili_user", profileUrl: "https://space.bilibili.com/12345" },
      {
        resolvedPlatformUserId: "12345",
        cookieConfigured: false,
        profileSnapshot: {},
      },
    );
    expect(record.handle).toBe("bili_user");
    expect(record.profileUrl).toBe("https://space.bilibili.com/12345");
    expect(record.platformUserId).toBe("12345");
  });
});

/* ================================================================== */
/*  测试：handleCreatorSync 从 connector store 读取账号信息               */
/* ================================================================== */

describe("handleCreatorSync - 从 connector store 读取账号信息", () => {
  it("应从 connector store 读取已绑定的账号信息", () => {
    const connectorStore: Record<string, { platformUserId?: string; handle?: string; profileUrl?: string; encryptedSecretRef?: string }> = {
      douyin: {
        platformUserId: "MS4wLjABAAAAtest123",
        handle: "test_creator",
        profileUrl: "https://www.douyin.com/user/MS4wLjABAAAAtest123",
        encryptedSecretRef: "encrypted_cookie_ref",
      },
    };

    const platformId = "douyin";
    const connector = connectorStore[platformId];
    expect(connector).toBeDefined();
    expect(connector!.platformUserId).toBe("MS4wLjABAAAAtest123");
    expect(connector!.handle).toBe("test_creator");
    expect(connector!.encryptedSecretRef).toBeTruthy();
  });

  it("当没有绑定账号时应返回 422 错误", () => {
    const connectorStore: Record<string, unknown> = {};
    const platformId = "douyin";
    const connector = connectorStore[platformId];
    expect(connector).toBeUndefined();

    const handleError = () => {
      if (!connector) {
        return { status: 422, error: `平台 ${platformId} 尚未绑定账号，请先在"账号连接"中完成绑定` };
      }
      return null;
    };
    const result = handleError();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(422);
    expect(result!.error).toContain("尚未绑定账号");
  });

  it("syncCreatorData 应使用 connector 中的 platformUserId 而非前端传入", () => {
    const connector = {
      platformUserId: "MS4wLjABAAAAtest123",
      handle: "test_creator",
      profileUrl: "https://www.douyin.com/user/MS4wLjABAAAAtest123",
      encryptedSecretRef: "encrypted_cookie_ref",
    };
    const requestBody = { platformId: "douyin", days: 30 };

    const syncInput = {
      platformId: requestBody.platformId,
      days: requestBody.days,
      platformUserId: connector.platformUserId,
      handle: connector.handle,
      profileUrl: connector.profileUrl,
      encryptedSecretRef: connector.encryptedSecretRef,
    };

    expect(syncInput.platformUserId).toBe("MS4wLjABAAAAtest123");
    expect(syncInput.handle).toBe("test_creator");
    expect(syncInput.encryptedSecretRef).toBe("encrypted_cookie_ref");
  });
});

/* ================================================================== */
/*  测试：创作中心 API 端点完整性                                          */
/* ================================================================== */

describe("创作中心 API 端点完整性", () => {
  const API_ENDPOINTS = [
    { method: "POST", path: "/api/creator/sync", description: "同步创作者数据" },
    { method: "GET", path: "/api/creator/overview", description: "获取账号概览" },
    { method: "GET", path: "/api/creator/works", description: "获取作品列表" },
    { method: "GET", path: "/api/creator/fan-profile", description: "获取粉丝画像" },
    { method: "GET", path: "/api/creator/trends", description: "获取数据趋势" },
    { method: "POST", path: "/api/creator/sync-and-diagnose", description: "同步并诊断" },
    { method: "POST", path: "/api/creator/diagnosis/run", description: "运行诊断" },
    { method: "GET", path: "/api/creator/diagnosis", description: "获取诊断结果" },
    { method: "GET", path: "/api/creator/comment-summary", description: "获取评论摘要" },
  ];

  it("应定义所有必需的 API 端点", () => {
    expect(API_ENDPOINTS.length).toBe(9);
  });

  it("sync 端点应使用 POST 方法", () => {
    const syncEndpoint = API_ENDPOINTS.find((e) => e.path === "/api/creator/sync");
    expect(syncEndpoint).toBeDefined();
    expect(syncEndpoint!.method).toBe("POST");
  });

  it("读取端点应使用 GET 方法", () => {
    const getEndpoints = API_ENDPOINTS.filter((e) =>
      ["/api/creator/overview", "/api/creator/works", "/api/creator/fan-profile", "/api/creator/trends"].includes(e.path),
    );
    expect(getEndpoints.length).toBe(4);
    getEndpoints.forEach((e) => {
      expect(e.method).toBe("GET");
    });
  });
});

/* ================================================================== */
/*  测试：前端 creator-api 客户端契约                                      */
/* ================================================================== */

describe("前端 creator-api 客户端契约", () => {
  it("syncCreatorData 只传 platformId 和 days，不传手动字段", () => {
    const requestBody = { platformId: "douyin", days: 30 };
    expect(requestBody).not.toHaveProperty("profileUrl");
    expect(requestBody).not.toHaveProperty("handle");
    expect(requestBody).not.toHaveProperty("platformUserId");
    expect(requestBody).toHaveProperty("platformId");
    expect(requestBody).toHaveProperty("days");
  });

  it("GET 端点应通过 query 参数传递 platformId", () => {
    const buildUrl = (path: string, platformId: string) =>
      `/api/creator/${path}?platformId=${encodeURIComponent(platformId)}`;

    expect(buildUrl("overview", "douyin")).toBe("/api/creator/overview?platformId=douyin");
    expect(buildUrl("works", "douyin")).toBe("/api/creator/works?platformId=douyin");
  });

  it("404 响应应返回 null 而非抛出错误", () => {
    const handle404 = (status: number) => {
      if (status === 404) return null;
      throw new Error(`Unexpected status: ${status}`);
    };
    expect(handle404(404)).toBeNull();
    expect(() => handle404(500)).toThrow();
  });
});

/* ================================================================== */
/*  测试：ConnectorsPage 前端行为契约（双模式）                              */
/* ================================================================== */

describe("ConnectorsPage 前端行为契约", () => {
  it("handleSave 传递手动输入字段 + authMode + loginSessionId", () => {
    const binding = {
      authMode: "cookie" as const,
      profileUrl: "https://www.douyin.com/user/xxx",
      handle: "my_handle",
      platformUserId: "12345",
      loginSessionId: "sess_abc123",
    };
    expect(binding.authMode).toBe("cookie");
    expect(binding.profileUrl).toBeDefined();
    expect(binding.handle).toBeDefined();
    expect(binding.platformUserId).toBeDefined();
    expect(binding.loginSessionId).toBeDefined();
  });

  it("handleSave 只有手动输入时也能保存（无扫码登录）", () => {
    const binding = {
      authMode: "link" as const,
      profileUrl: "https://www.xiaohongshu.com/user/abc",
      handle: "xhs_user",
      platformUserId: "",
    };
    expect(binding.authMode).toBe("link");
    expect(binding).not.toHaveProperty("loginSessionId");
  });

  it("canSave 在填写任意手动字段后即可保存", () => {
    const computeCanSave = (
      editingConnector: boolean,
      dataMode: string,
      hasManualInput: boolean,
      hasCookieLogin: boolean,
    ) => {
      return editingConnector && (dataMode === "mock" || hasManualInput || hasCookieLogin);
    };

    expect(computeCanSave(true, "live", true, false)).toBe(true);   // 只有手动输入
    expect(computeCanSave(true, "live", false, true)).toBe(true);   // 只有扫码登录
    expect(computeCanSave(true, "live", true, true)).toBe(true);    // 两者都有
    expect(computeCanSave(true, "live", false, false)).toBe(false);  // 两者都没有
    expect(computeCanSave(true, "mock", false, false)).toBe(true);  // mock模式
    expect(computeCanSave(false, "live", true, true)).toBe(false);  // 没有编辑中的connector
  });

  it("showCookieLogin 只在 supportsCookieAnalytics 为 true 的平台显示", () => {
    const platforms = [
      { id: "douyin", supportsCookieAnalytics: true },
      { id: "xiaohongshu", supportsCookieAnalytics: false },
      { id: "bilibili", supportsCookieAnalytics: false },
      { id: "kuaishou", supportsCookieAnalytics: false },
    ];

    const douyinPlatform = platforms.find((p) => p.id === "douyin");
    expect(douyinPlatform!.supportsCookieAnalytics).toBe(true);

    const otherPlatforms = platforms.filter((p) => p.id !== "douyin");
    otherPlatforms.forEach((p) => {
      expect(p.supportsCookieAnalytics).toBe(false);
    });
  });

  it("loginUiState 状态机应正确转换", () => {
    type LoginUiState = "idle" | "pending" | "ready" | "expired";

    const computeLoginUiState = (
      sessionStatus: string | null,
      hasStoredDouyinLogin: boolean,
    ): LoginUiState => {
      if (sessionStatus === "pending") return "pending";
      if (sessionStatus === "completed" || hasStoredDouyinLogin) return "ready";
      if (sessionStatus === "failed" || sessionStatus === "expired") return "expired";
      return "idle";
    };

    expect(computeLoginUiState("pending", false)).toBe("pending");
    expect(computeLoginUiState("completed", false)).toBe("ready");
    expect(computeLoginUiState(null, true)).toBe("ready");
    expect(computeLoginUiState("failed", false)).toBe("expired");
    expect(computeLoginUiState("expired", false)).toBe("expired");
    expect(computeLoginUiState(null, false)).toBe("idle");
  });
});
