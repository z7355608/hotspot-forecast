import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PredictionRequestDraft } from "../../client/src/app/store/prediction-types.js";
import { createModuleLogger } from "../legacy/logger.js";
import {
  evaluateContentSampleQuality,
  extractContents,
  filterContentsByTrackSpecificRules,
  filterContentsBySampleQuality,
  type ExtractedContent,
} from "../legacy/prediction-helpers.js";
import { getTikHub, postTikHub, setApiCallContext, clearApiCallContext } from "../legacy/tikhub.js";
import type { SupportedPlatform } from "../legacy/types.js";

const log = createModuleLogger("IndustryAccuracyEval");

export const INDUSTRY_EVAL_CHECKPOINT_HOURS = [6, 12, 24, 48] as const;
export const INDUSTRY_EVAL_TARGET_ACCURACY_RATE = 50;
export const INDUSTRY_EVAL_STRICT_ACCURACY_RATE = 80;
export const INDUSTRY_EVAL_CYCLE_HOURS = 72;
export const INDUSTRY_EVAL_MAX_SEARCH_KEYWORDS_PER_TOPIC = 6;
export const INDUSTRY_EVAL_MIN_CHECKPOINTS_FOR_CONCLUSION = 20;

export const DEFAULT_INDUSTRY_TRACKS = [
  "ai工具",
  "健身减脂",
  "母婴育儿",
  "职场效率",
  "小红书美妆",
  "家居收纳",
  "本地生活探店",
  "数码科技",
  "宠物萌宠",
  "餐饮加盟",
] as const;

const STORE_PATH = path.join(process.cwd(), "data", "industry-accuracy-eval.json");
const REPORT_DIR = path.join(process.cwd(), "evals", "industry-accuracy", "reports");

type CheckpointHour = (typeof INDUSTRY_EVAL_CHECKPOINT_HOURS)[number];

export type IndustryAccuracyBatchStatus = "running" | "completed" | "failed";
export type IndustryTrackStatus = "pending" | "running" | "completed" | "data_insufficient" | "failed";
export type CheckpointStatus = "pending" | "running" | "done" | "failed";

export interface PredictedTopicForEval {
  topicId: string;
  title: string;
  angle?: string;
  predictedScore: number;
  tags: string[];
  referenceTitle?: string;
  referenceId?: string;
  checkpoints: TopicCheckpoint[];
}

export interface TopicCheckpoint {
  checkpointHour: CheckpointHour;
  dueAt: string;
  status: CheckpointStatus;
  executedAt?: string;
  searchedKeywords: string[];
  matches: SimilarContentMatch[];
  actualScore?: number;
  accuracy?: number;
  isAccurate?: boolean;
  error?: string;
}

export interface SimilarContentMatch {
  platform: string;
  contentId: string;
  title: string;
  authorName: string;
  publishedAt?: string;
  contentUrl?: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  collectCount?: number | null;
  similarityScore: number;
  actualScore: number;
  matchedTokens: string[];
}

export interface IndustryTrackRun {
  track: string;
  prompt: string;
  status: IndustryTrackStatus;
  createdAt: string;
  updatedAt: string;
  predictionRunId?: string;
  evidenceQuality?: PredictionEvidenceQuality;
  predictedTopics: PredictedTopicForEval[];
  error?: string;
}

export interface PredictionEvidenceQuality {
  supportingContents: number;
  qualifiedContents: number;
  rejectedContents: number;
  supportingAccounts: number;
  lowFollowerEvidence: number;
  whyNowItems: number;
  evidenceGaps: string[];
  degradeFlags: string[];
  usableForAccuracyEval: boolean;
  reason: string;
}

export interface IndustryAccuracySummary {
  totalTracks: number;
  completedTracks: number;
  dataInsufficientTracks: number;
  totalTopics: number;
  evaluatedCheckpoints: number;
  accurateCheckpoints: number;
  accuracyRate: number;
  averageAccuracy: number;
  averagePredictedScore: number;
  averageActualScore: number;
  coverageRate: number;
  targetAccuracyRate: number;
  minimumCheckpointsForConclusion: number;
  hasEnoughEvaluationCoverage: boolean;
  passesTarget: boolean;
  overestimated: Array<{
    track: string;
    topicTitle: string;
    checkpointHour: number;
    predictedScore: number;
    actualScore: number;
    accuracy: number;
  }>;
  underestimated: Array<{
    track: string;
    topicTitle: string;
    checkpointHour: number;
    predictedScore: number;
    actualScore: number;
    accuracy: number;
  }>;
  byTrack: Array<{
    track: string;
    evaluatedCheckpoints: number;
    accuracyRate: number;
    averageAccuracy: number;
  }>;
  conclusion: string;
}

export interface IndustryAccuracyBatch {
  batchId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: IndustryAccuracyBatchStatus;
  cycleHours: number;
  checkpointHours: CheckpointHour[];
  targetAccuracyRate: number;
  platforms: SupportedPlatform[];
  tracks: IndustryTrackRun[];
  summary?: IndustryAccuracySummary;
  error?: string;
}

export interface IndustryAccuracyStore {
  batches: Record<string, IndustryAccuracyBatch>;
}

export interface RunDueIndustryAccuracyResult {
  scannedBatches: number;
  dueCheckpoints: number;
  completedCheckpoints: number;
  failedCheckpoints: number;
}

export type MatchTiming = "after_prediction" | "pre_existing" | "unknown";
export type CheckpointConfidence = "high" | "medium" | "low" | "none";

export interface DetailedMatchRow extends SimilarContentMatch {
  timing: MatchTiming;
  weightedInteraction: number;
}

export interface DetailedCheckpointRow {
  batchId: string;
  track: string;
  predictionRunId?: string;
  topicTitle: string;
  topicAngle?: string;
  predictedScore: number;
  tags: string[];
  checkpointHour: number;
  dueAt: string;
  status: CheckpointStatus;
  executedAt?: string;
  searchedKeywords: string[];
  matchCount: number;
  afterPredictionMatches: number;
  preExistingMatches: number;
  unknownTimingMatches: number;
  topSimilarityScore?: number;
  averageSimilarityScore?: number;
  actualScore?: number;
  accuracy?: number;
  scoreGap?: number;
  loosePass: boolean;
  strictPass: boolean;
  confidence: CheckpointConfidence;
  verdict: string;
  topMatchTitle?: string;
  topMatchPublishedAt?: string;
  topMatchActualScore?: number;
  topMatchSimilarityScore?: number;
  matches: DetailedMatchRow[];
}

export interface DetailedIndustryAccuracyReport {
  batchId: string;
  generatedAt: string;
  summary: IndustryAccuracySummary & {
    looseThreshold: number;
    strictThreshold: number;
    strictAccurateCheckpoints: number;
    strictAccuracyRate: number;
    highConfidenceCheckpoints: number;
    mediumConfidenceCheckpoints: number;
    lowConfidenceCheckpoints: number;
    afterPredictionMatchRate: number;
  };
  rows: DetailedCheckpointRow[];
}

interface StartBatchOptions {
  batchId?: string;
  tracks?: string[];
  platforms?: SupportedPlatform[];
  now?: Date;
}

interface RunDueOptions {
  batchId?: string;
  force?: boolean;
  recheckDone?: boolean;
  now?: Date;
  maxCheckpoints?: number;
}

interface ResumeBatchTracksOptions {
  batchId?: string;
  tracks?: string[];
  includeDataInsufficient?: boolean;
  includeCompleted?: boolean;
}

export interface ResumeIndustryAccuracyBatchResult {
  batchId: string;
  scannedTracks: number;
  resumedTracks: number;
  completedTracks: number;
  dataInsufficientTracks: number;
  failedTracks: number;
}

function emptyStore(): IndustryAccuracyStore {
  return { batches: {} };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readStore(): Promise<IndustryAccuracyStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as IndustryAccuracyStore;
    return parsed && typeof parsed === "object" && parsed.batches ? parsed : emptyStore();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw err;
  }
}

