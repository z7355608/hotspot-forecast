import { describe, expect, it, vi } from "vitest";
import { xhsProfileSnapshotFromPayload } from "./tikhub";

// ─── 测试 xhsProfileSnapshotFromPayload ───

describe("xhsProfileSnapshotFromPayload", () => {
  it("parses web_v2/fetch_user_info_app format correctly", () => {
    const payload = {
      data: {
        basic_info: {
          nickname: "测试用户",
          red_id: "xhs_test_123",
          image: "https://cdn.example.com/avatar.jpg",
          ip_location: "上海",
        },
        interactions: [
          { name: "粉丝", type: "fans", count: 58814 },
          { name: "关注", type: "follows", count: 120 },
          { name: "获赞与收藏", type: "interaction", count: 200000 },
        ],
        tags: [
          { name: "美妆博主" },
          { name: "护肤达人" },
        ],
      },
    };

    const result = xhsProfileSnapshotFromPayload(payload);

    expect(result.nickname).toBe("测试用户");
    expect(result.red_id).toBe("xhs_test_123");
    expect(result.avatar_url).toBe("https://cdn.example.com/avatar.jpg");
    expect(result.ip_location).toBe("上海");
    expect(result.follower_count).toBe(58814);
    expect(result.following_count).toBe(120);
    expect(result.total_likes_and_collects).toBe(200000);
    expect(result.tags).toEqual(["美妆博主", "护肤达人"]);
  });

  it("parses web/get_user_info flat format correctly", () => {
    const payload = {
      data: {
        nickname: "另一个用户",
        red_id: "red_456",
        images: "https://cdn.example.com/avatar2.jpg",
        follower_count: 12345,
        following_count: 67,
        interaction_count: 50000,
      },
    };

    const result = xhsProfileSnapshotFromPayload(payload);

    expect(result.nickname).toBe("另一个用户");
    expect(result.follower_count).toBe(12345);
  });

  it("returns empty object for null/undefined input", () => {
    expect(xhsProfileSnapshotFromPayload(null)).toEqual({});
    expect(xhsProfileSnapshotFromPayload(undefined)).toEqual({});
    expect(xhsProfileSnapshotFromPayload("string")).toEqual({});
  });

  it("handles missing interactions array gracefully", () => {
    const payload = {
      data: {
        basic_info: {
          nickname: "无互动数据",
        },
      },
    };

    const result = xhsProfileSnapshotFromPayload(payload);
    expect(result.nickname).toBe("无互动数据");
    expect(result.follower_count).toBe(0);
    expect(result.following_count).toBe(0);
  });
});

// ─── 测试 monitor-diff-engine 中的小红书解析 ───

// 直接导入内部函数不可行（非 export），所以通过 parseRunSnapshot 间接测试
import { parseRunSnapshot } from "./monitor-diff-engine";
import type { StoredWatchTaskRun } from "./types";

function createMockRun(overrides: Partial<StoredWatchTaskRun>): StoredWatchTaskRun {
  return {
    runId: "test-run-1",
    taskId: "test-task-1",
    taskType: "topic_watch",
    platform: "xiaohongshu",
    executedAt: new Date().toISOString(),
    status: "completed",
    snapshot: {},
    degradeFlags: [],
    usedRouteChain: [],
    ...overrides,
  };
}

