/**
 * Admin API Module (MySQL-backed)
 * ─────────────────────────────────────────────
 * Provides admin-only endpoints with whitelist authentication,
 * token-based session management, and operation audit logging.
 * All data is stored in MySQL (hotspot_forecast database).
 *
 * All endpoints are prefixed with /api/admin/*
 */

import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { setCorsHeaders } from "./cors.js";
import type { RowDataPacket } from "mysql2/promise";
import { query, queryOne, execute, checkConnection } from "./database.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("AdminApi");

/* ── Types ── */

interface AdminSession {
  token: string;
  phone: string;
  nickname: string;
  createdAt: string;
  expiresAt: string;
}

interface AdminWhitelistRow extends RowDataPacket {
  id: number;
  phone: string;
  nickname: string;
  is_active: number;
}

interface UserProfileRow extends RowDataPacket {
  id: string;
  phone: string;
  nickname: string;
  membership_plan: string;
  credits: number;
  total_spent: number;
  total_earned: number;
  total_predictions: number;
  is_admin: number;
  status: string;
  created_at: Date;
  last_active_at: Date | null;
}

interface AuditLogRow extends RowDataPacket {
  id: string;
  admin_phone: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  created_at: Date;
}

interface ConfigRow extends RowDataPacket {
  config_key: string;
  config_value: string;
  description: string;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

/* ── In-Memory Session Store ── */

const sessions = new Map<string, AdminSession>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MVP_CODE = "888888";

/* ── Data directory for legacy artifact stats ── */
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");

/* ── Request Helpers ── */

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/** 当前请求对象引用，用于 CORS origin 反射 */
let _adminCurrentRequest: IncomingMessage | null = null;

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (_adminCurrentRequest) {
    setCorsHeaders(_adminCurrentRequest, response, "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Content-Type, Authorization");
  }
  response.end(JSON.stringify(payload));
}

function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return request.socket.remoteAddress || "unknown";
}

/* ── Audit Log (MySQL) ── */

