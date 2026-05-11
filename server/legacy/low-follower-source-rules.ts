/**
 * server/legacy/low-follower-source-rules.ts
 * ═══════════════════════════════════════════════════════════════
 * 低粉爆款样本 source × 字段可用性声明 + WHERE 构造
 *
 * 背景:
 * router 的"valid sample"硬过滤(`video_comments > 0 AND video_collects > 0`)
 * 是 ADR-0006 时代为 seed_topic 管线写的"低质素材剔除"语义,但部分 source 上不适用:
 * - billboard 接口 payload 不返 comment_cnt / collect_cnt(ADR-0007 changelog §6),
 *   需要 backfill-billboard-stats 后才有;首次入库 → backfill 之间是 0,会被全杀。
 *
 * 之前的修复方式是在 router WHERE 里 hardcode `(source = 'billboard' OR ...)`,
 * 每加一个 source 都得改 router,不可持续。本文件把"哪个 source 提供哪些字段"
 * 集中声明,router 只构造而不判断,新增 source 只动这一处。
 *
 * 配套 ADR:0006(seed_topic 标 expired) / 0007(billboard) / 0008(search)
 * ═══════════════════════════════════════════════════════════════
 */

import { buildCommercialQualityConditions } from "./low-follower-commercial-quality";

export type LowFollowerSource = "seed_topic" | "billboard" | "search";

export interface SourceFieldSpec {
  /** 该 source 入库的样本 `video_comments` 是否真实可用(false 表示首次入库时 0,需要后续 backfill 才有) */
  hasCommentCount: boolean;
  /** 同上 `video_collects` */
  hasCollectCount: boolean;
}

export const SOURCE_FIELD_SPECS: Record<LowFollowerSource, SourceFieldSpec> = {
  // ADR-0006:用户输入种子词检索,字段全
  seed_topic: { hasCommentCount: true, hasCollectCount: true },
  // ADR-0007:fetch_hot_total_low_fan_list payload 只返 like/play/fans,需 backfill 才补
  billboard: { hasCommentCount: false, hasCollectCount: false },
  // ADR-0008:L2 fetch_one_video_v2 已经在管线里跑了,入库时字段已真实
  search: { hasCommentCount: true, hasCollectCount: true },
};

/**
 * 返回 router 用于"valid sample"过滤的 WHERE 条件数组(可继续 push 其他动态条件)。
 *
 * 包含:
 *   1. author_followers > 0(所有 source 都需)
 *   2. video_comments / video_collects 硬过滤(仅对 hasCommentCount/CollectCount=true 的 source)
 *   3. viral_score_trend != 'expired'(ADR-0006 §Step C.5)
 *
 * 不包含:platform / search / contentForm 等动态 filter——那些由调用方按请求参数构造。
 */
export function buildValidSampleConditions(): string[] {
  const exemptComment = (Object.entries(SOURCE_FIELD_SPECS) as Array<[LowFollowerSource, SourceFieldSpec]>)
    .filter(([, s]) => !s.hasCommentCount)
    .map(([src]) => `'${src}'`);
  const exemptCollect = (Object.entries(SOURCE_FIELD_SPECS) as Array<[LowFollowerSource, SourceFieldSpec]>)
    .filter(([, s]) => !s.hasCollectCount)
    .map(([src]) => `'${src}'`);

  const conditions: string[] = ["author_followers > 0"];

  if (exemptComment.length > 0) {
    conditions.push(
      `(source IN (${exemptComment.join(",")}) OR (video_comments IS NOT NULL AND video_comments > 0))`,
    );
  } else {
    conditions.push("video_comments IS NOT NULL AND video_comments > 0");
  }

  if (exemptCollect.length > 0) {
    conditions.push(
      `(source IN (${exemptCollect.join(",")}) OR (video_collects IS NOT NULL AND video_collects > 0))`,
    );
  } else {
    conditions.push("video_collects IS NOT NULL AND video_collects > 0");
  }

  conditions.push("viral_score_trend != 'expired'");
  conditions.push(...buildCommercialQualityConditions());
  return conditions;
}

/** Convenience:把数组拼成 SQL 子句(stats 等只需单个 string 的查询用) */
export function buildValidSampleClause(): string {
  return buildValidSampleConditions().join(" AND ");
}
