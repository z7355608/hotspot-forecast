/**
 * prediction-helpers.ts
 * ═══════════════════════════════════════════════════════════════
 * 从 live-predictions.ts 拆分出的工具函数和类型定义。
 * 包含数据提取、格式化、去重、结果构建等通用逻辑。
 * ═══════════════════════════════════════════════════════════════
 */

import { randomUUID } from "node:crypto";
import type {
  PredictionBestAction,
  PredictionRequestDraft,
  PredictionResultCard,
  PredictionSafeActionLevel,
  PredictionSupportingAccount,
  PredictionSupportingContent,
  PredictionUiResult,
  PredictionWhyNowItem,
} from "../../client/src/app/store/prediction-types.js";
import type {
  ConnectorAuthMode,
  ExecutionStatus,
  StoredConnectorRecord,
  StoredWatchTask,
  SupportedPlatform,
  WatchTaskType,
} from "./types.js";

/* ── Re-exported Types ── */

export type ConnectorLike = {
  id: string;
  name: string;
  connected: boolean;
  authMode?: ConnectorAuthMode;
  profileUrl?: string;
  handle?: string;
};

export type ExtractedAccount = PredictionSupportingAccount;

export type ExtractedContent = PredictionSupportingContent & {
  authorFollowerCount: number | null;
};

export type ExtractedLowFollowerEvidence = PredictionUiResult["lowFollowerEvidence"][number];

export interface PlatformRunSummary {
  platform: SupportedPlatform;
  executionStatus: ExecutionStatus;
  degradeFlags: string[];
  usedRouteChain: string[];
  snapshot: Record<string, unknown>;
}

export const PLATFORM_NAMES: Record<SupportedPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  kuaishou: "快手",
};

