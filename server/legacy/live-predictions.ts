/**
 * live-predictions.ts
 * ═══════════════════════════════════════════════════════════════
 * 爆款预测主入口 — runLivePrediction
 *
 * 模块拆分说明：
 * - prediction-helpers.ts: 工具函数、类型定义、数据提取
 * - comment-collector.ts: 评论采集和分析
 * - topic-strategy-bridge.ts: 选题策略 V2 分支和结果转换
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LivePredictions");
import { randomUUID } from "node:crypto";
import { buildPredictionArtifacts } from "../../client/src/app/store/prediction-engine.js";
import {
  buildAgentContract,
  getTaskIntentHistoryType,
} from "../../client/src/app/store/agent-runtime.js";
import { classifyIntentWithLLM } from "./intent-agent.js";
import { parseInput } from "./input-parser.js";
import { extractTaskParams } from "./payload-extractor.js";
import type {
  PredictionBestAction,
  PredictionRequestDraft,
  PredictionSafeActionLevel,
  PredictionUiResult,
  PredictionOpportunityType,
  TrendOpportunity,
} from "../../client/src/app/store/prediction-types.js";
import { callLLM } from "./llm-gateway.js";
import { getTikHub, postTikHub } from "./tikhub.js";
import {
  runLowFollowerAlgorithm,
  type RawContentItem,
  type RawAccountItem,
} from "./low-follower-algorithm.js";
import { persistSample } from "./low-follower-cleaner.js";
import { readConnectorStore, resolveCookieSecret } from "./storage.js";
import { runWatchTaskWithFallback } from "./watch-runtime.js";
import type {
  ExecutionStatus,
  SupportedPlatform,
} from "./types.js";

// ── 从拆分模块导入 ──
import {
  clamp,
  countComments,
  countHotSeed,
  createCards,
  createConnectorLike,
  createTask,
  createWhyNowItems,
  dedupeById,
  extractAccounts,
  extractContents,
  extractIdsFromEvidenceItems,
  getCandidatePlatforms,
  getNumber,
  inferInputKind,
  mapLowFollowerEvidence,
  nowIso,
  PLATFORM_NAMES,
  resolveTierLabel,
  type ExtractedAccount,
  type ExtractedContent,
  type PlatformRunSummary,
} from "./prediction-helpers.js";
import { fetchCommentInsight } from "./comment-collector.js";
import { runTopicStrategyBranch } from "./topic-strategy-bridge.js";
import { runViralBreakdownBranch, shouldUseViralBreakdownBranch } from "./viral-breakdown-branch.js";
import { filterContentsByRelevance, filterKeywordsByRelevance } from "./semantic-filter.js";
import { analyzeSampleReplicability } from "./low-follower-advisor.js";

export type ContentSampleItem = {
  title: string;
  platform: string;
  likeCount?: number;
  viewCount?: number;
};
export type AccountSampleItem = {
  displayName: string;
  platform: string;
  followerCount?: number;
  tierLabel?: string;
};
export type ProgressEvent =
  | { type: "platform_start"; platform: string; platformName: string }
  | { type: "platform_done"; platform: string; platformName: string; status: "success" | "failed"; contentCount?: number; hotCount?: number; topContent?: string }
  | { type: "llm_start" }
  | { type: "llm_done" }
  | { type: "cache_hit" }
  | {
      type: "data_collected";
      contentCount: number;
      accountCount: number;
      hotCount: number;
      contentSamples: ContentSampleItem[];
      accountSamples: AccountSampleItem[];
      highlights: string[];
    };

/**
 * 低粉爆款榜数据提取
 * 数据结构: data.data.objs[] 包含 item_id, item_title, nick_name, fans_cnt, play_cnt, like_cnt 等
 */
function extractLowFanBillboardContents(
  payload: unknown,
  platform: SupportedPlatform,
): ExtractedContent[] {
  const contents: ExtractedContent[] = [];
  if (!payload || typeof payload !== "object") return contents;
  
  // 递归查找 objs 数组
  const findObjs = (obj: unknown): unknown[] => {
    if (!obj || typeof obj !== "object") return [];
    if (Array.isArray(obj)) return obj;
    const record = obj as Record<string, unknown>;
    if (Array.isArray(record.objs) && record.objs.length > 0) return record.objs;
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        const found = findObjs(value);
        if (found.length > 0) return found;
      }
    }
    return [];
  };

  const objs = findObjs(payload);
  for (const item of objs) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const contentId = String(rec.item_id || "");
    const title = String(rec.item_title || "");
    if (!contentId || !title || title.length < 3) continue;
    
    const viewCount = typeof rec.play_cnt === "number" ? rec.play_cnt : null;
    const likeCount = typeof rec.like_cnt === "number" ? rec.like_cnt : null;
    const followerCount = typeof rec.fans_cnt === "number" ? rec.fans_cnt : null;
    const authorName = String(rec.nick_name || "未知作者");
    const publishTime = typeof rec.publish_time === "number" ? rec.publish_time : null;
    const coverUrl = typeof rec.item_cover_url === "string" ? rec.item_cover_url : null;
    const contentUrl = platform === "douyin" ? `https://www.douyin.com/video/${contentId}` : undefined;

    contents.push({
      contentId,
      title,
      authorName,
      platform: PLATFORM_NAMES[platform],
      publishedAt: publishTime ? new Date(publishTime * 1000).toISOString() : nowIso(),
      contentUrl,
      coverUrl,
      viewCount,
      likeCount,
      commentCount: null,
      shareCount: null,
      collectCount: null,
      structureSummary: title.slice(0, 48),
      keywordTokens: title.split(/[\s，,、#]+/).filter(Boolean).slice(0, 5),
      whyIncluded: "低粉爆款榜入选",
      authorFollowerCount: followerCount,
    });
  }
  return contents;
}

