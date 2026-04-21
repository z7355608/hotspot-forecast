/**
 * 创作工具箱页面 — 主组件
 *
 * 子模块：
 *   toolbox/toolbox-constants.ts     — 常量、类型、工具函数
 *   toolbox/ToolboxShared.tsx        — 共享小组件（PlatformTags, CopyButton）
 *   toolbox/VideoDownloadPanel.tsx   — 视频万能下载面板
 *   toolbox/TextExtractPanel.tsx     — 文案提取面板
 *   toolbox/SubtitleRemovePanel.tsx  — 视频去字幕面板
 *   toolbox/ViralBreakdownPanel.tsx  — 爆款拆解面板
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import { useAppStore } from "../store/app-store";
import { TOOLS, type ToolId } from "./toolbox/toolbox-constants";
import { VideoDownloadPanel } from "./toolbox/VideoDownloadPanel";
import { TextExtractPanel } from "./toolbox/TextExtractPanel";
import { SubtitleRemovePanel } from "./toolbox/SubtitleRemovePanel";

export function ToolboxPage() {
  const { state, spendToolCredits } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toolFromUrl = searchParams.get("tool") as ToolId | null;
  const [activeTool, setActiveTool] = useState<ToolId>(
    toolFromUrl && TOOLS.some((t) => t.id === toolFromUrl) ? toolFromUrl : "text_extract",
  );

  useEffect(() => {
    if (toolFromUrl && TOOLS.some((t) => t.id === toolFromUrl)) {
      setActiveTool(toolFromUrl);
    }
  }, [toolFromUrl]);

  const credits = state.credits;

  const handleSpend = useCallback(
    (cost: number, desc: string): boolean => {
      const result = spendToolCredits(cost, desc);
      return result.ok;
    },
    [spendToolCredits],
  );

  const currentTool = TOOLS.find((t) => t.id === activeTool) ?? TOOLS[2];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">创作工具箱</h1>
            <p className="mt-1 text-sm text-gray-500">高效创作必备工具，助力内容生产全流程</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-700">{credits}</span>
            <span className="text-xs text-gray-400">积分</span>
            <button
              type="button"
              onClick={() => navigate("/credits")}
              className="ml-2 text-xs text-gray-500 underline decoration-dashed underline-offset-2 hover:text-gray-700"
            >
              充值
            </button>
          </div>
        </div>
      </div>

      {/* 工具选择标签 */}
      <div className="mb-4 flex gap-2">
        {TOOLS.map((t) => {
          const TIcon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTool(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all ${
                activeTool === t.id
                  ? "bg-gray-900 font-medium text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              <TIcon className="h-4 w-4" />
              {t.name}
            </button>
          );
        })}
      </div>

      {/* 工具面板 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        {activeTool === "text_extract" && (
          <TextExtractPanel key="text_extract" tool={currentTool} credits={credits} onSpend={handleSpend} />
        )}
        {activeTool === "video_download" && (
          <VideoDownloadPanel key="video_download" tool={currentTool} credits={credits} onSpend={handleSpend} />
        )}
        {activeTool === "video_remove_subtitle" && (
          <SubtitleRemovePanel key="video_remove_subtitle" tool={currentTool} credits={credits} onSpend={handleSpend} />
        )}
      </div>
    </div>
  );
}
