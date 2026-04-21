/**
 * monitor-diff-engine.ts
 * 模块六：智能监控系统 — 增量数据对比引擎
 *
 * 功能：
 *   1. 对比本期与上期快照，提取增量变化
 *   2. 新增爆款检测：新出现的高互动内容（点赞 > 1 万）
 *   3. 热度飙升话题：搜索热度/话题讨论量环比增长 > 30%
 *   4. 账号异动：粉丝量/互动率显著变化
 *   5. 内容消失检测：上期存在但本期消失的内容（可能被删除）
 */

import { readWatchTaskRunStore } from "./storage.js";
import type { StoredWatchTaskRun } from "./types.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface ContentItem {
  awemeId: string;
  title: string;
  authorName: string;
  authorFollowers: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  publishedAt: string;
  /** 综合互动数 */
  totalEngagement: number;
  /** 互动率（互动数/播放数） */
  engagementRate: number;
}

export interface TopicItem {
  topicId: string;
  topicName: string;
  hotValue: number;
  viewCount: number;
  videoCount: number;
}

export interface HotSeedItem {
  rank: number;
  keyword: string;
  hotValue: number;
  label?: string;
}

export interface ParsedSnapshot {
  taskId: string;
  taskType: string;
  platform: string;
  executedAt: string;
  keyword?: string;
  contents: ContentItem[];
  topics: TopicItem[];
  hotSeeds: HotSeedItem[];
  /** 账号数据（account_watch 专用） */
  accountStats?: {
    followerCount: number;
    followingCount: number;
    totalLikes: number;
    videoCount: number;
    avgEngagementRate: number;
  };
}

export interface DiffResult {
  taskId: string;
  taskType: string;
  platform: string;
  currentRunId: string;
  previousRunId: string | null;
  currentExecutedAt: string;
  previousExecutedAt: string | null;
  /** 是否为首次执行（无历史对比） */
  isFirstRun: boolean;

  /** 新增爆款（本期新出现的高互动内容） */
  newHotContents: Array<
    ContentItem & {
      isLowFollowerAnomaly: boolean;
      anomalyStrength: "strong" | "medium" | "weak";
    }
  >;

  /** 消失内容（上期有但本期没有） */
  disappearedContents: Array<{
    awemeId: string;
    title: string;
    likeCount: number;
    disappearReason: "deleted" | "expired" | "unknown";
  }>;

  /** 热度飙升话题 */
  surgingTopics: Array<
    TopicItem & {
      previousHotValue: number;
      growthRate: number;
      growthLabel: "explosive" | "rapid" | "steady";
    }
  >;

  /** 新入榜热搜词 */
  newHotSearches: Array<
    HotSeedItem & {
      isNew: boolean;
      rankChange: number | null;
    }
  >;

  /** 账号变化（account_watch 专用） */
  accountChanges?: {
    followerDelta: number;
    followerGrowthRate: number;
    engagementRateDelta: number;
    trend: "growing" | "stable" | "declining";
  };

  /** 综合信号强度 */
  signalStrength: "strong" | "medium" | "weak" | "none";

  /** 关键发现摘要（供 LLM 使用） */
  keyFindings: string[];

  /** 数据指标摘要 */
  metrics: {
    newHotContentCount: number;
    disappearedContentCount: number;
    surgingTopicCount: number;
    newHotSearchCount: number;
    maxLikeCount: number;
    avgEngagementRate: number;
    lowFollowerAnomalyCount: number;
  };
}

// ─────────────────────────────────────────────
// 快照解析
// ─────────────────────────────────────────────

/**
 * 从 StoredWatchTaskRun 的 snapshot 中解析出结构化数据
 */
