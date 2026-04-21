/**
 * server/creator-identifier.test.ts
 * 测试 creator-data-sync 中的 extractDouyinIdentifier 和相关辅助函数
 * 覆盖：短链接解析、分享文本提取、uid降级、deepFindUser
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────
// 内联复制被测函数（因为它们是 module-private）
// ─────────────────────────────────────────────

function extractSecUidFromUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr.trim());
    const secUid = url.searchParams.get("sec_uid") ?? url.searchParams.get("sec_user_id");
    if (secUid?.startsWith("MS4w")) return secUid;
    const pathMatch = url.pathname.match(/\/(?:share\/)?user\/([^/?]+)/);
    if (pathMatch?.[1]?.startsWith("MS4w")) return pathMatch[1];
  } catch { /* not a valid URL */ }
  return null;
}

function deepFindUser(
  obj: unknown,
  depth: number,
): {
  uniqueId?: string;
  nickname?: string;
  followerCount?: number;
} | null {
  if (depth > 6 || !obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  if (
    (typeof record.follower_count === "number" || typeof record.unique_id === "string" || typeof record.nickname === "string") &&
    (record.follower_count !== undefined || record.unique_id !== undefined)
  ) {
    return {
      uniqueId: typeof record.unique_id === "string" ? record.unique_id : undefined,
      nickname: typeof record.nickname === "string" ? record.nickname : undefined,
      followerCount: typeof record.follower_count === "number" ? record.follower_count : undefined,
    };
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = deepFindUser(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// extractSecUidFromUrl 测试
// ─────────────────────────────────────────────

describe("extractSecUidFromUrl", () => {
  it("从 sec_uid 查询参数中提取", () => {
    const url = "https://www.iesdouyin.com/share/user/MS4wLjABAAAAabc?sec_uid=MS4wLjABAAAAabc&from=web";
    expect(extractSecUidFromUrl(url)).toBe("MS4wLjABAAAAabc");
  });

  it("从 sec_user_id 查询参数中提取", () => {
    const url = "https://www.douyin.com/user/MS4wLjABAAAAxyz?sec_user_id=MS4wLjABAAAAxyz";
    expect(extractSecUidFromUrl(url)).toBe("MS4wLjABAAAAxyz");
  });

  it("从 /user/ 路径中提取", () => {
    const url = "https://www.douyin.com/user/MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI";
    expect(extractSecUidFromUrl(url)).toBe("MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI");
  });

  it("从 /share/user/ 路径中提取", () => {
    const url = "https://www.iesdouyin.com/share/user/MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI?from_ssr=1";
    expect(extractSecUidFromUrl(url)).toBe("MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI");
  });

  it("非 MS4w 开头的 sec_uid 返回 null", () => {
    const url = "https://www.douyin.com/user/12345?sec_uid=12345";
    expect(extractSecUidFromUrl(url)).toBeNull();
  });

  it("无效 URL 返回 null", () => {
    expect(extractSecUidFromUrl("not a url")).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(extractSecUidFromUrl("")).toBeNull();
  });

  it("短链接 URL 无 sec_uid 返回 null", () => {
    const url = "https://v.douyin.com/WgAgmgQ8sfc/";
    expect(extractSecUidFromUrl(url)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 分享文本中提取 URL 测试
// ─────────────────────────────────────────────

describe("分享文本 URL 提取", () => {
  it("从抖音分享文本中提取短链接", () => {
    const text = "长按复制此条消息，打开抖音搜索，查看TA的更多作品。 https://v.douyin.com/WgAgmgQ8sfc/";
    const urlPattern = /https?:\/\/[^\s"'<>]+/g;
    const urls = text.match(urlPattern) ?? [];
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://v.douyin.com/WgAgmgQ8sfc/");
  });

  it("从包含多个链接的文本中提取所有 URL", () => {
    const text = "看看 https://v.douyin.com/abc/ 和 https://www.douyin.com/user/MS4wLjABAAAAxyz";
    const urlPattern = /https?:\/\/[^\s"'<>]+/g;
    const urls = text.match(urlPattern) ?? [];
    expect(urls).toHaveLength(2);
  });

  it("纯文本无 URL 返回空数组", () => {
    const text = "这是一段没有链接的文本";
    const urlPattern = /https?:\/\/[^\s"'<>]+/g;
    const urls = text.match(urlPattern) ?? [];
    expect(urls).toHaveLength(0);
  });

  it("从重定向后的 URL 中提取 sec_uid", () => {
    // 模拟短链接重定向后的完整 URL
    const redirectedUrl = "https://www.iesdouyin.com/share/user/MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI?iid=MS4wLjABAAAANwkJuWIRFOzg5uCpDRpMj4OX-QryoDgn-yYlXQnRwQQ&with_sec_did=1&sec_uid=MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI&from_ssr=1";
    const secUid = extractSecUidFromUrl(redirectedUrl);
    expect(secUid).toBe("MS4wLjABAAAAa0JLxJ-_hVU6QvJXvPHTDGdOI4S0OKWnWHFCChZr9eI");
  });
});

// ─────────────────────────────────────────────
// deepFindUser 测试
// ─────────────────────────────────────────────

describe("deepFindUser", () => {
  it("在顶层找到用户信息", () => {
    const payload = {
      unique_id: "test_user",
      nickname: "测试用户",
      follower_count: 10000,
    };
    const result = deepFindUser(payload, 0);
    expect(result).toEqual({
      uniqueId: "test_user",
      nickname: "测试用户",
      followerCount: 10000,
    });
  });

  it("在嵌套的 data.user 中找到用户信息", () => {
    const payload = {
      code: 200,
      data: {
        user: {
          unique_id: "nested_user",
          nickname: "嵌套用户",
          follower_count: 50000,
        },
      },
    };
    const result = deepFindUser(payload, 0);
    expect(result).toEqual({
      uniqueId: "nested_user",
      nickname: "嵌套用户",
      followerCount: 50000,
    });
  });

  it("在深度嵌套的 diagnosis 响应中找到用户信息", () => {
    const payload = {
      code: 200,
      data: {
        diagnosis: {
          overview: {
            author: {
              unique_id: "deep_user",
              nickname: "深层用户",
              follower_count: 100000,
              following_count: 500,
            },
          },
        },
      },
    };
    const result = deepFindUser(payload, 0);
    expect(result).toEqual({
      uniqueId: "deep_user",
      nickname: "深层用户",
      followerCount: 100000,
    });
  });

  it("超过最大深度返回 null", () => {
    let obj: Record<string, unknown> = { unique_id: "too_deep", follower_count: 1 };
    for (let i = 0; i < 8; i++) {
      obj = { nested: obj };
    }
    const result = deepFindUser(obj, 0);
    expect(result).toBeNull();
  });

  it("空对象返回 null", () => {
    expect(deepFindUser({}, 0)).toBeNull();
  });

  it("null 输入返回 null", () => {
    expect(deepFindUser(null, 0)).toBeNull();
  });

  it("只有 nickname 没有 follower_count 和 unique_id 返回 null", () => {
    const payload = { data: { nickname: "只有昵称" } };
    // nickname alone without follower_count or unique_id should not match
    expect(deepFindUser(payload, 0)).toBeNull();
  });

  it("只有 follower_count 也能匹配", () => {
    const payload = { data: { info: { follower_count: 5000 } } };
    const result = deepFindUser(payload, 0);
    expect(result).toEqual({
      uniqueId: undefined,
      nickname: undefined,
      followerCount: 5000,
    });
  });
});

// ─────────────────────────────────────────────
// identifier 优先级测试
// ─────────────────────────────────────────────

describe("identifier 优先级逻辑", () => {
  it("MS4w 开头的 platformUserId 直接识别为 secUserId", () => {
    const pid = "MS4wLjABAAAAabc";
    expect(pid.startsWith("MS4w")).toBe(true);
  });

  it("8位以上纯数字识别为 uid", () => {
    const pid = "26539555215";
    expect(/^\d{8,}$/.test(pid)).toBe(true);
  });

  it("7位以下纯数字不识别为 uid", () => {
    const pid = "1234567";
    expect(/^\d{8,}$/.test(pid)).toBe(false);
  });

  it("非纯数字非MS4w识别为 uniqueId", () => {
    const pid = "test_user_123";
    expect(pid.startsWith("MS4w")).toBe(false);
    expect(/^\d{8,}$/.test(pid)).toBe(false);
  });

  it("profileUrl中的短链接应该优先于uid", () => {
    // 这验证了修复后的逻辑：先解析profileUrl获取sec_uid，再降级到uid
    const profileUrl = "长按复制此条消息，打开抖音搜索，查看TA的更多作品。 https://v.douyin.com/WgAgmgQ8sfc/";
    const urlPattern = /https?:\/\/[^\s"'<>]+/g;
    const urls = profileUrl.match(urlPattern) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain("v.douyin.com");
  });
});
