/**
 * server/low-follower-cleaner.ts
 * ═══════════════════════════════════════════════════════════════
 * TikHub 数据清洗层 — 模块四
 *
 * 功能：
 * 1. TikHub 原始 API 响应 → RawContentItem / RawAccountItem 标准化
 * 2. 调用 low-follower-algorithm.ts 执行算法判定
 * 3. 将 LowFollowerSample 持久化到 MySQL（low_follower_samples 表）
 * 4. 记录检测任务（low_follower_detection_runs 表）
 * 5. 支持幂等写入（ON DUPLICATE KEY UPDATE）
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LowFollowerCleaner");
import { randomUUID } from "node:crypto";
import { query, execute } from "./database.js";
import type { RowDataPacket } from "./database.js";
import { getTikHub } from "./tikhub.js";
import {
  runLowFollowerAlgorithm,
  fromExtractedContent,
  accountsFromExtractedContents,
  toLowFollowerEvidenceItem,
  type RawContentItem,
  type RawAccountItem,
  type LowFollowerSample,
  type LowFollowerAlgorithmResult,
  type LowFollowerAlgorithmConfig,
} from "./low-follower-algorithm.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** TikHub 视频/笔记原始数据（通用字段提取） */
export interface TikHubRawRecord {
  // 内容标识
  aweme_id?: string;
  note_id?: string;
  id?: string;
  // 标题/描述
  desc?: string;
  title?: string;
  // 统计数据
  statistics?: {
    play_count?: number;
    view_count?: number;
    digg_count?: number;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
    save_count?: number;
  };
  // 作者信息
  author?: {
    uid?: string;
    unique_id?: string;
    sec_uid?: string;
    nickname?: string;
    follower_count?: number;
    fans_count?: number;
  };
  // 时间
  create_time?: number;
  publish_time?: number;
  // 标签
  text_extra?: Array<{ hashtag_name?: string }>;
  tag_list?: Array<{ tag_name?: string }>;
  // 平台标识
  platform?: string;
  // 内容链接
  share_url?: string;
  video?: { play_addr?: { url_list?: string[] } };
  // 封面
  video_cover?: { url_list?: string[] };
  cover?: { url_list?: string[] };
}

/** 清洗任务输入 */
export interface CleanAndPersistInput {
  /** TikHub 原始记录列表 */
  rawRecords: TikHubRawRecord[];
  /** 平台标识 */
  platform: "douyin" | "xiaohongshu" | "kuaishou" | "bilibili";
  /** 种子话题 */
  seedTopic: string;
  /** 赛道名称（可选） */
  industryName?: string;
  /** 算法配置覆盖（可选） */
  algorithmConfig?: Partial<LowFollowerAlgorithmConfig>;
  /** 是否持久化到 MySQL（默认 true） */
  persist?: boolean;
}

/** 清洗任务输出 */
export interface CleanAndPersistResult {
  /** 检测任务 ID */
  runId: string;
  /** 算法计算结果 */
  algorithmResult: LowFollowerAlgorithmResult;
  /** 持久化样本数 */
  persistedCount: number;
  /** 前端展示格式的样本列表 */
  evidenceItems: ReturnType<typeof toLowFollowerEvidenceItem>[];
  /** 是否持久化成功 */
  persistSuccess: boolean;
  /** 错误信息（如有） */
  error?: string;
}

// ─────────────────────────────────────────────
// TikHub 原始数据清洗函数
// ─────────────────────────────────────────────

/** 安全获取数字字段 */
function getNum(obj: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && !isNaN(val) && val >= 0) return val;
    if (typeof val === "string") {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) return n;
    }
  }
  return null;
}