export function parseRunSnapshot(run: StoredWatchTaskRun): ParsedSnapshot {
  const snap = run.snapshot as Record<string, unknown>;
  const caps = (snap.capabilityResults as Array<Record<string, unknown>>) ?? [];

  const contents: ContentItem[] = [];
  const topics: TopicItem[] = [];
  const hotSeeds: HotSeedItem[] = [];

  const platform = run.platform;

  for (const cap of caps) {
    const capName = cap.capability as string;
    const payload = (cap.payload ?? {}) as Record<string, unknown>;
    const data = (payload.data ?? {}) as Record<string, unknown>;

    // 解析内容列表（keyword_content_search）
    if (capName === "keyword_content_search") {
      if (platform === "kuaishou") {
        // 快手搜索结果：data.list / data.feeds / data.data.list
        const innerData = (data.data ?? data) as Record<string, unknown>;
        const list = (innerData.list ?? innerData.feeds ?? []) as Array<Record<string, unknown>>;
        for (const item of list) {
          const parsed = parseKsPhotoItem(item);
          if (parsed) contents.push(parsed);
        }
      } else {
        const innerData = (data.data ?? {}) as Record<string, unknown>;
        const awemeList = (innerData.aweme_list ?? []) as Array<Record<string, unknown>>;
        for (const item of awemeList) {
          const parsed = parseAwemeItem(item);
          if (parsed) contents.push(parsed);
        }
      }
    }

    // 解析创作者作品列表（creator_posts — 小红书替代数据链）
    if (capName === "creator_posts" && platform === "xiaohongshu") {
      const noteList = extractXhsNoteList(data);
      for (const item of noteList) {
        const parsed = parseXhsNoteItem(item);
        if (parsed) contents.push(parsed);
      }
    }

    // 解析抖音创作者作品
    if (capName === "creator_posts" && platform === "douyin") {
      const innerData = (data.data ?? data) as Record<string, unknown>;
      const awemeList = (innerData.aweme_list ?? []) as Array<Record<string, unknown>>;
      for (const item of awemeList) {
        const parsed = parseAwemeItem(item);
        if (parsed) contents.push(parsed);
      }
    }

    // 解析快手创作者作品
    if (capName === "creator_posts" && platform === "kuaishou") {
      const innerData = (data.data ?? data) as Record<string, unknown>;
      const list = (innerData.list ?? innerData.feeds ?? innerData.photos ?? []) as Array<Record<string, unknown>>;
      for (const item of list) {
        const parsed = parseKsPhotoItem(item);
        if (parsed) contents.push(parsed);
      }
    }

    // 解析话题列表（topic_discovery — 抖音）
    if (capName === "topic_discovery") {
      const bizData = (data.business_data ?? []) as Array<Record<string, unknown>>;
      for (const item of bizData) {
        const topic = parseTopicItem(item);
        if (topic) topics.push(topic);
      }
    }

    // 解析热搜榜（hot_seed）
    if (capName === "hot_seed") {
      if (platform === "xiaohongshu") {
        // 小红书热榜结构：data.data.items 或 data.items
        const innerData = (data.data ?? data) as Record<string, unknown>;
        const items = (innerData.items ?? []) as Array<Record<string, unknown>>;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const title = (item.title as string) ?? (item.name as string) ?? (item.word as string);
          if (!title) continue;
          hotSeeds.push({
            rank: i + 1,
            keyword: title,
            hotValue: Number(item.score ?? item.hot_value ?? item.view_count ?? 0),
            label: (item.type as string) ?? undefined,
          });
        }
      } else if (platform === "kuaishou") {
        // 快手热搜榜结构：data.data.list 或 data.list
        const innerData = (data.data ?? data) as Record<string, unknown>;
        const list = (innerData.list ?? innerData.items ?? []) as Array<Record<string, unknown>>;
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const title = (item.name as string) ?? (item.title as string) ?? (item.keyword as string) ?? (item.word as string);
          if (!title) continue;
          hotSeeds.push({
            rank: i + 1,
            keyword: title,
            hotValue: Number(item.hot_value ?? item.score ?? item.heat ?? 0),
            label: (item.tag as string) ?? (item.label as string) ?? undefined,
          });
        }
      } else {
        // 抖音热搜榜
        const hotList = (data.data ?? []) as Array<Record<string, unknown>>;
        for (let i = 0; i < hotList.length; i++) {
          const item = hotList[i];
          const seed = parseHotSeedItem(item, i + 1);
          if (seed) hotSeeds.push(seed);
        }
      }
    }

    // 解析账号数据（account_profile）
    if (capName === "account_profile") {
      // 账号数据在 accountStats 字段中处理
    }
  }

  return {
    taskId: run.taskId,
    taskType: run.taskType,
    platform: run.platform,
    executedAt: run.executedAt,
    keyword: (snap.keyword as string) ?? undefined,
    contents,
    topics,
    hotSeeds,
  };
}

/**
 * 从小红书 API 返回数据中提取笔记列表（兼容多种嵌套结构）
 */
