/**
 * viral-breakdown-branch.ts
 * =========================
 * 爆款拆解独立分支 — 当 intent 为 viral_breakdown 且有视频链接时，
 * 不走通用搜索流程，而是：
 *   1. 解析视频链接 → 获取标题、封面、互动数据
 *   2. 用 LLM（支持多模态）分析视频封面 + 元数据 → 深度拆解
 *   3. 返回结构化的 PredictionUiResult（与 runLivePrediction 格式一致）
 */

import { createModuleLogger } from "./logger.js";
const log = createModuleLogger("ViralBreakdownBranch");

import { randomUUID } from "node:crypto";
import { parseVideo, transcribeVideo, type ParsedVideoInfo } from "./video-parser.js";
import { invokeLLM } from "../_core/llm.js";
import { callLLM } from "./llm-gateway.js";
import { buildPredictionArtifacts } from "../../client/src/app/store/prediction-engine.js";
import {
  buildAgentContract,
  getTaskIntentHistoryType,
} from "../../client/src/app/store/agent-runtime.js";
import type {
  PredictionBestAction,
  PredictionRequestDraft,
  PredictionUiResult,
  PredictionSafeActionLevel,
} from "../../client/src/app/store/prediction-types.js";
import {
  createConnectorLike,
  getCandidatePlatforms,
  nowIso,
  PLATFORM_NAMES,
} from "./prediction-helpers.js";
import { readConnectorStore } from "./storage.js";
import type { ProgressEvent } from "./live-predictions.js";

/* ── 拆解 Prompt ── */

const BREAKDOWN_SYSTEM_PROMPT = `你不仅是一个AI助手，你是由顶级短视频运营总监、认知心理学家和算法工程师组成的"爆款拆解专家组"。你深谙抖音/TikTok/视频号的底层推荐算法、用户多巴胺机制以及商业变现逻辑。

你的任务是对用户提供的短视频（封面图 + 标题 + 互动数据 + 文案）进行"像素级"的深度拆解。

核心约束：
1. 拒绝平庸：不要只总结大意，必须分析"为什么这么拍/这么说"
2. 数据化/可视化：尽可能用评分、密度、曲线等概念量化分析结果
3. 专业术语：适当使用"完播率"、"多巴胺锚点"、"认知盲区"、"情绪价值"、"转化钩子"等专业词汇
4. 犀利直白：如果视频有明显的套路或心机，直接指出来

请严格按照以下 JSON 格式返回，不要包含其他文字：
{
  "breakdownSummary": "100-200字总结，说明这条内容为什么能爆，核心结构是什么，要犀利有洞见",
  "overallScore": 85,
  "scoreDimensions": {
    "logic": 80,
    "emotion": 90,
    "visual": 75,
    "commercial": 85
  },
  "coreLabels": ["#算法标签1", "#算法标签2", "#算法标签3"],
  "oneLinerComment": "一句话辣评：用最犀利的语言概括该视频火爆的核心原因",
  "hookAnalysis": {
    "visualHook": "视觉钩子分析：画面冲击力/美感/猎奇/矛盾点",
    "audioHook": "听觉钩子分析：BGM卡点、第一句话的音调/语速/音效",
    "copyHookType": "痛点型/悬念型/反差型/利益型/恐吓型",
    "copyHookReason": "判断依据和解释",
    "hookImitationTip": "如果要模仿，前3秒应该怎么拍"
  },
  "rhythmAnalysis": {
    "stimulusIntervalSeconds": 3,
    "emotionCurve": "情绪曲线描述，如：低开高走、波浪式起伏、压抑后爆发",
    "dopamineNodes": ["让人感到爽/惊讶/共鸣的具体时刻1", "具体时刻2"]
  },
  "scriptLogic": {
    "structureModules": ["[引入]具体内容", "[痛点]具体内容", "[信任背书]具体内容", "[反转/干货]具体内容", "[升华]具体内容"],
    "powerWords": ["强力词1", "强力词2", "强力词3"],
    "goldenQuotes": ["最容易被摘抄的金句1", "金句2"]
  },
  "monetizationAnalysis": {
    "personaType": "博主人设：专业权威/亲切邻家/犀利毒舌/富豪人设",
    "monetizationPoints": ["变现埋点1", "变现埋点2"],
    "conversionScript": "促使成交的关键话术"
  },
  "engagementEngineering": {
    "controversyTraps": "是否有故意留下的破绽/错误/争议观点用于诱导评论",
    "predictedTopComments": ["预测高赞评论方向1", "预测高赞评论方向2"],
    "ctaType": "片尾CTA类型和具体话术"
  },
  "copyPoints": ["可复制元素1（具体可落地）", "可复制元素2", "可复制元素3", "可复制元素4"],
  "avoidPoints": ["避坑点1（说明为什么不能直接照搬）", "避坑点2"],
  "migrationSteps": ["迁移步骤1（具体操作指导）", "步骤2", "步骤3", "步骤4"],
  "scriptSkeleton": "基于原视频逻辑生成的新脚本骨架（保留结构，替换内容），100-200字",
  "shootingGuide": {
    "shotComposition": "景别建议，如：全程怼脸拍/需要切换3个场景",
    "performanceStyle": "表演状态建议，如：语速要快，眼神要坚定",
    "bgmStyle": "推荐BGM风格"
  },
  "hookType": "悬念/反差/痛点/利益/好奇",
  "contentStructure": "开头钩子→正文展示→结尾CTA 的具体描述",
  "estimatedDuration": "预估视频时长",
  "targetAudience": "目标受众描述"
}`;

