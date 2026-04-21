/**
 * admin-secrets-helper.ts
 * ---------------------------------------------------------------
 * 从 admin_secrets 表读取平台密钥（Cookie、UID 等）的辅助函数
 *
 * 用途：
 * - 部分 TikHub 接口需要用户 Cookie 才能正常调用（如快手评论、小红书私信等）
 * - 管理员可在后台「密钥管理」页面配置这些 Cookie
 * - 本模块在接口调用时自动注入对应平台的 Cookie
 * ---------------------------------------------------------------
 */

import { query, queryOne } from "./database.js";
import type { RowDataPacket } from "mysql2";

export interface AdminSecret {
  id: string;
  key_name: string;
  key_value: string;
  description: string;
  category: string;
  platform: string;
  is_active: number;
  verify_status: string | null;
}

/**
 * 获取指定平台和分类的密钥值
 * @param platform 平台 ID，如 "douyin" | "kuaishou" | "xiaohongshu" | "global"
 * @param category 密钥类型，如 "cookie" | "uid" | "api_key" | "other"
 * @param keyName  可选：精确匹配 key_name
 * @returns 密钥值，如果未配置则返回 null
 */
export async function getAdminSecret(
  platform: string,
  category: string,
  keyName?: string,
): Promise<string | null> {
  try {
    let sql = `SELECT key_value FROM admin_secrets WHERE platform=? AND category=? AND is_active=1`;
    const params: unknown[] = [platform, category];
    if (keyName) {
      sql += ` AND key_name=?`;
      params.push(keyName);
    }
    sql += ` ORDER BY updated_at DESC LIMIT 1`;
    const row = await queryOne<RowDataPacket & { key_value: string }>(sql, params);
    return row?.key_value ?? null;
  } catch {
    return null;
  }
}

/**
 * 获取平台 Cookie（最常用的快捷方法）
 */
export async function getPlatformCookie(platform: string): Promise<string | null> {
  return getAdminSecret(platform, "cookie");
}

/**
 * 获取平台 UID / 用户 ID
 */
export async function getPlatformUid(platform: string): Promise<string | null> {
  return getAdminSecret(platform, "uid");
}

/**
 * 检查某平台是否已配置 Cookie
 */
export async function hasPlatformCookie(platform: string): Promise<boolean> {
  const val = await getPlatformCookie(platform);
  return val !== null && val.trim().length > 0;
}

/**
 * 获取所有已激活的平台密钥（用于展示配置状态）
 */
export async function getActivePlatformSecrets(): Promise<AdminSecret[]> {
  try {
    const rows = await query<(RowDataPacket & AdminSecret)[]>(
      `SELECT id, key_name, key_value, description, category, platform, is_active, verify_status 
       FROM admin_secrets WHERE is_active=1 ORDER BY platform, category`,
    );
    return rows;
  } catch {
    return [];
  }
}
