import { afterEach, describe, expect, it, vi } from "vitest";

// Mock callLLM 之后再 import classifyIntentWithLLM
vi.mock("./legacy/llm-gateway", () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from "./legacy/llm-gateway";
import { classifyIntentWithLLM } from "./legacy/intent-agent";
import { shouldUseViralBreakdownBranch } from "./legacy/viral-breakdown-branch";
import type { PredictionRequestDraft } from "../client/src/app/store/prediction-types";

const mockedCallLLM = vi.mocked(callLLM);

afterEach(() => {
  mockedCallLLM.mockReset();
});

function mockLLMResponse(payload: object) {
  mockedCallLLM.mockResolvedValueOnce({
    content: JSON.stringify(payload),
    model: "doubao-test",
    promptTokens: 0,
    completionTokens: 0,
  });
}

function makeDraft(overrides: Partial<PredictionRequestDraft> = {}): PredictionRequestDraft {
  return {
    prompt: "",
    evidenceItems: [],
    selectedPlatforms: [],
    connectedPlatforms: [],
    personalizationMode: "public",
    ...overrides,
  } as PredictionRequestDraft;
}

describe("classifyIntentWithLLM - fast path（不调 LLM）", () => {
  it("selectedSkillId 命中 → 直接返回对应 intent，high 置信度", async () => {
    const result = await classifyIntentWithLLM({
      prompt: "随便",
      selectedSkillId: "viral-script-breakdown",
    });
    expect(result.taskIntent).toBe("viral_breakdown");
    expect(result.confidence).toBe("high");
    expect(result.llmUsed).toBe(false);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("entryTemplateId 命中 → 直接返回对应 intent，high 置信度", async () => {
    const result = await classifyIntentWithLLM({
      prompt: "随便",
      entryTemplateId: "opportunity-forecast",
    });
    expect(result.taskIntent).toBe("opportunity_prediction");
    expect(result.confidence).toBe("high");
    expect(result.llmUsed).toBe(false);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });
});

describe("classifyIntentWithLLM - LLM 路径", () => {
  it("LLM 返回 direct_request 时正确解析", async () => {
    mockLLMResponse({
      taskIntent: "direct_request",
      confidence: "low",
      candidateIntents: ["direct_request"],
      reasons: ["输入过短"],
    });
    const result = await classifyIntentWithLLM({ prompt: "健身减脂" });
    expect(result.taskIntent).toBe("direct_request");
    expect(result.confidence).toBe("low");
    expect(result.llmUsed).toBe(true);
  });

  it("LLM 返回 viral_breakdown 时正确解析（裸 URL 场景）", async () => {
    mockLLMResponse({
      taskIntent: "viral_breakdown",
      confidence: "high",
      candidateIntents: ["viral_breakdown"],
      reasons: ["输入仅含视频链接"],
    });
    const result = await classifyIntentWithLLM({
      prompt: "https://v.douyin.com/abc",
      hasExternalLinks: true,
      parsedInputSummary: { kind: "url_video", platform: "douyin", hasContent: true },
    });
    expect(result.taskIntent).toBe("viral_breakdown");
    expect(result.confidence).toBe("high");
  });

  it("LLM 调用失败 → 降级 direct_request, low（不抛错）", async () => {
    mockedCallLLM.mockRejectedValueOnce(new Error("LLM unavailable"));
    const result = await classifyIntentWithLLM({ prompt: "健身减脂" });
    expect(result.taskIntent).toBe("direct_request");
    expect(result.confidence).toBe("low");
    expect(result.llmUsed).toBe(false);
    expect(result.reasons[0]).toContain("LLM 意图识别失败");
  });

  it("LLM 返回非法 JSON → 抛错 catch 后降级 direct_request", async () => {
    mockedCallLLM.mockResolvedValueOnce({
      content: "不是 JSON",
      model: "doubao-test",
      promptTokens: 0,
      completionTokens: 0,
    });
    const result = await classifyIntentWithLLM({ prompt: "随便" });
    expect(result.taskIntent).toBe("direct_request");
    expect(result.confidence).toBe("low");
  });

  it("LLM 返回不在白名单的 taskIntent → 兜底为 direct_request", async () => {
    mockLLMResponse({
      taskIntent: "make_up_intent",
      confidence: "high",
      candidateIntents: ["make_up_intent"],
      reasons: ["瞎编"],
    });
    const result = await classifyIntentWithLLM({ prompt: "随便" });
    expect(result.taskIntent).toBe("direct_request");
  });
});

describe("classifyIntentWithLLM - 上下文信号传递", () => {
  it("buildIntentUserMessage 把 parsedInputSummary 拼进 user message", async () => {
    mockLLMResponse({
      taskIntent: "viral_breakdown",
      confidence: "high",
      candidateIntents: ["viral_breakdown"],
      reasons: ["URL"],
    });
    await classifyIntentWithLLM({
      prompt: "https://v.douyin.com/x",
      parsedInputSummary: { kind: "url_video", platform: "douyin", title: "教练教你练胸", hasContent: true },
    });
    const callArgs = mockedCallLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m) => m.role === "user")?.content ?? "";
    expect(userMessage).toContain("输入形态：url_video");
    expect(userMessage).toContain("平台：douyin");
    expect(userMessage).toContain("教练教你练胸");
  });

  it("把 extractedPayloadSummary 拼进 user message", async () => {
    mockLLMResponse({
      taskIntent: "viral_breakdown",
      confidence: "high",
      candidateIntents: ["viral_breakdown"],
      reasons: ["有 awemeId"],
    });
    await classifyIntentWithLLM({
      prompt: "拆解这条",
      extractedPayloadSummary: {
        hasAwemeId: true,
        hasNoteId: false,
        hasUniqueId: false,
        industry: "健身",
      },
    });
    const callArgs = mockedCallLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m) => m.role === "user")?.content ?? "";
    expect(userMessage).toContain("含抖音视频ID");
    expect(userMessage).toContain("行业：健身");
  });

  it("把 mediaCount 拼进 user message", async () => {
    mockLLMResponse({
      taskIntent: "copy_extraction",
      confidence: "high",
      candidateIntents: ["copy_extraction"],
      reasons: ["上传了素材"],
    });
    await classifyIntentWithLLM({
      prompt: "提取钩子",
      mediaCount: { video: 0, image: 2, file: 1 },
    });
    const callArgs = mockedCallLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m) => m.role === "user")?.content ?? "";
    expect(userMessage).toContain("上传素材：2 张图片、1 个文档");
  });

  it("INTENT_SYSTEM_PROMPT 已删除赛道偏置", async () => {
    mockLLMResponse({
      taskIntent: "direct_request",
      confidence: "low",
      candidateIntents: ["direct_request"],
      reasons: ["test"],
    });
    await classifyIntentWithLLM({ prompt: "健身减脂" });
    const callArgs = mockedCallLLM.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m) => m.role === "system")?.content ?? "";
    // 旧 prompt 的强偏置已删除
    expect(systemMessage).not.toContain("本产品是一个「内容赛道机会分析工具」");
    expect(systemMessage).not.toContain("默认分类为 opportunity_prediction");
    expect(systemMessage).not.toContain("必须分类为 opportunity_prediction");
    // 新 prompt 关键段落存在
    expect(systemMessage).toContain("不要预设用户一定在做赛道分析");
    expect(systemMessage).toContain("不要把短关键词默认归到任何特定意图");
  });
});

