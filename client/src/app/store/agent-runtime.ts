import type {
  AgentRecommendedTask,
  AgentRun,
  AgentRunSource,
  AgentTaskPayload,
  PredictionArtifacts,
  PredictionRequestDraft,
  TaskArtifact,
  TaskArtifactType,
  TaskIntent,
  TaskIntentClassification,
  TaskIntentConfidence,
} from "./prediction-types.js";

export const TASK_INTENT_META: Record<
  TaskIntent,
  {
    label: string;
    shortLabel: string;
    description: string;
    artifactType: TaskArtifactType;
    watchable: boolean;
    shareable: boolean;
    historyType: string;
    defaultPrimaryCta: string;
  }
> = {
  opportunity_prediction: {
    label: "爆款预测",
    shortLabel: "预测",
    description: "预测赛道爆款机会，给出 3-5 个可执行选题和切入方式。",
    artifactType: "opportunity_memo",
    watchable: true,
    shareable: true,
    historyType: "爆款预测",
    defaultPrimaryCta: "看预测结果",
  },
  trend_watch: {
    label: "趋势观察",
    shortLabel: "观察",
    description: "盯住窗口信号、复查阈值和重判时机。",
    artifactType: "trend_watchlist",
    watchable: true,
    shareable: true,
    historyType: "趋势观察",
    defaultPrimaryCta: "看观察重点",
  },
  viral_breakdown: {
    label: "爆款拆解",
    shortLabel: "拆解",
    description: "拆出值得抄的结构、避坑点和迁移方式。",
    artifactType: "breakdown_sheet",
    watchable: false,
    shareable: true,
    historyType: "爆款拆解",
    defaultPrimaryCta: "看可抄点",
  },
  topic_strategy: {
    label: "选题策略",
    shortLabel: "策略",
    description: "给出值得优先执行的题目方向和切入理由。",
    artifactType: "topic_plan",
    watchable: false,
    shareable: true,
    historyType: "选题策略",
    defaultPrimaryCta: "看题目方向",
  },
  copy_extraction: {
    label: "文案提取",
    shortLabel: "提取",
    description: "提炼可直接拿走的钩子、结构和 CTA 模式。",
    artifactType: "copy_pack",
    watchable: false,
    shareable: true,
    historyType: "文案提取",
    defaultPrimaryCta: "看可复用表达",
  },
  account_diagnosis: {
    label: "账号诊断",
    shortLabel: "诊断",
    description: "回答这个号该继续什么、停什么、补什么。",
    artifactType: "account_diagnosis_sheet",
    watchable: true,
    shareable: true,
    historyType: "账号诊断",
    defaultPrimaryCta: "看账号打法",
  },
  breakdown_sample: {
    label: "样本拆解",
    shortLabel: "拆解",
    description: "拆解低粉爆款样本的结构、爆因和迁移路径。",
    artifactType: "breakdown_sample_sheet",
    watchable: false,
    shareable: true,
    historyType: "样本拆解",
    defaultPrimaryCta: "生成翻拍脚本",
  },
  direct_request: {
    label: "智能分析",
    shortLabel: "分析",
    description: "根据你的需求直接生成分析报告，以编辑器形式展示。",
    artifactType: "direct_request_doc",
    watchable: false,
    shareable: true,
    historyType: "智能分析",
    defaultPrimaryCta: "查看分析报告",
  },
};

const SKILL_INTENT_MAP: Record<string, TaskIntent> = {
  "douyin-copy-extraction": "copy_extraction",
  "xhs-topic-strategy": "topic_strategy",
  "viral-script-breakdown": "viral_breakdown",
  "account-positioning-diagnosis": "account_diagnosis",
};

const TEMPLATE_INTENT_MAP: Record<string, TaskIntent> = {
  "opportunity-forecast": "opportunity_prediction",
  "hotspot-watch": "trend_watch",
  "viral-breakdown": "viral_breakdown",
  "copy-extraction": "copy_extraction",
  "account-diagnosis": "account_diagnosis",
};

