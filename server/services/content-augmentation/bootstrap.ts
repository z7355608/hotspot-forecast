import { ENV } from "../../_core/env.js";
import { createModuleLogger } from "../../legacy/logger.js";
import { setAugmenterTimeoutMs } from "./registry.js";

const log = createModuleLogger("AugmenterBootstrap");

/**
 * 启动期动态载入 augmenter。
 *
 * 设计本意:
 * - augmenter 模块**默认不被 import**——0 网络/0 内存/0 副作用
 * - 由 env 开关决定是否动态 import + register
 * - 任何 augmenter 启动失败,都不阻断 server 启动
 *
 * 在 server/_core/index.ts 的 startServer() 早期调用一次。
 */

export async function bootstrapAugmenters(): Promise<void> {
  setAugmenterTimeoutMs(ENV.augmenterTimeoutMs);

  if (ENV.xAugmenterEnabled) {
    try {
      const mod = await import("./providers/x-tech-source.js");
      mod.register();
      log.info("x-tech-source augmenter loaded");
    } catch (err) {
      log.error({ err }, "failed to load x-tech-source augmenter");
    }
  }
}
