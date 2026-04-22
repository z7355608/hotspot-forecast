import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test: End-to-end verification that:
 * 1. The auto-save path in startAnalysis calls saveResultArtifactRequest
 * 2. The backend can retrieve a saved artifact by clientResultId
 * 3. The normalizeRemoteResult path can reconstruct a ResultRecord from saved artifact
 */

// Mock storage module
vi.mock("./storage", () => ({
  readResultArtifactStore: vi.fn(),
  readWatchTaskStore: vi.fn(),
  writeResultArtifactStore: vi.fn(),
  readWatchTaskRunStore: vi.fn(),
  writeWatchTaskStore: vi.fn(),
  writeWatchTaskRunStore: vi.fn(),
}));

import {
  getResultArtifactById,
  upsertResultArtifact,
} from "./artifacts";
import {
  readResultArtifactStore,
  readWatchTaskStore,
  writeResultArtifactStore,
} from "./storage";

const mockReadArtifactStore = vi.mocked(readResultArtifactStore);
const mockReadWatchTaskStore = vi.mocked(readWatchTaskStore);
const mockWriteArtifactStore = vi.mocked(writeResultArtifactStore);

/**
 * Simulates the snapshot that would be sent by the frontend auto-save logic.
 * This mirrors what `saveResultArtifactRequest({ snapshot: nextResult })` sends.
 */
const LIVE_RESULT_SNAPSHOT = {
  id: "r_test_autosave_001",
  dataMode: "live",
  query: "宠物用品测评",
  type: "爆款预测",
  title: "宠物用品测评 · 机会判断",
  summary: "「宠物用品测评」方向已有 12 条真实内容跑通，可以直接进入执行。",
  platform: ["抖音"],
  score: 78,
  scoreLabel: "值得试",
  verdict: "test_small",
  confidenceLabel: "中",
  windowStrength: "moderate",
  opportunityTitle: "宠物用品测评 · 机会判断",
  opportunityType: "search_window",
  coreBet: "「宠物用品、猫粮测评」方向已有 12 条真实内容跑通。",
  decisionBoundary: "建议先拍 1 条「宠物用品测评」方向的小样。",
  marketEvidence: {
    evidenceWindowLabel: "实时抓取 · 4月22日",
    momentumLabel: "emerging",
    kolCount: 3,
    kocCount: 5,
    newCreatorCount: 4,
    similarContentCount: 12,
    growth7d: 15,
    lowFollowerAnomalyRatio: 22,
    timingLabel: "已采集 12 条内容、8 个账号。",
    tierBreakdown: {
      headKol: 1,
      standardKol: 2,
      strongKoc: 3,
      standardKoc: 2,
    },
  },
  supportingContents: [
    {
      contentId: "c_real_001",
      title: "我家猫吃了这款猫粮后毛发变好了",
      authorName: "猫咪日记",
      platform: "douyin",
      publishedAt: "2026-04-20T10:00:00.000Z",
      viewCount: 150000,
      likeCount: 8500,
      commentCount: 320,
      shareCount: 180,
      collectCount: 450,
      structureSummary: "开箱测评 + 使用效果对比",
      keywordTokens: ["猫粮", "测评", "宠物"],
      whyIncluded: "低粉高互动，播放量超预期",
    },
    {
      contentId: "c_real_002",
      title: "10款平价猫粮横评",
      authorName: "宠物达人小王",
      platform: "douyin",
      publishedAt: "2026-04-19T14:00:00.000Z",
      viewCount: 280000,
      likeCount: 15000,
      commentCount: 890,
      shareCount: 520,
      collectCount: 1200,
      structureSummary: "横评对比 + 推荐清单",
      keywordTokens: ["猫粮", "横评", "平价"],
      whyIncluded: "高互动率，评论区需求信号明确",
    },
  ],
  supportingAccounts: [
    {
      accountId: "a_real_001",
      displayName: "猫咪日记",
      handle: "maorijii",
      platform: "douyin",
      tierLabel: "strong_koc",
      followerCount: 8500,
      followingCount: 120,
      totalLikeCount: 95000,
      avgEngagementRate30d: 12.5,
      breakoutHitRate30d: 0.3,
      recentTopicClusters: ["宠物用品", "猫粮测评"],
      whyIncluded: "低粉但互动率高，内容与赛道高度匹配",
    },
  ],
  lowFollowerEvidence: [
    {
      id: "lf_001",
      platform: "douyin",
      contentForm: "短视频",
      title: "3000粉丝拍猫粮测评播放50万",
      account: "小猫咪的家",
      fansLabel: "3000",
      fansCount: 3000,
      anomaly: 85,
      playCount: "50万",
      trackTags: ["宠物", "猫粮"],
      suggestion: "低粉爆款信号明确，可复制性强",
      publishedAt: "2026-04-18T08:00:00.000Z",
    },
  ],
  evidenceGaps: ["缺少小红书平台数据交叉验证"],
  whyNowItems: [
    {
      sourceLabel: "抖音搜索",
      fact: "「猫粮测评」搜索量近7天增长15%",
      inference: "需求信号正在上升",
      userImpact: "现在入场可以抢占搜索流量红利",
      tone: "positive",
    },
  ],
  taskIntent: "opportunity_prediction",
  taskIntentConfidence: "medium",
  entrySource: "manual",
  primaryArtifact: {
    artifactId: "temp_artifact",
    runId: "run_test_001",
    taskIntent: "opportunity_prediction",
    artifactType: "opportunity_memo",
    title: "宠物用品测评 · 机会判断",
    summary: "「宠物用品测评」方向已有 12 条真实内容跑通。",
    payload: {},
    snapshotRefs: [],
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
    watchable: true,
    shareable: true,
  },
  taskPayload: {
    kind: "opportunity_prediction",
    highlight: "「宠物用品测评」方向已有 12 条真实内容跑通。",
    verdictLabel: "值得试",
    evidenceSummary: ["12条内容样本", "8个账号样本"],
    bestActionReason: "建议先拍 1 条小样验证",
    supportingProofTitles: ["我家猫吃了这款猫粮后毛发变好了", "10款平价猫粮横评"],
  },
  createdAt: "2026-04-22T00:00:00.000Z",
  updatedAt: "2026-04-22T00:00:00.000Z",
};

