/**
 * breakdown-agent.ts
 * ==================
 * 低粉爆款拆解 Agent 后端模块
 *
 * 负责：
 *   1. 接收前端传来的 CTA 动作请求（actionId + 样本上下文）
 *   2. 根据 actionId 构建对应的专业 Prompt
 *   3. 调用 LLM 网关进行流式输出（SSE）
 *
 * 支持的 CTA 动作（与前端 breakdown-sample-renderer.tsx 对齐）：
 *   - rewrite_script   翻拍脚本
 *   - extract_copy     文案模式提取
 *   - topic_strategy   选题策略
 *   - remake_script    爆款改写脚本（viral-breakdown）
 *   - extract_hooks    钩子提取（viral-breakdown）
 *   - find_similar     相似内容发现（viral-breakdown）
 *   - account_playbook 账号打法手册（account-diagnosis）
 *   - benchmark_accounts 对标账号分析
 *   - stop_list        停止清单
 *   - weekly_plan      周选题计划
 *   - topic_scripts    选题脚本包
 *   - priority_validate 优先级验证
 *   - rewrite_pack     文案改写包
 *   - hook_library     钩子库
 *   - cta_patterns     CTA 模式
 *
 * mock/live 隔离：
 *   本模块只在 live 模式下被调用，mock 模式继续使用
 *   前端 cta-markdown-generator.ts 的本地生成逻辑。
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("BreakdownAgent");
import type { IncomingMessage, ServerResponse } from "node:http";
import { getCorsHeadersObj } from "./cors.js";
import { streamLLMToSSE, type LLMMessage } from "./llm-gateway.js";

/* ------------------------------------------------------------------ */
/*  类型定义                                                             */
/* ------------------------------------------------------------------ */

export interface BreakdownActionRequest {
  /** CTA 动作 ID */
  actionId: string;
  /** 用户选择的模型 */
  modelId: "doubao" | "gpt54" | "claude46";
  /** 样本上下文（从前端 ResultRecord.taskPayload 传入） */
  context: {
    sampleTitle?: string;
    platform?: string;
    contentForm?: string;
    anomaly?: number;
    fansLabel?: string;
    playCount?: string;
    trackTags?: string[];
    burstReasons?: string[];
    breakdownSummary?: string;
    copyPoints?: string[];
    avoidPoints?: string[];
    migrationSteps?: string[];
    titleVariants?: string[];
    hookVariants?: string[];
    contentOutline?: string[];
    /** 用户自定义 prompt（来自 CTA 配置的 prompt 字段） */
    userPrompt?: string;
    /** 账号相关上下文（account-diagnosis 类型） */
    accountHandle?: string;
    accountPlatform?: string;
    accountTrack?: string;
    accountFollowers?: number;
    /** 通用 result 标题 */
    resultTitle?: string;
    resultQuery?: string;
    /** 机会判断上下文（opportunity_prediction 类型） */
    opportunityScore?: number;
    verdictLabel?: string;
    whyNow?: string[];
    topContents?: Array<{
      title: string;
      author: string;
      platform: string;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      collects: number | null;
      keywords: string[];
      structure: string;
    }>;
    topAccounts?: Array<{
      name: string;
      handle: string;
      platform: string;
      tier: string;
      followers: number | null;
      topics: string[];
    }>;
    marketEvidence?: Record<string, unknown>;
    lowFollowerEvidence?: Array<{
      title: string;
      account: string;
      fans: string;
      anomaly: number;
      playCount: string;
    }>;
    bestFor?: string[];
    notFor?: string[];
    /**
     * 用户提供的视频链接/分享口令（用于 extract_copy 的真实 ASR 文案提取）
     * 如果提供，将先调用 /api/video/transcribe 获取真实文案，再注入 Prompt
     */
    videoUrl?: string;
    /** ASR 识别出的视频文案（由后端预处理后注入，不从前端直接传入） */
    videoTranscript?: string;
    /** 解析到的视频标题（由后端预处理后注入） */
    videoTitle?: string;
    /** 选题策略 V2 上下文 */
    topicStrategyV2?: {
      track: string;
      accountStage: string;
      platforms: string[];
      strategySummary?: string;
      directions: Array<{
        directionName: string;
        validationScore: number;
        logic: string;
        executableTopics: Array<{
          title: string;
          angle: string;
          hookType: string;
          estimatedDuration: string;
        }>;
        subDirections?: Array<{ name: string; angle: string }>;
      }>;
      peerBenchmarks?: Array<{
        accountName: string;
        followerCount: number;
        engagementRate: number;
        recentWorks: Array<{ title: string; likes: number }>;
      }>;
      crossIndustryInsights?: Array<{
        inspiration: string;
        sourceIndustry: string;
        transferableElements: string[];
      }>;
      searchKeywords?: string[];
    };
  };
  /** 用户 ID（用于积分扣减，可选） */
  userId?: string;
  /** 积分消耗基础值 */
  baseCost?: number;
}