/** 将 TikHub 原始记录清洗为 RawContentItem */
export function cleanTikHubRecord(
  record: TikHubRawRecord,
  platform: "douyin" | "xiaohongshu" | "kuaishou" | "bilibili",
): RawContentItem | null {
  // 提取内容 ID
  const contentId = record.aweme_id ?? record.note_id ?? record.id;
  if (!contentId) return null;

  // 提取作者信息
  const author = record.author ?? {};
  const authorId = author.uid ?? author.unique_id ?? contentId;
  const authorName = author.nickname ?? "未知作者";
  const followerCount = getNum(author as Record<string, unknown>, [
    "follower_count", "fans_count",
  ]);

  // 提取统计数据
  const stats = record.statistics ?? {};
  const viewCount = getNum(stats as Record<string, unknown>, [
    "play_count", "view_count",
  ]);
  const likeCount = getNum(stats as Record<string, unknown>, [
    "digg_count", "like_count",
  ]);
  const commentCount = getNum(stats as Record<string, unknown>, ["comment_count"]);
  const shareCount = getNum(stats as Record<string, unknown>, ["share_count"]);
  const saveCount = getNum(stats as Record<string, unknown>, [
    "collect_count", "save_count",
  ]);

  // 提取标题
  const title = record.desc ?? record.title ?? "（无标题）";

  // 提取发布时间
  let publishedAt: string | null = null;
  const ts = record.create_time ?? record.publish_time;
  if (ts && ts > 0) {
    publishedAt = new Date(ts * 1000).toISOString();
  }

  // 提取标签
  const tags: string[] = [];
  if (record.text_extra) {
    for (const t of record.text_extra) {
      if (t.hashtag_name) tags.push(t.hashtag_name);
    }
  }
  if (record.tag_list) {
    for (const t of record.tag_list) {
      if (t.tag_name) tags.push(t.tag_name);
    }
  }

  // 提取内容 URL
  const contentUrl = record.share_url ??
    record.video?.play_addr?.url_list?.[0] ?? null;

  // 提取封面 URL
  const coverUrl = record.video_cover?.url_list?.[0] ??
    record.cover?.url_list?.[0] ?? null;

  const rawContent: RawContentItem = {
    contentId,
    authorId,
    authorName,
    title: title.slice(0, 500),
    platform,
    viewCount,
    likeCount,
    commentCount,
    shareCount,
    saveCount,
    publishedAt,
    contentUrl,
    coverUrl,
    tags: tags.slice(0, 20),
  };

  // 将粉丝量和 sec_uid 附加到内容对象（用于 accountsFromExtractedContents 和粉丝数补充获取）
  const extended = rawContent as RawContentItem & { _followerCount?: number | null; _secUid?: string | null };
  extended._followerCount = followerCount;
  extended._secUid = author.sec_uid ?? null;

  return rawContent;
}

/** 从清洗后的内容列表中提取账号信息 */
function extractAccountsFromCleaned(
  items: Array<RawContentItem & { _followerCount?: number | null }>,
  platform: "douyin" | "xiaohongshu" | "kuaishou" | "bilibili",
): RawAccountItem[] {
  const seen = new Set<string>();
  const accounts: RawAccountItem[] = [];
  for (const item of items) {
    if (seen.has(item.authorId)) continue;
    seen.add(item.authorId);
    const fc = (item as RawContentItem & { _followerCount?: number | null })._followerCount;
    if (fc !== null && fc !== undefined) {
      accounts.push({
        accountId: item.authorId,
        followerCount: fc,
        platform,
      });
    }
  }
  return accounts;
}

// ─────────────────────────────────────────────
// MySQL 持久化函数
// ─────────────────────────────────────────────

