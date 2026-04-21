/**
 * 共享 CORS 工具模块
 *
 * 生产环境：只允许来自实际域名的请求
 * 开发环境：允许 localhost 和 manus.computer 域名
 */

import type { IncomingMessage, ServerResponse } from "http";

const isProduction = process.env.NODE_ENV === "production";

/**
 * 允许的 Origin 列表（支持通配符匹配）
 * - 开发环境：允许 localhost 和 manus.computer 域名
 * - 生产环境：只允许 manus.space 域名和自定义域名
 */
function getAllowedOriginPatterns(): RegExp[] {
  const patterns: RegExp[] = [
    // Manus 平台域名
    /^https?:\/\/[a-z0-9-]+\.manus\.space$/,
    /^https?:\/\/[a-z0-9.-]+\.manus\.computer$/,
  ];

  if (!isProduction) {
    patterns.push(
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    );
  }

  // 支持通过环境变量添加额外的允许域名（逗号分隔）
  const extraOrigins = process.env.ALLOWED_ORIGINS;
  if (extraOrigins) {
    extraOrigins.split(",").map(o => o.trim()).filter(Boolean).forEach(origin => {
      // 转义特殊字符后作为正则
      const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push(new RegExp(`^${escaped}$`));
    });
  }

  return patterns;
}

const allowedPatterns = getAllowedOriginPatterns();

/**
 * 检查 origin 是否在允许列表中
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedPatterns.some(pattern => pattern.test(origin));
}

/**
 * 根据请求的 Origin 返回合适的 CORS origin 值
 * - 如果 origin 在允许列表中，返回该 origin（反射模式）
 * - 否则返回 null（不设置 CORS 头）
 */
export function getCorsOrigin(req: IncomingMessage): string | null {
  const origin = req.headers.origin as string | undefined;
  if (origin && isOriginAllowed(origin)) {
    return origin;
  }
  return null;
}

/**
 * 为 response 设置 CORS 头
 * 用于替换所有 sendJson 中的硬编码 Access-Control-Allow-Origin: *
 */
export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  methods = "GET,POST,OPTIONS",
  headers = "Content-Type",
) {
  const origin = getCorsOrigin(req);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", headers);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Vary", "Origin");
  }
}

/**
 * 生成 CORS 头对象（用于 writeHead 场景）
 */
export function getCorsHeadersObj(
  req: IncomingMessage,
): Record<string, string> {
  const origin = getCorsOrigin(req);
  if (origin) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    };
  }
  return {};
}