function extractXhsNoteList(data: Record<string, unknown>): Array<Record<string, unknown>> {
  // web_v2/fetch_home_notes 结构：data.data.notes 或 data.notes
  const innerData = (data.data ?? data) as Record<string, unknown>;
  const notes = innerData.notes ?? innerData.items ?? innerData.note_list ?? [];
  if (Array.isArray(notes)) return notes as Array<Record<string, unknown>>;
  return [];
}

/**
 * 解析小红书笔记为统一的 ContentItem 格式
 */
function parseXhsNoteItem(item: Record<string, unknown>): ContentItem | null {
  const noteId = (item.note_id as string) ?? (item.id as string);
  if (!noteId) return null;

  const interactInfo = (item.interact_info ?? {}) as Record<string, unknown>;
  const user = (item.user ?? item.author ?? {}) as Record<string, unknown>;

  const likeCount = Number(interactInfo.liked_count ?? item.liked_count ?? item.likes ?? 0);
  const commentCount = Number(interactInfo.comment_count ?? item.comment_count ?? item.comments ?? 0);
  const shareCount = Number(interactInfo.share_count ?? item.share_count ?? 0);
  const collectCount = Number(interactInfo.collected_count ?? item.collected_count ?? item.collects ?? 0);
  // 小红书无公开播放量
  const playCount = 0;
  const totalEngagement = likeCount + commentCount + shareCount + collectCount;
  const engagementRate = 0; // 无播放量无法计算

  const title = (item.title as string) ?? (item.desc as string) ?? (item.display_title as string) ?? "";
  const createTime = Number(item.create_time ?? item.time ?? 0);
  const authorFollowers = Number((user as Record<string, unknown>).fans ?? (user as Record<string, unknown>).follower_count ?? 0);

  return {
    awemeId: noteId, // 复用 awemeId 字段存储 noteId，保持 ContentItem 统一
    title: title.slice(0, 100),
    authorName: (user.nickname as string) ?? (user.name as string) ?? "未知",
    authorFollowers,
    playCount,
    likeCount,
    commentCount,
    shareCount,
    collectCount,
    publishedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : "",
    totalEngagement,
    engagementRate,
  };
}

function parseAwemeItem(item: Record<string, unknown>): ContentItem | null {
  const awemeId = (item.aweme_id as string) ?? (item.id as string);
  if (!awemeId) return null;

  const stats = (item.statistics ?? {}) as Record<string, unknown>;
  const author = (item.author ?? {}) as Record<string, unknown>;
  const authorStats = (author.follower_count ?? 0) as number;

  const likeCount = Number(stats.digg_count ?? stats.like_count ?? 0);
  const commentCount = Number(stats.comment_count ?? 0);
  const shareCount = Number(stats.share_count ?? 0);
  const collectCount = Number(stats.collect_count ?? 0);
  const playCount = Number(stats.play_count ?? stats.video_play_count ?? 0);
  const totalEngagement = likeCount + commentCount + shareCount + collectCount;
  const engagementRate = playCount > 0 ? totalEngagement / playCount : 0;

  const desc = (item.desc as string) ?? (item.title as string) ?? "";
  const createTime = Number(item.create_time ?? 0);

  return {
    awemeId,
    title: desc.slice(0, 100),
    authorName: (author.nickname as string) ?? "未知",
    authorFollowers: authorStats,
    playCount,
    likeCount,
    commentCount,
    shareCount,
    collectCount,
    publishedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : "",
    totalEngagement,
    engagementRate,
  };
}

/**
 * 解析快手视频为统一的 ContentItem 格式
 */
