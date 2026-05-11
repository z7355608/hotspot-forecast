import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── 通知相关查询 ──────────────────────────────────────────────────────
import { and, desc } from "drizzle-orm";
import { notifications, InsertNotificationItem } from "../drizzle/schema";

export async function createNotification(data: InsertNotificationItem) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(notifications).values(data);
  return result;
}

export async function getUserNotifications(userOpenId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userOpenId, userOpenId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(id: number, userOpenId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(
      and(eq(notifications.id, id), eq(notifications.userOpenId, userOpenId)),
    );
}

export async function markAllNotificationsRead(userOpenId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.userOpenId, userOpenId));
}

export async function getUnreadNotificationCount(userOpenId: string) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userOpenId, userOpenId));
  return rows.filter((r) => r.isRead === 0).length;
}

/**
 * 删除单条通知。强制按 userOpenId 限定，避免越权。
 * 通知是 ephemeral 数据，没有恢复需求 —— 直接物理删除。
 */
export async function deleteNotification(id: number, userOpenId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(
      and(eq(notifications.id, id), eq(notifications.userOpenId, userOpenId)),
    );
}

/** 清空当前用户的全部通知。 */
export async function deleteAllNotifications(userOpenId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(eq(notifications.userOpenId, userOpenId));
}

// ── 用户会话（设备管理） ────────────────────────────────────────
import {
  userSessions,
  userPreferences,
  type InsertUserSessionItem,
  type UserSessionItem,
  type UserPreferenceItem,
} from "../drizzle/schema";
import { isNull } from "drizzle-orm";

/** 创建一条登录会话，返回新行 id（写入 JWT payload） */
export async function createUserSession(data: InsertUserSessionItem): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(userSessions).values(data);
  // mysql2 result has insertId
  const insertId = (result as unknown as { insertId?: number }).insertId;
  return typeof insertId === "number" ? insertId : null;
}

/** 判断指定 sessionId 当前是否有效（未被 revoke 且属于该用户） */
export async function isUserSessionActive(sessionId: number, userOpenId: string): Promise<boolean> {
  const db = await getDb();
  // DB 不可用时不阻断请求（dev / 离线工具脚本）
  if (!db) return true;
  const rows = await db
    .select({ id: userSessions.id, revokedAt: userSessions.revokedAt })
    .from(userSessions)
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.userOpenId, userOpenId)))
    .limit(1);
  if (rows.length === 0) return false;
  return rows[0].revokedAt === null;
}

/** 刷新 lastActiveAt（异步调用即可，失败不影响主流程） */
export async function touchUserSession(sessionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(userSessions.id, sessionId));
}

/** 列出当前用户的有效（未被 revoke）会话，按最近活跃倒序 */
export async function listUserSessions(userOpenId: string): Promise<UserSessionItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.userOpenId, userOpenId), isNull(userSessions.revokedAt)))
    .orderBy(desc(userSessions.lastActiveAt));
}

/** 远程下线一条会话（标记 revokedAt） */
export async function revokeUserSession(sessionId: number, userOpenId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.userOpenId, userOpenId)));
}

// ── 用户偏好（通知开关） ────────────────────────────────────────
const DEFAULT_PREFERENCES = {
  productUpdates: 1,
  taskCompleteEmail: 1,
};

/** 取偏好，不存在返回默认值 */
export async function getUserPreferences(userOpenId: string): Promise<{ productUpdates: number; taskCompleteEmail: number }> {
  const db = await getDb();
  if (!db) return { ...DEFAULT_PREFERENCES };
  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userOpenId, userOpenId))
    .limit(1);
  if (rows.length === 0) return { ...DEFAULT_PREFERENCES };
  const row = rows[0] as UserPreferenceItem;
  return {
    productUpdates: row.productUpdates,
    taskCompleteEmail: row.taskCompleteEmail,
  };
}

/** 更新偏好（不存在则插入） */
export async function setUserPreferences(
  userOpenId: string,
  patch: Partial<{ productUpdates: number; taskCompleteEmail: number }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const merged = { ...DEFAULT_PREFERENCES, ...patch };
  await db
    .insert(userPreferences)
    .values({ userOpenId, ...merged })
    .onDuplicateKeyUpdate({ set: { ...patch, updatedAt: new Date() } });
}

/** 用户改名 / 改邮箱 */
export async function updateUserProfile(
  openId: string,
  patch: { name?: string | null; email?: string | null }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateSet: Record<string, unknown> = {};
  if (patch.name !== undefined) updateSet.name = patch.name;
  if (patch.email !== undefined) updateSet.email = patch.email;
  if (Object.keys(updateSet).length === 0) return;
  await db.update(users).set(updateSet).where(eq(users.openId, openId));
}
