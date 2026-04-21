/**
 * 监控结果查看弹窗（类似扣子编程渲染器）
 * 从 MonitorPage.tsx 提取
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { WatchTaskSummary } from "../../lib/result-artifacts-api";
import { fetchLatestMonitorReport, generateMonitorReport as apiGenerateReport } from "../../lib/result-artifacts-api";
import { TASK_TYPE_META, SCHEDULE_OPTIONS, PLATFORM_LABEL, formatRelativeTime } from "./monitor-constants";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function MonitorResultDrawer({
  task,
  open,
  onClose,
}: {
  task: WatchTaskSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  const [markdown, setMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 真实 API 获取/生成报告，然后用打字机效果展示
  const startGeneration = useCallback(async () => {
    if (!task) return;
    setMarkdown("");
    setIsGenerating(true);
    setIsComplete(false);
    setError(null);

    let fullMarkdown = "";
    try {
      // 1. 先尝试获取已有报告
      const existing = await fetchLatestMonitorReport(task.taskId);
      if (existing?.report?.markdown) {
        fullMarkdown = existing.report.markdown;
      } else {
        // 2. 没有已有报告，调用后端生成新报告
        const generated = await apiGenerateReport(task.taskId);
        if (generated?.report?.markdown) {
          fullMarkdown = generated.report.markdown;
        }
      }
    } catch (err) {
      console.warn("[MonitorReport] 后端报告获取/生成失败:", err);
    }

    // 3. 如果后端没有报告，显示空状态提示（不降级到假数据）
    if (!fullMarkdown) {
      setIsGenerating(false);
      setIsComplete(false);
      setError("该任务尚无执行记录。请先点击「立即执行」按钮采集真实数据，系统将基于真实数据通过 AI 生成分析报告。");
      return;
    }

    // 打字机效果展示
    let idx = 0;
    const chunkSize = 12;
    const interval = 8;
    timerRef.current = setInterval(() => {
      idx += chunkSize;
      if (idx >= fullMarkdown.length) {
        setMarkdown(fullMarkdown);
        setIsGenerating(false);
        setIsComplete(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setMarkdown(fullMarkdown.slice(0, idx));
      }
    }, interval);
  }, [task]);

  useEffect(() => {
    if (open && task) {
      startGeneration();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, task, startGeneration]);

  // 自动滚动到底部
  useEffect(() => {
    if (isGenerating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [markdown, isGenerating]);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open || !task) return null;

  const typeMeta = TASK_TYPE_META[task.taskType] ?? TASK_TYPE_META.topic_watch;
  const TypeIcon = typeMeta.icon;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 侧滑面板 */}
      <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeMeta.bg}`}>
              <TypeIcon className={`h-4 w-4 ${typeMeta.color}`} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-900">
                {task.title || typeMeta.label}
              </h2>
              <p className="text-[11px] text-gray-400">
                {PLATFORM_LABEL[task.platform]} · {formatRelativeTime(task.lastRunAt)}执行
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isGenerating && (
              <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                AI 生成中...
              </span>
            )}
            {isComplete && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {copied ? (
                    <>
                      <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      复制
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([markdown], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${task.title || "monitor-report"}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <Download className="h-3 w-3" />
                  导出
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* AI 状态条 */}
        <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50/50 px-6 py-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[11px] text-gray-500">
            {isGenerating
              ? "AI 正在分析监控数据并生成报告..."
              : isComplete
                ? "报告生成完成 · 基于最近一次监控执行的数据"
                : "准备生成报告..."}
          </span>
          {isGenerating && (
            <div className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full animate-pulse rounded-full bg-blue-400" style={{ width: `${Math.min((markdown.length / 2000) * 100, 95)}%` }} />
            </div>
          )}
        </div>

        {/* Markdown 内容区 */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-8 py-6"
        >
          {error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center max-w-md">
                <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
                <p className="text-sm text-gray-600 font-medium mb-2">暂无报告数据</p>
                <p className="text-xs text-gray-400 leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={() => { setError(null); startGeneration(); }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                >
                  <RefreshCw className="h-3 w-3" />
                  重新获取
                </button>
              </div>
            </div>
          ) : markdown ? (
            <MarkdownRenderer content={markdown} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-300" />
                <p className="text-sm text-gray-400">正在从后端获取报告数据...</p>
              </div>
            </div>
          )}

          {/* 生成完成后的底部操作 */}
          {isComplete && (
            <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">对报告有疑问？</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    你可以基于此报告发起深度分析，AI 会为你进一步拆解
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const target = task.target || "未指定";
                    const platform = PLATFORM_LABEL[task.platform] ?? task.platform;
                    const deepPrompt = task.taskType === "topic_watch"
                      ? `请帮我判断 ${target} 这个赛道未来 30 天是否值得做，并给出适合我的切入点。监控发现：${markdown.slice(0, 500)}`
                      : task.taskType === "account_watch"
                        ? `请帮我分析 ${platform} 上 ${target} 这个账号的运营策略，我应该如何借鉴。监控发现：${markdown.slice(0, 500)}`
                        : `请基于以下监控发现，帮我制定下一步内容策略：${markdown.slice(0, 500)}`;
                    onClose();
                    window.location.href = `/?deepPrompt=${encodeURIComponent(deepPrompt)}`;
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                >
                  <Sparkles className="h-3 w-3" />
                  深度分析
                  <span className="rounded bg-white/20 px-1 py-0.5 text-[10px]">15 积分</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="border-t border-gray-100 px-6 py-3">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>
              监控维度：{task.dimensions?.join(" · ") || "综合监控"}
            </span>
            <span>
              执行频率：{SCHEDULE_OPTIONS.find((s) => s.value === task.scheduleTier)?.label || task.scheduleTier} · 每次 15 积分
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
