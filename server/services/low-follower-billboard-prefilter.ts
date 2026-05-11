/**
 * ADR-0007 Step 3 — 低粉爆款 billboard 入库前 LLM 预检查
 *
 * 目的:在 billboard 拉到的样本进入 cleaner 之前,用 LLM 判定该选题是否对
 * PRD 目标用户(中腰部 1k-50k 自媒体)有"今天就能开拍"的可复刻价值。
 *
 * 不替代 ADR-0006 §Step C 的完整打标(那一步在入库后 enrichment 跑),本服务只回答"要不要入库"。
 *
 * 模型:doubao(llm-gateway 默认 thinking=disabled,符合 ADR-0007 §Step 3 硬约束)。
 * 批大小:10(ADR PM 校准 B 项)。
 * 失败策略:整批丢弃(不规则降级——预检查规则化太复杂;通过率持续低应触发报警 G,而非默默放行)。
 */
import { createModuleLogger } from "../legacy/logger.js";
import { callLLM } from "../legacy/llm-gateway.js";
import { stripJsonFences } from "../legacy/json-extract.js";

const log = createModuleLogger("LFBillboardPrefilter");

export interface PrefilterInput {
  platformId: string;
  title: string;
  hashtags: string[];
  industryTop: string;
  industrySubGuess: string | null;
}

export interface PrefilterOutput {
  platformId: string;
  isTargetAudience: boolean;
  reason: string;
  industrySubRefined: string | null;
}

const BATCH_SIZE = 10;

const SYSTEM_PROMPT_BASE = `你是短视频选题/创作策略分析专家。
任务:为一批"低粉爆款"候选样本判定是否值得作为对标进入低粉爆款样本库。

目标用户(必须严格对齐):
- 抖音/小红书"中腰部"自媒体创作者,粉丝 1k-50k
- 痛点:不知道现在该拍什么
- 想要"今天就能开拍"的可复刻选题

判定规则(每条样本独立判 is_target_audience):
1. is_target_audience = true 必须满足:**该选题对目标用户有学习/复刻价值**——
   - 选题角度可被同领域博主复用
   - 拍摄/剪辑门槛不高
   - 内容本身有可学习的"为什么火"的方法论
2. is_target_audience = false 必须排除以下任一类型:
   - 纯娱乐/搞笑段子(无方法论)
   - 猎奇/暗网/重口/吃瓜
   - 抽象整活/朋友精神状态/纯趣味日常/离谱反应梗
   - 萌宠纯卖萌(只能复制不能学习)
   - 明星八卦/IP 周边(强 IP 依赖,不可复刻)
   - 纯靠特定个人魅力 / 特定地理/职业身份 才能成立的内容
   - 标题不知所云、看不出选题角度
3. 注意:"目标用户可能爱看"≠"目标用户可以拍"——前者多得多,只判后者
4. 商业化原则:即使容易模仿,如果只能获得泛娱乐互动、无法沉淀账号定位/信任/转化,也必须判 false
5. industry_sub_refined:基于标题+标签,把这条内容更精确地归到一个细分子类(如顶级类目=数码科技,子类可填"AI 工具评测""手机配件");无法判断填 null`;

const OUTPUT_FORMAT_BLOCK = `

**输出格式(严格)**:
- 必须是单个 JSON 对象,顶层 key 是 "items",值是数组
- 每个 item 字段:platform_id(string)、is_target_audience(bool)、reason(string ≤ 30字)、industry_sub_refined(string 或 null)
- **不要**用 markdown 代码围栏(\`\`\`),**不要**任何解释性文字,直接输出 JSON
- 数组元素数量必须等于输入条数,platform_id 一一对应`;

/** ADR-0008 §Step 4 — 搜索路径专用的额外 SEO 反堆词约束 */
export const SEARCH_EXTRA_INSTRUCTIONS = `

**额外强约束(搜索结果场景,SEO 噪音多)**:
- 排除"为搜索 SEO 堆砌关键词、内容空洞、像营销号作业"的样本
- 识别要点:标题/desc 里关键词堆叠 ≥ 5 个、文案明显套模板("教你 N 招"+ 数字平铺)、互动率(comment/like)异常低
- 排除"通用问候/口播练习/早安鸡汤"型(每天发一条 hashtag 蹭流量,无实质内容)
- 优先放行:有具体方法论(教如何...)、有可视化干货(对比图/流程图)、有原创角度(反常识/真实案例)`;

