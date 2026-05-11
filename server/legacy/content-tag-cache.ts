/**
 * content-tag-cache.ts
 * ═══════════════════════════════════════════════════════════════
 * 抖音垂类内容标签 — 进程内缓存 + LLM 映射
 *
 * 用途：
 * 1. 启动后首次需要时调一次 TikHub fetch_content_tag，缓存全量标签树
 *    （38 顶级 + 200+ 子类，几乎不变，TTL 24h）
 * 2. 提供 mapPromptToTag(prompt) — 调豆包 LLM 把用户输入映射到
 *    {value: 顶级id, children: [{value: 子id}]} 结构，可传给互动率榜单
 *    （high_like / high_fan / high_play / low_fan）做垂类筛选
 *
 * 设计原则：
 * - 静态数据：长 TTL，缓存命中时不调用 LLM 之外的网络
 * - 失败软降级：标签拉取或映射失败时返回 null，不阻断主流程
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";
import { getTikHub } from "./tikhub.js";
import { callLLM } from "./llm-gateway.js";

const log = createModuleLogger("ContentTagCache");

/* ── 类型定义 ── */

export interface SubTag {
  value: number;
  label: string;
}
export interface TopTag {
  value: number;
  label: string;
  children: SubTag[];
}
export interface TagFilter {
  value: number;
  children?: Array<{ value: number }>;
}

/* ── 进程内缓存 ── */

const TAG_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
let cachedTagTree: TopTag[] | null = null;
let cachedAt = 0;
let inflight: Promise<TopTag[] | null> | null = null;

/**
 * 获取完整垂类标签树（带进程内缓存）。
 * 多个并发调用共享同一个 inflight Promise。
 */
export async function getContentTagTree(): Promise<TopTag[] | null> {
  const now = Date.now();
  if (cachedTagTree && now - cachedAt < TAG_TTL_MS) {
    return cachedTagTree;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/douyin/billboard/fetch_content_tag",
        {},
      );
      const inner = (resp.payload as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const list = inner?.data;
      if (!Array.isArray(list)) {
        log.warn("fetch_content_tag 返回结构异常");
        return null;
      }
      const tree: TopTag[] = list
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => {
          const children = Array.isArray(t.children) ? t.children : [];
          return {
            value: Number(t.value),
            label: String(t.label ?? ""),
            children: children
              .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
              .map((c) => ({ value: Number(c.value), label: String(c.label ?? "") })),
          };
        })
        .filter((t) => t.value > 0 && t.label);
      cachedTagTree = tree;
      cachedAt = Date.now();
      log.info(`垂类标签缓存刷新: ${tree.length} 个顶级类目`);
      return tree;
    } catch (err) {
      log.warn({ err }, "fetch_content_tag 失败");
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/* ── LLM 映射 ── */

const MAPPING_TIMEOUT_MS = 8000;

/**
 * 用 LLM 把用户 prompt 映射到 1 个顶级垂类 + 0-3 个子垂类。
 * 返回可直接传给榜单接口 tags 参数的结构；映射失败/不确定时返回 null。
 */
export async function mapPromptToTag(
  prompt: string,
  modelId: "doubao" | "gpt54" | "claude46" = "doubao",
): Promise<TagFilter | null> {
  if (!prompt || prompt.trim().length === 0) return null;
  const tree = await getContentTagTree();
  if (!tree || tree.length === 0) return null;

  // 把树压缩成给 LLM 看的紧凑文本（~3KB），避免 token 爆炸
  const treeText = tree
    .map((t) => {
      const childrenStr = t.children.map((c) => `${c.value}=${c.label}`).join(", ");
      return `[${t.value}] ${t.label}: ${childrenStr || "（无子类）"}`;
    })
    .join("\n");

  const systemPrompt = `你是抖音垂类标签匹配模块。给定用户输入和完整垂类标签树，选择**最匹配**的 1 个顶级垂类，并选择 1-3 个子垂类。

## 规则
- 必须从给定标签树中选，不能编造 value
- 优先选**子垂类**精确匹配；找不到匹配时只返回顶级垂类（children 留空）
- 用户输入若涉及多个领域，只选最相关的 1 个顶级
- 用户输入不涉及任何垂类（如"上海一点点奶茶店"这种本地商家），返回 null

## 输出（严格 JSON，不要其他文字）
匹配到：{"topValue": 顶级id, "topLabel": "顶级标签名", "children": [{"value": 子id, "label": "子标签名"}]}
没匹配：{"topValue": null}`;

  const userMessage = `用户输入：${prompt}\n\n垂类标签树：\n${treeText}`;

  try {
    const response = await Promise.race([
      callLLM({
        modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        maxTokens: 256,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), MAPPING_TIMEOUT_MS),
      ),
    ]);
    if (!response) {
      log.warn(`LLM 垂类映射超时（${MAPPING_TIMEOUT_MS}ms）`);
      return null;
    }
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      topValue?: number | null;
      topLabel?: string;
      children?: Array<{ value: number; label?: string }>;
    };
    if (!parsed.topValue || typeof parsed.topValue !== "number") {
      log.info(`垂类映射: 用户输入「${prompt.slice(0, 30)}」→ 未命中任何垂类`);
      return null;
    }
    // 校验 topValue 确实在我们的标签树里（防止 LLM 编造）
    const top = tree.find((t) => t.value === parsed.topValue);
    if (!top) {
      log.warn(`LLM 返回 topValue=${parsed.topValue} 但不在标签树里，丢弃`);
      return null;
    }
    const validChildren = (parsed.children ?? [])
      .filter((c) => c && typeof c.value === "number")
      .filter((c) => top.children.some((tc) => tc.value === c.value))
      .slice(0, 3)
      .map((c) => ({ value: c.value }));

    log.info(
      `垂类映射: 「${prompt.slice(0, 30)}」 → [${parsed.topValue}] ${top.label}` +
        (validChildren.length > 0
          ? ` + ${validChildren.length} 子类(${validChildren.map((c) => c.value).join(",")})`
          : ""),
    );
    return {
      value: parsed.topValue,
      ...(validChildren.length > 0 ? { children: validChildren } : {}),
    };
  } catch (err) {
    log.warn({ err }, "LLM 垂类映射失败");
    return null;
  }
}

/* ── 测试辅助：清空缓存（仅用于单元测试） ── */

export function _resetTagCacheForTest(): void {
  cachedTagTree = null;
  cachedAt = 0;
  inflight = null;
}
