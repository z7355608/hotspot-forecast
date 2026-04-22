import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test: getResultArtifactById supports clientResultId fallback lookup
 *
 * The core fix: when a user navigates to /results/<clientResultId>,
 * the backend should be able to find the artifact even though it's stored
 * under a different artifactId (artifact_<uuid>).
 */

// Mock the storage module
vi.mock("./storage", () => ({
  readResultArtifactStore: vi.fn(),
  readWatchTaskStore: vi.fn(),
  writeResultArtifactStore: vi.fn(),
  readWatchTaskRunStore: vi.fn(),
  writeWatchTaskStore: vi.fn(),
  writeWatchTaskRunStore: vi.fn(),
}));

import { getResultArtifactById } from "./artifacts";
import { readResultArtifactStore, readWatchTaskStore } from "./storage";

const mockReadArtifactStore = vi.mocked(readResultArtifactStore);
const mockReadWatchTaskStore = vi.mocked(readWatchTaskStore);

const SAMPLE_ARTIFACT = {
  artifactId: "artifact_abc123",
  clientResultId: "rucg2fd",
  query: "测试赛道",
  type: "爆款预测",
  title: "测试标题",
  summary: "测试摘要",
  platform: ["抖音"],
  score: 72,
  scoreLabel: "值得试",
  verdict: "test_small",
  windowStrength: "moderate",
  confidenceLabel: "中",
  watchable: true,
  shareable: true,
  createdAt: "2026-04-22T00:00:00.000Z",
  updatedAt: "2026-04-22T00:00:00.000Z",
  snapshot: {
    id: "rucg2fd",
    query: "测试赛道",
    type: "爆款预测",
    score: 72,
    supportingContents: [
      { contentId: "c1", title: "测试内容1", authorName: "作者1" },
    ],
    supportingAccounts: [
      { accountId: "a1", displayName: "账号1" },
    ],
  },
};

describe("getResultArtifactById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadWatchTaskStore.mockResolvedValue({});
  });

  it("should find artifact by exact artifactId", async () => {
    mockReadArtifactStore.mockResolvedValue({
      artifact_abc123: SAMPLE_ARTIFACT as any,
    });

    const result = await getResultArtifactById("artifact_abc123");
    expect(result).not.toBeNull();
    expect(result!.artifactId).toBe("artifact_abc123");
    expect(result!.snapshot).toBeDefined();
    expect(result!.snapshot.id).toBe("rucg2fd");
  });

  it("should find artifact by clientResultId fallback", async () => {
    mockReadArtifactStore.mockResolvedValue({
      artifact_abc123: SAMPLE_ARTIFACT as any,
    });

    // Query using the client-side result ID (e.g., from /results/rucg2fd)
    const result = await getResultArtifactById("rucg2fd");
    expect(result).not.toBeNull();
    expect(result!.artifactId).toBe("artifact_abc123");
    expect(result!.snapshot).toBeDefined();
    expect(result!.query).toBe("测试赛道");
  });

  it("should return null when neither artifactId nor clientResultId matches", async () => {
    mockReadArtifactStore.mockResolvedValue({
      artifact_abc123: SAMPLE_ARTIFACT as any,
    });

    const result = await getResultArtifactById("nonexistent_id");
    expect(result).toBeNull();
  });

  it("should prefer exact artifactId match over clientResultId", async () => {
    const artifact1 = {
      ...SAMPLE_ARTIFACT,
      artifactId: "rucg2fd",
      clientResultId: "other_id",
      query: "精确匹配",
    };
    const artifact2 = {
      ...SAMPLE_ARTIFACT,
      artifactId: "artifact_xyz",
      clientResultId: "rucg2fd",
      query: "回退匹配",
    };
    mockReadArtifactStore.mockResolvedValue({
      rucg2fd: artifact1 as any,
      artifact_xyz: artifact2 as any,
    });

    const result = await getResultArtifactById("rucg2fd");
    expect(result).not.toBeNull();
    // Should prefer the exact artifactId match
    expect(result!.query).toBe("精确匹配");
  });

  it("should return null for empty store", async () => {
    mockReadArtifactStore.mockResolvedValue({});

    const result = await getResultArtifactById("rucg2fd");
    expect(result).toBeNull();
  });

  it("should include watch task info when available", async () => {
    const artifactWithWatch = {
      ...SAMPLE_ARTIFACT,
      watchTaskId: "watch_task_1",
    };
    mockReadArtifactStore.mockResolvedValue({
      artifact_abc123: artifactWithWatch as any,
    });
    mockReadWatchTaskStore.mockResolvedValue({
      watch_task_1: {
        taskId: "watch_task_1",
        artifactId: "artifact_abc123",
        status: "active",
      } as any,
    });

    const result = await getResultArtifactById("rucg2fd");
    expect(result).not.toBeNull();
    expect(result!.artifactId).toBe("artifact_abc123");
  });
});
