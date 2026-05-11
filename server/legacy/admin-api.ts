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

function emitDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
  runId = "pre-fix",
) {
  fetch("http://127.0.0.1:7545/ingest/236e4359-60f3-406e-93d6-60666b075463", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "69d318",
    },
    body: JSON.stringify({
      sessionId: "69d318",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

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

  const token = randomUUID();
  const now = new Date();
  const nickname = "管理员";
  const session: AdminSession = {
    token,
    phone,
    nickname,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  sessions.set(token, session);

  try {
    await appendAuditLog({
      adminPhone: phone,
      action: "login",
      target: "admin",
      detail: "管理员登录",
      ip: getClientIp(request),
    });
  } catch { /* ignore audit log errors */ }

  sendJson(response, 200, {
    token,
    phone,
    nickname,
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
      `INSERT INTO credit_transactions (userOpenId, type, amount, balance, description, createdAt)
       VALUES (?, 'admin', ?, ?, ?, NOW())`,
      [user.id, creditDiff, body.credits, `管理员调整积分 (${session.phone})`],
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
    `INSERT INTO credit_transactions (userOpenId, type, amount, balance, description, createdAt)
     VALUES (?, 'purchase', ?, ?, ?, NOW())`,
    [user.id, amount, newBalance, `${reason} (${session.phone})`],
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
    "SELECT COUNT(*) AS cnt FROM credit_transactions WHERE userOpenId = ?",
    [user.id],
  );
  const total = countRow?.cnt || 0;
  const offset = (page - 1) * pageSize;

  const txRows = await query<(RowDataPacket & {
    id: number; type: string; amount: number; balance: number;
    description: string; relatedId: string | null; createdAt: Date;
  })[]>(
    "SELECT * FROM credit_transactions WHERE userOpenId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    [user.id, pageSize, offset],
  );

  const transactions = txRows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balance,
    reason: t.description,
    operator: "",
    createdAt: t.createdAt?.toISOString() || null,
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

/**
 * 链路阶段定义 — 与 seed-skills.mjs 中 category 的 stageX_xxx 命名对齐
 * 用于驱动后台"链路总览"可视化和侧边栏分组
 */
const PIPELINE_STAGES = [
  { id: "stage1_input",     order: 1, label: "输入理解",   summary: "解析用户输入，识别意图类型" },
  { id: "stage2_collect",   order: 2, label: "数据采集",   summary: "拉取平台数据、采集评论" },
  { id: "stage3_analyze",   order: 3, label: "清洗分析",   summary: "语义过滤、低粉算法、评论摘要" },
  { id: "stage4_predict",   order: 4, label: "核心预测",   summary: "机会判断 / 选题策略 / 低粉爆款 / 账号诊断" },
  { id: "stage5_recommend", order: 5, label: "动作推荐",   summary: "基于预测结果生成下一步行动建议" },
  { id: "stage6_tools",     order: 6, label: "用户工具",   summary: "拆解、文案提取等二次加工动作" },
] as const;

const ENTRY_SOURCE_LABEL: Record<string, string> = {
  workbench: "用户工作台",
  pipeline:  "链路内部",
  cta:       "二次动作",
};

async function handleGetSkills(_req: IncomingMessage, res: ServerResponse) {
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, label, desc_text, icon, category, prompt_template_id, intent, entry_source, result_card_type, param_extract_rules, cost, sort_order, is_active, is_premium, created_at, updated_at FROM skill_registry ORDER BY sort_order ASC`
  );
  const skills: Record<string, unknown>[] = rows.map((r) => {
    const category = String(r.category ?? "");
    const stage = PIPELINE_STAGES.find((s) => s.id === category)?.id ?? null;
    return { ...r, stage, entry_source_label: ENTRY_SOURCE_LABEL[String(r.entry_source ?? "")] ?? r.entry_source };
  });

  // #region agent log（来自 main：诊断 prompt 模板乱码用，可在稳定后清理）
  emitDebugLog(
    "H1",
    "server/legacy/admin-api.ts:handleGetSkills",
    "skills payload sample",
    {
      count: skills.length,
      sample: skills.slice(0, 3).map((r) => ({
        id: r.id,
        label: r.label,
        desc_text: r.desc_text,
        prompt_template_id: r.prompt_template_id,
        hasReplacementChar:
          String(r.label ?? "").includes("�") || String(r.desc_text ?? "").includes("�"),
      })),
    },
  );
  // #endregion

  sendJson(res, 200, { skills });
}

async function handleGetSkillStats(_req: IncomingMessage, res: ServerResponse, skillId: string) {
  // 7 日窗口 — 复用 skill_execution_logs 表（schema-v4-prompt-skills.sql）
  const summary = await queryOne<RowDataPacket & {
    total: number; success: number; failed: number;
    avg_tokens: number | null; avg_duration: number | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
       SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
       AVG(tokens_used)  AS avg_tokens,
       AVG(duration_ms)  AS avg_duration
     FROM skill_execution_logs
     WHERE skill_id = ? AND created_at >= NOW() - INTERVAL 7 DAY`,
    [skillId],
  );

  const daily = await query<(RowDataPacket & { day: string; cnt: number })[]>(
    `SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM skill_execution_logs
      WHERE skill_id = ? AND created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY DATE(created_at)
      ORDER BY day ASC`,
    [skillId],
  );

  const total = Number(summary?.total ?? 0);
  const success = Number(summary?.success ?? 0);
  const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : null;

  sendJson(res, 200, {
    skillId,
    windowDays: 7,
    total,
    success,
    failed: Number(summary?.failed ?? 0),
    successRate,
    avgTokens:  summary?.avg_tokens   != null ? Math.round(Number(summary.avg_tokens))   : null,
    avgDurationMs: summary?.avg_duration != null ? Math.round(Number(summary.avg_duration)) : null,
    dailyTrend: daily.map((d) => ({ day: String(d.day), count: Number(d.cnt) })),
  });
}

async function handleGetPipelineTopology(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, label, category, entry_source, prompt_template_id, sort_order, is_active
       FROM skill_registry
      ORDER BY sort_order ASC`,
  );

  const stages = PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    order: stage.order,
    label: stage.label,
    summary: stage.summary,
    skills: rows
      .filter((r) => String(r.category) === stage.id)
      .map((r) => ({
        id: String(r.id),
        label: String(r.label),
        entrySource: String(r.entry_source ?? ""),
        promptTemplateId: r.prompt_template_id ? String(r.prompt_template_id) : null,
        isActive: Number(r.is_active) === 1,
      })),
  }));

  sendJson(res, 200, { stages });
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

/* ════════════════════════════════════════════════════════════════════════════
 *  Traces / Bad Cases — AI 调用全链路追踪
 *
 *  trace 单元 = skill_execution_logs.session_id（一次用户预测的所有技能调用聚合）
 *  bad case = prediction_feedback.rating='bad'
 * ════════════════════════════════════════════════════════════════════════════
 */

async function handleListTraces(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url ?? "", "http://x");
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") ?? 50)));
  const userId = url.searchParams.get("user_id") ?? null;
  const onlyBad = url.searchParams.get("only_bad") === "1";

  // 按 session_id 聚合 skill_execution_logs；过滤近 N 天；可按 user_id 过滤
  const sql = `
    SELECT
      l.session_id,
      MAX(l.user_id)                        AS user_id,
      MIN(l.created_at)                     AS started_at,
      MAX(l.created_at)                     AS ended_at,
      COUNT(*)                              AS skill_count,
      SUM(l.tokens_used)                    AS total_tokens,
      SUM(l.duration_ms)                    AS total_duration_ms,
      SUM(CASE WHEN l.status='failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END) AS success_count,
      MIN(l.input_prompt)                   AS first_input,
      GROUP_CONCAT(DISTINCT l.skill_id ORDER BY l.created_at SEPARATOR ',') AS skill_ids,
      MAX(f.rating)                         AS feedback_rating
    FROM skill_execution_logs l
    LEFT JOIN prediction_feedback f ON f.session_id = l.session_id
    WHERE l.created_at >= NOW() - INTERVAL ? DAY
      AND l.session_id IS NOT NULL
      ${userId ? "AND l.user_id = ?" : ""}
    GROUP BY l.session_id
    ${onlyBad ? "HAVING feedback_rating = 'bad'" : ""}
    ORDER BY started_at DESC
    LIMIT ?
  `;
  const params: unknown[] = [days];
  if (userId) params.push(userId);
  params.push(limit);

  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(sql, params);

  const traces = rows.map((r) => ({
    sessionId: String(r.session_id),
    userId: r.user_id ? String(r.user_id) : null,
    startedAt: String(r.started_at),
    endedAt: String(r.ended_at),
    skillCount: Number(r.skill_count),
    totalTokens: r.total_tokens != null ? Number(r.total_tokens) : 0,
    totalDurationMs: r.total_duration_ms != null ? Number(r.total_duration_ms) : 0,
    failedCount: Number(r.failed_count),
    successCount: Number(r.success_count),
    firstInput: r.first_input ? String(r.first_input).slice(0, 200) : "",
    skillIds: r.skill_ids ? String(r.skill_ids).split(",") : [],
    feedbackRating: r.feedback_rating ? String(r.feedback_rating) : null,
  }));

  sendJson(res, 200, { traces, days, limit });
}

async function handleGetTraceDetail(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const steps = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT
       l.id, l.skill_id, l.user_id, l.artifact_id,
       l.prompt_template_id, l.model_used, l.status,
       l.tokens_used, l.credits_charged, l.duration_ms,
       l.error_message, l.created_at,
       s.label AS skill_label, s.category AS stage
     FROM skill_execution_logs l
     LEFT JOIN skill_registry s ON s.id = l.skill_id
     WHERE l.session_id = ?
     ORDER BY l.created_at ASC`,
    [sessionId],
  );

  const feedback = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT id, source, reporter_id, rating, note, prompt_template_id, created_at
       FROM prediction_feedback
      WHERE session_id = ?
      ORDER BY created_at DESC`,
    [sessionId],
  );

  sendJson(res, 200, {
    sessionId,
    steps: steps.map((s) => ({
      id: Number(s.id),
      skillId: String(s.skill_id),
      skillLabel: s.skill_label ? String(s.skill_label) : String(s.skill_id),
      stage: s.stage ? String(s.stage) : null,
      promptTemplateId: s.prompt_template_id ? String(s.prompt_template_id) : null,
      modelUsed: String(s.model_used),
      status: String(s.status),
      tokensUsed: s.tokens_used != null ? Number(s.tokens_used) : null,
      creditsCharged: s.credits_charged != null ? Number(s.credits_charged) : null,
      durationMs: s.duration_ms != null ? Number(s.duration_ms) : null,
      errorMessage: s.error_message ? String(s.error_message) : null,
      artifactId: s.artifact_id ? String(s.artifact_id) : null,
      createdAt: String(s.created_at),
    })),
    feedback: feedback.map((f) => ({
      id: Number(f.id),
      source: String(f.source),
      reporterId: f.reporter_id ? String(f.reporter_id) : null,
      rating: String(f.rating),
      note: f.note ? String(f.note) : null,
      promptTemplateId: f.prompt_template_id ? String(f.prompt_template_id) : null,
      createdAt: String(f.created_at),
    })),
  });
}

async function handlePostFeedback(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const body = await readJsonBody<Record<string, unknown>>(req);
  const { session_id, artifact_id, rating, note, prompt_template_id } = body as {
    session_id?: string; artifact_id?: string; rating?: string; note?: string; prompt_template_id?: string;
  };
  if (!session_id && !artifact_id) {
    sendJson(res, 400, { error: "session_id 或 artifact_id 至少需要一个" });
    return;
  }
  if (rating !== "good" && rating !== "bad") {
    sendJson(res, 400, { error: "rating 必须是 good 或 bad" });
    return;
  }
  await execute(
    `INSERT INTO prediction_feedback
       (session_id, artifact_id, source, reporter_id, rating, note, prompt_template_id)
     VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
    [session_id ?? null, artifact_id ?? null, session.phone, rating, note ?? null, prompt_template_id ?? null],
  );
  sendJson(res, 201, { ok: true });
}

async function handleListBadCases(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url ?? "", "http://x");
  const templateId = url.searchParams.get("prompt_template_id");
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 30)));

  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT f.id, f.session_id, f.artifact_id, f.source, f.reporter_id,
            f.note, f.prompt_template_id, f.created_at,
            l.skill_id, l.user_id, l.model_used,
            s.label AS skill_label
       FROM prediction_feedback f
       LEFT JOIN skill_execution_logs l ON l.session_id = f.session_id
       LEFT JOIN skill_registry s ON s.id = l.skill_id
      WHERE f.rating = 'bad'
        ${templateId ? "AND (f.prompt_template_id = ? OR l.prompt_template_id = ?)" : ""}
      ORDER BY f.created_at DESC
      LIMIT ?`,
    templateId ? [templateId, templateId, limit] : [limit],
  );

  sendJson(res, 200, {
    badCases: rows.map((r) => ({
      id: Number(r.id),
      sessionId: r.session_id ? String(r.session_id) : null,
      artifactId: r.artifact_id ? String(r.artifact_id) : null,
      skillId: r.skill_id ? String(r.skill_id) : null,
      skillLabel: r.skill_label ? String(r.skill_label) : null,
      userId: r.user_id ? String(r.user_id) : null,
      modelUsed: r.model_used ? String(r.model_used) : null,
      reporterId: r.reporter_id ? String(r.reporter_id) : null,
      note: r.note ? String(r.note) : null,
      promptTemplateId: r.prompt_template_id ? String(r.prompt_template_id) : null,
      createdAt: String(r.created_at),
    })),
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Dashboard breakdown — 业务驱动的指标切片
 * ════════════════════════════════════════════════════════════════════════════
 */

async function handleDashboardSkillBreakdown(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url ?? "", "http://x");
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  // 按入口技能（entry_source='workbench'）切片：调用次数、平均 token、成功率、平均耗时
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT
       s.id, s.label, s.category, s.entry_source,
       COUNT(l.id)                                           AS call_count,
       SUM(CASE WHEN l.status='success' THEN 1 ELSE 0 END)   AS success_count,
       SUM(CASE WHEN l.status='failed'  THEN 1 ELSE 0 END)   AS failed_count,
       AVG(l.tokens_used)                                    AS avg_tokens,
       AVG(l.duration_ms)                                    AS avg_duration,
       SUM(l.tokens_used)                                    AS total_tokens
     FROM skill_registry s
     LEFT JOIN skill_execution_logs l
       ON l.skill_id = s.id AND l.created_at >= NOW() - INTERVAL ? DAY
     GROUP BY s.id, s.label, s.category, s.entry_source
     ORDER BY s.sort_order ASC`,
    [days],
  );

  const breakdown = rows.map((r) => {
    const total = Number(r.call_count ?? 0);
    const success = Number(r.success_count ?? 0);
    return {
      skillId: String(r.id),
      label: String(r.label),
      stage: String(r.category),
      entrySource: String(r.entry_source ?? ""),
      callCount: total,
      successCount: success,
      failedCount: Number(r.failed_count ?? 0),
      successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : null,
      avgTokens: r.avg_tokens != null ? Math.round(Number(r.avg_tokens)) : null,
      avgDurationMs: r.avg_duration != null ? Math.round(Number(r.avg_duration)) : null,
      totalTokens: r.total_tokens != null ? Number(r.total_tokens) : 0,
    };
  });

  sendJson(res, 200, { days, breakdown });
}

