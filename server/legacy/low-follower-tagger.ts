/**
 * server/legacy/low-follower-tagger.ts
 * ═══════════════════════════════════════════════════════════════
 * 低粉爆款自动打标签模块
 *
 * 功能：
 * 1. 基于 LLM 自动为低粉爆款样本打标签
 *    - content_form: 内容形式（竖屏视频/横屏视频/图文/口播/剪辑/干货/测评）
 *    - track_tags: 赛道标签（如：AI效率工具、美妆护肤、健身减脂）
 *    - burst_reasons: 爆款原因标签（如：情绪共鸣、实用干货、反差钩子）
 *    - newbie_friendly: 新手友好度（0-100）
 *    - suggestion: 一句话复制建议
 * 2. 支持批量标签（减少 LLM 调用次数）
 * 3. 规则降级：LLM 失败时使用关键词规则打标签
 * ═══════════════════════════════════════════════════════════════
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("LowFollowerTagger");
import { invokeLLM } from "../_core/llm";
import { execute, query } from "./database.js";
import type { RowDataPacket } from "./database.js";

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

export interface TaggingInput {
  id: string;
  title: string;
  platform: string;
  authorFollowers: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  viralScore: number;
  seedTopic: string | null;
  hashtags: string | null;
  duration: number | null;
}

export interface TaggingResult {
  contentForm: string;
  trackTags: string[];
  burstReasons: string[];
  newbieFriendly: number;
  suggestion: string;
}

// ─────────────────────────────────────────────
// LLM 打标签
// ─────────────────────────────────────────────

const TAGGER_SYSTEM_PROMPT = `你是一位短视频/图文内容分析专家。你的任务是为低粉爆款样本打标签。

对于每条内容，你需要输出以下标签：

1. content_form（内容形式，只能选一个）：
   - 竖屏视频：手机竖屏拍摄的短视频
   - 横屏视频：横屏拍摄或剪辑的视频
   - 图文：图片+文字的内容（小红书常见）
   - 口播：真人出镜讲解
   - 剪辑：二次剪辑、混剪类
   - 干货：教程、知识分享类
   - 测评：产品测评、对比类

2. track_tags（赛道标签，1-3个）：
   - 描述内容所属的细分赛道，如：AI效率工具、美妆护肤、健身减脂、职场成长、家居好物、美食教程、育儿知识、数码科技、穿搭分享、旅行攻略等

3. burst_reasons（爆款原因，1-3个）：
   - 情绪共鸣：触发强烈情感反应
   - 实用干货：提供高价值实用信息
   - 反差钩子：开头制造反差或悬念
   - 热点借势：蹭热点话题或事件
   - 视觉冲击：画面或效果吸引眼球
   - 争议话题：引发讨论和争论
   - 真实故事：真实经历引发共鸣
   - 稀缺信息：提供罕见或独家信息
   - 互动引导：引导评论和互动
   - 低门槛模仿：内容容易被模仿复制

4. newbie_friendly（新手友好度，0-100）：
   - 评估一个0粉新手复制这条内容的难度
   - 100 = 极易复制（不需要专业设备或技能）
   - 0 = 极难复制（需要专业设备、团队或特殊资源）

5. suggestion（一句话复制建议，20-40字）：
   - 给出最关键的一条可执行建议

严格按 JSON 输出，不要有任何多余文字。`;

/**
 * 批量为样本打标签（LLM）
 * 每次最多处理 5 条，减少单次 token 消耗
 */
export async function tagSamplesWithLLM(
  samples: TaggingInput[],
): Promise<Map<string, TaggingResult>> {
  const results = new Map<string, TaggingResult>();

  // 分批处理，每批最多 5 条
  const BATCH_SIZE = 5;
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await tagBatchWithLLM(batch);
      for (const [id, result] of batchResults) {
        results.set(id, result);
      }
    } catch (err) {
      log.warn({ err: err }, `LLM 批量打标签失败 (batch ${i / BATCH_SIZE + 1})`);
      // 降级到规则打标签
      for (const sample of batch) {
        results.set(sample.id, tagSampleByRules(sample));
      }
    }
  }

  return results;
}

