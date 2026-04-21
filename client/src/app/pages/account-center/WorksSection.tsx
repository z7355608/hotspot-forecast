// account-center/WorksSection.tsx — Work card grid, video player, and work detail modal

import { useState, useRef } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  Coins,
  Eye,
  Heart,
  MessageCircle,
  Play,
  RefreshCw,
  Repeat2,
  Share2,
  Sparkles,
  ThumbsUp,
  User,
  X,
} from "lucide-react";
import type { WorkItem, WorkDetail, CommentItem } from "./types";
import { formatNumber, formatDate } from "./types";

// ─── WorkCardGrid ───────────────────────────────────────────────────

export function WorkCardGrid({
  work,
  platformId,
  onClick,
}: {
  work: WorkItem;
  platformId: string;
  onClick: () => void;
}) {
  const getWorkMetrics = () => {
    const metrics: { icon: typeof Heart; value: string; label: string }[] = [];

    if (work.views !== undefined && work.views > 0) {
      metrics.push({ icon: Eye, value: formatNumber(work.views), label: "播放" });
    }
    if (work.reads !== undefined) {
      metrics.push({ icon: Eye, value: formatNumber(work.reads), label: "阅读" });
    }
    if (work.likes !== undefined) {
      metrics.push({ icon: Heart, value: formatNumber(work.likes), label: "点赞" });
    }
    if (work.voteups !== undefined) {
      metrics.push({ icon: ThumbsUp, value: formatNumber(work.voteups), label: "赞同" });
    }
    if (work.comments !== undefined) {
      metrics.push({ icon: MessageCircle, value: formatNumber(work.comments), label: "评论" });
    }
    if (work.collects !== undefined) {
      metrics.push({ icon: Bookmark, value: formatNumber(work.collects), label: "收藏" });
    }
    if (work.coins !== undefined) {
      metrics.push({ icon: Coins, value: formatNumber(work.coins), label: "投币" });
    }
    if (work.favorites !== undefined) {
      metrics.push({ icon: Bookmark, value: formatNumber(work.favorites), label: "收藏" });
    }
    if (work.reposts !== undefined) {
      metrics.push({ icon: Repeat2, value: formatNumber(work.reposts), label: "转发" });
    }
    if (work.shares !== undefined && !["bilibili"].includes(platformId)) {
      metrics.push({ icon: Share2, value: formatNumber(work.shares), label: "分享" });
    }

    return metrics.slice(0, 4);
  };

  const metrics = getWorkMetrics();

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:border-gray-300 hover:shadow-md"
    >
      {/* 封面 */}
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {work.coverUrl ? (
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(work.coverUrl)}`}
            alt={work.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div className={`absolute inset-0 flex items-center justify-center ${work.coverUrl ? "hidden" : ""}`}>
          {work.type === "video" ? (
            <Play className="h-8 w-8 text-gray-300" />
          ) : (
            <BookOpen className="h-7 w-7 text-gray-300" />
          )}
        </div>
        {work.isHot && (
          <span className="absolute right-2 top-2 rounded-md bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
            HOT
          </span>
        )}
        {work.type === "video" && work.avgWatchDuration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
            {Math.floor(work.avgWatchDuration / 60)}:{String(work.avgWatchDuration % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* 内容 */}
      <div className="flex flex-1 flex-col p-3">
        <h4 className="mb-2 line-clamp-2 text-xs font-medium leading-relaxed text-gray-800 group-hover:text-gray-900">
          {work.title}
        </h4>
        <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex items-center gap-1 text-[10px] text-gray-500">
                <Icon className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{m.value}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-gray-400">{formatDate(work.publishedAt)}</p>
      </div>
    </button>
  );
}

// ─── VideoPlayer ────────────────────────────────────────────────────

export function VideoPlayer({ awemeId, coverUrl }: { awemeId: string; coverUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const proxyUrl = `/api/video-proxy?aweme_id=${encodeURIComponent(awemeId)}`;
  const proxiedCover = coverUrl
    ? `/api/image-proxy?url=${encodeURIComponent(coverUrl)}`
    : undefined;

  const handlePlay = () => {
    setLoading(true);
    setError(null);
    setPlaying(true);
  };

  const handleVideoCanPlay = () => {
    setLoading(false);
    videoRef.current?.play().catch(() => {});
  };

  const handleVideoError = () => {
    setLoading(false);
    setError("视频加载失败，请稍后重试");
    setPlaying(false);
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16/9" }}>
      {!playing ? (
        <div className="relative h-full w-full cursor-pointer" onClick={handlePlay}>
          {proxiedCover ? (
            <img
              src={proxiedCover}
              alt="视频封面"
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
              <Play className="h-8 w-8 text-gray-500" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
              <Play className="ml-1 h-6 w-6 text-gray-900" fill="currentColor" />
            </div>
          </div>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1">
            <Play className="h-3 w-3 text-white" fill="white" />
            <span className="text-[10px] font-medium text-white">点击播放</span>
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-white/60" />
                <span className="text-xs text-white/60">视频加载中...</span>
              </div>
            </div>
          )}
          {error ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black">
              <X className="h-6 w-6 text-red-400" />
              <span className="text-xs text-red-400">{error}</span>
              <button
                type="button"
                onClick={() => { setPlaying(false); setError(null); }}
                className="mt-1 rounded-lg bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
              >
                重试
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={proxyUrl}
              controls
              playsInline
              className="h-full w-full object-contain"
              onCanPlay={handleVideoCanPlay}
              onError={handleVideoError}
              poster={proxiedCover}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── WorkDetailModal ────────────────────────────────────────────────

export function WorkDetailModal({
  detail,
  platformId: _platformId,
  onClose,
  onAiSummarize,
  onLoadMoreComments,
  aiLoading,
}: {
  detail: WorkDetail;
  platformId: string;
  onClose: () => void;
  onAiSummarize: () => void;
  onLoadMoreComments: () => void;
  aiLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "comments" | "audience">("overview");
  const hasAudience = detail.audienceGender !== undefined;

  const getDetailMetrics = () => {
    const metrics: { icon: typeof Heart; value: string; label: string; color: string }[] = [];
    if (detail.views !== undefined && detail.views > 0) metrics.push({ icon: Eye, value: formatNumber(detail.views), label: "播放量", color: "text-blue-500" });
    if (detail.reads !== undefined) metrics.push({ icon: Eye, value: formatNumber(detail.reads), label: "阅读量", color: "text-blue-500" });
    if (detail.likes !== undefined) metrics.push({ icon: Heart, value: formatNumber(detail.likes), label: "点赞", color: "text-red-500" });
    if (detail.voteups !== undefined) metrics.push({ icon: ThumbsUp, value: formatNumber(detail.voteups), label: "赞同", color: "text-blue-500" });
    if (detail.comments !== undefined) metrics.push({ icon: MessageCircle, value: formatNumber(detail.comments), label: "评论", color: "text-green-500" });
    if (detail.collects !== undefined) metrics.push({ icon: Bookmark, value: formatNumber(detail.collects), label: "收藏", color: "text-amber-500" });
    if (detail.coins !== undefined) metrics.push({ icon: Coins, value: formatNumber(detail.coins), label: "投币", color: "text-amber-500" });
    if (detail.favorites !== undefined) metrics.push({ icon: Bookmark, value: formatNumber(detail.favorites), label: "收藏", color: "text-orange-500" });
    if (detail.reposts !== undefined) metrics.push({ icon: Repeat2, value: formatNumber(detail.reposts), label: "转发", color: "text-sky-500" });
    if (detail.shares !== undefined) metrics.push({ icon: Share2, value: formatNumber(detail.shares), label: "分享", color: "text-purple-500" });
    return metrics;
  };

  const detailMetrics = getDetailMetrics();
  const tabs = [
    { key: "overview" as const, label: "数据概览" },
    { key: "comments" as const, label: "评论分析" },
    ...(hasAudience ? [{ key: "audience" as const, label: "受众画像" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-gray-900">{detail.title}</h3>
            <p className="mt-0.5 text-xs text-gray-400">{formatDate(detail.publishedAt)} 发布</p>
          </div>
          <button type="button" onClick={onClose} className="ml-4 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {detail.type === "video" && (
                <VideoPlayer awemeId={detail.id} coverUrl={detail.coverUrl} />
              )}

              <div className={`grid gap-3 ${detailMetrics.length <= 4 ? "grid-cols-4" : detailMetrics.length <= 6 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3"}`}>
                {detailMetrics.map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.label} className="rounded-lg bg-gray-50 p-3 text-center">
                      <Icon className={`mx-auto mb-1 h-4 w-4 ${m.color}`} />
                      <p className="text-lg font-semibold text-gray-900">{m.value}</p>
                      <p className="text-[10px] text-gray-500">{m.label}</p>
                    </div>
                  );
                })}
              </div>

              {detail.completionRate !== undefined && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="mb-2 text-xs text-gray-500">完播率</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-gray-900">{detail.completionRate}%</span>
                      <span className={`mb-1 text-xs ${detail.completionRate >= 40 ? "text-green-600" : "text-amber-600"}`}>
                        {detail.completionRate >= 40 ? "高于平均" : "低于平均"}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full transition-all ${detail.completionRate >= 40 ? "bg-green-400" : "bg-amber-400"}`} style={{ width: `${detail.completionRate}%` }} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="mb-2 text-xs text-gray-500">平均观看时长</p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-gray-900">{detail.avgWatchDuration}s</span>
                    </div>
                  </div>
                </div>
              )}

              {detail.trafficSources && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="mb-3 text-xs font-medium text-gray-600">流量来源</p>
                  <div className="space-y-2">
                    {detail.trafficSources.map((src) => (
                      <div key={src.source} className="flex items-center gap-2">
                        <span className="w-14 text-[10px] text-gray-500">{src.source}</span>
                        <div className="flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${src.percentage}%` }} />
                          </div>
                        </div>
                        <span className="w-8 text-right text-[10px] font-medium text-gray-600">{src.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-gray-600">内容标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] text-gray-600">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "comments" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-800">AI 评论深度分析</span>
                  </div>
                  {!detail.commentAnalysis && (
                    <button
                      type="button"
                      onClick={onAiSummarize}
                      disabled={aiLoading || detail.commentsLoading || detail.commentList.length === 0}
                      className="flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          分析中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          生成 AI 分析
                          <span className="ml-1 text-amber-500">5 积分</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                {detail.commentAnalysis ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-green-50 p-2 text-center">
                        <p className="text-lg font-bold text-green-600">{detail.commentAnalysis.positiveRatio}%</p>
                        <p className="text-[10px] text-green-500">正面 ({detail.commentAnalysis.positiveCount})</p>
                      </div>
                      <div className="rounded-lg bg-gray-100 p-2 text-center">
                        <p className="text-lg font-bold text-gray-600">{Math.round(100 - detail.commentAnalysis.positiveRatio - detail.commentAnalysis.negativeRatio)}%</p>
                        <p className="text-[10px] text-gray-500">中性 ({detail.commentAnalysis.neutralCount})</p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-2 text-center">
                        <p className="text-lg font-bold text-red-500">{detail.commentAnalysis.negativeRatio}%</p>
                        <p className="text-[10px] text-red-400">负面 ({detail.commentAnalysis.negativeCount})</p>
                      </div>
                    </div>
                    {detail.commentAnalysis.highFreqKeywords.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium text-amber-700">高频关键词</p>
                        <div className="flex flex-wrap gap-1">
                          {detail.commentAnalysis.highFreqKeywords.map((kw) => (
                            <span key={kw} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">#{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {detail.commentAnalysis.demandSignals.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium text-amber-700">用户需求信号</p>
                        <div className="space-y-1">
                          {detail.commentAnalysis.demandSignals.map((sig) => (
                            <div key={sig} className="flex items-start gap-1.5 text-xs text-amber-800/80">
                              <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                              {sig}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {detail.commentAnalysis.aiSummary && (
                      <div className="rounded-lg bg-white/60 p-3">
                        <p className="mb-1 text-[10px] font-medium text-amber-700">AI 综合分析</p>
                        <p className="text-xs leading-relaxed text-amber-900/80">{detail.commentAnalysis.aiSummary}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600/60">
                    {detail.commentsLoading
                      ? "正在拉取评论数据..."
                      : detail.commentList.length === 0
                      ? "暂无评论数据，无法分析"
                      : "点击「生成 AI 分析」，AI 将自动分析评论区情感分布、高频关键词、用户需求信号和运营建议。"}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">
                    {detail.commentsLoading ? "评论加载中..." : `评论列表（${detail.commentList.length}${detail.commentTotal && detail.commentTotal > detail.commentList.length ? ` / ${detail.commentTotal}` : ""}）`}
                  </span>
                  {detail.commentList.length > 0 && (
                    <div className="flex gap-1">
                      {(["all", "positive", "neutral", "negative"] as const).map((s) => {
                        const labels = { all: "全部", positive: "正面", neutral: "中性", negative: "负面" };
                        const colors = {
                          all: "bg-gray-100 text-gray-600",
                          positive: "bg-green-50 text-green-600",
                          neutral: "bg-gray-50 text-gray-500",
                          negative: "bg-red-50 text-red-500",
                        };
                        return (
                          <span key={s} className={`rounded-full px-2 py-0.5 text-[10px] ${colors[s]}`}>{labels[s]}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {detail.commentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-300" />
                    <span className="ml-2 text-xs text-gray-400">正在从抖音拉取真实评论...</span>
                  </div>
                ) : detail.commentList.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
                    <MessageCircle className="mx-auto mb-2 h-6 w-6 text-gray-300" />
                    <p className="text-xs text-gray-400">暂无评论数据</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.commentList.map((comment) => {
                      const sentimentColor = {
                        positive: "border-l-green-400",
                        neutral: "border-l-gray-300",
                        negative: "border-l-red-400",
                      };
                      return (
                        <div key={comment.id} className={`rounded-lg border border-gray-100 border-l-2 ${sentimentColor[comment.sentiment]} bg-gray-50/50 p-3`}>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {comment.authorAvatar ? (
                                <img src={`/api/image-proxy?url=${encodeURIComponent(comment.authorAvatar)}`} alt="" className="h-5 w-5 rounded-full object-cover" />
                              ) : (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200">
                                  <User className="h-3 w-3 text-gray-400" />
                                </div>
                              )}
                              <span className="text-xs font-medium text-gray-700">
                                {comment.author}
                                {comment.isAuthorReply && (
                                  <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[9px] text-blue-600">作者</span>
                                )}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400">{comment.createdAt}</span>
                          </div>
                          <p className="text-xs text-gray-600">{comment.content}</p>
                          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-400">
                            <div className="flex items-center gap-1">
                              <Heart className="h-2.5 w-2.5" />
                              {comment.likes}
                            </div>
                            {comment.replyCount > 0 && (
                              <div className="flex items-center gap-1">
                                <MessageCircle className="h-2.5 w-2.5" />
                                {comment.replyCount} 回复
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {detail.commentHasMore && (
                      <button
                        type="button"
                        onClick={onLoadMoreComments}
                        disabled={detail.commentLoadingMore}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        {detail.commentLoadingMore ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            加载中...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" />
                            加载更多评论
                            {detail.commentTotal && detail.commentTotal > detail.commentList.length && (
                              <span className="text-gray-400">（还有 {detail.commentTotal - detail.commentList.length} 条）</span>
                            )}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "audience" && detail.audienceGender && detail.audienceAge && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="mb-3 text-xs font-medium text-gray-600">观众性别</p>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-pink-600">女性</span>
                      <span className="font-medium">{detail.audienceGender.female}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-pink-400" style={{ width: `${detail.audienceGender.female}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-blue-600">男性</span>
                      <span className="font-medium">{detail.audienceGender.male}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${detail.audienceGender.male}%` }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="mb-3 text-xs font-medium text-gray-600">观众年龄</p>
                <div className="space-y-2">
                  {detail.audienceAge.map((item) => (
                    <div key={item.range} className="flex items-center gap-2">
                      <span className="w-14 text-[10px] text-gray-500">{item.range}</span>
                      <div className="flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-violet-400" style={{ width: `${item.percentage * 2.5}%` }} />
                        </div>
                      </div>
                      <span className="w-8 text-right text-[10px] font-medium text-gray-600">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