/** 持久化单个低粉样本（幂等，ON DUPLICATE KEY UPDATE） */
export async function persistSample(
  sample: LowFollowerSample,
  runId: string,
  seedTopic: string,
  industryName: string | undefined,
  p75Benchmark: number,
  dynamicFollowerFloor: number,
): Promise<void> {
  // 严格校验：粉丝数必须有效（不允许为 0）
  if (!sample.followerCount || sample.followerCount <= 0) {
    throw new Error(`拒绝入库：样本 ${sample.contentId} 粉丝数为 ${sample.followerCount}，不允许为 0 或无效值`);
  }
  const sampleId = `lf_${sample.contentId}`;
  const publishedAtDate = sample.publishedAt ? new Date(sample.publishedAt) : null;

  await execute(
    `INSERT INTO low_follower_samples (
      id, run_id, platform_id, author_id, author_nickname, author_followers,
      video_id, video_title, video_cover, video_url, video_published_at,
      video_views, video_likes, video_comments, video_shares, video_collects,
      follower_view_ratio, engagement_rate, hashtags,
      weighted_interaction, fan_efficiency_ratio, viral_score, viral_score_trend, is_strict_hit,
      seed_topic, created_at, last_refreshed_at, score_updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, 'new', ?,
      ?, NOW(), NOW(), NOW()
    )
    ON DUPLICATE KEY UPDATE
      author_id = COALESCE(NULLIF(VALUES(author_id), ''), author_id),
      author_nickname = COALESCE(NULLIF(VALUES(author_nickname), ''), author_nickname),
      author_followers = CASE WHEN VALUES(author_followers) > 0 THEN VALUES(author_followers) ELSE author_followers END,
      video_title = COALESCE(NULLIF(VALUES(video_title), ''), video_title),
      video_cover = COALESCE(NULLIF(VALUES(video_cover), ''), video_cover),
      video_url = COALESCE(NULLIF(VALUES(video_url), ''), video_url),
      video_published_at = COALESCE(VALUES(video_published_at), video_published_at),
      viral_score = VALUES(viral_score),
      is_strict_hit = VALUES(is_strict_hit),
      engagement_rate = VALUES(engagement_rate),
      follower_view_ratio = VALUES(follower_view_ratio),
      weighted_interaction = VALUES(weighted_interaction),
      fan_efficiency_ratio = VALUES(fan_efficiency_ratio),
      video_likes = VALUES(video_likes),
      video_comments = VALUES(video_comments),
      video_shares = VALUES(video_shares),
      video_collects = VALUES(video_collects),
      video_views = VALUES(video_views),
      hashtags = COALESCE(NULLIF(VALUES(hashtags), '[]'), hashtags),
      seed_topic = COALESCE(NULLIF(VALUES(seed_topic), ''), seed_topic),
      last_refreshed_at = NOW(),
      score_updated_at = NOW()`,
    [
      sampleId,
      runId,
      sample.platform,
      sample.authorId,
      sample.authorName,
      sample.followerCount,
      sample.contentId,
      sample.title.slice(0, 500),
      sample.coverUrl,
      sample.contentUrl,
      publishedAtDate,
      sample.viewCount,
      sample.likeCount,
      sample.commentCount,
      sample.shareCount,
      sample.saveCount,
      sample.viewToFollowerRatio,
      sample.engagementRate,
      JSON.stringify(sample.tags),
      sample.weightedInteraction,
      sample.fanEfficiencyRatio,
      sample.anomalyScore, // viral_score
      sample.isStrictAnomaly ? 1 : 0,
      seedTopic,
    ],
  );
}

