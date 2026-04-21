/**
 * server/low-follower-algorithm.ts
 * ═══════════════════════════════════════════════════════════════
 * 低粉爆款算法核心 — V2（无播放量依赖）
 *
 * 核心指标：
 * 1. 加权互动分 = (点赞×W_like + 评论×W_comment + 收藏×W_save + 分享×W_share) × 时间衰减
 * 2. 粉丝效率比 = 加权互动分 / max(粉丝数, 100)
 * 3. 动态评分 = f(粉丝效率比, 互动超越P75倍数, 低粉程度)
 *
 * 严格条件（AND）：
 * 1. 粉丝量 < followerCeiling（默认 10,000）
 * 2. 加权互动分 >= P75 基准（从样本池动态计算）
 * 3. 粉丝效率比 >= minFanEfficiency（默认 0.5，可动态优化）
 * ═══════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 原始内容数据（来自 TikHub API 或 live-predictions 提取） */
export interface RawContentItem {
  /** 内容唯一 ID */
  contentId: string;
  /** 作者 ID */
  authorId: string;
  /** 作者名称 */
  authorName: string;
  /** 内容标题 */
  title: string;
  /** 平台 */
  platform: "douyin" | "xiaohongshu" | "kuaishou" | "bilibili";
  /** 播放量 / 阅读量（可能为 null，不再作为判定条件） */
  viewCount: number | null;
  /** 点赞数 */
  likeCount: number | null;
  /** 评论数 */
  commentCount: number | null;
  /** 分享数 */
  shareCount: number | null;
  /** 收藏数 */
  saveCount: number | null;
  /** 发布时间（ISO 8601） */
  publishedAt: string | null;
  /** 内容 URL */
  contentUrl: string | null;
  /** 封面 URL */
  coverUrl: string | null;
  /** 关键词标签 */
  tags: string[];
  /** 视频时长（秒） */
  duration?: number | null;
}

/** 原始账号数据 */
export interface RawAccountItem {
  /** 账号 ID */
  accountId: string;
  /** 粉丝量 */
  followerCount: number | null;
  /** 平台 */
  platform: "douyin" | "xiaohongshu" | "kuaishou" | "bilibili";
}

/** 低粉爆款样本（算法判定通过后的结构化结果） */
export interface LowFollowerSample {
  /** 内容 ID */
  contentId: string;
  /** 作者 ID */
  authorId: string;
  /** 作者名称 */
  authorName: string;
  /** 内容标题 */
  title: string;
  /** 平台 */
  platform: string;
  /** 粉丝量 */
  followerCount: number;
  /** 播放量（可能为 0，不作为判定条件） */
  viewCount: number;
  /** 原始互动数（点赞+评论+分享+收藏） */
  interactionCount: number;
  /** 加权互动分（含时间衰减） */
  weightedInteraction: number;
  /** 粉丝效率比（加权互动分 / 粉丝数） */
  fanEfficiencyRatio: number;
  /** 互动率（互动数/播放量，0-1，播放量为0时为0） */
  engagementRate: number;
  /** 粉播比（播放量/粉丝量，播放量为0时为0） */
  viewToFollowerRatio: number;
  /** 加权互动分超越 P75 基准的倍数 */
  engagementBenchmarkMultiplier: number;
  /** 动态爆款评分（0-100） */
  anomalyScore: number;
  /** 发布时间 */
  publishedAt: string | null;
  /** 发布距今天数 */
  ageDays: number;
  /** 内容 URL */
  contentUrl: string | null;
  /** 封面 URL */
  coverUrl: string | null;
  /** 关键词标签 */
  tags: string[];
  /** 是否满足严格条件（低粉 + 加权互动>=P75 + 粉丝效率比>=阈值） */
  isStrictAnomaly: boolean;
  /** 判定时间 */
  detectedAt: string;
  /** 点赞数 */
  likeCount: number;
  /** 评论数 */
  commentCount: number;
  /** 分享数 */
  shareCount: number;
  /** 收藏数 */
  saveCount: number;
}

