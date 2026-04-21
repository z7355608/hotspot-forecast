/**
 * 爆款拆解服务
 * 使用阿波罗平台 Gemini 3.1 Pro（支持视频理解）
 * 将视频拆解为结构化的分镜脚本 + 爆点公式 + 记忆锚点 + 复刻建议
 */
import { invokeThirdPartyLLM } from "../_core/llm";

// ============ 类型定义 ============

export interface ViralFormula {
  tagline: string;
  hook_strategy: string;
  conversion_logic: string;
  pacing_analysis: string;
}

export interface ReplicationAdvice {
  flaws: string;
  improvement_plan: string;
}

export interface MetaStrategy {
  summary: string;
  visual_hammer: string;
  viral_formula: ViralFormula;
  replication_advice: ReplicationAdvice;
}

export interface AudioLayer {
  script: string;
  bgm_mood: string;
  sfx_design: string;
}

export interface VisualLayer {
  subject_action: string;
  environment: string;
  camera_language: string;
  lighting_style: string;
  visual_stimuli: string;
}

export interface NeuroMarketingLayer {
  audience_emotion: string;
  retention_tactic: string;
  conversion_priming: string;
}

export interface ShotItem {
  id: number;
  timestamp: {
    start_seconds: number;
    end_seconds: number;
  };
  scene_type: string;
  audio_layer: AudioLayer;
  visual_layer: VisualLayer;
  neuro_marketing_layer: NeuroMarketingLayer;
  replication_note: string;
}

export interface BreakdownResult {
  meta_strategy: MetaStrategy;
  shot_list: ShotItem[];
}

// ============ 系统提示词 ============

const BREAKDOWN_SYSTEM_PROMPT = `# Role
你是一名头部视频创作者及MCN服务的**短视频爆款拆解大师**
你的核心任务是将输入视频进行"按爆款结构拆分解构"，转化为一份既包含视频爆火原因、底层爆款逻辑、爆点结构与爆款因子又包含**可执行分镜脚本**的标准化 JSON 指令文档。
输出要求：可复刻的结构/节奏/爆点/方法论，拒绝泛泛而谈

# Core Capabilities & Objectives
#### 信息结构分析
1.**开场方式（黄金3s钩子）**：明确开场的具体形式（提问、冲突、悬念、热梗等），并以数据说明其有效性，例如"开场提问能引发用户互动率增加"。
2.**节奏把控**：细致分析高潮点分布密度（借助带时间戳文案），准确记录信息量峰值出现的时间以及对应的视觉画面，并阐述判断依据。
3.**信息密度**：通过对带时间戳的文案和视频进行深入理解分析，确定整个视频传递给用户的信息密度情况。
4.**关键时间点**：严格按照文案时间戳和视频画面，精准分析关键时间点的核心动作。

#### 视觉/听觉记忆点
1. 基于视频画面理解，全面分析视频在画面设计中的记忆点。
2. 精准提取和分析视频中背景音乐、音效在整体视频中给用户营造的记忆点。
3. 根据视频画面字幕以及拆分出的带时间戳文案，仔细分析视频的台词金句。
4. 综合整合以上视觉/听觉记忆点分析结果，输出整个视频最强的记忆锚点。
5. 整理并结构化输出视频的台词金句

### 爆款成功关键因素详细拆解
#### 核心爆点+公式
爆款遵循公式\`[ 人群痛点 ] + [ 解决方案 ] + [ 传播因子 ]\`。请准确总结视频核心爆点，用简洁的一句话或一段话概括，并分点详细描述。
1. **痛点切入**：详细说明视频切入用户痛点的具体方式和角度。
2. **科学卖点**：清晰阐述视频所具备的科学合理的卖点及其独特之处。
3. **痛点解决**：具体描述视频解决用户痛点的具体措施和方法。
4. **高效信息传递**：深入分析视频高效地将信息传递给用户的策略和手段。
5. **直观效果对比**：明确说明视频中有无直观的效果对比以及呈现方式。
6. **引流**：详细讲述视频的引流手段和策略。

#### 视觉听觉与补充
1. **听觉工程拆解**：不仅区分 BGM，更要精准捕捉**音效 (SFX)** 的卡点逻辑。
2. **神经营销洞察**：
   * **视觉锤 (Visual Hammer)**：识别视频中植入用户心智的超级符号。
   * **防流失设计 (Retention)**：分析每一秒是如何对抗用户"划走"冲动的。
   * **转化铺垫 (Conversion)**：解构视频如何一步步建立信任并引导最终行动。
3. **复刻与优化**：基于原视频的不足，给出针对性的升级复刻方案。

# Output Format
**严格输出单一的 JSON 对象**，不包含任何 Markdown 标记（如 \`\`\`json）或额外的解释性文字。

# 限制
严格只输出【单一 JSON 对象】；不输出任何 Markdown 标记；不输出额外解释文字。
只允许输出"视频可见/可听到"的内容：画面、字幕、口播/BGM/SFX、镜头切换、人物动作、场景道具。
若不确定：必须写 uncertain_block: { "uncertain": true, "reason": "证据不足原因" }。
禁止编造百分比/具体后台指标。
分镜拆分规则：优先按"剪辑切点（cut）"拆分；若无法可靠识别 cut，则按"信息点/语义转折（beat）"拆分，每段建议 1.0–3.5 秒；总镜头段落数 shot_list 不超过 25。
复刻建议必须可执行：给到"做什么 + 怎么做 + 卡在哪一秒/用什么字/什么音效/什么镜头"。`;

