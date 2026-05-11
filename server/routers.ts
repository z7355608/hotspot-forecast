import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { lowFollowerRouter } from "./routers/low-follower";
import { personalizationRouter } from "./routers/personalization";
import { contentCalendarRouter } from "./routers/content-calendar";
import { notificationsRouter } from "./routers/notifications";
import { copywritingRouter } from "./routers/copywriting";
import { creditsRouter } from "./routers/credits";
import { trendingRouter } from "./routers/trending";

// Dev/MVP fixed verification code — no SMS gateway required
const MVP_CODE = "888888";

/** 从 openId 反推手机号；非 phone:xxx 形态返回 null */
function phoneFromOpenId(openId: string | null | undefined): string | null {
  if (!openId) return null;
  if (!openId.startsWith("phone:")) return null;
  const phone = openId.slice("phone:".length);
  return /^1\d{10}$/.test(phone) ? phone : null;
}

/** 138****8000 格式脱敏 */
function maskPhone(phone: string): string {
  if (phone.length !== 11) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      const phone = phoneFromOpenId(user.openId);
      return {
        ...user,
        phone,
        phoneMasked: phone ? maskPhone(phone) : null,
      };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      // 把当前会话标记 revoked，清掉 cookie
      if (ctx.user && ctx.sessionId !== null) {
        try {
          await db.revokeUserSession(ctx.sessionId, ctx.user.openId);
        } catch (err) {
          console.warn("[auth.logout] revoke session failed", err);
        }
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    phoneLogin: publicProcedure
      .input(z.object({ phone: z.string().min(11), code: z.string().min(4) }))
      .mutation(async ({ input, ctx }) => {
        if (input.code !== MVP_CODE) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "验证码错误" });
        }
        if (!/^1[3-9]\d{9}$/.test(input.phone)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "手机号格式错误" });
        }
        const openId = `phone:${input.phone}`;
        await db.upsertUser({ openId, name: input.phone, loginMethod: "phone" });

        // 写一条会话记录（DB 不可用时返回 null，JWT 仍然下发）
        const userAgent = String(ctx.req.headers["user-agent"] ?? "").slice(0, 512);
        const ip = String(
          ctx.req.headers["x-forwarded-for"] ?? ctx.req.socket.remoteAddress ?? ""
        ).split(",")[0].trim().slice(0, 64);
        const sessionId = await db.createUserSession({
          userOpenId: openId,
          userAgent: userAgent || null,
          ip: ip || null,
          loginMethod: "phone",
        });

        const token = await sdk.createSessionToken(openId, {
          name: input.phone,
          sessionId: sessionId ?? undefined,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true };
      }),

    /** 修改昵称 / 邮箱 */
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(40).optional(),
          email: z.string().email().max(320).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.openId, input);
        return { success: true };
      }),

    /** 通知偏好 */
    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await db.getUserPreferences(ctx.user.openId);
      return {
        productUpdates: prefs.productUpdates === 1,
        taskCompleteEmail: prefs.taskCompleteEmail === 1,
      };
    }),

    setPreferences: protectedProcedure
      .input(
        z.object({
          productUpdates: z.boolean().optional(),
          taskCompleteEmail: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const patch: Partial<{ productUpdates: number; taskCompleteEmail: number }> = {};
        if (input.productUpdates !== undefined) patch.productUpdates = input.productUpdates ? 1 : 0;
        if (input.taskCompleteEmail !== undefined) patch.taskCompleteEmail = input.taskCompleteEmail ? 1 : 0;
        await db.setUserPreferences(ctx.user.openId, patch);
        return { success: true };
      }),

    /** 当前用户的活跃登录会话 */
    listSessions: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db.listUserSessions(ctx.user.openId);
      const currentId = ctx.sessionId;
      return {
        currentSessionId: currentId,
        sessions: rows.map((r) => ({
          id: r.id,
          userAgent: r.userAgent,
          ip: r.ip,
          loginMethod: r.loginMethod,
          lastActiveAt: r.lastActiveAt,
          createdAt: r.createdAt,
          isCurrent: r.id === currentId,
        })),
      };
    }),

    /** 远程下线某个会话（不能下线当前会话；用 logout 关闭当前会话） */
    revokeSession: protectedProcedure
      .input(z.object({ sessionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (input.sessionId === ctx.sessionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "不能下线当前会话，请使用退出登录",
          });
        }
        await db.revokeUserSession(input.sessionId, ctx.user.openId);
        return { success: true };
      }),
  }),

  lowFollower: lowFollowerRouter,
  personalization: personalizationRouter,
  contentCalendar: contentCalendarRouter,
  notifications: notificationsRouter,
  copywriting: copywritingRouter,
  credits: creditsRouter,
  trending: trendingRouter,
});

export type AppRouter = typeof appRouter;