const PROMPT_RULES: Array<{
  intent: TaskIntent;
  confidence: TaskIntentConfidence;
  patterns: RegExp[];
  reason: string;
}> = [
  {
    intent: "copy_extraction",
    confidence: "high",
    patterns: [/(提取|文案|钩子|CTA|结尾|表达方式|口播稿)/i],
    reason: "prompt 明确要求提取文案结构、钩子或 CTA。",
  },
  {
    intent: "account_diagnosis",
    confidence: "high",
    patterns: [/(账号定位|定位诊断|账号诊断|这个号|这个账号|人设|对标账号|主页诊断)/i],
    reason: "prompt 明确要求诊断账号定位或当前账号承接能力。",
  },
  {
    intent: "viral_breakdown",
    confidence: "high",
    patterns: [/(拆解|该抄哪|结构迁移|可抄点|脚本拆解|爆款结构)/i],
    reason: "prompt 明确要求拆解内容结构和迁移方式。",
  },
  {
    intent: "opportunity_prediction",
    confidence: "high",
    patterns: [/(什么会火|什么容易爆|爆款预测|爆款机会|爆款方向|发什么会火|做什么会火|现在什么火|现在发什么会火|赛道机会)/i],
    reason: "prompt 明确在问爆款机会和爆款预测。",
  },
  {
    intent: "topic_strategy",
    confidence: "high",
    patterns: [/(选题策略|选题方向|选题计划|选题清单|内容策略|内容规划|内容日历|内容排期|帮我规划|帮我想选题)/i],
    reason: "prompt 明确要求生成选题清单或内容计划。",
  },
  {
    intent: "trend_watch",
    confidence: "medium",
    patterns: [/(热点|热搜|热榜|观察|盯住|监控|趋势提醒|观察清单)/i],
    reason: "prompt 更像观察和监控任务，而不是直接下注或拆解。",
  },
  {
    intent: "opportunity_prediction",
    confidence: "medium",
    patterns: [/(值不值得|能不能做|下注|机会|趋势|赛道|未来|现在做不做)/i],
    reason: "prompt 更像爆款预测和下注决策。",
  },
];