function parseKsPhotoItem(item: Record<string, unknown>): ContentItem | null {
  const photoId = (item.photo_id as string) ?? (item.photoId as string) ?? (item.id as string);
  if (!photoId) return null;

  const author = (item.author ?? item.user ?? {}) as Record<string, unknown>;
  const authorFollowers = Number(author.fansCount ?? author.fans_count ?? author.fan ?? 0);

  const viewCount = Number(item.viewCount ?? item.view_count ?? item.playCount ?? 0);
  const likeCount = Number(item.likeCount ?? item.like_count ?? item.realLikeCount ?? 0);
  const commentCount = Number(item.commentCount ?? item.comment_count ?? 0);
  const shareCount = Number(item.shareCount ?? item.share_count ?? item.forwardCount ?? 0);
  const collectCount = 0; // 快手无收藏数
  const totalEngagement = likeCount + commentCount + shareCount;
  const engagementRate = viewCount > 0 ? totalEngagement / viewCount : 0;

  const caption = (item.caption as string) ?? (item.title as string) ?? (item.desc as string) ?? "";
  const ts = Number(item.timestamp ?? item.time ?? item.create_time ?? 0);

  return {
    awemeId: photoId, // 复用 awemeId 字段存储 photoId，保持 ContentItem 统一
    title: caption.slice(0, 100),
    authorName: (author.user_name as string) ?? (author.userName as string) ?? (author.nickname as string) ?? "未知",
    authorFollowers,
    playCount: viewCount,
    likeCount,
    commentCount,
    shareCount,
    collectCount,
    publishedAt: ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : "",
    totalEngagement,
    engagementRate,
  };
}

function parseTopicItem(item: Record<string, unknown>): TopicItem | null {
  const topicId =
    (item.challenge_id as string) ??
    (item.id as string) ??
    (item.cid as string);
  if (!topicId) return null;

  const info = (item.challenge_info ?? item) as Record<string, unknown>;
  const stats = (info.use_count ?? item.view_count ?? 0) as number;

  return {
    topicId,
    topicName: (info.cha_name as string) ?? (item.name as string) ?? "",
    hotValue: Number(item.hot_value ?? item.score ?? 0),
    viewCount: Number(stats),
    videoCount: Number(info.video_count ?? 0),
  };
}

function parseHotSeedItem(item: Record<string, unknown>, rank: number): HotSeedItem | null {
  const word =
    (item.word as string) ??
    (item.keyword as string) ??
    (item.title as string);
  if (!word) return null;

  return {
    rank,
    keyword: word,
    hotValue: Number(item.hot_value ?? item.score ?? item.view_count ?? 0),
    label: (item.label as string) ?? undefined,
  };
}

// ─────────────────────────────────────────────
// 增量对比核心逻辑
// ─────────────────────────────────────────────

const HOT_CONTENT_THRESHOLD = 10_000; // 爆款点赞阈值
const LOW_FOLLOWER_THRESHOLD = 10_000; // 低粉阈值
const SURGE_GROWTH_THRESHOLD = 0.3; // 热度飙升阈值（30%）
const EXPLOSIVE_GROWTH_THRESHOLD = 1.0; // 爆炸增长阈值（100%）

/**
 * 执行增量对比，返回 DiffResult
 */
