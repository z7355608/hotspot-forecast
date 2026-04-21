import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AIWorkbench } from "../components/AIWorkbench";
import { AnalysisView } from "../components/AnalysisView";
import { DashboardInsights } from "../components/DashboardInsights";
import { HeroSection } from "../components/HeroSection";
import { LevelUpModal } from "../components/LevelUpModal";
import { ValueCarousel } from "../components/ValueCarousel";
import { PromptTemplates } from "../components/onboarding/PromptTemplates";
import { useAppStore } from "../store/app-store";
import type {
  PredictionRequestDraft,
  PredictionRequestEntrySource,
} from "../store/prediction-types";
import type { ProgressEvent } from "../lib/live-predictions-api";
import { useOnboarding, useTrack } from "../lib/onboarding-context";

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

  // 保存请求上下文，传给 AnalysisView 实现动态步骤
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
        setProgressEvents((prev) => [...prev, event]);
      };

      const promise = (async () => {
        const action = await startAnalysis(request, false, onProgress);
        if (!action.ok) {
          setAnalysisError(action.error ?? "分析失败，请重试。");
          throw new Error(action.error ?? "分析失败");
        }
        setActiveResultId(action.resultId!);
        // Mark checklist item
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

  const handleQuickAction = useCallback(
    (prompt: string) => {
      pendingQuickPromptRef.current = prompt;
      setFocusTrigger((value) => value + 1);
    },
    [],
  );

  /** Fill input from PromptTemplates click */
  const handleTemplateSelect = useCallback((prompt: string) => {
    pendingQuickPromptRef.current = prompt;
    setFocusTrigger((v) => v + 1);
    track("prompt_template_selected", { prompt });
  }, [track]);

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
          <DashboardInsights onQuickAction={handleQuickAction} />
          <HeroSection
            onViewPlan={() => navigate("/credits")}
            onStartTrial={() => setFocusTrigger((value) => value + 1)}
          />
          <AIWorkbench
            onSubmit={handleSubmit}
            focusTrigger={focusTrigger}
            pendingPromptRef={pendingQuickPromptRef}
          />
          {/* Module B — Prompt template suggestions */}
          <PromptTemplates onSelect={handleTemplateSelect} />
          <ValueCarousel />
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