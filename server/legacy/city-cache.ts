/**
 * city-cache.ts
 * ═══════════════════════════════════════════════════════════════
 * 抖音城市编码 — 进程内缓存 + Prompt 城市提取（关键词匹配，不调 LLM）
 *
 * 用途：
 * 1. 启动后首次需要时调一次 TikHub fetch_city_list，缓存全量城市编码
 *    （394 个城市，几乎不变，TTL 24h）
 * 2. 提供 extractCityFromPrompt(prompt) — 用关键词正则把"上海一点点陆家嘴店"
 *    映射到 city_code=310000，命中后用于 fetch_hot_city_list 补充同城热点
 *
 * 设计原则：
 * - 不调 LLM：城市名 ↔ 编码是确定性映射，关键词匹配足够准确
 * - 软降级：拉取失败 / 未匹配时返回 null，主流程不受影响
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";
import { getTikHub } from "./tikhub.js";

const log = createModuleLogger("CityCache");

/* ── 类型定义 ── */

export interface CityEntry {
  cityCode: string;
  label: string;
}

/* ── 进程内缓存 ── */

const CITY_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
let cachedCityList: CityEntry[] | null = null;
let cachedAt = 0;
let inflight: Promise<CityEntry[] | null> | null = null;

/**
 * 获取完整城市编码列表（带进程内缓存）。
 */
export async function getCityList(): Promise<CityEntry[] | null> {
  const now = Date.now();
  if (cachedCityList && now - cachedAt < CITY_TTL_MS) {
    return cachedCityList;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/douyin/billboard/fetch_city_list",
        {},
      );
      const inner = (resp.payload as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const list = inner?.data;
      if (!Array.isArray(list)) {
        log.warn("fetch_city_list 返回结构异常");
        return null;
      }
      // 平铺：将所有 value/label 收集（包括子级，虽然测试时大部分 children 为空）
      const out: CityEntry[] = [];
      const visit = (item: Record<string, unknown>) => {
        const value = item.value;
        const label = item.label;
        if ((typeof value === "string" || typeof value === "number") && typeof label === "string" && label.trim()) {
          out.push({ cityCode: String(value), label: label.trim() });
        }
        const children = item.children;
        if (Array.isArray(children)) {
          for (const c of children) {
            if (c && typeof c === "object") visit(c as Record<string, unknown>);
          }
        }
      };
      for (const item of list) {
        if (item && typeof item === "object") visit(item as Record<string, unknown>);
      }
      cachedCityList = out;
      cachedAt = Date.now();
      log.info(`城市编码缓存刷新: ${out.length} 个城市`);
      return out;
    } catch (err) {
      log.warn({ err }, "fetch_city_list 失败");
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/* ── Prompt 城市提取（关键词匹配） ── */

/**
 * 从 prompt 文本中识别出城市名，返回 city_code。
 * 命中规则：
 * - 全名匹配（如"上海"完整出现在 prompt 里）
 * - 多个城市命中时，取**最早出现**的那个（优先用户先提到的）
 * - 未命中返回 null
 *
 * 注意：故意不去掉"市/省"后缀以避免误匹配（如"市场分析"），
 * 而是要求 prompt 中确切包含城市的 label 字符串。
 */
export async function extractCityFromPrompt(prompt: string): Promise<{ cityCode: string; label: string } | null> {
  if (!prompt || prompt.trim().length === 0) return null;
  const list = await getCityList();
  if (!list || list.length === 0) return null;

  let bestPos = Number.MAX_SAFE_INTEGER;
  let bestEntry: CityEntry | null = null;
  for (const entry of list) {
    if (entry.label.length < 2) continue; // 跳过单字（避免误匹）
    const pos = prompt.indexOf(entry.label);
    if (pos >= 0 && pos < bestPos) {
      bestPos = pos;
      bestEntry = entry;
    }
  }
  if (!bestEntry) return null;
  log.info(`城市提取: 「${prompt.slice(0, 40)}」 → [${bestEntry.cityCode}] ${bestEntry.label}`);
  return { cityCode: bestEntry.cityCode, label: bestEntry.label };
}

/* ── 测试辅助 ── */

export function _resetCityCacheForTest(): void {
  cachedCityList = null;
  cachedAt = 0;
  inflight = null;
}
