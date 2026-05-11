/**
 * 低粉爆款商业化质量闸门。
 *
 * 低粉高互动只说明内容被算法推起来，不代表适合作为创作者商业化选题。
 * 这里拦截“明显搞笑 / 猎奇 / 吃瓜 / 强 IP / 抽象整活”等样本：
 * - 入库管线：LLM 预检查后再过一遍确定性规则，防止 LLM 漏放。
 * - 展示 router：历史样本即使还在表里，也默认不推荐给用户。
 */

export type LowFollowerCommercialSource = "seed_topic" | "billboard" | "search" | string;

export interface LowFollowerCommercialQualityInput {
  source?: LowFollowerCommercialSource | null;
  title?: string | null;
  hashtags?: string[] | string | null;
  trackTags?: string[] | string | null;
  burstReasons?: string[] | string | null;
  prefilterReason?: string | null;
  seedTopic?: string | null;
  newbieFriendly?: number | null;
}

export interface CommercialQualityResult {
  accepted: boolean;
  reasons: string[];
}

const BLOCKED_TRACK_TAGS = [
  "搞笑娱乐",
  "猎奇",
  "暗网",
  "重口",
  "吃瓜八卦",
  "明星八卦",
  "IP周边",
  "纯娱乐",
];

const BLOCKED_TEXT_PATTERNS: RegExp[] = [
  /猎奇|暗网|重口|吃瓜|八卦|明星绯闻/,
  /搞笑段子|沙雕|整活|抽象|离谱整活/,
  /精神状态|地球online|npc|直播回放/,
  /纯属娱乐|娱乐评论大赏/,
  /(\?{3,}|？{3,}|！？{2,}|[?？]{2,})/,
];

const BLOCKED_REASON_PATTERNS: RegExp[] = [
  /猎奇|暗网|重口|吃瓜|八卦/,
  /纯娱乐|搞笑|趣味日常|卖萌/,
];

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join(" ");
  if (typeof value === "string") return value;
  return String(value);
}

function parseJsonishArray(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    // fall through
  }
  return trimmed
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assessLowFollowerCommercialQuality(
  input: LowFollowerCommercialQualityInput,
): CommercialQualityResult {
  const reasons: string[] = [];
  const trackTags = parseJsonishArray(input.trackTags);
  const burstReasons = parseJsonishArray(input.burstReasons);
  const hashtags = parseJsonishArray(input.hashtags);
  const title = normalizeText(input.title);
  const seedTopic = normalizeText(input.seedTopic);
  const prefilterReason = normalizeText(input.prefilterReason);
  const source = normalizeText(input.source || "seed_topic");
  const newbieFriendly = typeof input.newbieFriendly === "number" ? input.newbieFriendly : null;
  const allText = [title, seedTopic, hashtags.join(" "), trackTags.join(" "), burstReasons.join(" ")]
    .join(" ")
    .toLowerCase();

  const blockedTag = trackTags.find((tag) =>
    BLOCKED_TRACK_TAGS.some((blocked) => tag.includes(blocked)),
  );
  if (blockedTag) reasons.push(`命中非商业化标签：${blockedTag}`);

  const blockedText = BLOCKED_TEXT_PATTERNS.find((pattern) => pattern.test(allText));
  if (blockedText) reasons.push(`标题/标签疑似搞笑猎奇或强娱乐：${blockedText.source}`);

  const blockedReason = BLOCKED_REASON_PATTERNS.find((pattern) => pattern.test(prefilterReason));
  if (blockedReason) reasons.push(`预检查理由暴露非商业化：${blockedReason.source}`);

  // 旧 seed_topic 管线如果没有完成标签和新手友好度校准，不应继续作为推荐样本。
  if (source === "seed_topic") {
    if (newbieFriendly == null || newbieFriendly < 60) {
      reasons.push("旧种子词样本缺少可复刻评分或评分偏低");
    }
    if (trackTags.length === 0) {
      reasons.push("旧种子词样本缺少赛道标签");
    }
  }

  return {
    accepted: reasons.length === 0,
    reasons,
  };
}

function sqlNotLikeAny(expr: string, patterns: string[]) {
  return patterns.map((pattern) => `${expr} NOT LIKE '%${pattern}%'`).join(" AND ");
}

export function buildCommercialQualityConditions(): string[] {
  const textExpr =
    "LOWER(CONCAT_WS(' ', COALESCE(video_title,''), COALESCE(hashtags,''), COALESCE(track_tags,''), COALESCE(burst_reasons,''), COALESCE(seed_topic,'')))";
  const reasonExpr = "LOWER(COALESCE(prefilter_reason,''))";
  const tagExpr = "COALESCE(track_tags,'')";

  return [
    sqlNotLikeAny(tagExpr, BLOCKED_TRACK_TAGS),
    sqlNotLikeAny(textExpr, [
      "猎奇",
      "暗网",
      "重口",
      "吃瓜",
      "八卦",
      "明星绯闻",
      "搞笑段子",
      "沙雕",
      "整活",
      "抽象",
      "精神状态",
      "地球online",
      "npc",
      "直播回放",
      "纯属娱乐",
      "娱乐评论大赏",
      "？？？",
      "???",
    ]),
    sqlNotLikeAny(reasonExpr, ["猎奇", "暗网", "重口", "吃瓜", "八卦", "纯娱乐", "搞笑", "趣味日常", "卖萌"]),
    "(source != 'seed_topic' OR (newbie_friendly >= 60 AND track_tags IS NOT NULL AND track_tags != '' AND track_tags != '[]'))",
  ];
}
