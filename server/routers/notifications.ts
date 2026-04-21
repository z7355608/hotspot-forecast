import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from "../db";

export const notificationsRouter = router({
  /** 获取当前用户的通知列表 */
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const items = await getUserNotifications(ctx.user.openId, limit);
      const unreadCount = items.filter((n) => n.isRead === 0).length;
      return { items, unreadCount };
    }),

  /** 获取未读通知数量 */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await getUnreadNotificationCount(ctx.user.openId);
    return { count };
  }),

  /** 标记单条通知为已读 */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(input.id, ctx.user.openId);
      return { success: true };
    }),

  /** 标记所有通知为已读 */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.openId);
    return { success: true };
  }),
});
