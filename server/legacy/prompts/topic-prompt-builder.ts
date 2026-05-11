/**
 * Topic Prompt Builder — `live-predictions.topic` 选题生成 prompt 的可独立调用版本。
 *
 * 设计目的：让 evals/topic-suggest/run.ts 能用**完全相同**的 prompt 离线评测，
 * 不需要跑整个 runLivePrediction 流程。
 *
 * **字符级一致**：本文件的 prompt 文本与 live-predictions.ts 的内联版本逐字符相同
 * （包括全角中文标点）。改一处必须改两处。
 *
 * 切勿在这里加 IO（数据库 / 外部 API）调用——保持纯函数,evals 才能独立跑。
 * system prompt 的 DB 模板加载放到 resolveTopicSystemPrompt(),调用方按需用。
 */

import { resolveSystemPrompt } from "../prompt-engine.js";

/* ─────────────────────────────────────────────
   prompt 输入契约
───────────────────────────────────────────── */

export interface TopicPromptInput {
  /** 用户输入的赛道关键词 */
  seedTopic: string;
  /** 真实采集的热门样本标题摘要（多行） */
  topSampleTitles: string;
  /** 低粉爆款样本摘要（多行,可空） */
  lowFollowerInfo: string;
  /** 评论区高频词 */
  commentKeywords: string;
  /** 评论区需求信号 */
  demandSignals: string;
  /** 当主流程发现样本数为 0 时的警告文(原 noSampleWarning) */
  noSampleWarning?: string;
  /** 当前日期(默认 today),便于 evals 钉到固定日期 */
  asOfDate?: string;
}

/* ─────────────────────────────────────────────
   纯函数:构造 user prompt 文本
───────────────────────────────────────────── */

/**
 * 构造选题生成的 user prompt(纯函数,无 IO)。
 * 与 live-predictions.ts 内联版本字符级一致;改一处必须改两处。
 */
export function buildTopicUserPrompt(input: TopicPromptInput): string {
  const date = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const warning = input.noSampleWarning ?? "";

  return `你是一位短视频爆款内容策划师，擅长从真实数据中提炼可执行的选题。

当前分析赛道：「${input.seedTopic}」
当前日期：${date}

核心原则（必须遵守）：
1. 只能基于下方真实采集的热门样本生成选题，禁止使用你训练数据中的任何案例、产品版本或对比信息
2. 如果样本中没有出现某个产品/品牌/人物，就不要在选题中提及，不要自行补充训练数据中的"常见对比"
3. 比较类选题（A对比B）只能基于样本中真实出现的内容生成，绝不能凭空添加对比对象
4. 数据中没有的内容宁可省略，不要编造
${warning}

【真实采集的热门样本】
${input.topSampleTitles || "暂无样本（当前未搜索到相关数据）"}

【低粉爆款样本】
${input.lowFollowerInfo || "暂无低粉爆款"}

【评论区高频词】
${input.commentKeywords}

【评论区需求信号】
${input.demandSignals}

【任务】
基于以上真实数据，生成 3 个具体可执行的短视频选题。每个选题必须：
1. 标题可以直接用作短视频标题，有爆款潜力（15-25字）
2. 切入角度基于真实样本的成功特征推演，不是凭空编造
3. 如有真实样本，必须引用上方某个真实样本作为对标参考（无样本时可省略 referenceTitle）
4. 为每个选题独立评估爆款机率分数（70-95之间的整数）
5. 每个选题必须独立判断评论信号、供给缺口、低粉可复制性，不能复用同一套理由

输出严格的 JSON 格式（直接输出 JSON，不要输出其他内容）：
{"topics":[{"title":"爆款标题（15-25字，直接可用）","angle":"切入角度说明（25字以内）","referenceTitle":"引用的真实样本标题，无样本时填null","score":88,"commentScore":82,"commentReason":"评论/需求为什么支撑这个切口（20字以内）","supplyGapScore":78,"supplyGapReason":"供给缺口在哪里（20字以内）","lowFollowerScore":74,"lowFollowerReason":"低粉账号为什么能做或为什么谨慎（20字以内）","tags":["#标签1","#标签2","#标签3"],"conclusion":"一句话结论（如：今天就拍，优先级最高）","conclusionSub":"副文案，说明这个选题能带来什么价值","howToShoot":"具体怎么拍（30字以内）","whyNow":"为什么现在拍（30字以内）"}]}

注意：
- 标题要有钩子感
- 切入角度要具体
- commentScore 要看评论量、热评、高频词和需求信号，不要只看点赞
- supplyGapScore 要看同类内容是否拥挤，以及这个切口是否还有差异化空间
- lowFollowerScore 要看低粉样本和制作门槛；没有低粉样本时不要给高分
- conclusion 必须是强确定性结论
- howToShoot 要具体到拍摄方法
- tags 必须是 2-4 个核心标签，每个以 # 开头
- 禁止在标题或内容中出现任何未在上方样本中出现的产品名、版本号或品牌对比`;
}

/* ─────────────────────────────────────────────
   System prompt 的 fallback(也是默认 evals 用)
───────────────────────────────────────────── */

export const TOPIC_SYSTEM_PROMPT_FALLBACK =
  "你是短视频爆款内容策划师，严格按 JSON 格式输出，不要输出任何其他内容。";

export const TOPIC_TEMPLATE_ID = "topic-strategy-v1";

/**
 * 解析 system prompt:优先从 DB 模板加载,失败 fallback。
 * 与 live-predictions.ts 行为一致,保证主流程 / evals 用同一 system prompt。
 */
export async function resolveTopicSystemPrompt(): Promise<string> {
  return resolveSystemPrompt(
    TOPIC_TEMPLATE_ID,
    "doubao",
    {},
    TOPIC_SYSTEM_PROMPT_FALLBACK,
  );
}

/* ─────────────────────────────────────────────
   一站式:返回完整 messages 数组(给 callLLM 用)
───────────────────────────────────────────── */

export interface BuiltTopicMessages {
  system: string;
  user: string;
}

/**
 * 一次拿到 system + user prompt(给 evals 用最方便)。
 * 主流程 live-predictions.ts 也建议改用这个,把内联 prompt 干掉。
 */
export async function buildTopicMessages(
  input: TopicPromptInput,
): Promise<BuiltTopicMessages> {
  const [system, user] = await Promise.all([
    resolveTopicSystemPrompt(),
    Promise.resolve(buildTopicUserPrompt(input)),
  ]);
  return { system, user };
}
