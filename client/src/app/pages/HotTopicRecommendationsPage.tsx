import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronUp,
  Coins,
  Copy,
  Flame,
  Loader2,
  Lock,
  Music2,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { PaywallModal } from "../components/PaywallModal";
import { getProxiedImageUrl } from "../lib/media-proxy";
import { useAppStore } from "../store/app-store";
import { trpc } from "@/lib/trpc";

/**
 * 单次深度拆解消耗积分。需与后端 `server/routers/credits.ts` 的
 * BASE_ANALYSIS_COST 保持一致；后端是计费源，前端只用于展示与拦截。
 */
const BREAKDOWN_COST = 20;

/* ------------------------------------------------------------------ */
/*  类型 / 常量                                                         */
/* ------------------------------------------------------------------ */

export type LowFollowerItem = {
  id: string;
  videoId: string;
  authorName: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  contentUrl: string | null;
  duration: number;
  publishedAt: string | null;
  platform: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  engagementRate: number;
  viralScore: number;
  trackTags: string[];
  burstReasons: string[];
  hashtags: string | null;
  seedTopic: string | null;
  suggestion: string | null;
  /** 最近爬虫刷新时间，用于「榜单更新于 X」展示。后端 rowToItem 已返回。 */
  lastRefreshedAt?: string | null;
  /**
   * 12h 复合互动增量（仅 sortBy=recent_view_delta 模式下由 SQL 算出）。
   * 公式：Δview + Δlike + 3Δcomment + 2Δcollect + 4Δshare。
   * 抖音 view 永远 0（平台政策），实际由 like/comment/share/collect 主导。
   * 0 表示没有时间序列数据；> 0 表示该作品过去 12h 真实涨了。
   */
  interactionDelta?: number;
};

/**
 * 默认推荐时间窗（天）。低于此天数的样本才进入榜单，避免陈旧爆款长期占榜。
 * 调整此常量即可改变默认新鲜度；后续如需让用户自选 7/14/30 天，
 * 把它换成 useState 即可（query 的 enabled 已能感知变化）。
 */
const DEFAULT_RECOMMENDATION_WINDOW_DAYS = 14;

/** 把 ISO/MySQL 时间字符串格式化为「N 小时前 / N 天前」 */
function formatRelativeTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const ts = new Date(input).getTime();
  if (Number.isNaN(ts)) return null;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSeconds < 60) return "刚刚";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分钟前`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小时前`;
  if (diffSeconds < 86400 * 30) return `${Math.floor(diffSeconds / 86400)} 天前`;
  if (diffSeconds < 86400 * 365) return `${Math.floor(diffSeconds / (86400 * 30))} 个月前`;
  return `${Math.floor(diffSeconds / (86400 * 365))} 年前`;
}

/**
 * 已接入的平台（与后端 low_follower_samples.platform_id 枚举一致）
 *
 * - 抖音：TikHub 一手数据完整覆盖（爬虫 + 视频解析）—— 主力
 * - 小红书：搜索爬虫已接入；视频解析走 watermark API 兜底
 * - B 站：综合热门接入；优先使用点赞/评论/投币/弹幕等互动信号，无 keyword 反爬风险
 *
 * 不展示 TikTok：DB 无样本、TikHub 未对接。
 * 不展示快手：TikHub 上游对中文搜索端点持续断连（HTTP 000 / 400），实测不可用。
 * 不展示视频号：腾讯不公开互动数（like/comment 全 0），无法跑「低粉爆款」判定。
 *
 * `tag` 字段用于按钮上的角标：抖音=主力，其它=覆盖较少；
 * 旨在给用户「先去抖音看，其它平台数据少」的真实预期，避免点了空。
 */
const PLATFORMS: {
  id: string;
  label: string;
  tone: string;
  tag?: "main" | "preview";
}[] = [
  { id: "douyin", label: "抖音", tone: "bg-black text-white", tag: "main" },
  { id: "xiaohongshu", label: "小红书", tone: "bg-rose-500 text-white", tag: "preview" },
  // 用 B 站取代快手（TikHub 对快手中文搜索端点持续断连不可用；
  // B 站综合热门接口稳定，且数据完整度最高 — 含独家「投币」「弹幕」信号）
  { id: "bilibili", label: "B 站", tone: "bg-pink-500 text-white", tag: "preview" },
];

