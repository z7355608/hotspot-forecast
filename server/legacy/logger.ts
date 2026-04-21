/**
 * 结构化日志模块
 *
 * 使用 pino 替代 console.log/error/warn，提供：
 * - 统一的日志级别控制（trace/debug/info/warn/error/fatal）
 * - JSON 格式输出（生产环境）
 * - 可读格式输出（开发环境，通过 pino-pretty）
 * - 子日志器支持（按模块分类）
 *
 * 使用方式：
 *   import { logger } from "./logger.js";
 *   const log = logger.child({ module: "MyModule" });
 *   log.info({ userId, action }, "用户执行了操作");
 *   log.error({ err }, "处理失败");
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

/**
 * 根日志器
 *
 * 开发环境：使用 pino-pretty 格式化输出，带颜色和时间戳
 * 生产环境：JSON 格式输出，适合日志收集系统（ELK/Datadog/CloudWatch）
 */
export const logger = pino({
  level: logLevel,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * 创建模块级子日志器的快捷方式
 *
 * @example
 *   const log = createModuleLogger("Scheduler");
 *   log.info("调度器已启动");
 *   log.error({ err, taskId }, "任务执行失败");
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}

/**
 * 请求级日志器（用于 HTTP 请求追踪）
 *
 * @example
 *   const reqLog = createRequestLogger("api", requestId, userId);
 *   reqLog.info({ path: "/api/predict" }, "请求开始");
 */
export function createRequestLogger(module: string, requestId?: string, userId?: string) {
  return logger.child({
    module,
    ...(requestId ? { requestId } : {}),
    ...(userId ? { userId } : {}),
  });
}