// ============ 核心函数 ============

/**
 * 执行爆款拆解
 * @param videoUrl - 视频的可访问 URL（用于视频理解模型）
 * @param transcript - 可选的视频文案/字幕文本
 * @returns 结构化的拆解结果
 */
export async function analyzeViralBreakdown(
  videoUrl: string,
  transcript?: string
): Promise<BreakdownResult> {
  // 构建用户消息内容（多模态：视频 + 文本）
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "file_url"; file_url: { url: string; mime_type: string } }
  > = [];

  // 添加视频文件
  userContent.push({
    type: "file_url",
    file_url: {
      url: videoUrl,
      mime_type: "video/mp4",
    },
  });

  // 构建文本提示
  let textPrompt = "请对以上视频进行完整的爆款拆解分析。";
  if (transcript) {
    textPrompt += `\n\n以下是视频的文案/字幕内容，请结合视频画面一起分析：\n${transcript}`;
  }
  textPrompt += `\n\n请严格按照以下 JSON 结构输出拆解结果：
{
  "meta_strategy": {
    "summary": "30-50字简述视频核心叙事与变现逻辑",
    "visual_hammer": "识别视频中反复出现、用于占领用户心智的视觉符号",
    "viral_formula": {
      "tagline": "用一句话概括爆点公式",
      "hook_strategy": "黄金3秒的具体钩子类型及生效逻辑",
      "conversion_logic": "全片的转化漏斗逻辑",
      "pacing_analysis": "分析视频的信息密度与节奏变化"
    },
    "replication_advice": {
      "flaws": "原视频在画质、剪辑、音效或表现力上的不足",
      "improvement_plan": "复刻时针对上述不足的具体优化方案"
    }
  },
  "shot_list": [
    {
      "id": 1,
      "timestamp": { "start_seconds": 0.0, "end_seconds": 3.5 },
      "scene_type": "分镜功能标签",
      "audio_layer": {
        "script": "精确的口播/台词文案",
        "bgm_mood": "BGM的情绪风格",
        "sfx_design": "关键音效设计"
      },
      "visual_layer": {
        "subject_action": "主体及其动作的精准描述",
        "environment": "背景环境细节",
        "camera_language": "运镜方式",
        "lighting_style": "光影风格",
        "visual_stimuli": "具体的防流失视觉刺激点"
      },
      "neuro_marketing_layer": {
        "audience_emotion": "此刻观众的预期情绪",
        "retention_tactic": "具体的防流失手段",
        "conversion_priming": "该镜头对最终转化的贡献"
      },
      "replication_note": "复刻此镜头时的执行要点"
    }
  ]
}`;

  userContent.push({
    type: "text",
    text: textPrompt,
  });

  const result = await invokeThirdPartyLLM({
    messages: [
      { role: "system", content: BREAKDOWN_SYSTEM_PROMPT },
      { role: "user", content: userContent as any },
    ],
    maxTokens: 65536,
    response_format: { type: "json_object" },
  });

  // 解析 LLM 返回的 JSON
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("爆款拆解失败：模型未返回内容");
  }

  const rawText = typeof content === "string" ? content : JSON.stringify(content);

  // 清理可能的 markdown 包裹
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: BreakdownResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`爆款拆解失败：JSON 解析错误 - ${(e as Error).message}\n原始内容: ${cleaned.substring(0, 200)}`);
  }

  // 基本校验
  if (!parsed.meta_strategy || !parsed.shot_list) {
    throw new Error("爆款拆解失败：返回的 JSON 缺少必要字段 (meta_strategy / shot_list)");
  }

  return parsed;
}

/**
 * 获取视频的可播放 URL（通过去水印 API）
 * 用于将用户输入的分享链接转换为可被 LLM 访问的直接视频 URL
 */
export async function resolveVideoUrl(shareUrl: string): Promise<{
  videoUrl: string;
  title?: string;
  coverUrl?: string;
  author?: string;
}> {
  const WATERMARK_API = "http://watermark-8sgbruqh.zhibofeng.com:8082/video/parse";
  const API_KEY = "dw8uiZ3Z3TF0YqQA";

  const response = await fetch(
    `${WATERMARK_API}?key=${API_KEY}&url=${encodeURIComponent(shareUrl)}`,
    { signal: AbortSignal.timeout(30000) }
  );

  if (!response.ok) {
    throw new Error(`去水印 API 调用失败: ${response.status}`);
  }

  const data = await response.json() as any;

  if (data.code !== 200 || !data.data) {
    throw new Error(`去水印 API 返回错误: ${data.msg || "未知错误"}`);
  }

  const videoUrl =
    data.data.video_url ||
    data.data.video?.url ||
    data.data.url ||
    (data.data.video_list && data.data.video_list[0]?.url);

  if (!videoUrl) {
    throw new Error("无法从去水印 API 获取视频直链");
  }

  return {
    videoUrl,
    title: data.data.title || data.data.desc,
    coverUrl: data.data.cover_url || data.data.cover,
    author: data.data.author?.nickname || data.data.author_name,
  };
}
