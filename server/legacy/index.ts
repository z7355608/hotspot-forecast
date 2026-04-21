import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LegacyIndex");
import { startApiServer } from "./http-server.js";
import { startScheduler } from "./monitor-scheduler.js";

// 启动 HTTP 服务器
startApiServer();

// 自动启动监控调度器（daily/every_72h/weekly cron 任务）
try {
  startScheduler();
  log.info("监控调度器已自动启动");
} catch (err) {
  log.error({ err: err }, "调度器启动失败（不影响主服务）");
};