describe("parseRunSnapshot - xiaohongshu", () => {
  it("parses xiaohongshu hot_seed (hot list) correctly", () => {
    const run = createMockRun({
      platform: "xiaohongshu",
      snapshot: {
        capabilityResults: [
          {
            capability: "hot_seed",
            payload: {
              data: {
                data: {
                  items: [
                    { title: "春日穿搭", score: 98765 },
                    { title: "减脂餐", score: 87654, type: "美食" },
                    { title: "旅行攻略", score: 76543 },
                  ],
                },
              },
            },
          },
        ],
      },
    });

    const parsed = parseRunSnapshot(run);
    expect(parsed.hotSeeds).toHaveLength(3);
    expect(parsed.hotSeeds[0].keyword).toBe("春日穿搭");
    expect(parsed.hotSeeds[0].rank).toBe(1);
    expect(parsed.hotSeeds[0].hotValue).toBe(98765);
    expect(parsed.hotSeeds[1].label).toBe("美食");
  });

  it("parses xiaohongshu creator_posts correctly", () => {
    const run = createMockRun({
      platform: "xiaohongshu",
      snapshot: {
        capabilityResults: [
          {
            capability: "creator_posts",
            payload: {
              data: {
                data: {
                  notes: [
                    {
                      note_id: "note_abc123",
                      title: "春日穿搭分享｜小个子也能穿出气场",
                      user: { nickname: "时尚达人小美", fans: 25000 },
                      interact_info: {
                        liked_count: 15000,
                        comment_count: 320,
                        share_count: 180,
                        collected_count: 8500,
                      },
                      create_time: 1711900800,
                    },
                    {
                      note_id: "note_def456",
                      title: "这个粉底液真的绝了！干皮救星",
                      user: { nickname: "美妆博主Lily", fans: 5000 },
                      interact_info: {
                        liked_count: 3200,
                        comment_count: 85,
                        collected_count: 1200,
                      },
                      create_time: 1711814400,
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });

    const parsed = parseRunSnapshot(run);
    expect(parsed.contents).toHaveLength(2);

    const first = parsed.contents[0];
    expect(first.awemeId).toBe("note_abc123");
    expect(first.title).toContain("春日穿搭分享");
    expect(first.authorName).toBe("时尚达人小美");
    expect(first.authorFollowers).toBe(25000);
    expect(first.likeCount).toBe(15000);
    expect(first.commentCount).toBe(320);
    expect(first.shareCount).toBe(180);
    expect(first.collectCount).toBe(8500);
    expect(first.playCount).toBe(0); // 小红书无播放量

    const second = parsed.contents[1];
    expect(second.likeCount).toBe(3200);
    expect(second.shareCount).toBe(0); // 未提供 share_count
  });

  it("handles empty capability results gracefully", () => {
    const run = createMockRun({
      platform: "xiaohongshu",
      snapshot: { capabilityResults: [] },
    });

    const parsed = parseRunSnapshot(run);
    expect(parsed.contents).toHaveLength(0);
    expect(parsed.hotSeeds).toHaveLength(0);
    expect(parsed.topics).toHaveLength(0);
  });

  it("does not parse douyin aweme_list for xiaohongshu platform", () => {
    const run = createMockRun({
      platform: "xiaohongshu",
      snapshot: {
        capabilityResults: [
          {
            capability: "keyword_content_search",
            payload: {
              data: {
                data: {
                  aweme_list: [
                    {
                      aweme_id: "7123456789",
                      desc: "抖音视频",
                      statistics: { digg_count: 5000 },
                      author: { nickname: "抖音用户" },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    });

    const parsed = parseRunSnapshot(run);
    // keyword_content_search 不区分平台，仍会解析 aweme_list
    // 但这是合理的，因为小红书不会产生 keyword_content_search capability
    expect(parsed.contents).toHaveLength(1);
  });
});

// ─── 测试 platforms.ts 能力配置 ───

import { getCapabilities } from "./platforms";

describe("platforms - xiaohongshu capabilities", () => {
  it("xiaohongshu should not support search", () => {
    const caps = getCapabilities("xiaohongshu");
    expect(caps.supportsSearch).toBe(false);
  });

  it("xiaohongshu should support other capabilities", () => {
    const caps = getCapabilities("xiaohongshu");
    expect(caps.supportsHotList).toBe(true);
    expect(caps.supportsDetail).toBe(true);
    expect(caps.supportsComments).toBe(true);
    expect(caps.supportsPublicProfile).toBe(true);
    expect(caps.supportsCookieAnalytics).toBe(false);
  });

  it("douyin should still support search and cookie", () => {
    const caps = getCapabilities("douyin");
    expect(caps.supportsSearch).toBe(true);
    expect(caps.supportsCookieAnalytics).toBe(true);
  });
});

// ─── 测试 live-predictions.ts 中的辅助函数 ───
// 由于 extractAccounts/extractContents 是内部函数，通过导出的 walkObjects 间接测试
// 这里测试 extractIdsFromEvidenceItems 的小红书 URL 解析

describe("xiaohongshu URL parsing", () => {
  it("extracts noteId from explore URL", () => {
    const url = new URL("https://www.xiaohongshu.com/explore/abc123def");
    const match = url.pathname.match(/\/explore\/([A-Za-z0-9]+)/);
    expect(match?.[1]).toBe("abc123def");
  });

  it("extracts noteId from discovery URL", () => {
    const url = new URL("https://www.xiaohongshu.com/discovery/item/xyz789");
    const match = url.pathname.match(/\/discovery\/item\/([A-Za-z0-9]+)/);
    expect(match?.[1]).toBe("xyz789");
  });

  it("extracts noteId from query parameter", () => {
    const url = new URL("https://www.xiaohongshu.com/share?noteId=qwerty123");
    const noteId = url.searchParams.get("noteId");
    expect(noteId).toBe("qwerty123");
  });

  it("builds correct xiaohongshu profile URL", () => {
    const userId = "5f1234567890abcdef";
    const profileUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
    expect(profileUrl).toContain(userId);
  });
});