/* ── 从 draft 中提取视频 URL ── */

function extractVideoUrl(draft: PredictionRequestDraft): string | null {
  // 1. 从 evidenceItems 中找 https:// URL
  for (const item of draft.evidenceItems) {
    if (/^https?:\/\//.test(item.source)) {
      return item.source;
    }
  }
  // 2. 从 prompt 中提取 URL
  const urlMatch = draft.prompt.match(/https?:\/\/[^\s，。！？、）\]]+/);
  if (urlMatch) return urlMatch[0];

  return null;
}

/* ── 判断是否应该走爆款拆解分支 ── */

export function shouldUseViralBreakdownBranch(draft: PredictionRequestDraft): boolean {
  if (draft.entryTemplateId === "viral-breakdown") return true;
  if (draft.selectedSkillId?.includes("breakdown")) return true;
  return false;
}

/* ── 主函数 ── */

export async function runViralBreakdownBranch(
  draft: PredictionRequestDraft,
  onProgress?: (event: ProgressEvent) => void,
) {
  const videoUrl = extractVideoUrl(draft);
  if (!videoUrl) {
    throw new Error("未找到视频链接，请提供抖音/快手/小红书等平台的视频链接或分享口令");
  }

  log.info(`开始爆款拆解: ${videoUrl.slice(0, 80)}`);

  // Step 1: 解析视频链接
  onProgress?.({ type: "platform_start", platform: "video_parse", platformName: "视频解析" });

  let videoInfo: ParsedVideoInfo;
  try {
    videoInfo = await parseVideo(videoUrl);
    if (!videoInfo.ok) {
      throw new Error(videoInfo.error ?? "视频解析失败");
    }
    log.info(`视频解析成功: "${videoInfo.title}" (${videoInfo.platform})`);
  } catch (err) {
    log.error({ err }, "视频解析失败");
    throw new Error(`视频解析失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  onProgress?.({ type: "platform_done", platform: "video_parse", platformName: "视频解析", status: "success" });

  // Step 1.5: ASR 转录口播文案（非阻塞，失败不影响主流程）
  let transcript = "";
  if (videoInfo.videoUrl || videoInfo.videoUrls.length > 0) {
    onProgress?.({ type: "platform_start", platform: "asr", platformName: "语音转录" });
    try {
      const asrResult = await transcribeVideo(videoUrl);
      if (asrResult.ok && asrResult.transcript) {
        transcript = asrResult.transcript;
        log.info(`ASR 转录成功，字符数: ${transcript.length}`);
        onProgress?.({ type: "platform_done", platform: "asr", platformName: "语音转录", status: "success" });
      } else {
        log.warn(`ASR 转录失败或无内容: ${asrResult.error ?? "无文案"}`);
        onProgress?.({ type: "platform_done", platform: "asr", platformName: "语音转录", status: "failed" });
      }
    } catch (asrErr) {
      log.warn({ err: asrErr }, "ASR 转录异常，跳过");
      onProgress?.({ type: "platform_done", platform: "asr", platformName: "语音转录", status: "failed" });
    }
  }

  // Step 2: 用 LLM 分析视频（封面图 + 口播文案 + 元数据）
  onProgress?.({ type: "llm_start" });

  let breakdownResult: {
    breakdownSummary: string;
    overallScore?: number;
    scoreDimensions?: { logic: number; emotion: number; visual: number; commercial: number };
    coreLabels?: string[];
    oneLinerComment?: string;
    hookAnalysis?: {
      visualHook?: string;
      audioHook?: string;
      copyHookType?: string;
      copyHookReason?: string;
      hookImitationTip?: string;
    };
    rhythmAnalysis?: {
      stimulusIntervalSeconds?: number;
      emotionCurve?: string;
      dopamineNodes?: string[];
    };
    scriptLogic?: {
      structureModules?: string[];
      powerWords?: string[];
      goldenQuotes?: string[];
    };
    monetizationAnalysis?: {
      personaType?: string;
      monetizationPoints?: string[];
      conversionScript?: string;
    };
    engagementEngineering?: {
      controversyTraps?: string;
      predictedTopComments?: string[];
      ctaType?: string;
    };
    copyPoints: string[];
    avoidPoints: string[];
    migrationSteps: string[];
    scriptSkeleton?: string;
    shootingGuide?: {
      shotComposition?: string;
      performanceStyle?: string;
      bgmStyle?: string;
    };
    hookType?: string;
    contentStructure?: string;
    estimatedDuration?: string;
    targetAudience?: string;
  };

  try {
    const videoMeta = [
      `标题：${videoInfo.title}`,
      `平台：${videoInfo.platform}`,
      `点赞数：${videoInfo.stats.likeCount || "未知"}`,
      `收藏数：${videoInfo.stats.collectCount || "未知"}`,
      videoInfo.stats.publishTime
        ? `发布时间：${new Date(videoInfo.stats.publishTime * 1000).toLocaleDateString("zh-CN")}`
        : "",
      `原始链接：${videoInfo.originalLink}`,
    ].filter(Boolean).join("\n");

    const userPromptExtra = draft.prompt.replace(videoUrl, "").replace(/@视频\d+/g, "").trim();
    const userContext = userPromptExtra ? `\n\n用户补充要求：${userPromptExtra}` : "";
    const transcriptSection = transcript
      ? `\n\n【口播文案（ASR 转录）】\n${transcript}`
      : "\n\n（未能获取到口播文案，请根据封面和元数据推断）";

    // 尝试使用多模态（封面图 + 口播文案 + 文本）
    if (videoInfo.coverUrl) {
      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: BREAKDOWN_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: `请拆解以下视频：\n\n${videoMeta}${transcriptSection}${userContext}\n\n以下是视频封面图：` },
                { type: "image_url", image_url: { url: videoInfo.coverUrl, detail: "high" } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "viral_breakdown",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  breakdownSummary: { type: "string" },
                  overallScore: { type: "number" },
                  scoreDimensions: { type: "object", properties: { logic: { type: "number" }, emotion: { type: "number" }, visual: { type: "number" }, commercial: { type: "number" } }, required: ["logic","emotion","visual","commercial"], additionalProperties: false },
                  coreLabels: { type: "array", items: { type: "string" } },
                  oneLinerComment: { type: "string" },
                  hookAnalysis: { type: "object", properties: { visualHook: { type: "string" }, audioHook: { type: "string" }, copyHookType: { type: "string" }, copyHookReason: { type: "string" }, hookImitationTip: { type: "string" } }, required: ["visualHook","audioHook","copyHookType","copyHookReason","hookImitationTip"], additionalProperties: false },
                  rhythmAnalysis: { type: "object", properties: { stimulusIntervalSeconds: { type: "number" }, emotionCurve: { type: "string" }, dopamineNodes: { type: "array", items: { type: "string" } } }, required: ["stimulusIntervalSeconds","emotionCurve","dopamineNodes"], additionalProperties: false },
                  scriptLogic: { type: "object", properties: { structureModules: { type: "array", items: { type: "string" } }, powerWords: { type: "array", items: { type: "string" } }, goldenQuotes: { type: "array", items: { type: "string" } } }, required: ["structureModules","powerWords","goldenQuotes"], additionalProperties: false },
                  monetizationAnalysis: { type: "object", properties: { personaType: { type: "string" }, monetizationPoints: { type: "array", items: { type: "string" } }, conversionScript: { type: "string" } }, required: ["personaType","monetizationPoints","conversionScript"], additionalProperties: false },
                  engagementEngineering: { type: "object", properties: { controversyTraps: { type: "string" }, predictedTopComments: { type: "array", items: { type: "string" } }, ctaType: { type: "string" } }, required: ["controversyTraps","predictedTopComments","ctaType"], additionalProperties: false },
                  copyPoints: { type: "array", items: { type: "string" } },
                  avoidPoints: { type: "array", items: { type: "string" } },
                  migrationSteps: { type: "array", items: { type: "string" } },
                  scriptSkeleton: { type: "string" },
                  shootingGuide: { type: "object", properties: { shotComposition: { type: "string" }, performanceStyle: { type: "string" }, bgmStyle: { type: "string" } }, required: ["shotComposition","performanceStyle","bgmStyle"], additionalProperties: false },
                  hookType: { type: "string" },
                  contentStructure: { type: "string" },
                  estimatedDuration: { type: "string" },
                  targetAudience: { type: "string" },
                },
                required: ["breakdownSummary","overallScore","scoreDimensions","coreLabels","oneLinerComment","hookAnalysis","rhythmAnalysis","scriptLogic","monetizationAnalysis","engagementEngineering","copyPoints","avoidPoints","migrationSteps","scriptSkeleton","shootingGuide","hookType","contentStructure","estimatedDuration","targetAudience"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = resp.choices[0]?.message?.content;
        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        breakdownResult = JSON.parse(contentStr ?? "{}");
        log.info("多模态 LLM 拆解成功");
      } catch (mmErr) {
        log.warn({ err: mmErr }, "多模态 LLM 拆解失败，降级到纯文本模式");
        const textResp = await callLLM({
          modelId: "doubao",
          messages: [
            { role: "system", content: BREAKDOWN_SYSTEM_PROMPT },
            { role: "user", content: `请拆解以下视频：\n\n${videoMeta}${transcriptSection}\n封面图链接：${videoInfo.coverUrl}${userContext}` },
          ],
          maxTokens: 4096,
          timeoutMs: 60_000,
        });
        breakdownResult = JSON.parse(textResp.content);
      }
    } else {
      const textResp = await callLLM({
        modelId: "doubao",
        messages: [
          { role: "system", content: BREAKDOWN_SYSTEM_PROMPT },
          { role: "user", content: `请拆解以下视频：\n\n${videoMeta}${transcriptSection}${userContext}` },
        ],
        maxTokens: 4096,
        timeoutMs: 60_000,
      });
      breakdownResult = JSON.parse(textResp.content);
    }
  } catch (err) {
    log.error({ err }, "LLM 拆解失败");
    throw new Error(`AI 分析失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  onProgress?.({ type: "llm_done" });

  // Step 3: 构建标准化结果（与 runLivePrediction 格式一致）
  const connectorStore = await readConnectorStore();
  const platforms = getCandidatePlatforms(draft);
  const connectors = platforms.map((p) => createConnectorLike(p, connectorStore[p]));
  const baseArtifacts = buildPredictionArtifacts(draft, connectors, []);

  const videoPlatformName = videoInfo.platform || "未知平台";
  const videoTitle = videoInfo.title || "未知视频";

  const bestActionNow: PredictionBestAction = {
    type: "generate_test_brief",
    title: "拿到拆解结果了，开始改编",
    description: "基于拆解出的可抄结构，生成适合你的改编脚本",
    ctaLabel: "生成改编脚本",
    reason: "已完成深度拆解，可以直接进入改编阶段",
  };

  const supportingContents = [
    {
      contentId: `src_${randomUUID().slice(0, 8)}`,
      title: videoTitle,
      platform: videoPlatformName,
      authorName: "原视频",
      likeCount: videoInfo.stats.likeCount || null,
      viewCount: null,
      commentCount: null,
      shareCount: null,
      collectCount: videoInfo.stats.collectCount || null,
      publishedAt: videoInfo.stats.publishTime
        ? new Date(videoInfo.stats.publishTime * 1000).toISOString()
        : "",
      contentUrl: videoInfo.originalLink,
      keywordTokens: [] as string[],
      structureSummary: breakdownResult.contentStructure ?? "",
      whyIncluded: "用户提交的拆解目标视频",
    },
  ];

  const safeActionLevel: PredictionSafeActionLevel = "shoot_now";

  const result: Partial<PredictionUiResult> & Record<string, unknown> = {
    type: "爆款拆解",
    platform: [videoPlatformName],
    score: clampScore(videoInfo.stats.likeCount),
    scoreLabel: "值得借鉴",
    verdict: "go_now",
    confidenceLabel: "高",
    opportunityTitle: `${videoTitle.slice(0, 20)} · 爆款拆解`,
    opportunityType: "structure_window",
    windowStrength: "strong_now",
    coreBet: breakdownResult.breakdownSummary,
    decisionBoundary: `已完成「${videoTitle.slice(0, 15)}」的深度拆解，${breakdownResult.copyPoints.length} 个可抄点 + ${breakdownResult.migrationSteps.length} 步迁移方案已就绪。`,
    marketEvidence: {
      evidenceWindowLabel: `视频拆解 · ${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}`,
      momentumLabel: "accelerating" as const,
      kolCount: 0,
      kocCount: 0,
      newCreatorCount: 0,
      similarContentCount: 1,
      growth7d: 0,
      lowFollowerAnomalyRatio: 0,
      timingLabel: `已完成「${videoTitle.slice(0, 15)}」的深度拆解，可直接进入改编阶段。`,
      tierBreakdown: {
        headKol: 0,
        standardKol: 0,
        strongKoc: 0,
        standardKoc: 0,
      },
    },
    supportingAccounts: [],
    supportingContents,
    lowFollowerEvidence: [],
    evidenceGaps: [],
    whyNowItems: [
      ...(breakdownResult.oneLinerComment ? [{ sourceLabel: "专家辣评", fact: breakdownResult.oneLinerComment, inference: "这是该视频火爆的核心原因", userImpact: "理解核心逻辑才能有效复制", tone: "positive" as const }] : []),
      ...(breakdownResult.hookAnalysis?.copyHookType ? [{ sourceLabel: "钩子类型", fact: `${breakdownResult.hookAnalysis.copyHookType}：${breakdownResult.hookAnalysis.copyHookReason ?? ""}`, inference: "这种钩子类型容易吸引用户停留", userImpact: breakdownResult.hookAnalysis.hookImitationTip ?? "可以直接复用这种钩子结构", tone: "positive" as const }] : []),
      ...(breakdownResult.rhythmAnalysis?.emotionCurve ? [{ sourceLabel: "情绪曲线", fact: `${breakdownResult.rhythmAnalysis.emotionCurve}（每${breakdownResult.rhythmAnalysis.stimulusIntervalSeconds ?? "??"}秒一个刺激点）`, inference: "节奏控制是完播率的关键", userImpact: "模仿时保持相同的信息密度", tone: "positive" as const }] : []),
      ...(breakdownResult.contentStructure ? [{ sourceLabel: "内容结构", fact: breakdownResult.contentStructure, inference: "结构化的内容更容易被复制", userImpact: "可以按这个结构模板改编", tone: "positive" as const }] : []),
      ...(breakdownResult.targetAudience ? [{ sourceLabel: "目标受众", fact: breakdownResult.targetAudience, inference: "明确的受众定位有助于内容迁移", userImpact: "确认你的受众是否重叠", tone: "neutral" as const }] : []),
      ...(breakdownResult.monetizationAnalysis?.personaType ? [{ sourceLabel: "人设分析", fact: breakdownResult.monetizationAnalysis.personaType, inference: "人设是长期流量的核心资产", userImpact: "思考你的人设是否与此类似", tone: "neutral" as const }] : []),
      ...(breakdownResult.engagementEngineering?.controversyTraps ? [{ sourceLabel: "互动工程", fact: breakdownResult.engagementEngineering.controversyTraps, inference: "算法友好度直接影响推流量级", userImpact: "可以参考这种互动设计", tone: "neutral" as const }] : []),
    ],
    bestFor: breakdownResult.copyPoints,
    notFor: breakdownResult.avoidPoints,
    accountMatchSummary: `基于${videoPlatformName}视频「${videoTitle.slice(0, 20)}」的深度拆解分析`,
    bestActionNow,
    whyNotOtherActions: ["已完成深度拆解，可以直接进入改编阶段。"],
    missIfWait: "拆解结果已就绪，可以直接开始改编。",
    operatorPanel: {
      reportSummary: `已完成「${videoTitle.slice(0, 15)}」的深度拆解。`,
      sourceNotes: [`数据来源：${videoPlatformName}视频解析 + AI 多模态分析`],
      platformNotes: [`${videoPlatformName}：已解析`],
      benchmarkHints: [`原视频：${videoTitle.slice(0, 30)}`],
      riskSplit: [`拆解了 ${breakdownResult.copyPoints.length} 个可抄点和 ${breakdownResult.avoidPoints.length} 个避坑点。`],
      counterSignals: [],
      dataGaps: [],
    },
    screeningReport: {
      safeActionLevel,
      evidenceAlignment: "strong" as const,
      acceptedAccountIds: [],
      acceptedContentIds: supportingContents.map((c) => c.contentId),
      acceptedLowFollowerIds: [],
      missingEvidence: [],
      contradictionSummary: [],
      candidates: [],
    },
    primaryCard: {
      title: "爆款指数仪表盘",
      ctaLabel: "查看详情",
      description: breakdownResult.oneLinerComment ?? `${videoPlatformName}视频「${videoTitle.slice(0, 15)}」的深度拆解`,
      reason: `综合评分 ${breakdownResult.overallScore ?? clampScore(videoInfo.stats.likeCount)} 分 · 点赞 ${formatCount(videoInfo.stats.likeCount)}`,
      previewSections: [
        {
          title: "多维评分",
          items: [
            `逻辑: ${breakdownResult.scoreDimensions?.logic ?? "--"}/100`,
            `情绪: ${breakdownResult.scoreDimensions?.emotion ?? "--"}/100`,
            `画面: ${breakdownResult.scoreDimensions?.visual ?? "--"}/100`,
            `商业: ${breakdownResult.scoreDimensions?.commercial ?? "--"}/100`,
          ],
        },
        ...(breakdownResult.coreLabels?.length ? [{ title: "算法标签", items: breakdownResult.coreLabels }] : []),
        ...(breakdownResult.scriptLogic?.goldenQuotes?.length ? [{ title: "金句提取", items: breakdownResult.scriptLogic.goldenQuotes }] : []),
      ],
      continueIf: ["如果你的赛道与该视频相似，可以直接借鉴"],
      stopIf: ["如果受众完全不重叠，不建议直接复制"],
      evidenceRefs: [],
      actionMode: "open_deep_dive",
    },
    secondaryCard: {
      title: "像素级复刻SOP",
      ctaLabel: "查看复刻方案",
      description: `${breakdownResult.copyPoints.length} 个可抄点 + ${breakdownResult.migrationSteps.length} 步迁移 + 脚本骨架 + 拍摄通告单`,
      reason: breakdownResult.hookAnalysis?.copyHookType ? `${breakdownResult.hookAnalysis.copyHookType}钩子 · 每${breakdownResult.rhythmAnalysis?.stimulusIntervalSeconds ?? "?"}秒一个刺激点` : "已完成结构拆解",
      previewSections: [
        { title: "值得抄", items: breakdownResult.copyPoints.slice(0, 3) },
        { title: "要避开", items: breakdownResult.avoidPoints.slice(0, 2) },
        ...(breakdownResult.shootingGuide ? [{ title: "拍摄通告单", items: [
          breakdownResult.shootingGuide.shotComposition ?? "",
          breakdownResult.shootingGuide.performanceStyle ?? "",
          `BGM: ${breakdownResult.shootingGuide.bgmStyle ?? ""}`
        ].filter(Boolean) }] : []),
      ],
      continueIf: breakdownResult.migrationSteps.slice(0, 2),
      stopIf: breakdownResult.avoidPoints.slice(0, 1),
      evidenceRefs: [],
      actionMode: "open_deep_dive",
    },
    fitSummary: "当前页重点是拆解这条视频的可复制结构，找到值得抄的点和迁移方案。",
    recommendedNextAction: bestActionNow,
    continueIf: breakdownResult.migrationSteps,
    stopIf: breakdownResult.avoidPoints,
    normalizedBrief: {
      ...baseArtifacts.normalizedBrief,
      seedTopic: videoTitle.slice(0, 30),
    },
    platformSnapshots: baseArtifacts.platformSnapshots,
    scoreBreakdown: baseArtifacts.scoreBreakdown,
    recommendedLowFollowerSampleIds: [],
    hotSeedCount: 0,
  };

  // Build agent contract
  const runtimeMeta = {
    sourceMode: "live" as const,
    executionStatus: "success" as const,
    usedPlatforms: [videoPlatformName],
    usedRouteChain: [`${videoPlatformName}:video_parse`],
    degradeFlags: [] as string[],
    endpointHealthVersion: nowIso(),
  };

  const runId = `run_${randomUUID()}`;
  const contract = buildAgentContract({
    runId,
    request: draft,
    artifacts: {
      ...baseArtifacts,
      uiResult: result as PredictionUiResult,
      normalizedBrief: baseArtifacts.normalizedBrief,
      platformSnapshots: baseArtifacts.platformSnapshots,
      scoreBreakdown: baseArtifacts.scoreBreakdown,
      recommendedLowFollowerSampleIds: [],
    },
    runtimeMeta,
    degradeFlags: [],
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
      kind: "viral_breakdown" as const,
      breakdownSummary: breakdownResult.breakdownSummary,
      overallScore: breakdownResult.overallScore,
      scoreDimensions: breakdownResult.scoreDimensions,
      coreLabels: breakdownResult.coreLabels,
      oneLinerComment: breakdownResult.oneLinerComment,
      hookAnalysis: breakdownResult.hookAnalysis,
      rhythmAnalysis: breakdownResult.rhythmAnalysis,
      scriptLogic: breakdownResult.scriptLogic,
      monetizationAnalysis: breakdownResult.monetizationAnalysis,
      engagementEngineering: breakdownResult.engagementEngineering,
      copyPoints: breakdownResult.copyPoints,
      avoidPoints: breakdownResult.avoidPoints,
      migrationSteps: breakdownResult.migrationSteps,
      scriptSkeleton: breakdownResult.scriptSkeleton,
      shootingGuide: breakdownResult.shootingGuide,
      proofContents: [
        {
          contentId: `proof_${randomUUID().slice(0, 8)}`,
          title: videoTitle,
          structureSummary: breakdownResult.contentStructure ?? breakdownResult.breakdownSummary,
          whyIncluded: "拆解目标视频",
        },
      ],
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
    degradeFlags: [],
    usedRouteChain: [`${videoPlatformName}:video_parse`],
    endpointHealthVersion: nowIso(),
  };
}

/* ── 辅助函数 ── */

function clampScore(count: number): number {
  if (!count || count <= 0) return 50;
  if (count > 100000) return 95;
  if (count > 50000) return 88;
  if (count > 10000) return 78;
  if (count > 5000) return 68;
  if (count > 1000) return 58;
  return 50;
}

function formatCount(count: number): string {
  if (!count || count <= 0) return "未知";
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}千`;
  return String(count);
}