async function writeStore(store: IndustryAccuracyStore): Promise<void> {
  await ensureDir(path.dirname(STORE_PATH));
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, STORE_PATH);
}

function nowIso(date = new Date()): string {
  return date.toISOString();
}

function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getNestedRecord(value: Record<string, unknown>, pathParts: string[]): Record<string, unknown> | null {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) return null;
    current = current[part];
  }
  return isRecord(current) ? current : null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9#\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function compactText(value: string, maxLength: number): string {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

const GENERIC_SEARCH_TERMS = new Set([
  "爆款",
  "热点",
  "选题",
  "标题",
  "推荐",
  "建议",
  "普通人",
  "中小号",
  "低粉",
  "教程",
  "合集",
  "盘点",
  "大全",
  "干货",
  "真的",
  "真实",
  "如何",
  "怎么",
  "为什么",
]);

const BROAD_INDUSTRY_TERMS = new Set<string>(DEFAULT_INDUSTRY_TRACKS);

function buildSearchKeyword(parts: Array<string | undefined>, options: { allowStandalone?: boolean } = {}): string | undefined {
  const cleaned = unique(
    parts
      .map((part) => compactText(part ?? "", 18))
      .filter((part) => part.length >= 2 && !GENERIC_SEARCH_TERMS.has(part)),
  );
  if (cleaned.length === 0) return undefined;
  if (cleaned.length === 1) {
    const term = cleaned[0];
    if (!options.allowStandalone) return undefined;
    if (term.length < 5 || GENERIC_SEARCH_TERMS.has(term) || BROAD_INDUSTRY_TERMS.has(term)) return undefined;
  }
  return compactText(cleaned.join(" "), 34);
}

function isUsefulStandaloneSearchTerm(term: string): boolean {
  if (term.length < 5) return false;
  if (GENERIC_SEARCH_TERMS.has(term)) return false;
  if (BROAD_INDUSTRY_TERMS.has(term)) return false;
  return true;
}