export async function runLivePrediction(
  draft: PredictionRequestDraft,
  onProgress?: (event: ProgressEvent) => void,
) {
  // ----------------------------------------------------------------
  // Step -1: 如果入口模板是 content-strategy，直接走 V2 Pipeline
  // ----------------------------------------------------------------
  if (draft.entryTemplateId === "content-strategy" || draft.selectedSkillId === "xhs-topic-strategy") {
    return runTopicStrategyBranch(draft);
  }

  // ----------------------------------------------------------------
  // Step -0.5: 如果是爆款拆解模板且有视频链接，走专用拆解分支
  // ----------------------------------------------------------------
  if (shouldUseViralBreakdownBranch(draft)) {
    return runViralBreakdownBranch(draft, onProgress);
  }

  // ----------------------------------------------------------------
  // Step 0: LLM 意图识别（与平台数据采集并行起动，不占用额外时间）
  // ----------------------------------------------------------------
  const intentPromise = classifyIntentWithLLM({
    prompt: draft.prompt,
    selectedSkillId: draft.selectedSkillId,
    entryTemplateId: draft.entryTemplateId,
    hasExternalLinks: draft.evidenceItems.some((item) => /^https?:\/\//.test(item.source)),
    hasMediaItems: draft.evidenceItems.length > 0,
    hasConnectedPlatforms: draft.connectedPlatforms.length > 0,
    modelId: "doubao",
  }).catch((err) => {
    log.warn({ err: err }, "LLM 意图识别失败，降级到正则规则");
    return null;
  });

  // Step 0b: 并行启动 Task Payload 动态提取
  const connectorStore = await readConnectorStore();
  const connectorEntries = Object.entries(connectorStore).filter(([, v]) => v != null);
  const firstConnector = connectorEntries.length > 0 ? connectorEntries[0][1] : null;
  const userProfile = {
    platforms: draft.connectedPlatforms ?? [],
    industries: [] as string[],
    followerCount: undefined as number | undefined,
    accountName: firstConnector?.handle ?? undefined,
  };
  const payloadPromise = extractTaskParams(draft.prompt, true, userProfile).catch((err) => {
    log.warn({ err: err }, "Task Payload 提取失败");
    return null;
  });

  // Step 0c: 如果 Prompt 中包含 URL 或分享口令，并行解析多模态输入
  const hasUrlOrToken = /https?:\/\//.test(draft.prompt) ||
    (draft.evidenceItems.some((item) => /https?:\/\//.test(item.source)));
  const inputParsePromise = hasUrlOrToken
    ? parseInput(draft.prompt).catch((err) => {
        log.warn({ err: err }, "多模态输入解析失败");
        return null;
      })
    : Promise.resolve(null);

  const connectors = getCandidatePlatforms(draft).map((platform) =>
    createConnectorLike(platform, connectorStore[platform]),
  );
  const baseArtifacts = buildPredictionArtifacts(draft, connectors, []);
  const inputKind = inferInputKind(draft);
  const { awemeId, noteId } = extractIdsFromEvidenceItems(draft.evidenceItems);

  // 等待 LLM payload 提取结果，获取多个 searchKeywords
  const extractedPayload = await payloadPromise;
  const originalSeedTopic = baseArtifacts.normalizedBrief.seedTopic;

  // 构建搜索关键词列表（最多 2 个，节省 API 调用量）
  let searchKeywords: string[] = [];
  if (extractedPayload?.searchKeywords?.length) {
    searchKeywords = extractedPayload.searchKeywords;
  } else if (extractedPayload?.keyword?.trim()) {
    searchKeywords = [extractedPayload.keyword.trim()];
  }
  if (searchKeywords.length === 0) {
    if (originalSeedTopic && originalSeedTopic !== "爆款预测" && originalSeedTopic.length > 2) {
      searchKeywords = [originalSeedTopic];
    } else {
      const fallbackKeyword = draft.prompt.replace(/[\s，、？?!低粉有没有机会吗赛道怎么样]+/g, "").slice(0, 8);
      if (fallbackKeyword.length >= 2) {
        searchKeywords = [fallbackKeyword];
      }
    }
  }
  log.info(`搜索关键词: [${searchKeywords.join(", ")}] (original seedTopic: "${originalSeedTopic}")`);

  const effectiveSeedTopic = searchKeywords[0] ?? originalSeedTopic;
  baseArtifacts.normalizedBrief.seedTopic = effectiveSeedTopic;

  // ── Phase 1: 联想词扩展（通过 TikHub 搜索建议和话题建议 API 获取真实趋势关键词）──
  const primaryKeyword = searchKeywords[0];
  if (primaryKeyword && searchKeywords.length <= 2) {
    try {
      const [suggestResp, challengeResp] = await Promise.allSettled([
        postTikHub<Record<string, unknown>>(
          "/api/v1/douyin/search/fetch_search_suggest",
          { keyword: primaryKeyword },
        ),
        postTikHub<Record<string, unknown>>(
          "/api/v1/douyin/search/fetch_challenge_suggest",
          { keyword: primaryKeyword },
        ),
      ]);

      const expandedKeywords = new Set(searchKeywords);

      // 搜索建议词
      if (suggestResp.status === "fulfilled" && suggestResp.value.ok) {
        const suggestPayload = suggestResp.value.payload as Record<string, unknown>;
        const suggestData = suggestPayload?.data as Record<string, unknown> | undefined;
        const sugList = suggestData?.sug_list;
        if (Array.isArray(sugList)) {
          for (const sug of sugList.slice(0, 5)) {
            const content = (sug as Record<string, unknown>)?.content;
            if (typeof content === "string" && content.trim().length >= 2) {
              expandedKeywords.add(content.trim());
            }
          }
        }
      }

      // 话题建议词
      if (challengeResp.status === "fulfilled" && challengeResp.value.ok) {
        const challengePayload = challengeResp.value.payload as Record<string, unknown>;
        const challengeData = challengePayload?.data as Record<string, unknown> | undefined;
        const challengeList = challengeData?.challenge_list;
        if (Array.isArray(challengeList)) {
          for (const ch of challengeList.slice(0, 5)) {
            const chaName = (ch as Record<string, unknown>)?.cha_name;
            if (typeof chaName === "string" && chaName.trim().length >= 2) {
              expandedKeywords.add(chaName.trim());
            }
          }
        }
      }

      // 限制最多 5 个关键词，避免过多 API 调用
      searchKeywords = [...expandedKeywords].slice(0, 5);
      log.info(`联想词扩展后关键词: [${searchKeywords.join(", ")}] (共 ${searchKeywords.length} 个)`);
    } catch (err) {
      log.warn({ err }, "联想词扩展失败，使用原始关键词继续");
    }
  }

  const runs: PlatformRunSummary[] = [];

  // 对每个平台，用所有 searchKeywords 并行搜索，合并结果
  // ★ 所有平台并行执行，避免顺序等待导致超时
  const candidatePlatforms = getCandidatePlatforms(draft);
  const platformPromises = candidatePlatforms.map(async (platform) => {
    const platformName = PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] ?? platform;
    onProgress?.({ type: "platform_start", platform, platformName });

    const connector = connectorStore[platform];
    const cookie =
      platform === "douyin" && connector?.authMode === "cookie"
        ? await resolveCookieSecret(connector.encryptedSecretRef)
        : undefined;

    const keywordTasks = searchKeywords.map((kw) => {
      const task = createTask({
        artifactId: `live_artifact_${randomUUID()}`,
        draft,
        platform,
        connector,
        inputKind,
        seedTopic: kw,
        awemeId,
        noteId,
      });
      return task;
    });

    const validTasks = keywordTasks.filter((t): t is NonNullable<typeof t> => t !== null);
    if (validTasks.length === 0) return null;

    const taskResults = await Promise.allSettled(
      validTasks.map((task) =>
        runWatchTaskWithFallback({
          task,
          runId: `live_run_${randomUUID()}`,
          cookie: cookie ?? undefined,
        }),
      ),
    );

    let mergedRun: PlatformRunSummary | null = null;
    for (const result of taskResults) {
      if (result.status === "fulfilled") {
        const response = result.value;
        if (!mergedRun) {
          mergedRun = {
            platform,
            executionStatus: response.run.executionStatus,
            degradeFlags: response.run.degradeFlags,
            usedRouteChain: response.run.usedRouteChain,
            snapshot: response.run.snapshot,
          };
        } else if (response.run.snapshot) {
          const base = mergedRun.snapshot ?? {};
          const extra = response.run.snapshot;
          for (const [key, value] of Object.entries(extra)) {
            if (!base[key]) {
              (base as Record<string, unknown>)[key] = value;
            } else if (Array.isArray(base[key]) && Array.isArray(value)) {
              (base as Record<string, unknown[]>)[key] = [...(base[key] as unknown[]), ...(value as unknown[])];
            }
          }
          mergedRun.snapshot = base;
        }
      }
    }
    // 从 snapshot 中提取数据摘要，让前端在平台完成时就能展示部分数据
    let pContentCount = 0;
    let pHotCount = 0;
    let pTopContent: string | undefined;
    if (mergedRun?.snapshot?.capabilityResults && Array.isArray(mergedRun.snapshot.capabilityResults)) {
      for (const item of mergedRun.snapshot.capabilityResults) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const cap = typeof rec.capability === "string" ? rec.capability : "";
        if (cap === "keyword_content_search" || cap === "homepage_content") {
          const payload = rec.payload;
          if (payload && typeof payload === "object") {
            const items = (payload as Record<string, unknown>).items;
            if (Array.isArray(items)) {
              pContentCount += items.length;
              // 取第一条内容标题作为亮点
              if (!pTopContent && items.length > 0) {
                const first = items[0] as Record<string, unknown> | undefined;
                const desc = first?.desc ?? first?.title ?? first?.share_info;
                if (typeof desc === "string" && desc.length > 0) {
                  pTopContent = desc.slice(0, 30);
                }
              }
            }
          }
        } else if (cap === "hot_seed") {
          const payload = rec.payload;
          if (payload && typeof payload === "object") {
            const items = (payload as Record<string, unknown>).items;
            if (Array.isArray(items)) pHotCount += items.length;
          }
        }
      }
    }
    onProgress?.({
      type: "platform_done",
      platform,
      platformName,
      status: mergedRun ? "success" : "failed",
      contentCount: pContentCount > 0 ? pContentCount : undefined,
      hotCount: pHotCount > 0 ? pHotCount : undefined,
      topContent: pTopContent,
    });
    return mergedRun;
  });

  const platformResults = await Promise.allSettled(platformPromises);
  for (const result of platformResults) {
    if (result.status === "fulfilled" && result.value) {
      runs.push(result.value);
    }
  }

  if (runs.length === 0) {
    throw new Error("当前真实模式没有可执行的平台任务。请先连接抖音或小红书，或改用演示数据模式。");
  }

  const allFailed = runs.every((run) => run.executionStatus === "failed");
  if (allFailed) {
    // 检测是否因为 TikHub 余额不足（402）导致全部失败
    const allCapabilityResults = runs.flatMap((run) =>
      Array.isArray(run.snapshot?.capabilityResults) ? run.snapshot.capabilityResults : []
    );
    const has402 = allCapabilityResults.some(
      (r) => r && typeof r === "object" && (r as Record<string, unknown>).httpStatus === 402
    );
    if (has402) {
      throw new Error(
        "数据服务账户余额不足，无法获取实时数据。请联系管理员充值 TikHub 账户后重试，或切换到演示数据模式。"
      );
    }
    // 降级策略：搜索接口暂时不稳定时，尝试用其他已连接平台补充数据
    // 如果用户只选了部分平台且这些平台全失败，自动扩展到其他已连接平台
    const selectedOnly = draft.selectedPlatforms.length > 0 &&
      draft.selectedPlatforms.length < draft.connectedPlatforms.length;
    const failedPlatformSet = new Set(runs.map((r) => r.platform));
    const fallbackPlatforms = draft.connectedPlatforms.filter(
      (p) => !failedPlatformSet.has(p as SupportedPlatform) &&
        (p === "douyin" || p === "xiaohongshu" || p === "kuaishou")
    ) as SupportedPlatform[];
    if (selectedOnly && fallbackPlatforms.length > 0) {
      // 尝试用备用平台补充数据
      const fallbackPromises = fallbackPlatforms.map(async (platform) => {
        const platformName = PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] ?? platform;
        onProgress?.({ type: "platform_start", platform, platformName });
        const connector = connectorStore[platform];
        const fallbackTask = createTask({
          artifactId: `live_artifact_fallback_${randomUUID()}`,
          draft,
          platform,
          connector,
          inputKind,
          seedTopic: effectiveSeedTopic,
          awemeId,
          noteId,
        });
        if (!fallbackTask) return null;
        try {
          const result = await runWatchTaskWithFallback({
            task: fallbackTask,
            runId: `live_run_fallback_${randomUUID()}`,
          });
          onProgress?.({
            type: "platform_done",
            platform,
            platformName,
            status: result.run.executionStatus !== "failed" ? "success" : "failed",
          });
          return {
            platform,
            executionStatus: result.run.executionStatus,
            degradeFlags: result.run.degradeFlags,
            usedRouteChain: result.run.usedRouteChain,
            snapshot: result.run.snapshot,
          } as PlatformRunSummary;
        } catch {
          onProgress?.({ type: "platform_done", platform, platformName, status: "failed" });
          return null;
        }
      });
      const fallbackResults = await Promise.allSettled(fallbackPromises);
      for (const r of fallbackResults) {
        if (r.status === "fulfilled" && r.value && r.value.executionStatus !== "failed") {
          runs.push(r.value);
        }
      }
    }
    // 如果补充后仍然全部失败，降级为热榜信号模式继续执行（不抛出错误）
    const stillAllFailed = runs.every((run) => run.executionStatus === "failed");
    if (stillAllFailed) {
      log.warn("所有平台搜索接口暂时不可用，降级为热榜信号模式继续分析");
      // 继续执行，用空内容数据 + LLM 基于热榜信号给出分析
    }
  }

  const allAccounts: ExtractedAccount[] = [];
  const allContents: ExtractedContent[] = [];
  const usedRouteChain: string[] = [];
  const degradeFlags = new Set<string>();
  let hotSeedCount = 0;
  let commentCount = 0;

  for (const run of runs) {
    for (const flag of run.degradeFlags) {
      degradeFlags.add(flag);
    }
    for (const chain of run.usedRouteChain) {
      if (!usedRouteChain.includes(chain)) {
        usedRouteChain.push(chain);
      }
    }
    const capabilityResults = Array.isArray(run.snapshot.capabilityResults)
      ? run.snapshot.capabilityResults
      : [];
    for (const item of capabilityResults) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const capability =
        typeof record.capability === "string" ? record.capability : "unknown_capability";
      const payload = record.payload;
      allAccounts.push(...extractAccounts(run.platform, capability, payload));
      allContents.push(...extractContents(run.platform, capability, payload));
      if (capability === "hot_seed") {
        hotSeedCount += countHotSeed(payload);
      }
      if (capability === "comments") {
        commentCount += countComments(payload);
      }
      // 低粉爆款榜数据提取：data.data.objs[] 结构与标准 aweme_info 不同，需要单独处理
      if (capability === "low_fan_billboard" && payload && typeof payload === "object") {
        const objs = extractLowFanBillboardContents(payload, run.platform);
        allContents.push(...objs);
        log.info(`低粉爆款榜提取: ${objs.length} 条内容`);
      }
      if (capability === "hot_search_billboard" || capability === "hot_word_billboard") {
        hotSeedCount += countHotSeed(payload);
      }
    }
  }

  // 级联调用：对搜索结果中的账号并发调用 account_profile 补全粉丝/关注/获赞数
  const rawAccounts = dedupeById(allAccounts, "accountId");
  const accountsToEnrich = rawAccounts
    .filter((acc) => acc.platform === "抖音" && acc.accountId.startsWith("MS4w"))
    .slice(0, 6);
  if (accountsToEnrich.length > 0) {
    const enrichResults = await Promise.allSettled(
      accountsToEnrich.map(async (acc) => {
        try {
          const resp = await getTikHub<Record<string, unknown>>(
            "/api/v1/douyin/web/handler_user_profile_v4",
            { sec_user_id: acc.accountId },
          );
          if (resp.payload) {
            const d = (resp.payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
            const userInfo = (d?.user as Record<string, unknown>) ?? (d?.user_info as Record<string, unknown>) ?? undefined;
            if (userInfo) {
              const rawFollowerCount =
                typeof userInfo.mplatform_followers_count === "number" ? userInfo.mplatform_followers_count :
                typeof userInfo.follower_count === "number" ? userInfo.follower_count : undefined;
              // 防御：API 返回 0 粉丝数视为无效数据，保留原值
              const followerCount = (rawFollowerCount != null && rawFollowerCount > 0) ? rawFollowerCount : acc.followerCount;
              const followingCount = typeof userInfo.following_count === "number" ? userInfo.following_count : acc.followingCount;
              const totalLikeCount = typeof userInfo.total_favorited === "string" ? Number(userInfo.total_favorited) :
                typeof userInfo.total_favorited === "number" ? userInfo.total_favorited : acc.totalLikeCount;
              return {
                accountId: acc.accountId,
                followerCount,
                followingCount,
                totalLikeCount,
                displayName: typeof userInfo.nickname === "string" ? userInfo.nickname : acc.displayName,
                handle: typeof userInfo.unique_id === "string" ? userInfo.unique_id : acc.handle,
              };
            }
          }
        } catch {
          // 级联调用失败不影响主流程
        }
        return null;
      })
    );
    for (const result of enrichResults) {
      if (result.status === "fulfilled" && result.value) {
        const enriched = result.value;
        const idx = rawAccounts.findIndex((a) => a.accountId === enriched.accountId);
        if (idx >= 0) {
          rawAccounts[idx] = {
            ...rawAccounts[idx],
            followerCount: enriched.followerCount ?? rawAccounts[idx].followerCount,
            followingCount: enriched.followingCount ?? rawAccounts[idx].followingCount,
            totalLikeCount: enriched.totalLikeCount ?? rawAccounts[idx].totalLikeCount,
            displayName: enriched.displayName,
            handle: enriched.handle,
            tierLabel: resolveTierLabel(enriched.followerCount ?? rawAccounts[idx].followerCount),
          };
        }
      }
    }
  }

   const supportingAccounts = rawAccounts.slice(0, 10);
  // ── 语义相关性过滤：扩大候选池，用 LLM 过滤噪音 ──
  const allDedupedContents = dedupeById(allContents, "contentId");
  const candidateContents = allDedupedContents.slice(0, 30); // 扩大候选池
  let supportingContents: ExtractedContent[];
  if (candidateContents.length > 0 && effectiveSeedTopic && effectiveSeedTopic.length >= 2) {
    try {
      const candidates = candidateContents.map((c) => ({
        id: c.contentId,
        title: c.title ?? "",
        authorName: c.authorName,
        tags: c.keywordTokens,
      }));
      const { passedIds } = await filterContentsByRelevance(candidates, effectiveSeedTopic, 7);
      const filtered = candidateContents.filter((c) => passedIds.has(c.contentId));
      // 如果过滤后数量太少（<3），降低阈值重试
      if (filtered.length < 3 && candidateContents.length >= 3) {
        const { passedIds: relaxedIds } = await filterContentsByRelevance(candidates, effectiveSeedTopic, 5);
        const relaxedFiltered = candidateContents.filter((c) => relaxedIds.has(c.contentId));
        supportingContents = relaxedFiltered.slice(0, 10);
        log.info(`语义过滤（宽松阈值5）: ${candidateContents.length} → ${relaxedFiltered.length} 条`);
      } else {
        supportingContents = filtered.slice(0, 10);
        log.info(`语义过滤: ${candidateContents.length} → ${filtered.length} 条`);
      }
    } catch (err) {
      log.warn({ err }, "语义过滤失败，使用原始数据");
      supportingContents = candidateContents.slice(0, 10);
    }
  } else {
    supportingContents = candidateContents.slice(0, 10);
  }
  // 关联过滤：只保留相关内容的作者账号
  const relevantAuthorNames = new Set(supportingContents.map((c) => c.authorName));
  const filteredAccounts = supportingAccounts.filter(
    (a) => relevantAuthorNames.has(a.displayName ?? "") || relevantAuthorNames.has(a.handle ?? "")
  );
  // 如果关联过滤后账号太少，保留原始账号
  if (filteredAccounts.length >= 2) {
    supportingAccounts.length = 0;
    supportingAccounts.push(...filteredAccounts.slice(0, 6));
  }
  // 向前端推送已采集数据样本，让用户在等待 LLM 分析期间就能看到真实数据
  if (onProgress) {
    const contentSamples: ContentSampleItem[] = supportingContents.slice(0, 4).map((c) => ({
      title: c.title ?? "无标题",
      platform: c.platform,
      likeCount: c.likeCount ?? undefined,
      viewCount: c.viewCount ?? undefined,
    }));
    const accountSamples: AccountSampleItem[] = supportingAccounts.slice(0, 3).map((a) => ({
      displayName: a.displayName ?? a.handle ?? "未知账号",
      platform: a.platform,
      followerCount: a.followerCount ?? undefined,
      tierLabel: a.tierLabel,
    }));
    // 生成事实数据亮点：选取最高赞内容和大粉账号作为亮点信号
    const highlights: string[] = [];
    // 最高赞内容
    const topByLike = [...supportingContents]
      .filter((c) => c.likeCount != null && c.likeCount > 0)
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      .slice(0, 2);
    for (const c of topByLike) {
      const likeStr = c.likeCount != null && c.likeCount >= 10000
        ? `${(c.likeCount / 10000).toFixed(1)}万`
        : c.likeCount != null ? c.likeCount.toLocaleString() : null;
      const title = (c.title ?? "").slice(0, 18);
      if (title && likeStr) {
        highlights.push(`发现「${title}」点赞 ${likeStr}`);
      }
    }
    // 最高粉账号
    const topByFollower = [...supportingAccounts]
      .filter((a) => a.followerCount != null && a.followerCount > 0)
      .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
      .slice(0, 1);
    for (const a of topByFollower) {
      const followerStr = a.followerCount != null && a.followerCount >= 10000
        ? `${(a.followerCount / 10000).toFixed(0)}万`
        : a.followerCount != null ? a.followerCount.toLocaleString() : null;
      const name = a.displayName ?? a.handle ?? "";
      if (name && followerStr) {
        highlights.push(`对标账号「${name}」拥有 ${followerStr} 粉丝`);
      }
    }
    // 热榜信号
    if (hotSeedCount > 0 && highlights.length < 2) {
      highlights.push(`捕捉到 ${hotSeedCount} 条热榜信号，AI 正在分析趋势模式`);
    }
    onProgress({
      type: "data_collected",
      contentCount: supportingContents.length,
      accountCount: supportingAccounts.length,
      hotCount: hotSeedCount,
      contentSamples,
      accountSamples,
      highlights,
    });
  }
  // ── 粉丝数回填 ──
  const enrichedFollowerMap = new Map<string, number>();
  for (const acc of rawAccounts) {
    if (acc.followerCount != null && acc.followerCount > 0) {
      if (acc.displayName) enrichedFollowerMap.set(acc.displayName, acc.followerCount);
      enrichedFollowerMap.set(acc.accountId, acc.followerCount);
    }
  }
  for (const c of supportingContents) {
    const enrichedFollower = enrichedFollowerMap.get(c.authorName);
    if (enrichedFollower != null && enrichedFollower > 0) {
      (c as ExtractedContent).authorFollowerCount = enrichedFollower;
    }
  }
  // ── 评论二次采集 ──
  const commentInsight = await fetchCommentInsight(supportingContents, commentCount);
  if (commentInsight) {
    commentCount = Math.max(commentCount, commentInsight.totalCommentsCollected);
    // ── 评论高频词语义过滤：剔除与赛道无关的噪音词 ──
    if (commentInsight.highFreqKeywords.length > 0 && effectiveSeedTopic && effectiveSeedTopic.length >= 2) {
      try {
        const filteredKeywords = await filterKeywordsByRelevance(
          commentInsight.highFreqKeywords,
          effectiveSeedTopic,
        );
        log.info(`评论高频词过滤: ${commentInsight.highFreqKeywords.length} → ${filteredKeywords.length} 个`);
        commentInsight.highFreqKeywords = filteredKeywords;
      } catch (err) {
        log.warn({ err }, "评论高频词语义过滤失败，保留原始数据");
      }
    }
  }

  const lowFollowerEvidence = mapLowFollowerEvidence(supportingContents);

  // ── P3: 低粉归因 LLM 动态生成差异化拆解结论 ──
  if (lowFollowerEvidence.length > 0) {
    try {
      // 构造 LowFollowerSample 格式的数据供 analyzeSampleReplicability 使用
      const samplesForAnalysis = lowFollowerEvidence.map((ev) => ({
        contentId: ev.id,
        authorId: ev.account,
        authorName: ev.account,
        title: ev.title,
        platform: ev.platform === "抖音" ? "douyin" : ev.platform === "小红书" ? "xiaohongshu" : ev.platform === "快手" ? "kuaishou" : ev.platform === "B站" ? "bilibili" : "douyin",
        followerCount: ev.fansCount || 0,
        viewCount: 0,
        interactionCount: (ev.likeCount ?? 0) + (ev.commentCount ?? 0) + (ev.shareCount ?? 0) + (ev.collectCount ?? 0),
        weightedInteraction: 0,
        fanEfficiencyRatio: 0,
        engagementRate: 0,
        viewToFollowerRatio: 0,
        engagementBenchmarkMultiplier: 0,
        anomalyScore: ev.anomaly,
        publishedAt: ev.publishedAt ?? null,
        ageDays: 0,
        contentUrl: ev.contentUrl ?? null,
        coverUrl: ev.coverUrl ?? null,
        tags: ev.trackTags ?? [],
        isStrictAnomaly: true,
        detectedAt: new Date().toISOString(),
        likeCount: ev.likeCount ?? 0,
        commentCount: ev.commentCount ?? 0,
        shareCount: ev.shareCount ?? 0,
        saveCount: ev.collectCount ?? 0,
      })) as any[];

      const analyses = await analyzeSampleReplicability(samplesForAnalysis, effectiveSeedTopic);
      // 用 LLM 生成的 whyItWorked 覆盖硬编码的 suggestion
      for (const analysis of analyses) {
        const match = lowFollowerEvidence.find(
          (ev) => ev.id === analysis.sampleId || ev.title === analysis.title,
        );
        if (match && analysis.whyItWorked) {
          match.suggestion = analysis.whyItWorked;
        }
      }
      log.info(`低粉归因 LLM 拆解完成: ${analyses.length} 条差异化结论`);
    } catch (err) {
      log.warn({ err }, "低粉归因 LLM 拆解失败，保留默认 suggestion");
    }
  }

  // ── 低粉爆款 V2 算法运行 + 入库 ──
  // 注意：rawContentsForAlgo 使用 authorName 作为 authorId，
  // 因此 rawAccountsForAlgo 也必须用 authorName 作为 accountId 才能在 followerLookup 中命中
  const rawContentsForAlgo: RawContentItem[] = supportingContents.map((c) => ({
    contentId: c.contentId,
    authorId: c.authorName,  // key 必须与 rawAccountsForAlgo 的 accountId 一致
    authorName: c.authorName,
    title: c.title,
    platform: (c.platform === "抖音" ? "douyin" : c.platform === "小红书" ? "xiaohongshu" : c.platform === "快手" ? "kuaishou" : c.platform === "B站" ? "bilibili" : "douyin") as RawContentItem["platform"],
    viewCount: c.viewCount,
    likeCount: c.likeCount,
    commentCount: c.commentCount,
    shareCount: c.shareCount,
    saveCount: c.collectCount,
    publishedAt: c.publishedAt || null,
    contentUrl: c.contentUrl ?? null,
    coverUrl: c.coverUrl ?? null,
    tags: c.keywordTokens,
  }));
  const rawAccountsForAlgo: RawAccountItem[] = [];
  const seenAccountKeys = new Set<string>();
  for (const a of supportingAccounts) {
    // 防御：粉丝数为 null/undefined/0 均视为无效，跳过以防污染低粉爆款数据
    if (a.followerCount == null || a.followerCount <= 0) continue;
    const platform = (a.platform === "抖音" ? "douyin" : a.platform === "小红书" ? "xiaohongshu" : a.platform === "快手" ? "kuaishou" : a.platform === "B站" ? "bilibili" : "douyin") as RawAccountItem["platform"];
    if (!seenAccountKeys.has(a.accountId)) {
      seenAccountKeys.add(a.accountId);
      rawAccountsForAlgo.push({ accountId: a.accountId, followerCount: a.followerCount, platform });
    }
    if (a.displayName && !seenAccountKeys.has(a.displayName)) {
      seenAccountKeys.add(a.displayName);
      rawAccountsForAlgo.push({ accountId: a.displayName, followerCount: a.followerCount, platform });
    }
  }
  for (const c of supportingContents) {
    // 防御：粉丝数必须 > 0 才有效
    if (c.authorFollowerCount != null && c.authorFollowerCount > 0 && !seenAccountKeys.has(c.authorName)) {
      seenAccountKeys.add(c.authorName);
      const platform = (c.platform === "抖音" ? "douyin" : c.platform === "小红书" ? "xiaohongshu" : c.platform === "快手" ? "kuaishou" : c.platform === "B站" ? "bilibili" : "douyin") as RawAccountItem["platform"];
      rawAccountsForAlgo.push({ accountId: c.authorName, followerCount: c.authorFollowerCount, platform });
    }
  }
  // 补丁：supportingAccounts 中的 accountId 可能是平台 UID（如 MS4w...），
  // 而 rawContentsForAlgo 的 authorId 是 authorName（昵称），两者不一致导致 followerLookup 命中率为 0。
  // 这里额外把 displayName → followerCount 也注入 rawAccountsForAlgo，确保命中。
  for (const a of supportingAccounts) {
    if (a.followerCount == null || a.followerCount <= 0) continue;
    const platform = (a.platform === "抖音" ? "douyin" : a.platform === "小红书" ? "xiaohongshu" : a.platform === "快手" ? "kuaishou" : a.platform === "B站" ? "bilibili" : "douyin") as RawAccountItem["platform"];
    // displayName 通常等于 authorName，补充进去确保命中
    if (a.displayName && !seenAccountKeys.has(a.displayName)) {
      seenAccountKeys.add(a.displayName);
      rawAccountsForAlgo.push({ accountId: a.displayName, followerCount: a.followerCount, platform });
    }
  }
  const algoResult = runLowFollowerAlgorithm(rawContentsForAlgo, rawAccountsForAlgo);
  log.info(`低粉爆款算法结果: contents=${rawContentsForAlgo.length}, accounts=${rawAccountsForAlgo.length}, samples=${algoResult.samples.length}, p75=${algoResult.p75InteractionBenchmark}, floor=${algoResult.dynamicFollowerFloor}`);
  if (algoResult.samples.length > 0) {
    const runId = `lfrun_live_${Date.now()}`;
    Promise.allSettled(
      algoResult.samples.map((sample) =>
        persistSample(
          sample,
          runId,
          effectiveSeedTopic,
          baseArtifacts.normalizedBrief.industry,
          algoResult.p75InteractionBenchmark,
          algoResult.dynamicFollowerFloor,
        ),
      ),
    ).then((results) => {
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      log.info(`低粉爆款入库完成: ${succeeded}/${algoResult.samples.length} 条`);
    }).catch((err) => {
      log.warn({ err: err }, "低粉爆款入库失败");
    });
  }

  const kolCount = supportingAccounts.filter(
    (item) => item.tierLabel === "head_kol" || item.tierLabel === "standard_kol",
  ).length;
  const kocCount = supportingAccounts.filter(
    (item) => item.tierLabel === "strong_koc" || item.tierLabel === "standard_koc",
  ).length;
  const newCreatorCount = supportingAccounts.filter(
    (item) => item.followerCount !== null && item.followerCount <= 10_000,
  ).length;
  // ── 异常数据平滑处理：避免出现 "10000%" 等不合理数值 ──
  const rawLowFollowerAnomalyRatio =
    supportingContents.length > 0
      ? (lowFollowerEvidence.length / supportingContents.length) * 100
      : 0;
  // 异常占比上限 80%（低粉爆款数 > 总内容数的 80% 不合理）
  const lowFollowerAnomalyRatio = Math.min(Math.round(rawLowFollowerAnomalyRatio), 80);

  const rawGrowth7d = hotSeedCount * 8 + supportingContents.length * 6 + supportingAccounts.length * 5;
  // 增长率上限 300%（超过此值显示为“数据积累中”）
  const growth7d = Math.min(clamp(rawGrowth7d), 300);
  const evidenceGaps = [
    supportingAccounts.length === 0 ? "当前缺少足够的支持账号样本。" : null,
    supportingContents.length === 0 ? "当前缺少足够的支持内容样本。" : null,
    commentCount === 0 ? "评论数据可以进一步采集，补充后分析会更精准。" : null,
  ].filter((item): item is string => Boolean(item));
  const executionStatus: ExecutionStatus =
    runs.some((run) => run.executionStatus === "partial_success") ||
    runs.some((run) => run.executionStatus === "failed")
      ? "partial_success"
      : "success";
  const confidenceLabel =
    executionStatus === "success" && supportingContents.length >= 3 && supportingAccounts.length >= 2
      ? "高"
      : supportingContents.length >= 2 || supportingAccounts.length >= 1
        ? "中"
        : "低";
  const verdict =
    supportingContents.length >= 4 && supportingAccounts.length >= 2 && evidenceGaps.length === 0
      ? "go_now"
      : lowFollowerEvidence.length > 0 || supportingContents.length >= 2
        ? "test_small"
        : supportingContents.length > 0 || hotSeedCount > 0
          ? "observe"
          : "not_now";
  const windowStrength =
    verdict === "go_now"
      ? "strong_now"
      : verdict === "test_small"
        ? "validate_first"
        : verdict === "observe"
          ? "observe"
          : "avoid";
  const safeActionLevel: PredictionSafeActionLevel =
    verdict === "go_now"
      ? "shoot_now"
      : verdict === "test_small"
        ? "test_one"
        : verdict === "observe"
          ? "watch_first"
          : "not_now";
  const bestActionNow: PredictionBestAction =
    inputKind === "content_url"
      ? {
          type: "breakdown",
          title: "先看结构拆解",
          description: "优先拆当前链接里真正跑起来的结构部件，再决定要不要照着拍。",
          ctaLabel: "看可抄点",
          reason: "这是内容链接输入场景，最优动作是先拆结构，不是直接重投。",
        }
      : inputKind === "account"
        ? {
            type: "account_benchmark",
            title: "先看账号打法",
            description: "这次先解决这个号能不能接、该怎么接，而不是泛化找更多热点。",
            ctaLabel: "看账号打法",
            reason: "这是账号诊断场景，账号承接能力比泛热点更重要。",
          }
        : verdict === "go_now" && confidenceLabel !== "低"
          ? {
              type: "generate_test_brief",
              title: "今天直接开拍",
              description: "真实样本和市场扩散已经补齐，适合直接进入开拍方案。",
              ctaLabel: "拿开拍方案",
              reason: "当前真实证据足以支撑直接进入执行层。",
            }
          : lowFollowerEvidence.length > 0
            ? {
                type: "low_follower_validation",
                title: "先试一条看看",
                description: "先拿真实低粉样本做验证，确认这波机会是不是可复制。",
                ctaLabel: "去看可抄样本",
                reason: "已经出现低粉异常样本，最适合先做可复制性验证。",
              }
            : {
                type: "monitor",
                title: verdict === "not_now" ? "先关注这个方向" : "持续跟踪这波",
                description: "可以先建立监控，系统会自动追踪并在有新变化时提醒你。",
                ctaLabel: verdict === "not_now" ? "查看分析要点" : "查看跟踪重点",
                reason: "还有可以进一步探索的方向，建立监控后系统会自动积累数据。",
              };
  const opportunityType =
    inputKind === "content_url"
      ? "structure_window"
      : inputKind === "account"
        ? "fit_window"
        : lowFollowerEvidence.length > 0
          ? "anomaly_window"
          : hotSeedCount > 0
            ? "search_window"
            : "false_heat";
  const whyNowItems = createWhyNowItems({
    accounts: supportingAccounts,
    commentCount,
    contents: supportingContents,
    degradeFlags: [...degradeFlags],
    hotSeedCount,
    usedPlatforms: runs.map((run) => PLATFORM_NAMES[run.platform]),
  });
  const cards = createCards({
    bestActionNow,
    confidenceLabel,
    inputKind,
    lowFollowerEvidence,
    verdict,
    whyNowItems,
  });
  // score 受 verdict 约束
  const rawScore = clamp(
    45 +
      supportingContents.length * 8 +
      supportingAccounts.length * 6 +
      hotSeedCount * 3 -
      evidenceGaps.length * 10,
  );
  // score 上限 95，避免出现 "100" 等绝对化数值
  const verdictScoreCap =
    verdict === "go_now" ? 95 :
    verdict === "test_small" ? 79 :
    verdict === "observe" ? 64 : 49;
  const opportunityScore = Math.min(rawScore, verdictScoreCap);
  const scoreBreakdown = {
    demand: clamp(35 + hotSeedCount * 9 + supportingContents.length * 5),
    competition: clamp(30 + kolCount * 12 + supportingAccounts.length * 4),
    anomaly: clamp(lowFollowerAnomalyRatio + lowFollowerEvidence.length * 8),
    fit: clamp(inputKind === "account" ? 72 : 58 + supportingAccounts.length * 4),
    opportunity: opportunityScore,
    timing: growth7d,
    risk: clamp(evidenceGaps.length * 18 + (executionStatus === "partial_success" ? 18 : 8)),
  };
  const result: Partial<PredictionUiResult> & Record<string, unknown> = {
    type:
      inputKind === "account"
        ? "账号诊断"
        : inputKind === "content_url"
          ? "爆款拆解"
          : "爆款预测",
    platform: runs.map((run) => PLATFORM_NAMES[run.platform]),
    score: opportunityScore,
    scoreLabel:
      verdict === "go_now" ? "强推" :
      verdict === "test_small" ? "值得试" :
      verdict === "observe" ? "观望" : "谨慎",
    verdict,
    confidenceLabel,
    opportunityTitle: `${baseArtifacts.normalizedBrief.seedTopic} · 机会判断`,
    opportunityType,
    windowStrength,
    coreBet: (() => {
      const topic = baseArtifacts.normalizedBrief.seedTopic;
      const topAuthors = supportingContents.slice(0, 3).map((c) => c.authorName).filter(Boolean);
      const topKeywords = supportingContents.flatMap((c) => c.keywordTokens).slice(0, 5);
      const kwStr = topKeywords.length > 0 ? topKeywords.join("、") : topic;
      const authorStr = topAuthors.length > 0 ? topAuthors.join("、") : "多个创作者";
      if (verdict === "go_now") {
        return `「${kwStr}」方向已有 ${supportingContents.length} 条真实内容跑通，${authorStr}等已验证可行性，可以直接进入执行。`;
      }
      if (verdict === "test_small") {
        return `「${kwStr}」方向已出现 ${supportingContents.length} 条真实样本，但${lowFollowerEvidence.length > 0 ? `低粉爆款仅 ${lowFollowerEvidence.length} 条` : "样本量偏少"}，建议先拍一条小样验证可复制性。`;
      }
      if (verdict === "observe") {
        return `「${kwStr}」方向有初步信号（${supportingContents.length} 条内容、${supportingAccounts.length} 个账号），但还不足以判断是否值得重投，建议先观察。`;
      }
      return `「${kwStr}」方向当前证据不足（仅 ${supportingContents.length} 条内容、${evidenceGaps.length} 项缺口），不建议直接做。`;
    })(),
    decisionBoundary: (() => {
      const topic = baseArtifacts.normalizedBrief.seedTopic;
      if (verdict === "go_now") {
        return `${supportingContents.length} 条内容 + ${supportingAccounts.length} 个账号已补齐，「${topic}」可以直接进入执行。`;
      }
      if (verdict === "test_small") {
        return `建议先拍 1 条「${topic}」方向的小样，看完播和互动数据再决定是否放大投入。`;
      }
      if (verdict === "observe") {
        return `「${topic}」还缺 ${evidenceGaps.length} 项关键证据，建议继续观察 7 天再重新判断。`;
      }
      return `「${topic}」当前不建议做，缺少足够的市场验证样本。`;
    })(),

    marketEvidence: {
      evidenceWindowLabel: `实时抓取 · ${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`,
      momentumLabel:
        hotSeedCount >= 5 ? "accelerating" : evidenceGaps.length >= 2 ? "cooling" : "emerging",
      kolCount,
      kocCount,
      newCreatorCount,
      similarContentCount: supportingContents.length,
      growth7d,
      lowFollowerAnomalyRatio,
      timingLabel:
        executionStatus === "success"
          ? `已采集 ${supportingContents.length} 条内容、${supportingAccounts.length} 个账号，可直接进入动作编排。`
          : `已采集 ${supportingContents.length} 条内容、${supportingAccounts.length} 个账号，建议先做小样验证。`,
      tierBreakdown: {
        headKol: supportingAccounts.filter((item) => item.tierLabel === "head_kol").length,
        standardKol: supportingAccounts.filter((item) => item.tierLabel === "standard_kol").length,
        strongKoc: supportingAccounts.filter((item) => item.tierLabel === "strong_koc").length,
        standardKoc: supportingAccounts.filter((item) => item.tierLabel === "standard_koc").length,
      },
    },
    supportingAccounts,
    supportingContents,
    lowFollowerEvidence,
    evidenceGaps,
    whyNowItems,
    bestFor:
      inputKind === "account"
        ? [`已完成账号连接，需要判断这个号能不能接这波机会。本次采集到 ${supportingAccounts.length} 个相关账号和 ${supportingContents.length} 条内容样本。`]
        : [`已采集 ${supportingContents.length} 条真实内容、${supportingAccounts.length} 个账号${hotSeedCount > 0 ? `、${hotSeedCount} 条热榜/热词` : ""}，可以基于这些样本快速判断是否值得下注。`],
    notFor:
      evidenceGaps.length > 0
        ? [`还有${evidenceGaps.join("、")}等方向可以进一步探索（共 ${evidenceGaps.length} 个方向），追加数据后分析会更精准。`]
        : ["如果你只想看历史榜单而不关心动作编排，这页不是纯数据看板。"],
    accountMatchSummary:
      inputKind === "account"
        ? `本次采集到 ${supportingAccounts.length} 个账号、${supportingContents.length} 条内容，优先回答"这个号现在能不能接、该怎么接"。`
        : confidenceLabel === "高"
          ? `已采集 ${supportingContents.length} 条内容和 ${supportingAccounts.length} 个账号，证据足够收口到一条主路径。`
          : `已采集 ${supportingContents.length} 条内容和 ${supportingAccounts.length} 个账号，可以先用小样内容快速验证，同时继续积累数据。`,
    bestActionNow,
    whyNotOtherActions: [
      bestActionNow.type === "generate_test_brief"
        ? "当前样本已经够支撑执行，不需要继续观望。"
        : "可以通过追加更多数据来获取更精准的行动建议。",
    ],
    missIfWait:
      verdict === "go_now"
        ? "如果继续观望，可能错过这波机会的前期窗口。"
        : undefined,
    operatorPanel: {
      reportSummary: verdict === "go_now"
        ? "证据已补齐，可以直接进入执行。"
        : verdict === "test_small"
          ? "已有真实信号，建议先做一条小样验证。"
          : "可以继续积累数据，等待更明确的信号再加大投入。",
      sourceNotes: runs.map((run) => `数据来源：${PLATFORM_NAMES[run.platform]}实时搜索`),
      platformNotes: runs.map((run) => `${PLATFORM_NAMES[run.platform]}：已采集`),
      benchmarkHints: supportingAccounts.slice(0, 3).map((item) =>
        `${item.displayName} · ${item.tierLabel === "head_kol" ? "头部 KOL" : item.tierLabel === "standard_kol" ? "KOL" : item.tierLabel === "strong_koc" ? "优质 KOC" : item.tierLabel === "standard_koc" ? "KOC" : "观察账号"}`
      ),
      riskSplit: evidenceGaps.length > 0
        ? [`本次采集到 ${supportingContents.length} 条内容、${supportingAccounts.length} 个账号，还有 ${evidenceGaps.length} 个方向可以进一步探索，补充后分析会更精准。`]
        : [`本次采集到 ${supportingContents.length} 条内容、${supportingAccounts.length} 个账号，各项证据方向一致。`],
      counterSignals: [],
      dataGaps: evidenceGaps.length > 0
        ? evidenceGaps
        : [],
    },
    screeningReport: {
      safeActionLevel,
      evidenceAlignment:
        confidenceLabel === "高" ? "strong" : confidenceLabel === "中" ? "medium" : "weak",
      acceptedAccountIds: supportingAccounts.map((item) => item.accountId),
      acceptedContentIds: supportingContents.map((item) => item.contentId),
      acceptedLowFollowerIds: lowFollowerEvidence.map((item) => item.id),
      missingEvidence: evidenceGaps.length > 0 ? ["评论数据可进一步采集"] : [],
      contradictionSummary:
        evidenceGaps.length > 0 ? ["评论数据还可以进一步丰富，补充后分析更精准。"] : ["各项证据方向一致。"],
      candidates: [],
    },
    primaryCard: cards.primaryCard,
    secondaryCard: cards.secondaryCard,
    fitSummary:
      inputKind === "account"
        ? "当前页重点是这个账号能不能接这波机会。"
        : "当前页重点是这波机会值不值得先下注、先验证还是先观察。",
    recommendedNextAction: bestActionNow,
    continueIf: [
      `当采集到更多账号（当前 ${supportingAccounts.length} 个）和内容样本（当前 ${supportingContents.length} 条）时，可升级到更强执行动作。`,
      hotSeedCount > 0 ? `热榜/热词已命中 ${hotSeedCount} 条，如果继续上升可加大投入。` : "如果后续出现热榜/热词命中，可升级动作。",
    ].filter(Boolean),
    stopIf: [
      `如果多次采集后仍然只有 ${supportingContents.length} 条内容和 ${supportingAccounts.length} 个账号，建议放弃这波机会。`,
      evidenceGaps.length > 0 ? `当前缺少 ${evidenceGaps.length} 项关键证据，如果下次复查仍然缺少，就不要继续加码。` : "",
    ].filter(Boolean),
    commentInsight: commentInsight ?? undefined,
    normalizedBrief: baseArtifacts.normalizedBrief,
    platformSnapshots: baseArtifacts.platformSnapshots,
    scoreBreakdown,
    recommendedLowFollowerSampleIds: lowFollowerEvidence.map((item) => item.id),
    hotSeedCount,
    trendingTags: searchKeywords.map((kw) => `#${kw}`),
  };

  // ----------------------------------------------------------------
  // Step LLM-Trend: 基于真实采集数据，LLM 生成 3-5 个趋势机会卡片
  // ----------------------------------------------------------------
  let trendOpportunities: TrendOpportunity[] = [];
  let overviewOneLiner = "";
  try {
    const seedTopic = baseArtifacts.normalizedBrief.seedTopic;
    // 构建内容证据摘要（最多 8 条）
    const contentSummary = supportingContents.slice(0, 8).map((c) => {
      const like = c.likeCount ?? 0;
      const view = c.viewCount ?? 0;
      const engRate = view > 0 ? `${((like / view) * 100).toFixed(1)}%` : "—";
      return `- 「${c.title}」(${c.platform}) 点赞${like > 0 ? (like >= 10000 ? `${(like/10000).toFixed(1)}万` : like) : "—"} 播放${view > 0 ? (view >= 10000 ? `${(view/10000).toFixed(0)}万` : view) : "—"} 互动率${engRate} 发布${c.publishedAt ? c.publishedAt.slice(0, 10) : "未知"}`;
    }).join("\n");
    // 构建账号证据摘要（最多 5 个）
    const accountSummary = supportingAccounts.slice(0, 5).map((a) => {
      const fans = a.followerCount;
      const fansStr = fans ? (fans >= 10000 ? `${(fans/10000).toFixed(0)}万粉` : `${fans}粉`) : "粉丝未知";
      return `- ${a.displayName}(${a.platform}) ${fansStr} ${a.tierLabel === "head_kol" ? "头部KOL" : a.tierLabel === "standard_kol" ? "KOL" : a.tierLabel === "strong_koc" ? "优质KOC" : "KOC"}`;
    }).join("\n");
    // 构建低粉爆款摘要
    const lowFollowerSummary = lowFollowerEvidence.length > 0
      ? `低粉爆款样本 ${lowFollowerEvidence.length} 条：` + lowFollowerEvidence.slice(0, 3).map((e) => `「${e.title}」(${e.fansLabel})`).join("、")
      : "暂无低粉爆款样本";
    const prompt = `你是一位专业的短视频内容趋势分析师，擅长从真实数据中发现爆款机会。

当前分析赛道：「${seedTopic}」

【真实采集数据】
内容样本（${supportingContents.length}条）：
${contentSummary || "暂无内容样本"}

账号样本（${supportingAccounts.length}个）：
${accountSummary || "暂无账号样本"}

热榜命中：${hotSeedCount} 条
${lowFollowerSummary}

【任务】
基于以上真实数据，识别 3-5 个具体的趋势机会切入点。每个机会必须基于真实数据，不要编造数据。

输出严格的 JSON 格式：
{
  "overviewOneLiner": "一句话总结这个赛道当前的机会全貌（20字以内）",
  "trendOpportunities": [
    {
      "opportunityName": "机会名称（具体切入点，如'低粉素人开箱'，8字以内）",
      "stage": "pre_burst|validated|high_risk",
      "opportunityScore": 75,
      "timingScore": 82,
      "oneLiner": "一句话结论（25字以内，直接说值不值得做）",
      "whyNow": [
        "理由1（基于真实数据，如'已有X条低粉样本跑通'）",
        "理由2（如'热榜命中X条，需求信号明确'）",
        "理由3（如'头部KOL尚未大规模进入，窗口期开放'）"
      ],
      "doNow": "✅ 现在做：具体行动建议（20字以内）",
      "observe": "⏳ 先观察：等待什么信号再行动（20字以内）",
      "executableTopics": [
        {
          "title": "可直接拍的选题标题（20字以内）",
          "hookType": "钩子类型（如'痛点钩子'/'好奇钩子'/'对比钩子'）",
          "angle": "切入角度（10字以内）",
          "estimatedDuration": "预估时长（如'30-60秒'）"
        }
      ],
      "evidenceSummary": "证据摘要：引用真实数据支撑（30字以内）"
    }
  ]
}

注意：
- stage 说明：pre_burst=爆发前夜（信号出现但未大爆），validated=已验证（有足够样本），high_risk=高风险假热（信号不稳定）
- 机会分(opportunityScore)：基于需求强度+异常信号+竞争度+赛道适配度综合评估
- 时机分(timingScore)：基于7日增长趋势+新作者占比+热榜加速度
- 每个机会必须给出 2-3 条 executableTopics
- 如果数据不足，可以给出 3 个机会，但要在 evidenceSummary 中说明数据有限`;

    const llmResponse = await callLLM({
      modelId: "doubao",
      messages: [
        { role: "system", content: "你是专业的短视频趋势分析师，严格按 JSON 格式输出，不要输出任何其他内容。" },
        { role: "user", content: prompt },
      ],
      maxTokens: 2000,
      temperature: 0.3,
      timeoutMs: 30000,
    });

    const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        overviewOneLiner?: string;
        trendOpportunities?: TrendOpportunity[];
      };
      if (parsed.overviewOneLiner) overviewOneLiner = parsed.overviewOneLiner;
      if (Array.isArray(parsed.trendOpportunities) && parsed.trendOpportunities.length > 0) {
        trendOpportunities = parsed.trendOpportunities.slice(0, 5).map((opp) => ({
          opportunityName: opp.opportunityName ?? "未命名机会",
          stage: opp.stage ?? "validated",
          opportunityScore: Math.max(0, Math.min(100, Number(opp.opportunityScore) || 50)),
          timingScore: Math.max(0, Math.min(100, Number(opp.timingScore) || 50)),
          oneLiner: opp.oneLiner ?? "",
          whyNow: Array.isArray(opp.whyNow) ? opp.whyNow.slice(0, 3) : [],
          doNow: opp.doNow ?? "",
          observe: opp.observe ?? "",
          executableTopics: Array.isArray(opp.executableTopics)
            ? opp.executableTopics.slice(0, 3).map((t) => ({
                title: t.title ?? "",
                hookType: t.hookType ?? "",
                angle: t.angle ?? "",
                estimatedDuration: t.estimatedDuration ?? "",
              }))
            : [],
          evidenceSummary: opp.evidenceSummary ?? "",
        }));
      }
    }
    log.info(`LLM 趋势机会分析完成: ${trendOpportunities.length} 个机会`);
  } catch (err) {
    log.warn({ err }, "LLM 趋势机会分析失败，降级到空列表");
  }

  const runtimeMeta = {
    sourceMode: "live" as const,
    executionStatus,
    usedPlatforms: runs.map((run) => run.platform),
    usedRouteChain,
    degradeFlags: [...degradeFlags],
    endpointHealthVersion: nowIso(),
  };
  // ----------------------------------------------------------------
  // Step N: 等待 LLM 意图识别结果，并将其注入 draft
  // ----------------------------------------------------------------
  const llmIntent = await intentPromise;
  const extractedParams = await payloadPromise;
  const parsedInputResult = await inputParsePromise;

  const enrichedDraft: PredictionRequestDraft = {
    ...draft,
    ...(llmIntent ? { llmIntentOverride: llmIntent } : {}),
    ...(extractedParams ? {
      extractedParams: {
        keyword: extractedParams.keyword,
        platform: extractedParams.platform,
        awemeId: extractedParams.awemeId,
        noteId: extractedParams.noteId,
        uniqueId: extractedParams.uniqueId,
        contentUrl: extractedParams.contentUrl,
        industry: extractedParams.industry,
        confidence: extractedParams.confidence,
      }
    } : {}),
    ...(parsedInputResult && parsedInputResult.extractedText ? {
      parsedInput: {
        kind: parsedInputResult.kind,
        extractedText: parsedInputResult.extractedText,
        title: parsedInputResult.title,
        sourceUrl: parsedInputResult.sourceUrl,
        platform: parsedInputResult.platform,
        metadata: parsedInputResult.metadata,
      }
    } : {}),
  };

  const runId = `run_${randomUUID()}`;
  const contract = buildAgentContract({
    runId,
    request: enrichedDraft,
    artifacts: {
      ...baseArtifacts,
      uiResult: result as PredictionUiResult,
      normalizedBrief: baseArtifacts.normalizedBrief,
      platformSnapshots: baseArtifacts.platformSnapshots,
      scoreBreakdown,
      recommendedLowFollowerSampleIds: lowFollowerEvidence.map((item) => item.id),
    },
    runtimeMeta,
    degradeFlags: [...degradeFlags],
  });
  const primaryArtifact = {
    ...contract.primaryArtifact,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const run = {
    ...contract.agentRun,
    artifacts: [primaryArtifact],
    runtimeMeta,
  };
  const enrichedResult = {
    id: runId,
    ...result,
    type: getTaskIntentHistoryType(contract.classification.taskIntent),
    taskIntent: contract.classification.taskIntent,
    taskIntentConfidence: contract.classification.confidence,
    entrySource: draft.entrySource ?? "manual",
    title: contract.title,
    summary: contract.summary,
    primaryCtaLabel: contract.primaryCtaLabel,
    taskPayload: {
      ...contract.taskPayload,
      // 只要 LLM 生成了趋势机会，就注入到 taskPayload 中，不依赖 kind 判断
      // （因为意图分类可能将爆款预测误分为 topic_strategy 等其他类型）
      ...(trendOpportunities.length > 0
        ? { trendOpportunities, overviewOneLiner }
        : {}),
    },
    recommendedNextTasks: contract.recommendedNextTasks,
    primaryArtifact,
    agentRun: run,
    classificationReasons: contract.classification.reasons,
  };

  return {
    run,
    artifact: primaryArtifact,
    result: enrichedResult,
    runtimeMeta,
    degradeFlags: [...degradeFlags],
    usedRouteChain,
    endpointHealthVersion: nowIso(),
  };
}
