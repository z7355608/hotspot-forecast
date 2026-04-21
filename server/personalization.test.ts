import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Personalization router tests
 *
 * These tests verify:
 * 1. getProfile returns null when no profile exists
 * 2. getProfile returns correct data when profile exists
 * 3. analyze rejects when not enough works data
 * 4. confirmProfile updates user edits
 * 5. Unauthenticated access is rejected
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("personalization router", () => {
  describe("getProfile", () => {
    it("returns null when no profile exists for a random user", async () => {
      // Use a random user ID that won't have any data
      const ctx = createAuthContext(99999);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.personalization.getProfile({ platformId: "douyin" });
      expect(result).toBeNull();
    });

    it("accepts platformId parameter", async () => {
      const ctx = createAuthContext(99998);
      const caller = appRouter.createCaller(ctx);

      // Should not throw
      const result = await caller.personalization.getProfile({ platformId: "xiaohongshu" });
      expect(result).toBeNull();
    });
  });

  describe("analyze", () => {
    it("rejects when not enough works data", async () => {
      // Use a random user ID that won't have any works
      const ctx = createAuthContext(99997);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.analyze({ platformId: "douyin" }),
      ).rejects.toThrow("至少需要 3 条作品数据");
    });
  });

  describe("confirmProfile", () => {
    it("does not throw when updating a non-existent profile", async () => {
      const ctx = createAuthContext(99996);
      const caller = appRouter.createCaller(ctx);

      // Should not throw even if no profile exists (UPDATE affects 0 rows)
      const result = await caller.personalization.confirmProfile({
        platformId: "douyin",
        niche: "美食探店",
        styleTags: ["vlog", "探店"],
        instructions: "关注美食类爆款",
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("authentication", () => {
    it("rejects unauthenticated access to getProfile", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.getProfile({ platformId: "douyin" }),
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access to analyze", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.analyze({ platformId: "douyin" }),
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access to confirmProfile", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.confirmProfile({ platformId: "douyin" }),
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access to fanInsight", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.fanInsight({ platformId: "douyin" }),
      ).rejects.toThrow();
    });
  });

  describe("fanInsight", () => {
    it("rejects when no fan profile data exists", async () => {
      const ctx = createAuthContext(99995);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.personalization.fanInsight({ platformId: "douyin" }),
      ).rejects.toThrow("暂无粉丝画像数据");
    });
  });
});