/** 算法配置（V2 — 无播放量依赖） */
export interface LowFollowerAlgorithmConfig {
  /** 低粉上限（粉丝量阈值，默认 10,000） */
  followerCeiling: number;
  /** P75 基准分位数（默认 0.75） */
  benchmarkPercentile: number;
  /** 粉丝地板分位数（默认 0.30） */
  followerFloorPercentile: number;
  /** 最近 N 天内发布才算有效（默认 30 天，0 表示不限） */
  recencyDays: number;
  /** 最低粉丝效率比（默认 0.5） */
  minFanEfficiency: number;
  /** 点赞权重 */
  likeWeight: number;
  /** 评论权重 */
  commentWeight: number;
  /** 收藏权重 */
  saveWeight: number;
  /** 分享权重 */
  shareWeight: number;
  /** 时间衰减半衰期（天） */
  timeDecayHalflife: number;
}

/** 算法计算结果 */
export interface LowFollowerAlgorithmResult {
  /** 命中低粉爆款的样本列表 */
  samples: LowFollowerSample[];
  /** 低粉爆款比例（命中数 / 总样本数，0-100） */
  lowFollowerAnomalyRatio: number;
  /** P75 加权互动分基准值 */
  p75InteractionBenchmark: number;
  /** 动态粉丝地板（P30 粉丝量） */
  dynamicFollowerFloor: number;
  /** 总内容样本数 */
  totalContentCount: number;
  /** 命中数 */
  anomalyHitCount: number;
  /** 算法配置快照 */
  config: LowFollowerAlgorithmConfig;
  /** 计算说明 */
  computeNote: string;
}

// ─────────────────────────────────────────────
// 默认配置
// ─────────────────────────────────────────────

export const DEFAULT_ALGORITHM_CONFIG: LowFollowerAlgorithmConfig = {
  followerCeiling: 10_000,
  benchmarkPercentile: 0.75,
  followerFloorPercentile: 0.30,
  recencyDays: 30,
  minFanEfficiency: 0.5,
  likeWeight: 1,
  commentWeight: 3,
  saveWeight: 2,
  shareWeight: 4,
  timeDecayHalflife: 7,
};

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 计算分位数值
 */
function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * percentile) - 1);
  return sorted[idx];
}

/**
 * 计算原始互动数（点赞 + 评论 + 分享 + 收藏）
 */
function computeRawInteraction(item: RawContentItem): number {
  return (item.likeCount ?? 0) +
    (item.commentCount ?? 0) +
    (item.shareCount ?? 0) +
    (item.saveCount ?? 0);
}

/**
 * 计算加权互动分（含时间衰减）
 *
 * 公式：
 *   基础分 = 点赞×W_like + 评论×W_comment + 收藏×W_save + 分享×W_share
 *   时间衰减 = 1 / (1 + ageDays / halflife)
 *   加权互动分 = 基础分 × 时间衰减
 */
export function computeWeightedInteraction(
  item: RawContentItem,
  cfg: LowFollowerAlgorithmConfig,
): number {
  const baseScore =
    (item.likeCount ?? 0) * cfg.likeWeight +
    (item.commentCount ?? 0) * cfg.commentWeight +
    (item.saveCount ?? 0) * cfg.saveWeight +
    (item.shareCount ?? 0) * cfg.shareWeight;

  const ageDays = computeAgeDays(item.publishedAt);
  const timeDecay = 1 / (1 + ageDays / cfg.timeDecayHalflife);

  return baseScore * timeDecay;
}

/**
 * 计算发布距今天数
 */
function computeAgeDays(publishedAt: string | null): number {
  if (!publishedAt) return 0; // 无时间信息，不衰减
  const publishDate = new Date(publishedAt);
  const now = new Date();
  const diffMs = now.getTime() - publishDate.getTime();
  return Math.max(0, diffMs / (24 * 60 * 60 * 1000));
}

/**
 * 计算粉丝效率比
 */
function computeFanEfficiency(weightedInteraction: number, followerCount: number): number {
  return weightedInteraction / Math.max(followerCount, 100);
}

/**
 * 检查发布时效性
 */
function isWithinRecency(publishedAt: string | null, recencyDays: number): boolean {
  if (recencyDays <= 0) return true;
  if (!publishedAt) return true;
  const publishDate = new Date(publishedAt);
  const cutoff = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000);
  return publishDate >= cutoff;
}

/**
 * 计算动态爆款评分（0-100）
 *
 * 三维度：
 * 1. 粉丝效率比得分（40分）：效率比越高越强
 * 2. 加权互动超越P75倍数得分（35分）：超越越多越强
 * 3. 低粉程度得分（25分）：粉丝越少越异常
 */