async function appendAuditLog(entry: {
  adminPhone: string;
  action: string;
  target: string;
  detail: string;
  ip?: string;
}) {
  const id = randomUUID();
  await execute(
    `INSERT INTO audit_logs (id, admin_phone, action, target, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, entry.adminPhone, entry.action, entry.target, entry.detail, entry.ip || null],
  );
}

/* ── Auth Middleware ── */

function extractToken(request: IncomingMessage): string | null {
  const auth = request.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

function resolveSession(request: IncomingMessage): AdminSession | null {
  const token = extractToken(request);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAdmin(
  request: IncomingMessage,
  response: ServerResponse,
): AdminSession | null {
  const session = resolveSession(request);
  if (!session) {
    sendJson(response, 401, { error: "未授权，请先登录管理后台" });
    return null;
  }
  return session;
}

/* ── Route Handlers ── */

async function handleLogin(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody<{ phone?: string; code?: string }>(request);
  const { phone, code } = body;

  if (!phone || !code) {
    sendJson(response, 400, { error: "请提供手机号和验证码" });
    return;
  }

  if (code !== MVP_CODE) {
    sendJson(response, 401, { error: "验证码错误" });
    return;
  }

  /* Check whitelist in MySQL */
  const admin = await queryOne<AdminWhitelistRow>(
    "SELECT * FROM admin_whitelist WHERE phone = ? AND is_active = 1",
    [phone],
  );
  if (!admin) {
    sendJson(response, 403, { error: "该手机号不在管理员白名单中" });
    return;
  }

  const token = randomUUID();
  const now = new Date();
  const session: AdminSession = {
    token,
    phone: admin.phone,
    nickname: admin.nickname,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  sessions.set(token, session);

  await appendAuditLog({
    adminPhone: phone,
    action: "login",
    target: "admin",
    detail: "管理员登录",
    ip: getClientIp(request),
  });

  sendJson(response, 200, {
    token,
    phone: admin.phone,
    nickname: admin.nickname,
    isAdmin: true,
  });
}

async function handleMe(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;
  sendJson(response, 200, {
    phone: session.phone,
    nickname: session.nickname,
    isAdmin: true,
  });
}

async function handleLogout(request: IncomingMessage, response: ServerResponse) {
  const session = resolveSession(request);
  if (session) {
    sessions.delete(session.token);
    await appendAuditLog({
      adminPhone: session.phone,
      action: "logout",
      target: "admin",
      detail: "管理员退出",
      ip: getClientIp(request),
    });
  }
  sendJson(response, 200, { ok: true });
}

async function handleDashboard(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const url = new URL(request.url!, `http://${request.headers.host || "127.0.0.1"}`);
  const range = url.searchParams.get("range") || "30"; // 7, 30, 90
  const days = Math.min(90, Math.max(7, Number(range)));

  /* ── Section 1: Core KPI Cards ── */
  const totalUsersRow = await queryOne<CountRow>(
    "SELECT COUNT(*) AS cnt FROM user_profiles",
  );
  /* Use today's total_users from daily_stats for growth comparison (consistent source) */
  const todayTotalUsersRow = await queryOne<CountRow>(
    "SELECT total_users AS cnt FROM daily_stats WHERE stat_date = CURDATE()",
  );
  const yesterdayUsersRow = await queryOne<CountRow>(
    "SELECT total_users AS cnt FROM daily_stats WHERE stat_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
  );
  const todayStats = await queryOne<RowDataPacket & { dau: number; new_users: number; revenue: number; credits_consumed: number; credits_topup: number; paid_users: number }>(
    "SELECT dau, new_users, revenue, credits_consumed, credits_topup, paid_users FROM daily_stats WHERE stat_date = CURDATE()",
  );
  const totalCreditsRow = await queryOne<CountRow>(
    "SELECT COALESCE(SUM(credits), 0) AS cnt FROM user_profiles",
  );
  const totalRevenueRow = await queryOne<RowDataPacket & { total: number }>(
    "SELECT COALESCE(SUM(revenue), 0) AS total FROM daily_stats",
  );

  /* ── Section 2: User Activity Trend (DAU/WAU/MAU) ── */
  const activityTrend = await query<(RowDataPacket & { stat_date: string; dau: number; new_users: number; revenue: number })[]>(
    `SELECT stat_date, dau, new_users, revenue FROM daily_stats 
     WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) 
     ORDER BY stat_date ASC`,
    [days],
  );

  /* Calculate WAU (7-day rolling) and MAU (30-day rolling) for each day */
  const wauData = await query<(RowDataPacket & { stat_date: string; wau: number })[]>(
    `SELECT d.stat_date, 
       (SELECT COUNT(DISTINCT ual.user_id) 
        FROM user_activity_logs ual 
        WHERE ual.activity_date BETWEEN DATE_SUB(d.stat_date, INTERVAL 6 DAY) AND d.stat_date
       ) AS wau
     FROM daily_stats d
     WHERE d.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY d.stat_date ASC`,
    [days],
  );

  const mauData = await query<(RowDataPacket & { stat_date: string; mau: number })[]>(
    `SELECT d.stat_date,
       (SELECT COUNT(DISTINCT ual.user_id)
        FROM user_activity_logs ual
        WHERE ual.activity_date BETWEEN DATE_SUB(d.stat_date, INTERVAL 29 DAY) AND d.stat_date
       ) AS mau
     FROM daily_stats d
     WHERE d.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY d.stat_date ASC`,
    [days],
  );

  /* ── Section 3: User Retention ── */
  /* D1 retention: users active yesterday who are also active today */
  const d1Retention = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT a2.user_id) 
          FROM user_activity_logs a1 
          JOIN user_activity_logs a2 ON a1.user_id = a2.user_id 
          WHERE a1.activity_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) 
            AND a2.activity_date = CURDATE()
         ) * 100.0 / 
         NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE activity_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* D7 retention: users active 7 days ago who are active in last 7 days */
  const d7Retention = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT a2.user_id)
          FROM user_activity_logs a1
          JOIN user_activity_logs a2 ON a1.user_id = a2.user_id
          WHERE a1.activity_date = DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND a2.activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
         ) * 100.0 /
         NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE activity_date = DATE_SUB(CURDATE(), INTERVAL 7 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* D30 retention */
  const d30Retention = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT a2.user_id)
          FROM user_activity_logs a1
          JOIN user_activity_logs a2 ON a1.user_id = a2.user_id
          WHERE a1.activity_date = DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            AND a2.activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND CURDATE()
         ) * 100.0 /
         NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE activity_date = DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* New user weekly retention (users registered last week who came back this week) */
  const newUserWeekRetention = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT ual.user_id)
          FROM user_profiles up
          JOIN user_activity_logs ual ON up.id = ual.user_id
          WHERE up.created_at BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND ual.activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()
         ) * 100.0 /
         NULLIF((SELECT COUNT(*) FROM user_profiles WHERE created_at BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND DATE_SUB(CURDATE(), INTERVAL 7 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* New user monthly retention */
  const newUserMonthRetention = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT ual.user_id)
          FROM user_profiles up
          JOIN user_activity_logs ual ON up.id = ual.user_id
          WHERE up.created_at BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            AND ual.activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND CURDATE()
         ) * 100.0 /
         NULLIF((SELECT COUNT(*) FROM user_profiles WHERE created_at BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* Retention trend (daily D1 retention for last N days) */
  const retentionTrend = await query<(RowDataPacket & { stat_date: string; d1_rate: number })[]>(
    `SELECT d.stat_date,
       ROUND(IFNULL(
         (SELECT COUNT(DISTINCT a2.user_id)
          FROM user_activity_logs a1
          JOIN user_activity_logs a2 ON a1.user_id = a2.user_id
          WHERE a1.activity_date = DATE_SUB(d.stat_date, INTERVAL 1 DAY)
            AND a2.activity_date = d.stat_date
         ) * 100.0 /
         NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE activity_date = DATE_SUB(d.stat_date, INTERVAL 1 DAY)), 0)
       , 0), 1) AS d1_rate
     FROM daily_stats d
     WHERE d.stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY d.stat_date ASC`,
    [days],
  );

  /* ── Section 4: Revenue Statistics ── */
  const todayRevenue = todayStats?.revenue || 0;
  const weekRevenueRow = await queryOne<RowDataPacket & { total: number }>(
    `SELECT COALESCE(SUM(revenue), 0) AS total FROM daily_stats 
     WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`,
  );
  const monthRevenueRow = await queryOne<RowDataPacket & { total: number }>(
    `SELECT COALESCE(SUM(revenue), 0) AS total FROM daily_stats 
     WHERE stat_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
  );

  /* Revenue trend */
  const revenueTrend = activityTrend.map((r) => ({
    date: r.stat_date,
    revenue: Number(r.revenue),
  }));

  /* Revenue breakdown by type */
  const revenueByType = await query<(RowDataPacket & { type: string; total: number; cnt: number })[]>(
    `SELECT type, SUM(amount) AS total, COUNT(*) AS cnt FROM revenue_records 
     WHERE revenue_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) 
     GROUP BY type`,
    [days],
  );

  /* ARPU (Average Revenue Per User) */
  const arpuRow = await queryOne<RowDataPacket & { arpu: number }>(
    `SELECT ROUND(COALESCE(SUM(revenue) / NULLIF(SUM(dau), 0), 0), 2) AS arpu 
     FROM daily_stats WHERE stat_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [days],
  );

  /* ── Section 5: User Composition ── */
  const membershipDist = await query<(RowDataPacket & { plan: string; cnt: number })[]>(
    "SELECT membership_plan AS plan, COUNT(*) AS cnt FROM user_profiles GROUP BY membership_plan",
  );

  /* New user trend */
  const newUserTrend = activityTrend.map((r) => ({
    date: r.stat_date,
    count: r.new_users,
  }));

  /* Paid conversion rate */
  const paidUsersRow = await queryOne<CountRow>(
    "SELECT COUNT(*) AS cnt FROM user_profiles WHERE membership_plan != 'free'",
  );
  const paidConversionRate = totalUsersRow?.cnt
    ? Number(((paidUsersRow?.cnt || 0) / totalUsersRow.cnt * 100).toFixed(1))
    : 0;

  /* Churn rate (users active 30 days ago but not in last 30 days) */
  const churnRow = await queryOne<RowDataPacket & { rate: number }>(
    `SELECT ROUND(
       IFNULL(
         (SELECT COUNT(DISTINCT a1.user_id)
          FROM user_activity_logs a1
          WHERE a1.activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            AND a1.user_id NOT IN (
              SELECT DISTINCT user_id FROM user_activity_logs 
              WHERE activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND CURDATE()
            )
         ) * 100.0 /
         NULLIF((SELECT COUNT(DISTINCT user_id) FROM user_activity_logs 
                 WHERE activity_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0)
       , 0)
     , 1) AS rate`,
  );

  /* ── Section 6: System Status ── */
  const dbOk = await checkConnection();
  const uptimeSec = process.uptime();
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  /* Recent admin logins */
  const recentLogins = await query<(RowDataPacket & { admin_phone: string; created_at: Date })[]>(
    "SELECT admin_phone, created_at FROM audit_logs WHERE action = 'login' ORDER BY created_at DESC LIMIT 10",
  );

  /* Legacy artifact stats */
  let totalArtifacts = 0;
  let dataFileCount = 0;
  try {
    const files = await readdir(DATA_DIR);
    dataFileCount = files.length;
    const artifactRaw = await readFile(path.join(DATA_DIR, "result-artifacts.json"), "utf8").catch(() => "{}");
    const artifacts = JSON.parse(artifactRaw);
    totalArtifacts = Object.keys(artifacts).length;
  } catch {
    // silent
  }

  sendJson(response, 200, {
    /* Core KPIs */
    coreKPIs: {
      totalUsers: todayTotalUsersRow?.cnt || totalUsersRow?.cnt || 0,
      totalUsersYesterday: yesterdayUsersRow?.cnt || 0,
      dau: todayStats?.dau || 0,
      newToday: todayStats?.new_users || 0,
      totalCredits: totalCreditsRow?.cnt || 0,
      todayRevenue: Number(todayRevenue),
      totalRevenue: Number(totalRevenueRow?.total || 0),
      paidUsers: paidUsersRow?.cnt || 0,
      totalArtifacts,
    },

    /* Activity Trend (DAU/WAU/MAU) */
    activityTrend: activityTrend.map((r, idx) => ({
      date: r.stat_date,
      dau: r.dau,
      wau: wauData[idx]?.wau || 0,
      mau: mauData[idx]?.mau || 0,
    })),

    /* Retention */
    retention: {
      d1: d1Retention?.rate || 0,
      d7: d7Retention?.rate || 0,
      d30: d30Retention?.rate || 0,
      newUserWeek: newUserWeekRetention?.rate || 0,
      newUserMonth: newUserMonthRetention?.rate || 0,
      trend: retentionTrend.map((r) => ({
        date: r.stat_date,
        d1Rate: r.d1_rate,
      })),
    },

    /* Revenue */
    revenue: {
      today: Number(todayRevenue),
      thisWeek: Number(weekRevenueRow?.total || 0),
      thisMonth: Number(monthRevenueRow?.total || 0),
      total: Number(totalRevenueRow?.total || 0),
      arpu: Number(arpuRow?.arpu || 0),
      trend: revenueTrend,
      byType: revenueByType.map((r) => ({
        type: r.type,
        total: Number(r.total),
        count: r.cnt,
      })),
    },

    /* User Composition */
    userComposition: {
      membershipDistribution: membershipDist.reduce(
        (acc, r) => ({ ...acc, [r.plan]: r.cnt }),
        {} as Record<string, number>,
      ),
      newUserTrend,
      paidConversionRate,
      churnRate: churnRow?.rate || 0,
    },

    /* System Status */
    systemStatus: {
      uptime: `${hours}h ${minutes}m`,
      apiHealth: true,
      dbHealth: dbOk,
      dataFiles: dataFileCount,
      version: "v2.1.0",
    },

    /* Recent admin logins */
    recentLogins: recentLogins.map((r) => ({
      phone: r.admin_phone,
      time: new Date(r.created_at).toLocaleString("zh-CN"),
    })),
  });
}

async function handleGetUsers(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const url = new URL(request.url!, `http://${request.headers.host || "127.0.0.1"}`);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "20")));
  const search = url.searchParams.get("search") || "";
  const planFilter = url.searchParams.get("plan") || "";
  const statusFilter = url.searchParams.get("status") || "";

  let whereClauses = ["1=1"];
  const params: unknown[] = [];

  if (search) {
    whereClauses.push("(phone LIKE ? OR nickname LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (planFilter) {
    whereClauses.push("membership_plan = ?");
    params.push(planFilter);
  }
  if (statusFilter) {
    whereClauses.push("status = ?");
    params.push(statusFilter);
  }

  const whereStr = whereClauses.join(" AND ");

  const countRow = await queryOne<CountRow>(
    `SELECT COUNT(*) AS cnt FROM user_profiles WHERE ${whereStr}`,
    params,
  );
  const total = countRow?.cnt || 0;

  const offset = (page - 1) * pageSize;
  const users = await query<UserProfileRow[]>(
    `SELECT * FROM user_profiles WHERE ${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const mapped = users.map((u) => ({
    id: u.id,
    phone: u.phone,
    nickname: u.nickname,
    membershipPlan: u.membership_plan,
    credits: u.credits,
    totalSpent: u.total_spent,
    totalEarned: u.total_earned,
    totalPredictions: u.total_predictions,
    isAdmin: u.is_admin === 1,
    status: u.status,
    createdAt: u.created_at?.toISOString() || null,
    lastActiveAt: u.last_active_at?.toISOString() || null,
  }));

  sendJson(response, 200, { users: mapped, total, page, pageSize });
}

async function handleGetUser(request: IncomingMessage, response: ServerResponse, userId: string) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const user = await queryOne<UserProfileRow>(
    "SELECT * FROM user_profiles WHERE id = ? OR phone = ?",
    [userId, userId],
  );
  if (!user) {
    sendJson(response, 404, { error: "用户不存在" });
    return;
  }

  sendJson(response, 200, {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    membershipPlan: user.membership_plan,
    credits: user.credits,
    totalSpent: user.total_spent,
    totalEarned: user.total_earned,
    totalPredictions: user.total_predictions,
    isAdmin: user.is_admin === 1,
    status: user.status,
    createdAt: user.created_at?.toISOString() || null,
    lastActiveAt: user.last_active_at?.toISOString() || null,
  });
}

async function handleUpdateUser(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const body = await readJsonBody<{
    credits?: number;
    membershipPlan?: string;
    nickname?: string;
    status?: string;
  }>(request);

  /* Fetch current user */
  const user = await queryOne<UserProfileRow>(
    "SELECT * FROM user_profiles WHERE id = ? OR phone = ?",
    [userId, userId],
  );
  if (!user) {
    sendJson(response, 404, { error: "用户不存在" });
    return;
  }

  const updates: string[] = [];
  const updateParams: unknown[] = [];
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  if (body.membershipPlan !== undefined && body.membershipPlan !== user.membership_plan) {
    updates.push("membership_plan = ?");
    updateParams.push(body.membershipPlan);
    changes.membershipPlan = { old: user.membership_plan, new: body.membershipPlan };
  }

  if (body.credits !== undefined && body.credits !== user.credits) {
    const creditDiff = body.credits - user.credits;
    updates.push("credits = ?");
    updateParams.push(body.credits);
    changes.credits = { old: user.credits, new: body.credits };

    /* Record credit transaction */
    const txId = randomUUID();
    await execute(
      `INSERT INTO credit_transactions (id, user_id, type, amount, balance_after, reason, operator)
       VALUES (?, ?, 'admin_adjust', ?, ?, ?, ?)`,
      [txId, user.id, creditDiff, body.credits, `管理员调整积分`, session.phone],
    );

    /* Update total_earned or total_spent */
    if (creditDiff > 0) {
      updates.push("total_earned = total_earned + ?");
      updateParams.push(creditDiff);
    } else {
      updates.push("total_spent = total_spent + ?");
      updateParams.push(Math.abs(creditDiff));
    }
  }

  if (body.nickname !== undefined && body.nickname !== user.nickname) {
    updates.push("nickname = ?");
    updateParams.push(body.nickname);
    changes.nickname = { old: user.nickname, new: body.nickname };
  }

  if (body.status !== undefined && body.status !== user.status) {
    updates.push("status = ?");
    updateParams.push(body.status);
    changes.status = { old: user.status, new: body.status };
  }

  if (updates.length === 0) {
    sendJson(response, 200, { ok: true, message: "无变更" });
    return;
  }

  await execute(
    `UPDATE user_profiles SET ${updates.join(", ")} WHERE id = ?`,
    [...updateParams, user.id],
  );

  await appendAuditLog({
    adminPhone: session.phone,
    action: "user_update",
    target: user.phone,
    detail: JSON.stringify(changes),
    ip: getClientIp(request),
  });

  sendJson(response, 200, { ok: true, userId: user.id, changes });
}

/* ── Credit Top-up (dedicated endpoint) ── */

async function handleCreditTopup(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const body = await readJsonBody<{ amount?: number; reason?: string }>(request);
  const amount = body.amount;
  const reason = body.reason || "管理员充值";

  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    sendJson(response, 400, { error: "请提供有效的充值积分数量（正整数）" });
    return;
  }

  const user = await queryOne<UserProfileRow>(
    "SELECT * FROM user_profiles WHERE id = ? OR phone = ?",
    [userId, userId],
  );
  if (!user) {
    sendJson(response, 404, { error: "用户不存在" });
    return;
  }

  const newBalance = user.credits + amount;

  await execute(
    "UPDATE user_profiles SET credits = ?, total_earned = total_earned + ? WHERE id = ?",
    [newBalance, amount, user.id],
  );

  const txId = randomUUID();
  await execute(
    `INSERT INTO credit_transactions (id, user_id, type, amount, balance_after, reason, operator)
     VALUES (?, ?, 'topup', ?, ?, ?, ?)`,
    [txId, user.id, amount, newBalance, reason, session.phone],
  );

  await appendAuditLog({
    adminPhone: session.phone,
    action: "credit_topup",
    target: user.phone,
    detail: JSON.stringify({ amount, oldBalance: user.credits, newBalance, reason }),
    ip: getClientIp(request),
  });

  sendJson(response, 200, {
    ok: true,
    userId: user.id,
    phone: user.phone,
    oldBalance: user.credits,
    newBalance,
    amount,
  });
}

/* ── Credit Transactions History ── */

async function handleGetCreditTransactions(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const url = new URL(request.url!, `http://${request.headers.host || "127.0.0.1"}`);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "20")));

  const user = await queryOne<UserProfileRow>(
    "SELECT * FROM user_profiles WHERE id = ? OR phone = ?",
    [userId, userId],
  );
  if (!user) {
    sendJson(response, 404, { error: "用户不存在" });
    return;
  }

  const countRow = await queryOne<CountRow>(
    "SELECT COUNT(*) AS cnt FROM credit_transactions WHERE user_id = ?",
    [user.id],
  );
  const total = countRow?.cnt || 0;
  const offset = (page - 1) * pageSize;

  const txRows = await query<(RowDataPacket & {
    id: string; type: string; amount: number; balance_after: number;
    reason: string; operator: string; created_at: Date;
  })[]>(
    "SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [user.id, pageSize, offset],
  );

  const transactions = txRows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balance_after,
    reason: t.reason,
    operator: t.operator,
    createdAt: t.created_at?.toISOString() || null,
  }));

  sendJson(response, 200, { transactions, total, page, pageSize });
}

