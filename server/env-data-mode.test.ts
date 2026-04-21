/**
 * server/env-data-mode.test.ts
 * 验证 VITE_DEFAULT_DATA_MODE 环境变量已正确设置
 */
import { describe, it, expect } from "vitest";

describe("VITE_DEFAULT_DATA_MODE 环境变量", () => {
  it("应该设置为 live", () => {
    // 在服务端测试中，VITE_ 前缀的变量通过 import.meta.env 或 process.env 获取
    // 这里验证环境变量存在且为 live
    const mode = process.env.VITE_DEFAULT_DATA_MODE;
    expect(mode).toBe("live");
  });
});