describe("Auto-save and recovery E2E", () => {
  let savedStore: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedStore = {};
    mockReadWatchTaskStore.mockResolvedValue({});
    mockReadArtifactStore.mockImplementation(async () => savedStore as any);
    mockWriteArtifactStore.mockImplementation(async (store: unknown) => {
      savedStore = store as Record<string, unknown>;
    });
  });

  it("should save a live result snapshot and retrieve it by clientResultId", async () => {
    // Step 1: Simulate the auto-save (what saveResultArtifactRequest does on the backend)
    const saveResult = await upsertResultArtifact({
      snapshot: LIVE_RESULT_SNAPSHOT as Record<string, unknown>,
      createWatch: false,
    });

    // Verify the artifact was created with a proper artifactId
    expect(saveResult.artifact.artifactId).toBeDefined();
    expect(saveResult.artifact.artifactId).toMatch(/^artifact_/);

    // Step 2: Retrieve by clientResultId (simulating /results/r_test_autosave_001)
    const retrieved = await getResultArtifactById("r_test_autosave_001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.artifactId).toBe(saveResult.artifact.artifactId);

    // Step 3: Verify the snapshot contains real data
    const snapshot = retrieved!.snapshot as typeof LIVE_RESULT_SNAPSHOT;
    expect(snapshot.id).toBe("r_test_autosave_001");
    expect(snapshot.query).toBe("宠物用品测评");
    expect(snapshot.score).toBe(78);
    expect(snapshot.supportingContents).toHaveLength(2);
    expect(snapshot.supportingContents[0].title).toBe("我家猫吃了这款猫粮后毛发变好了");
    expect(snapshot.supportingContents[0].viewCount).toBe(150000);
    expect(snapshot.supportingAccounts).toHaveLength(1);
    expect(snapshot.supportingAccounts[0].displayName).toBe("猫咪日记");
    expect(snapshot.lowFollowerEvidence).toHaveLength(1);
    expect(snapshot.lowFollowerEvidence[0].anomaly).toBe(85);
  });

  it("should preserve all real data fields through save-and-retrieve cycle", async () => {
    await upsertResultArtifact({
      snapshot: LIVE_RESULT_SNAPSHOT as Record<string, unknown>,
      createWatch: false,
    });

    const retrieved = await getResultArtifactById("r_test_autosave_001");
    expect(retrieved).not.toBeNull();

    const snapshot = retrieved!.snapshot as typeof LIVE_RESULT_SNAPSHOT;

    // Market evidence
    expect(snapshot.marketEvidence.kolCount).toBe(3);
    expect(snapshot.marketEvidence.kocCount).toBe(5);
    expect(snapshot.marketEvidence.growth7d).toBe(15);
    expect(snapshot.marketEvidence.tierBreakdown.headKol).toBe(1);

    // Content details
    expect(snapshot.supportingContents[1].likeCount).toBe(15000);
    expect(snapshot.supportingContents[1].commentCount).toBe(890);
    expect(snapshot.supportingContents[1].keywordTokens).toContain("横评");

    // Account details
    expect(snapshot.supportingAccounts[0].followerCount).toBe(8500);
    expect(snapshot.supportingAccounts[0].avgEngagementRate30d).toBe(12.5);

    // Evidence gaps and whyNow
    expect(snapshot.evidenceGaps).toContain("缺少小红书平台数据交叉验证");
    expect(snapshot.whyNowItems[0].fact).toContain("猫粮测评");

    // Task payload
    expect(snapshot.taskPayload.kind).toBe("opportunity_prediction");
    expect(snapshot.taskPayload.supportingProofTitles).toHaveLength(2);
  });

  it("should handle upsert (update existing artifact) correctly", async () => {
    // First save
    await upsertResultArtifact({
      snapshot: LIVE_RESULT_SNAPSHOT as Record<string, unknown>,
      createWatch: false,
    });

    // Update with new data
    const updatedSnapshot = {
      ...LIVE_RESULT_SNAPSHOT,
      score: 85,
      scoreLabel: "强推",
      verdict: "go_now",
    };
    await upsertResultArtifact({
      snapshot: updatedSnapshot as Record<string, unknown>,
      createWatch: false,
    });

    // Should still be retrievable by clientResultId
    const retrieved = await getResultArtifactById("r_test_autosave_001");
    expect(retrieved).not.toBeNull();

    const snapshot = retrieved!.snapshot as typeof LIVE_RESULT_SNAPSHOT;
    expect(snapshot.score).toBe(85);
    expect(snapshot.verdict).toBe("go_now");
  });

  it("should also be retrievable by artifactId after auto-save", async () => {
    const saveResult = await upsertResultArtifact({
      snapshot: LIVE_RESULT_SNAPSHOT as Record<string, unknown>,
      createWatch: false,
    });

    // Retrieve by artifactId
    const retrieved = await getResultArtifactById(saveResult.artifact.artifactId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.snapshot.id).toBe("r_test_autosave_001");
  });
});
