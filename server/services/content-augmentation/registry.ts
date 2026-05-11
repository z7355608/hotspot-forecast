import { createModuleLogger } from "../../legacy/logger.js";
import type { ExtractedContent } from "../../legacy/prediction-helpers.js";

const log = createModuleLogger("ContentAugmenter");

/**
 * 旁路内容注入器(augmenter)框架。
 *
 * 设计本意:**不破坏主流程**,在 supportingContents 形成后追加额外候选内容
 * (例如 X 平台 AI 科技博主的推文),让 LLM 在打分阶段消化更多信号。
 *
 * 关键不变量:
 * - 注册表为空 → augmentContents 等同 identity 函数(0 行为变化)
 * - 任何 augmenter 失败/超时 → fail-soft,主流程不感知
 * - augmenter 不调用 LLM,不走 llm-gateway(LLM 预算 0 增量)
 *
 * 详见 docs/decisions/0005-x-augmenter-bootstrap.md。
 */

export interface AugmenterContext {
  /** 来自 intent-agent 的行业字段。可能为空字符串或不存在。 */
  industry: string | null;
  /** 主流程使用的 effectiveSeedTopic。 */
  seedTopic: string;
  /** 用户原始 prompt。 */
  prompt: string | null;
  /** 主流程 traceId,用于日志关联。 */
  traceId: string | null;
}

export interface ContentAugmenter {
  /** 注册名,用于日志 / 度量。 */
  name: string;
  /** 同步判断;抛错视为 false。 */
  shouldRun(ctx: AugmenterContext): boolean;
  /** 异步执行,返回追加的 contents。失败请抛错,框架会兜底。 */
  run(ctx: AugmenterContext): Promise<ExtractedContent[]>;
}

const augmenters: ContentAugmenter[] = [];
const DEFAULT_TIMEOUT_MS = 5_000;
let timeoutMs = DEFAULT_TIMEOUT_MS;

export function registerAugmenter(a: ContentAugmenter): void {
  augmenters.push(a);
  log.info({ augmenter: a.name, total: augmenters.length }, "augmenter registered");
}

export function setAugmenterTimeoutMs(ms: number): void {
  timeoutMs = ms > 0 ? ms : DEFAULT_TIMEOUT_MS;
}

export function listAugmenters(): readonly string[] {
  return augmenters.map((a) => a.name);
}

/**
 * 把已注册 augmenter 的输出追加到 existing。
 * 注册表为空 → 直接返回 existing(同一引用)。
 */
export async function augmentContents(
  existing: ExtractedContent[],
  ctx: AugmenterContext,
): Promise<ExtractedContent[]> {
  if (augmenters.length === 0) return existing;

  const candidates = augmenters.filter((a) => {
    try {
      return a.shouldRun(ctx);
    } catch (err) {
      log.warn({ err, augmenter: a.name }, "augmenter shouldRun threw");
      return false;
    }
  });
  if (candidates.length === 0) return existing;

  const results = await Promise.allSettled(
    candidates.map((a) => withTimeout(a.run(ctx), timeoutMs, a.name)),
  );

  const additions: ExtractedContent[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = candidates[i].name;
    if (r.status === "fulfilled") {
      additions.push(...r.value);
      log.info({ augmenter: name, added: r.value.length }, "augmenter ok");
    } else {
      log.warn({ augmenter: name, err: r.reason }, "augmenter failed (fail-soft)");
    }
  }
  if (additions.length === 0) return existing;
  return [...existing, ...additions];
}

async function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`augmenter ${name} timeout after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 仅供测试用。生产代码不要调。 */
export function _resetForTest(): void {
  augmenters.length = 0;
  timeoutMs = DEFAULT_TIMEOUT_MS;
}