/* ------------------------------------------------------------------ */
/*  推荐原则                                                            */
/* ------------------------------------------------------------------ */
/**
 * 推荐规则：
 *
 *  1. 默认规则（任何用户）
 *     按 viral_score 倒序，从指定平台的低粉爆款样本中取最高分前 4 条。
 *
 *  2. 赛道专属规则（已完成个性化分析的用户）
 *     当 personalization.getProfile 返回 userEditedNiche / suggestedNiche，
 *     使用该 niche 关键词作为 seedTopic LIKE 过滤，优先返回与用户赛道匹配
 *     的爆款样本；若该赛道下样本不足 4 条，自动 fallback 到默认规则补足。
 */

type RecommendationRule = {
  mode: "default" | "personalized";
  niche: string | null;
  reason: string;
};

function pickRule(profile: {
  userEditedNiche: string | null;
  suggestedNiche: string | null;
  userConfirmed: boolean;
} | null | undefined): RecommendationRule {
  const niche =
    (profile?.userEditedNiche?.trim() || profile?.suggestedNiche?.trim()) || null;
  if (niche) {
    return {
      mode: "personalized",
      niche,
      reason: profile?.userConfirmed
        ? `已确认赛道「${niche}」`
        : `根据账号风格识别的赛道「${niche}」`,
    };
  }
  return {
    mode: "default",
    niche: null,
    reason: "默认按全平台爆款概率排序",
  };
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

function formatNumber(num: number) {
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}亿`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(1)}w`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return `${num}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

/** 去掉标题里的 #hashtag 与多余空白 */
export function stripHashtags(title: string): string {
  if (!title) return "";
  return title
    .replace(/#[^\s#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  CopyButton                                                         */
/* ------------------------------------------------------------------ */

function CopyButton({
  text,
  label = "复制",
  variant = "ghost",
}: {
  text: string;
  label?: string;
  variant?: "ghost" | "primary";
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          copied
            ? "bg-green-50 text-green-600"
            : "bg-gray-900 text-white hover:bg-gray-700"
        }`}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "已复制" : label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        copied
          ? "bg-green-50 text-green-600"
          : "bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
      }`}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? "已复制" : label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  TopicCard — 紧凑卡片                                                */
/* ------------------------------------------------------------------ */

function TopicCard({
  item,
  active,
  onClick,
  matchesNiche,
}: {
  item: LowFollowerItem;
  active: boolean;
  onClick: () => void;
  matchesNiche: boolean;
}) {
  const cleanTitle = stripHashtags(item.title) || item.title || "（未命名）";
  const tag = item.trackTags[0];
  const coverUrl = getProxiedImageUrl(item.coverUrl);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        active ? "border-purple-300 ring-2 ring-purple-200" : "border-gray-100"
      }`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
        {coverUrl ? (
          <ImageWithFallback
            src={coverUrl}
            alt={cleanTitle}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <Zap className="h-8 w-8 text-gray-300" />
          </div>
        )}
        {/* 角标：分数 */}
        <span className="absolute left-2 top-2 rounded-md bg-gradient-to-br from-purple-600 to-pink-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
          {item.viralScore}%
        </span>
        {matchesNiche && (
          <span className="absolute right-2 top-2 rounded bg-purple-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
            赛道
          </span>
        )}
        {/* 底部渐变 + 标签 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 to-transparent" />
        {tag && (
          <span className="absolute bottom-2 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 backdrop-blur-sm">
            {tag}
          </span>
        )}
        {/*
         * 12h 互动飙升角标：放在右下，仅当后端 SQL 算出 interactionDelta > 0 才展示。
         * 公式 Δlike + 3Δcomment + 2Δcollect + 4Δshare。
         * 这是"作品级真实信号"，比 viralScore 滞后但更可信。
         */}
        {typeof item.interactionDelta === "number" && item.interactionDelta > 0 && (
          <span
            className="absolute bottom-2 right-2 rounded bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
            title={`过去 12 小时该作品综合互动 +${item.interactionDelta.toLocaleString()}（点赞×1 + 评论×3 + 收藏×2 + 分享×4）`}
          >
            ↗ +{formatViewDelta(item.interactionDelta)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-3 py-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900 min-h-[2.5rem]">
          {cleanTitle}
        </p>
        <p className="text-[11px] text-gray-400">点卡片预览 · 下方可一键深度拆解</p>
      </div>
    </div>
  );
}

/**
 * 把绝对增量值压缩到角标可读格式。
 * 1234 -> "1.2k", 56789 -> "5.7w", 1234567 -> "123w"
 */
function formatViewDelta(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${Math.round(n / 1_000) / 10}w`.replace(/\.0w$/, "w");
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/* ------------------------------------------------------------------ */
/*  StatCell                                                           */
/* ------------------------------------------------------------------ */

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-gray-400">{label}</span>
      <span
        className={`text-base font-semibold leading-tight ${
          highlight
            ? "bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent"
            : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TrendRow                                                           */
/* ------------------------------------------------------------------ */

function rankBadge(rank: number): string {
  if (rank === 1) return "bg-amber-100 text-amber-700";
  if (rank === 2) return "bg-gray-200 text-gray-700";
  if (rank === 3) return "bg-orange-100 text-orange-700";
  return "bg-gray-50 text-gray-500";
}

/**
 * 把平台原生热度值（如抖音 7614577、快手 13202897、小红书 9016000）
 * 压缩到人能读的字符串。
 */
function formatHotScore(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}万`;
  return `${Math.round(n)}`;
}

function TrendRow({
  rank,
  topic,
  score,
  delta,
  isNew,
  matchesNiche,
  source,
}: {
  rank: number;
  topic: string;
  score: number;
  delta: number;
  isNew: boolean;
  matchesNiche: boolean;
  /** 数据源：影响 score / delta 的展示语义 */
  source: "native" | "sample-aggregation";
}) {
  const isNative = source === "native";
  // native：score 是平台原生热度值（大数），需要 formatHotScore 压缩；
  //         delta 是 rank_diff（>0=排名上升，<0=排名下降，0=持平）
  // sample-aggregation：score 是 viral_score 均分（0-100），直接 round；
  //                      delta 是 7 日环比涨幅 %
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${rankBadge(rank)}`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {topic}
          {matchesNiche && (
            <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-600">
              赛道
            </span>
          )}
        </p>
        <p className="text-[11px] text-gray-400">
          {isNative ? "热度" : "均分"}{" "}
          <span className="font-medium text-gray-600">
            {isNative ? formatHotScore(score) : Math.round(score)}
          </span>
        </p>
      </div>
      {isNew ? (
        <span className="flex shrink-0 items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
          {isNative ? "热" : "新话题"}
        </span>
      ) : isNative ? (
        // native 模式下 delta 是 rank_diff
        delta > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600">
            <ChevronUp className="h-3 w-3" />
            {delta}
          </span>
        ) : delta < 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
            <ChevronUp className="h-3 w-3 rotate-180" />
            {Math.abs(delta)}
          </span>
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600">
          <ChevronUp className="h-3 w-3" />
          {delta.toFixed(0)}%
        </span>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function HotTopicRecommendationsPage() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<string>("douyin");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const breakdownRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------ 积分余额 ------------------------ */
  // 全局 state.credits 是上次同步过的快照；进页时再 query 一次拿最新
  const { state: appState } = useAppStore();
  const balanceQuery = trpc.credits.getBalance.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const credits = balanceQuery.data?.credits ?? appState.credits ?? 0;
  const isShortOfCredits = credits < BREAKDOWN_COST;
  const breakdownsLeft = Math.floor(credits / BREAKDOWN_COST);
  const [paywallOpen, setPaywallOpen] = useState(false);

  /* ------------------------ 个性化画像 ------------------------ */
  const profileQuery = trpc.personalization.getProfile.useQuery({
    platformId: platform,
  });
  const rule = useMemo(() => pickRule(profileQuery.data), [profileQuery.data]);

  /* ------------------------ 推荐数据 ------------------------ */
  // 时间窗：仅保留近 N 天发布或刷新的样本（v11 后端 lowFollower.list.windowDays）
  const windowDays = DEFAULT_RECOMMENDATION_WINDOW_DAYS;

  // 排序：默认按"近 12h 互动增量"（recent_view_delta 兼容旧参数名）—— 把"早 6 点已经爆的"
  // 顶到首位。没有时间序列数据的样本会沉底，但 SQL 兜底仍按 viral_score 排，
  // 所以即便部署初期还没采到 2 个时间点，4 张卡也不会变空。
  const sortBy = "recent_view_delta" as const;

  const personalizedQuery = trpc.lowFollower.list.useQuery(
    {
      page: 1,
      pageSize: 12,
      sortBy,
      sortOrder: "desc",
      platform,
      seedTopic: rule.niche ?? undefined,
      windowDays,
    },
    { enabled: rule.mode === "personalized" },
  );

  const defaultQuery = trpc.lowFollower.list.useQuery({
    page: 1,
    pageSize: 12,
    sortBy,
    sortOrder: "desc",
    platform,
    windowDays,
  });

  const personalizedItems = (personalizedQuery.data?.items ?? []) as LowFollowerItem[];
  const defaultItems = (defaultQuery.data?.items ?? []) as LowFollowerItem[];

  const items: LowFollowerItem[] = useMemo(() => {
    if (rule.mode !== "personalized") return defaultItems;
    if (personalizedItems.length >= 4) return personalizedItems;
    const extraIds = new Set(personalizedItems.map((it) => it.id));
    const fallback = defaultItems.filter((it) => !extraIds.has(it.id));
    return [...personalizedItems, ...fallback];
  }, [rule.mode, personalizedItems, defaultItems]);

  const isLoading =
    defaultQuery.isLoading || (rule.mode === "personalized" && personalizedQuery.isLoading);

  const topPicks = items.slice(0, 4);

  const featured = useMemo(() => {
    if (!items.length) return null;
    if (selectedId) {
      const hit = items.find((it) => it.id === selectedId);
      if (hit) return hit;
    }
    return items[0];
  }, [items, selectedId]);

  /* ------------------------ AI 原因 ------------------------ */
  // 已移除"立即分析"在本页就地调用 LLM 的流程：
  // - LLM 拆解统一收口在 /breakdown/{id}（点击「深度拆解」），后端 7 天缓存复用结果
  // - 本页只展示数据库里预先归集的 burstReasons / suggestion 作为速览
  const aiReasons = useMemo(() => {
    if (!featured) return [] as string[];
    if (featured.burstReasons.length > 0) return featured.burstReasons.slice(0, 3);
    if (featured.suggestion) return [featured.suggestion];
    return [];
  }, [featured]);

  /* ------------------------ 标题模版（同赛道相近样本） ------------------------ */
  const titleTemplates = useMemo(() => {
    if (!featured) return [] as string[];
    return items
      .filter(
        (it) =>
          it.id !== featured.id &&
          it.title &&
          it.title.trim().length > 0 &&
          (it.seedTopic === featured.seedTopic ||
            it.trackTags.some((t) => featured.trackTags.includes(t))),
      )
      .map((it) => stripHashtags(it.title))
      .filter((t) => t.length >= 4) // 太短的剔掉
      .slice(0, 4);
  }, [items, featured]);

  /**
   * 同赛道样本不足时，调 LLM 基于原标题生成可复用变体。
   * 服务端按 featured.id 缓存 7 天（title_variants_cache 表），所以
   * 同一 featured 任何用户后续访问都直接命中缓存、无 LLM 开销。
   * 详见 server/services/title-variants-generator.ts。
   */
  const titleVariantsEnabled = !!featured && titleTemplates.length === 0;
  const titleVariantsQuery = trpc.copywriting.generateTitleVariants.useQuery(
    {
      featuredId: featured?.id ?? "",
      originalTitle: featured?.title ?? "",
      platform: featured?.platform,
      seedTopic: featured?.seedTopic,
      trackTags: featured?.trackTags ?? [],
      burstReasons: featured?.burstReasons ?? [],
      viralScore: featured?.viralScore,
    },
    {
      enabled: titleVariantsEnabled,
      // 跟服务端 7 天 TTL 一致；reactquery 这边设 1 天足以避免重复触发
      staleTime: 24 * 60 * 60 * 1000,
      retry: false,
    },
  );
  const titleVariants = titleVariantsQuery.data?.variants ?? [];
  const titleVariantsLoading = titleVariantsEnabled && titleVariantsQuery.isFetching;

  /* ------------------------ 真实热榜 / 热词 ------------------------
   * hotTopics 现已接入三平台原生热榜（services/native-trending.ts）：
   *   - 抖音 fetch_hot_rise_list（上升榜）
   *   - 小红书 fetch_hot_list（带 rank_change）
   *   - 快手 fetch_kuaishou_hot_list_v2（带 hotValue + pvSoarSignal）
   * 因此 hotTopics 跟随平台切换；hotKeywords 仍是样本聚合，暂不切换。
   */
  const hotTopicsQuery = trpc.trending.hotTopics.useQuery({
    platform,
    limit: 7,
    niche: rule.niche ?? undefined,
  });
  const hotKeywordsQuery = trpc.trending.hotKeywords.useQuery({
    platform,
    limit: 8,
  });


  const trends = hotTopicsQuery.data?.items ?? [];
  const hotKeywords = hotKeywordsQuery.data?.items ?? [];

  /* ------------------------ 跳转 ------------------------ */
  /**
   * 跳到爆款拆解结果页 — 通过 location.state 传整个作品信息，
   * BreakdownPage 在 live 模式下会用 contentUrl 触发 viralBreakdownDirect。
   *
   * 余额不足时不跳转，直接弹 PaywallModal；
   * 即便后端 ENV.creditDeductionEnabled = false（灰度未上线），前端仍按余额拦截，
   * 给业务侧上线扣费时一个"先有可见的拦截行为"的灰度过渡。
   */
  const goBreakdown = (item: LowFollowerItem) => {
    if (!item.contentUrl) return;
    if (isShortOfCredits) {
      setPaywallOpen(true);
      return;
    }
    navigate(`/breakdown/${item.id}`, {
      state: { kind: "live", item },
    });
  };

  /* ------------------------ 渲染 ------------------------ */

  const featuredCleanTitle = featured ? stripHashtags(featured.title) || featured.title : "";
  const featuredCoverUrl = getProxiedImageUrl(featured?.coverUrl);

  // 榜单"更新于"时间：取当前展示样本里 lastRefreshedAt 的最大值
  const latestRefreshedAt = useMemo(() => {
    let latest: string | null = null;
    let latestTs = 0;
    for (const it of items) {
      const ts = it.lastRefreshedAt ? new Date(it.lastRefreshedAt).getTime() : 0;
      if (ts > latestTs) {
        latestTs = ts;
        latest = it.lastRefreshedAt ?? null;
      }
    }
    return latest;
  }, [items]);
  const latestRefreshedRel = formatRelativeTime(latestRefreshedAt);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-5 pb-8 pt-5 sm:px-6">
      {/* ======= 顶部标题 ======= */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-sm">
            <Flame className="h-4 w-4" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">爆款推荐</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              rule.mode === "personalized"
                ? "bg-purple-50 text-purple-600"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {rule.mode === "personalized" ? "赛道专属" : "默认热度"}
          </span>
          <span className="text-xs text-gray-500">{rule.reason}</span>
        </div>
        <span className="text-[11px] text-gray-400">
          近 {windowDays} 天数据
          {latestRefreshedRel && <> · 榜单更新于 {latestRefreshedRel}</>}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ============ 左主区 ============ */}
        <div className="space-y-4">
          {/* 4 张推荐卡 */}
          <section>
            {isLoading ? (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white">
                <span className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在生成推荐选题…
                </span>
              </div>
            ) : topPicks.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 text-center">
                <p className="text-xs text-gray-500">
                  {platform === "douyin"
                    ? `近 ${windowDays} 天暂无样本，可能是窗口期太严`
                    : `「${
                        PLATFORMS.find((p) => p.id === platform)?.label ?? platform
                      }」近 ${windowDays} 天样本不足`}
                </p>
                <p className="text-[11px] text-gray-400">
                  {platform === "douyin"
                    ? "试试切换到右侧其它平台，或去库里浏览全量样本"
                    : "建议切回抖音查看主力榜单，或去库里浏览全量样本"}
                </p>
                <div className="flex items-center gap-3">
                  {platform !== "douyin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlatform("douyin");
                        setSelectedId(null);
                      }}
                      className="text-[11px] font-medium text-purple-600 underline-offset-2 hover:underline"
                    >
                      切到抖音
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/low-follower-opportunities")}
                    className="text-[11px] text-gray-600 underline-offset-2 hover:underline"
                  >
                    去「低粉爆款」库浏览
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {topPicks.map((item) => (
                  <TopicCard
                    key={item.id}
                    item={item}
                    active={featured?.id === item.id}
                    matchesNiche={
                      rule.mode === "personalized" &&
                      !!rule.niche &&
                      ((item.seedTopic ?? "").includes(rule.niche) ||
                        item.trackTags.some((t) => t.includes(rule.niche!)))
                    }
                    onClick={() => {
                      setSelectedId(item.id);
                      // 选中后滚到下方拆解预览区，让"点卡片→看预览→深度拆解"路径连贯
                      setTimeout(() => {
                        breakdownRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 50);
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 今日爆款拆解 — 一行紧凑布局 */}
          {featured && (
            <section
              ref={breakdownRef}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">爆款拆解预览</h2>
                  <span className="rounded bg-gray-50 px-1 text-[10px] font-medium text-gray-500">
                    DB 速览
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 配额可视化：积分余额 + 本次消耗。缓存命中时不会真扣。 */}
                  <span
                    className={`hidden items-center gap-1 text-[10px] sm:flex ${
                      isShortOfCredits ? "text-rose-500" : "text-gray-400"
                    }`}
                    title={`深度拆解每次消耗 ${BREAKDOWN_COST} 积分；同作品 7 天内重复进入命中缓存不再扣费`}
                  >
                    <Coins className="h-3 w-3" />
                    剩 {credits} 积分
                    {!isShortOfCredits && breakdownsLeft > 0 && (
                      <span className="text-gray-300">· ≈ {breakdownsLeft} 次</span>
                    )}
                  </span>
                  {/*
                   * 唯一的"出深度结果"入口：跳到 /breakdown/{id}，由 BreakdownPage 调用
                   * copywriting.viralBreakdownDirect（首次 1 次 LLM，7 天内复用缓存）
                   */}
                  <button
                    type="button"
                    onClick={() => goBreakdown(featured)}
                    disabled={!featured.contentUrl}
                    title={
                      !featured.contentUrl
                        ? "缺少视频链接，无法拆解"
                        : isShortOfCredits
                        ? `余额不足（需 ${BREAKDOWN_COST} 积分），点击充值`
                        : `本次消耗 ${BREAKDOWN_COST} 积分（缓存命中免费）`
                    }
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                      isShortOfCredits
                        ? "bg-gray-200 text-gray-500 hover:bg-gray-300"
                        : "bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:opacity-90"
                    }`}
                  >
                    {isShortOfCredits ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {isShortOfCredits ? "余额不足" : "深度拆解"}
                  </button>
                  <CopyButton
                    text={featuredCleanTitle}
                    label="复制选题"
                    variant="primary"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1.1fr)_minmax(0,1fr)]">
                {/*
                 * 缩略图：点击在新标签页打开平台原视频
                 *   - 有 contentUrl 时整张封面变成可点击 a，hover 出现"播放"覆盖层
                 *   - 没有 contentUrl 时退化为静态占位
                 */}
                {featured.contentUrl ? (
                  <a
                    href={featured.contentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="在新标签页打开原视频"
                    className="group/cover relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100"
                  >
                    {featuredCoverUrl ? (
                      <ImageWithFallback
                        src={featuredCoverUrl}
                        alt={featuredCleanTitle}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover/cover:scale-[1.04]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PlayCircle className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                    {/* 悬停播放按钮覆盖层 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover/cover:bg-black/40">
                      <PlayCircle className="h-10 w-10 text-white opacity-0 drop-shadow-lg transition-opacity duration-200 group-hover/cover:opacity-100" />
                    </div>
                    {/* 始终可见的角标提示，让用户知道封面是可点击的 */}
                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      <PlayCircle className="h-2.5 w-2.5" />
                      看原视频
                    </span>
                  </a>
                ) : (
                  <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100">
                    {featuredCoverUrl ? (
                      <ImageWithFallback
                        src={featuredCoverUrl}
                        alt={featuredCleanTitle}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PlayCircle className="h-8 w-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                )}

                {/* 标题 + 4 项数据 + AI 原因 */}
                <div className="flex flex-col gap-3 min-w-0">
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
                      {featuredCleanTitle || "（未命名）"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      @{featured.authorName}
                      {featured.seedTopic && ` · #${featured.seedTopic}`}
                      {featured.trackTags.length > 0 && (
                        <> · {featured.trackTags.slice(0, 3).join(" / ")}</>
                      )}
                    </p>
                  </div>

                  {/*
                   * 数据列只展示 TikHub 稳定可用的互动指标。
                   */}
                  <div className="grid grid-cols-4 gap-x-3 gap-y-1.5 rounded-lg bg-gray-50/70 px-3 py-2">
                    {featured.platform === "xiaohongshu" ? (
                      <>
                        <StatCell label="点赞数" value={formatNumber(featured.likeCount)} />
                        <StatCell label="评论数" value={formatNumber(featured.commentCount)} />
                        <StatCell label="收藏数" value={formatNumber(featured.saveCount)} />
                      </>
                    ) : featured.platform === "bilibili" ? (
                      <>
                        <StatCell label="点赞数" value={formatNumber(featured.likeCount)} />
                        <StatCell label="评论数" value={formatNumber(featured.commentCount)} />
                        <StatCell label="分享数" value={formatNumber(featured.shareCount)} />
                      </>
                    ) : (
                      <>
                        <StatCell label="点赞数" value={formatNumber(featured.likeCount)} />
                        <StatCell label="评论数" value={formatNumber(featured.commentCount)} />
                        <StatCell label="互动率" value={formatPercent(featured.engagementRate)} />
                      </>
                    )}
                    <StatCell
                      label="爆款分"
                      value={String(featured.viralScore)}
                      highlight
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                        <span>爆款原因</span>
                        <span className="rounded bg-gray-100 px-1 text-[10px] font-medium text-gray-500">
                          归集
                        </span>
                      </div>
                    </div>
                    {aiReasons.length > 0 ? (
                      <ul className="space-y-1">
                        {aiReasons.slice(0, 3).map((reason, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-xs leading-snug text-gray-600"
                          >
                            <Check className="mt-[3px] h-3 w-3 shrink-0 text-purple-500" />
                            <span className="line-clamp-2">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400">
                        暂无归集分析，点右上「深度拆解」获取完整 AI 拆解。
                      </p>
                    )}
                  </div>
                </div>

                {/* 标题模版 — 同赛道样本优先；样本不足时降级到 LLM 变体 */}
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-gray-700">
                    可复用标题
                    <span className="ml-1 text-[10px] font-normal text-gray-400">
                      {titleTemplates.length > 0
                        ? "（同赛道高分样本）"
                        : titleVariants.length > 0
                          ? "（AI 改写）"
                          : "（同赛道高分样本）"}
                    </span>
                  </p>
                  {titleTemplates.length > 0 ? (
                    <div className="space-y-1.5">
                      {titleTemplates.map((tpl, idx) => (
                        <div
                          key={`${tpl}-${idx}`}
                          className="group/row flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5"
                        >
                          <p className="line-clamp-1 flex-1 text-xs text-gray-700">
                            {tpl}
                          </p>
                          <CopyButton text={tpl} label="复制" />
                        </div>
                      ))}
                    </div>
                  ) : titleVariantsLoading ? (
                    <div className="space-y-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5"
                        >
                          <div className="h-3 flex-1 animate-pulse rounded bg-gray-200" />
                        </div>
                      ))}
                      <p className="pt-1 text-[10px] text-gray-400">
                        样本不足，AI 正基于原标题改写…
                      </p>
                    </div>
                  ) : titleVariants.length > 0 ? (
                    <div className="space-y-1.5">
                      {titleVariants.map((v, idx) => (
                        <div
                          key={`${v.title}-${idx}`}
                          className="group/row flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5"
                        >
                          <span className="shrink-0 rounded bg-purple-50 px-1 text-[10px] font-medium text-purple-600">
                            {v.style}
                          </span>
                          <p className="line-clamp-1 flex-1 text-xs text-gray-700">
                            {v.title}
                          </p>
                          <CopyButton text={v.title} label="复制" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">
                      该话题样本不足，暂无可复用标题。
                    </p>
                  )}
                </div>
              </div>

            </section>
          )}
        </div>

        {/* ============ 右侧栏 ============ */}
        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          {/* 上升榜 — N 日内环比上升最快的话题（数据源锁定抖音） */}
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  {hotTopicsQuery.data?.source === "native" ? "热榜" : "7 日上升榜"}
                </h3>
                <span
                  className={`rounded px-1 text-[10px] font-medium ${
                    hotTopicsQuery.data?.source === "native"
                      ? "bg-rose-50 text-rose-600"
                      : "bg-gray-50 text-gray-500"
                  }`}
                  title={
                    hotTopicsQuery.data?.source === "native"
                      ? "数据源：平台官方热榜（实时）"
                      : "数据源：低粉爆款样本聚合（兜底）"
                  }
                >
                  {hotTopicsQuery.data?.source === "native"
                    ? `${PLATFORMS.find((p) => p.id === platform)?.label ?? platform} · 实时`
                    : "样本聚合"}
                </span>
              </div>
              <span className="text-[10px] text-gray-400">
                {hotTopicsQuery.data?.source === "native" ? "按平台热度" : "按环比涨幅"}
              </span>
            </div>
            {hotTopicsQuery.data?.source !== "native" && (
              <p className="mb-2 text-[10px] leading-relaxed text-gray-400">
                展示「最近{hotTopicsQuery.data?.windowDays ?? 7} 天 vs 上{hotTopicsQuery.data?.windowDays ?? 7} 天」涨幅最快、且本身均分 ≥ 50 的话题。下降的话题不进榜。
              </p>
            )}
            {hotTopicsQuery.isLoading ? (
              <div className="flex items-center justify-center py-5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              </div>
            ) : trends.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">暂无趋势</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {trends.map((t, idx) => (
                  <TrendRow
                    key={t.topic}
                    rank={idx + 1}
                    topic={t.topic}
                    score={t.avgScore}
                    delta={t.delta}
                    isNew={t.isNew}
                    matchesNiche={t.matchesNiche}
                    source={hotTopicsQuery.data?.source ?? "sample-aggregation"}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* 实时热词（样本聚合，随平台切换） */}
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Music2 className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-900">实时热词</h3>
              <span
                className="rounded bg-gray-50 px-1 text-[10px] font-medium text-gray-500"
                title="数据源：低粉爆款样本 track_tags + hashtags 频次聚合（非平台原生）"
              >
                聚合
              </span>
            </div>
            {hotKeywordsQuery.isLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
              </div>
            ) : hotKeywords.length === 0 ? (
              <p className="py-3 text-center text-xs text-gray-400">暂无热词</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {hotKeywords.map((kw) => (
                  <button
                    key={kw.keyword}
                    type="button"
                    onClick={() =>
                      navigate(`/predict?deepPrompt=${encodeURIComponent(kw.keyword)}`)
                    }
                    className="rounded-full bg-gradient-to-r from-yellow-50 to-orange-50 px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:bg-gray-900 hover:bg-none hover:text-white"
                    title={`${kw.count} 条样本 · 平均 ${kw.avgScore.toFixed(0)} 分`}
                  >
                    {kw.keyword}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 平台切换 */}
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">平台切换</h3>
              <span className="text-[10px] text-gray-400">主力 / 试运营</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => {
                const active = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPlatform(p.id);
                      setSelectedId(null);
                    }}
                    className={`relative flex flex-col items-center gap-1 rounded-lg border py-2.5 text-[11px] transition-colors ${
                      active
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-gray-100 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {p.tag === "main" && (
                      <span className="absolute -top-1.5 right-1 rounded bg-purple-500 px-1 py-px text-[9px] font-bold text-white shadow-sm">
                        主力
                      </span>
                    )}
                    {p.tag === "preview" && (
                      <span className="absolute -top-1.5 right-1 rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700">
                        试运营
                      </span>
                    )}
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold ${p.tone}`}
                    >
                      {p.label.slice(0, 2)}
                    </span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
            {platform !== "douyin" && (
              <p className="mt-2.5 text-[10px] leading-relaxed text-gray-400">
                试运营平台样本较少，深度拆解走 watermark 兜底；建议以抖音榜单为主、其它做交叉验证。
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* 余额不足时的付费墙：复用现有 PaywallModal，充值成功后自动跳到拆解 */}
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        context={{
          actionLabel: "深度拆解",
          requiredCredits: BREAKDOWN_COST,
          shortfall: Math.max(0, BREAKDOWN_COST - credits),
          contextDescription: featured
            ? `解锁「${stripHashtags(featured.title) || "该爆款"}」的完整 AI 拆解（含 25 分镜脚本）`
            : "解锁完整 AI 拆解（含 25 分镜脚本）",
        }}
        onTopUpComplete={() => {
          // 充值完成 → 主动刷新余额，并自动进入拆解
          void balanceQuery.refetch();
          if (featured?.contentUrl) {
            navigate(`/breakdown/${featured.id}`, {
              state: { kind: "live", item: featured },
            });
          }
        }}
      />
    </div>
  );
}
