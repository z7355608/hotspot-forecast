/**
 * Topic Strategy V2 — Database Helpers
 * ─────────────────────────────────────
 * CRUD helpers for topic_strategy_sessions, topic_strategy_directions,
 * topic_strategy_peer_benchmarks, topic_strategy_cross_industry tables.
 */

import { randomUUID } from "crypto";
import { execute, query, queryOne, type RowDataPacket } from "./database";

/* ── Types ── */

export interface TopicStrategySessionRow extends RowDataPacket {
  id: string;
  user_open_id: string;
  track: string;
  account_stage: string;
  platforms: string; // JSON string
  user_prompt: string | null;
  connected_accounts: string | null;
  pipeline_status: string;
  pipeline_progress: string | null;
  total_duration_ms: number | null;
  search_keywords: string | null;
  raw_data_summary: string | null;
  validation_runs: string | null;
  result_snapshot: string | null;
  artifact_id: string | null;
  entry_source: string;
  created_at: Date;
  updated_at: Date;
}

export interface TopicStrategyDirectionRow extends RowDataPacket {
  id: string;
  session_id: string;
  direction_name: string;
  direction_logic: string;
  target_stage: string | null;
  test_plan: string | null;
  traffic_potential: number | null;
  production_cost: number | null;
  competition_level: number | null;
  priority_rank: number | null;
  executable_topics: string | null;
  validation_score: number | null;
  validation_breakdown: string | null;
  validation_status: string;
  validation_detail: string | null;
  parent_direction_id: string | null;
  evolution_depth: number;
  platform_scores: string | null;
  sort_order: number;
  created_at: Date;
}

export interface TopicStrategyPeerRow extends RowDataPacket {
  id: string;
  session_id: string;
  platform: string;
  account_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  recent_works: string | null;
  avg_interaction_rate: number | null;
  comparison_notes: string | null;
  created_at: Date;
}

export interface TopicStrategyCrossIndustryRow extends RowDataPacket {
  id: string;
  session_id: string;
  source_industry: string;
  source_content_id: string | null;
  source_title: string | null;
  source_platform: string | null;
  transferable_elements: string | null;
  migration_idea: string | null;
  confidence: number | null;
  created_at: Date;
}

/* ── Input types ── */

export interface CreateSessionInput {
  userOpenId: string;
  track: string;
  accountStage: string;
  platforms: string[];
  userPrompt?: string;
  connectedAccounts?: unknown;
  entrySource?: string;
}

export interface CreateDirectionInput {
  sessionId: string;
  directionName: string;
  directionLogic: string;
  targetStage?: string;
  testPlan?: string;
  trafficPotential?: number;
  productionCost?: number;
  competitionLevel?: number;
  priorityRank?: number;
  executableTopics?: unknown[];
  parentDirectionId?: string;
  evolutionDepth?: number;
  sortOrder?: number;
}

export interface CreatePeerBenchmarkInput {
  sessionId: string;
  platform: string;
  accountId: string;
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  followerCount?: number;
  recentWorks?: unknown[];
  avgInteractionRate?: number;
  comparisonNotes?: string;
}

export interface CreateCrossIndustryInput {
  sessionId: string;
  sourceIndustry: string;
  sourceContentId?: string;
  sourceTitle?: string;
  sourcePlatform?: string;
  transferableElements?: unknown[];
  migrationIdea?: string;
  confidence?: number;
}

/* ── Session CRUD ── */

export async function createTopicStrategySession(input: CreateSessionInput): Promise<string> {
  const id = `tss_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await execute(
    `INSERT INTO topic_strategy_sessions
      (id, user_open_id, track, account_stage, platforms, user_prompt, connected_accounts, entry_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userOpenId,
      input.track,
      input.accountStage,
      JSON.stringify(input.platforms),
      input.userPrompt ?? null,
      input.connectedAccounts ? JSON.stringify(input.connectedAccounts) : null,
      input.entrySource ?? "template",
    ],
  );
  return id;
}

export async function getTopicStrategySession(sessionId: string) {
  return queryOne<TopicStrategySessionRow>(
    `SELECT * FROM topic_strategy_sessions WHERE id = ?`,
    [sessionId],
  );
}