/* ── Basic Utilities ── */

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function inferInputKind(draft: PredictionRequestDraft) {
  if (draft.evidenceItems.some((item) => /^https?:\/\//.test(item.source))) {
    return "content_url" as const;
  }
  if (draft.evidenceItems.length > 0) {
    return "uploaded_asset" as const;
  }
  if (/(账号|主页|博主|作者|对标|竞品)/.test(draft.prompt)) {
    return "account" as const;
  }
  return "prompt" as const;
}

export function getCandidatePlatforms(draft: PredictionRequestDraft): SupportedPlatform[] {
  const supported = new Set<SupportedPlatform>();
  // 优先使用用户明确选择的平台（selectedPlatforms）
  // 仅当 selectedPlatforms 为空时，才回退到 connectedPlatforms
  const candidateList = draft.selectedPlatforms.length > 0
    ? draft.selectedPlatforms
    : draft.connectedPlatforms;
  for (const platform of candidateList) {
    if (platform === "douyin" || platform === "xiaohongshu" || platform === "kuaishou") {
      supported.add(platform as SupportedPlatform);
    }
  }
  if (supported.size === 0) {
    // 默认仅使用抖音（单平台），用户可在前端选择额外平台（每平台+10积分）
    supported.add("douyin");
  }
  return [...supported];
}

export function extractIdsFromEvidenceItems(items: PredictionRequestDraft["evidenceItems"]) {
  let awemeId: string | undefined;
  let noteId: string | undefined;

  for (const item of items) {
    const source = item.source;
    if (!/^https?:\/\//.test(source)) continue;
    try {
      const url = new URL(source);
      const douyinMatch = url.pathname.match(/\/video\/(\d+)/);
      if (douyinMatch?.[1]) {
        awemeId = douyinMatch[1];
      }
      const xhsMatch =
        url.pathname.match(/\/explore\/([A-Za-z0-9]+)/) ??
        url.pathname.match(/\/discovery\/item\/([A-Za-z0-9]+)/);
      if (xhsMatch?.[1]) {
        noteId = xhsMatch[1];
      }
      if (!noteId) {
        const queryNoteId = url.searchParams.get("noteId") ?? url.searchParams.get("note_id");
        if (queryNoteId) {
          noteId = queryNoteId;
        }
      }
    } catch {
      continue;
    }
  }

  return { awemeId, noteId };
}

/* ── Connector & Task Builders ── */

export function createConnectorLike(
  platform: SupportedPlatform,
  record: StoredConnectorRecord | undefined,
): ConnectorLike {
  return {
    id: platform,
    name: PLATFORM_NAMES[platform],
    connected: Boolean(record),
    authMode: record?.authMode,
    profileUrl: record?.profileUrl,
    handle: record?.handle,
  };
}

export function buildTaskType(inputKind: ReturnType<typeof inferInputKind>): WatchTaskType {
  if (inputKind === "account") return "account_watch";
  if (inputKind === "content_url") return "validation_watch";
  return "topic_watch";
}

export function buildQueryPayload(params: {
  draft: PredictionRequestDraft;
  platform: SupportedPlatform;
  connector?: StoredConnectorRecord;
  inputKind: ReturnType<typeof inferInputKind>;
  seedTopic: string;
  awemeId?: string;
  noteId?: string;
}) {
  const { awemeId, connector, draft, inputKind, noteId, platform, seedTopic } = params;
  return {
    query: draft.prompt,
    seedTopic,
    topicCluster: seedTopic,
    inputKind,
    keyword: seedTopic,
    handle: connector?.handle,
    platformUserId: connector?.platformUserId,
    uniqueId: platform === "douyin" ? connector?.handle : undefined,
    secUserId:
      platform === "douyin" && connector?.platformUserId?.startsWith("MS4w")
        ? connector.platformUserId
        : undefined,
    contentId: platform === "douyin" ? awemeId : noteId,
    awemeId: platform === "douyin" ? awemeId : undefined,
    noteId: platform === "xiaohongshu" ? noteId : undefined,
  };
}

export function createTask(params: {
  artifactId: string;
  draft: PredictionRequestDraft;
  platform: SupportedPlatform;
  connector?: StoredConnectorRecord;
  inputKind: ReturnType<typeof inferInputKind>;
  seedTopic: string;
  awemeId?: string;
  noteId?: string;
}): StoredWatchTask | null {
  const { artifactId, connector, draft, inputKind, platform, seedTopic } = params;
  if (inputKind === "account" && !connector) {
    return null;
  }
  const createdAt = nowIso();
  const taskType = buildTaskType(inputKind);
  return {
    taskId: `live_task_${randomUUID()}`,
    artifactId,
    platform,
    taskType,
    priority: taskType === "validation_watch" ? "medium" : "high",
    scheduleTier: taskType === "topic_watch" ? "daily" : "every_72h",
    status: "pending",
    queryPayload: buildQueryPayload({
      draft,
      platform,
      connector,
      inputKind,
      seedTopic,
      awemeId: params.awemeId,
      noteId: params.noteId,
    }),
    createdAt,
    updatedAt: createdAt,
  };
}

/* ── Data Extraction Utilities ── */

export function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

export function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

export function formatPublishedAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return nowIso();
}

export function splitKeywordTokens(value: string) {
  return value
    .split(/[，,、\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function resolveTierLabel(
  followerCount: number | null,
): PredictionSupportingAccount["tierLabel"] {
  if (followerCount === null) return "watch_account";
  if (followerCount >= 1_000_000) return "head_kol";
  if (followerCount >= 100_000) return "standard_kol";
  if (followerCount >= 10_000) return "strong_koc";
  return "standard_koc";
}

export function walkObjects(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
  depth = 0,
) {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      walkObjects(item, visitor, depth + 1);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  visitor(record);
  for (const item of Object.values(record)) {
    walkObjects(item, visitor, depth + 1);
  }
}

export function extractAccounts(
  platform: SupportedPlatform,
  _capability: string,
  payload: unknown,
): ExtractedAccount[] {
  const accounts = new Map<string, ExtractedAccount>();
  walkObjects(payload, (record) => {
    if (record.aweme_id || record.note_id) return;
    const displayName = getString(record, ["nickname", "author_name", "name", "screen_name"]);
    const handle = getString(record, ["unique_id", "user_name", "handle", "short_id"]);
    const accountId = getString(record, [
      "sec_uid",
      "secUid",
      "uid",
      "user_id",
      "author_id",
      "id",
    ]);
    const followerCount = getNumber(record, [
      "follower_count",
      "fans_count",
      "fan_count",
      "followers",
      "mplatform_followers_count",
    ]);
    const followingCount = getNumber(record, [
      "following_count",
      "followings_count",
    ]);
    const totalLikeCount = getNumber(record, [
      "total_favorited",
      "total_like_count",
      "favoriting_count",
    ]);
    if (!accountId || (!displayName && !handle && followerCount === null)) return;
    if (platform === "douyin" && !accountId.startsWith("MS4w")) return;
    if (accounts.has(accountId)) return;
    const profileUrl = platform === "douyin"
      ? `https://www.douyin.com/user/${accountId}`
      : platform === "xiaohongshu" && handle
        ? `https://www.xiaohongshu.com/user/profile/${handle}`
        : undefined;
    accounts.set(accountId, {
      accountId,
      displayName: displayName ?? handle ?? accountId,
      handle: handle ?? accountId,
      platform: PLATFORM_NAMES[platform],
      profileUrl,
      tierLabel: resolveTierLabel(followerCount),
      followerCount,
      followingCount,
      totalLikeCount,
      avgEngagementRate30d: null,
      breakoutHitRate30d: null,
      recentTopicClusters: [],
      whyIncluded: "",
    });
  });
  return [...accounts.values()];
}

export function extractContents(
  platform: SupportedPlatform,
  _capability: string,
  payload: unknown,
): ExtractedContent[] {
  const contents = new Map<string, ExtractedContent>();
  walkObjects(payload, (record) => {
    const title = getString(record, ["desc", "title", "content"]);
    const contentId = getString(record, ["aweme_id", "note_id", "id"]);
    if (!title || !contentId) return;
    if (contents.has(contentId)) return;
    if (title.length < 8) return;
    const hasAuthor = (record.author && typeof record.author === "object") || (record.user && typeof record.user === "object");
    if (!hasAuthor && !record.aweme_id) return;
    const author =
      (record.author && typeof record.author === "object"
        ? (record.author as Record<string, unknown>)
        : undefined) ??
      (record.user && typeof record.user === "object"
        ? (record.user as Record<string, unknown>)
        : undefined);
    const authorName =
      (author ? getString(author, ["nickname", "name", "user_name"]) : undefined) ??
      getString(record, ["author_name", "nickname"]) ??
      "未知作者";
    const authorFollowerCount = author
      ? getNumber(author, ["follower_count", "fans_count", "fan_count"])
      : getNumber(record, ["follower_count", "fans_count"]);
    const stats =
      record.statistics && typeof record.statistics === "object" && !Array.isArray(record.statistics)
        ? (record.statistics as Record<string, unknown>)
        : null;
    const viewCount =
      (stats ? getNumber(stats, ["play_count", "view_count", "exposure_count"]) : null) ??
      getNumber(record, ["play_count", "view_count", "view_num", "read_count"]);
    const likeCount =
      (stats ? getNumber(stats, ["digg_count", "like_count"]) : null) ??
      getNumber(record, ["digg_count", "like_count", "liked_count"]);
    const commentCount =
      (stats ? getNumber(stats, ["comment_count"]) : null) ??
      getNumber(record, ["comment_count"]);
    const shareCount =
      (stats ? getNumber(stats, ["share_count", "forward_count"]) : null) ??
      getNumber(record, ["share_count"]);
    const collectCount =
      (stats ? getNumber(stats, ["collect_count", "favorite_count"]) : null) ??
      getNumber(record, ["collect_count", "favorite_count", "collected_count"]);
    const contentUrl = platform === "douyin"
      ? `https://www.douyin.com/video/${contentId}`
      : platform === "xiaohongshu"
        ? `https://www.xiaohongshu.com/explore/${contentId}`
        : undefined;
    const videoObj = record.video && typeof record.video === "object" && !Array.isArray(record.video)
      ? (record.video as Record<string, unknown>) : null;
    const coverUrl: string | null = (() => {
      if (videoObj) {
        for (const k of ["origin_cover", "cover", "dynamic_cover"]) {
          const c = videoObj[k];
          if (c && typeof c === "object" && !Array.isArray(c)) {
            const urls = (c as Record<string, unknown>).url_list;
            if (Array.isArray(urls) && urls.length > 0) return String(urls[0]);
          }
        }
      }
      const imgList = record.images_list ?? record.image_list;
      if (Array.isArray(imgList) && imgList.length > 0) {
        const img0 = imgList[0] as Record<string, unknown>;
        const u = img0?.url_default ?? img0?.url ?? img0?.url_size_large;
        if (u) return String(u);
      }
      const thumb = record.thumbnail;
      if (thumb && typeof thumb === "object" && !Array.isArray(thumb)) {
        const urls = (thumb as Record<string, unknown>).url_list;
        if (Array.isArray(urls) && urls.length > 0) return String(urls[0]);
      }
      const directCover = record.cover_url ?? record.thumbnail_url ?? record.cover;
      if (typeof directCover === "string" && directCover.startsWith("http")) return directCover;
      return null;
    })();
    contents.set(contentId, {
      contentId,
      title,
      authorName,
      platform: PLATFORM_NAMES[platform],
      publishedAt: formatPublishedAt(
        record.create_time ?? record.publish_time ?? record.timestamp ?? record.time,
      ),
      contentUrl,
      coverUrl,
      viewCount,
      likeCount,
      commentCount,
      shareCount,
      collectCount,
      structureSummary: title.slice(0, 48),
      keywordTokens: splitKeywordTokens(title),
      whyIncluded: "",
      authorFollowerCount,
    });
  });
  return [...contents.values()];
}

export function countHotSeed(payload: unknown) {
  let count = 0;
  walkObjects(payload, (record) => {
    for (const key of ["word_list", "hot_list", "items"]) {
      const value = record[key];
      if (Array.isArray(value)) {
        count = Math.max(count, value.length);
      }
    }
  });
  return count;
}

export function countComments(payload: unknown) {
  let count = 0;
  walkObjects(payload, (record) => {
    for (const key of ["comments", "comment_list"]) {
      const value = record[key];
      if (Array.isArray(value)) {
        count = Math.max(count, value.length);
      }
    }
    const explicit = getNumber(record, ["comment_count"]);
    if (explicit !== null) {
      count = Math.max(count, explicit);
    }
  });
  return count;
}

export function dedupeById<T extends { accountId?: string; contentId?: string; id?: string }>(
  items: T[],
  key: keyof T,
) {
  const map = new Map<string, T>();
  for (const item of items) {
    const value = item[key];
    if (typeof value === "string" && value) {
      map.set(value, item);
    }
  }
  return [...map.values()];
}

export function mapLowFollowerEvidence(contents: ExtractedContent[]): ExtractedLowFollowerEvidence[] {
  return contents
    .filter((item) => item.authorFollowerCount !== null && item.authorFollowerCount > 0 && item.authorFollowerCount <= 10_000)
    .slice(0, 4)
    .map((item) => ({
      id: `live_low_${item.contentId}`,
      platform: item.platform,
      contentForm: "短视频/图文样本",
      title: item.title,
      account: item.authorName,
      contentUrl: item.contentUrl,
      coverUrl: item.coverUrl ?? null,
      fansLabel:
        item.authorFollowerCount !== null ? `${item.authorFollowerCount.toLocaleString("zh-CN")} 粉` : "低粉作者",
      fansCount: item.authorFollowerCount ?? 0,
      anomaly:
        item.authorFollowerCount && item.viewCount
          ? clamp((item.viewCount / Math.max(item.authorFollowerCount, 1)) * 10, 1, 99)
          : 0,
      playCount:
        item.viewCount !== null ? `${item.viewCount.toLocaleString("zh-CN")} 播放` : "播放待补充",
      likeCount: item.likeCount,
      commentCount: item.commentCount,
      collectCount: item.collectCount,
      shareCount: item.shareCount,
      trackTags: item.keywordTokens,
      suggestion: "这条低粉样本已进入真实证据池，适合先做可复制性验证。",
      publishedAt: item.publishedAt,
    }));
}

/* ── Result Card Builders ── */

export function createWhyNowItems(params: {
  accounts: ExtractedAccount[];
  commentCount: number;
  contents: ExtractedContent[];
  degradeFlags: string[];
  hotSeedCount: number;
  usedPlatforms: string[];
}): PredictionWhyNowItem[] {
  const items: PredictionWhyNowItem[] = [];
  const { accounts, commentCount, contents, degradeFlags, hotSeedCount, usedPlatforms } = params;
  const topContentTitles = contents.slice(0, 3).map((c) => `『${c.title.slice(0, 20)}』`).join("、");
  const topAccountNames = accounts.slice(0, 3).map((a) => a.displayName).filter(Boolean).join("、");
  const kolNum = accounts.filter((item) => item.tierLabel === "head_kol" || item.tierLabel === "standard_kol").length;
  const kocNum = accounts.filter((item) => item.tierLabel === "strong_koc" || item.tierLabel === "standard_koc").length;
  const lowFanAccounts = accounts.filter((a) => a.followerCount != null && a.followerCount < 10000);

  items.push({
    sourceLabel: "内容供给",
    fact: contents.length > 0
      ? `${usedPlatforms.join(" / ")} 已有 ${contents.length} 条真实内容跑通，包括${topContentTitles}${hotSeedCount > 0 ? `，同时命中 ${hotSeedCount} 条热榜/热词` : ""}。`
      : `${usedPlatforms.join(" / ")} 当前未搜索到相关内容样本。`,
    inference: contents.length >= 3
      ? "这个方向已经有多条内容跑出数据，说明市场已经验证过这个内容类型。"
      : contents.length > 0
        ? "已有少量真实内容信号，但样本量还不足以确认趋势。"
        : "当前没有找到相关内容，这个方向可能还太早期。",
    userImpact: contents.length >= 3
      ? `可以直接参考${topContentTitles}的结构和表达方式。`
      : contents.length > 0
        ? "建议先看这些内容的结构和互动数据，再决定是否跟进。"
        : "建议换一个更具体的关键词重新搜索。",
    tone: contents.length >= 3 ? "positive" : contents.length > 0 ? "neutral" : "warning",
  });
  items.push({
    sourceLabel: "竞争格局",
    fact: accounts.length > 0
      ? `已有 ${accounts.length} 个账号在做这个方向：${kolNum} 个 KOL、${kocNum} 个 KOC${lowFanAccounts.length > 0 ? `、${lowFanAccounts.length} 个低粉账号` : ""}，包括${topAccountNames || "多个创作者"}。`
      : "当前未搜索到相关账号，竞争格局尚不明朗。",
    inference: accounts.length >= 2
      ? kolNum > kocNum
        ? "头部账号占比较高，说明赛道已经有大号入场，低粉需要找差异化切入点。"
        : "中小账号占比较高，说明这个方向对新号/低粉号比较友好。"
      : "账号样本偏少，无法准确判断竞争强度。",
    userImpact: accounts.length >= 2
      ? lowFanAccounts.length > 0
        ? `已有 ${lowFanAccounts.length} 个低粉账号在做，说明低粉也有机会。`
        : "建议关注这些账号的内容结构，找到可借鉴的切入点。"
      : "账号数据还不够，建议继续观察。",
    tone: accounts.length >= 2 ? "positive" : "neutral",
  });
  items.push({
    sourceLabel: "用户需求",
    fact: commentCount > 0
      ? `已采集 ${commentCount} 条评论数据，说明这个方向已有真实用户在主动搜索和讨论。`
      : `评论数据正在采集中，完成后将自动更新用户需求分析。`,
    inference: commentCount > 0
      ? "评论中的高频词可以直接用作标题和内容切入点。"
      : "内容和账号数据已经能支撑初步判断，评论数据会进一步增强结论。",
    userImpact: commentCount > 0
      ? "可以用评论高频词反推标题和内容切口。"
      : "先基于内容和账号数据开始行动，评论数据到位后可进一步优化方向。",
    tone: commentCount > 0 ? "positive" : "neutral",
  });
  return items;
}

export function createResultCard(params: {
  title: string;
  ctaLabel: string;
  description: string;
  reason: string;
  previewSections: PredictionResultCard["previewSections"];
  continueIf: string[];
  stopIf: string[];
}): PredictionResultCard {
  return {
    ...params,
    evidenceRefs: [],
    actionMode: "open_deep_dive",
  };
}

export function createCards(params: {
  bestActionNow: PredictionBestAction;
  confidenceLabel: PredictionUiResult["confidenceLabel"];
  inputKind: ReturnType<typeof inferInputKind>;
  lowFollowerEvidence: ExtractedLowFollowerEvidence[];
  verdict: PredictionUiResult["verdict"];
  whyNowItems: PredictionWhyNowItem[];
}): Pick<PredictionUiResult, "primaryCard" | "secondaryCard"> {
  const { bestActionNow, confidenceLabel, inputKind, lowFollowerEvidence, verdict, whyNowItems } = params;
  const primaryTitle =
    verdict === "go_now"
      ? inputKind === "content_url"
        ? "这条可以这样拍"
        : inputKind === "account"
          ? "这个号现在能做"
          : "今天直接开拍"
      : verdict === "test_small"
        ? inputKind === "content_url"
          ? "先按这条试一版"
          : inputKind === "account"
            ? "这个号先小试"
            : "先试一条看看"
        : verdict === "observe"
          ? inputKind === "account"
            ? "这个号先观察"
            : "先盯这波"
          : inputKind === "content_url"
            ? "这条先别抄"
            : "这波先别做";
  const secondaryTitle =
    lowFollowerEvidence.length > 0 ? "去看可抄样本" : confidenceLabel === "低" ? "看还差什么" : "继续深挖";

  return {
    primaryCard: createResultCard({
      title: primaryTitle,
      ctaLabel: bestActionNow.ctaLabel,
      description: bestActionNow.description,
      reason: bestActionNow.reason,
      previewSections: [
        {
          title: "这次先拿走什么",
          items: whyNowItems.slice(0, 2).map((item) => item.userImpact),
        },
      ],
      continueIf: ["新增支持账号、支持内容或评论意图时，可升级到更强动作。"],
      stopIf: ["如果方向变化较大，可以考虑调整角度重新分析。"],
    }),
    secondaryCard: createResultCard({
      title: secondaryTitle,
      ctaLabel: lowFollowerEvidence.length > 0 ? "去看可抄样本" : "继续深挖",
      description:
        lowFollowerEvidence.length > 0
          ? "优先看真实低粉样本，确认这波机会有没有可复制的早期结构。"
          : "这次结果还可以继续展开脚本、策略和执行计划。",
      reason:
        lowFollowerEvidence.length > 0
          ? "已有低粉异常样本，最适合先验证可复制性。"
          : "可以继续探索更多角度，让分析结论更加精准。",
      previewSections: [
        {
          title: "为什么是这个备选动作",
          items: [
            lowFollowerEvidence.length > 0
              ? "低粉异常样本已经出现，说明这波机会值得先拿样本做验证。"
              : "当前更适合继续补证据，而不是直接升级执行承诺。",
          ],
        },
      ],
      continueIf: ["下一轮复查若补到更多真实样本，再决定是否升级主动作。"],
      stopIf: ["如果后续证据继续稀疏，就保持观察而不是推进执行。"],
    }),
  };
}