/* ------------------------------------------------------------------ */
/*  Prompt 构建器                                                        */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `你是一位专业的短视频爆款内容策略师，擅长抖音、小红书、视频号等平台的内容分析和创作指导。
你的分析基于真实的爆款数据，输出内容要具体、可落地、有数据支撑。
请用 Markdown 格式输出，结构清晰，适合创作者直接参考使用。
不要输出“好的”、“当然”等废话开头，直接输出内容。
当前日期是 ${new Date().toISOString().slice(0, 10)}，所有内容必须基于当前时间点，不要引用过时的数据或案例。`;

function buildPrompt(req: BreakdownActionRequest): LLMMessage[] {
  const { actionId, context } = req;
  const {
    sampleTitle = "未知样本",
    platform = "抖音",
    contentForm = "短视频",
    anomaly = 5,
    fansLabel = "低粉账号",
    playCount = "未知",
    trackTags = ["内容"],
    burstReasons = ["核心爆因"],
    breakdownSummary = "",
    copyPoints = [],
    avoidPoints = [],
    titleVariants = [],
    hookVariants = [],
    userPrompt = "",
    accountHandle = "",
    accountPlatform = platform,
    accountTrack = trackTags[0] ?? "内容",
    accountFollowers: _accountFollowers = 0,
    resultTitle = sampleTitle,
    resultQuery = "",
    videoTranscript = "",
    videoTitle = "",
    // opportunity_prediction 字段
    opportunityScore = 0,
    verdictLabel = "",
    whyNow = [],
    topContents = [],
    topAccounts = [],
    marketEvidence = {} as Record<string, unknown>,
    lowFollowerEvidence = [],
    bestFor = [],
    notFor = [],
    topicStrategyV2 = undefined as BreakdownActionRequest["context"]["topicStrategyV2"],
  } = context;

  const track = trackTags[0] ?? "内容";

  // 构建选题策略 V2 上下文
  const hasTopicStrategyData = !!topicStrategyV2 && topicStrategyV2.directions.length > 0;
  const topicStrategyContext = hasTopicStrategyData ? `
## 选题策略分析结果
- **赛道**：${topicStrategyV2!.track}
- **账号阶段**：${topicStrategyV2!.accountStage}
- **平台**：${topicStrategyV2!.platforms.join("、")}
${topicStrategyV2!.strategySummary ? `- **策略总结**：${topicStrategyV2!.strategySummary}` : ""}

## 选题方向（按验证分排序）
${topicStrategyV2!.directions.map((d, i) => `### 方向 ${i + 1}：${d.directionName}（验证分 ${d.validationScore}/100）
- **逻辑**：${d.logic}
- **可执行选题**：
${d.executableTopics.map((t, j) => `  ${j + 1}. 「${t.title}」— 角度：${t.angle}，钩子：${t.hookType}，时长：${t.estimatedDuration}`).join("\n")}
${d.subDirections?.length ? `- **子方向**：${d.subDirections.map(s => s.name).join("、")}` : ""}`).join("\n\n")}
${topicStrategyV2!.peerBenchmarks?.length ? `\n## 同行对标账号\n${topicStrategyV2!.peerBenchmarks.map((p, i) => `${i + 1}. **${p.accountName}**（粉丝 ${p.followerCount}，互动率 ${(p.engagementRate * 100).toFixed(1)}%）\n   近期作品：${p.recentWorks.map(w => `「${w.title}」${w.likes}赞`).join("、")}`).join("\n")}` : ""}
${topicStrategyV2!.crossIndustryInsights?.length ? `\n## 跨行业迁移灵感\n${topicStrategyV2!.crossIndustryInsights.map((c, i) => `${i + 1}. **${c.inspiration}**（来源：${c.sourceIndustry}）\n   可迁移元素：${c.transferableElements.join("、")}`).join("\n")}` : ""}
`.trim() : "";

  // 构建机会判断上下文（包含真实样本数据）
  const hasOpportunityData = topContents.length > 0 || topAccounts.length > 0;
  const opportunityContext = hasOpportunityData ? `
## 机会判断结果
- **查询**：${resultQuery}
- **综合机会分**：${opportunityScore}/100
- **判断结论**：${verdictLabel}
${whyNow.length > 0 ? `- **为什么是现在**：${whyNow.join("；")}` : ""}
${bestFor.length > 0 ? `- **适合人群**：${bestFor.join("；")}` : ""}
${notFor.length > 0 ? `- **不适合人群**：${notFor.join("；")}` : ""}
${marketEvidence.similarContentCount ? `- **相似内容数**：${marketEvidence.similarContentCount}` : ""}
${marketEvidence.kolCount ? `- **KOL 入场数**：${marketEvidence.kolCount}` : ""}
${marketEvidence.kocCount ? `- **KOC 入场数**：${marketEvidence.kocCount}` : ""}

## 真实内容样本（已跑通的内容）
${topContents.map((c: Record<string, unknown>, i: number) => `### 样本 ${i + 1}：${c.title}
- 作者：${c.author} · 平台：${c.platform}
- 点赞 ${c.likes ?? "?"}  评论 ${c.comments ?? "?"}  收藏 ${c.collects ?? "?"}  分享 ${c.shares ?? "?"}
- 关键词：${(c.keywords as string[] || []).join("、")}
- 内容结构：${c.structure}`).join("\n")}

## 真实账号样本（同赛道创作者）
${topAccounts.map((a: Record<string, unknown>, i: number) => `${i + 1}. **${a.name}** (@${a.handle}) · ${a.platform} · ${a.tier} · 粉丝 ${a.followers ?? "?"} · 内容方向：${(a.topics as string[] || []).join("、")}`).join("\n")}
${lowFollowerEvidence.length > 0 ? "\n## 低粉爆款样本\n" + lowFollowerEvidence.map((e: Record<string, unknown>, i: number) => (i + 1) + ". 「" + e.title + "」— " + e.account + "(粉丝 " + e.fans + ") · 播放 " + e.playCount + " · 爆发因子 " + e.anomaly + "倍").join("\n") : ""}
`.trim() : "";

  // 构建样本上下文描述
  const sampleContext = `
## 样本信息
- **标题**：${sampleTitle}
- **平台**：${platform} · **内容形式**：${contentForm}
- **账号量级**：${fansLabel} · **播放量**：${playCount}
- **爆发因子**：${anomaly}倍(同量级账号平均值的 ${anomaly} 倍)
- **赛道标签**：${trackTags.join("、")}
- **爆因分析**：${burstReasons.join("、")}
${breakdownSummary ? `- **拆解摘要**：${breakdownSummary}` : ""}
${copyPoints.length > 0 ? `- **可借鉴点**：${copyPoints.slice(0, 3).join("；")}` : ""}
${avoidPoints.length > 0 ? `- **避坑提示**：${avoidPoints.slice(0, 2).join("；")}` : ""}
${titleVariants.length > 0 ? `- **标题参考**：${titleVariants.slice(0, 2).join("；")}` : ""}
${hookVariants.length > 0 ? `- **钩子参考**：${hookVariants.slice(0, 2).join("；")}` : ""}
`.trim();

  // 根据 actionId 构建专属 prompt
  let userMessage = "";

  switch (actionId) {
    case "rewrite_script":
      userMessage = `${sampleContext}

## 任务：生成翻拍脚本

基于以上低粉爆款样本的拆解结果，请生成一版完整的翻拍脚本。

**要求：**
1. 保留「${burstReasons[0]}」这个核心爆因的表达框架
2. 替换成适合 ${track} 赛道的新场景，不照搬原素材
3. 包含以下完整结构：
   - 视频标题(3个备选)
   - 前3秒开场钩子(结果前置 / 冲突建立 / 反常识)
   - 主体内容结构(分段说明每段目的和时长)
   - 结尾 CTA(引导关注/收藏/评论)
4. 每个部分给出具体的台词示例，而不是抽象描述
5. 最后给出一个"注意事项"，说明翻拍时要避免的坑

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "extract_copy": {
      // 如果有 ASR 转录的真实文案，优先使用真实文案进行分析
      const transcriptSection = videoTranscript
        ? `\n\n## 视频原始文案(ASR 识别)\n\n> 以下是视频「${videoTitle || sampleTitle}」的真实口播文案，请基于这个真实内容进行文案模式分析：\n\n${videoTranscript.slice(0, 3000)}${videoTranscript.length > 3000 ? "\n\n(文案较长，已截取前 3000 字)" : ""}`
        : "";

      userMessage = `${sampleContext}${transcriptSection}

## 任务：提取文案模式

${videoTranscript ? "基于以上视频的真实文案和样本信息" : "基于以上低粉爆款样本"}，请系统性地提取可复用的文案模式。

**请输出以下内容：**

### 1. 钉子句式库(3-5个)
每个钉子给出：${videoTranscript ? "原视频中的原话" : "原样本中的例子"} → 通用模板 → 适用场景

### 2. 叙事结构模板
拆解这条内容的叙事骨架，给出可迁移的通用结构

### 3. CTA 转化模式
分析结尾的转化逻辑，给出3种适合 ${track} 赛道的 CTA 变体

### 4. 高频词汇模式
提取${videoTranscript ? "视频文案和" : ""}标题中的高效词汇，说明为什么这些词有效

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;
    }

    case "topic_strategy":
      userMessage = `${sampleContext}

## 任务：制定选题策略

基于以上低粉爆款样本的分析，请为 ${track} 赛道制定系统性的选题策略。

**请输出以下内容：**

### 1. 可持续选题方向（3-5个）
每个方向包含：
- 方向名称和核心逻辑
- 为什么现在做（时机判断）
- 适合什么账号阶段
- 如何低成本验证（最小测试方案）

### 2. 选题优先级矩阵
用表格展示各方向的：流量潜力 × 制作难度 × 竞争强度

### 3. 近期可执行的3个选题
给出具体的标题草稿和内容角度

### 4. 选题避坑指南
基于样本分析，分享 ${track} 赛道里哪些方向需要更巧妙的切入角度才能跑通

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "remake_script":
      userMessage = `${sampleContext}

## 任务：爆款改写脚本

请基于这条爆款内容的结构，生成一版改写脚本。

**要求：**
1. 保留原内容的爆因结构（${burstReasons.join("、")}）
2. 替换为新的场景/角度，避免直接抄袭
3. 输出完整脚本：标题 + 开场 + 主体 + 结尾
4. 说明每个改写决策的理由

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "extract_hooks":
      userMessage = `${sampleContext}

## 任务：提取开头钩子

请深度分析这条爆款内容的开头设计，提取可复用的钩子模式。

**请输出：**

### 1. 原内容钩子分析
- 钩子类型（悬念型/冲突型/反常识型/结果前置型等）
- 钩子的心理机制（为什么有效）
- 留存数据支撑

### 2. 5个改写版本
每个版本：钩子文案 + 适用场景 + 预期效果

### 3. 钩子公式总结
提炼出可套用的通用公式

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "find_similar":
      userMessage = `${sampleContext}

## 任务：相似内容发现与分析

请基于这条爆款内容的特征，分析相似内容的规律并给出发现建议。

**请输出：**

### 1. 内容特征画像
这条内容在 ${platform} 上属于什么类型，核心特征是什么

### 2. 相似内容的共同规律
分析同类爆款的共同特征（选题、结构、表达方式）

### 3. 搜索关键词建议
给出5-8个在 ${platform} 上搜索相似内容的关键词

### 4. 值得关注的账号类型
描述做类似内容的账号画像，方便用户自行寻找对标

### 5. 差异化建议
如何在相似赛道里找到差异化角度

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "account_playbook":
      userMessage = `## 账号信息
- **账号**：${accountHandle || "待分析账号"}
- **平台**：${accountPlatform}
- **赛道**：${accountTrack}

${sampleContext}

## 任务：生成账号打法手册

请基于以上信息，为这个账号生成一份完整的打法手册。

**请输出：**

### 1. 账号定位建议
- 核心人群画像
- 差异化定位
- 内容风格建议

### 2. 内容矩阵规划
- 主力内容类型（占比60%）
- 引流内容类型（占比30%）
- 实验内容类型（占比10%）

### 3. 发布节奏建议
- 发布频率
- 最佳发布时间
- 内容预热策略

### 4. 近期30天行动计划
- 第1周：建立基础
- 第2-3周：测试验证
- 第4周：放大复制

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "benchmark_accounts":
      userMessage = `## 分析背景
- **赛道**：${accountTrack || track}
- **平台**：${accountPlatform || platform}

${sampleContext}

## 任务：对标账号分析

请分析 ${accountTrack || track} 赛道在 ${accountPlatform || platform} 上的对标账号格局。

**请输出：**

### 1. 赛道格局分析
- 头部账号的共同特征
- 中腰部账号的机会窗口
- 新账号的切入策略

### 2. 对标账号类型描述（3-5类）
每类描述：账号特征 + 内容风格 + 数据量级 + 值得学习的点

### 3. 差异化机会
基于现有格局，哪些角度还没被充分占领

### 4. 搜索建议
如何在平台上找到真正值得对标的账号

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "stop_list":
      userMessage = `## 分析背景
- **赛道**：${accountTrack || track}
- **平台**：${accountPlatform || platform}

${sampleContext}

## 任务：生成效率优化清单

请基于爆款样本分析，生成一份“效率优化清单”，帮助创作者把精力集中在真正有效的事情上。

**请输出：**

### 1. 可以优化的内容策略（5-8条）
每条：当前做法 + 为什么效果不佳 + 更高效的替代方案

### 2. 常见的认知升级点
在 ${track} 赛道里，哪些认知升级后能显著提升效果

### 3. 精力重新分配建议
哪些事情可以减少投入，腐出的精力应该投向哪里

### 4. 一个核心原则
用一句话总结最重要的效率最大化原则

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "weekly_plan":
      userMessage = `## 分析背景
- **赛道**：${track}
- **平台**：${platform}

${sampleContext}

## 任务：生成周选题计划

请基于爆款样本分析，生成一份可执行的周选题计划。

**请输出：**

### 本周选题计划（7天）

用表格展示每天的选题方向：
| 日期 | 选题方向 | 标题草稿 | 核心角度 | 预期效果 |

### 选题逻辑说明
- 为什么这样安排顺序
- 哪些选题是主攻，哪些是测试
- 如何根据前几天数据调整后续

### 备用选题（3个）
如果主选题遇到问题，可以替换的备选方向

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "topic_scripts":
      userMessage = `## 分析背景
- **赛道**：${track}
- **平台**：${platform}

${sampleContext}

## 任务：生成选题脚本包

请基于爆款样本分析，生成3个完整的选题脚本。

**每个脚本包含：**
- 标题（3个备选）
- 开场钩子（15字以内）
- 内容结构（分段说明）
- 关键台词（每段核心句子）
- 结尾 CTA

**脚本1：** 直接复刻爆因结构，换新场景
**脚本2：** 保留核心逻辑，升级表达方式
**脚本3：** 反向切入，从不同角度触达同一人群

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "priority_validate":
      userMessage = `## 分析背景
- **赛道**：${track}
- **平台**：${platform}

${sampleContext}

## 任务：选题优先级验证

请帮助验证和排序当前的选题方向，给出优先级建议。

**请输出：**

### 1. 优先级评估框架
用于评估 ${track} 赛道选题的4个维度（给出权重）

### 2. 当前最值得做的方向（TOP 3）
每个方向：评分理由 + 验证方式 + 最小测试成本

### 3. 可以先关注的方向
哪些方向正在蓄力，可以先加入观察等待更好的入场时机

### 4. 快速验证方案
如何用最低成本（1-2条视频）验证一个方向是否值得深耕

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "rewrite_pack":
      userMessage = `## 分析背景
- **内容**：${resultTitle || sampleTitle}

${sampleContext}

## 任务：生成文案改写包

请基于分析结果，生成一套可直接使用的文案改写包。

**请输出：**

### 1. 标题改写包（5个方向）
每个标题：改写版本 + 适用场景 + 预期点击率分析

### 2. 开场文案改写（3个版本）
- 悬念版
- 冲突版
- 结果前置版

### 3. 核心观点改写
将原内容的核心观点用3种不同表达方式呈现

### 4. CTA 改写包（5个）
适合不同目标（关注/收藏/评论/转发）的结尾文案

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "hook_library":
      userMessage = `## 分析背景
- **赛道**：${track}
- **平台**：${platform}

${sampleContext}

## 任务：构建钩子库

请基于爆款分析，构建一个可复用的钩子库。

**请输出：**

### 1. 钩子类型分类（6-8种）
每种类型：定义 + 心理机制 + 适用场景

### 2. 每种类型的钩子示例（各3个）
针对 ${track} 赛道的具体钩子文案

### 3. 钩子组合公式
如何将不同类型的钩子组合使用

### 4. 钩子测试建议
如何快速测试哪种钩子对你的目标人群最有效

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "cta_patterns":
      userMessage = `## 分析背景
- **赛道**：${track}
- **平台**：${platform}

${sampleContext}

## 任务：分析 CTA 模式

请深度分析 ${track} 赛道在 ${platform} 上的高效 CTA 模式。

**请输出：**

### 1. CTA 类型分析（5-6种）
每种类型：特征描述 + 适用目标 + 效果预期

### 2. 高效 CTA 文案示例（各3个）
针对：关注、收藏、评论、转发、私信 分别给出示例

### 3. CTA 时机建议
在视频的哪个位置放置 CTA 效果最好，为什么

### 4. 避免的 CTA 误区
哪些常见的 CTA 方式实际上会降低转化率

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "shoot_plan":
      userMessage = hasOpportunityData
        ? `${opportunityContext}

## 任务：生成开拍方案

基于以上真实样本数据，为「${resultQuery}」赛道生成一版可直接开拍的完整方案。

**核心要求：**
1. 必须基于上面的真实内容样本提取已验证的内容结构，不要编造
2. 参考样本中的关键词和内容结构，生成具体的脚本
3. 结合机会分 ${opportunityScore} 分的判断，给出对应的风险控制建议

**请输出：**

### 1. 内容定位（基于样本分析）
- 已验证的内容方向（从样本中提取）
- 推荐的内容形式和时长
- 目标受众画像

### 2. 脚本结构（3 版备选）
每版包含：
- 标题（参考样本中的高效关键词）
- 前 3 秒钩子（参考样本的开头结构）
- 中间主体（分段说明每段目的和时长）
- 结尾 CTA（参考样本的转化模式）
- 口播文案示例

### 3. 拍摄执行清单
- 场景 / 道具 / 设备建议
- 拍摄技巧（参考样本的视觉风格）
- 发布时间建议

### 4. 止损条件
- 发布后多少小时看哪个指标
- 达到什么标准继续，低于什么标准停止
- 基于机会分 ${opportunityScore} 分的风险控制建议

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`
        : `${sampleContext}

## 任务：生成开拍方案

基于以上样本信息，为「${resultTitle}」生成一版可直接开拍的完整方案。

**请输出：**

### 1. 内容定位
推荐的内容方向、形式和目标受众

### 2. 脚本结构（3 版备选）
每版包含：标题、前 3 秒钩子、主体内容、结尾 CTA、口播文案

### 3. 拍摄执行清单
场景 / 道具 / 设备 / 发布时间

### 4. 止损条件
发布后看哪个指标，达到什么标准继续，低于什么标准停止

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`;
      break;

    case "breakdown_low":
      userMessage = hasOpportunityData
        ? `${opportunityContext}

## 任务：拆解低粉爆款

基于以上真实样本，拆解「${resultQuery}」赛道中低粉账号的爆款内容。

**核心要求：**
1. 从上面的真实样本中找出低粉账号的成功案例
2. 拆解它们的内容结构、标题模式、钩子句式
3. 给出可复制的具体步骤

**请输出：**

### 1. 低粉爆款案例拆解
每个案例包含：
- 为什么爆（核心爆因）
- 内容结构拆解（前 3 秒 / 主体 / 结尾）
- 标题和关键词的巧妙之处
- 你能拄的具体部分

### 2. 共同规律
这些低粉爆款的共同特征是什么

### 3. 可复制步骤
从 0 开始复制这些爆款的具体操作步骤

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`
        : `${sampleContext}

## 任务：拆解低粉爆款

基于以上样本信息，拆解低粉爆款的共同规律和可复制步骤。

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`;
      break;

    case "watch_7d":
      userMessage = hasOpportunityData
        ? `${opportunityContext}

## 任务：制定 7 天观察计划

基于以上机会判断结果，制定一份 7 天观察计划。

**请输出：**

### 1. 观察重点
每天重点关注什么指标

### 2. 升格条件
哪些信号出现时可以加大投入

### 3. 警报条件
哪些信号出现时应该停止

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`
        : `${sampleContext}

## 任务：制定 7 天观察计划

${userPrompt ? "**用户补充要求**：" + userPrompt : ""}`;
      break;

    case "deep_dive":
      userMessage = `${sampleContext}

## 任务：深度分析

用户希望基于以上样本进行深度分析。

**用户的具体问题**：${userPrompt || "请给出详细的分析和可执行的建议"}

**要求：**
1. 直接回答用户问题，不要绕弯子
2. 结合样本数据给出具体分析，不要笼统概括
3. 每个建议都要有具体的执行步骤
4. 如果样本数据不足以支撑某个结论，要明确指出
5. 用 Markdown 格式输出，包含标题、列表、重点加粗

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      break;

    case "direction_scripts":
      // 选题策略 V2 专用：把最优方向变成可拍脚本
      if (hasTopicStrategyData) {
        const topDir = topicStrategyV2!.directions[0];
        userMessage = `${topicStrategyContext}

## 任务：为「${topDir.directionName}」生成可直接拍摄的完整脚本

基于以上选题策略分析结果，为验证分最高的方向「${topDir.directionName}」的 ${topDir.executableTopics.length} 个可执行选题各生成一版完整脚本。

**核心要求：**
1. 每个脚本必须基于对应的可执行选题，不要编造新选题
2. 参考同行对标账号的内容风格和表达方式
3. 融入跨行业迁移灵感中的可迁移元素
4. 适配「${topicStrategyV2!.accountStage}」阶段的账号能力

**每个脚本包含：**

### 脚本框架
- **标题**（3个备选，参考选题中的标题风格）
- **前 3 秒钩子**（基于选题的钩子类型：${topDir.executableTopics[0]?.hookType || "悬念型"}）
- **内容结构**（分段说明每段目的和时长）
- **关键台词**（每段核心句子，可直接口播）
- **结尾 CTA**（引导关注/收藏/评论）
- **拍摄备注**（场景/道具/设备/注意事项）
- **预估时长**：${topDir.executableTopics[0]?.estimatedDuration || "60s"}

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      } else {
        userMessage = `${sampleContext}\n\n## 任务：生成可拍脚本\n请基于以上分析，生成 3 个完整的可拍脚本，每个包含标题、钩子、内容结构、台词和 CTA。\n${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      }
      break;

    case "direction_calendar":
      // 选题策略 V2 专用：生成 7 天内容排期表
      if (hasTopicStrategyData) {
        const allTopics = topicStrategyV2!.directions.flatMap(d =>
          d.executableTopics.map(t => ({ ...t, direction: d.directionName, score: d.validationScore }))
        );
        userMessage = `${topicStrategyContext}

## 任务：生成 7 天内容排期表

基于以上选题策略分析结果，为「${topicStrategyV2!.track}」赛道的「${topicStrategyV2!.accountStage}」阶段账号生成一份 7 天内容排期表。

**核心要求：**
1. 优先安排验证分最高的方向的选题
2. 每天 1 条内容，保持稳定发布节奏
3. 前 3 天安排验证分最高的选题（主攻），后 4 天可安排测试性选题
4. 每天的发布时间基于平台流量规律（${topicStrategyV2!.platforms.join("、")}）
5. 包含备用选题以应对突发情况

**可用选题池（共 ${allTopics.length} 个）：**
${allTopics.map((t, i) => `${i + 1}. 「${t.title}」— 方向：${t.direction}（验证分${t.score}），角度：${t.angle}，钩子：${t.hookType}，时长：${t.estimatedDuration}`).join("\n")}

**请输出：**

### 7 天排期表

| 日期 | 选题标题 | 所属方向 | 内容角度 | 钩子类型 | 发布时间 | 类型（主攻/测试） |

### 排期逻辑说明
- 为什么这样安排顺序
- 哪些是主攻选题，哪些是测试选题
- 如何根据前几天数据调整后续

### 备用选题（3个）
如果主选题遇到问题，可以替换的备选方向

### 每日执行清单
每天拍摄前需要准备什么（场景/道具/设备）

${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      } else {
        userMessage = `${sampleContext}\n\n## 任务：生成 7 天内容排期表\n请基于以上分析，生成一份 7 天内容排期表，每天包含选题、脚本要点、发布时间和预期效果。\n${userPrompt ? `**用户补充要求**：${userPrompt}` : ""}`;
      }
      break;

    default:
      // 通用 fallback：使用 userPrompt 或构建通用分析请求
      // 如果有选题策略 V2 上下文，优先使用
      if (hasTopicStrategyData && userPrompt) {
        userMessage = `${topicStrategyContext}\n\n## 任务\n${userPrompt}`;
      } else {
        userMessage = userPrompt
          ? `${sampleContext}\n\n## 任务\n${userPrompt}`
          : `${sampleContext}\n\n## 任务\n请基于以上样本分析，给出专业的内容创作建议和可落地的行动方案。`;
      }
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}

/* ------------------------------------------------------------------ */
/*  HTTP 处理函数                                                        */
/* ------------------------------------------------------------------ */

/**
 * 处理 POST /api/breakdown/action 请求
 * 接收 BreakdownActionRequest，返回 SSE 流式 LLM 输出
 *
 * 特殊处理：
 * - 当 actionId === "extract_copy" 且 context.videoUrl 存在时，
 *   先调用视频解析服务获取 ASR 文案，再注入 Prompt
 */
export async function handleBreakdownAction(
  _req: IncomingMessage,
  res: ServerResponse,
  body: BreakdownActionRequest,
): Promise<void> {
  const { modelId = "doubao" } = body;
  let enrichedBody = body;

  // 如果是文案提取且用户提供了视频链接，先做 ASR 转录
  if (body.actionId === "extract_copy" && body.context?.videoUrl) {
    const videoUrl = body.context.videoUrl;
    log.info(`extract_copy 检测到视频链接，开始 ASR 转录: ${videoUrl.slice(0, 60)}`);

    // 先发送一个 SSE 进度事件，告知用户正在处理
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...getCorsHeadersObj(_req),
    });
    res.write(`event: progress\ndata: ${JSON.stringify({ step: "parse", message: "正在解析视频链接..." })}\n\n`);

    try {
      // 动态 import 避免循环依赖
      const { transcribeVideo } = await import("./video-parser.js");
      const transcribeResult = await transcribeVideo(videoUrl);

      if (transcribeResult.ok && transcribeResult.transcript) {
        log.info(`ASR 成功，文案长度: ${transcribeResult.transcript.length}`);
        const asrDoneMsg = JSON.stringify({ step: "asr_done", message: "语音识别完成，共 " + transcribeResult.transcript.length + " 字" });
        res.write("event: progress\ndata: " + asrDoneMsg + "\n\n");

        // 将 ASR 文案和视频标题注入 context
        enrichedBody = {
          ...body,
          context: {
            ...body.context,
            videoTranscript: transcribeResult.transcript,
            videoTitle: transcribeResult.videoInfo?.title || body.context.sampleTitle,
            // 如果没有提供 sampleTitle，用视频标题补充
            sampleTitle: body.context.sampleTitle || transcribeResult.videoInfo?.title || "视频样本",
          },
        };
      } else {
        log.warn(`ASR 失败: ${transcribeResult.error}，降级为无文案模式`);
        const asrFailMsg = JSON.stringify({ step: "asr_failed", message: "语音识别失败(" + transcribeResult.error + ")，将基于视频信息进行分析" });
        res.write("event: progress\ndata: " + asrFailMsg + "\n\n");
      }
    } catch (err) {
      log.error({ err: err }, `ASR 异常`);
      res.write(`event: progress\ndata: ${JSON.stringify({ step: "asr_error", message: "视频处理异常，将基于已有信息进行分析" })}\n\n`);
    }

    // 构建 Prompt 并流式输出(响应头已发送，直接写 body)
    const messages = buildPrompt(enrichedBody);
    await streamLLMToSSE({ modelId, messages, maxTokens: 4096, timeoutMs: 120_000 }, res, true /* headersAlreadySent */);
    return;
  }

  // 普通模式：直接构建 Prompt 并流式输出
  const messages = buildPrompt(enrichedBody);
  await streamLLMToSSE({ modelId, messages, maxTokens: 4096, timeoutMs: 120_000 }, res);
}