export async function updateSessionPipelineStatus(
  sessionId: string,
  status: string,
  extra?: {
    pipelineProgress?: unknown;
    totalDurationMs?: number;
    searchKeywords?: unknown;
    rawDataSummary?: unknown;
    validationRuns?: unknown;
    resultSnapshot?: unknown;
    artifactId?: string;
  },
) {
  const sets: string[] = ["pipeline_status = ?"];
  const params: unknown[] = [status];

  if (extra?.pipelineProgress !== undefined) {
    sets.push("pipeline_progress = ?");
    params.push(JSON.stringify(extra.pipelineProgress));
  }
  if (extra?.totalDurationMs !== undefined) {
    sets.push("total_duration_ms = ?");
    params.push(extra.totalDurationMs);
  }
  if (extra?.searchKeywords !== undefined) {
    sets.push("search_keywords = ?");
    params.push(JSON.stringify(extra.searchKeywords));
  }
  if (extra?.rawDataSummary !== undefined) {
    sets.push("raw_data_summary = ?");
    params.push(JSON.stringify(extra.rawDataSummary));
  }
  if (extra?.validationRuns !== undefined) {
    sets.push("validation_runs = ?");
    params.push(JSON.stringify(extra.validationRuns));
  }
  if (extra?.resultSnapshot !== undefined) {
    sets.push("result_snapshot = ?");
    params.push(typeof extra.resultSnapshot === "string" ? extra.resultSnapshot : JSON.stringify(extra.resultSnapshot));
  }
  if (extra?.artifactId !== undefined) {
    sets.push("artifact_id = ?");
    params.push(extra.artifactId);
  }

  params.push(sessionId);
  await execute(
    `UPDATE topic_strategy_sessions SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
}

export async function listUserSessions(userOpenId: string, limit = 20) {
  return query<TopicStrategySessionRow[]>(
    `SELECT * FROM topic_strategy_sessions WHERE user_open_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userOpenId, limit],
  );
}

/* ── Direction CRUD ── */

export async function createDirection(input: CreateDirectionInput): Promise<string> {
  const id = `tsd_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await execute(
    `INSERT INTO topic_strategy_directions
      (id, session_id, direction_name, direction_logic, target_stage, test_plan,
       traffic_potential, production_cost, competition_level, priority_rank,
       executable_topics, parent_direction_id, evolution_depth, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.directionName,
      input.directionLogic,
      input.targetStage ?? null,
      input.testPlan ?? null,
      input.trafficPotential ?? null,
      input.productionCost ?? null,
      input.competitionLevel ?? null,
      input.priorityRank ?? null,
      input.executableTopics ? JSON.stringify(input.executableTopics) : null,
      input.parentDirectionId ?? null,
      input.evolutionDepth ?? 0,
      input.sortOrder ?? 0,
    ],
  );
  return id;
}

export async function getDirectionsBySession(sessionId: string) {
  return query<TopicStrategyDirectionRow[]>(
    `SELECT * FROM topic_strategy_directions WHERE session_id = ? ORDER BY sort_order ASC, created_at ASC`,
    [sessionId],
  );
}

export async function updateDirectionValidation(
  directionId: string,
  validationScore: number,
  validationBreakdown: unknown,
  validationStatus: string,
  validationDetail?: unknown,
  platformScores?: unknown,
) {
  await execute(
    `UPDATE topic_strategy_directions
     SET validation_score = ?, validation_breakdown = ?, validation_status = ?,
         validation_detail = ?, platform_scores = ?
     WHERE id = ?`,
    [
      validationScore,
      JSON.stringify(validationBreakdown),
      validationStatus,
      validationDetail ? JSON.stringify(validationDetail) : null,
      platformScores ? JSON.stringify(platformScores) : null,
      directionId,
    ],
  );
}

/* ── Peer Benchmark CRUD ── */

export async function createPeerBenchmark(input: CreatePeerBenchmarkInput): Promise<string> {
  const id = `tsp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await execute(
    `INSERT INTO topic_strategy_peer_benchmarks
      (id, session_id, platform, account_id, display_name, handle, avatar_url,
       follower_count, recent_works, avg_interaction_rate, comparison_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.platform,
      input.accountId,
      input.displayName ?? null,
      input.handle ?? null,
      input.avatarUrl ?? null,
      input.followerCount ?? null,
      input.recentWorks ? JSON.stringify(input.recentWorks) : null,
      input.avgInteractionRate ?? null,
      input.comparisonNotes ?? null,
    ],
  );
  return id;
}

export async function getPeerBenchmarksBySession(sessionId: string) {
  return query<TopicStrategyPeerRow[]>(
    `SELECT * FROM topic_strategy_peer_benchmarks WHERE session_id = ? ORDER BY follower_count DESC`,
    [sessionId],
  );
}

/* ── Cross-Industry CRUD ── */

export async function createCrossIndustry(input: CreateCrossIndustryInput): Promise<string> {
  const id = `tsc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await execute(
    `INSERT INTO topic_strategy_cross_industry
      (id, session_id, source_industry, source_content_id, source_title, source_platform,
       transferable_elements, migration_idea, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.sessionId,
      input.sourceIndustry,
      input.sourceContentId ?? null,
      input.sourceTitle ?? null,
      input.sourcePlatform ?? null,
      input.transferableElements ? JSON.stringify(input.transferableElements) : null,
      input.migrationIdea ?? null,
      input.confidence ?? null,
    ],
  );
  return id;
}

export async function getCrossIndustryBySession(sessionId: string) {
  return query<TopicStrategyCrossIndustryRow[]>(
    `SELECT * FROM topic_strategy_cross_industry WHERE session_id = ? ORDER BY confidence DESC`,
    [sessionId],
  );
}