function computeViralScore(
  followerCount: number,
  weightedInteraction: number,
  fanEfficiency: number,
  p75Benchmark: number,
  cfg: LowFollowerAlgorithmConfig,
): number {
  // 1. 粉丝效率比得分（效率比 5 以上满分）
  const efficiencyScore = clamp((fanEfficiency / 5) * 40);

  // 2. 加权互动超越P75基准的倍数得分（3倍以上满分）
  const benchmarkMultiplier = p75Benchmark > 0
    ? weightedInteraction / Math.max(p75Benchmark, 1)
    : 1;
  const benchmarkScore = clamp((benchmarkMultiplier / 3) * 35);

  // 3. 低粉程度得分（粉丝越少越异常）
  const followerReverseScore = clamp(
    ((cfg.followerCeiling - followerCount) / cfg.followerCeiling) * 25,
  );

  return clamp(efficiencyScore + benchmarkScore + followerReverseScore);
}

// ─────────────────────────────────────────────
// 主算法：低粉爆款检测（V2）
// ─────────────────────────────────────────────

/**
 * 执行低粉爆款算法 V2
 *
 * 严格条件（AND 关系）：
 * 1. 粉丝量 < followerCeiling（默认 10,000）
 * 2. 加权互动分 >= P75 基准（从样本池动态计算）
 * 3. 粉丝效率比 >= minFanEfficiency（默认 0.5）
 *
 * 宽松条件（OR，纳入样本库但标记非严格）：
 * - 满足条件1+2（低粉+高互动，效率比不够）
 * - 满足条件1+3（低粉+高效率，绝对互动量不够）
 */
export function runLowFollowerAlgorithm(
  contents: RawContentItem[],
  accounts: RawAccountItem[],
  config: Partial<LowFollowerAlgorithmConfig> = {},
): LowFollowerAlgorithmResult {
  const cfg: LowFollowerAlgorithmConfig = { ...DEFAULT_ALGORITHM_CONFIG, ...config };

  // Step 1: 过滤时效性
  const recentContents = contents.filter((c) => isWithinRecency(c.publishedAt, cfg.recencyDays));

  // Step 2: 计算所有内容的加权互动分
  const allWeightedInteractions = recentContents.map((c) => computeWeightedInteraction(c, cfg));

  // Step 3: 计算 P75 加权互动分基准
  const p75Benchmark = computePercentile(allWeightedInteractions, cfg.benchmarkPercentile);

  // Step 4: 计算动态粉丝地板（P30 粉丝量）
  const allFollowers = accounts
    .map((a) => a.followerCount)
    .filter((f): f is number => f !== null && f > 0);
  const dynamicFollowerFloor = allFollowers.length > 0
    ? computePercentile(allFollowers, cfg.followerFloorPercentile)
    : 0;

  // Step 5: 构建粉丝量查找表
  const followerLookup = new Map<string, number>();
  for (const account of accounts) {
    // 防御：粉丝数为 0 视为无效数据，不加入查找表
    if (account.followerCount !== null && account.followerCount > 0) {
      followerLookup.set(account.accountId, account.followerCount);
    }
  }

  // Step 6: 对每条内容执行低粉爆款判定
  const samples: LowFollowerSample[] = [];
  let anomalyHitCount = 0;

  for (let i = 0; i < recentContents.length; i++) {
    const content = recentContents[i];
    const followerCount = followerLookup.get(content.authorId);
    if (followerCount === undefined) continue;

    const rawInteraction = computeRawInteraction(content);
    const weightedInteraction = allWeightedInteractions[i];
    const fanEfficiency = computeFanEfficiency(weightedInteraction, followerCount);
    const viewCount = content.viewCount ?? 0;
    const engagementRate = viewCount > 0 ? rawInteraction / viewCount : 0;
    const viewToFollowerRatio = viewCount > 0 ? viewCount / Math.max(followerCount, 1) : 0;
    const benchmarkMultiplier = p75Benchmark > 0
      ? weightedInteraction / Math.max(p75Benchmark, 1)
      : 0;

    // 严格条件判定（V2：去掉播放量，改用加权互动分+粉丝效率比）
    const cond1_lowFollower = followerCount < cfg.followerCeiling;
    const cond2_highWeightedInteraction = weightedInteraction >= p75Benchmark;
    const cond3_highFanEfficiency = fanEfficiency >= cfg.minFanEfficiency;
    const isStrictAnomaly = cond1_lowFollower && cond2_highWeightedInteraction && cond3_highFanEfficiency;

    // 宽松条件
    const isLooseAnomaly =
      (cond1_lowFollower && cond2_highWeightedInteraction) ||
      (cond1_lowFollower && cond3_highFanEfficiency && rawInteraction >= 100);

    if (!isStrictAnomaly && !isLooseAnomaly) continue;
    if (isStrictAnomaly) anomalyHitCount++;

    const viralScore = computeViralScore(
      followerCount,
      weightedInteraction,
      fanEfficiency,
      p75Benchmark,
      cfg,
    );

    samples.push({
      contentId: content.contentId,
      authorId: content.authorId,
      authorName: content.authorName,
      title: content.title,
      platform: content.platform,
      followerCount,
      viewCount,
      interactionCount: rawInteraction,
      weightedInteraction,
      fanEfficiencyRatio: fanEfficiency,
      engagementRate,
      viewToFollowerRatio,
      engagementBenchmarkMultiplier: benchmarkMultiplier,
      anomalyScore: viralScore,
      publishedAt: content.publishedAt,
      ageDays: computeAgeDays(content.publishedAt),
      contentUrl: content.contentUrl,
      coverUrl: content.coverUrl,
      tags: content.tags,
      isStrictAnomaly,
      detectedAt: new Date().toISOString(),
      likeCount: content.likeCount ?? 0,
      commentCount: content.commentCount ?? 0,
      shareCount: content.shareCount ?? 0,
      saveCount: content.saveCount ?? 0,
    });
  }

  // 按评分排序，严格异常优先
  samples.sort((a, b) => {
    if (a.isStrictAnomaly !== b.isStrictAnomaly) {
      return a.isStrictAnomaly ? -1 : 1;
    }
    return b.anomalyScore - a.anomalyScore;
  });

  const lowFollowerAnomalyRatio = recentContents.length > 0
    ? clamp((anomalyHitCount / recentContents.length) * 100)
    : 0;

  const computeNote = buildComputeNote(
    recentContents.length,
    anomalyHitCount,
    p75Benchmark,
    dynamicFollowerFloor,
    cfg,
  );

  return {
    samples,
    lowFollowerAnomalyRatio,
    p75InteractionBenchmark: p75Benchmark,
    dynamicFollowerFloor,
    totalContentCount: recentContents.length,
    anomalyHitCount,
    config: cfg,
    computeNote,
  };
}

