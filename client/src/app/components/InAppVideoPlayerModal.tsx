import { useEffect, useMemo, useState } from "react";
import { ImageOff, Play, Video, X } from "lucide-react";
import { fetchWorkComments, type CommentItem } from "../lib/creator-api";
import { getProxiedImageUrl } from "../lib/media-proxy";
import { parseVideo } from "../lib/video-api";

export interface InAppVideoSource {
  id?: string;
  workId?: string | null;
  videoId?: string | null;
  title: string;
  authorName?: string | null;
  platform: string;
  contentUrl?: string | null;
  coverUrl?: string | null;
  publishedAt?: string | null;
  likeCount?: number | null;
  commentCount?: number | null;
  saveCount?: number | null;
  shareCount?: number | null;
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "发布时间未知";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(time));
}

function normalizePlatformId(platform: string) {
  const raw = platform.toLowerCase();
  if (platform.includes("小红书") || raw.includes("xiaohongshu") || raw === "xhs") return "xiaohongshu";
  if (platform.includes("快手") || raw.includes("kuaishou")) return "kuaishou";
  if (platform.includes("B站") || raw.includes("bilibili")) return "bilibili";
  return "douyin";
}

function formatPlatformLabel(platform: string) {
  const id = normalizePlatformId(platform);
  if (id === "xiaohongshu") return "小红书";
  if (id === "kuaishou") return "快手";
  if (id === "bilibili") return "B站";
  return "抖音";
}

function extractContentIdFromUrl(url: string | null | undefined, platformId: string) {
  if (!url) return "";
  if (platformId === "xiaohongshu") {
    return url.match(/(?:explore|item|discovery\/item)\/([0-9a-f]{24})/)?.[1] ?? "";
  }
  if (platformId === "kuaishou") {
    return url.match(/(?:photo|short-video)\/([A-Za-z0-9_-]{8,32})/)?.[1] ?? "";
  }
  if (platformId === "bilibili") {
    return url.match(/video\/(BV[A-Za-z0-9]+)/)?.[1] ?? "";
  }
  return url.match(/video\/([0-9]{15,22})/)?.[1] ?? url.match(/aweme_id=([0-9]{15,22})/)?.[1] ?? "";
}

function getWorkId(video: InAppVideoSource) {
  const platformId = normalizePlatformId(video.platform);
  return (
    video.workId ||
    video.videoId ||
    (video.id && !video.id.startsWith("content_") ? video.id : "") ||
    extractContentIdFromUrl(video.contentUrl, platformId)
  );
}

function formatInteractionCount(video: InAppVideoSource) {
  if (video.likeCount == null && video.commentCount == null && video.saveCount == null && video.shareCount == null) {
    return "待补";
  }
  return formatNumber((video.likeCount ?? 0) + (video.commentCount ?? 0) + (video.saveCount ?? 0) + (video.shareCount ?? 0));
}

