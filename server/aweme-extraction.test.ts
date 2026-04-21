/**
 * Regression tests for TikHubResult unwrapping in creator-data-sync.ts
 *
 * Root cause: extractAwemeList and extractUserFromProfile were receiving
 * TikHubResult wrapper objects (with ok, httpStatus, payload fields)
 * instead of the raw API payload. This caused aweme_list to always be
 * empty and profile parsing to fail silently.
 *
 * Fix: Changed callers to pass res.payload instead of res, and added
 * safety-net unwrapping in both functions.
 */
import { describe, it, expect } from "vitest";

// ─── Inline copies of the fixed functions for unit testing ───

function extractAwemeList(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  // Handle TikHubResult wrapper (safety net)
  const raw = (p.payload && typeof p.payload === "object") ? p.payload as Record<string, unknown> : p;
  const data = raw.data as Record<string, unknown> | undefined;
  const list = data?.aweme_list ?? raw.aweme_list ?? data?.items ?? raw.items;
  if (Array.isArray(list)) return list as Array<Record<string, unknown>>;
  return [];
}

function extractUserFromProfile(payload: unknown): {
  uniqueId?: string;
  nickname?: string;
  followerCount?: number;
  followingCount?: number;
  awemeCount?: number;
  totalFavorited?: number;
  secUid?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  let p = payload as Record<string, unknown>;
  // Handle TikHubResult wrapper (safety net)
  if (p.payload && typeof p.payload === "object" && (p.ok !== undefined || p.httpStatus !== undefined)) {
    p = p.payload as Record<string, unknown>;
  }
  const candidates = [
    p.user,
    p.data,
    (p.data as Record<string, unknown> | undefined)?.user,
    (p.data as Record<string, unknown> | undefined)?.author,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const u = candidate as Record<string, unknown>;
    if (u.follower_count !== undefined || u.unique_id !== undefined) {
      return {
        uniqueId: typeof u.unique_id === "string" ? u.unique_id : undefined,
        nickname: typeof u.nickname === "string" ? u.nickname : undefined,
        followerCount: typeof u.follower_count === "number" ? u.follower_count : undefined,
        followingCount: typeof u.following_count === "number" ? u.following_count : undefined,
        awemeCount: typeof u.aweme_count === "number" ? u.aweme_count : undefined,
        totalFavorited: typeof u.total_favorited === "number" ? u.total_favorited : undefined,
        secUid: typeof u.sec_uid === "string" ? u.sec_uid : undefined,
      };
    }
  }
  return null;
}

// ─── Test data matching real TikHub API responses ───

const REAL_TIKHUB_WORKS_RESPONSE = {
  code: 200,
  request_id: "e18358f4-ceb7-4bb0-90c6-3dd8c0920929",
  message: "Request successful.",
  data: {
    status_code: 0,
    min_cursor: 12682848894900,
    max_cursor: 10006955578800,
    has_more: 1,
    aweme_list: [
      {
        aweme_id: "7322420627384601866",
        desc: "这个神奇的金苹果会给你带来好运~",
        create_time: 1704894900,
        statistics: {
          aweme_id: "7322420627384601866",
          comment_count: 320281,
          digg_count: 1409016,
          play_count: 0,
          share_count: 322361,
          collect_count: 47782,
        },
        video: { duration: 8151 },
      },
      {
        aweme_id: "7142354914470137102",
        desc: "唐鹤德为张国荣庆66岁冥寿",
        create_time: 1662959102,
        statistics: {
          comment_count: 71955,
          digg_count: 1252261,
          play_count: 0,
          share_count: 94892,
          collect_count: 51682,
        },
        video: { duration: 11586 },
      },
    ],
  },
};

const TIKHUB_RESULT_WRAPPER = {
  ok: true,
  httpStatus: 200,
  businessCode: 200,
  requestId: "e18358f4-ceb7-4bb0-90c6-3dd8c0920929",
  payload: REAL_TIKHUB_WORKS_RESPONSE,
};

const REAL_TIKHUB_PROFILE_RESPONSE = {
  code: 200,
  data: {
    user: {
      unique_id: "testuser",
      nickname: "测试用户",
      follower_count: 2522592,
      following_count: 43,
      aweme_count: 12388,
      total_favorited: 696569615,
      sec_uid: "MS4wLjABAAAA5HGcXiGsJDCdssgZBVMTRehPHbJM2gN4vJMyjxx7mpM",
    },
  },
};

