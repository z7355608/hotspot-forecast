import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Plus,
  Trash2,
  RefreshCw,
  Target,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface PerformanceCheckpoint {
  checkpoint: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  collectedAt: string;
}

interface PublishedContentItem {
  id: number;
  userOpenId: string;
  platform: string;
  contentId: string | null;
  contentUrl: string | null;
  publishedTitle: string | null;
  directionName: string | null;
  strategySessionId: string | null;
  predictedScore: number | null;
  publishedAt: string;
  performanceData: PerformanceCheckpoint[];
}

interface AccuracyItem {
  publishedContentId: number;
  directionName: string | null;
  platform: string;
  publishedTitle: string | null;
  predictedScore: number | null;
  actualScore: number;
  accuracy: number;
  latestPerformance: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    collectCount: number;
  } | null;
}

interface AccuracyResult {
  items: AccuracyItem[];
  overallAccuracy: number;
  totalItems: number;
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                         */
/* ------------------------------------------------------------------ */

async function fetchPublishedContent(): Promise<PublishedContentItem[]> {
  const resp = await apiFetch("/api/published-content?limit=50");
  if (!resp.ok) throw new Error("获取已发布内容失败");
  const data = await resp.json();
  return data.items ?? [];
}

async function deletePublishedContent(id: number): Promise<void> {
  const resp = await apiFetch(`/api/published-content/${id}`, { method: "DELETE" });
  if (!resp.ok) throw new Error("删除失败");
}

async function fetchAccuracy(): Promise<AccuracyResult> {
  const resp = await apiFetch("/api/prediction-accuracy");
  if (!resp.ok) throw new Error("获取准确率失败");
  return resp.json();
}

async function triggerCollection(): Promise<{ scanned: number; collected: number; errors: number }> {
  const resp = await apiFetch("/api/performance-collection/trigger", { method: "POST" });
  if (!resp.ok) throw new Error("触发采集失败");
  return resp.json();
}

interface DirectionFeedback {
  directionName: string;
  platform: string;
  publishCount: number;
  avgPredictedScore: number;
  avgActualScore: number;
  accuracy: number;
  bestTitle: string | null;
  bestActualScore: number;
  worstTitle: string | null;
  worstActualScore: number;
  trend: "improving" | "declining" | "stable";
}

interface HistoricalFeedback {
  track: string;
  totalPublished: number;
  overallAccuracy: number;
  directionFeedbacks: DirectionFeedback[];
  topDirections: string[];
  weakDirections: string[];
  platformComparison: Array<{
    platform: string;
    avgActualScore: number;
    publishCount: number;
  }>;
  feedbackContext: string;
}

async function fetchHistoricalFeedback(): Promise<HistoricalFeedback | null> {
  const resp = await apiFetch("/api/historical-feedback");
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || data.totalPublished === 0) return null;
  return data;
}

async function createPublishedContent(body: {
  platform: string;
  contentId?: string;
  contentUrl?: string;
  publishedTitle?: string;
  directionName?: string;
  predictedScore?: number;
}): Promise<{ id: number }> {
  const resp = await apiFetch("/api/published-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error("标记发布失败");
  return resp.json();
}

/* ------------------------------------------------------------------ */
/*  Helper                                                              */
/* ------------------------------------------------------------------ */

const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  kuaishou: "快手",
};

const PLATFORM_COLORS: Record<string, string> = {
  douyin: "bg-gray-900 text-white",
  xiaohongshu: "bg-red-500 text-white",
  kuaishou: "bg-orange-500 text-white",
};

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "text-green-600";
  if (accuracy >= 60) return "text-amber-600";
  return "text-red-600";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-50";
  if (score >= 40) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

/* ------------------------------------------------------------------ */
/*  Add Published Content Dialog                                        */
/* ------------------------------------------------------------------ */

function AddPublishedDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [platform, setPlatform] = useState("douyin");
  const [contentUrl, setContentUrl] = useState("");
  const [publishedTitle, setPublishedTitle] = useState("");
  const [directionName, setDirectionName] = useState("");
  const [predictedScore, setPredictedScore] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!platform) {
      toast.error("请选择平台");
      return;
    }
    setSubmitting(true);
    try {
      await createPublishedContent({
        platform,
        contentUrl: contentUrl || undefined,
        publishedTitle: publishedTitle || undefined,
        directionName: directionName || undefined,
        predictedScore: predictedScore ? Number(predictedScore) : undefined,
      });
      toast.success("已标记为已发布");
      onSuccess();
      onClose();
      // Reset form
      setContentUrl("");
      setPublishedTitle("");
      setDirectionName("");
      setPredictedScore("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "标记失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">标记内容已发布</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">平台</label>
            <div className="flex gap-2">
              {(["douyin", "xiaohongshu", "kuaishou"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    platform === p
                      ? PLATFORM_COLORS[p]
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">内容链接</label>
            <input
              type="url"
              value={contentUrl}
              onChange={(e) => setContentUrl(e.target.value)}
              placeholder="粘贴视频/笔记链接"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">标题</label>
            <input
              type="text"
              value={publishedTitle}
              onChange={(e) => setPublishedTitle(e.target.value)}
              placeholder="内容标题"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">选题方向（可选）</label>
            <input
              type="text"
              value={directionName}
              onChange={(e) => setDirectionName(e.target.value)}
              placeholder="来自选题策略的方向名称"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">预测分（可选）</label>
            <input
              type="number"
              value={predictedScore}
              onChange={(e) => setPredictedScore(e.target.value)}
              placeholder="0-100"
              min="0"
              max="100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            标记已发布
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export function PerformancePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PublishedContentItem[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyResult | null>(null);
  const [feedback, setFeedback] = useState<HistoricalFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contentItems, accuracyData, feedbackData] = await Promise.all([
        fetchPublishedContent(),
        fetchAccuracy(),
        fetchHistoricalFeedback(),
      ]);
      setItems(contentItems);
      setAccuracy(accuracyData);
      setFeedback(feedbackData);
    } catch (err) {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除此记录？")) return;
    try {
      await deletePublishedContent(id);
      toast.success("已删除");
      loadData();
    } catch {
      toast.error("删除失败");
    }
  };

  const handleTriggerCollection = async () => {
    setCollecting(true);
    try {
      const result = await triggerCollection();
      toast.success(`采集完成：扫描 ${result.scanned} 项，采集 ${result.collected} 项`);
      loadData();
    } catch {
      toast.error("采集失败");
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">效果追踪</h1>
          <p className="mt-1 text-sm text-gray-500">
            追踪已发布内容的实际表现，验证预测准确性
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerCollection}
            disabled={collecting}
          >
            {collecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            采集数据
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            标记已发布
          </Button>
        </div>
      </div>

      {/* Accuracy Overview */}
      {accuracy && accuracy.totalItems > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">整体准确率</p>
                <p className={`text-2xl font-bold ${getAccuracyColor(accuracy.overallAccuracy)}`}>
                  {accuracy.overallAccuracy}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">已追踪内容</p>
                <p className="text-2xl font-bold text-gray-900">{accuracy.totalItems}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">已发布内容</p>
                <p className="text-2xl font-bold text-gray-900">{items.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 自进化洞察卡片 */}
      {feedback && (
        <Card className="mb-6 border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              自进化洞察
              <Badge variant="outline" className="ml-auto text-xs font-normal text-indigo-600">
                基于 {feedback.totalPublished} 条历史数据
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 表现最好的方向 */}
            {feedback.topDirections.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  表现优秀的方向
                </h4>
                <div className="space-y-1.5">
                  {feedback.directionFeedbacks
                    .filter((d) => feedback.topDirections.includes(d.directionName))
                    .map((d) => (
                      <div
                        key={`${d.directionName}-${d.platform}`}
                        className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${PLATFORM_COLORS[d.platform] ?? "bg-gray-200 text-gray-700"}`}>
                            {PLATFORM_LABELS[d.platform] ?? d.platform}
                          </Badge>
                          <span className="text-sm font-medium text-gray-800">{d.directionName}</span>
                          {d.trend === "improving" && (
                            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                          )}
                          {d.trend === "declining" && (
                            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>发布 {d.publishCount} 条</span>
                          <span className="font-medium text-green-600">实际分 {d.avgActualScore}</span>
                          <span>准确率 {d.accuracy}%</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 表现较差的方向 */}
            {feedback.weakDirections.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  需要调整的方向
                </h4>
                <div className="space-y-1.5">
                  {feedback.directionFeedbacks
                    .filter((d) => feedback.weakDirections.includes(d.directionName))
                    .map((d) => (
                      <div
                        key={`${d.directionName}-${d.platform}`}
                        className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${PLATFORM_COLORS[d.platform] ?? "bg-gray-200 text-gray-700"}`}>
                            {PLATFORM_LABELS[d.platform] ?? d.platform}
                          </Badge>
                          <span className="text-sm font-medium text-gray-800">{d.directionName}</span>
                          {d.trend === "declining" && (
                            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>发布 {d.publishCount} 条</span>
                          <span className="font-medium text-red-600">实际分 {d.avgActualScore}</span>
                          <span>准确率 {d.accuracy}%</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 平台对比 */}
            {feedback.platformComparison.length > 1 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Minus className="h-3.5 w-3.5" />
                  平台效果对比
                </h4>
                <div className="flex gap-3">
                  {feedback.platformComparison.map((pc) => (
                    <div
                      key={pc.platform}
                      className="flex-1 rounded-md bg-white/70 px-3 py-2 text-center"
                    >
                      <Badge className={`mb-1 text-xs ${PLATFORM_COLORS[pc.platform] ?? "bg-gray-200 text-gray-700"}`}>
                        {PLATFORM_LABELS[pc.platform] ?? pc.platform}
                      </Badge>
                      <p className="text-lg font-bold text-gray-900">{pc.avgActualScore}</p>
                      <p className="text-xs text-gray-500">{pc.publishCount} 条内容</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 自进化提示 */}
            <div className="rounded-md bg-indigo-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs text-indigo-700">
                <Brain className="h-3.5 w-3.5" />
                下次运行选题策略时，系统将自动基于以上历史效果数据调整方向推荐，优先推荐表现好的方向，避免重复推荐效果差的方向。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="mb-4 h-12 w-12 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">暂无已发布内容</h3>
            <p className="mb-6 max-w-sm text-center text-sm text-gray-500">
              在选题策略结果页中点击"标记已发布"，或在此页面手动添加，即可开始追踪内容效果
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              标记已发布
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Published Content List */}
      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => {
            const accuracyItem = accuracy?.items.find(
              (a) => a.publishedContentId === item.id,
            );
            const latestPerf = item.performanceData?.length
              ? item.performanceData[item.performanceData.length - 1]
              : null;

            return (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge
                          className={`text-xs ${PLATFORM_COLORS[item.platform] ?? "bg-gray-200 text-gray-700"}`}
                        >
                          {PLATFORM_LABELS[item.platform] ?? item.platform}
                        </Badge>
                        {item.directionName && (
                          <span className="truncate text-xs text-gray-500">
                            {item.directionName}
                          </span>
                        )}
                      </div>

                      <h4 className="mb-1 truncate text-sm font-medium text-gray-900">
                        {item.publishedTitle || "未命名内容"}
                      </h4>

                      <p className="text-xs text-gray-400">
                        发布于{" "}
                        {new Date(item.publishedAt).toLocaleDateString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {/* Performance Data */}
                      {latestPerf && (
                        <div className="mt-3 space-y-2">
                          {/* 核心数据网格 */}
                          <div className="grid grid-cols-5 gap-2">
                            {[
                              { icon: <Eye className="h-3.5 w-3.5" />, label: "播放", value: latestPerf.viewCount, color: "text-blue-600" },
                              { icon: <Heart className="h-3.5 w-3.5" />, label: "点赞", value: latestPerf.likeCount, color: "text-red-500" },
                              { icon: <MessageCircle className="h-3.5 w-3.5" />, label: "评论", value: latestPerf.commentCount, color: "text-amber-600" },
                              { icon: <Share2 className="h-3.5 w-3.5" />, label: "分享", value: latestPerf.shareCount, color: "text-green-600" },
                              { icon: <Bookmark className="h-3.5 w-3.5" />, label: "收藏", value: latestPerf.collectCount, color: "text-purple-600" },
                            ].map((metric) => (
                              <div key={metric.label} className="rounded-lg bg-gray-50 px-2 py-1.5 text-center">
                                <div className={`flex items-center justify-center gap-1 ${metric.color}`}>
                                  {metric.icon}
                                  <span className="text-xs font-semibold">{formatNumber(metric.value)}</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-gray-400">{metric.label}</p>
                              </div>
                            ))}
                          </div>
                          {/* 数据增长趋势（多个采集点时显示） */}
                          {item.performanceData.length > 1 && (() => {
                            const first = item.performanceData[0];
                            const last = item.performanceData[item.performanceData.length - 1];
                            const likeGrowth = last.likeCount - first.likeCount;
                            const viewGrowth = last.viewCount - first.viewCount;
                            const commentGrowth = last.commentCount - first.commentCount;
                            return (
                              <div className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-blue-50/50 to-green-50/50 px-3 py-2">
                                <span className="text-[10px] font-medium text-gray-500">增长趋势</span>
                                {viewGrowth > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-blue-600">
                                    <TrendingUp className="h-3 w-3" />
                                    播放 +{formatNumber(viewGrowth)}
                                  </span>
                                )}
                                {likeGrowth > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-red-500">
                                    <TrendingUp className="h-3 w-3" />
                                    点赞 +{formatNumber(likeGrowth)}
                                  </span>
                                )}
                                {commentGrowth > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-amber-600">
                                    <TrendingUp className="h-3 w-3" />
                                    评论 +{formatNumber(commentGrowth)}
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] text-gray-400">
                                  {item.performanceData.length} 次采集 · 最新 @{latestPerf.checkpoint}
                                </span>
                              </div>
                            );
                          })()}
                          {item.performanceData.length <= 1 && (
                            <p className="text-[10px] text-gray-400">
                              已采集 1 次 @{latestPerf.checkpoint}，等待下次采集后显示增长趋势
                            </p>
                          )}
                        </div>
                      )}

                      {!latestPerf && (
                        <p className="mt-3 text-xs text-gray-400">
                          等待数据采集（1h/6h/24h/72h/7d 自动采集）
                        </p>
                      )}
                    </div>

                    {/* Right: Scores + Actions */}
                    <div className="flex flex-col items-end gap-2">
                      {item.predictedScore != null && (
                        <div className="text-right">
                          <p className="text-xs text-gray-400">预测分</p>
                          <p
                            className={`rounded px-2 py-0.5 text-lg font-bold ${getScoreColor(item.predictedScore)}`}
                          >
                            {item.predictedScore}
                          </p>
                        </div>
                      )}

                      {accuracyItem && (
                        <div className="text-right">
                          <p className="text-xs text-gray-400">实际分</p>
                          <p
                            className={`rounded px-2 py-0.5 text-lg font-bold ${getScoreColor(accuracyItem.actualScore)}`}
                          >
                            {accuracyItem.actualScore}
                          </p>
                        </div>
                      )}

                      {accuracyItem && (
                        <p className={`text-xs font-medium ${getAccuracyColor(accuracyItem.accuracy)}`}>
                          准确率 {accuracyItem.accuracy}%
                        </p>
                      )}

                      <div className="flex gap-1">
                        {item.contentUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => window.open(item.contentUrl!, "_blank")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <AddPublishedDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