interface LLMOutputItem {
  platform_id: string;
  is_target_audience: boolean;
  reason: string;
  industry_sub_refined: string | null;
}

async function prefilterBatch(
  batch: PrefilterInput[],
  extraInstructions: string,
): Promise<PrefilterOutput[]> {
  const userPrompt = `请判定以下 ${batch.length} 条候选样本(顶级类目已给出):\n\n${batch
    .map((s, i) => {
      const tags = s.hashtags.length > 0 ? ` | tags: ${s.hashtags.slice(0, 5).join(", ")}` : "";
      const subGuess = s.industrySubGuess ? ` | sub_guess: ${s.industrySubGuess}` : "";
      return `${i + 1}. [${s.platformId}] industry_top: ${s.industryTop}${subGuess}\n   title: ${s.title}${tags}`;
    })
    .join("\n\n")}\n\n输出 JSON: { "items": [ {"platform_id": ..., "is_target_audience": bool, "reason": "...", "industry_sub_refined": "..." | null}, ... ] }`;

  const systemPrompt = SYSTEM_PROMPT_BASE + extraInstructions + OUTPUT_FORMAT_BLOCK;

  // Doubao endpoint 实测不支持 response_format(任何 type),靠 prompt + 解析容错
  const resp = await callLLM({
    modelId: "doubao",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 2000,
  });

  // 容错解析:剥 markdown 围栏 + 截首尾大括号
  const cleaned = stripJsonFences(resp.content || "");
  const parsed = JSON.parse(cleaned) as { items: LLMOutputItem[] };
  if (!Array.isArray(parsed.items)) {
    throw new Error(`prefilter LLM returned non-array items: ${resp.content.slice(0, 200)}`);
  }

  return parsed.items.map((it) => ({
    platformId: String(it.platform_id),
    isTargetAudience: Boolean(it.is_target_audience),
    reason: String(it.reason ?? "").slice(0, 200),
    industrySubRefined:
      it.industry_sub_refined && String(it.industry_sub_refined).trim().length > 0
        ? String(it.industry_sub_refined).slice(0, 64)
        : null,
  }));
}

/**
 * 对一批候选样本跑 LLM 预检查,返回所有判定结果。
 * 单批失败:整批跳过(不计入 results),由调用方根据 in/out 数量算"丢失率",必要时报警。
 *
 * @param inputs 候选样本
 * @param extraInstructions 额外的 system prompt 注入(如 SEARCH_EXTRA_INSTRUCTIONS),默认空字符串
 */
export async function prefilterBillboardSamples(
  inputs: PrefilterInput[],
  extraInstructions = "",
): Promise<{
  results: PrefilterOutput[];
  batchesAttempted: number;
  batchesFailed: number;
}> {
  const results: PrefilterOutput[] = [];
  let batchesAttempted = 0;
  let batchesFailed = 0;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    batchesAttempted++;
    try {
      const batchResults = await prefilterBatch(batch, extraInstructions);
      // 防御:LLM 可能漏返/重复返;按 platformId 严格匹配,缺的当 false
      const byId = new Map(batchResults.map((r) => [r.platformId, r]));
      for (const inp of batch) {
        const r = byId.get(inp.platformId);
        if (r) {
          results.push(r);
        } else {
          log.warn(
            { platformId: inp.platformId, batchIdx: i / BATCH_SIZE },
            `LLM 漏返样本 ${inp.platformId},按 false 入清单`,
          );
          results.push({
            platformId: inp.platformId,
            isTargetAudience: false,
            reason: "LLM 漏返,默认拒绝",
            industrySubRefined: null,
          });
        }
      }
    } catch (err) {
      batchesFailed++;
      log.warn(
        { err: err instanceof Error ? err.message : String(err), batchIdx: i / BATCH_SIZE, batchSize: batch.length },
        `prefilter batch 失败,该批 ${batch.length} 条全部丢弃`,
      );
    }
  }

  return { results, batchesAttempted, batchesFailed };
}
