/**
 * 视频去字幕面板（暂用 Mock）
 * 从 ToolboxPage.tsx 提取
 */
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Film,
  Link2,
  Loader2,
  Scissors,
  Zap,
} from "lucide-react";
import type { ToolDef } from "./toolbox-constants";
import { PlatformTags } from "./ToolboxShared";

export function SubtitleRemovePanel({
  tool,
  credits,
  onSpend,
}: {
  tool: ToolDef;
  credits: number;
  onSpend: (cost: number, desc: string) => boolean;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "parsing" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const Icon = tool.icon;

  const handleSubmit = useCallback(() => {
    if (!url.trim()) return;
    if (credits < tool.cost) {
      setError(`积分不足，需要 ${tool.cost} 积分，当前余额 ${credits} 积分`);
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setError("");
    setTimeout(() => {
      setStatus("processing");
      setTimeout(() => {
        onSpend(tool.cost, `去字幕: 视频`);
        setStatus("done");
      }, 3000);
    }, 1200);
  }, [url, credits, tool, onSpend]);

  const handleReset = useCallback(() => {
    setUrl("");
    setStatus("idle");
    setError("");
  }, []);

  return (
    <div className="space-y-6">
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
            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] text-purple-600">
              即将上线
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{tool.desc}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-400">支持平台</p>
        <PlatformTags platforms={tool.supportedPlatforms} />
      </div>

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
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
            disabled={status === "parsing" || status === "processing"}
          />
        </div>
        <p className="text-xs text-gray-400">{tool.inputHint}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || status === "parsing" || status === "processing"}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(status === "parsing" || status === "processing") ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{status === "parsing" ? "解析中..." : "处理中..."}</>
          ) : (
            <><Scissors className="h-4 w-4" />开始去字幕</>
          )}
        </button>
        {status === "done" && (
          <button type="button" onClick={handleReset} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            继续使用
          </button>
        )}
      </div>

      {status === "error" && error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {(status === "parsing" || status === "processing") && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                {status === "parsing" ? "正在解析视频..." : "AI 正在识别并去除字幕..."}
              </p>
              <p className="text-xs text-gray-400">请稍候，预计需要几秒钟</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-purple-100">
            <div className="h-full animate-pulse rounded-full bg-purple-400" style={{ width: status === "parsing" ? "30%" : "70%" }} />
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Check className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-purple-800">字幕去除完成</p>
                <p className="text-xs text-purple-600">处理耗时约 45 秒 · AI 智能修复</p>
              </div>
            </div>
            <button type="button" className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
              <Download className="h-4 w-4" />下载视频
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-xs font-medium text-gray-500">原始视频</p>
              <div className="flex h-28 items-center justify-center rounded-lg bg-gray-100">
                <div className="text-center"><Film className="mx-auto mb-1 h-6 w-6 text-gray-400" /><span className="text-xs text-gray-400">含字幕</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-purple-200 p-3">
              <p className="mb-2 text-xs font-medium text-purple-600">处理后</p>
              <div className="flex h-28 items-center justify-center rounded-lg bg-purple-50">
                <div className="text-center"><Film className="mx-auto mb-1 h-6 w-6 text-purple-400" /><span className="text-xs text-purple-500">已去字幕</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
