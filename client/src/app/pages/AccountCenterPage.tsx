import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  Play,
  RefreshCw,
  User,
  Users,
} from "lucide-react";
import { useAppStore, type CreatorCacheEntry } from "../store/app-store-provider";
import { PLATFORM_PREDICTION_META } from "../store/prediction-platforms";
import {
  syncCreatorData,
  getCreatorOverview,
  getCreatorWorks,
  getCreatorFanProfile,
  getCreatorTrends,
  fetchWorkComments,
  analyzeWorkComments,
  type CommentItem as APICommentItem,
} from "../lib/creator-api";

// ─── Sub-components & types from account-center/ ────────────────────
import {
  type AccountOverview,
  type WorkItem,
  type WorkDetail,
  type TrendDataPoint,
  type FanProfile,
  type CommentItem,
  getPlatformMetrics,
  getWorkSortOptions,
  formatNumber,
  formatChange,
} from "./account-center/types";

import {
  NoConnectorGuide,
  PlatformSelector,
  MetricCard,
  MiniTrendChart,
  FanProfileSection,
} from "./account-center/OverviewSection";

import {
  WorkCardGrid,
  WorkDetailModal,
} from "./account-center/WorksSection";

// ─── Main page component ────────────────────────────────────────────

export function AccountCenterPage() {
  const navigate = useNavigate();
  const { connectedConnectors, updateUserProfile, getCreatorCache, setCreatorCache, clearCreatorCache } = useAppStore();

  const connected = connectedConnectors;

  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const activePlatform = selectedPlatform || connected[0]?.id || "";

  const [selectedWork, setSelectedWork] = useState<WorkDetail | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [activeSection, setActiveSection] = useState<"overview" | "works" | "fans">("overview");
  const [workSort, setWorkSort] = useState<string>("time");
  const [worksPage, setWorksPage] = useState(1);
  const WORKS_PAGE_SIZE = 24;

  // 真实数据状态
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [rawWorks, setRawWorks] = useState<WorkItem[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [fanProfile, setFanProfile] = useState<FanProfile | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [hasSynced, setHasSynced] = useState(false);

  const activeConnector = connected.find((c) => c.id === activePlatform);

  // 将后端数据应用到本地 state 的辅助函数
  const applyDataToState = (ovData: AccountOverview | null, wkData: WorkItem[], fpData: FanProfile | null, tdData: TrendDataPoint[]) => {
    const hasRealData = ovData || wkData.length > 0;
    if (hasRealData) {
      if (ovData) {
        const enriched: AccountOverview = {
          ...ovData,
          platformColor: activeConnector?.color ?? "",
          platformName: ovData.platformName || (activeConnector?.name ?? ""),
        };
        setOverview(enriched);
      } else {
        const basicOverview: AccountOverview = {
          platformId: activePlatform,
          platformName: activeConnector?.name ?? activePlatform,
          platformColor: activeConnector?.color ?? "",
          handle: activeConnector?.handle || `@${activeConnector?.name || activePlatform}`,
          totalWorks: wkData.length,
          followers: 0,
          avgEngagementRate: 0,
        };
        setOverview(basicOverview);
      }
      setRawWorks(wkData as unknown as WorkItem[]);
      setTrendData(tdData as unknown as TrendDataPoint[]);
      setFanProfile(fpData as unknown as FanProfile | null);
      setHasSynced(true);
    } else {
      const emptyOverview: AccountOverview = {
        platformId: activePlatform,
        platformName: activeConnector?.name ?? activePlatform,
        platformColor: activeConnector?.color ?? "",
        handle: activeConnector?.handle || `@${activeConnector?.name || activePlatform}`,
        totalWorks: 0,
        followers: 0,
        avgEngagementRate: 0,
      };
      setOverview(emptyOverview);
      setRawWorks([]);
      setTrendData([]);
      setFanProfile(null);
      setHasSynced(false);
    }
  };

  // 加载数据（优先使用全局缓存，30min 内不重复请求后端）
  useEffect(() => {
    if (!activePlatform || !activeConnector) return;
    let cancelled = false;

    // 1. 先检查全局缓存（切换页面回来时直接用，无需 loading）
    const cached = getCreatorCache(activePlatform);
    if (cached) {
      applyDataToState(cached.overview, cached.works, cached.fanProfile, cached.trendData);
      return; // 缓存命中，不请求后端
    }

    // 2. 缓存未命中，从后端加载
    setDataLoading(true);
    setDataError(null);

    async function loadCachedData() {
      try {
        const [ov, wk, fp, td] = await Promise.allSettled([
          getCreatorOverview(activePlatform),
          getCreatorWorks(activePlatform, 500),
          getCreatorFanProfile(activePlatform),
          getCreatorTrends(activePlatform, 30),
        ]);
        if (cancelled) return;

        const ovData = ov.status === "fulfilled" ? ov.value : null;
        const wkData = wk.status === "fulfilled" ? wk.value : [];
        const fpData = fp.status === "fulfilled" ? fp.value : null;
        const tdData = td.status === "fulfilled" ? td.value : [];

        // 写入全局缓存
        const cacheEntry: CreatorCacheEntry = {
          overview: ovData,
          works: wkData as unknown as WorkItem[],
          fanProfile: fpData as unknown as FanProfile | null,
          trendData: tdData as unknown as TrendDataPoint[],
          cachedAt: Date.now(),
        };
        setCreatorCache(activePlatform, cacheEntry);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applyDataToState(ovData as any, wkData as unknown as WorkItem[], fpData as unknown as FanProfile | null, tdData as unknown as TrendDataPoint[]);
      } catch (err) {
        if (cancelled) return;
        console.error("[CreatorCenter] load cached data error:", err);
        const fallbackOverview: AccountOverview = {
          platformId: activePlatform,
          platformName: activeConnector?.name ?? activePlatform,
          platformColor: activeConnector?.color ?? "",
          handle: activeConnector?.handle || `@${activeConnector?.name || activePlatform}`,
          totalWorks: 0,
          followers: 0,
          avgEngagementRate: 0,
        };
        setOverview(fallbackOverview);
        setRawWorks([]);
        setTrendData([]);
        setFanProfile(null);
        setHasSynced(false);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    loadCachedData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlatform, activeConnector]);

  // 手动同步数据
  const SYNC_SUPPORTED_PLATFORMS = new Set(["douyin", "xiaohongshu", "kuaishou"]);
  const isSyncSupported = SYNC_SUPPORTED_PLATFORMS.has(activePlatform);

  const handleSync = useCallback(async () => {
    if (!activePlatform || syncLoading) return;
    if (!isSyncSupported) {
      setDataError("当前平台暂不支持数据同步，目前支持抖音、小红书、快手");
      return;
    }
    setSyncLoading(true);
    setDataError(null);
    try {
      const syncDays = activePlatform === "kuaishou" ? 365 : 30;
      const result = await syncCreatorData(activePlatform, syncDays, true);
      if (result.success) {
        // 同步成功后先清除旧缓存，再写入新数据
        clearCreatorCache(activePlatform);

        const newOverview = result.overview ? {
          ...result.overview,
          platformColor: activeConnector?.color ?? "",
          platformName: result.overview.platformName || activeConnector?.name || activePlatform,
        } : null;
        const newWorks = result.works && result.works.length > 0 ? result.works : rawWorks;
        const newTrend = result.trendData && result.trendData.length > 0 ? result.trendData : trendData;
        const newFan = result.fanProfile ?? fanProfile;

        // 写入全局缓存（切换页面后回来不需重新请求）
        setCreatorCache(activePlatform, {
          overview: newOverview,
          works: newWorks as unknown as WorkItem[],
          fanProfile: newFan as unknown as FanProfile | null,
          trendData: newTrend as unknown as TrendDataPoint[],
          cachedAt: Date.now(),
        });

        if (newOverview) setOverview(newOverview as unknown as AccountOverview);
        if (newWorks !== rawWorks) setRawWorks(newWorks as unknown as WorkItem[]);
        if (newTrend !== trendData) setTrendData(newTrend as unknown as TrendDataPoint[]);
        if (newFan !== fanProfile) setFanProfile(newFan as unknown as FanProfile | null);
        setHasSynced(true);

        if (result.overview?.followers) {
          const f = result.overview.followers;
          const scale = f < 10000 ? "0-1w" as const
            : f < 100000 ? "1w-10w" as const
            : f < 1000000 ? "10w-100w" as const
            : "100w+" as const;
          updateUserProfile({ followerScale: scale });
        }
      } else {
        setDataError(result.error || "同步失败，请稍后重试");
      }
    } catch (err) {
      console.error("[CreatorCenter] sync error:", err);
      setDataError("同步失败，请检查账号连接状态");
    } finally {
      setSyncLoading(false);
    }
  }, [activePlatform, syncLoading, activeConnector, updateUserProfile, isSyncSupported, rawWorks, trendData, fanProfile, clearCreatorCache, setCreatorCache]);

  // 排序后的作品列表
  const allSortedWorks = useMemo(() => {
    const sorted = [...rawWorks];
    if (workSort !== "time") {
      sorted.sort((a, b) => ((b as any)[workSort] ?? 0) - ((a as any)[workSort] ?? 0));
    }
    return sorted;
  }, [rawWorks, workSort]);

  // 分页后的作品列表
  const totalWorksPages = Math.ceil(allSortedWorks.length / WORKS_PAGE_SIZE);
  const works = useMemo(() => {
    const start = (worksPage - 1) * WORKS_PAGE_SIZE;
    return allSortedWorks.slice(start, start + WORKS_PAGE_SIZE);
  }, [allSortedWorks, worksPage, WORKS_PAGE_SIZE]);

  const platformMetrics = useMemo(() => getPlatformMetrics(activePlatform), [activePlatform]);
  const sortOptions = useMemo(() => getWorkSortOptions(activePlatform), [activePlatform]);

  const trendMetrics = useMemo(() => {
    return platformMetrics.filter((m) => m.key !== "engagement" && m.key !== "followers");
  }, [platformMetrics]);

  const trendColorMap: Record<string, string> = {
    followers: "#3b82f6",
    views: "#0ea5e9",
    reads: "#0ea5e9",
    likes: "#ef4444",
    comments: "#22c55e",
    shares: "#a855f7",
    collects: "#f59e0b",
    coins: "#f59e0b",
    favorites: "#f97316",
    reposts: "#0ea5e9",
    voteups: "#3b82f6",
  };

  const mapComment = (c: APICommentItem): CommentItem => ({
    id: c.id,
    author: c.author,
    authorAvatar: c.authorAvatar,
    content: c.content,
    likes: c.likes,
    replyCount: c.replyCount,
    createdAt: c.createdAt,
    sentiment: c.sentiment,
    isAuthorReply: c.isAuthorReply,
  });

  const handleWorkClick = useCallback(async (work: WorkItem) => {
    const detail: WorkDetail = {
      ...work,
      description: `这是一条关于「${work.title.slice(0, 10)}…」的详细内容描述。`,
      tags: work.tags || [],
      trafficSources: work.trafficSources,
      audienceGender: work.audienceGender,
      audienceAge: work.audienceAge,
      commentList: [],
      commentsLoading: true,
      commentPage: 1,
      commentHasMore: false,
      commentNextCursor: null,
      commentTotal: 0,
      commentTotalPages: 1,
      commentLoadingMore: false,
    };
    setSelectedWork(detail);

    try {
      const result = await fetchWorkComments(work.id, activePlatform, { page: 1, pageSize: 20 });
      const mapped = result.comments.map(mapComment);
      setSelectedWork((prev) => prev ? {
        ...prev,
        commentList: mapped,
        commentsLoading: false,
        commentPage: result.page,
        commentTotalPages: result.totalPages,
        commentTotal: result.total,
        commentHasMore: result.hasMore,
        commentNextCursor: result.nextCursor,
      } : prev);
    } catch (err) {
      console.error("[CreatorCenter] fetch comments error:", err);
      setSelectedWork((prev) => prev ? { ...prev, commentList: [], commentsLoading: false } : prev);
    }
  }, [activePlatform]);

  const handleLoadMoreComments = useCallback(async () => {
    if (!selectedWork || selectedWork.commentLoadingMore) return;
    setSelectedWork((prev) => prev ? { ...prev, commentLoadingMore: true } : prev);
    try {
      const nextPage = (selectedWork.commentPage ?? 1) + 1;
      const result = await fetchWorkComments(
        selectedWork.id,
        activePlatform,
        {
          cursor: selectedWork.commentNextCursor ?? 0,
          page: nextPage,
          pageSize: 20,
        },
      );
      const newComments = result.comments.map(mapComment);
      setSelectedWork((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.commentList.map((c) => c.id));
        const unique = newComments.filter((c) => !existingIds.has(c.id));
        return {
          ...prev,
          commentList: [...prev.commentList, ...unique],
          commentLoadingMore: false,
          commentPage: result.page,
          commentTotalPages: result.totalPages,
          commentTotal: result.total,
          commentHasMore: result.hasMore,
          commentNextCursor: result.nextCursor,
        };
      });
    } catch (err) {
      console.error("[CreatorCenter] load more comments error:", err);
      setSelectedWork((prev) => prev ? { ...prev, commentLoadingMore: false } : prev);
    }
  }, [selectedWork, activePlatform]);

  const handleAiSummarize = useCallback(async () => {
    if (!selectedWork) return;
    setAiLoading(true);
    setSelectedWork((prev) => prev ? { ...prev, analysisLoading: true } : prev);
    try {
      const analysis = await analyzeWorkComments(selectedWork.id, selectedWork.title, activePlatform);
      setSelectedWork((prev) => prev ? { ...prev, commentAnalysis: analysis, analysisLoading: false } : prev);
    } catch (err) {
      console.error("[CreatorCenter] analyze comments error:", err);
      setSelectedWork((prev) => prev ? { ...prev, analysisLoading: false } : prev);
    } finally {
      setAiLoading(false);
    }
  }, [selectedWork, activePlatform]);

  const handlePlatformSelect = useCallback((id: string) => {
    setSelectedPlatform(id);
    setWorkSort("time");
    setActiveSection("overview");
  }, []);

  /* ── 前置校验：未绑定账号 ── */
  if (connected.length === 0) {
    return <NoConnectorGuide onNavigate={() => navigate("/connectors")} />;
  }

  const platformMeta = PLATFORM_PREDICTION_META[activePlatform];
  const capabilities = platformMeta?.capabilities;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">创作中心</h1>
        <p className="mt-1 text-xs text-gray-500">
          查看已绑定账号的数据概览、作品表现和粉丝画像
        </p>
      </div>

      {/* 平台选择器 */}
      {connected.length > 1 && (
        <div className="mb-6">
          <PlatformSelector connectors={connected} selected={activePlatform} onSelect={handlePlatformSelect} />
        </div>
      )}

      {/* 账号头部信息 */}
      {overview && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200">
            <User className="h-7 w-7 text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">{overview.handle as string}</h2>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: overview.platformColor as string }}>
                {overview.platformName as string}
              </span>
              {capabilities?.supportsCookieAnalytics && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">
                  深度分析
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              共 {overview.totalWorks ?? 0} 个作品 · 互动率 {overview.avgEngagementRate ?? 0}%
              {typeof overview.engagementRateChange === "number" && overview.engagementRateChange !== 0 && (
                <span className={`ml-1 ${overview.engagementRateChange >= 0 ? "text-green-600" : "text-red-500"}`}>
                  ({overview.engagementRateChange >= 0 ? "+" : ""}{overview.engagementRateChange}%)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!hasSynced && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">示例数据</span>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={syncLoading || !isSyncSupported}
              title={!isSyncSupported ? "当前平台暂不支持数据同步" : ""}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncLoading ? "animate-spin" : ""}`} />
              {syncLoading ? "同步中..." : !isSyncSupported ? "API接入中" : "同步数据"}
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {dataError && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
          {dataError}
        </div>
      )}

      {/* 加载中 */}
      {dataLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          正在加载数据...
        </div>
      )}

      {/* 未同步提示 */}
      {!hasSynced && !dataLoading && !syncLoading && overview && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-700">
            还没有同步过数据，点击上方「同步数据」按钮开始获取账号真实数据。
            {!isSyncSupported && (
              <span className="ml-1 text-amber-500">
                （当前平台数据同步API正在接入中）
              </span>
            )}
          </p>
        </div>
      )}

      {/* Section Tab */}
      <div className="mb-6 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
        {(
          [
            { key: "overview", label: "数据概览", icon: BarChart3 },
            { key: "works", label: "作品管理", icon: Play },
            { key: "fans", label: "粉丝画像", icon: Users },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all ${
                activeSection === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 数据概览 Section */}
      {activeSection === "overview" && overview && (
        <div className="space-y-6">
          {!hasSynced && !isSyncSupported && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-700">
                当前平台的数据同步功能正在开发中，以下指标暂时显示为初始值。抖音平台已支持实时数据同步。
              </p>
            </div>
          )}
          {!hasSynced && isSyncSupported && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700">
                还未同步过数据，点击上方「同步数据」按钮获取最新的账号数据和作品列表。
              </p>
            </div>
          )}

          {/* 核心指标卡片 */}
          <div className={`grid gap-4 ${platformMetrics.length <= 5 ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-6"}`}>
            {platformMetrics.map((metric) => {
              const rawVal = overview[metric.valueKey];
              const rawChange = overview[metric.changeKey];
              const val = typeof rawVal === "number" && !isNaN(rawVal) ? rawVal : 0;
              const change = typeof rawChange === "number" && !isNaN(rawChange) ? rawChange : 0;
              const isPercentage = metric.key === "engagement";
              return (
                <MetricCard
                  key={metric.key}
                  icon={metric.icon}
                  label={metric.label}
                  value={isPercentage ? `${val}%` : formatNumber(val)}
                  change={change}
                  changeLabel={isPercentage ? `${change >= 0 ? "+" : ""}${change}%` : formatChange(change)}
                  color={metric.color}
                  isPercentage={isPercentage}
                />
              );
            })}
          </div>

          {/* 趋势图 */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-800">数据趋势</h3>
            <div className={`grid gap-4 ${trendMetrics.length <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {trendMetrics.map((metric) => (
                <MiniTrendChart
                  key={metric.key}
                  data={trendData}
                  dataKey={metric.key}
                  color={trendColorMap[metric.key] || "#6b7280"}
                  label={metric.label.replace("总", "") + "趋势"}
                />
              ))}
            </div>
          </div>

          {/* 近期热门作品 */}
          <div>
            {(() => {
              const sortByEngagement = (list: typeof works) =>
                [...list].sort((a, b) => {
                  const engA = (a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0) + (a.collects ?? 0);
                  const engB = (b.likes ?? 0) + (b.comments ?? 0) + (b.shares ?? 0) + (b.collects ?? 0);
                  return engB - engA;
                });

              const windowMonths = [3, 6, 12];
              let hotWorks: typeof allSortedWorks = [];
              let usedWindow = "全部";

              for (const months of windowMonths) {
                const cutoff = new Date();
                cutoff.setMonth(cutoff.getMonth() - months);
                const filtered = allSortedWorks.filter((w) => {
                  if (!w.publishedAt) return false;
                  return new Date(w.publishedAt) >= cutoff;
                });
                if (filtered.length >= 3) {
                  hotWorks = sortByEngagement(filtered).slice(0, 3);
                  usedWindow = `近 ${months} 个月`;
                  break;
                }
              }

              if (hotWorks.length === 0) {
                hotWorks = sortByEngagement(allSortedWorks).slice(0, 3);
                usedWindow = "全部";
              }

              return (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-800">近期热门作品 <span className="ml-1 text-xs font-normal text-gray-400">{usedWindow} Top 3</span></h3>
                    <button
                      type="button"
                      onClick={() => setActiveSection("works")}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      查看全部
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {hotWorks.length === 0 ? (
                      <div className="col-span-full rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                        暂无作品数据
                      </div>
                    ) : (
                      hotWorks.map((work) => (
                        <WorkCardGrid key={work.id} work={work} platformId={activePlatform} onClick={() => handleWorkClick(work)} />
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 作品管理 Section */}
      {activeSection === "works" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">共 {allSortedWorks.length} 个作品{totalWorksPages > 1 ? ` · 第 ${worksPage}/${totalWorksPages} 页` : ""}</span>
            <div className="flex items-center gap-1">
              {sortOptions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setWorkSort(s.key); setWorksPage(1); }}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors ${
                    workSort === s.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {works.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {works.map((work) => (
                <WorkCardGrid key={work.id} work={work} platformId={activePlatform} onClick={() => handleWorkClick(work)} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
              <Play className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">暂无作品数据</p>
              <p className="mt-1 text-xs text-gray-300">
                {isSyncSupported ? "点击上方「同步数据」获取你的作品列表" : "当前平台数据同步API正在接入中"}
              </p>
            </div>
          )}

          {/* 分页控件 */}
          {totalWorksPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={worksPage <= 1}
                onClick={() => setWorksPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              {Array.from({ length: Math.min(totalWorksPages, 7) }, (_, i) => {
                let page: number;
                if (totalWorksPages <= 7) {
                  page = i + 1;
                } else if (worksPage <= 4) {
                  page = i + 1;
                } else if (worksPage >= totalWorksPages - 3) {
                  page = totalWorksPages - 6 + i;
                } else {
                  page = worksPage - 3 + i;
                }
                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setWorksPage(page)}
                    className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                      worksPage === page
                        ? "bg-gray-900 text-white"
                        : "border border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={worksPage >= totalWorksPages}
                onClick={() => setWorksPage((p) => Math.min(totalWorksPages, p + 1))}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 粉丝画像 Section */}
      {activeSection === "fans" && (
        fanProfile ? (
          <FanProfileSection profile={fanProfile} />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">暂无粉丝画像数据</p>
            <p className="mt-1 text-xs text-gray-300">
              {isSyncSupported ? "同步数据后可查看粉丝画像分析" : "当前平台粉丝画像功能API正在接入中"}
            </p>
          </div>
        )
      )}

      {/* 底部说明 */}
      <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50/50 px-5 py-4">
        <p className="mb-2 text-xs font-medium text-gray-600">关于创作中心</p>
        <ul className="space-y-1 text-[11px] text-gray-400">
          <li>· 数据每次打开页面时自动同步，也可手动点击「同步数据」刷新</li>
          <li>· 点击作品卡片可查看详细数据，包括完播率、流量来源和受众画像</li>
          <li>· AI 评论总结功能会消耗 5 积分，自动分析评论区情绪和关键词</li>
          <li>· 不同平台展示的数据指标有所不同，取决于平台接口能力</li>
          <li>· 如需监控账号数据变化，可前往「智能监控」创建账号监控任务</li>
        </ul>
      </div>

      {/* 作品详情弹窗 */}
      {selectedWork && (
        <WorkDetailModal
          detail={selectedWork}
          platformId={activePlatform}
          onClose={() => setSelectedWork(null)}
          onAiSummarize={handleAiSummarize}
          onLoadMoreComments={handleLoadMoreComments}
          aiLoading={aiLoading}
        />
      )}
    </div>
  );
}
