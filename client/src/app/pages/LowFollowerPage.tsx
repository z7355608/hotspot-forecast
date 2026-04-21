import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Film,
  ImageIcon,
  Loader2,
  Lock,
  Mic,
  Monitor,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Star,
  TrendingUp,
  X,
  Zap,
  Scissors,
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { trpc } from "@/lib/trpc";
import { useAppStore } from "../store/app-store";
import { normalizePlan } from "../store/app-data";
import {
  BreakdownAhaResult,
  type BreakdownData,
  type BreakdownVideoInfo,
} from "../components/BreakdownAhaResult";

/* ------------------------------------------------------------------ */
/*  类型定义                                                            */
/* ------------------------------------------------------------------ */

interface LowFollowerItem {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  followerCount: number;
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
  followerViewRatio: number;
  engagementRate: number;
  weightedInteraction: number;
  fanEfficiencyRatio: number;
  viralScore: number;
  viralScoreTrend: string;
  isStrictHit: boolean;
  contentForm: string | null;
  trackTags: string[];
  burstReasons: string[];
  hashtags: string | null;
  musicTitle: string | null;
  seedTopic: string | null;
  suggestion: string | null;
  newbieFriendly: number;
  createdAt: string;
  lastRefreshedAt: string | null;
  scoreUpdatedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  颜色 / 工具函数                                                     */
/* ------------------------------------------------------------------ */

function getScoreColor(score: number) {
  if (score >= 80) return "bg-purple-600 text-white";
  if (score >= 60) return "bg-rose-600 text-white";
  if (score >= 40) return "bg-blue-600 text-white";
  if (score >= 20) return "bg-emerald-600 text-white";
  return "bg-gray-700 text-white";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "爆款";
  if (score >= 60) return "优质";
  if (score >= 40) return "潜力";
  if (score >= 20) return "观察";
  return "一般";
}

function getTrendIcon(trend: string) {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  if (trend === "stable") return "→";
  return "★";
}

function getTrendColor(trend: string) {
  if (trend === "up") return "text-green-500";
  if (trend === "down") return "text-red-400";
  return "text-gray-400";
}

function getFansLabel(count: number) {
  if (!count || count <= 0) return "未知";
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

function getFansRangeValue(fansCount: number) {
  if (fansCount <= 1000) return "0–1k";
  if (fansCount <= 5000) return "1k–5k";
  if (fansCount <= 10000) return "5k–1w";
  return "1w–5w";
}

function formatNumber(num: number) {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return `${num}`;
}

function relativeTime(iso: string | null) {
  if (!iso) return "未知";
  const now = Date.now();
  const diff = now - Date.parse(iso);
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return "刚刚";
  if (days < 1) return "今天";
  if (days < 2) return "昨天";
  if (days < 7) return `${Math.floor(days)}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

function formatDuration(seconds: number) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatUpdateTime(iso: string | null) {
  if (!iso) return "暂无数据";
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hour}:${min}`;
}

function FormatIcon({ form }: { form: string }) {
  const cls = "h-2.5 w-2.5 shrink-0";
  const icons: Record<string, ReactNode> = {
    竖屏视频: <Smartphone className={cls} />,
    横屏视频: <Monitor className={cls} />,
    图文: <ImageIcon className={cls} />,
    口播: <Mic className={cls} />,
    剪辑: <Film className={cls} />,
    干货: <BookOpen className={cls} />,
    测评: <Star className={cls} />,
  };
  return icons[form] ?? null;
}

/* ------------------------------------------------------------------ */
/*  FilterPill                                                         */
/* ------------------------------------------------------------------ */

function FilterPill({
  label,
  active,
  locked,
  onClick,
}: {
  label: string;
  active: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : locked
            ? "cursor-not-allowed bg-gray-50 text-gray-300"
            : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
      }`}
    >
      {label}
      {locked && <Lock className="h-2.5 w-2.5" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  VideoCard                                                          */
/* ------------------------------------------------------------------ */

function VideoCard({
  item,
  isMember,
  onClick,
  onBreakdown,
}: {
  item: LowFollowerItem;
  isMember: boolean;
  onClick: () => void;
  onBreakdown: () => void;
}) {
  const totalInteraction = item.likeCount + item.commentCount + item.shareCount + item.saveCount;
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      {/* 封面 */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100">
        {item.coverUrl ? (
          <ImageWithFallback
            src={item.coverUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <Zap className="h-8 w-8 text-gray-300" />
          </div>
        )}
        {/* 时长标签 */}
        {item.duration > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {formatDuration(item.duration)}
          </span>
        )}
        {/* 内容形式标签 */}
        {item.contentForm && !item.duration && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            <FormatIcon form={item.contentForm} />
            {item.contentForm}
          </span>
        )}
        {/* 严格命中标记 */}
        {item.isStrictHit && (
          <span className="absolute left-2 top-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
            精选
          </span>
        )}
      </div>

      {/* 信息区 */}
      <div className="mt-2.5 px-0.5">
        {/* 评分标签 + 趋势 + 标题 */}
        <div className="flex items-start gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold leading-none ${getScoreColor(item.viralScore)}`}
            >
              {Math.round(item.viralScore)}分
            </span>
            <span className={`text-[11px] font-medium ${getTrendColor(item.viralScoreTrend)}`}>
              {getTrendIcon(item.viralScoreTrend)}
            </span>
          </div>
          <p className="line-clamp-1 text-sm font-medium leading-snug text-gray-900 group-hover:text-gray-700">
            {item.title}
          </p>
        </div>

        {/* 作者 + 粉丝 */}
        <p className="mt-1.5 truncate text-xs text-gray-500">
          {item.authorName}
          {isMember && (
            <>
              <span className="mx-1 text-gray-300">·</span>
              {getFansLabel(item.followerCount)}粉丝
            </>
          )}
        </p>

        {/* 互动数据 */}
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <span>❤ {formatNumber(item.likeCount)}</span>
          <span>💬 {formatNumber(item.commentCount)}</span>
          <span>⭐ {formatNumber(item.saveCount)}</span>
          {item.publishedAt && (
            <>
              <span className="text-gray-300">·</span>
              <span>{relativeTime(item.publishedAt)}</span>
            </>
          )}
        </div>

        {/* 标签 */}
        {item.trackTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.trackTags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 拆解爆款按钮 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBreakdown();
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-900 hover:bg-gray-900 hover:text-white"
        >
          <Scissors className="h-3 w-3" />
          拆解爆款
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatsBar                                                           */
/* ------------------------------------------------------------------ */

function StatsBar({ stats }: { stats: {
  total: number;
  strictCount: number;
  lastUpdated: string | null;
  avgScore: number;
  maxScore: number;
  topicCount: number;
} }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-3 text-xs text-gray-500 shadow-sm">
      <div className="flex items-center gap-1.5">
        <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
        <span>更新至 <strong className="text-gray-700">{formatUpdateTime(stats.lastUpdated)}</strong></span>
      </div>
      <div className="h-3 w-px bg-gray-200" />
      <span>收录 <strong className="text-gray-700">{stats.total}</strong> 个爆款样本</span>
      <div className="h-3 w-px bg-gray-200" />
      <span>精选 <strong className="text-amber-600">{stats.strictCount}</strong> 个</span>
      <div className="h-3 w-px bg-gray-200" />
      <span>平均评分 <strong className="text-gray-700">{stats.avgScore.toFixed(1)}</strong></span>
      <div className="h-3 w-px bg-gray-200" />
      <span>覆盖 <strong className="text-gray-700">{stats.topicCount}</strong> 个话题</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        上一页
      </button>
      <span className="text-xs text-gray-500">
        第 {page} / {totalPages} 页
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一页
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LowFollowerPage 主组件                                              */
/* ------------------------------------------------------------------ */

export function LowFollowerPage() {
  const navigate = useNavigate();
  const { state } = useAppStore();

  /* ---- 爆款拆解弹窗状态 ---- */
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownData, setBreakdownData] = useState<BreakdownData | null>(null);
  const [breakdownVideoInfo, setBreakdownVideoInfo] = useState<BreakdownVideoInfo | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const breakdownMutation = trpc.copywriting.viralBreakdown.useMutation();

  /* ---- 筛选状态 ---- */
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  const [fansRange, setFansRange] = useState("全部");
  const [contentForm, setContentForm] = useState<string | undefined>(undefined);
  const [seedTopic, setSeedTopic] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"viral_score" | "weighted_interaction" | "fan_efficiency_ratio" | "created_at" | "author_followers">("viral_score");
  const [strictOnly, setStrictOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const isMember = normalizePlan(state.membershipPlan) !== "free";

  /* ---- tRPC 查询 ---- */
  const statsQuery = trpc.lowFollower.stats.useQuery();
  const listQuery = trpc.lowFollower.list.useQuery({
    page,
    pageSize,
    sortBy,
    sortOrder: "desc",
    platform,
    contentForm,
    seedTopic,
    strictOnly: strictOnly || undefined,
    search: search || undefined,
  });

  const items = (listQuery.data?.items ?? []) as LowFollowerItem[];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 0;
  const stats = statsQuery.data;

  /* ---- 本地粉丝范围过滤（因为DB没有粉丝范围列，前端过滤） ---- */
  const filteredItems = useMemo(() => {
    if (fansRange === "全部") return items;
    return items.filter((item) => getFansRangeValue(item.followerCount) === fansRange);
  }, [items, fansRange]);

  /* ---- 免费用户只看前5个 ---- */
  const FREE_ROW_COUNT = 5;
  const visibleItems = isMember ? filteredItems : filteredItems.slice(0, FREE_ROW_COUNT);
  const lockedItems = isMember ? [] : filteredItems.slice(FREE_ROW_COUNT);

  /* ---- 爆款拆解（弹窗模式） ---- */
  const toBreakdown = async (item: LowFollowerItem) => {
    if (!item.contentUrl) return;
    setBreakdownOpen(true);
    setBreakdownLoading(true);
    setBreakdownData(null);
    setBreakdownError(null);
    setBreakdownVideoInfo({
      videoUrl: item.contentUrl,
      title: item.title,
      coverUrl: item.coverUrl || undefined,
      author: item.authorName,
    });
    try {
      const res = await breakdownMutation.mutateAsync({ url: item.contentUrl });
      setBreakdownData(res.breakdown as BreakdownData);
    } catch (err: any) {
      setBreakdownError(err?.message || "拆解失败，请稍后重试");
    } finally {
      setBreakdownLoading(false);
    }
  };

  /* ---- 搜索提交 ---- */
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  /* ---- 重置筛选 ---- */
  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setPlatform(undefined);
    setFansRange("全部");
    setContentForm(undefined);
    setSeedTopic(undefined);
    setSortBy("viral_score");
    setStrictOnly(false);
    setPage(1);
  };

  /* ---- 排序映射 ---- */
  const sortOptions: { label: string; value: typeof sortBy }[] = [
    { label: "爆款指数最高", value: "viral_score" },
    { label: "互动量最高", value: "weighted_interaction" },
    { label: "性价比最高", value: "fan_efficiency_ratio" },
    { label: "最新入库", value: "created_at" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-6 sm:px-6">
      {/* ================================================================ */}
      {/*  统计栏                                                          */}
      {/* ================================================================ */}
      {stats && stats.total > 0 && <StatsBar stats={stats} />}

      {/* ================================================================ */}
      {/*  搜索栏                                                          */}
      {/* ================================================================ */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={isMember ? "搜索视频标题、作者、话题" : "搜索视频标题"}
            value={searchInput}
            onChange={(e) => isMember ? setSearchInput(e.target.value) : undefined}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            readOnly={!isMember}
            className={`w-full rounded-full border bg-white py-3 pl-11 pr-4 text-sm shadow-sm transition-colors ${
              isMember
                ? "border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-100"
                : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 placeholder:text-gray-300"
            }`}
          />
          {!isMember && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">
                <Lock className="h-2.5 w-2.5" />
                Pro
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => isMember ? handleSearch() : undefined}
          className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors ${
            isMember
              ? "bg-gray-900 text-white hover:bg-gray-700"
              : "cursor-not-allowed bg-gray-100 text-gray-400"
          }`}
        >
          <Search className="h-4 w-4" />
          搜索
          {!isMember && <Lock className="h-3 w-3" />}
        </button>
      </div>

      {/* ================================================================ */}
      {/*  标题 + 过滤器按钮                                                 */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">低粉爆款发现</h1>
          <p className="mt-1 text-xs text-gray-400">
            {listQuery.isLoading ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                加载中...
              </span>
            ) : (
              <>
                共 {total} 个爆款样本
                {isMember && " · 已按你的筛选条件实时更新"}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => isMember ? setFilterOpen(!filterOpen) : undefined}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
            isMember
              ? filterOpen
                ? "border-gray-300 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          过滤器
          {!isMember && <Lock className="h-3 w-3" />}
        </button>
      </div>

      {/* ================================================================ */}
      {/*  筛选面板（仅会员可用）                                             */}
      {/* ================================================================ */}
      {filterOpen && isMember && (
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">筛选条件</span>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* 平台 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="mt-1.5 w-16 shrink-0 text-[11px] text-gray-400">平台</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "全部", value: undefined },
                  { label: "抖音", value: "douyin" },
                  { label: "小红书", value: "xiaohongshu" },
                  { label: "B站", value: "bilibili" },
                  { label: "快手", value: "kuaishou" },
                ].map((item) => (
                  <FilterPill
                    key={item.label}
                    label={item.label}
                    active={platform === item.value}
                    onClick={() => { setPlatform(item.value); setPage(1); }}
                  />
                ))}
              </div>
            </div>

            {/* 排序 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="mt-1.5 w-16 shrink-0 text-[11px] text-gray-400">排序</span>
              <div className="flex flex-wrap gap-1.5">
                {sortOptions.map((item) => (
                  <FilterPill
                    key={item.value}
                    label={item.label}
                    active={sortBy === item.value}
                    onClick={() => { setSortBy(item.value); setPage(1); }}
                  />
                ))}
              </div>
            </div>

            {/* 粉丝数 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="mt-1.5 w-16 shrink-0 text-[11px] text-gray-400">粉丝数</span>
              <div className="flex flex-wrap gap-1.5">
                {["全部", "0–1k", "1k–5k", "5k–1w", "1w–5w"].map((item) => (
                  <FilterPill key={item} label={item} active={fansRange === item} onClick={() => setFansRange(item)} />
                ))}
              </div>
            </div>

            {/* 内容形式 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="mt-1.5 w-16 shrink-0 text-[11px] text-gray-400">内容形式</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "全部", value: undefined },
                  { label: "竖屏视频", value: "竖屏视频" },
                  { label: "横屏视频", value: "横屏视频" },
                  { label: "图文", value: "图文" },
                  { label: "口播", value: "口播" },
                  { label: "干货", value: "干货" },
                ].map((item) => (
                  <FilterPill
                    key={item.label}
                    label={item.label}
                    active={contentForm === item.value}
                    onClick={() => { setContentForm(item.value); setPage(1); }}
                  />
                ))}
              </div>
            </div>

            {/* 仅精选 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="mt-1.5 w-16 shrink-0 text-[11px] text-gray-400">质量</span>
              <div className="flex flex-wrap gap-1.5">
                <FilterPill label="全部" active={!strictOnly} onClick={() => { setStrictOnly(false); setPage(1); }} />
                <FilterPill label="仅精选" active={strictOnly} onClick={() => { setStrictOnly(true); setPage(1); }} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              重置筛选
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/*  加载状态                                                        */}
      {/* ================================================================ */}
      {listQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
        </div>
      )}

      {/* ================================================================ */}
      {/*  视频卡片网格 — 可见区域                                           */}
      {/* ================================================================ */}
      {!listQuery.isLoading && visibleItems.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleItems.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              isMember={isMember}
              onClick={() => {
                if (item.contentUrl) window.open(item.contentUrl, "_blank");
              }}
              onBreakdown={() => toBreakdown(item)}
            />
          ))}
        </div>
      )}

      {/* ================================================================ */}
      {/*  分页                                                            */}
      {/* ================================================================ */}
      {isMember && !listQuery.isLoading && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* ================================================================ */}
      {/*  免费用户锁定区域                                                  */}
      {/* ================================================================ */}
      {!isMember && lockedItems.length > 0 && (
        <div className="relative">
          <div className="pointer-events-none select-none">
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 opacity-40 blur-[6px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {lockedItems.slice(0, 10).map((item) => (
                <VideoCard
                  key={item.id}
                  item={item}
                  isMember={false}
                  onClick={() => {}}
                  onBreakdown={() => {}}
                />
              ))}
            </div>
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-gradient-to-b from-white/60 via-blue-50/80 to-blue-50/90">
            <div className="mx-auto max-w-md text-center">
              <h3 className="mb-3 text-xl font-bold text-gray-900">
                解锁全部低粉爆款样本
              </h3>
              <p className="mb-6 text-sm leading-relaxed text-gray-500">
                免费用户仅可浏览前 {FREE_ROW_COUNT} 个样本预览。升级会员后可解锁全部 {total} 个爆款样本，
                使用高级筛选、赛道过滤和搜索功能，快速找到最适合你借鉴的低粉爆款。
              </p>
              <button
                type="button"
                onClick={() => navigate("/credits")}
                className="rounded-full bg-gray-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                立即升级
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/*  空状态                                                          */}
      {/* ================================================================ */}
      {!listQuery.isLoading && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          {total === 0 ? (
            <>
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-50">
                <TrendingUp className="h-10 w-10 text-amber-500" />
              </div>
              <p className="text-lg font-semibold text-gray-800">低粉爆款库正在建设中</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-500">
                去首页分析几个你感兴趣的话题，系统会自动为你发现和收录低粉爆款视频。
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-8 rounded-full bg-gray-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                去首页分析话题
              </button>
            </>
          ) : (
            <>
              <TrendingUp className="mx-auto mb-4 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">当前筛选条件下没有命中样本</p>
              <p className="mt-2 text-xs text-gray-400">试试放宽筛选条件，或切换排序方式。</p>
            </>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  爆款拆解弹窗                                                      */}
      {/* ================================================================ */}
      {breakdownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !breakdownLoading && setBreakdownOpen(false)}>
          <div
            className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={() => !breakdownLoading && setBreakdownOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            {/* 加载中 */}
            {breakdownLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative mb-6">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
                  <Zap className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-orange-500" />
                </div>
                <p className="text-lg font-semibold text-gray-800">正在拆解爆款密码...</p>
                <p className="mt-2 text-sm text-gray-500">视频理解 + 分镜分析 + 神经营销洞察，预计需要 30-60 秒</p>
                <div className="mt-6 flex items-center gap-3">
                  {["视频解析", "分镜拆解", "策略分析", "复刻建议"].map((step, i) => (
                    <div key={step} className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${i <= 1 ? "animate-pulse bg-orange-500" : "bg-gray-200"}`} />
                      <span className={`text-xs ${i <= 1 ? "text-orange-600 font-medium" : "text-gray-400"}`}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 错误 */}
            {breakdownError && !breakdownLoading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 rounded-full bg-red-50 p-4">
                  <X className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-lg font-semibold text-gray-800">拆解失败</p>
                <p className="mt-2 max-w-md text-center text-sm text-gray-500">{breakdownError}</p>
                <button
                  type="button"
                  onClick={() => setBreakdownOpen(false)}
                  className="mt-6 rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                >
                  关闭
                </button>
              </div>
            )}

            {/* 拆解结果 */}
            {breakdownData && breakdownVideoInfo && !breakdownLoading && (
              <BreakdownAhaResult data={breakdownData} videoInfo={breakdownVideoInfo} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