function scoreToConfidence(score: number): TaskIntentConfidence {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function uniqueIntents(intents: TaskIntent[]) {
  return [...new Set(intents)];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function trimArray(values: string[], size: number) {
  return values.filter(Boolean).slice(0, size);
}

// function buildFallbackReason(intent: TaskIntent) {
//   return `当前输入没有命中更强的任务信号，先按${TASK_INTENT_META[intent].label}处理。`;
// }

export function resolveAgentRunSource(
  entrySource: PredictionRequestDraft["entrySource"] | undefined,
): AgentRunSource {
  if (entrySource === "example") return "example";
  if (entrySource === "skill") return "skill";
  return "home_input";
}

export function classifyTaskIntent(draft: PredictionRequestDraft): TaskIntentClassification {
  // live 模式下，如果服务端已注入 LLM 意图识别结果，直接返回，跳过正则规则
  if (draft.llmIntentOverride) {
    const override = draft.llmIntentOverride;
    return {
      taskIntent: override.taskIntent,
      confidence: override.confidence,
      candidateIntents: override.candidateIntents,
      reasons: override.reasons,
    };
  }

  const reasons: string[] = [];
  const scored = new Map<TaskIntent, number>();

  const addScore = (intent: TaskIntent, score: number, reason?: string) => {
    scored.set(intent, clampScore((scored.get(intent) ?? 0) + score));
    if (reason) reasons.push(reason);
  };

  if (draft.selectedSkillId && SKILL_INTENT_MAP[draft.selectedSkillId]) {
    addScore(
      SKILL_INTENT_MAP[draft.selectedSkillId],
      92,
      `当前选择的技能会优先把任务收敛到${TASK_INTENT_META[SKILL_INTENT_MAP[draft.selectedSkillId]].label}。`,
    );
  }

  if (draft.entryTemplateId && TEMPLATE_INTENT_MAP[draft.entryTemplateId]) {
    addScore(
      TEMPLATE_INTENT_MAP[draft.entryTemplateId],
      74,
      `当前示例模板更接近${TASK_INTENT_META[TEMPLATE_INTENT_MAP[draft.entryTemplateId]].label}任务。`,
    );
  }

  if (draft.evidenceItems.some((item) => /^https?:\/\//.test(item.source))) {
    addScore("viral_breakdown", 82, "输入里包含外部链接，优先考虑结构拆解或迁移任务。");
  }

  if (
    draft.evidenceItems.some(
      (item) => item.kind === "video" || item.kind === "image" || item.kind === "file",
    )
  ) {
    addScore("copy_extraction", 60, "输入里包含素材资源，可优先提取表达结构和可复用片段。");
  }

  if (draft.connectedPlatforms.length > 0 && /(账号|定位|这个号|主页)/.test(draft.prompt)) {
    addScore("account_diagnosis", 76, "已连接平台且 prompt 提到账号问题，优先走账号诊断。");
  }

  for (const rule of PROMPT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(draft.prompt))) {
      addScore(rule.intent, rule.confidence === "high" ? 88 : 68, rule.reason);
    }
  }

  if (scored.size === 0) {
    // 没有命中任何任务信号，说明用户输入的是直接需求，不适合结构化卡片渲染
    addScore("direct_request", 52, "当前输入没有命中特定任务信号，直接生成分析报告。");
  }

  const ranked = [...scored.entries()].sort((left, right) => right[1] - left[1]);
  const [topIntent, topScore] = ranked[0] ?? ["opportunity_prediction", 52];
  const candidateIntents = uniqueIntents(
    ranked.slice(0, 3).map(([intent]) => intent as TaskIntent),
  );

  return {
    taskIntent: topIntent as TaskIntent,
    confidence: scoreToConfidence(topScore),
    candidateIntents,
    reasons: trimArray(reasons, 4),
  };
}

function buildTopicDirections(artifacts: PredictionArtifacts) {
  const rawTokens = [
    ...artifacts.uiResult.supportingContents.flatMap((item) => item.keywordTokens),
    ...artifacts.uiResult.supportingAccounts.flatMap((item) => item.recentTopicClusters),
  ];
  return uniqueStrings(rawTokens)
    .slice(0, 3)
    .map((token, index) => ({
      title: `${token} 切口 ${index + 1}`,
      whyNow:
        artifacts.uiResult.whyNowItems[index]?.inference ??
        artifacts.uiResult.coreBet,
      fitNote:
        artifacts.uiResult.bestFor[index] ??
        artifacts.uiResult.accountMatchSummary,
    }));
}

function extractHookPatterns(artifacts: PredictionArtifacts) {
  const titleHooks = artifacts.uiResult.supportingContents
    .map((item) => item.title)
    .slice(0, 3);
  const structuralHooks = artifacts.uiResult.whyNowItems
    .map((item) => item.userImpact)
    .slice(0, 2);
  return trimArray([...titleHooks, ...structuralHooks], 4);
}

export function buildTaskPayload(
  classification: TaskIntentClassification,
  artifacts: PredictionArtifacts,
): AgentTaskPayload {
  const { taskIntent } = classification;
  const result = artifacts.uiResult;

  if (taskIntent === "trend_watch") {
    return {
      kind: "trend_watch",
      watchSummary:
        result.bestActionNow.type === "monitor"
          ? result.bestActionNow.reason
          : "这次结果更适合先盯住信号变化，再决定是否升级到执行。",
      watchSignals: trimArray(
        result.whyNowItems.map((item) => `${item.sourceLabel}：${item.fact}`),
        3,
      ).map((item, index) => ({
        label: `信号 ${index + 1}`,
        detail: item,
      })),
      revisitTriggers: trimArray(result.continueIf, 3),
      cooldownWarnings: trimArray(result.stopIf, 3),
      scheduleHint:
        result.windowStrength === "observe" || result.windowStrength === "avoid"
          ? "建议按 72 小时节奏复查。"
          : "建议按日复查，观察信号是否继续放大。",
    };
  }

  if (taskIntent === "viral_breakdown") {
    return {
      kind: "viral_breakdown",
      breakdownSummary:
        result.supportingContents[0]?.structureSummary ??
        result.bestActionNow.description,
      copyPoints: trimArray(
        [
          ...result.supportingContents
            .slice(0, 2)
            .map((item) => item.structureSummary),
          ...result.primaryCard.previewSections.flatMap((section) => section.items),
        ],
        4,
      ),
      avoidPoints: trimArray(
        [...result.notFor, ...result.whyNotOtherActions, ...result.stopIf],
        4,
      ),
      migrationSteps: trimArray(
        result.primaryCard.previewSections.flatMap((section) => section.items),
        4,
      ),
      proofContents: result.supportingContents.slice(0, 3).map((item) => ({
        contentId: item.contentId,
        title: item.title,
        structureSummary: item.structureSummary,
        whyIncluded: item.whyIncluded,
      })),
    };
  }

  if (taskIntent === "topic_strategy") {
    return {
      kind: "topic_strategy",
      strategySummary: result.coreBet,
      topicDirections: buildTopicDirections(artifacts),
      fitRationale: result.accountMatchSummary,
      firstMoves: trimArray(
        result.primaryCard.previewSections.flatMap((section) => section.items),
        4,
      ),
      stopRules: trimArray(result.stopIf, 3),
    };
  }

  if (taskIntent === "copy_extraction") {
    return {
      kind: "copy_extraction",
      extractionSummary:
        result.supportingContents[0]?.whyIncluded ??
        "这次任务重点不是继续判断，而是把现有内容里的表达资产提炼出来。",
      hookPatterns: extractHookPatterns(artifacts),
      structurePatterns: trimArray(
        result.supportingContents.map((item) => item.structureSummary),
        4,
      ),
      ctaPatterns: trimArray(
        [
          ...result.primaryCard.previewSections.flatMap((section) => section.items),
          result.bestActionNow.reason,
        ],
        4,
      ),
      reusablePhrases: trimArray(
        [
          ...result.supportingContents.flatMap((item) => item.keywordTokens),
          ...result.whyNowItems.map((item) => item.userImpact),
        ],
        4,
      ),
    };
  }

  if (taskIntent === "account_diagnosis") {
    return {
      kind: "account_diagnosis",
      diagnosisSummary: result.accountMatchSummary,
      strengths: trimArray(result.bestFor, 4),
      gaps: trimArray(result.notFor, 4),
      benchmarkAccounts: result.supportingAccounts.slice(0, 3).map((account) => ({
        accountId: account.accountId,
        displayName: account.displayName,
        handle: account.handle,
        tierLabel: account.tierLabel,
        whyIncluded: account.whyIncluded,
      })),
      adjustments: trimArray(
        [
          ...result.continueIf,
          ...result.primaryCard.previewSections.flatMap((section) => section.items),
        ],
        4,
      ),
    };
  }

  if (taskIntent === "direct_request") {
    return {
      kind: "direct_request",
      userPrompt: result.coreBet || "",
      reportMarkdown: "",  // 会在前端由 generateDirectResultMarkdown 生成
      coreSummary: result.coreBet || result.bestActionNow.description,
      suggestedNextSteps: trimArray(
        [
          ...result.continueIf,
          ...result.primaryCard.previewSections.flatMap((section) => section.items),
        ],
        4,
      ),
    };
  }

  return {
    kind: "opportunity_prediction",
    highlight: result.coreBet,
    verdictLabel: result.bestActionNow.title,
    evidenceSummary: trimArray(result.whyNowItems.map((item) => item.fact), 3),
    bestActionReason: result.bestActionNow.reason,
    supportingProofTitles: trimArray(
      [
        ...result.supportingContents.map((item) => item.title),
        ...result.supportingAccounts.map((item) => item.displayName),
      ],
      4,
    ),
  };
}

export function buildRecommendedNextTasks(
  classification: TaskIntentClassification,
  artifacts: PredictionArtifacts,
): AgentRecommendedTask[] {
  const result = artifacts.uiResult;
  const makeTask = (
    taskIntent: TaskIntent,
    title: string,
    reason: string,
    actionLabel: string,
  ): AgentRecommendedTask => ({
    taskIntent,
    title,
    reason,
    actionLabel,
  });

  switch (classification.taskIntent) {
    case "opportunity_prediction": {
      const score = result.score ?? 0;
      const topic = result.opportunityTitle || artifacts.normalizedBrief?.seedTopic || "这个方向";
      const shortTopic = topic.slice(0, 8);
      const contentCount = result.supportingContents?.length ?? 0;
      const accountCount = result.supportingAccounts?.length ?? 0;

      if (result.confidenceLabel === "高" && result.windowStrength === "strong_now") {
        return [
          makeTask(
            "topic_strategy",
            `把「${shortTopic}」收口成选题`,
            `机会得分 ${score}，${contentCount} 条内容支撑，窗口期强，应立即转化为可执行选题。`,
            "继续到选题策略",
          ),
        ];
      }
      if (result.opportunityType === "structure_window") {
        return [
          makeTask(
            "viral_breakdown",
            `拆解「${shortTopic}」的结构`,
            `当前机会属于结构迁移窗口，${accountCount} 个账号已验证，先拆清可复制结构再执行。`,
            "继续到爆款拆解",
          ),
        ];
      }
      return [
        makeTask(
          "trend_watch",
          `监控「${shortTopic}」的变化`,
          `当前得分 ${score}，信号还不够强，建议建立监控等待更明确的时机。`,
          "开启智能监控",
        ),
      ];
    }
    case "viral_breakdown":
      return [
        makeTask(
          "copy_extraction",
          "把拆解结果提成表达资产",
          "结构看清后，下一步应该把钩子、过渡和 CTA 抽出来。",
          "继续到文案提取",
        ),
        makeTask(
          "topic_strategy",
          "把结构改写成你能做的题目",
          "不是所有拆解都该直接照搬，先换成适合你的题目方向。",
          "继续到选题策略",
        ),
      ];
    case "topic_strategy": {
      // 从 artifacts 中提取选题策略的具体数据
      const topicV2 = (artifacts as unknown as Record<string, unknown>).topicStrategyV2 as Record<string, unknown> | undefined;
      const v2Dirs = (topicV2?.directions ?? []) as Array<{ directionName: string; validationScore: number; executableTopics: unknown[] }>;
      const bestDir = v2Dirs.length > 0
        ? [...v2Dirs].sort((a, b) => (b.validationScore ?? 0) - (a.validationScore ?? 0))[0]
        : null;
      const totalTopics = v2Dirs.reduce((sum, d) => sum + (d.executableTopics?.length ?? 0), 0);
      const tasks: AgentRecommendedTask[] = [];

      if (bestDir && bestDir.validationScore >= 50) {
        tasks.push(makeTask(
          "copy_extraction",
          `拆解「${bestDir.directionName.slice(0, 8)}」的表达结构`,
          `最优方向验证分 ${bestDir.validationScore}，已有 ${bestDir.executableTopics?.length ?? 0} 个可执行选题，下一步拆解表达结构和钩子设计。`,
          "继续到文案拆解",
        ));
      } else if (bestDir) {
        tasks.push(makeTask(
          "opportunity_prediction",
          `验证「${bestDir.directionName.slice(0, 8)}」的机会`,
          `最优方向验证分仅 ${bestDir.validationScore}，建议先用爆款预测确认这个方向是否值得投入。`,
          "回到爆款预测",
        ));
      }

      if (totalTopics > 0) {
        tasks.push(makeTask(
          "viral_breakdown",
          `拆解 ${totalTopics} 个选题的爆款结构`,
          `本轮生成了 ${totalTopics} 个可执行选题，拆解它们的爆款结构可以提取可迁移的内容模板。`,
          "继续到爆款拆解",
        ));
      }

      // 保底：如果没有任何建议，给一个默认的
      if (tasks.length === 0) {
        tasks.push(makeTask(
          "copy_extraction",
          "继续落执行表达",
          "题目方向确定后，下一步应该把表达方式和 CTA 收口。",
          "继续到文案提取",
        ));
      }

      return tasks.slice(0, 2);
    }
    case "account_diagnosis":
      return [
        makeTask(
          "topic_strategy",
          "把诊断转成内容打法",
          "账号诊断完成后，应该进一步收口到这个号该做哪几题。",
          "继续到选题策略",
        ),
      ];
    case "trend_watch":
      return [
        makeTask(
          "opportunity_prediction",
          "信号升温后重新下注判断",
          "观察任务的终点不是继续看，而是回到是否值得下注的判断。",
          "回到爆款预测",
        ),
      ];
    case "direct_request":
      return [
        makeTask(
          "topic_strategy",
          "把分析结果转化为选题方向",
          "分析报告已生成，下一步可以把结论转化为可执行的选题方向。",
          "继续到选题策略",
        ),
      ];
    default:
      return [
        makeTask(
          "topic_strategy",
          "把提取结果接到执行方向",
          "提取完表达资产后，下一步通常是回到选题和执行收口。",
          "继续到选题策略",
        ),
      ];
  }
}

function buildPrimaryArtifactSummary(
  classification: TaskIntentClassification,
  artifacts: PredictionArtifacts,
) {
  const meta = TASK_INTENT_META[classification.taskIntent];
  const result = artifacts.uiResult;
  return {
    title:
      classification.taskIntent === "copy_extraction"
        ? result.bestActionNow.title || "可复用表达包"
        : result.opportunityTitle,
    summary:
      classification.taskIntent === "trend_watch"
        ? result.bestActionNow.reason
        : result.coreBet,
    watchable: meta.watchable,
    shareable: meta.shareable,
  };
}

export function buildAgentContract(params: {
  runId: string;
  request: PredictionRequestDraft;
  artifacts: PredictionArtifacts;
  runtimeMeta?: Record<string, unknown>;
  degradeFlags?: string[];
}): {
  classification: TaskIntentClassification;
  taskPayload: AgentTaskPayload;
  primaryArtifact: TaskArtifact;
  recommendedNextTasks: AgentRecommendedTask[];
  agentRun: AgentRun;
  title: string;
  summary: string;
  primaryCtaLabel: string;
} {
  const { artifacts, request, runId, runtimeMeta, degradeFlags = [] } = params;
  const classification = classifyTaskIntent(request);
  const taskPayload = buildTaskPayload(classification, artifacts);
  const recommendedNextTasks = buildRecommendedNextTasks(classification, artifacts);
  const artifactMeta = TASK_INTENT_META[classification.taskIntent];
  const primaryArtifactSummary = buildPrimaryArtifactSummary(classification, artifacts);
  const primaryArtifact: TaskArtifact = {
    artifactId: `artifact_seed_${runId}`,
    runId,
    taskIntent: classification.taskIntent,
    artifactType: artifactMeta.artifactType,
    title: primaryArtifactSummary.title,
    summary: primaryArtifactSummary.summary,
    payload: taskPayload as unknown as Record<string, unknown>,
    snapshotRefs: [],
    createdAt: runtimeMeta?.createdAt && typeof runtimeMeta.createdAt === "string"
      ? runtimeMeta.createdAt
      : new Date().toISOString(),
    updatedAt: runtimeMeta?.updatedAt && typeof runtimeMeta.updatedAt === "string"
      ? runtimeMeta.updatedAt
      : new Date().toISOString(),
    watchable: primaryArtifactSummary.watchable,
    shareable: primaryArtifactSummary.shareable,
  };
  const title = primaryArtifact.title;
  const summary = primaryArtifact.summary;
  const primaryCtaLabel =
    recommendedNextTasks[0]?.actionLabel ?? artifactMeta.defaultPrimaryCta;

  const agentRun: AgentRun = {
    runId,
    source: resolveAgentRunSource(request.entrySource),
    taskIntent: classification.taskIntent,
    taskIntentConfidence: classification.confidence,
    status: degradeFlags.length > 0 ? "degraded" : "completed",
    brief: artifacts.normalizedBrief,
    facts: {
      platformSnapshots: artifacts.platformSnapshots,
      scoreBreakdown: artifacts.scoreBreakdown,
      evidenceRefs: artifacts.evidenceRefs,
    },
    judgment: {
      title,
      summary,
      verdict: artifacts.uiResult.verdict,
      confidenceLabel: artifacts.uiResult.confidenceLabel,
      bestAction: artifacts.uiResult.bestActionNow,
    },
    deliverables: [
      {
        kind: "primary_result",
        title: primaryArtifact.title,
        description: primaryArtifact.summary,
        ctaLabel: primaryCtaLabel,
      },
    ],
    recommendedNextTasks,
    artifacts: [primaryArtifact],
    runtimeMeta,
    degradeFlags,
    taskPayload,
  };

  return {
    classification,
    taskPayload,
    primaryArtifact,
    recommendedNextTasks,
    agentRun,
    title,
    summary,
    primaryCtaLabel,
  };
}

export function getTaskIntentLabel(intent: TaskIntent) {
  return TASK_INTENT_META[intent].label;
}

export function getTaskIntentHistoryType(intent: TaskIntent) {
  return TASK_INTENT_META[intent].historyType;
}
