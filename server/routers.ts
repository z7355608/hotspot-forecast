import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { lowFollowerRouter } from "./routers/low-follower";
import { personalizationRouter } from "./routers/personalization";
import { contentCalendarRouter } from "./routers/content-calendar";
import { notificationsRouter } from "./routers/notifications";
import { copywritingRouter } from "./routers/copywriting";
import { creditsRouter } from "./routers/credits";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  lowFollower: lowFollowerRouter,
  personalization: personalizationRouter,
  contentCalendar: contentCalendarRouter,
  notifications: notificationsRouter,
  copywriting: copywritingRouter,
  credits: creditsRouter,
});

export type AppRouter = typeof appRouter;
