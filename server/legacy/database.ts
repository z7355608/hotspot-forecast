/**
 * Database Connection Module
 * ─────────────────────────────────────────────
 * Provides a MySQL connection pool and typed query helpers
 * for the admin backend. Uses mysql2/promise for async/await.
 *
 * Connection parameters are read from environment variables
 * with sensible defaults for local development.
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("Database");
import mysql from "mysql2/promise";
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

/* Re-export for convenience */
export type { RowDataPacket, ResultSetHeader };

/* eslint-disable @typescript-eslint/no-explicit-any */
type SqlParams = any[];

/* ── Connection Config ── */

function buildDbConfig() {
  // Prefer DATABASE_URL (webdev platform TiDB Cloud) if available
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const sslParam = url.searchParams.get('ssl');
      let ssl: any = undefined;
      if (sslParam) {
        try { ssl = JSON.parse(sslParam); } catch { ssl = true; }
      }
      return {
        host: url.hostname,
        port: Number(url.port) || 4000,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.substring(1),
        charset: "utf8mb4" as const,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ...(ssl ? { ssl } : {}),
      };
    } catch (e) {
      log.warn({ err: e }, 'Failed to parse DATABASE_URL, falling back to individual env vars');
    }
  }
  // Fallback to individual env vars (local development)
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "hotspot_admin",
    password: process.env.DB_PASSWORD || "Hotspot@2026!Secure",
    database: process.env.DB_NAME || "hotspot_forecast",
    charset: "utf8mb4" as const,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };
}

const DB_CONFIG = buildDbConfig();

/* ── Singleton Pool ── */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
    log.info("Connection pool created → ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}");
  }
  return pool;
}

/* ── Typed Query Helpers ── */

/**
 * Execute a SELECT query and return typed rows.
 */
export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: SqlParams,
): Promise<T> {
  const p = getPool();
  const [rows] = await p.query<T>(sql, params);
  return rows;
}

/**
 * Execute an INSERT / UPDATE / DELETE and return the result header.
 */
export async function execute(
  sql: string,
  params?: SqlParams,
): Promise<ResultSetHeader> {
  const p = getPool();
  const [result] = await p.query<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Get a single row or null.
 */
export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params?: SqlParams,
): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Health check: verify the database connection is alive.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const p = getPool();
    await p.query("SELECT 1");
    return true;
  } catch (err) {
    log.error({ err: err }, "Connection check failed");
    return false;
  }
}

/**
 * Gracefully close the pool (for shutdown hooks).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info("Connection pool closed.");
  }
}
