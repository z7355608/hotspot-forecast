import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AIWorkbench } from "../components/AIWorkbench";
import { AnalysisView } from "../components/AnalysisView";
import { LevelUpModal } from "../components/LevelUpModal";
import { LiveDemoPreview } from "../components/LiveDemoPreview";
import { useAppStore } from "../store/app-store";
import type {
  PredictionRequestDraft,
  PredictionRequestEntrySource,
} from "../store/prediction-types";
import type { ProgressEvent } from "../lib/live-predictions-api";
import { useOnboarding, useTrack } from "../lib/onboarding-context";
import { Play, Sparkles, X, Zap } from "lucide-react";

type HomeState = "input" | "analyzing";

export function HomePage() {
  const navigate = useNavigate();
  const { startAnalysis } = useAppStore();
  const { markChecklistDone } = useOnboarding();
  const track = useTrack();
  const [homeState, setHomeState] = useState<HomeState>("input");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activeResultId, setActiveResultId] = useState("");
  const [fading, setFading] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [showDemoDialog, setShowDemoDialog] = useState(false);

  const [submittedEntrySource, setSubmittedEntrySource] =
    useState<PredictionRequestEntrySource | undefined>();
  const [submittedTemplateId, setSubmittedTemplateId] = useState<
    string | undefined
  >();
  const [submittedSkillId, setSubmittedSkillId] = useState<
    string | undefined
  >();
  const [submittedPlatforms, setSubmittedPlatforms] = useState<string[]>([]);

  const analysisPromiseRef = useRef<Promise<void> | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const pendingQuickPromptRef = useRef<string | null>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);

  const fadeTransition = useCallback((callback: () => void) => {
    setFading(true);
    window.setTimeout(() => {
      callback();
      setFading(false);
    }, 280);
  }, []);

  const handleSubmit = useCallback(
    async (request: PredictionRequestDraft) => {
      const preCheck = await startAnalysis(request, true);
      if (!preCheck.ok) {
        return { ok: false, shortfall: preCheck.shortfall, error: preCheck.error };
      }

      setSubmittedQuery(request.prompt);
      setSubmittedEntrySource(request.entrySource);
      setSubmittedTemplateId(request.entryTemplateId);
      setSubmittedSkillId(request.selectedSkillId);
      setSubmittedPlatforms(request.selectedPlatforms ?? []);
      setAnalysisError(null);
      setProgressEvents([]);
      setFromCache(false);

      const onProgress = (event: ProgressEvent) => {
        if (event.type === "cache_hit") setFromCache(true);
        startTransition(() => {
          setProgressEvents((prev) => [...prev, event]);
        });
      };

      const promise = (async () => {
        const action = await startAnalysis(request, false, onProgress);
        if (!action.ok) {
          setAnalysisError(action.error ?? "分析失败，请重试。");
          throw new Error(action.error ?? "分析失败");
        }
        setActiveResultId(action.resultId!);
        markChecklistDone("first_query");
        track("analysis_submitted", { prompt: request.prompt });
      })();
      analysisPromiseRef.current = promise;

      fadeTransition(() => setHomeState("analyzing"));
      return { ok: true };
    },
    [fadeTransition, startAnalysis, markChecklistDone, track],
  );

  const handleAnalysisComplete = useCallback(async () => {
    try {
      if (analysisPromiseRef.current) {
        await analysisPromiseRef.current;
      }
    } catch {
      return;
    }
    if (activeResultId) {
      navigate(`/results/${activeResultId}`);
    }
  }, [activeResultId, navigate]);

  const handleReset = useCallback(() => {
    fadeTransition(() => {
      setHomeState("input");
      setSubmittedQuery("");
      setActiveResultId("");
      setSubmittedEntrySource(undefined);
      setSubmittedTemplateId(undefined);
      setSubmittedSkillId(undefined);
      setSubmittedPlatforms([]);
      setAnalysisError(null);
      analysisPromiseRef.current = null;
    });
  }, [fadeTransition]);

  /** 快速示例：填入输入框并聚焦 */
  const handleQuickExample = useCallback(
    (prompt: string) => {
      pendingQuickPromptRef.current = prompt;
      setFocusTrigger((v) => v + 1);
      workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      track("quick_example_clicked", { prompt });
    },
    [track],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const deepPrompt = searchParams.get("deepPrompt");
    if (deepPrompt) {
      pendingQuickPromptRef.current = deepPrompt;
      setFocusTrigger((v) => v + 1);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div
      className="transition-opacity duration-[280ms]"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {homeState === "input" ? (
        <>
          <LevelUpModal />

          {/* ═══════════════════════════════════════════════════════
              首屏：一眼看完 — 价值描述 + 输入框 + 快速标签
              不需要滚动，所有内容在一屏内完成
              ═══════════════════════════════════════════════════════ */}

          {/* 1. 价值描述 — 极简 Hero */}
          <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
            <div className="space-y-3 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs text-white animate-fade-in">
                <Sparkles className="h-3 w-3" />
                AI 爆款预测
              </div>
              <h1 className="text-[26px] font-bold tracking-tight text-gray-900 sm:text-[34px] leading-tight">
                你今天最值得拍什么
                <br />
                <span className="text-gray-400">我们直接告诉你</span>
              </h1>
              <p className="mx-auto max-w-lg text-[14px] leading-relaxed text-gray-400">
                输入行业关键词、竞品链接或你的账号链接，立即获取当前高概率爆款选题
              </p>
            </div>
          </div>

          {/* 2. 输入框 — 核心交互 */}
          <div ref={workbenchRef} className="mt-4">
            <AIWorkbench
              onSubmit={handleSubmit}
              focusTrigger={focusTrigger}
              pendingPromptRef={pendingQuickPromptRef}
            />
          </div>

          {/* 3. 快速示例标签 + "看看效果"弹窗触发 */}
          <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-4 pt-1">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] text-gray-300 mr-1">试试看：</span>
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => handleQuickExample(ex.prompt)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-100 bg-white px-3 py-1.5 text-[12px] text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700 hover:shadow-sm active:scale-95"
                >
                  <Zap className="h-3 w-3 text-amber-400" />
                  {ex.label}
                </button>
              ))}

              {/* 分隔点 */}
              <span className="text-gray-200">&middot;</span>

              {/* "看看效果"按钮 — 打开弹窗 */}
              <button
                type="button"
                onClick={() => {
                  setShowDemoDialog(true);
                  track("demo_dialog_opened");
                }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-200 bg-gray-50/50 px-3 py-1.5 text-[12px] text-gray-400 transition-all hover:border-gray-300 hover:text-gray-600 hover:bg-white active:scale-95"
              >
                <Play className="h-3 w-3" />
                看看效果
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              Demo 弹窗 — 点击"看看效果"后展示
              ═══════════════════════════════════════════════════════ */}
          {showDemoDialog && (
            <DemoDialog
              onClose={() => setShowDemoDialog(false)}
              onTryIt={() => {
                setShowDemoDialog(false);
                setFocusTrigger((v) => v + 1);
                workbenchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          )}
        </>
      ) : (
        <AnalysisView
          query={submittedQuery}
          onReset={handleReset}
          onComplete={handleAnalysisComplete}
          entrySource={submittedEntrySource}
          entryTemplateId={submittedTemplateId}
          selectedSkillId={submittedSkillId}
          selectedPlatforms={submittedPlatforms}
          error={analysisError}
          dataReady={!!activeResultId}
          progressEvents={progressEvents}
          fromCache={fromCache}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Demo 弹窗组件                                                       */
/* ------------------------------------------------------------------ */

function DemoDialog({
  onClose,
  onTryIt,
}: {
  onClose: () => void;
  onTryIt: () => void;
}) {
  // 点击遮罩层关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 禁止背景滚动
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="relative mx-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl animate-fade-in overflow-hidden">
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* LiveDemoPreview 内容 */}
        <div className="max-h-[80vh] overflow-y-auto">
          <LiveDemoPreview onTryIt={onTryIt} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  快速示例数据 — 3 个就够，降低选择成本                                 */
/* ------------------------------------------------------------------ */

const QUICK_EXAMPLES = [
  { label: "穿搭赛道", prompt: "穿搭赛道现在发什么最容易爆？帮我找出具体可执行的选题" },
  { label: "美食探店", prompt: "美食探店赛道最近7天有哪些低粉爆款？帮我分析可复制的方向" },
  { label: "职场干货", prompt: "职场干货赛道的爆款概率分析，适合5000粉新号" },
];
