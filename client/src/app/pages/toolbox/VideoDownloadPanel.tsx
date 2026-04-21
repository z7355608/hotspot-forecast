/**
 * 视频万能下载面板
 * 从 ToolboxPage.tsx 提取
 */
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Globe,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  Play,
  Share2,
  Sparkles,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ToolDef, VideoDownloadData } from "./toolbox-constants";
import { formatNumber } from "./toolbox-constants";
import { PlatformTags } from "./ToolboxShared";

/* ------------------------------------------------------------------ */
/*  VideoDownloadResult 子组件                                           */
/* ------------------------------------------------------------------ */

function VideoDownloadResult({
  result,
  onDownload,
  isDownloading,
}: {
  result: VideoDownloadData;
  onDownload: (url: string, filename: string) => void;
  isDownloading?: boolean;
}) {
  const [showAllUrls, setShowAllUrls] = useState(false);
  const publishDate = result.stats.publishTime
    ? new Date(result.stats.publishTime * 1000).toLocaleDateString("zh-CN")
    : null;

  return (
    <div className="space-y-4">
      {/* 视频信息卡片 */}
      <div className="overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="flex gap-4 p-4">
          {result.coverUrl ? (
            <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg">
              <img src={result.coverUrl} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="h-8 w-8 text-white drop-shadow-lg" fill="white" />
              </div>
            </div>
          ) : (
            <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-indigo-200">
              <Play className="h-10 w-10 text-blue-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="mb-2 line-clamp-2 text-sm font-semibold text-gray-900">{result.title}</h4>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5">
                <Globe className="h-3 w-3" />{result.platform}
              </span>
              {publishDate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />{publishDate}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              {result.stats.likeCount > 0 && (
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatNumber(result.stats.likeCount)}</span>
              )}
              {result.stats.collectCount > 0 && (
                <span className="flex items-center gap-1"><BookmarkPlus className="h-3 w-3" />{formatNumber(result.stats.collectCount)}</span>
              )}
              {result.stats.shareCount > 0 && (
                <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{formatNumber(result.stats.shareCount)}</span>
              )}
              {result.stats.commentCount > 0 && (
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatNumber(result.stats.commentCount)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 下载操作区 */}
        <div className="border-t border-blue-100 bg-white/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-700">解析成功，视频已就绪</span>
            </div>
            <div className="flex items-center gap-2">
              {result.audioUrl && (
                <button
                  type="button"
                  onClick={() => onDownload(result.audioUrl!, `${result.title}-音频.mp3`)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" />下载音频
                </button>
              )}
              {result.videoUrl && (
                <button
                  type="button"
                  onClick={() => onDownload(result.videoUrl!, `${result.title}-无水印.mp4`)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />下载中...</>
                  ) : (
                    <><Download className="h-3.5 w-3.5" />下载视频</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 多个下载源 */}
      {result.videoUrls.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAllUrls(!showAllUrls)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showAllUrls ? "rotate-180" : ""}`} />
            {showAllUrls ? "收起" : `查看全部 ${result.videoUrls.length} 个下载源`}
          </button>
          {showAllUrls && (
            <div className="mt-2 space-y-1.5">
              {result.videoUrls.map((vUrl, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-xs text-gray-500">下载源 {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => onDownload(vUrl, `${result.title}-源${i + 1}.mp4`)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-3 w-3" />下载
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VideoDownloadPanel 主组件                                            */
/* ------------------------------------------------------------------ */

export function VideoDownloadPanel({
  tool,
  credits,
  onSpend,
}: {
  tool: ToolDef;
  credits: number;
  onSpend: (cost: number, desc: string) => boolean;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<VideoDownloadData | null>(null);

  const Icon = tool.icon;

  const downloadMutation = trpc.copywriting.videoDownload.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        onSpend(tool.cost, `视频下载: ${data.title}`);
        setResult(data as VideoDownloadData);
        setStatus("done");
      } else {
        setError(data.error ?? "解析失败，请检查链接是否有效");
        setStatus("error");
      }
    },
    onError: (err) => {
      setError(err.message || "请求失败，请稍后重试");
      setStatus("error");
    },
  });

  const handleSubmit = useCallback(() => {
    if (!url.trim()) return;
    if (credits < tool.cost) {
      setError(`积分不足，需要 ${tool.cost} 积分，当前余额 ${credits} 积分`);
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setError("");
    setResult(null);
    downloadMutation.mutate({ url: url.trim() });
  }, [url, credits, tool, downloadMutation]);

  const handleReset = useCallback(() => {
    setUrl("");
    setStatus("idle");
    setResult(null);
    setError("");
  }, []);

  const [downloading, setDownloading] = useState(false);

  const handleDownloadVideo = useCallback(async (downloadUrl: string, filename: string) => {
    setDownloading(true);
    try {
      // 使用 fetch + Blob 方式下载，避免跨域 URL 被浏览器当作导航而非下载
      const resp = await fetch(downloadUrl, { mode: "cors" });
      if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 延迟释放 blob URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // 如果 fetch 失败（可能是 CORS 问题），回退到新窗口打开
      window.open(downloadUrl, "_blank");
    } finally {
      setDownloading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* 工具头部 */}
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tool.bgColor}`}>
          <Icon className={`h-6 w-6 ${tool.color}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-900">{tool.name}</h2>
            <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              <Zap className="h-3 w-3" />{tool.cost} 积分/次
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
              实时解析 · 无水印
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{tool.desc}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-400">支持平台</p>
        <PlatformTags platforms={tool.supportedPlatforms} />
      </div>

      {/* 输入区 */}
      <div className="space-y-2">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Link2 className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (status === "error") setStatus("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter" && status === "idle") handleSubmit(); }}
            placeholder={tool.inputPlaceholder}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
            disabled={status === "parsing"}
          />
        </div>
        <p className="text-xs text-gray-400">{tool.inputHint}</p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || status === "parsing"}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "parsing" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />解析中...</>
          ) : (
            <><Sparkles className="h-4 w-4" />开始解析</>
          )}
        </button>
        {status === "done" && (
          <button type="button" onClick={handleReset} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            继续使用
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {status === "error" && error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* 解析进度 */}
      {status === "parsing" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">正在解析视频链接...</p>
              <p className="text-xs text-gray-400">自动识别平台并提取最高画质</p>
            </div>
          </div>
        </div>
      )}

      {/* 结果展示 */}
      {status === "done" && result && (
        <VideoDownloadResult result={result} onDownload={handleDownloadVideo} isDownloading={downloading} />
      )}
    </div>
  );
}