function buildComputeNote(
  totalCount: number,
  hitCount: number,
  p75Benchmark: number,
  followerFloor: number,
  cfg: LowFollowerAlgorithmConfig,
): string {
  if (totalCount === 0) {
    return "无内容样本，lowFollowerAnomalyRatio = 0（无法计算）。";
  }
  return [
    `样本池 ${totalCount} 条，严格命中 ${hitCount} 条。`,
    `P75 加权互动分基准：${p75Benchmark.toFixed(0)}（点赞×${cfg.likeWeight}+评论×${cfg.commentWeight}+收藏×${cfg.saveWeight}+分享×${cfg.shareWeight}，含时间衰减）。`,
    `动态粉丝地板（P30）：${followerFloor.toFixed(0)} 粉。`,
    `严格阈值：粉丝 < ${cfg.followerCeiling.toLocaleString()} + 加权互动 ≥ P75 + 粉丝效率比 ≥ ${cfg.minFanEfficiency}。`,
    `lowFollowerAnomalyRatio = ${hitCount}/${totalCount} = ${((hitCount / totalCount) * 100).toFixed(1)}%。`,
  ].join(" ");
}

// ─────────────────────────────────────────────
// 辅助函数：格式化
// ─────────────────────────────────────────────

/** 格式化粉丝量标签 */
export function formatFollowerLabel(count: number): string {
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万粉`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k粉`;
  return `${count}粉`;
}

/** 格式化播放量标签 */
export function formatViewLabel(count: number): string {
  if (count >= 10_000_000) return `${(count / 10_000_000).toFixed(1)}千万`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}百万`;
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`;
  return `${count}`;
}

/** 格式化互动数标签 */
export function formatInteractionLabel(count: number): string {
  if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万互动`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k互动`;
  return `${count}互动`;
}