async function tagBatchWithLLM(
  batch: TaggingInput[],
): Promise<Map<string, TaggingResult>> {
  const sampleDescs = batch.map((s, i) => {
    const hashtagStr = s.hashtags ? ` | 标签: ${s.hashtags}` : "";
    const durationStr = s.duration ? ` | 时长: ${s.duration}秒` : "";
    const topicStr = s.seedTopic ? ` | 话题: ${s.seedTopic}` : "";
    return `${i + 1}. [${s.id}] 标题: ${s.title} | 平台: ${s.platform} | 粉丝: ${s.authorFollowers} | 点赞: ${s.likeCount} | 评论: ${s.commentCount} | 分享: ${s.shareCount} | 收藏: ${s.saveCount} | 评分: ${s.viralScore}${durationStr}${hashtagStr}${topicStr}`;
  }).join("\n");

  const userPrompt = `请为以下 ${batch.length} 条低粉爆款样本打标签：

${sampleDescs}

请输出 JSON 数组，每项格式：
{
  "id": "样本ID",
  "content_form": "内容形式",
  "track_tags": ["赛道标签1", "赛道标签2"],
  "burst_reasons": ["爆款原因1", "爆款原因2"],
  "newbie_friendly": 0-100,
  "suggestion": "一句话复制建议"
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: TAGGER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tagging_results",
        strict: true,
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  content_form: { type: "string" },
                  track_tags: { type: "array", items: { type: "string" } },
                  burst_reasons: { type: "array", items: { type: "string" } },
                  newbie_friendly: { type: "number" },
                  suggestion: { type: "string" },
                },
                required: ["id", "content_form", "track_tags", "burst_reasons", "newbie_friendly", "suggestion"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const parsed = JSON.parse(text) as {
    items: Array<{
      id: string;
      content_form: string;
      track_tags: string[];
      burst_reasons: string[];
      newbie_friendly: number;
      suggestion: string;
    }>;
  };

  const results = new Map<string, TaggingResult>();
  for (const item of parsed.items) {
    results.set(item.id, {
      contentForm: validateContentForm(item.content_form),
      trackTags: (item.track_tags || []).slice(0, 3),
      burstReasons: (item.burst_reasons || []).slice(0, 3),
      newbieFriendly: Math.max(0, Math.min(100, Math.round(item.newbie_friendly))),
      suggestion: (item.suggestion || "").slice(0, 100),
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// 规则降级打标签
// ─────────────────────────────────────────────

const CONTENT_FORM_KEYWORDS: Record<string, string[]> = {
  "口播": ["口播", "真人", "出镜", "讲解", "分享", "聊聊", "说说"],
  "测评": ["测评", "评测", "对比", "横评", "实测", "体验"],
  "干货": ["教程", "干货", "攻略", "方法", "技巧", "学会", "教你", "分钟学"],
  "图文": ["图文", "笔记", "分享"],
  "剪辑": ["剪辑", "混剪", "合集", "盘点"],
};

const TRACK_KEYWORDS: Record<string, string[]> = {
  "AI效率工具": ["AI", "人工智能", "ChatGPT", "效率", "工具", "自动化", "提示词"],
  "美妆护肤": ["美妆", "护肤", "化妆", "口红", "面膜", "防晒", "精华"],
  "健身减脂": ["健身", "减脂", "减肥", "瘦身", "运动", "训练", "增肌"],
  "职场成长": ["职场", "工作", "面试", "简历", "升职", "副业", "赚钱"],
  "家居好物": ["家居", "好物", "收纳", "装修", "家电", "清洁"],
  "美食教程": ["美食", "做饭", "食谱", "烹饪", "菜谱", "厨房"],
  "育儿知识": ["育儿", "宝宝", "孩子", "教育", "亲子", "母婴"],
  "数码科技": ["数码", "手机", "电脑", "科技", "软件", "APP"],
  "穿搭分享": ["穿搭", "搭配", "时尚", "衣服", "风格", "OOTD"],
  "旅行攻略": ["旅行", "旅游", "攻略", "景点", "出行", "酒店"],
};

const BURST_REASON_RULES: Array<{
  reason: string;
  check: (s: TaggingInput) => boolean;
}> = [
  { reason: "实用干货", check: (s) => /教程|干货|攻略|方法|技巧|教你/.test(s.title) },
  { reason: "情绪共鸣", check: (s) => /感动|泪目|扎心|共鸣|真实|太真实/.test(s.title) },
  { reason: "反差钩子", check: (s) => /没想到|居然|竟然|万万|震惊|颠覆/.test(s.title) },
  { reason: "热点借势", check: (s) => /热门|火了|爆了|全网|刷屏/.test(s.title) },
  { reason: "争议话题", check: (s) => /争议|吵翻|到底|真相|揭秘/.test(s.title) },
  { reason: "互动引导", check: (s) => s.commentCount > s.likeCount * 0.1 },
  { reason: "低门槛模仿", check: (s) => s.authorFollowers < 1000 && s.viralScore >= 60 },
];

export function tagSampleByRules(sample: TaggingInput): TaggingResult {
  const title = sample.title.toLowerCase();
  const allText = `${sample.title} ${sample.hashtags || ""} ${sample.seedTopic || ""}`.toLowerCase();

  // 内容形式
  let contentForm = "竖屏视频"; // 默认
  if (sample.platform === "xiaohongshu") {
    contentForm = "图文";
  }
  for (const [form, keywords] of Object.entries(CONTENT_FORM_KEYWORDS)) {
    if (keywords.some((kw) => title.includes(kw.toLowerCase()))) {
      contentForm = form;
      break;
    }
  }
  if (sample.duration && sample.duration > 0) {
    if (sample.duration > 300) contentForm = "横屏视频";
  }

  // 赛道标签
  const trackTags: string[] = [];
  for (const [track, keywords] of Object.entries(TRACK_KEYWORDS)) {
    if (keywords.some((kw) => allText.includes(kw.toLowerCase()))) {
      trackTags.push(track);
    }
  }
  if (trackTags.length === 0 && sample.seedTopic) {
    trackTags.push(sample.seedTopic);
  }

  // 爆款原因
  const burstReasons: string[] = [];
  for (const rule of BURST_REASON_RULES) {
    if (rule.check(sample)) {
      burstReasons.push(rule.reason);
    }
  }
  if (burstReasons.length === 0) {
    burstReasons.push("内容质量");
  }

  // 新手友好度
  let newbieFriendly = 50;
  if (sample.authorFollowers < 500) newbieFriendly += 20;
  else if (sample.authorFollowers < 2000) newbieFriendly += 10;
  if (contentForm === "口播" || contentForm === "图文") newbieFriendly += 10;
  if (contentForm === "剪辑" || contentForm === "横屏视频") newbieFriendly -= 10;
  if (sample.viralScore >= 70) newbieFriendly += 5;
  newbieFriendly = Math.max(0, Math.min(100, newbieFriendly));

  // 建议
  const suggestion = burstReasons.includes("实用干货")
    ? "复制干货结构，替换为你的领域知识，重点打磨前3秒钩子"
    : burstReasons.includes("情绪共鸣")
      ? "找到你领域的情绪触发点，用真实故事引发共鸣"
      : burstReasons.includes("反差钩子")
        ? "设计反差开头吸引注意力，内容要有信息增量"
        : "分析这条内容的节奏结构，用相同节奏做你的选题";

  return {
    contentForm,
    trackTags: trackTags.slice(0, 3),
    burstReasons: burstReasons.slice(0, 3),
    newbieFriendly,
    suggestion,
  };
}

// ─────────────────────────────────────────────
// 验证内容形式
// ─────────────────────────────────────────────

const VALID_CONTENT_FORMS = new Set([
  "竖屏视频", "横屏视频", "图文", "口播", "剪辑", "干货", "测评",
]);

function validateContentForm(form: string): string {
  return VALID_CONTENT_FORMS.has(form) ? form : "竖屏视频";
}

// ─────────────────────────────────────────────
// 数据库操作：更新标签
// ─────────────────────────────────────────────

/**
 * 将标签结果写入数据库
 */
export async function persistTags(
  sampleId: string,
  tags: TaggingResult,
): Promise<void> {
  await execute(
    `UPDATE low_follower_samples SET
      content_form = ?,
      track_tags = ?,
      burst_reasons = ?,
      newbie_friendly = ?,
      suggestion = ?
    WHERE id = ?`,
    [
      tags.contentForm,
      JSON.stringify(tags.trackTags),
      JSON.stringify(tags.burstReasons),
      tags.newbieFriendly,
      tags.suggestion,
      sampleId,
    ],
  );
}

/**
 * 获取需要打标签的样本（content_form 为空的）
 */
export async function fetchUntaggedSamples(limit = 50): Promise<TaggingInput[]> {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, video_title, platform_id, author_followers,
            video_likes, video_comments, video_shares, video_collects,
            viral_score, seed_topic, hashtags, video_duration
     FROM low_follower_samples
     WHERE content_form IS NULL OR content_form = ''
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  );

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: String(r.video_title ?? ""),
    platform: String(r.platform_id ?? "douyin"),
    authorFollowers: Number(r.author_followers ?? 0),
    likeCount: Number(r.video_likes ?? 0),
    commentCount: Number(r.video_comments ?? 0),
    shareCount: Number(r.video_shares ?? 0),
    saveCount: Number(r.video_collects ?? 0),
    viralScore: Number(r.viral_score ?? 0),
    seedTopic: r.seed_topic ? String(r.seed_topic) : null,
    hashtags: r.hashtags ? String(r.hashtags) : null,
    duration: r.video_duration ? Number(r.video_duration) : null,
  }));
}

/**
 * 主入口：为所有未打标签的样本自动打标签
 */
export async function runAutoTagging(): Promise<{
  tagged: number;
  failed: number;
}> {
  log.info("开始自动打标签...");
  let tagged = 0;
  let failed = 0;

  try {
    const untagged = await fetchUntaggedSamples(50);
    if (untagged.length === 0) {
      log.info("无需打标签的样本");
      return { tagged: 0, failed: 0 };
    }

    log.info(`待打标签样本: ${untagged.length} 条`);

    // 尝试 LLM 打标签
    const tagResults = await tagSamplesWithLLM(untagged);

    // 写入数据库
    for (const sample of untagged) {
      const tags = tagResults.get(sample.id);
      if (tags) {
        try {
          await persistTags(sample.id, tags);
          tagged++;
        } catch (err) {
          log.warn({ err: err }, `写入标签失败 ${sample.id}`);
          failed++;
        }
      } else {
        // LLM 没有返回该样本的标签，用规则降级
        try {
          const ruleTags = tagSampleByRules(sample);
          await persistTags(sample.id, ruleTags);
          tagged++;
        } catch (err) {
          log.warn({ err: err }, `规则降级写入失败 ${sample.id}`);
          failed++;
        }
      }
    }

    log.info(`打标签完成: ${tagged} 成功, ${failed} 失败`);
  } catch (err) {
    log.error({ err: err }, "自动打标签异常");
  }

  return { tagged, failed };
}
