/**
 * 爆款拆解面板（真实 API + 可视化交付）
 * 从 ToolboxPage.tsx 提取
 */
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Link2,
  Loader2,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BreakdownAhaResult,
  type BreakdownData,
  type BreakdownVideoInfo,
} from "../../components/BreakdownAhaResult";
import type { ToolDef } from "./toolbox-constants";
import { PlatformTags } from "./ToolboxShared";

export function ViralBreakdownPanel({
  tool,
  credits,
  onSpend,
}: {
  tool: ToolDef;
  credits: number;
  onSpend: (cost: number, desc: string) => boolean;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [breakdownData, setBreakdownData] = useState<BreakdownData | null>(null);
  const [videoInfo, setVideoInfo] = useState<BreakdownVideoInfo | null>(null);

  const breakdownMut = trpc.copywriting.viralBreakdown.useMutation();

  const Icon = tool.icon;

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    if (credits < tool.cost) {
      setError(`积分不足，需要 ${tool.cost} 积分，当前余额 ${credits} 积分`);
      setStatus("error");
      return;
    }

    setStatus("analyzing");
    setError("");
    setProgressPct(5);
    setProgressMsg("正在解析视频链接...");

    // 模拟进度
    const progressTimer = setInterval(() => {
      setProgressPct((prev) => {
        if (prev < 15) { setProgressMsg("正在解析视频链接..."); return prev + 2; }
        if (prev < 35) { setProgressMsg("AI 正在观看视频内容..."); return prev + 1.5; }
        if (prev < 60) { setProgressMsg("深度分析爆点结构和节奏..."); return prev + 1; }
        if (prev < 80) { setProgressMsg("拆解分镜脚本和神经营销洞察..."); return prev + 0.5; }
        if (prev < 92) { setProgressMsg("生成复刻建议..."); return prev + 0.3; }
        return prev;
      });
    }, 800);

    try {
      const result = await breakdownMut.mutateAsync({ url: url.trim() });
      clearInterval(progressTimer);
      setProgressPct(100);
      setProgressMsg("拆解完成！");

      onSpend(tool.cost, `爆款拆解: ${result.videoInfo.title || "视频"}`);
      setBreakdownData(result.breakdown);
      setVideoInfo(result.videoInfo);

      setTimeout(() => setStatus("done"), 500);
    } catch (e: any) {
      clearInterval(progressTimer);
      setError(e.message || "拆解失败，请检查链接是否有效");
      setStatus("error");
    }
  }, [url, credits, tool, onSpend, breakdownMut]);

  const handleReset = useCallback(() => {
    setUrl("");
    setStatus("idle");
    setError("");
    setBreakdownData(null);
    setVideoInfo(null);
    setProgressPct(0);
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
            <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600">
              Gemini 视频理解
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{tool.desc}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-400">支持平台</p>
        <PlatformTags platforms={tool.supportedPlatforms} />
      </div>

      {/* 输入框 */}
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
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-300"
            disabled={status === "analyzing"}
          />
        </div>
        <p className="text-xs text-gray-400">{tool.inputHint}</p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || status === "analyzing"}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "analyzing" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />拆解中...</>
          ) : (
            <><Brain className="h-4 w-4" />开始拆解</>
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

      {/* 拆解进度 */}
      {status === "analyzing" && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{progressMsg}</p>
              <p className="text-xs text-gray-400">
                {progressPct < 20 ? "解析视频信息中..." : progressPct < 50 ? "Gemini 正在理解视频内容..." : progressPct < 80 ? "深度分析爆点和节奏..." : "生成拆解报告..."}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-orange-100">
            <div className="h-full rounded-full bg-orange-500 transition-all duration-1000 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-right text-xs text-gray-400">{Math.round(progressPct)}%</p>
        </div>
      )}

      {/* 结果展示 */}
      {status === "done" && breakdownData && videoInfo && (
        <BreakdownAhaResult data={breakdownData} videoInfo={videoInfo} />
      )}
    </div>
  );
}