/* ── Config ── */

async function handleGetConfig(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;

  /* Read all config from MySQL */
  const rows = await query<ConfigRow[]>("SELECT * FROM system_config");
  const configMap: Record<string, string> = {};
  for (const r of rows) {
    configMap[r.config_key] = r.config_value;
  }

  /* Read admin whitelist */
  const admins = await query<AdminWhitelistRow[]>(
    "SELECT * FROM admin_whitelist ORDER BY id",
  );

  sendJson(response, 200, {
    adminWhitelist: admins.map((a) => ({ phone: a.phone, nickname: a.nickname, isActive: a.is_active === 1 })),
    defaultCredits: Number(configMap.default_credits || "120"),
    maxFreeCredits: Number(configMap.max_free_credits || "500"),
    maintenanceMode: configMap.maintenance_mode === "true",
    tikhubEnabled: configMap.tikhub_enabled !== "false",
    dailyFreeLimit: Number(configMap.daily_free_limit || "3"),
    monthlyPrice: Number(configMap.monthly_price || "29.9"),
    yearlyPrice: Number(configMap.yearly_price || "199.9"),
  });
}

async function handleSaveConfig(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const body = await readJsonBody<{
    adminWhitelist?: { phone: string; nickname: string }[];
    defaultCredits?: number;
    maxFreeCredits?: number;
    maintenanceMode?: boolean;
    tikhubEnabled?: boolean;
    dailyFreeLimit?: number;
    monthlyPrice?: number;
    yearlyPrice?: number;
  }>(request);

  /* Update config key-value pairs */
  const configUpdates: [string, string][] = [];
  if (body.defaultCredits !== undefined) configUpdates.push(["default_credits", String(body.defaultCredits)]);
  if (body.maxFreeCredits !== undefined) configUpdates.push(["max_free_credits", String(body.maxFreeCredits)]);
  if (body.maintenanceMode !== undefined) configUpdates.push(["maintenance_mode", String(body.maintenanceMode)]);
  if (body.tikhubEnabled !== undefined) configUpdates.push(["tikhub_enabled", String(body.tikhubEnabled)]);
  if (body.dailyFreeLimit !== undefined) configUpdates.push(["daily_free_limit", String(body.dailyFreeLimit)]);
  if (body.monthlyPrice !== undefined) configUpdates.push(["monthly_price", String(body.monthlyPrice)]);
  if (body.yearlyPrice !== undefined) configUpdates.push(["yearly_price", String(body.yearlyPrice)]);

  for (const [key, value] of configUpdates) {
    await execute(
      `INSERT INTO system_config (config_key, config_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
      [key, value, session.phone],
    );
  }

  /* Sync admin whitelist */
  if (body.adminWhitelist) {
    /* Deactivate all, then upsert */
    await execute("UPDATE admin_whitelist SET is_active = 0");
    for (const admin of body.adminWhitelist) {
      await execute(
        `INSERT INTO admin_whitelist (phone, nickname, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), is_active = 1`,
        [admin.phone, admin.nickname],
      );
    }
    /* Also sync is_admin flag in user_profiles */
    await execute("UPDATE user_profiles SET is_admin = 0");
    for (const admin of body.adminWhitelist) {
      await execute(
        "UPDATE user_profiles SET is_admin = 1 WHERE phone = ?",
        [admin.phone],
      );
    }
  }

  await appendAuditLog({
    adminPhone: session.phone,
    action: "config_update",
    target: "system",
    detail: JSON.stringify(body),
    ip: getClientIp(request),
  });

  sendJson(response, 200, { ok: true });
}

/* ── Audit Logs ── */

async function handleGetLogs(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;

  const url = new URL(request.url!, `http://${request.headers.host || "127.0.0.1"}`);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "30")));
  const actionFilter = url.searchParams.get("action") || "";

  let whereClause = "1=1";
  const params: unknown[] = [];
  if (actionFilter) {
    whereClause += " AND action = ?";
    params.push(actionFilter);
  }

  const countRow = await queryOne<CountRow>(
    `SELECT COUNT(*) AS cnt FROM audit_logs WHERE ${whereClause}`,
    params,
  );
  const total = countRow?.cnt || 0;
  const offset = (page - 1) * pageSize;

  const rows = await query<AuditLogRow[]>(
    `SELECT * FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const logs = rows.map((r) => ({
    id: r.id,
    timestamp: r.created_at?.toISOString() || "",
    adminPhone: r.admin_phone,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
  }));

  sendJson(response, 200, { logs, total, page, pageSize });
}

/* ── Skills Handlers ── */

async function handleGetSkills(_req: IncomingMessage, res: ServerResponse) {
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, label, desc_text, icon, category, intent, entry_source, result_card_type, param_extract_rules, cost, sort_order, is_active, is_premium, created_at, updated_at FROM skill_registry ORDER BY sort_order ASC`
  );
  sendJson(res, 200, { skills: rows });
}

async function handleCreateSkill(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const { id, label, desc_text, icon, category, intent, prompt_template_id, entry_source, result_card_type, param_extract_rules, cost, sort_order, is_active, is_premium } = body as {
    id: string; label: string; desc_text: string; icon: string;
    category: string; intent: string; prompt_template_id: string; entry_source: string; result_card_type: string;
    param_extract_rules: string; cost: number; sort_order: number; is_active: boolean; is_premium: boolean;
  };
  const skillId = id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const templateId = prompt_template_id || `${skillId}-v1`;
  await execute(
    `INSERT INTO skill_registry (id, label, desc_text, icon, category, prompt_template_id, intent, entry_source, result_card_type, param_extract_rules, cost, sort_order, is_active, is_premium) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [skillId, label, desc_text ?? '', icon ?? 'Sparkles', category ?? 'analysis', templateId, intent ?? '', entry_source ?? 'workbench', result_card_type ?? 'default', param_extract_rules ?? null, cost ?? 1, sort_order ?? 100, is_active ? 1 : 0, is_premium ? 1 : 0]
  );
  sendJson(res, 201, { id: skillId });
}

async function handleUpdateSkill(req: IncomingMessage, res: ServerResponse, id: string) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const fields: string[] = [];
  const values: unknown[] = [];
  const allowed = ['label','desc_text','icon','category','intent','entry_source','result_card_type','param_extract_rules','cost','sort_order','is_active','is_premium'];
  for (const k of allowed) {
    if (k in body) { fields.push(`${k}=?`); values.push(body[k]); }
  }
  if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
  values.push(id);
  await execute(`UPDATE skill_registry SET ${fields.join(',')} WHERE id=?`, values);
  sendJson(res, 200, { ok: true });
}

async function handleDeleteSkill(_req: IncomingMessage, res: ServerResponse, id: string) {
  await execute(`DELETE FROM skill_registry WHERE id=?`, [id]);
  sendJson(res, 200, { ok: true });
}

/* ── Secrets Handlers ── */

async function handleGetSecrets(_req: IncomingMessage, res: ServerResponse) {
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, key_name, key_value, description, category, platform, is_active, last_verified_at, verify_status, created_at, updated_at FROM admin_secrets ORDER BY platform, category`
  );
  sendJson(res, 200, { secrets: rows });
}

async function handleCreateSecret(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const id = randomUUID();
  const { key_name, key_value, description, category, platform, is_active } = body as {
    key_name: string; key_value: string; description: string;
    category: string; platform: string; is_active: boolean;
  };
  await execute(
    `INSERT INTO admin_secrets (id, key_name, key_value, description, category, platform, is_active) VALUES (?,?,?,?,?,?,?)`,
    [id, key_name, key_value, description ?? '', category ?? 'other', platform ?? 'global', is_active ? 1 : 0]
  );
  sendJson(res, 201, { id });
}

async function handleUpdateSecret(req: IncomingMessage, res: ServerResponse, id: string) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const fields: string[] = [];
  const values: unknown[] = [];
  const allowed = ['key_name','key_value','description','category','platform','is_active'];
  for (const k of allowed) {
    if (k in body) { fields.push(`${k}=?`); values.push(body[k]); }
  }
  if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
  values.push(id);
  await execute(`UPDATE admin_secrets SET ${fields.join(',')} WHERE id=?`, values);
  sendJson(res, 200, { ok: true });
}

async function handleDeleteSecret(_req: IncomingMessage, res: ServerResponse, id: string) {
  await execute(`DELETE FROM admin_secrets WHERE id=?`, [id]);
  sendJson(res, 200, { ok: true });
}

async function handleVerifySecret(_req: IncomingMessage, res: ServerResponse, id: string) {
  // Basic verify: check if the secret exists and is non-empty
  const row = await queryOne<RowDataPacket>(`SELECT * FROM admin_secrets WHERE id=?`, [id]);
  if (!row) { sendJson(res, 404, { error: 'Not found' }); return; }
  // For now mark as ok if value is non-empty
  const ok = typeof row.key_value === 'string' && row.key_value.length > 0;
  const status = ok ? 'ok' : 'failed';
  await execute(`UPDATE admin_secrets SET verify_status=?, last_verified_at=NOW() WHERE id=?`, [status, id]);
  sendJson(res, 200, { ok, status });
}

/* ── Projects Handlers ── */

async function handleGetProjects(_req: IncomingMessage, res: ServerResponse) {
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, name, description, owner_id, owner_name, status, niche, platforms, target_audience, goal, member_count, analysis_count, created_at, updated_at FROM admin_projects ORDER BY created_at DESC`
  );
  const projects = rows.map((r) => ({
    ...r,
    platforms: typeof r.platforms === 'string' ? JSON.parse(r.platforms) : (r.platforms ?? []),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  }));
  sendJson(res, 200, { projects });
}

async function handleCreateProject(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const id = randomUUID();
  const { name, description, status, niche, platforms, target_audience, goal } = body as {
    name: string; description: string; status: string;
    niche: string; platforms: string[]; target_audience: string; goal: string;
  };
  await execute(
    `INSERT INTO admin_projects (id, name, description, status, niche, platforms, target_audience, goal) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, description ?? '', status ?? 'active', niche ?? '', JSON.stringify(platforms ?? []), target_audience ?? '', goal ?? '']
  );
  sendJson(res, 201, { id });
}