export async function computeDiff(
  taskId: string,
  currentRunId?: string,
): Promise<DiffResult | null> {
  const runStore = await readWatchTaskRunStore();
  const allRuns = Object.values(runStore)
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

  if (allRuns.length === 0) return null;

  // 确定当前 run 和上一次 run
  let currentRun: StoredWatchTaskRun;
  let previousRun: StoredWatchTaskRun | null = null;

  if (currentRunId) {
    const found = allRuns.find((r) => r.runId === currentRunId);
    if (!found) return null;
    currentRun = found;
    const idx = allRuns.indexOf(currentRun);
    previousRun = idx + 1 < allRuns.length ? allRuns[idx + 1] : null;
  } else {
    currentRun = allRuns[0];
    previousRun = allRuns.length > 1 ? allRuns[1] : null;
  }

  const current = parseRunSnapshot(currentRun);
  const previous = previousRun ? parseRunSnapshot(previousRun) : null;

  // ── 新增爆款检测 ──
  const previousAwemeIds = new Set(previous?.contents.map((c) => c.awemeId) ?? []);
  const newHotContents = current.contents
    .filter((c) => c.likeCount >= HOT_CONTENT_THRESHOLD && !previousAwemeIds.has(c.awemeId))
    .map((c) => {
      const isLowFollower = c.authorFollowers < LOW_FOLLOWER_THRESHOLD;
      const anomalyScore = isLowFollower
        ? (c.likeCount / Math.max(c.authorFollowers, 1)) * 10
        : 0;
      const anomalyStrength: "strong" | "medium" | "weak" =
        anomalyScore > 50 ? "strong" : anomalyScore > 20 ? "medium" : "weak";
      return { ...c, isLowFollowerAnomaly: isLowFollower, anomalyStrength };
    })
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 20);

  // ── 消失内容检测 ──
  const currentAwemeIds = new Set(current.contents.map((c) => c.awemeId));
  const disappearedContents = (previous?.contents ?? [])
    .filter((c) => c.likeCount >= HOT_CONTENT_THRESHOLD && !currentAwemeIds.has(c.awemeId))
    .map((c) => ({
      awemeId: c.awemeId,
      title: c.title,
      likeCount: c.likeCount,
      disappearReason: "unknown" as const,
    }));

  // ── 热度飙升话题检测 ──
  const previousTopicMap = new Map(previous?.topics.map((t) => [t.topicId, t]) ?? []);
  const surgingTopics = current.topics
    .filter((t) => {
      const prev = previousTopicMap.get(t.topicId);
      if (!prev) return t.hotValue > 1000; // 新出现的高热话题
      if (prev.hotValue === 0) return false;
      const growthRate = (t.hotValue - prev.hotValue) / prev.hotValue;
      return growthRate >= SURGE_GROWTH_THRESHOLD;
    })
    .map((t) => {
      const prev = previousTopicMap.get(t.topicId);
      const previousHotValue = prev?.hotValue ?? 0;
      const growthRate =
        previousHotValue > 0 ? (t.hotValue - previousHotValue) / previousHotValue : 1;
      const growthLabel: "explosive" | "rapid" | "steady" =
        growthRate >= EXPLOSIVE_GROWTH_THRESHOLD
          ? "explosive"
          : growthRate >= SURGE_GROWTH_THRESHOLD
            ? "rapid"
            : "steady";
      return { ...t, previousHotValue, growthRate, growthLabel };
    })
    .sort((a, b) => b.growthRate - a.growthRate)
    .slice(0, 10);

  // ── 新入榜热搜词 ──
  const previousHotSearchMap = new Map(
    previous?.hotSeeds.map((h) => [h.keyword, h]) ?? [],
  );
  const newHotSearches = current.hotSeeds
    .slice(0, 20)
    .map((h) => {
      const prev = previousHotSearchMap.get(h.keyword);
      const isNew = !prev;
      const rankChange = prev ? prev.rank - h.rank : null; // 正数表示排名上升
      return { ...h, isNew, rankChange };
    })
    .filter((h) => h.isNew || (h.rankChange !== null && h.rankChange > 5));

  // ── 账号变化（account_watch 专用） ──
  let accountChanges: DiffResult["accountChanges"] = undefined;
  if (current.taskType === "account_watch" && current.accountStats && previous?.accountStats) {
    const followerDelta = current.accountStats.followerCount - previous.accountStats.followerCount;
    const followerGrowthRate =
      previous.accountStats.followerCount > 0
        ? followerDelta / previous.accountStats.followerCount
        : 0;
    const engagementRateDelta =
      current.accountStats.avgEngagementRate - previous.accountStats.avgEngagementRate;
    const trend: "growing" | "stable" | "declining" =
      followerGrowthRate > 0.02
        ? "growing"
        : followerGrowthRate < -0.02
          ? "declining"
          : "stable";
    accountChanges = { followerDelta, followerGrowthRate, engagementRateDelta, trend };
  }

  // ── 综合信号强度 ──
  const strongSignals =
    newHotContents.filter((c) => c.isLowFollowerAnomaly && c.anomalyStrength === "strong").length +
    surgingTopics.filter((t) => t.growthLabel === "explosive").length;
  const mediumSignals =
    newHotContents.filter((c) => !c.isLowFollowerAnomaly).length +
    surgingTopics.filter((t) => t.growthLabel === "rapid").length;

  const signalStrength: DiffResult["signalStrength"] =
    strongSignals >= 2
      ? "strong"
      : strongSignals >= 1 || mediumSignals >= 3
        ? "medium"
        : mediumSignals >= 1 || newHotSearches.length >= 3
          ? "weak"
          : "none";

  // ── 关键发现摘要 ──
  const keyFindings: string[] = [];

  if (newHotContents.length > 0) {
    const topContent = newHotContents[0];
    keyFindings.push(
      `发现 ${newHotContents.length} 条新爆款内容，最高点赞 ${topContent.likeCount.toLocaleString()}（${topContent.authorName}）`,
    );
  }

  const lowFollowerAnomalies = newHotContents.filter((c) => c.isLowFollowerAnomaly);
  if (lowFollowerAnomalies.length > 0) {
    keyFindings.push(
      `检测到 ${lowFollowerAnomalies.length} 条低粉爆款异常（粉丝 < 1 万但获得万赞），信号强烈`,
    );
  }

  if (surgingTopics.length > 0) {
    const topTopic = surgingTopics[0];
    const growthPct = Math.round(topTopic.growthRate * 100);
    keyFindings.push(
      `话题「${topTopic.topicName}」热度飙升 +${growthPct}%（${topTopic.growthLabel === "explosive" ? "爆炸式增长" : "快速增长"}）`,
    );
  }

  if (newHotSearches.filter((h) => h.isNew).length > 0) {
    const newSearches = newHotSearches.filter((h) => h.isNew);
    keyFindings.push(
      `${newSearches.length} 个新关键词进入热搜榜：${newSearches
        .slice(0, 3)
        .map((h) => `「${h.keyword}」`)
        .join("、")}`,
    );
  }

  if (disappearedContents.length > 0) {
    keyFindings.push(
      `${disappearedContents.length} 条爆款内容从本期数据中消失（可能已删除）`,
    );
  }

  if (keyFindings.length === 0 && !previous) {
    keyFindings.push("首次执行，已建立基准数据快照，下次执行时将开始增量对比");
  }

  if (keyFindings.length === 0) {
    keyFindings.push("本期数据与上期相比无显著变化，赛道热度保持稳定");
  }

  // ── 数据指标摘要 ──
  const avgEngagementRate =
    current.contents.length > 0
      ? current.contents.reduce((sum, c) => sum + c.engagementRate, 0) / current.contents.length
      : 0;

  const metrics: DiffResult["metrics"] = {
    newHotContentCount: newHotContents.length,
    disappearedContentCount: disappearedContents.length,
    surgingTopicCount: surgingTopics.length,
    newHotSearchCount: newHotSearches.filter((h) => h.isNew).length,
    maxLikeCount: Math.max(0, ...current.contents.map((c) => c.likeCount)),
    avgEngagementRate: Math.round(avgEngagementRate * 10000) / 100, // 百分比，保留2位小数
    lowFollowerAnomalyCount: lowFollowerAnomalies.length,
  };

  return {
    taskId,
    taskType: current.taskType,
    platform: current.platform,
    currentRunId: currentRun.runId,
    previousRunId: previousRun?.runId ?? null,
    currentExecutedAt: currentRun.executedAt,
    previousExecutedAt: previousRun?.executedAt ?? null,
    isFirstRun: !previous,
    newHotContents,
    disappearedContents,
    surgingTopics,
    newHotSearches,
    accountChanges,
    signalStrength,
    keyFindings,
    metrics,
  };
}