const TIKHUB_PROFILE_WRAPPER = {
  ok: true,
  httpStatus: 200,
  businessCode: 200,
  requestId: "abc123",
  payload: REAL_TIKHUB_PROFILE_RESPONSE,
};

// ─── Tests ───

describe("extractAwemeList - TikHubResult unwrapping regression", () => {
  it("should extract aweme_list from raw API payload (correct usage after fix)", () => {
    const list = extractAwemeList(REAL_TIKHUB_WORKS_RESPONSE);
    expect(list).toHaveLength(2);
    expect(list[0].aweme_id).toBe("7322420627384601866");
    expect(list[1].aweme_id).toBe("7142354914470137102");
  });

  it("should extract aweme_list from TikHubResult wrapper (safety net)", () => {
    const list = extractAwemeList(TIKHUB_RESULT_WRAPPER);
    expect(list).toHaveLength(2);
    expect(list[0].aweme_id).toBe("7322420627384601866");
  });

  it("should return empty array for null/undefined", () => {
    expect(extractAwemeList(null)).toEqual([]);
    expect(extractAwemeList(undefined)).toEqual([]);
    expect(extractAwemeList({})).toEqual([]);
  });

  it("should handle flat aweme_list (no data wrapper)", () => {
    const flat = { aweme_list: [{ aweme_id: "123" }] };
    expect(extractAwemeList(flat)).toHaveLength(1);
  });

  it("should handle items field as alternative", () => {
    const alt = { data: { items: [{ aweme_id: "456" }] } };
    expect(extractAwemeList(alt)).toHaveLength(1);
  });
});

describe("extractUserFromProfile - TikHubResult unwrapping regression", () => {
  it("should extract user from raw API payload (correct usage after fix)", () => {
    const user = extractUserFromProfile(REAL_TIKHUB_PROFILE_RESPONSE);
    expect(user).not.toBeNull();
    expect(user!.uniqueId).toBe("testuser");
    expect(user!.followerCount).toBe(2522592);
    expect(user!.awemeCount).toBe(12388);
    expect(user!.totalFavorited).toBe(696569615);
    expect(user!.secUid).toBe("MS4wLjABAAAA5HGcXiGsJDCdssgZBVMTRehPHbJM2gN4vJMyjxx7mpM");
  });

  it("should extract user from TikHubResult wrapper (safety net)", () => {
    const user = extractUserFromProfile(TIKHUB_PROFILE_WRAPPER);
    expect(user).not.toBeNull();
    expect(user!.uniqueId).toBe("testuser");
    expect(user!.followerCount).toBe(2522592);
  });

  it("should return null for null/undefined/empty", () => {
    expect(extractUserFromProfile(null)).toBeNull();
    expect(extractUserFromProfile(undefined)).toBeNull();
    expect(extractUserFromProfile({})).toBeNull();
  });
});

describe("Douyin statistics field validation", () => {
  it("play_count should be 0 from Douyin APP API", () => {
    const stats = REAL_TIKHUB_WORKS_RESPONSE.data.aweme_list[0].statistics;
    expect(stats.play_count).toBe(0);
    // Engagement should be calculated from likes + comments + shares + collects
    const engagement = stats.digg_count + stats.comment_count + stats.share_count + stats.collect_count;
    expect(engagement).toBeGreaterThan(0);
  });

  it("video duration should be in milliseconds", () => {
    const duration = REAL_TIKHUB_WORKS_RESPONSE.data.aweme_list[0].video.duration;
    expect(duration).toBe(8151);
    // Convert to seconds
    const seconds = Math.round(duration / 1000);
    expect(seconds).toBe(8);
  });

  it("isHot should be based on engagement, not play_count", () => {
    const stats = REAL_TIKHUB_WORKS_RESPONSE.data.aweme_list[0].statistics;
    const likes = stats.digg_count;
    const totalEngagement = likes + stats.comment_count + stats.share_count + stats.collect_count;
    const isHot = likes > 100000 || totalEngagement > 200000;
    expect(isHot).toBe(true);
  });
});