async function handleUpdateProject(req: IncomingMessage, res: ServerResponse, id: string) {
  const body = await readJsonBody<Record<string, unknown>>(req);
  const fields: string[] = [];
  const values: unknown[] = [];
  const allowed = ['name','description','status','niche','target_audience','goal','member_count'];
  for (const k of allowed) {
    if (k in body) { fields.push(`${k}=?`); values.push(body[k]); }
  }
  if ('platforms' in body) {
    fields.push('platforms=?');
    values.push(JSON.stringify(body.platforms));
  }
  if (fields.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return; }
  values.push(id);
  await execute(`UPDATE admin_projects SET ${fields.join(',')} WHERE id=?`, values);
  sendJson(res, 200, { ok: true });
}

async function handleDeleteProject(_req: IncomingMessage, res: ServerResponse, id: string) {
  await execute(`DELETE FROM admin_projects WHERE id=?`, [id]);
  sendJson(res, 200, { ok: true });
}

/* ── Main Router ── */

export async function handleAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith("/api/admin")) return false;
  _adminCurrentRequest = request;

  /* CORS preflight */
  if (request.method === "OPTIONS") {
    setCorsHeaders(request, response, "GET,POST,PUT,PATCH,DELETE,OPTIONS", "Content-Type, Authorization");
    response.writeHead(204);
    response.end();
    return true;
  }

  const route = pathname.replace("/api/admin", "") || "/";

  /* Public routes */
  if (request.method === "POST" && route === "/login") {
    await handleLogin(request, response);
    return true;
  }

  /* Auth-protected routes */
  if (request.method === "GET" && route === "/me") {
    await handleMe(request, response);
    return true;
  }

  if (request.method === "POST" && route === "/logout") {
    await handleLogout(request, response);
    return true;
  }

  if (request.method === "GET" && route === "/dashboard") {
    await handleDashboard(request, response);
    return true;
  }

  if (request.method === "GET" && route === "/users") {
    await handleGetUsers(request, response);
    return true;
  }

  /* GET /api/admin/users/:id */
  const userGetMatch = route.match(/^\/users\/([^/]+)$/);
  if (userGetMatch && request.method === "GET") {
    await handleGetUser(request, response, decodeURIComponent(userGetMatch[1]));
    return true;
  }

  /* PATCH /api/admin/users/:id */
  const userPatchMatch = route.match(/^\/users\/([^/]+)$/);
  if (userPatchMatch && request.method === "PATCH") {
    await handleUpdateUser(request, response, decodeURIComponent(userPatchMatch[1]));
    return true;
  }

  /* POST /api/admin/users/:id/topup */
  const topupMatch = route.match(/^\/users\/([^/]+)\/topup$/);
  if (topupMatch && request.method === "POST") {
    await handleCreditTopup(request, response, decodeURIComponent(topupMatch[1]));
    return true;
  }

  /* GET /api/admin/users/:id/transactions */
  const txMatch = route.match(/^\/users\/([^/]+)\/transactions$/);
  if (txMatch && request.method === "GET") {
    await handleGetCreditTransactions(request, response, decodeURIComponent(txMatch[1]));
    return true;
  }

  if (request.method === "GET" && route === "/config") {
    await handleGetConfig(request, response);
    return true;
  }

  if (request.method === "PUT" && route === "/config") {
    await handleSaveConfig(request, response);
    return true;
  }

  if (request.method === "GET" && route === "/logs") {
    await handleGetLogs(request, response);
    return true;
  }

  /* ── Skills CRUD ── */
  if (request.method === "GET" && route === "/skills") {
    await handleGetSkills(request, response);
    return true;
  }
  if (request.method === "POST" && route === "/skills") {
    await handleCreateSkill(request, response);
    return true;
  }
  const skillMatch = route.match(/^\/skills\/([^/]+)$/);
  if (skillMatch && request.method === "PATCH") {
    await handleUpdateSkill(request, response, decodeURIComponent(skillMatch[1]));
    return true;
  }
  if (skillMatch && request.method === "DELETE") {
    await handleDeleteSkill(request, response, decodeURIComponent(skillMatch[1]));
    return true;
  }

  /* ── Prompt Templates CRUD ── */
  const ptMatch = route.match(/^\/prompt-templates\/([^/]+)(\/versions)?$/);
  if (ptMatch && request.method === "GET" && ptMatch[2] === "/versions") {
    await handleGetPromptTemplateVersions(request, response, decodeURIComponent(ptMatch[1]));
    return true;
  }
  if (ptMatch && request.method === "GET") {
    await handleGetPromptTemplate(request, response, decodeURIComponent(ptMatch[1]));
    return true;
  }
  if (ptMatch && request.method === "PATCH") {
    await handleUpdatePromptTemplate(request, response, decodeURIComponent(ptMatch[1]));
    return true;
  }

  /* ── Secrets CRUD ── */
  if (request.method === "GET" && route === "/secrets") {
    await handleGetSecrets(request, response);
    return true;
  }
  if (request.method === "POST" && route === "/secrets") {
    await handleCreateSecret(request, response);
    return true;
  }
  const secretMatch = route.match(/^\/secrets\/([^/]+)$/);
  if (secretMatch && request.method === "PATCH") {
    await handleUpdateSecret(request, response, decodeURIComponent(secretMatch[1]));
    return true;
  }
  if (secretMatch && request.method === "DELETE") {
    await handleDeleteSecret(request, response, decodeURIComponent(secretMatch[1]));
    return true;
  }
  const secretVerifyMatch = route.match(/^\/secrets\/([^/]+)\/verify$/);
  if (secretVerifyMatch && request.method === "POST") {
    await handleVerifySecret(request, response, decodeURIComponent(secretVerifyMatch[1]));
    return true;
  }

  /* ── Projects CRUD ── */
  if (request.method === "GET" && route === "/projects") {
    await handleGetProjects(request, response);
    return true;
  }
  if (request.method === "POST" && route === "/projects") {
    await handleCreateProject(request, response);
    return true;
  }
  const projectMatch = route.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && request.method === "PATCH") {
    await handleUpdateProject(request, response, decodeURIComponent(projectMatch[1]));
    return true;
  }
  if (projectMatch && request.method === "DELETE") {
    await handleDeleteProject(request, response, decodeURIComponent(projectMatch[1]));
    return true;
  }

  /* ── TikHub API 消耗统计 ── */
  if (request.method === "GET" && route === "/api-usage") {
    await handleGetApiUsageStats(request, response);
    return true;
  }

  /* ── Analysis Timing & Cache Monitoring ── */
  if (request.method === "GET" && route === "/timing") {
    await handleGetTimingStats(request, response);
    return true;
  }
  if (request.method === "GET" && route === "/cache") {
    await handleGetCacheStats(request, response);
    return true;
  }
  if (request.method === "DELETE" && route === "/cache") {
    await handleClearCache(request, response);
    return true;
  }
  const cacheItemMatch = route.match(/^\/cache\/([^/]+)$/);
  if (cacheItemMatch && request.method === "DELETE") {
    await handleDeleteCacheItem(request, response, decodeURIComponent(cacheItemMatch[1]));
    return true;
  }

  sendJson(response, 404, { error: "Admin endpoint not found." });
  return true;
}