function Metric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${muted ? "bg-amber-50" : "bg-slate-50"}`}>
      <div className={`text-[11px] leading-4 ${muted ? "text-amber-500" : "text-slate-400"}`}>{label}</div>
      <div className={`truncate text-[12px] font-semibold leading-4 ${muted ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

export function InAppVideoPlayerModal({
  video,
  onClose,
}: {
  video: InAppVideoSource;
  onClose: () => void;
}) {
  const [videoSrc, setVideoSrc] = useState("");
  const [playerStatus, setPlayerStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playerError, setPlayerError] = useState("");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsStatus, setCommentsStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [commentsError, setCommentsError] = useState("");
  const platformId = normalizePlatformId(video.platform);
  const platformLabel = formatPlatformLabel(video.platform);
  const workId = useMemo(() => getWorkId(video), [video]);
  const coverUrl = getProxiedImageUrl(video.coverUrl);

  useEffect(() => {
    let active = true;
    const resolveVideo = async () => {
      setPlayerStatus("loading");
      setPlayerError("");
      try {
        if (platformId === "douyin" && /^[0-9]{15,22}$/.test(workId)) {
          if (!active) return;
          setVideoSrc(`/api/video-proxy?aweme_id=${encodeURIComponent(workId)}`);
          setPlayerStatus("ready");
          return;
        }
        if (!video.contentUrl) throw new Error("缺少视频链接");
        const parsed = await parseVideo(video.contentUrl);
        if (!active) return;
        if (parsed.ok && parsed.videoUrl) {
          setVideoSrc(parsed.videoUrl);
          setPlayerStatus("ready");
        } else {
          throw new Error(parsed.error || "暂时无法解析播放地址");
        }
      } catch (err) {
        if (!active) return;
        setPlayerStatus("error");
        setPlayerError(err instanceof Error ? err.message : "暂时无法解析播放地址");
      }
    };
    void resolveVideo();
    return () => {
      active = false;
    };
  }, [platformId, video.contentUrl, workId]);

  useEffect(() => {
    let active = true;
    const loadComments = async () => {
      if (!workId || platformId === "bilibili") {
        setCommentsStatus("empty");
        return;
      }
      setCommentsStatus("loading");
      setCommentsError("");
      try {
        const result = await fetchWorkComments(workId, platformId, { cursor: 0, page: 1, pageSize: 20 });
        if (!active) return;
        setComments(result.comments);
        setCommentsStatus(result.comments.length > 0 ? "ready" : "empty");
      } catch (err) {
        if (!active) return;
        setCommentsStatus("error");
        setCommentsError(err instanceof Error ? err.message : "评论暂时加载失败");
      }
    };
    void loadComments();
    return () => {
      active = false;
    };
  }, [platformId, workId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-indigo-600">页内查看参考样本</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-slate-950">{video.title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="关闭播放器"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 bg-slate-950 lg:grid-cols-[minmax(360px,1fr)_360px]">
          <div className="flex min-h-[460px] items-center justify-center bg-slate-950 p-4">
            <div className="relative flex h-[min(76vh,720px)] w-full max-w-[430px] items-center justify-center overflow-hidden rounded-2xl bg-black shadow-2xl">
              {playerStatus === "ready" && videoSrc ? (
                <video
                  src={videoSrc}
                  poster={coverUrl ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                  onError={() => {
                    setPlayerStatus("error");
                    setPlayerError("视频播放地址不可用，请稍后重试或打开原链接查看。");
                  }}
                />
              ) : (
                <div className="relative h-full w-full">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-full w-full object-cover opacity-75" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-500">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/45 px-6 text-center text-white">
                    {playerStatus === "loading" ? (
                      <>
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        <div className="text-sm font-semibold">正在解析页内播放地址</div>
                      </>
                    ) : (
                      <>
                        <Video className="h-8 w-8" />
                        <div className="text-sm font-semibold">{playerError || "暂时无法页内播放"}</div>
                        {video.contentUrl && (
                          <a
                            href={video.contentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950"
                          >
                            打开原链接
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <aside className="flex min-h-0 flex-col bg-white">
            <div className="border-b border-slate-100 p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-slate-400">
                <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-500">{platformLabel}</span>
                <span>{formatDate(video.publishedAt)}</span>
              </div>
              <p className="text-sm font-semibold leading-6 text-slate-950">{video.title}</p>
              {video.authorName && <p className="mt-1 truncate text-xs text-slate-400">@{video.authorName}</p>}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="互动" value={formatInteractionCount(video)} />
                <Metric label="赞" value={formatNumber(video.likeCount)} />
                <Metric label="评" value={formatNumber(video.commentCount)} muted={video.commentCount == null} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">评论区</div>
                {commentsStatus === "ready" && <div className="text-xs text-slate-400">{comments.length} 条</div>}
              </div>
              {commentsStatus === "loading" && (
                <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">正在加载真实评论...</div>
              )}
              {commentsStatus === "error" && (
                <div className="rounded-xl bg-amber-50 px-3 py-4 text-sm leading-6 text-amber-700">
                  {commentsError || "评论暂时加载失败"}
                </div>
              )}
              {commentsStatus === "empty" && (
                <div className="rounded-xl bg-slate-50 px-3 py-4 text-sm leading-6 text-slate-500">
                  当前样本暂未拉到评论文本，仍可参考卡片里的评论数量和互动信号。
                </div>
              )}
              {commentsStatus === "ready" && (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-400">
                        <span className="truncate">@{comment.author || "匿名用户"}</span>
                        <span className="shrink-0">{formatNumber(comment.likes)} 赞</span>
                      </div>
                      <p className="text-[13px] leading-6 text-slate-700">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function InAppVideoPlayBadge() {
  return (
    <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur">
      <Play className="ml-0.5 h-4 w-4 text-slate-900" />
    </span>
  );
}