function extractSearchPhrases(value?: string): string[] {
  if (!value) return [];
  const parts = value
    .replace(/#/g, " ")
    .split(/[\s,，。！？!?、;；:：/|｜【】\[\]()（）《》"'“”]+/u)
    .map((part) => compactText(part, 18))
    .filter((part) => part.length >= 2 && !GENERIC_SEARCH_TERMS.has(part));

  const phrases: string[] = [];
  for (const part of parts) {
    phrases.push(part);
    if (/^\p{Script=Han}+$/u.test(part) && part.length > 10) {
      phrases.push(part.slice(0, 10), part.slice(-10));
    }
  }
  return unique(phrases).slice(0, 10);
}

export function tokenizeForSimilarity(value: string): string[] {
  const normalized = normalizeText(value).replace(/#/g, " ");
  const directTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const chinese = normalized.replace(/[^\p{Script=Han}]/gu, "");
  const grams: string[] = [];
  for (let i = 0; i < chinese.length - 1; i++) {
    grams.push(chinese.slice(i, i + 2));
  }
  return unique([...directTokens, ...grams]).slice(0, 80);
}

export function calculateSimilarityScore(params: {
  topicTitle: string;
  topicAngle?: string;
  tags?: string[];
  contentTitle: string;
}): { score: number; matchedTokens: string[] } {
  const topicText = [params.topicTitle, params.topicAngle, ...(params.tags ?? [])].filter(Boolean).join(" ");
  const contentNormalized = normalizeText(params.contentTitle);
  const topicTokens = tokenizeForSimilarity(topicText);
  const matchedTokens = topicTokens.filter((token) => contentNormalized.includes(token)).slice(0, 12);
  const titlePrefix = normalizeText(params.topicTitle).slice(0, 10);
  const tagHits = (params.tags ?? [])
    .map((tag) => normalizeText(tag).replace(/^#/, ""))
    .filter((tag) => tag.length >= 2 && contentNormalized.includes(tag)).length;
  const prefixBoost = titlePrefix.length >= 6 && contentNormalized.includes(titlePrefix) ? 20 : 0;
  const score = clampScore(prefixBoost + Math.min(56, matchedTokens.length * 7) + Math.min(24, tagHits * 8));
  return { score, matchedTokens };
}

export function calculateActualScoreFromViews(content: {
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  collectCount?: number | null;
}): number | undefined {
  const viewCount = content.viewCount ?? 0;
  if (viewCount <= 0) return undefined;
  const totalInteraction =
    (content.likeCount ?? 0) +
    (content.commentCount ?? 0) * 3 +
    (content.shareCount ?? 0) * 5 +
    (content.collectCount ?? 0) * 2;
  const interactionRate = totalInteraction / Math.max(viewCount, 1);
  if (interactionRate > 0.1) return clampScore(80 + (interactionRate - 0.1) * 200);
  if (interactionRate > 0.05) return clampScore(60 + (interactionRate - 0.05) * 400);
  if (interactionRate > 0.01) return clampScore(30 + (interactionRate - 0.01) * 750);
  return clampScore(interactionRate * 3000);
}

export function weightedInteraction(content: {
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  collectCount?: number | null;
}): number {
  return (
    (content.viewCount ?? 0) * 0.02 +
    (content.likeCount ?? 0) +
    (content.commentCount ?? 0) * 3 +
    (content.shareCount ?? 0) * 5 +
    (content.collectCount ?? 0) * 2
  );
}

function calculateNoViewActualScore(content: ExtractedContent, rank: number, total: number): number {
  const weighted = weightedInteraction(content);
  const rankScore = total <= 1 ? 60 : 100 - (rank / Math.max(total - 1, 1)) * 60;
  const logScore = Math.min(100, 20 + Math.log10(weighted + 1) * 18);
  return clampScore((rankScore + logScore) / 2);
}

export function calculateAccuracy(predictedScore: number, actualScore: number): number {
  return clampScore(100 - Math.abs(predictedScore - actualScore));
}

function classifyMatchTiming(batch: IndustryAccuracyBatch, match: SimilarContentMatch): MatchTiming {
  if (!match.publishedAt) return "unknown";
  const publishedAtMs = new Date(match.publishedAt).getTime();
  if (!Number.isFinite(publishedAtMs)) return "unknown";
  const lowerBound = new Date(batch.createdAt).getTime() + 5 * 60 * 1000;
  return publishedAtMs >= lowerBound ? "after_prediction" : "pre_existing";
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function checkpointConfidence(params: {
  matchCount: number;
  afterPredictionMatches: number;
  topSimilarityScore?: number;
  accuracy?: number;
}): CheckpointConfidence {
  if (params.matchCount === 0 || typeof params.accuracy !== "number") return "none";
  const topSimilarityScore = params.topSimilarityScore ?? 0;
  if (
    params.accuracy >= INDUSTRY_EVAL_STRICT_ACCURACY_RATE &&
    params.matchCount >= 3 &&
    params.afterPredictionMatches >= 1 &&
    topSimilarityScore >= 50
  ) {
    return "high";
  }
  if (params.accuracy >= 65 && params.matchCount >= 2 && topSimilarityScore >= 35) {
    return "medium";
  }
  return "low";
}

function checkpointVerdict(row: Pick<DetailedCheckpointRow, "status" | "matchCount" | "accuracy" | "scoreGap" | "confidence">): string {
  if (row.status === "pending") return "待检查";
  if (row.status === "failed") return "检查失败";
  if (row.matchCount === 0 || typeof row.accuracy !== "number") return "无相似样本";
  if (typeof row.scoreGap === "number" && row.scoreGap >= 25) return "明显高估";
  if (typeof row.scoreGap === "number" && row.scoreGap <= -20) return "明显低估";
  if (row.confidence === "high") return "强验证";
  if (row.accuracy >= INDUSTRY_EVAL_STRICT_ACCURACY_RATE) return "分数接近";
  if (row.accuracy >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE) return "弱验证";
  return "不通过";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildPrompt(track: string): string {
  return `${track}赛道现在发什么最容易爆？请给我3个明确、可执行、适合中腰部账号跟进的短视频选题。`;
}

function buildCheckpoints(baseDate: Date): TopicCheckpoint[] {
  return INDUSTRY_EVAL_CHECKPOINT_HOURS.map((hour) => ({
    checkpointHour: hour,
    dueAt: addHours(baseDate, hour),
    status: "pending",
    searchedKeywords: [],
    matches: [],
  }));
}

export function extractPredictedTopics(
  result: unknown,
  fallbackTrack: string,
  baseDate = new Date(),
): PredictedTopicForEval[] {
  if (!isRecord(result)) return [];
  const topics: PredictedTopicForEval[] = [];

  for (const item of asArray(result.aiTopicSuggestions)) {
    if (!isRecord(item)) continue;
    const title = pickString(item, ["title", "topic", "name"]);
    if (!title) continue;
    const score = pickNumber(item, ["score", "predictedScore", "opportunityScore"]) ?? pickNumber(result, ["score"]) ?? 70;
    const tags = asArray(item.tags).filter((tag): tag is string => typeof tag === "string");
    topics.push({
      topicId: `topic_${randomUUID()}`,
      title,
      angle: pickString(item, ["angle", "recommendedAngle", "howToShoot"]),
      predictedScore: clampScore(score),
      tags,
      referenceTitle: pickString(item, ["referenceTitle"]),
      referenceId: pickString(item, ["referenceId"]),
      checkpoints: buildCheckpoints(baseDate),
    });
  }

  if (topics.length === 0) {
    const taskPayload = getNestedRecord(result, ["taskPayload"]);
    for (const opportunity of asArray(taskPayload?.trendOpportunities)) {
      if (!isRecord(opportunity)) continue;
      const score = pickNumber(opportunity, ["opportunityScore", "score"]) ?? pickNumber(result, ["score"]) ?? 70;
      for (const executableTopic of asArray(opportunity.executableTopics)) {
        if (!isRecord(executableTopic)) continue;
        const title = pickString(executableTopic, ["title", "topic", "name"]);
        if (!title) continue;
        topics.push({
          topicId: `topic_${randomUUID()}`,
          title,
          angle: pickString(executableTopic, ["angle", "hookType"]),
          predictedScore: clampScore(score),
          tags: [pickString(opportunity, ["opportunityName"])].filter((tag): tag is string => Boolean(tag)),
          checkpoints: buildCheckpoints(baseDate),
        });
        if (topics.length >= 3) break;
      }
      if (topics.length >= 3) break;
    }
  }

  if (topics.length === 0) {
    const title = pickString(result, ["opportunityTitle", "title"]);
    if (title) {
      topics.push({
        topicId: `topic_${randomUUID()}`,
        title,
        angle: pickString(result, ["coreBet", "decisionBoundary"]),
        predictedScore: clampScore(pickNumber(result, ["score"]) ?? 70),
        tags: [fallbackTrack],
        checkpoints: buildCheckpoints(baseDate),
      });
    }
  }

  return topics.slice(0, 3);
}

export function extractPredictionEvidenceQuality(result: unknown): PredictionEvidenceQuality {
  if (!isRecord(result)) {
    return {
      supportingContents: 0,
      qualifiedContents: 0,
      rejectedContents: 0,
      supportingAccounts: 0,
      lowFollowerEvidence: 0,
      whyNowItems: 0,
      evidenceGaps: [],
      degradeFlags: [],
      usableForAccuracyEval: false,
      reason: "预测结果结构异常，无法读取真实证据字段。",
    };
  }

  const supportingContentItems = asArray(result.supportingContents);
  const supportingContents = supportingContentItems.length;
  const qualityDecisions = supportingContentItems.map((item) =>
    evaluateContentSampleQuality(item as Partial<ExtractedContent>),
  );
  const qualifiedContents = qualityDecisions.filter((decision) => decision.accepted).length;
  const rejectedContents = qualityDecisions.filter((decision) => decision.level === "rejected").length;
  const supportingAccounts = asArray(result.supportingAccounts).length;
  const lowFollowerEvidence = asArray(result.lowFollowerEvidence).length;
  const whyNowItems = asArray(result.whyNowItems).length;
  const evidenceGaps = asArray(result.evidenceGaps).filter((item): item is string => typeof item === "string");
  const degradeFlags = asArray(result.degradeFlags).filter((item): item is string => typeof item === "string");
  const usableForAccuracyEval = qualifiedContents >= 3;

  return {
    supportingContents,
    qualifiedContents,
    rejectedContents,
    supportingAccounts,
    lowFollowerEvidence,
    whyNowItems,
    evidenceGaps,
    degradeFlags,
    usableForAccuracyEval,
    reason: usableForAccuracyEval
      ? `合格真实内容样本 ${qualifiedContents} 条，可进入后验准确率验证。`
      : `合格真实内容样本只有 ${qualifiedContents} 条（原始 ${supportingContents} 条，剔除 ${rejectedContents} 条），低于最小门槛 3 条；该结果只能作为选题草案，不能作为爆款预测准确率样本。`,
  };
}

async function runPredictionForTrackRun(params: {
  batchId: string;
  trackRun: IndustryTrackRun;
  platforms: SupportedPlatform[];
  baseDate: Date;
}): Promise<void> {
  const { batchId, trackRun, platforms, baseDate } = params;
  try {
    const { runLivePrediction } = await import("../legacy/live-predictions.js");
    const draft: PredictionRequestDraft = {
      prompt: trackRun.prompt,
      evidenceItems: [],
      selectedPlatforms: platforms,
      connectedPlatforms: platforms,
      personalizationMode: "public",
      entrySource: "manual",
    };
    const prediction = await runLivePrediction(draft);
    trackRun.predictionRunId =
      (isRecord(prediction.result) ? pickString(prediction.result, ["id"]) : undefined) ??
      (isRecord(prediction.run) ? pickString(prediction.run, ["runId", "id"]) : undefined);
    trackRun.evidenceQuality = extractPredictionEvidenceQuality(prediction.result);
    trackRun.predictedTopics = extractPredictedTopics(prediction.result, trackRun.track, baseDate);
    if (trackRun.predictedTopics.length === 0) {
      trackRun.status = "failed";
      trackRun.error = "Agent 没有返回可评估的明确选题";
    } else if (!trackRun.evidenceQuality.usableForAccuracyEval) {
      trackRun.status = "data_insufficient";
      trackRun.error = trackRun.evidenceQuality.reason;
    } else {
      trackRun.status = "completed";
      trackRun.error = undefined;
    }
    trackRun.updatedAt = nowIso();
    log.info({
      batchId,
      track: trackRun.track,
      status: trackRun.status,
      topics: trackRun.predictedTopics.length,
      supportingContents: trackRun.evidenceQuality.supportingContents,
      qualifiedContents: trackRun.evidenceQuality.qualifiedContents,
      rejectedContents: trackRun.evidenceQuality.rejectedContents,
      supportingAccounts: trackRun.evidenceQuality.supportingAccounts,
    }, "行业词预测完成");
  } catch (err) {
    trackRun.status = "failed";
    trackRun.error = errorMessage(err);
    trackRun.updatedAt = nowIso();
    log.error({ err, batchId, track: trackRun.track }, "行业词预测失败");
  }
}

export function buildTopicSearchKeywords(track: string, topic: PredictedTopicForEval): string[] {
  const tags = topic.tags.map((tag) => tag.replace(/^#/, "")).filter(Boolean);
  const titleTerms = extractSearchPhrases(topic.title);
  const angleTerms = extractSearchPhrases(topic.angle);
  const referenceTerms = extractSearchPhrases(topic.referenceTitle);
  const signalTerms = unique([...tags, ...titleTerms, ...referenceTerms, ...angleTerms])
    .filter((term) => term.length >= 2 && term !== track && !GENERIC_SEARCH_TERMS.has(term))
    .slice(0, 8);
  const primaryTerm = signalTerms[0] ?? titleTerms.find((term) => term !== track) ?? tags.find((tag) => tag !== track);
  const secondaryTerm = signalTerms.find((term) => term !== primaryTerm);
  const tertiaryTerm = signalTerms.find((term) => term !== primaryTerm && term !== secondaryTerm);

  const keywords = unique([
    buildSearchKeyword([track, primaryTerm]),
    buildSearchKeyword([track, secondaryTerm]),
    buildSearchKeyword([primaryTerm, secondaryTerm]),
    buildSearchKeyword([primaryTerm, tertiaryTerm]),
    buildSearchKeyword([tags.find((tag) => tag !== track), secondaryTerm]),
    buildSearchKeyword([track, angleTerms.find((term) => term !== track)]),
    buildSearchKeyword([track, referenceTerms.find((term) => term !== track)]),
    ...signalTerms
      .filter(isUsefulStandaloneSearchTerm)
      .slice(0, 2)
      .map((term) => buildSearchKeyword([term], { allowStandalone: true })),
  ].filter((keyword): keyword is string => typeof keyword === "string" && keyword.length >= 2)).slice(0, 10);

  return keywords.length ? keywords : [compactText(topic.title, 34)];
}

async function searchTikHub(platform: SupportedPlatform, keyword: string): Promise<ExtractedContent[]> {
  setApiCallContext({
    taskType: "industry_accuracy_eval",
    platform,
    keyword,
  });
  try {
    let payload: unknown = null;
    if (platform === "douyin") {
      let resp = await postTikHub<Record<string, unknown>>(
        "/api/v1/douyin/search/fetch_general_search_v2",
        {
          keyword,
          cursor: "0",
          sort_type: "0",
          publish_time: "7",
          filter_duration: "0",
          content_type: "0",
          search_id: "",
          backtrace: "",
        },
      );
      if (!resp.ok) {
        resp = await postTikHub<Record<string, unknown>>(
          "/api/v1/douyin/search/fetch_video_search_v2",
          {
            keyword,
            cursor: "0",
            sort_type: "0",
            publish_time: "7",
            filter_duration: "0",
            search_id: "",
            backtrace: "",
          },
        );
      }
      payload = resp.ok ? resp.payload : null;
    } else if (platform === "xiaohongshu") {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/xiaohongshu/app/search_notes",
        { keyword, page: 1, sort: "general" },
      );
      payload = resp.ok ? resp.payload : null;
    } else {
      const resp = await getTikHub<Record<string, unknown>>(
        "/api/v1/kuaishou/app/search_comprehensive",
        { keyword, pcursor: "" },
      );
      payload = resp.ok ? resp.payload : null;
    }

    if (!payload) return [];
    return extractContents(platform, "industry_accuracy_search", payload);
  } finally {
    clearApiCallContext();
  }
}

function rankAndScoreMatches(topic: PredictedTopicForEval, contents: ExtractedContent[]): SimilarContentMatch[] {
  const deduped = new Map<string, ExtractedContent>();
  for (const content of contents) {
    deduped.set(`${content.platform}:${content.contentId}`, content);
  }
  const rankedByInteraction = [...deduped.values()].sort((a, b) => weightedInteraction(b) - weightedInteraction(a));
  const rankById = new Map<string, number>();
  rankedByInteraction.forEach((content, index) => {
    rankById.set(`${content.platform}:${content.contentId}`, index);
  });

  return [...deduped.values()]
    .map((content) => {
      const similarity = calculateSimilarityScore({
        topicTitle: topic.title,
        topicAngle: topic.angle,
        tags: topic.tags,
        contentTitle: content.title,
      });
      const actualFromViews = calculateActualScoreFromViews(content);
      const rank = rankById.get(`${content.platform}:${content.contentId}`) ?? rankedByInteraction.length - 1;
      return {
        platform: content.platform,
        contentId: content.contentId,
        title: content.title,
        authorName: content.authorName,
        publishedAt: content.publishedAt,
        contentUrl: content.contentUrl,
        viewCount: content.viewCount,
        likeCount: content.likeCount,
        commentCount: content.commentCount,
        shareCount: content.shareCount,
        collectCount: content.collectCount,
        similarityScore: similarity.score,
        actualScore: actualFromViews ?? calculateNoViewActualScore(content, rank, rankedByInteraction.length),
        matchedTokens: similarity.matchedTokens,
      };
    })
    .filter((match) => match.similarityScore >= 18)
    .sort((a, b) => {
      if (b.similarityScore !== a.similarityScore) return b.similarityScore - a.similarityScore;
      return b.actualScore - a.actualScore;
    })
    .slice(0, 8);
}

function filterContentsWithinValidationWindow(contents: ExtractedContent[], batch: IndustryAccuracyBatch, now: Date): ExtractedContent[] {
  const lowerBound = new Date(batch.createdAt).getTime() + 5 * 60 * 1000;
  const upperBound = now.getTime() + 5 * 60 * 1000;
  return contents.filter((content) => {
    if (!content.publishedAt) return false;
    const publishedAtMs = new Date(content.publishedAt).getTime();
    if (!Number.isFinite(publishedAtMs)) return false;
    return publishedAtMs >= lowerBound && publishedAtMs <= upperBound;
  });
}

function summarizeCheckpoint(topic: PredictedTopicForEval, matches: SimilarContentMatch[]): Pick<TopicCheckpoint, "actualScore" | "accuracy" | "isAccurate"> {
  const topScores = matches.slice(0, 3).map((match) => match.actualScore);
  const actualScore = median(topScores);
  if (actualScore === undefined) return {};
  const accuracy = calculateAccuracy(topic.predictedScore, actualScore);
  return {
    actualScore,
    accuracy,
    isAccurate: accuracy >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE,
  };
}

export async function startIndustryAccuracyBatch(options: StartBatchOptions = {}): Promise<IndustryAccuracyBatch> {
  const createdAt = options.now ?? new Date();
  const tracks = unique((options.tracks?.length ? options.tracks : [...DEFAULT_INDUSTRY_TRACKS]).map((track) => track.trim()).filter(Boolean)).slice(0, 10);
  const platforms: SupportedPlatform[] = options.platforms?.length ? options.platforms : ["douyin"];
  const batchId = options.batchId ?? `industry_eval_${createdAt.toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
  const store = await readStore();
  if (store.batches[batchId]) {
    throw new Error(`评估批次已存在: ${batchId}`);
  }

  const batch: IndustryAccuracyBatch = {
    batchId,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    expiresAt: addHours(createdAt, INDUSTRY_EVAL_CYCLE_HOURS),
    status: "running",
    cycleHours: INDUSTRY_EVAL_CYCLE_HOURS,
    checkpointHours: [...INDUSTRY_EVAL_CHECKPOINT_HOURS],
    targetAccuracyRate: INDUSTRY_EVAL_TARGET_ACCURACY_RATE,
    platforms,
    tracks: tracks.map((track) => ({
      track,
      prompt: buildPrompt(track),
      status: "pending",
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      predictedTopics: [],
    })),
  };

  store.batches[batchId] = batch;
  await writeStore(store);

  for (const trackRun of batch.tracks) {
    const now = new Date();
    trackRun.status = "running";
    trackRun.updatedAt = now.toISOString();
    await writeStore(store);

    await runPredictionForTrackRun({ batchId, trackRun, platforms, baseDate: createdAt });
    batch.updatedAt = nowIso();
    await writeStore(store);
  }

  batch.status = batch.tracks.some((track) => track.status === "completed") ? "running" : "failed";
  batch.summary = buildBatchSummary(batch);
  batch.updatedAt = nowIso();
  await writeStore(store);
  return batch;
}

export async function resumeIndustryAccuracyBatchTracks(
  options: ResumeBatchTracksOptions = {},
): Promise<ResumeIndustryAccuracyBatchResult | undefined> {
  const store = await readStore();
  const batch = options.batchId ? store.batches[options.batchId] : latestBatch(store);
  if (!batch) return undefined;
  const requestedTracks = options.tracks?.length ? new Set(options.tracks) : undefined;
  const baseDate = new Date(batch.createdAt);
  let scannedTracks = 0;
  let resumedTracks = 0;

  for (const trackRun of batch.tracks) {
    if (requestedTracks && !requestedTracks.has(trackRun.track)) continue;
    scannedTracks++;
    const shouldResume =
      options.includeCompleted ||
      trackRun.status === "pending" ||
      trackRun.status === "running" ||
      trackRun.status === "failed" ||
      (options.includeDataInsufficient && trackRun.status === "data_insufficient");
    if (!shouldResume) continue;

    resumedTracks++;
    trackRun.status = "running";
    trackRun.error = undefined;
    trackRun.updatedAt = nowIso();
    batch.updatedAt = nowIso();
    await writeStore(store);

    await runPredictionForTrackRun({
      batchId: batch.batchId,
      trackRun,
      platforms: batch.platforms,
      baseDate,
    });
    batch.updatedAt = nowIso();
    batch.summary = buildBatchSummary(batch);
    await writeStore(store);
  }

  batch.status = batch.tracks.some((track) =>
    track.status === "pending" || track.status === "running" || track.status === "completed",
  )
    ? "running"
    : "failed";
  batch.summary = buildBatchSummary(batch);
  batch.updatedAt = nowIso();
  await writeStore(store);

  return {
    batchId: batch.batchId,
    scannedTracks,
    resumedTracks,
    completedTracks: batch.tracks.filter((track) => track.status === "completed").length,
    dataInsufficientTracks: batch.tracks.filter((track) => track.status === "data_insufficient").length,
    failedTracks: batch.tracks.filter((track) => track.status === "failed").length,
  };
}

async function runCheckpoint(params: {
  batch: IndustryAccuracyBatch;
  track: IndustryTrackRun;
  topic: PredictedTopicForEval;
  checkpoint: TopicCheckpoint;
  now: Date;
}): Promise<void> {
  const { batch, track, topic, checkpoint, now } = params;
  checkpoint.status = "running";
  checkpoint.executedAt = now.toISOString();
  checkpoint.error = undefined;
  const keywords = buildTopicSearchKeywords(track.track, topic).slice(0, INDUSTRY_EVAL_MAX_SEARCH_KEYWORDS_PER_TOPIC);
  checkpoint.searchedKeywords = keywords;

  try {
    const contents: ExtractedContent[] = [];
    const searchErrors: string[] = [];
    for (const platform of batch.platforms) {
      for (const keyword of keywords) {
        try {
          const found = await searchTikHub(platform, keyword);
          contents.push(...found);
        } catch (err) {
          const message = errorMessage(err);
          searchErrors.push(`${platform}:${keyword}:${message}`);
          log.warn(
            { err, batchId: batch.batchId, track: track.track, topic: topic.title, platform, keyword },
            "行业词检查点单个关键词搜索失败，跳过该关键词",
          );
        }
      }
    }
    if (contents.length === 0 && searchErrors.length > 0) {
      throw new Error(`全部关键词搜索失败：${searchErrors.slice(0, 3).join(" | ")}`);
    }
    const windowedContents = filterContentsWithinValidationWindow(contents, batch, now);
    const trackSpecificGate = filterContentsByTrackSpecificRules(windowedContents, {
      track: track.track,
      prompt: track.prompt,
      seedTopic: `${topic.title} ${topic.angle ?? ""} ${topic.tags.join(" ")}`,
    });
    if (trackSpecificGate.rejected.length > 0) {
      log.info(
        {
          batchId: batch.batchId,
          track: track.track,
          topic: topic.title,
          before: windowedContents.length,
          after: trackSpecificGate.selected.length,
          rejected: trackSpecificGate.rejected.length,
          examples: trackSpecificGate.rejected.slice(0, 3).map((item) => ({
            title: item.content.title,
            reason: item.reason,
          })),
        },
        "行业词验证赛道专项样本噪声过滤完成",
      );
    }
    const qualityGate = filterContentsBySampleQuality(trackSpecificGate.selected, {
      minAccepted: 1,
      limit: 50,
      nowMs: now.getTime(),
    });
    const matches = rankAndScoreMatches(topic, qualityGate.selected);
    const summary = summarizeCheckpoint(topic, matches);
    checkpoint.matches = matches;
    checkpoint.actualScore = summary.actualScore;
    checkpoint.accuracy = summary.accuracy;
    checkpoint.isAccurate = summary.isAccurate;
    checkpoint.error = searchErrors.length > 0 ? `部分关键词搜索失败：${searchErrors.slice(0, 3).join(" | ")}` : undefined;
    checkpoint.status = "done";
  } catch (err) {
    checkpoint.status = "failed";
    checkpoint.error = errorMessage(err);
    log.error({ err, batchId: batch.batchId, track: track.track, topic: topic.title }, "行业词检查点失败");
  }
}

export async function runDueIndustryAccuracyChecks(options: RunDueOptions = {}): Promise<RunDueIndustryAccuracyResult> {
  const store = await readStore();
  const now = options.now ?? new Date();
  const maxCheckpoints = options.maxCheckpoints ?? 6;
  let scannedBatches = 0;
  let dueCheckpoints = 0;
  let completedCheckpoints = 0;
  let failedCheckpoints = 0;

  for (const batch of Object.values(store.batches)) {
    if (options.batchId && batch.batchId !== options.batchId) continue;
    if (batch.status === "failed" || batch.status === "completed") continue;
    scannedBatches++;

    for (const track of batch.tracks) {
      if (track.status !== "completed") continue;
      for (const topic of track.predictedTopics) {
        for (const checkpoint of topic.checkpoints) {
          const isDue = options.force || new Date(checkpoint.dueAt).getTime() <= now.getTime();
          const shouldRecheck =
            Boolean(options.recheckDone) && (checkpoint.status === "done" || checkpoint.status === "failed");
          if (completedCheckpoints + failedCheckpoints >= maxCheckpoints) break;
          if (checkpoint.status !== "pending" && !shouldRecheck) continue;
          if (!isDue) continue;
          dueCheckpoints++;
          await runCheckpoint({ batch, track, topic, checkpoint, now });
          const checkpointStatus = checkpoint.status as CheckpointStatus;
          if (checkpointStatus === "done") completedCheckpoints++;
          if (checkpointStatus === "failed") failedCheckpoints++;
          batch.updatedAt = nowIso();
          batch.summary = buildBatchSummary(batch);
          await writeStore(store);
        }
      }
    }

    const hasPending = batch.tracks.some((track) =>
      track.predictedTopics.some((topic) =>
        topic.checkpoints.some((checkpoint) => checkpoint.status === "pending" || checkpoint.status === "running"),
      ),
    );
    if (!hasPending && batch.tracks.some((track) => track.predictedTopics.length > 0)) {
      batch.status = "completed";
      batch.updatedAt = nowIso();
      batch.summary = buildBatchSummary(batch);
      await writeStore(store);
    }
  }

  return { scannedBatches, dueCheckpoints, completedCheckpoints, failedCheckpoints };
}

export function buildBatchSummary(batch: IndustryAccuracyBatch): IndustryAccuracySummary {
  const evaluated: Array<{
    track: string;
    topicTitle: string;
    checkpointHour: number;
    predictedScore: number;
    actualScore: number;
    accuracy: number;
  }> = [];
  const totalTopics = batch.tracks.reduce((sum, track) => sum + track.predictedTopics.length, 0);
  const totalPossibleCheckpoints = totalTopics * INDUSTRY_EVAL_CHECKPOINT_HOURS.length;

  for (const track of batch.tracks) {
    for (const topic of track.predictedTopics) {
      for (const checkpoint of topic.checkpoints) {
        if (
          checkpoint.status === "done" &&
          typeof checkpoint.actualScore === "number" &&
          typeof checkpoint.accuracy === "number"
        ) {
          evaluated.push({
            track: track.track,
            topicTitle: topic.title,
            checkpointHour: checkpoint.checkpointHour,
            predictedScore: topic.predictedScore,
            actualScore: checkpoint.actualScore,
            accuracy: checkpoint.accuracy,
          });
        }
      }
    }
  }

  const averageAccuracy = evaluated.length
    ? Math.round(evaluated.reduce((sum, item) => sum + item.accuracy, 0) / evaluated.length)
    : 0;
  const averagePredictedScore = evaluated.length
    ? Math.round(evaluated.reduce((sum, item) => sum + item.predictedScore, 0) / evaluated.length)
    : 0;
  const averageActualScore = evaluated.length
    ? Math.round(evaluated.reduce((sum, item) => sum + item.actualScore, 0) / evaluated.length)
    : 0;
  const accurateCheckpoints = evaluated.filter((item) => item.accuracy >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE).length;
  const accuracyRate = evaluated.length ? Math.round((accurateCheckpoints / evaluated.length) * 100) : 0;
  const coverageRate = totalPossibleCheckpoints ? Math.round((evaluated.length / totalPossibleCheckpoints) * 100) : 0;

  const byTrack = batch.tracks.map((track) => {
    const items = evaluated.filter((item) => item.track === track.track);
    const accurate = items.filter((item) => item.accuracy >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE).length;
    return {
      track: track.track,
      evaluatedCheckpoints: items.length,
      accuracyRate: items.length ? Math.round((accurate / items.length) * 100) : 0,
      averageAccuracy: items.length
        ? Math.round(items.reduce((sum, item) => sum + item.accuracy, 0) / items.length)
        : 0,
    };
  });

  const overestimated = evaluated
    .filter((item) => item.predictedScore - item.actualScore >= 20)
    .sort((a, b) => (b.predictedScore - b.actualScore) - (a.predictedScore - a.actualScore))
    .slice(0, 5);
  const underestimated = evaluated
    .filter((item) => item.actualScore - item.predictedScore >= 20)
    .sort((a, b) => (b.actualScore - b.predictedScore) - (a.actualScore - a.predictedScore))
    .slice(0, 5);

  const dataInsufficientTracks = batch.tracks.filter((track) => track.status === "data_insufficient").length;
  const minimumCheckpointsForConclusion = Math.min(INDUSTRY_EVAL_MIN_CHECKPOINTS_FOR_CONCLUSION, totalPossibleCheckpoints);
  const hasEnoughEvaluationCoverage =
    minimumCheckpointsForConclusion > 0 && evaluated.length >= minimumCheckpointsForConclusion;
  const passesTarget = hasEnoughEvaluationCoverage && accuracyRate >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE;
  const conclusion =
    totalTopics > 0 && dataInsufficientTracks === batch.tracks.length
      ? `本批次 ${batch.tracks.length} 个行业词全部真实内容样本不足，不能进入准确率验证；当前问题优先级是修复采样成功率，而不是等待检查点。`
      : evaluated.length === 0
        ? "按预测后新样本口径，还没有检查点找到可评估相似作品，暂时不能判断行业词选题准确率。"
        : !hasEnoughEvaluationCoverage
          ? `当前只有 ${evaluated.length} 个可评估检查点，低于形成结论所需的 ${minimumCheckpointsForConclusion} 个；覆盖率 ${coverageRate}%，只能做方向性观察，不能判定是否达到 50%+ 目标。`
        : passesTarget
          ? `当前已评估检查点命中率 ${accuracyRate}%，达到行业词输入 50%+ 的阶段目标。`
          : `当前已评估检查点命中率 ${accuracyRate}%，低于行业词输入 50%+ 的阶段目标，需要继续校准选题分。`;

  return {
    totalTracks: batch.tracks.length,
    completedTracks: batch.tracks.filter((track) => track.status === "completed").length,
    dataInsufficientTracks,
    totalTopics,
    evaluatedCheckpoints: evaluated.length,
    accurateCheckpoints,
    accuracyRate,
    averageAccuracy,
    averagePredictedScore,
    averageActualScore,
    coverageRate,
    targetAccuracyRate: INDUSTRY_EVAL_TARGET_ACCURACY_RATE,
    minimumCheckpointsForConclusion,
    hasEnoughEvaluationCoverage,
    passesTarget,
    overestimated,
    underestimated,
    byTrack,
    conclusion,
  };
}

export function buildDetailedIndustryAccuracyReport(batch: IndustryAccuracyBatch): DetailedIndustryAccuracyReport {
  const summary = batch.summary ?? buildBatchSummary(batch);
  const rows: DetailedCheckpointRow[] = [];

  for (const track of batch.tracks) {
    for (const topic of track.predictedTopics) {
      for (const checkpoint of topic.checkpoints) {
        const detailedMatches: DetailedMatchRow[] = checkpoint.matches.map((match) => ({
          ...match,
          timing: classifyMatchTiming(batch, match),
          weightedInteraction: Math.round(weightedInteraction(match)),
        }));
        const afterPredictionMatches = detailedMatches.filter((match) => match.timing === "after_prediction").length;
        const preExistingMatches = detailedMatches.filter((match) => match.timing === "pre_existing").length;
        const unknownTimingMatches = detailedMatches.filter((match) => match.timing === "unknown").length;
        const topMatch = detailedMatches[0];
        const topSimilarityScore = topMatch?.similarityScore;
        const accuracy = checkpoint.accuracy;
        const scoreGap = typeof checkpoint.actualScore === "number" ? topic.predictedScore - checkpoint.actualScore : undefined;
        const confidence = checkpointConfidence({
          matchCount: detailedMatches.length,
          afterPredictionMatches,
          topSimilarityScore,
          accuracy,
        });
        const row: DetailedCheckpointRow = {
          batchId: batch.batchId,
          track: track.track,
          predictionRunId: track.predictionRunId,
          topicTitle: topic.title,
          topicAngle: topic.angle,
          predictedScore: topic.predictedScore,
          tags: topic.tags,
          checkpointHour: checkpoint.checkpointHour,
          dueAt: checkpoint.dueAt,
          status: checkpoint.status,
          executedAt: checkpoint.executedAt,
          searchedKeywords: checkpoint.searchedKeywords,
          matchCount: detailedMatches.length,
          afterPredictionMatches,
          preExistingMatches,
          unknownTimingMatches,
          topSimilarityScore,
          averageSimilarityScore: average(detailedMatches.map((match) => match.similarityScore)),
          actualScore: checkpoint.actualScore,
          accuracy,
          scoreGap,
          loosePass: typeof accuracy === "number" && accuracy >= INDUSTRY_EVAL_TARGET_ACCURACY_RATE,
          strictPass: typeof accuracy === "number" && accuracy >= INDUSTRY_EVAL_STRICT_ACCURACY_RATE,
          confidence,
          verdict: "待计算",
          topMatchTitle: topMatch?.title,
          topMatchPublishedAt: topMatch?.publishedAt,
          topMatchActualScore: topMatch?.actualScore,
          topMatchSimilarityScore: topMatch?.similarityScore,
          matches: detailedMatches,
        };
        row.verdict = checkpointVerdict(row);
        rows.push(row);
      }
    }
  }

  const evaluatedRows = rows.filter((row) => row.status === "done" && typeof row.accuracy === "number");
  const strictAccurateCheckpoints = evaluatedRows.filter((row) => row.strictPass).length;
  const strictAccuracyRate = evaluatedRows.length ? Math.round((strictAccurateCheckpoints / evaluatedRows.length) * 100) : 0;
  const matchedRows = evaluatedRows.filter((row) => row.matchCount > 0);
  const afterPredictionMatchRate = matchedRows.length
    ? Math.round((matchedRows.filter((row) => row.afterPredictionMatches > 0).length / matchedRows.length) * 100)
    : 0;

  return {
    batchId: batch.batchId,
    generatedAt: nowIso(),
    summary: {
      ...summary,
      looseThreshold: INDUSTRY_EVAL_TARGET_ACCURACY_RATE,
      strictThreshold: INDUSTRY_EVAL_STRICT_ACCURACY_RATE,
      strictAccurateCheckpoints,
      strictAccuracyRate,
      highConfidenceCheckpoints: evaluatedRows.filter((row) => row.confidence === "high").length,
      mediumConfidenceCheckpoints: evaluatedRows.filter((row) => row.confidence === "medium").length,
      lowConfidenceCheckpoints: evaluatedRows.filter((row) => row.confidence === "low").length,
      afterPredictionMatchRate,
    },
    rows,
  };
}

function latestBatch(store: IndustryAccuracyStore): IndustryAccuracyBatch | undefined {
  return Object.values(store.batches).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function trackStatusLabel(status: IndustryTrackStatus): string {
  if (status === "completed") return "已进入验证";
  if (status === "data_insufficient") return "样本不足";
  if (status === "running") return "预测未完成";
  if (status === "pending") return "未开始预测";
  return "预测失败";
}

function renderMarkdownReport(batch: IndustryAccuracyBatch): string {
  const summary = batch.summary ?? buildBatchSummary(batch);
  const trackByName = new Map(batch.tracks.map((track) => [track.track, track]));
  const lines: string[] = [
    `# 爆款预测 Agent 行业词 3 天准确率验证`,
    ``,
    `- 批次: \`${batch.batchId}\``,
    `- 创建时间: ${batch.createdAt}`,
    `- 评估周期: ${batch.cycleHours} 小时`,
    `- 检查点: ${batch.checkpointHours.join(" / ")} 小时`,
    `- 行业词: ${batch.tracks.map((track) => track.track).join("、")}`,
    `- 平台: ${batch.platforms.join(" / ")}`,
    ``,
    `## 结论`,
    ``,
    summary.conclusion,
    ``,
    `| 指标 | 数值 |`,
    `| --- | ---: |`,
    `| 行业词总数 | ${summary.totalTracks} |`,
    `| 已完成预测行业词 | ${summary.completedTracks} |`,
    `| 数据不足行业词 | ${summary.dataInsufficientTracks} |`,
    `| 明确选题数 | ${summary.totalTopics} |`,
    `| 已评估检查点 | ${summary.evaluatedCheckpoints} |`,
    `| 覆盖率 | ${summary.coverageRate}% |`,
    `| 分数靠谱比例 | ${summary.accuracyRate}% |`,
    `| 平均准确率 | ${summary.averageAccuracy} |`,
    `| 平均预测分 | ${summary.averagePredictedScore} |`,
    `| 平均真实分 | ${summary.averageActualScore} |`,
    ``,
    `## 行业词排行`,
    ``,
    `| 行业词 | 状态 | 预测选题数 | 已评估检查点 | 分数靠谱比例 | 平均准确率 |`,
    `| --- | --- | ---: | ---: | ---: | ---: |`,
    ...summary.byTrack.map((item) => {
      const track = trackByName.get(item.track);
      return `| ${item.track} | ${track ? trackStatusLabel(track.status) : "未知"} | ${track?.predictedTopics.length ?? 0} | ${item.evaluatedCheckpoints} | ${item.evaluatedCheckpoints ? `${item.accuracyRate}%` : "未评估"} | ${item.evaluatedCheckpoints ? item.averageAccuracy : "未评估"} |`;
    }),
    ``,
    `## 样本质量门槛`,
    ``,
    `| 行业词 | 状态 | 原始内容样本 | 合格内容样本 | 剔除样本 | 账号样本 | 是否进入验证 |`,
    `| --- | --- | ---: | ---: | ---: | ---: | --- |`,
    ...batch.tracks.map((track) => {
      const quality = track.evidenceQuality;
      return `| ${track.track} | ${trackStatusLabel(track.status)} | ${quality?.supportingContents ?? 0} | ${quality?.qualifiedContents ?? 0} | ${quality?.rejectedContents ?? 0} | ${quality?.supportingAccounts ?? 0} | ${quality?.usableForAccuracyEval ? "是" : "否"} |`;
    }),
    ``,
    `## 高估案例`,
    ``,
    summary.overestimated.length
      ? `| 行业词 | 选题 | 检查点 | 预测分 | 真实分 | 准确率 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${summary.overestimated.map((item) => `| ${item.track} | ${item.topicTitle} | ${item.checkpointHour}h | ${item.predictedScore} | ${item.actualScore} | ${item.accuracy} |`).join("\n")}`
      : `暂无明显高估案例。`,
    ``,
    `## 低估案例`,
    ``,
    summary.underestimated.length
      ? `| 行业词 | 选题 | 检查点 | 预测分 | 真实分 | 准确率 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${summary.underestimated.map((item) => `| ${item.track} | ${item.topicTitle} | ${item.checkpointHour}h | ${item.predictedScore} | ${item.actualScore} | ${item.accuracy} |`).join("\n")}`
      : `暂无明显低估案例。`,
    ``,
    `## 说明`,
    ``,
    `这版验证回答的是“行业词输入后，Agent 给出的 3 个明确选题，后续市场上是否出现相似作品且表现分是否接近预测分”。`,
    `检查点搜索不新增 LLM 调用，只通过 TikHub 搜相似作品并用互动数据计算真实表现分；若 TikHub 返回发布时间，则优先保留预测后出现的作品。`,
  ];
  return `${lines.join("\n")}\n`;
}

function tableCell(value: unknown): string {
  if (value == null || value === "") return "-";
  return String(value).replace(/\|/g, "｜").replace(/\s+/g, " ").trim();
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function confidenceLabel(confidence: CheckpointConfidence): string {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  if (confidence === "low") return "低";
  return "无";
}

function timingLabel(timing: MatchTiming): string {
  if (timing === "after_prediction") return "预测后/窗口内";
  if (timing === "pre_existing") return "预测前旧样本";
  return "发布时间未知";
}

function renderDetailedMarkdownReport(detail: DetailedIndustryAccuracyReport): string {
  const evaluatedRows = detail.rows.filter((row) => row.status === "done" && typeof row.accuracy === "number");
  const weakRows = evaluatedRows
    .filter((row) => !row.strictPass || row.confidence === "low")
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, 8);
  const strongRows = evaluatedRows
    .filter((row) => row.strictPass)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
    .slice(0, 8);
  const noMatchRows = detail.rows.filter((row) => row.status === "done" && row.matchCount === 0);

  const lines: string[] = [
    `# 爆款预测 Agent 行业词准确率深度明细`,
    ``,
    `- 批次: \`${detail.batchId}\``,
    `- 生成时间: ${detail.generatedAt}`,
    `- 宽松靠谱阈值: accuracy >= ${detail.summary.looseThreshold}`,
    `- 严格靠谱阈值: accuracy >= ${detail.summary.strictThreshold}`,
    ``,
    `## 怎么读这份报告`,
    ``,
    `- 预测分：来自预测 Agent 输出的 aiTopicSuggestions.score。`,
    `- 真实分：只用预测后窗口内新出现的 TikHub 相似作品互动数据派生，按加权互动排序估算。`,
    `- accuracy：100 - |预测分 - 真实分|。`,
    `- 置信度：综合相似样本数、是否有预测后样本、最高相似度和 accuracy。`,
    `- 预测后/窗口内：作品发布时间晚于预测创建时间前 10 分钟；预测前旧样本和发布时间未知样本不进入准确率计算。`,
    ``,
    `## 总览`,
    ``,
    `| 指标 | 数值 |`,
    `| --- | ---: |`,
    `| 明确选题数 | ${detail.summary.totalTopics} |`,
    `| 已评估检查点 | ${detail.summary.evaluatedCheckpoints} |`,
    `| 覆盖率 | ${detail.summary.coverageRate}% |`,
    `| 宽松靠谱比例 | ${detail.summary.accuracyRate}% |`,
    `| 严格靠谱比例 | ${detail.summary.strictAccuracyRate}% |`,
    `| 高置信检查点 | ${detail.summary.highConfidenceCheckpoints} |`,
    `| 中置信检查点 | ${detail.summary.mediumConfidenceCheckpoints} |`,
    `| 低置信检查点 | ${detail.summary.lowConfidenceCheckpoints} |`,
    `| 有预测后样本的比例 | ${detail.summary.afterPredictionMatchRate}% |`,
    `| 平均预测分 | ${detail.summary.averagePredictedScore} |`,
    `| 平均真实分 | ${detail.summary.averageActualScore} |`,
    `| 平均准确率 | ${detail.summary.averageAccuracy} |`,
    ``,
    `## 逐选题检查点总表`,
    ``,
    `| 赛道 | 检查点 | 选题 | 预测分 | 真实分 | 分差 | accuracy | 严格通过 | 置信度 | 相似样本 | 预测后样本 | 最高相似度 | 结论 | Top 相似作品 |`,
    `| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- | --- |`,
    ...detail.rows.map((row) =>
      [
        tableCell(row.track),
        `${row.checkpointHour}h`,
        tableCell(row.topicTitle),
        row.predictedScore,
        row.actualScore ?? "-",
        row.scoreGap ?? "-",
        row.accuracy ?? "-",
        row.strictPass ? "是" : "否",
        confidenceLabel(row.confidence),
        row.matchCount,
        row.afterPredictionMatches,
        row.topSimilarityScore ?? "-",
        tableCell(row.verdict),
        tableCell(row.topMatchTitle),
      ].join(" | "),
    ).map((line) => `| ${line} |`),
    ``,
    `## 严格通过样本`,
    ``,
    strongRows.length
      ? [
          `这些样本 accuracy >= ${detail.summary.strictThreshold}，且准确率只基于预测后窗口内新样本计算。`,
          ``,
          `| 赛道 | 选题 | 预测分 | 真实分 | accuracy | 相似样本 | Top 相似作品 |`,
          `| --- | --- | ---: | ---: | ---: | ---: | --- |`,
          ...strongRows.map((row) =>
            `| ${tableCell(row.track)} | ${tableCell(row.topicTitle)} | ${row.predictedScore} | ${row.actualScore} | ${row.accuracy} | ${row.matchCount} | ${tableCell(row.topMatchTitle)} |`,
          ),
        ].join("\n")
      : `暂无强验证样本。`,
    ``,
    `## 需要复查的弱样本`,
    ``,
    weakRows.length
      ? [
          `| 赛道 | 选题 | 预测分 | 真实分 | accuracy | 置信度 | 问题 | Top 相似作品 |`,
          `| --- | --- | ---: | ---: | ---: | --- | --- | --- |`,
          ...weakRows.map((row) =>
            `| ${tableCell(row.track)} | ${tableCell(row.topicTitle)} | ${row.predictedScore} | ${row.actualScore ?? "-"} | ${row.accuracy ?? "-"} | ${confidenceLabel(row.confidence)} | ${tableCell(row.verdict)} | ${tableCell(row.topMatchTitle)} |`,
          ),
        ].join("\n")
      : `暂无弱样本。`,
    ``,
    `## 无相似样本`,
    ``,
    noMatchRows.length
      ? noMatchRows.map((row) => `- ${row.track} / ${row.checkpointHour}h / ${row.topicTitle}`).join("\n")
      : `暂无。`,
    ``,
    `## 相似作品证据明细`,
    ``,
  ];

  for (const row of detail.rows.filter((item) => item.status === "done")) {
    lines.push(`### ${row.track} · ${row.checkpointHour}h · ${row.topicTitle}`);
    lines.push(``);
    lines.push(`- 预测角度: ${row.topicAngle ?? "-"}`);
    lines.push(`- 预测分 / 真实分 / accuracy: ${row.predictedScore} / ${row.actualScore ?? "-"} / ${row.accuracy ?? "-"}`);
    lines.push(`- 搜索词: ${row.searchedKeywords.join("；") || "-"}`);
    lines.push(`- 结论: ${row.verdict}，置信度 ${confidenceLabel(row.confidence)}，相似样本 ${row.matchCount} 条，预测后样本 ${row.afterPredictionMatches} 条。`);
    lines.push(``);
    if (row.matches.length === 0) {
      lines.push(`无相似作品。`);
      lines.push(``);
      continue;
    }
    lines.push(`| 排名 | 发布时间 | 时间属性 | 相似度 | 真实分 | 加权互动 | 赞 | 评 | 藏 | 转 | 作者 | 标题 | 链接 |`);
    lines.push(`| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |`);
    row.matches.slice(0, 5).forEach((match, index) => {
      lines.push(`| ${index + 1} | ${tableCell(match.publishedAt)} | ${timingLabel(match.timing)} | ${match.similarityScore} | ${match.actualScore} | ${match.weightedInteraction} | ${match.likeCount ?? 0} | ${match.commentCount ?? 0} | ${match.collectCount ?? 0} | ${match.shareCount ?? 0} | ${tableCell(match.authorName)} | ${tableCell(match.title)} | ${match.contentUrl ?? "-"} |`);
    });
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}

function renderDetailedCsv(detail: DetailedIndustryAccuracyReport): string {
  const header = [
    "batchId",
    "track",
    "predictionRunId",
    "topicTitle",
    "topicAngle",
    "predictedScore",
    "checkpointHour",
    "status",
    "actualScore",
    "accuracy",
    "scoreGap",
    "loosePass",
    "strictPass",
    "confidence",
    "verdict",
    "matchCount",
    "afterPredictionMatches",
    "preExistingMatches",
    "unknownTimingMatches",
    "topSimilarityScore",
    "averageSimilarityScore",
    "topMatchTitle",
    "topMatchPublishedAt",
    "topMatchActualScore",
    "topMatchSimilarityScore",
    "searchedKeywords",
    "tags",
  ];
  const rows = detail.rows.map((row) => [
    row.batchId,
    row.track,
    row.predictionRunId,
    row.topicTitle,
    row.topicAngle,
    row.predictedScore,
    row.checkpointHour,
    row.status,
    row.actualScore,
    row.accuracy,
    row.scoreGap,
    row.loosePass,
    row.strictPass,
    row.confidence,
    row.verdict,
    row.matchCount,
    row.afterPredictionMatches,
    row.preExistingMatches,
    row.unknownTimingMatches,
    row.topSimilarityScore,
    row.averageSimilarityScore,
    row.topMatchTitle,
    row.topMatchPublishedAt,
    row.topMatchActualScore,
    row.topMatchSimilarityScore,
    row.searchedKeywords.join(" | "),
    row.tags.join(" | "),
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function generateIndustryAccuracyReport(batchId?: string): Promise<{ jsonPath: string; markdownPath: string; batch: IndustryAccuracyBatch } | null> {
  const store = await readStore();
  const batch = batchId ? store.batches[batchId] : latestBatch(store);
  if (!batch) return null;
  batch.summary = buildBatchSummary(batch);
  batch.updatedAt = nowIso();
  await writeStore(store);
  await ensureDir(REPORT_DIR);
  const baseName = batch.batchId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const jsonPath = path.join(REPORT_DIR, `${baseName}.json`);
  const markdownPath = path.join(REPORT_DIR, `${baseName}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderMarkdownReport(batch), "utf8");
  return { jsonPath, markdownPath, batch };
}

export async function generateIndustryAccuracyDetailReport(batchId?: string): Promise<{
  jsonPath: string;
  markdownPath: string;
  csvPath: string;
  detail: DetailedIndustryAccuracyReport;
} | null> {
  const store = await readStore();
  const batch = batchId ? store.batches[batchId] : latestBatch(store);
  if (!batch) return null;
  batch.summary = buildBatchSummary(batch);
  batch.updatedAt = nowIso();
  await writeStore(store);
  await ensureDir(REPORT_DIR);
  const baseName = `${batch.batchId.replace(/[^a-zA-Z0-9_-]/g, "_")}.detail`;
  const detail = buildDetailedIndustryAccuracyReport(batch);
  const jsonPath = path.join(REPORT_DIR, `${baseName}.json`);
  const markdownPath = path.join(REPORT_DIR, `${baseName}.md`);
  const csvPath = path.join(REPORT_DIR, `${baseName}.csv`);
  await fs.writeFile(jsonPath, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderDetailedMarkdownReport(detail), "utf8");
  await fs.writeFile(csvPath, renderDetailedCsv(detail), "utf8");
  return { jsonPath, markdownPath, csvPath, detail };
}

export async function readIndustryAccuracyBatches(): Promise<IndustryAccuracyBatch[]> {
  const store = await readStore();
  return Object.values(store.batches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
