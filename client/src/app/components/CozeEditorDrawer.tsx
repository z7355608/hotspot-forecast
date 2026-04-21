/**
 * CozeEditorDrawer
 * ================
 * 统一的扣子编程风格编辑器抽屉组件。
 * 用于：
 *   1. 智能监控查看结果
 *   2. 低粉爆款拆解页 / 爆款预测 Agent 结果页的"下一步动作"
 *   3. 爆款预测 Agent 直接需求的完整编辑器展示
 *
 * 支持两种尺寸：
 *   - "normal"（默认）：右侧 max-w-3xl 侧滑面板
 *   - "expanded"：覆盖完整右侧展示区域（去掉 max-w 限制）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamLLMRaw } from "../lib/llm-api";
import { sanitizeHtml } from "@/app/lib/sanitize-html";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Markdown 渲染器（从 MonitorPage 提取的通用版本）                        */
/* ------------------------------------------------------------------ */

function applyInline(text: string): string {
  let result = text.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="font-semibold text-gray-900">$1</strong>',
  );
  result = result.replace(
    /`(.+?)`/g,
    '<code class="rounded bg-gray-100 px-1 py-0.5 text-[11px] font-mono text-gray-700">$1</code>',
  );
  return result;
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => {
    let md = content;

    // 转义 HTML
    md = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 水平分割线
    md = md.replace(/^---$/gm, '<hr class="my-5 border-gray-200" />');

    // 表格
    md = md.replace(
      /(?:^|\n)((?:\|.+\|[ \t]*\n)+)/g,
      (_match, tableBlock: string) => {
        const rows = tableBlock.trim().split("\n").filter((r) => r.trim());
        if (rows.length < 2) return tableBlock;
        const isSeparator = /^\|[\s\-:|]+\|$/.test(rows[1].trim());
        const headerRow = rows[0];
        const dataRows = isSeparator ? rows.slice(2) : rows.slice(1);
        const parseRow = (row: string) =>
          row.split("|").slice(1, -1).map((cell) => cell.trim());
        const headerCells = parseRow(headerRow);
        let html = '<div class="my-4 overflow-x-auto rounded-lg border border-gray-200"><table class="w-full text-xs">';
        html += "<thead><tr>";
        for (const cell of headerCells) {
          html += `<th class="border-b border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">${applyInline(cell)}</th>`;
        }
        html += "</tr></thead><tbody>";
        for (const row of dataRows) {
          const cells = parseRow(row);
          html += '<tr class="border-b border-gray-100 last:border-0">';
          for (const cell of cells) {
            html += `<td class="px-3 py-2 text-gray-700">${applyInline(cell)}</td>`;
          }
          html += "</tr>";
        }
        html += "</tbody></table></div>";
        return html;
      },
    );

    // 引用块
    md = md.replace(
      /^&gt; (.+)$/gm,
      '<blockquote class="my-3 border-l-3 border-blue-300 bg-blue-50/50 px-4 py-2.5 text-xs text-gray-700">$1</blockquote>',
    );

    // 标题
    md = md.replace(/^#### (.+)$/gm, '<h4 class="mt-5 mb-2 text-sm font-semibold text-gray-800">$1</h4>');
    md = md.replace(/^### (.+)$/gm, '<h3 class="mt-6 mb-2 text-sm font-semibold text-gray-800">$1</h3>');
    md = md.replace(/^## (.+)$/gm, '<h2 class="mt-7 mb-3 text-base font-semibold text-gray-900">$1</h2>');
    md = md.replace(/^# (.+)$/gm, '<h1 class="mb-1 text-lg font-bold text-gray-900">$1</h1>');

    // 有序列表
    md = md.replace(
      /^(\d+)\. (.+)$/gm,
      '<div class="my-1 flex gap-2 text-xs text-gray-700"><span class="shrink-0 font-medium text-gray-500">$1.</span><span>$2</span></div>',
    );

    // 无序列表
    md = md.replace(
      /^- (.+)$/gm,
      '<div class="my-1 flex gap-2 text-xs text-gray-700"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400"></span><span>$1</span></div>',
    );

    // 斜体文本
    md = md.replace(/^\*([^*]+)\*$/gm, '<p class="mt-4 text-[11px] italic text-gray-400">$1</p>');

    // 段落
    md = md.replace(
      /^(?!<[a-z]|$)(.+)$/gm,
      (_, text) => `<p class="my-2 text-xs leading-relaxed text-gray-700">${applyInline(text)}</p>`,
    );

    // 空行清理
    md = md.replace(/\n{3,}/g, "\n\n");

    return md;
  }, [content]);

  return (
    <div
      className="coze-editor-content"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  CozeEditorDrawer 组件                                               */
/* ------------------------------------------------------------------ */

export interface CozeEditorDrawerProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /** 图标背景色 class */
  iconBg?: string;
  /** 图标颜色 class */
  iconColor?: string;
  /** 图标组件 */
  icon?: React.ElementType;
  /** 要渲染的 Markdown 内容（如果提供，会模拟流式生成） */
  markdown?: string;
  /** 直接传入已完成的 Markdown（不做流式动画） */
  staticMarkdown?: string;
  /** AI 生成中的提示文案 */
  generatingLabel?: string;
  /** 生成完成后的提示文案 */
  completeLabel?: string;
  /** 底部信息文本（左） */
  footerLeft?: string;
  /** 底部信息文本（右） */
  footerRight?: string;
  /** 底部操作按钮 */
  footerAction?: {
    label: string;
    cost?: number;
    onClick: () => void;
  };
  /** 是否默认展开（覆盖完整右侧区域） */
  defaultExpanded?: boolean;
  /** 是否允许放大/缩小切换 */
  allowResize?: boolean;
  /**
   * 真实 SSE 流式请求配置（live 模式）
   * 如果提供此 prop，则忽略 markdown/staticMarkdown，
   * 直接向 /api/breakdown/action 发起 SSE 请求并实时渲染。
   */
  streamPayload?: {
    /** 请求体（POST body） */
    body: Record<string, unknown>;
    /** 请求路径，默认 /api/breakdown/action */
    url?: string;
  };
  /** 生成出错时的回调 */
  onStreamError?: (error: string) => void;
}

export function CozeEditorDrawer({
  open,
  onClose,
  title,
  subtitle,
  iconBg = "bg-gray-100",
  iconColor = "text-gray-600",
  icon: IconComponent = Sparkles,
  markdown: fullMarkdown,
  staticMarkdown,
  generatingLabel = "AI 正在生成内容...",
  completeLabel = "内容生成完成",
  footerLeft,
  footerRight,
  footerAction,
  defaultExpanded = false,
  allowResize = true,
  streamPayload,
  onStreamError,
}: CozeEditorDrawerProps) {
  const [renderedMarkdown, setRenderedMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- 真实 SSE 流式生成（live 模式）----
  const startStreamGeneration = useCallback(() => {
    if (!streamPayload) return;
    setRenderedMarkdown("");
    setIsGenerating(true);
    setIsComplete(false);
    setStreamError(null);

    // 取消上一次未完成的请求
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const url = streamPayload.url ?? "/api/breakdown/action";
    const abort = streamLLMRaw(
      url,
      streamPayload.body,
      {
        onDelta: (text: string) => {
          setRenderedMarkdown((prev) => prev + text);
        },
        onDone: () => {
          setIsGenerating(false);
          setIsComplete(true);
          toast.success("内容生成完成", { description: "可以复制或导出 PDF" });
        },
        onError: (err: string) => {
          setIsGenerating(false);
          setStreamError(err);
          onStreamError?.(err);
          toast.error("生成失败", { description: "可以点击“重试”再次尝试" });
        },
      },
    );
    abortRef.current = abort;
  }, [streamPayload, onStreamError]);

  // ---- Mock 模拟流式生成（mock 模式）----
  const startGeneration = useCallback(() => {
    if (!fullMarkdown) return;
    setRenderedMarkdown("");
    setIsGenerating(true);
    setIsComplete(false);

    let idx = 0;
    const chunkSize = 8;
    const interval = 12;

    timerRef.current = setInterval(() => {
      idx += chunkSize;
      if (idx >= fullMarkdown.length) {
        setRenderedMarkdown(fullMarkdown);
        setIsGenerating(false);
        setIsComplete(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setRenderedMarkdown(fullMarkdown.slice(0, idx));
      }
    }, interval);
  }, [fullMarkdown]);

  useEffect(() => {
    if (!open) return;
    // live 模式：真实 SSE
    if (streamPayload) {
      startStreamGeneration();
      return;
    }
    // mock 模式：模拟流式
    if (fullMarkdown) {
      startGeneration();
    }
    if (staticMarkdown) {
      setRenderedMarkdown(staticMarkdown);
      setIsGenerating(false);
      setIsComplete(true);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [open, streamPayload, fullMarkdown, staticMarkdown, startStreamGeneration, startGeneration]);

  // 自动滚动
  useEffect(() => {
    if (isGenerating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [renderedMarkdown, isGenerating]);

  // 重置 expanded 状态
  useEffect(() => {
    if (open) {
      setExpanded(defaultExpanded);
    }
  }, [open, defaultExpanded]);

  const handleCopy = () => {
    navigator.clipboard.writeText(renderedMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async () => {
    // 将 Markdown 渲染为 HTML 后通过浏览器打印导出 PDF
    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title || "report"}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:0 auto;padding:40px 32px;color:#1a1a1a;font-size:14px;line-height:1.8}
h1{font-size:22px;font-weight:700;margin:24px 0 12px;color:#111}
h2{font-size:18px;font-weight:600;margin:20px 0 10px;color:#222}
h3{font-size:15px;font-weight:600;margin:16px 0 8px;color:#333}
blockquote{border-left:3px solid #ddd;padding:8px 16px;margin:12px 0;color:#555;background:#f9f9f9}
strong{font-weight:600}
code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:12px}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left;font-size:13px}
th{background:#f9fafb;font-weight:600}
ul,ol{padding-left:20px}
li{margin:4px 0}
hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
</style></head><body>${
      renderedMarkdown
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>')
        .replace(/^---$/gm, '<hr>')
        .replace(/\n\n/g, '<br/>')
        .replace(/\n/g, ' ')
    }</body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // 等待渲染完成后触发打印（用户可选择“保存为 PDF”）
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  if (!open) return null;

  const displayMarkdown = renderedMarkdown;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 侧滑面板 */}
      <div
        className={`relative ml-auto flex h-full flex-col bg-white shadow-2xl transition-all duration-300 ${
          expanded ? "w-full max-w-none" : "w-full max-w-3xl"
        }`}
      >
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
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
              <IconComponent className={`h-4 w-4 ${iconColor}`} />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-900">{title}</h2>
              {subtitle && (
                <p className="text-[11px] text-gray-400">{subtitle}</p>
              )}
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
                  onClick={handleExport}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <Download className="h-3 w-3" />
                  导出 PDF
                </button>
              </>
            )}
            {allowResize && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title={expanded ? "缩小" : "放大"}
              >
                {expanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
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
          <Sparkles className={`h-3.5 w-3.5 ${streamError ? "text-red-400" : "text-amber-500"}`} />
          <span className={`text-[11px] ${streamError ? "text-red-500" : "text-gray-500"}`}>
            {streamError
              ? `生成出错：${streamError.slice(0, 40)}`
              : isGenerating
                ? generatingLabel
                : isComplete
                  ? completeLabel
                  : "准备生成内容..."}
          </span>
          {isGenerating && (
            <div className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full animate-pulse rounded-full bg-blue-400"
                style={{
                  width: `${Math.min((displayMarkdown.length / 2000) * 100, 95)}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Markdown 内容区 */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-8 py-6"
        >
          {displayMarkdown ? (
            <MarkdownRenderer content={displayMarkdown} />
          ) : streamError ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="mb-2 text-sm text-red-500">生成失败</p>
                <p className="text-xs text-gray-400">{streamError}</p>
                {streamPayload && (
                  <button
                    type="button"
                    onClick={startStreamGeneration}
                    className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-xs text-white hover:bg-gray-700"
                  >
                    重试
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-gray-300" />
                <p className="text-sm text-gray-400">正在准备内容...</p>
              </div>
            </div>
          )}

          {/* 生成完成后的底部操作 */}
          {isComplete && footerAction && (
            <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">需要更深入的分析？</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    你可以基于此内容发起深度分析，AI 会为你进一步拆解
                  </p>
                </div>
                <button
                  type="button"
                  onClick={footerAction.onClick}
                  className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                >
                  <Sparkles className="h-3 w-3" />
                  {footerAction.label}
                  {footerAction.cost != null && (
                    <span className="rounded bg-white/20 px-1 py-0.5 text-[10px]">
                      {footerAction.cost} 积分
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部信息 */}
        {(footerLeft || footerRight) && (
          <div className="border-t border-gray-100 px-6 py-3">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>{footerLeft}</span>
              <span>{footerRight}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