/** 获取评分等级标签 */
export function getViralScoreLabel(score: number): string {
  if (score >= 80) return "🔥 超级爆款";
  if (score >= 60) return "🚀 强势爆款";
  if (score >= 40) return "📈 潜力爆款";
  return "💡 值得关注";
}

/** 将 LowFollowerSample 转换为前端展示格式 */
export function toLowFollowerEvidenceItem(sample: LowFollowerSample): {
  id: string;
  platform: string;
  contentForm: string;
  title: string;
  account: string;
  fansLabel: string;
  fansCount: number;
  anomaly: number;
  playCount: string;
  engagementRate: string;
  viewToFollowerRatio: string;
  isStrictAnomaly: boolean;
  trackTags: string[];
  suggestion: string;
  publishedAt: string;
  contentUrl: string | null;
  coverUrl: string | null;
} {
  return {
    id: `lf_${sample.contentId}`,
    platform: sample.platform,
    contentForm: sample.platform === "xiaohongshu" ? "图文/短视频" : "短视频",
    title: sample.title,
    account: sample.authorName,
    fansLabel: formatFollowerLabel(sample.followerCount),
    fansCount: sample.followerCount,
    anomaly: sample.anomalyScore,
    playCount: sample.viewCount > 0 ? formatViewLabel(sample.viewCount) : formatInteractionLabel(sample.interactionCount),
    engagementRate: `效率比 ${sample.fanEfficiencyRatio.toFixed(1)}x`,
    viewToFollowerRatio: sample.viewToFollowerRatio > 0 ? `粉播比 ${sample.viewToFollowerRatio.toFixed(0)}x` : `粉丝效率 ${sample.fanEfficiencyRatio.toFixed(1)}x`,
    isStrictAnomaly: sample.isStrictAnomaly,
    trackTags: sample.tags,
    suggestion: buildSampleSuggestion(sample),
    publishedAt: sample.publishedAt ?? "",
    contentUrl: sample.contentUrl,
    coverUrl: sample.coverUrl ?? null,
  };
}

function buildSampleSuggestion(sample: LowFollowerSample): string {
  if (sample.isStrictAnomaly) {
    if (sample.fanEfficiencyRatio >= 3) {
      return `粉丝效率比 ${sample.fanEfficiencyRatio.toFixed(1)}x，加权互动超 P75 基准 ${sample.engagementBenchmarkMultiplier.toFixed(1)} 倍，高可复制性样本，优先拆解结构。`;
    }
    return `满足严格条件（低粉+高互动+高效率），加权互动超 P75 基准 ${sample.engagementBenchmarkMultiplier.toFixed(1)} 倍，值得深度拆解。`;
  }
  return `低粉账号出现高互动信号（${formatInteractionLabel(sample.interactionCount)}），可作为辅助参考样本。`;
}

// ─────────────────────────────────────────────
// 从 live-predictions.ts 的 ExtractedContent 格式转换
// ─────────────────────────────────────────────

/** 将 live-predictions.ts 中的 ExtractedContent 格式转换为 RawContentItem */
export function fromExtractedContent(item: {
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
}): RawContentItem {
  return {
    contentId: item.contentId,
    authorId: item.authorId ?? item.contentId,
    authorName: item.authorName,
    title: item.title,
    platform: item.platform as RawContentItem["platform"],
    viewCount: item.viewCount,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    shareCount: item.shareCount,
    saveCount: null,
    publishedAt: item.publishedAt,
    contentUrl: null,
    coverUrl: null,
    tags: item.keywordTokens,
  };
}

/** 从 ExtractedContent 列表中提取账号信息 */
export function accountsFromExtractedContents(items: Array<{
  contentId: string;
  authorId?: string;
  platform: string;
  authorFollowerCount?: number | null;
}>): RawAccountItem[] {
  const seen = new Set<string>();
  const accounts: RawAccountItem[] = [];
  for (const item of items) {
    const id = item.authorId ?? item.contentId;
    if (seen.has(id)) continue;
    seen.add(id);
    if (item.authorFollowerCount !== undefined && item.authorFollowerCount !== null) {
      accounts.push({
        accountId: id,
        followerCount: item.authorFollowerCount,
        platform: item.platform as RawAccountItem["platform"],
      });
    }
  }
  return accounts;
}