/** 创建检测任务记录 */
async function createDetectionRun(
  runId: string,
  input: CleanAndPersistInput,
): Promise<void> {
  await execute(
    `INSERT INTO low_follower_detection_runs (
      run_id, seed_topic, industry_name, platforms,
      follower_ceiling, min_view_count, benchmark_percentile, recency_days,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
    [
      runId,
      input.seedTopic,
      input.industryName ?? null,
      JSON.stringify(input.platform ? [input.platform] : []),
      input.algorithmConfig?.followerCeiling ?? 10000,
      0, /* minViewCount removed in V2, kept for DB column compat */
      input.algorithmConfig?.benchmarkPercentile ?? 0.75,
      input.algorithmConfig?.recencyDays ?? 30,
    ],
  );
}

/** 更新检测任务记录（完成） */
async function completeDetectionRun(
  runId: string,
  result: LowFollowerAlgorithmResult,
  persistedCount: number,
): Promise<void> {
  await execute(
    `UPDATE low_follower_detection_runs SET
      total_content_count = ?,
      anomaly_hit_count = ?,
      low_follower_anomaly_ratio = ?,
      p75_benchmark = ?,
      dynamic_follower_floor = ?,
      sample_count_persisted = ?,
      compute_note = ?,
      status = 'completed',
      completed_at = NOW()
    WHERE run_id = ?`,
    [
      result.totalContentCount,
      result.anomalyHitCount,
      result.lowFollowerAnomalyRatio,
      result.p75InteractionBenchmark,
      result.dynamicFollowerFloor,
      persistedCount,
      result.computeNote,
      runId,
    ],
  );
}

/** 标记检测任务失败 */
async function failDetectionRun(runId: string, error: string): Promise<void> {
  await execute(
    `UPDATE low_follower_detection_runs SET
      status = 'failed', error_message = ?, completed_at = NOW()
    WHERE run_id = ?`,
    [error.slice(0, 1000), runId],
  );
}

// ─────────────────────────────────────────────
// 粉丝数 + 封面图补充获取
// ─────────────────────────────────────────────

type ExtendedContent = RawContentItem & { _followerCount?: number | null; _secUid?: string | null };

/**
 * 对粉丝数为 0/null 的记录，通过 TikHub 用户详情 API 补充获取粉丝数和封面图。
 * 策略：
 * 1. 优先通过 sec_uid 调用 handler_user_profile_v4
 * 2. 备选通过 uid 调用 handler_user_profile_v3
 * 3. 最后通过 fetch_one_video 获取视频详情（同时补充封面图）
 * 每批最多补充 20 条，防止 TikHub 限流
 */
async function enrichMissingFollowerCounts(
  contents: ExtendedContent[],
  platform: string,
): Promise<void> {
  if (platform !== "douyin") return; // 目前只支持抖音

  // 找出粉丝数为 0/null 的记录，按 authorId 去重
  const needEnrich = new Map<string, ExtendedContent[]>();
  for (const c of contents) {
    if (!c._followerCount || c._followerCount <= 0) {
      const existing = needEnrich.get(c.authorId) ?? [];
      existing.push(c);
      needEnrich.set(c.authorId, existing);
    }
  }

  if (needEnrich.size === 0) return;
  log.info(`需要补充粉丝数的作者: ${needEnrich.size} 个`);

  // 最多补充 20 个作者
  const entries = Array.from(needEnrich.entries()).slice(0, 20);

  const results = await Promise.allSettled(
    entries.map(async ([authorId, authorContents]) => {
      const sample = authorContents[0];
      let followerCount: number | null = null;
      let coverUrl: string | null = null;

      try {
        // 策略 1：通过 sec_uid 调用 handler_user_profile_v4
        if (sample._secUid) {
          const resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/web/handler_user_profile_v4",
            { sec_user_id: sample._secUid },
            8000,
          );
          if (resp.payload) {
            const d = (resp.payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
            const userInfo = (d?.user as Record<string, unknown>) ?? (d?.user_info as Record<string, unknown>);
            if (userInfo) {
              followerCount =
                typeof userInfo.mplatform_followers_count === "number" ? userInfo.mplatform_followers_count :
                typeof userInfo.follower_count === "number" ? userInfo.follower_count : null;
            }
          }
        }

        // 策略 2：通过 uid 调用 handler_user_profile_v3
        if ((!followerCount || followerCount <= 0) && authorId && /^\d+$/.test(authorId)) {
          const resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/web/handler_user_profile_v3",
            { uid: authorId },
            8000,
          );
          if (resp.payload) {
            const d = (resp.payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
            const userInfo = (d?.user as Record<string, unknown>) ?? (d?.user_info as Record<string, unknown>);
            if (userInfo) {
              followerCount =
                typeof userInfo.mplatform_followers_count === "number" ? userInfo.mplatform_followers_count :
                typeof userInfo.follower_count === "number" ? userInfo.follower_count : null;
            }
          }
        }

        // 策略 3：通过 fetch_one_video 获取视频详情（同时补充封面图）
        if ((!followerCount || followerCount <= 0) && sample.contentId) {
          const resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/web/fetch_one_video",
            { aweme_id: sample.contentId },
            8000,
          );
          if (resp) {
            const data = resp as unknown as Record<string, unknown>;
            const awemeDetail = extractNestedValue(data, "aweme_detail") as Record<string, unknown> | null;
            if (awemeDetail) {
              const author = awemeDetail.author as Record<string, unknown> | undefined;
              if (author) {
                const fc = typeof author.follower_count === "number" ? author.follower_count :
                  typeof author.fans_count === "number" ? (author.fans_count as number) : null;
                if (fc && fc > 0) followerCount = fc;
              }
              // 补充封面图
              const videoCover = awemeDetail.video as Record<string, unknown> | undefined;
              const coverObj = videoCover?.cover as Record<string, unknown> | undefined;
              const urlList = coverObj?.url_list as string[] | undefined;
              if (urlList?.[0]) coverUrl = urlList[0];
              // 备选封面路径
              if (!coverUrl) {
                const dynamicCover = videoCover?.dynamic_cover as Record<string, unknown> | undefined;
                const dcUrlList = dynamicCover?.url_list as string[] | undefined;
                if (dcUrlList?.[0]) coverUrl = dcUrlList[0];
              }
            }
          }
        }

        return { authorId, followerCount, coverUrl };
      } catch (err) {
        log.warn({ err: err }, `补充获取失败 (${authorId})`);
        return { authorId, followerCount: null, coverUrl: null };
      }
    }),
  );

  // 回填粉丝数和封面图
  let enrichedCount = 0;
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const { authorId, followerCount, coverUrl } = result.value;
    if (!followerCount || followerCount <= 0) continue;

    const authorContents = needEnrich.get(authorId);
    if (!authorContents) continue;

    for (const c of authorContents) {
      c._followerCount = followerCount;
      if (coverUrl && !c.coverUrl) {
        c.coverUrl = coverUrl;
      }
    }
    enrichedCount++;
  }

  log.info(`粉丝数补充完成: ${enrichedCount}/${needEnrich.size} 个作者成功`);
}

/** 递归查找嵌套对象中的指定 key */
function extractNestedValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  if (key in record) return record[key];
  for (const val of Object.values(record)) {
    if (val && typeof val === "object") {
      const found = extractNestedValue(val, key);
      if (found !== null) return found;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 主入口：清洗 + 算法 + 持久化
// ─────────────────────────────────────────────

/**
 * 核心流程：
 * 1. 清洗 TikHub 原始记录 → RawContentItem[]
 * 2. 提取账号信息 → RawAccountItem[]
 * 3. 运行低粉爆款算法
 * 4. 持久化样本到 MySQL
 * 5. 返回前端展示格式
 */
export async function cleanAndPersistLowFollowerSamples(
  input: CleanAndPersistInput,
): Promise<CleanAndPersistResult> {
  const runId = `lfrun_${randomUUID()}`;
  const shouldPersist = input.persist !== false;

  // Step 1: 清洗原始数据
  const cleanedContents: Array<RawContentItem & { _followerCount?: number | null }> = [];
  for (const record of input.rawRecords) {
    const cleaned = cleanTikHubRecord(record, input.platform);
    if (cleaned) {
      cleanedContents.push(cleaned as RawContentItem & { _followerCount?: number | null });
    }
  }

  // Step 2: 补充获取粉丝数和封面图（对粉丝数为 0/null 的记录，通过 TikHub 用户详情 API 补充）
  await enrichMissingFollowerCounts(cleanedContents, input.platform);

  // Step 3: 提取账号信息
  const accounts = extractAccountsFromCleaned(cleanedContents, input.platform);

  // Step 4: 运行算法
  const algorithmResult = runLowFollowerAlgorithm(
    cleanedContents,
    accounts,
    input.algorithmConfig,
  );

  // Step 4: 持久化
  let persistedCount = 0;
  let persistSuccess = true;
  let persistError: string | undefined;

  if (shouldPersist) {
    try {
      // 创建检测任务记录
      await createDetectionRun(runId, input);

      // 批量持久化样本
      for (const sample of algorithmResult.samples) {
        try {
          await persistSample(
            sample,
            runId,
            input.seedTopic,
            input.industryName,
            algorithmResult.p75InteractionBenchmark,
            algorithmResult.dynamicFollowerFloor,
          );
          persistedCount++;
        } catch (sampleErr) {
          log.warn({ err: sampleErr }, `样本持久化失败 ${sample.contentId}`);
        }
      }

      // 完成任务记录
      await completeDetectionRun(runId, algorithmResult, persistedCount);
    } catch (err) {
      persistSuccess = false;
      persistError = err instanceof Error ? err.message : String(err);
      log.error({ err: err }, "持久化失败");
      try {
        await failDetectionRun(runId, persistError);
      } catch (_) {
        // 忽略记录失败错误
      }
    }
  }

  // Step 5: 转换为前端展示格式
  const evidenceItems = algorithmResult.samples
    .filter((s) => s.isStrictAnomaly) // 优先返回严格命中
    .concat(algorithmResult.samples.filter((s) => !s.isStrictAnomaly))
    .slice(0, 8) // 最多返回 8 条
    .map(toLowFollowerEvidenceItem);

  return {
    runId,
    algorithmResult,
    persistedCount,
    evidenceItems,
    persistSuccess,
    error: persistError,
  };
}

// ─────────────────────────────────────────────
// 从 live-predictions.ts 的 ExtractedContent 格式调用
// ─────────────────────────────────────────────

/**
 * 直接从 live-predictions.ts 的 ExtractedContent 格式执行低粉爆款算法
 * 不需要 TikHub 原始数据，直接使用已提取的内容
 */
export function runAlgorithmFromExtractedContents(
  extractedContents: Array<{
    contentId: string;
    title: string;
    authorName: string;
    platform: string;
    publishedAt: string;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    shareCount: number | null;
    keywordTokens: string[];
    authorFollowerCount?: number | null;
    authorId?: string;
  }>,
  config?: Partial<LowFollowerAlgorithmConfig>,
): LowFollowerAlgorithmResult {
  const rawContents = extractedContents.map(fromExtractedContent);
  const accounts = accountsFromExtractedContents(extractedContents);
  return runLowFollowerAlgorithm(rawContents, accounts, config);
}

// ─────────────────────────────────────────────
// 数据库查询函数
// ─────────────────────────────────────────────

/** 查询指定话题的历史低粉样本 */
export async function queryLowFollowerSamples(params: {
  seedTopic?: string;
  industryName?: string;
  platform?: string;
  isStrictOnly?: boolean;
  limit?: number;
  minAnomalyScore?: number;
}): Promise<LowFollowerSample[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.seedTopic) {
    conditions.push("seed_topic = ?");
    values.push(params.seedTopic);
  }
  if (params.industryName) {
    conditions.push("industry_name = ?");
    values.push(params.industryName);
  }
  if (params.platform) {
    conditions.push("platform_id = ?");
    values.push(params.platform);
  }
  if (params.isStrictOnly) {
    conditions.push("is_strict_hit = 1");
  }
  if (params.minAnomalyScore !== undefined) {
    conditions.push("viral_score >= ?");
    values.push(params.minAnomalyScore);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 20;

  const rows = await query<RowDataPacket[]>(
    `SELECT * FROM low_follower_samples ${where}
     ORDER BY is_strict_hit DESC, viral_score DESC
     LIMIT ${limit}`,
    values,
  );

  return rows.map((r) => rowToSample(r as Record<string, unknown>));
}

/** 查询话题的低粉爆款比例统计 */
export async function queryAnomalyRatioStats(seedTopic: string): Promise<{
  totalRuns: number;
  avgAnomalyRatio: number;
  latestAnomalyRatio: number;
  totalSamples: number;
  strictSamples: number;
}> {
  const runRows = await query<RowDataPacket[]>(
    `SELECT
       COUNT(*) as total_runs,
       AVG(low_follower_anomaly_ratio) as avg_ratio,
       MAX(low_follower_anomaly_ratio) as latest_ratio
     FROM low_follower_detection_runs
     WHERE seed_topic = ? AND status = 'completed'`,
    [seedTopic],
  );

  const sampleRows = await query<RowDataPacket[]>(
    `SELECT
       COUNT(*) as total_samples,
       SUM(is_strict_hit) as strict_samples
     FROM low_follower_samples
     WHERE seed_topic = ?`,
    [seedTopic],
  );

  const run = runRows[0] ?? {};
  const sample = sampleRows[0] ?? {};

  return {
    totalRuns: Number(run.total_runs ?? 0),
    avgAnomalyRatio: Number(run.avg_ratio ?? 0),
    latestAnomalyRatio: Number(run.latest_ratio ?? 0),
    totalSamples: Number(sample.total_samples ?? 0),
    strictSamples: Number(sample.strict_samples ?? 0),
  };
}

/** 将数据库行转换为 LowFollowerSample */
function rowToSample(row: Record<string, unknown>): LowFollowerSample {
  const likeCount = Number(row.video_likes ?? 0);
  const commentCount = Number(row.video_comments ?? 0);
  const shareCount = Number(row.video_shares ?? 0);
  const saveCount = Number(row.video_collects ?? 0);
  const interactionCount = likeCount + commentCount + shareCount + saveCount;
  return {
    contentId: String(row.video_id ?? ""),
    authorId: String(row.author_id ?? ""),
    authorName: String(row.author_nickname ?? ""),
    title: String(row.video_title ?? ""),
    platform: String(row.platform_id ?? "douyin"),
    followerCount: Number(row.author_followers ?? 0),
    viewCount: Number(row.video_views ?? 0),
    interactionCount,
    weightedInteraction: Number(row.weighted_interaction ?? 0),
    fanEfficiencyRatio: Number(row.fan_efficiency_ratio ?? 0),
    engagementRate: Number(row.engagement_rate ?? 0),
    viewToFollowerRatio: Number(row.follower_view_ratio ?? 0),
    engagementBenchmarkMultiplier: 0,
    anomalyScore: Number(row.viral_score ?? 0),
    publishedAt: row.video_published_at ? String(row.video_published_at) : null,
    ageDays: row.video_published_at ? Math.max(0, (Date.now() - new Date(String(row.video_published_at)).getTime()) / (24*60*60*1000)) : 0,
    contentUrl: row.video_url ? String(row.video_url) : null,
    coverUrl: row.video_cover ? String(row.video_cover) : null,
    tags: (() => {
      try {
        const raw = String(row.hashtags ?? "[]");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // hashtags may be comma-separated string
        const raw = String(row.hashtags ?? "");
        return raw ? raw.split(",").map(t => t.trim()).filter(Boolean) : [];
      }
    })(),
    isStrictAnomaly: Number(row.is_strict_hit ?? 0) === 1,
    detectedAt: String(row.created_at ?? new Date().toISOString()),
    likeCount,
    commentCount,
    shareCount,
    saveCount,
  };
}