/* ───────────────────────────────────────────────────────────────────── */
/* ── Analysis Timing & Cache Handlers ── */
/* ───────────────────────────────────────────────────────────────────── */

async function handleGetTimingStats(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const overallRows = await query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_count,
        ROUND(AVG(totalMs)) as avg_total_ms,
        MIN(totalMs) as min_total_ms,
        MAX(totalMs) as max_total_ms,
        ROUND(AVG(collectMs)) as avg_search_ms,
        ROUND(AVG(llmMs)) as avg_llm_ms,
        SUM(cacheHit) as cache_hits,
        SUM(CASE WHEN cacheHit = 0 THEN 1 ELSE 0 END) as cache_misses
      FROM analysis_timing
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      []
    );
    const recentRows = await query<RowDataPacket[]>(
      `SELECT id, runId, promptSnippet, totalMs, collectMs, llmMs,
        cacheHit, status, createdAt
      FROM analysis_timing
      ORDER BY createdAt DESC
      LIMIT 30`,
      []
    );
    const hourlyRows = await query<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(createdAt, '%Y-%m-%d %H:00') as hour,
        COUNT(*) as count,
        ROUND(AVG(totalMs)) as avg_ms,
        SUM(cacheHit) as cache_hits
      FROM analysis_timing
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY hour
      ORDER BY hour`,
      []
    );
    sendJson(response, 200, { overall: overallRows[0] ?? {}, recent: recentRows, hourly: hourlyRows });
  } catch (err) {
    log.error({ err }, "timing stats error");
    sendJson(response, 500, { error: "Failed to fetch timing stats" });
  }
}

async function handleGetCacheStats(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, cacheKey as cache_key, prompt as query_preview, hitCount as hit_count, platforms,
        createdAt as created_at, expiresAt as expires_at,
        CASE WHEN expiresAt > NOW() THEN 1 ELSE 0 END as is_valid
      FROM prediction_cache
      ORDER BY hitCount DESC, createdAt DESC
      LIMIT 50`,
      []
    );
    const statsRows = await query<RowDataPacket[]>(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN expiresAt > NOW() THEN 1 ELSE 0 END) as valid,
        SUM(hitCount) as total_hits,
        ROUND(AVG(hitCount), 1) as avg_hits
      FROM prediction_cache`,
      []
    );
    sendJson(response, 200, { items: rows, stats: statsRows[0] ?? {} });
  } catch (err) {
    log.error({ err }, "cache stats error");
    sendJson(response, 500, { error: "Failed to fetch cache stats" });
  }
}

async function handleClearCache(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    await execute(`DELETE FROM prediction_cache WHERE expiresAt <= NOW()`, []);
    sendJson(response, 200, { ok: true, message: "已清除过期缓存" });
  } catch (err) {
    log.error({ err }, "clear cache error");
    sendJson(response, 500, { error: "Failed to clear cache" });
  }
}

async function handleDeleteCacheItem(request: IncomingMessage, response: ServerResponse, id: string) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    await execute(`DELETE FROM prediction_cache WHERE id = ?`, [id]);
    sendJson(response, 200, { ok: true });
  } catch (err) {
    log.error({ err }, "delete cache item error");
    sendJson(response, 500, { error: "Failed to delete cache item" });
  }
}

/* ───────────────────────────────────────────────────────────────────── */
/* ── TikHub API 消耗统计 Handler ── */
/* ───────────────────────────────────────────────────────────────────── */

async function handleGetApiUsageStats(request: IncomingMessage, response: ServerResponse) {
  const session = requireAdmin(request, response);
  if (!session) return;
  try {
    // 总体统计（最近30天）
    const overallRows = await query<RowDataPacket[]>(
      `SELECT
        COUNT(*) AS total_calls,
        SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) AS billed_calls,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS cached_calls,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
        ROUND(SUM(cost_usd), 4) AS total_cost_usd,
        ROUND(SUM(CASE WHEN cache_hit = 0 THEN cost_usd ELSE 0 END), 4) AS billed_cost_usd
      FROM tikhub_api_calls
      WHERE called_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [],
    );

    // 按任务类型分组
    const byTaskTypeRows = await query<RowDataPacket[]>(
      `SELECT
        COALESCE(task_type, 'unknown') AS task_type,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) AS billed_calls,
        ROUND(SUM(cost_usd), 4) AS cost_usd
      FROM tikhub_api_calls
      WHERE called_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY task_type
      ORDER BY cost_usd DESC`,
      [],
    );

    // 按接口路径分组（Top 10）
    const byPathRows = await query<RowDataPacket[]>(
      `SELECT
        api_path,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) AS billed_calls,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS cached_calls,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed_calls,
        ROUND(SUM(cost_usd), 4) AS cost_usd
      FROM tikhub_api_calls
      WHERE called_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY api_path
      ORDER BY billed_calls DESC
      LIMIT 15`,
      [],
    );

    // 按天统计（最近14天）
    const dailyRows = await query<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(called_at, '%Y-%m-%d') AS day,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) AS billed_calls,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) AS cached_calls,
        ROUND(SUM(cost_usd), 4) AS cost_usd
      FROM tikhub_api_calls
      WHERE called_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      GROUP BY day
      ORDER BY day`,
      [],
    );

    // 最近50条调用记录
    const recentRows = await query<RowDataPacket[]>(
      `SELECT
        id, called_at, api_path, method, http_status, success, cache_hit,
        cost_usd, task_type, user_id, keyword, platform, request_id, error_msg
      FROM tikhub_api_calls
      ORDER BY called_at DESC
      LIMIT 50`,
      [],
    );

    sendJson(response, 200, {
      overall: overallRows[0] ?? {},
      byTaskType: byTaskTypeRows,
      byPath: byPathRows,
      daily: dailyRows,
      recent: recentRows,
    });
  } catch (err) {
    log.error({ err }, "api-usage stats error");
    sendJson(response, 500, { error: "Failed to fetch API usage stats" });
  }
}

/* ── Prompt Templates Handlers ── */

async function handleGetPromptTemplate(_req: IncomingMessage, res: ServerResponse, id: string) {
  const session = requireAdmin(_req, res);
  if (!session) return;
  try {
    const rows = await query<RowDataPacket[]>(
      `SELECT id, version, label, intent, category, system_prompt_doubao, user_prompt_template, output_format, preferred_model, max_tokens, base_cost, is_active, created_at, updated_at
       FROM prompt_templates WHERE id = ? ORDER BY version DESC LIMIT 1`,
      [id]
    );
    if (!rows.length) { sendJson(res, 404, { error: "Not found" }); return; }
    sendJson(res, 200, { template: rows[0] });
  } catch (err) {
    log.error({ err }, "get prompt template error");
    sendJson(res, 500, { error: "Failed to fetch prompt template" });
  }
}

async function handleGetPromptTemplateVersions(_req: IncomingMessage, res: ServerResponse, id: string) {
  const session = requireAdmin(_req, res);
  if (!session) return;
  try {
    // The base id without version suffix (strip -v1, -v2 etc)
    const baseId = id.replace(/-v\d+$/, '');
    const rows = await query<RowDataPacket[]>(
      `SELECT id, version, label, intent, category, system_prompt_doubao, user_prompt_template, output_format, preferred_model, max_tokens, base_cost, is_active, created_at, updated_at
       FROM prompt_templates WHERE id LIKE ? ORDER BY version DESC LIMIT 20`,
      [`${baseId}%`]
    );
    sendJson(res, 200, { versions: rows });
  } catch (err) {
    log.error({ err }, "get prompt template versions error");
    sendJson(res, 500, { error: "Failed to fetch versions" });
  }
}

async function handleUpdatePromptTemplate(req: IncomingMessage, res: ServerResponse, id: string) {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const { system_prompt_doubao, user_prompt_template, label, max_tokens } = body as {
      system_prompt_doubao?: string;
      user_prompt_template?: string;
      label?: string;
      max_tokens?: number;
    };

    // Get current version
    const current = await query<RowDataPacket[]>(
      `SELECT id, version FROM prompt_templates WHERE id = ? ORDER BY version DESC LIMIT 1`,
      [id]
    );
    if (!current.length) { sendJson(res, 404, { error: "Not found" }); return; }

    const currentVersion = (current[0].version as number) ?? 1;
    const newVersion = currentVersion + 1;
    const baseId = id.replace(/-v\d+$/, '');
    const newId = `${baseId}-v${newVersion}`;

    // Insert new version (keep old one for history)
    await execute(
      `INSERT INTO prompt_templates (id, version, label, intent, category, system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46, user_prompt_template, required_params, optional_params, output_format, output_schema, preferred_model, max_tokens, base_cost, is_active)
       SELECT ?, ?, COALESCE(?, label), intent, category, COALESCE(?, system_prompt_doubao), COALESCE(?, system_prompt_doubao), COALESCE(?, system_prompt_doubao), COALESCE(?, user_prompt_template), required_params, optional_params, output_format, output_schema, preferred_model, COALESCE(?, max_tokens), base_cost, 1
       FROM prompt_templates WHERE id = ?`,
      [newId, newVersion, label ?? null, system_prompt_doubao ?? null, system_prompt_doubao ?? null, system_prompt_doubao ?? null, user_prompt_template ?? null, max_tokens ?? null, id]
    );

    // Update skill_registry to point to new template id
    await execute(
      `UPDATE skill_registry SET prompt_template_id = ? WHERE prompt_template_id = ?`,
      [newId, id]
    );

    sendJson(res, 200, { ok: true, newVersion, newId });
  } catch (err) {
    log.error({ err }, "update prompt template error");
    sendJson(res, 500, { error: "Failed to update prompt template" });
  }
}