describe("shouldUseViralBreakdownBranch", () => {
  it("entryTemplateId === 'viral-breakdown' → true", () => {
    expect(shouldUseViralBreakdownBranch(makeDraft({ entryTemplateId: "viral-breakdown" }))).toBe(true);
  });

  it("selectedSkillId 含 'breakdown' → true", () => {
    expect(shouldUseViralBreakdownBranch(makeDraft({ selectedSkillId: "viral-script-breakdown" }))).toBe(true);
  });

  it("intent=viral_breakdown + prompt 含 URL → true", () => {
    const draft = makeDraft({ prompt: "https://v.douyin.com/abc" });
    const intent = { taskIntent: "viral_breakdown" };
    expect(shouldUseViralBreakdownBranch(draft, intent)).toBe(true);
  });

  it("intent=breakdown_sample + evidenceItems 含 URL → true", () => {
    const draft = makeDraft({
      prompt: "拆解",
      evidenceItems: [{ source: "https://www.xiaohongshu.com/explore/abc", display: "笔记", kind: "link" } as never],
    });
    const intent = { taskIntent: "breakdown_sample" };
    expect(shouldUseViralBreakdownBranch(draft, intent)).toBe(true);
  });

  it("parsedInput.kind=url_video + prompt 含 URL → true", () => {
    const draft = makeDraft({ prompt: "https://v.douyin.com/x" });
    const parsed = { kind: "url_video" };
    expect(shouldUseViralBreakdownBranch(draft, undefined, parsed)).toBe(true);
  });

  it("intent=viral_breakdown 但无 URL → false（不能纯靠意图，必须有视频信号）", () => {
    const draft = makeDraft({ prompt: "拆解视频结构" });
    const intent = { taskIntent: "viral_breakdown" };
    expect(shouldUseViralBreakdownBranch(draft, intent)).toBe(false);
  });

  it("intent=opportunity_prediction + URL → false（文字诉求优先于形态）", () => {
    const draft = makeDraft({ prompt: "https://v.douyin.com/x 这个赛道值得做吗" });
    const intent = { taskIntent: "opportunity_prediction" };
    expect(shouldUseViralBreakdownBranch(draft, intent)).toBe(false);
  });

  it("无任何信号 → false", () => {
    expect(shouldUseViralBreakdownBranch(makeDraft({ prompt: "健身减脂" }))).toBe(false);
  });
});