async function handleDashboardModelCost(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const url = new URL(req.url ?? "", "http://x");
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT model_id,
            COUNT(*)               AS call_count,
            SUM(prompt_tokens)     AS prompt_tokens,
            SUM(completion_tokens) AS completion_tokens,
            SUM(charged_cost)      AS total_credits
       FROM llm_usage_logs
      WHERE created_at >= NOW() - INTERVAL ? DAY
      GROUP BY model_id
      ORDER BY total_credits DESC`,
    [days],
  );

  sendJson(res, 200, {
    days,
    models: rows.map((r) => ({
      modelId: String(r.model_id),
      callCount: Number(r.call_count ?? 0),
      promptTokens: Number(r.prompt_tokens ?? 0),
      completionTokens: Number(r.completion_tokens ?? 0),
      totalCredits: Number(r.total_credits ?? 0),
    })),
  });
}

async function handleDashboardFunnel(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  // 业务漏斗：注册 → 首次预测 → 3+ 次预测 → 已付费 → 续费/付 ≥ 2 笔
  const totalUsers     = await queryOne<RowDataPacket & { c: number }>(`SELECT COUNT(*) AS c FROM user_profiles`);
  const everPredicted  = await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(DISTINCT user_id) AS c FROM user_activity_logs WHERE activity_type='prediction'`,
  );
  const repeatedUsers  = await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(*) AS c FROM (
       SELECT user_id FROM user_activity_logs
        WHERE activity_type='prediction'
        GROUP BY user_id
       HAVING COUNT(*) >= 3
     ) t`,
  );
  const paidUsers      = await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(DISTINCT user_id) AS c FROM revenue_records`,
  );
  const repeatPaid     = await queryOne<RowDataPacket & { c: number }>(
    `SELECT COUNT(*) AS c FROM (
       SELECT user_id FROM revenue_records GROUP BY user_id HAVING COUNT(*) >= 2
     ) t`,
  );

  sendJson(res, 200, {
    funnel: [
      { key: "registered",   label: "已注册",          count: Number(totalUsers?.c ?? 0) },
      { key: "predicted",    label: "首次预测",         count: Number(everPredicted?.c ?? 0) },
      { key: "active",       label: "≥3 次预测",        count: Number(repeatedUsers?.c ?? 0) },
      { key: "paid",         label: "首次付费",         count: Number(paidUsers?.c ?? 0) },
      { key: "repeat_paid",  label: "复购 / 续费",      count: Number(repeatPaid?.c ?? 0) },
    ],
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 *  User detail — 单用户深度页（活动 / 预测 / 消耗 / 营收 聚合）
 * ════════════════════════════════════════════════════════════════════════════
 */

async function handleGetUserDetail(req: IncomingMessage, res: ServerResponse, userId: string) {
  const session = requireAdmin(req, res);
  if (!session) return;
  const profile = await queryOne<RowDataPacket & Record<string, unknown>>(
    `SELECT id, phone, nickname, membership_plan, credits, total_spent, total_earned,
            total_predictions, is_admin, status, created_at, last_active_at
       FROM user_profiles WHERE id = ?`,
    [userId],
  );
  if (!profile) {
    sendJson(res, 404, { error: "用户不存在" });
    return;
  }

  const recentActivity = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT activity_type, activity_date, ip, created_at
       FROM user_activity_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId],
  );

  const recentTraces = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT session_id,
            MIN(created_at)                                   AS started_at,
            COUNT(*)                                          AS skill_count,
            SUM(tokens_used)                                  AS total_tokens,
            SUM(duration_ms)                                  AS total_duration_ms,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END)  AS failed_count,
            MIN(input_prompt)                                 AS first_input
       FROM skill_execution_logs
      WHERE user_id = ?
      GROUP BY session_id
      ORDER BY started_at DESC
      LIMIT 10`,
    [userId],
  );

  const llmConsumption = await queryOne<RowDataPacket & {
    call_count: number; total_charged: number; total_tokens: number;
  }>(
    `SELECT COUNT(*) AS call_count,
            SUM(charged_cost) AS total_charged,
            SUM(prompt_tokens + completion_tokens) AS total_tokens
       FROM llm_usage_logs
      WHERE user_id = ?`,
    [userId],
  );

  const revenue = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT type, amount, description, payment_method, revenue_date, created_at
       FROM revenue_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [userId],
  );

  sendJson(res, 200, {
    profile: {
      id: String(profile.id),
      phone: String(profile.phone),
      nickname: String(profile.nickname ?? ""),
      membershipPlan: String(profile.membership_plan ?? ""),
      credits: Number(profile.credits ?? 0),
      totalSpent: Number(profile.total_spent ?? 0),
      totalEarned: Number(profile.total_earned ?? 0),
      totalPredictions: Number(profile.total_predictions ?? 0),
      status: String(profile.status ?? ""),
      createdAt: String(profile.created_at),
      lastActiveAt: profile.last_active_at ? String(profile.last_active_at) : null,
    },
    activity: recentActivity.map((a) => ({
      type: String(a.activity_type),
      date: String(a.activity_date),
      ip: a.ip ? String(a.ip) : null,
      at: String(a.created_at),
    })),
    recentTraces: recentTraces.map((t) => ({
      sessionId: String(t.session_id),
      startedAt: String(t.started_at),
      skillCount: Number(t.skill_count),
      totalTokens: Number(t.total_tokens ?? 0),
      totalDurationMs: Number(t.total_duration_ms ?? 0),
      failedCount: Number(t.failed_count),
      firstInput: t.first_input ? String(t.first_input).slice(0, 120) : "",
    })),
    consumption: {
      callCount: Number(llmConsumption?.call_count ?? 0),
      totalCharged: Number(llmConsumption?.total_charged ?? 0),
      totalTokens: Number(llmConsumption?.total_tokens ?? 0),
    },
    revenue: revenue.map((r) => ({
      type: String(r.type),
      amount: Number(r.amount),
      description: r.description ? String(r.description) : null,
      paymentMethod: r.payment_method ? String(r.payment_method) : null,
      revenueDate: String(r.revenue_date),
      createdAt: String(r.created_at),
    })),
  });
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

  /* ── Dashboard breakdowns（业务切片）── */
  if (request.method === "GET" && route === "/dashboard/skill-breakdown") {
    await handleDashboardSkillBreakdown(request, response);
    return true;
  }
  if (request.method === "GET" && route === "/dashboard/model-cost") {
    await handleDashboardModelCost(request, response);
    return true;
  }
  if (request.method === "GET" && route === "/dashboard/funnel") {
    await handleDashboardFunnel(request, response);
    return true;
  }

  /* ── Traces / Bad Cases ── */
  if (request.method === "GET" && route === "/traces") {
    await handleListTraces(request, response);
    return true;
  }
  if (request.method === "GET" && route === "/bad-cases") {
    await handleListBadCases(request, response);
    return true;
  }
  if (request.method === "POST" && route === "/traces/feedback") {
    await handlePostFeedback(request, response);
    return true;
  }
  const traceMatch = route.match(/^\/traces\/([^/]+)$/);
  if (traceMatch && request.method === "GET") {
    await handleGetTraceDetail(request, response, decodeURIComponent(traceMatch[1]));
    return true;
  }

  if (request.method === "GET" && route === "/users") {
    await handleGetUsers(request, response);
    return true;
  }

  /* GET /api/admin/users/:id/detail（深度聚合页） */
  const userDetailMatch = route.match(/^\/users\/([^/]+)\/detail$/);
  if (userDetailMatch && request.method === "GET") {
    await handleGetUserDetail(request, response, decodeURIComponent(userDetailMatch[1]));
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
  if (request.method === "GET" && route === "/pipeline/topology") {
    await handleGetPipelineTopology(request, response);
    return true;
  }
  const skillStatsMatch = route.match(/^\/skills\/([^/]+)\/stats$/);
  if (skillStatsMatch && request.method === "GET") {
    await handleGetSkillStats(request, response, decodeURIComponent(skillStatsMatch[1]));
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
  if (request.method === "GET" && route === "/prompt-templates") {
    await handleListPromptTemplates(request, response);
    return true;
  }
  if (request.method === "POST" && route === "/prompt-templates") {
    await handleCreatePromptTemplate(request, response);
    return true;
  }
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
    const recent = recentRows.map((row) => ({
      id: row.id,
      query_preview: row.promptSnippet ?? "",
      total_ms: Number(row.totalMs ?? 0),
      search_ms: Number(row.collectMs ?? 0),
      comment_ms: 0,
      llm_ms: Number(row.llmMs ?? 0),
      platform_count: 0,
      cache_hit: Number(row.cacheHit ?? 0),
      execution_status: String(row.status ?? "failed"),
      created_at: row.createdAt,
    }));
    sendJson(response, 200, { overall: overallRows[0] ?? {}, recent, hourly: hourlyRows });
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
    // #region agent log
    emitDebugLog(
      "H2",
      "server/legacy/admin-api.ts:handleGetPromptTemplate",
      "prompt template payload sample",
      {
        requestedId: id,
        found: rows.length > 0,
        sample: rows[0]
          ? {
              id: rows[0].id,
              label: rows[0].label,
              system_prompt_preview: String(rows[0].system_prompt_doubao ?? "").slice(0, 80),
              user_prompt_preview: String(rows[0].user_prompt_template ?? "").slice(0, 80),
            }
          : null,
      },
    );
    // #endregion
    if (!rows.length) {
      // #region agent log
      emitDebugLog(
        "H9",
        "server/legacy/admin-api.ts:handleGetPromptTemplate",
        "prompt template not found",
        { requestedId: id },
      );
      // #endregion
      sendJson(res, 404, { error: "Not found" });
      return;
    }
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
    // #region agent log
    emitDebugLog(
      "H3",
      "server/legacy/admin-api.ts:handleGetPromptTemplateVersions",
      "prompt template versions payload sample",
      {
        requestedId: id,
        baseId,
        count: rows.length,
        sampleIds: rows.slice(0, 5).map((r) => r.id),
      },
    );
    // #endregion
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

/**
 * 列出所有 prompt 模板（最新版本）— 给前端"新建技能"时选关联模板用
 */
async function handleListPromptTemplates(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  // 每个 baseId 取最新 version
  const rows = await query<(RowDataPacket & Record<string, unknown>)[]>(
    `SELECT t.id, t.version, t.label, t.intent, t.category, t.output_format, t.preferred_model, t.max_tokens, t.is_active
       FROM prompt_templates t
       INNER JOIN (
         SELECT
           CASE WHEN id REGEXP '-v[0-9]+$' THEN SUBSTRING_INDEX(id, '-v', 1) ELSE id END AS base_id,
           MAX(version) AS max_v
         FROM prompt_templates
         GROUP BY base_id
       ) latest
         ON (CASE WHEN t.id REGEXP '-v[0-9]+$' THEN SUBSTRING_INDEX(t.id, '-v', 1) ELSE t.id END) = latest.base_id
        AND t.version = latest.max_v
      ORDER BY t.category, t.id`,
  );
  sendJson(res, 200, { templates: rows });
}

/**
 * 新建 prompt 模板（运营自助）
 */
async function handleCreatePromptTemplate(req: IncomingMessage, res: ServerResponse) {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const {
      id, label, intent, category,
      system_prompt_doubao, user_prompt_template,
      required_params, optional_params,
      output_format, preferred_model, max_tokens, base_cost,
    } = body as {
      id?: string; label?: string; intent?: string; category?: string;
      system_prompt_doubao?: string; user_prompt_template?: string;
      required_params?: string[]; optional_params?: string[];
      output_format?: string; preferred_model?: string;
      max_tokens?: number; base_cost?: number;
    };

    if (!id || !label || !system_prompt_doubao) {
      sendJson(res, 400, { error: "id, label, system_prompt_doubao 为必填" });
      return;
    }

    // 不存在 -v 后缀就自动加 -v1
    const finalId = /-v\d+$/.test(id) ? id : `${id}-v1`;

    await execute(
      `INSERT INTO prompt_templates
         (id, version, label, intent, category,
          system_prompt_doubao, system_prompt_gpt54, system_prompt_claude46,
          user_prompt_template, required_params, optional_params,
          output_format, output_schema, preferred_model, max_tokens, base_cost, is_active)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1)`,
      [
        finalId,
        label,
        intent ?? "",
        category ?? "stage6_tools",
        system_prompt_doubao,
        system_prompt_doubao, // gpt54 fallback
        system_prompt_doubao, // claude46 fallback
        user_prompt_template ?? "",
        JSON.stringify(required_params ?? []),
        JSON.stringify(optional_params ?? []),
        output_format ?? "markdown",
        preferred_model ?? "doubao",
        max_tokens ?? 2000,
        base_cost ?? 5,
      ],
    );

    sendJson(res, 201, { id: finalId });
  } catch (err) {
    log.error({ err }, "create prompt template error");
    sendJson(res, 500, { error: "Failed to create prompt template" });
  }
}