/**
 * 批量计算多个任务的增量对比（用于监控面板概览）
 */
export async function computeBatchDiff(
  taskIds: string[],
): Promise<Map<string, DiffResult | null>> {
  const results = new Map<string, DiffResult | null>();
  await Promise.all(
    taskIds.map(async (taskId) => {
      const diff = await computeDiff(taskId);
      results.set(taskId, diff);
    }),
  );
  return results;
}

/**
 * 获取任务的历史对比趋势（最近 N 次执行的关键指标）
 */
export async function getTaskTrend(
  taskId: string,
  limit: number = 7,
): Promise<
  Array<{
    runId: string;
    executedAt: string;
    newHotContentCount: number;
    surgingTopicCount: number;
    maxLikeCount: number;
    avgEngagementRate: number;
    signalStrength: string;
  }>
> {
  const runStore = await readWatchTaskRunStore();
  const runs = Object.values(runStore)
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, limit);

  const trends: Array<{
    runId: string;
    executedAt: string;
    newHotContentCount: number;
    surgingTopicCount: number;
    maxLikeCount: number;
    avgEngagementRate: number;
    signalStrength: string;
  }> = [];
  for (const run of runs) {
    const diff = await computeDiff(taskId, run.runId);
    if (diff) {
      trends.push({
        runId: run.runId,
        executedAt: run.executedAt,
        newHotContentCount: diff.metrics.newHotContentCount,
        surgingTopicCount: diff.metrics.surgingTopicCount,
        maxLikeCount: diff.metrics.maxLikeCount,
        avgEngagementRate: diff.metrics.avgEngagementRate,
        signalStrength: diff.signalStrength,
      });
    }
  }
  return trends;
}
