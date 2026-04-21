/**
 * Results View — Smart Shell
 * ==========================
 * 统一的结果页外壳。只负责通用控制：
 * - 顶部查询回显 + 重新提问
 * - 积分不足提示 + 场景化付费墙
 * - 保存 / 观察 / 复查面板
 * - Hero Header（标签 + 标题 + 摘要 + 指标卡）
 * - **委托 Registry 解析的 Dumb Renderer 渲染任务专属内容**
 * - 推荐下一步任务
 * - CTA 动作面板（从 Registry 获取配置）
 * - FOMO 模糊化增值内容
 * - 运营视角展开
 * - 深挖 follow-up 面板
 *
 * 新增任务类型时，只需在 renderers/ 目录新增一个文件并注册，无需修改本文件。
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { sanitizeHtml } from "@/app/lib/sanitize-html";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Coins,
  Eye,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { getModelOption, type ResultRecord, getChargedCost } from "../../store/app-data";
import { useAppStore } from "../../store/app-store";
import { getMomentumLabelText } from "../../store/result-evidence-adapter";
import { TASK_INTENT_META } from "../../store/agent-runtime";
import {
  ENTRY_SOURCE_META,
  formatDateTime,
  getExecutionStatusLabel,
  getWatchStatusLabel,
  INPUT_FOCUS_META,
  OPPORTUNITY_META,
  TASK_CONFIDENCE_META,
  WINDOW_META,
} from "./results-view-meta";
import { PlaceholderFollowUp } from "./results-shared";
import { PaywallModal, type PaywallContext } from "../PaywallModal";
import { FomoTeaser } from "../FomoTeaser";
import { CozeEditorDrawer } from "../CozeEditorDrawer";
import { generateCtaMarkdown, generateFollowUpMarkdown } from "../../lib/cta-markdown-generator";
import { generateDirectResultMarkdown } from "../../lib/direct-result-markdown";

/* ---- 引入 Registry 和所有渲染器 ---- */
import { resolveRenderer, type CtaActionConfig } from "./artifact-registry";
import "./renderers"; // 触发所有渲染器的注册

/* ------------------------------------------------------------------ */
/*  Registry-driven CTA Actions Panel                                   */
/* ------------------------------------------------------------------ */

function RegistryCtaActionsPanel({
  actions,
  credits,
  modelId,
  onConsume,
  onCtaAction,
}: {
  actions: CtaActionConfig[];
  credits: number;
  modelId: "doubao" | "gpt54" | "claude46";
  onConsume: (cost: number, label: string) => { ok: boolean; shortfall?: number };
  onCtaAction?: (action: CtaActionConfig) => void;
}) {
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const handleAction = (action: CtaActionConfig) => {
    setActivatingId(action.id);
    if (onCtaAction) {
      onCtaAction(action);
    } else {
      const chargedCost = getChargedCost(action.cost, modelId);
      const consumeResult = onConsume(chargedCost, action.prompt);
      if (!consumeResult.ok) {
        setActivatingId(null);
      }
    }
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">下一步，你想要什么？</div>
          <div className="mt-1 text-xs text-gray-400">
            点一下就给你，不用自己想该问什么
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Coins className="h-3 w-3" />
          余额 {credits}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const chargedCost = getChargedCost(action.cost, modelId);
          const isActivating = activatingId === action.id;

          return (
            <button
              key={action.id}
              type="button"
              disabled={isActivating}
              onClick={() => handleAction(action)}
              className={`group relative flex flex-col rounded-2xl border px-4 pb-4 pt-4 text-left transition-all duration-200 ${
                action.highlight
                  ? "border-gray-900 bg-gray-900 text-white hover:bg-gray-800"
                  : "border-gray-100 bg-gray-50 text-gray-900 hover:border-gray-200 hover:bg-gray-100"
              } ${isActivating ? "opacity-60" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    action.highlight ? "bg-white/15" : "bg-white"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      action.highlight ? "text-white" : "text-gray-700"
                    }`}
                  />
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    action.highlight
                      ? "bg-white/15 text-white/80"
                      : "bg-white text-gray-400"
                  }`}
                >
                  {chargedCost} 积分
                </span>
              </div>

              <div
                className={`text-sm font-medium ${
                  action.highlight ? "text-white" : "text-gray-900"
                }`}
              >
                {action.title}
              </div>

              <p
                className={`mt-1.5 text-xs leading-relaxed ${
                  action.highlight ? "text-white/70" : "text-gray-500"
                }`}
              >
                {action.description}
              </p>

              <div
                className={`mt-3 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${
                  action.highlight
                    ? "bg-white/10 text-white/60"
                    : "bg-white text-gray-400"
                }`}
              >
                <Zap className="h-3 w-3" />
                {action.value}
              </div>

              <div
                className={`mt-3 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-colors ${
                  action.highlight
                    ? "bg-white text-gray-900 group-hover:bg-gray-100"
                    : "bg-gray-900 text-white group-hover:bg-gray-700"
                }`}
              >
                {isActivating ? "处理中..." : "立即获取"}
                {!isActivating && <ChevronRight className="h-3.5 w-3.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Smart Shell Component                                               */
/* ------------------------------------------------------------------ */

export function ResultsView({
  result,
  onReset,
  autoFocusFollowUp = false,
}: {
  result: ResultRecord;
  onReset: () => void;
  autoFocusFollowUp?: boolean;
}) {
  const navigate = useNavigate();
  const {
    state,
    dataMode,
    watchTasks,
    addResultFollowUp,
    saveResultArtifact,
    ensureResultWatch,
    runResultWatchTask,
  } = useAppStore();

  /* ---- Local state ---- */
  const [shortfall, setShortfall] = useState<number | null>(null);
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showOperatorPanel, setShowOperatorPanel] = useState(false);
  const [showDeepDive, setShowDeepDive] = useState(autoFocusFollowUp);
  const [deepDivePrompt, setDeepDivePrompt] = useState("");
  const [artifactAction, setArtifactAction] = useState<"save" | "watch" | "run" | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  /* ---- CozeEditorDrawer state ---- */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorSubtitle, setEditorSubtitle] = useState("");
  const [editorMarkdown, setEditorMarkdown] = useState("");
  const [editorExpanded, setEditorExpanded] = useState(false);
  /**
   * live 模式下，向 CozeEditorDrawer 传入真实 SSE 请求配置。
   * mock 模式下保持 null，使用 editorMarkdown 模拟流式。
   */
  const [editorStreamPayload, setEditorStreamPayload] = useState<{
    body: Record<string, unknown>;
    url?: string;
  } | null>(null);

  /* ---- Derived data ---- */
  const resultModel = getModelOption(result.modelId);
  const selectedModel = getModelOption(state.selectedModel);
  // 检查 taskPayload 是否包含 trendOpportunities（用于强制覆盖意图分类结果）
  const hasTrendOpps = Array.isArray((result.taskPayload as unknown as Record<string, unknown>)?.trendOpportunities) && ((result.taskPayload as unknown as Record<string, unknown>).trendOpportunities as unknown[]).length > 0;
  const taskMeta = hasTrendOpps ? TASK_INTENT_META["opportunity_prediction"] : TASK_INTENT_META[result.taskIntent];
  const canWatch = result.primaryArtifact.watchable;

  // Registry 解析
  const registration = resolveRenderer(result);
  const RendererComponent = registration?.component ?? null;

  // 直接需求模式：当任务类型是 direct_request 时，
  // 用户输入的是直接需求，不适合结构化卡片渲染，直接用编辑器展示
  const isDirectMode = result.taskIntent === "direct_request";
  const directMarkdown = useMemo(
    () => (isDirectMode ? generateDirectResultMarkdown(result) : ""),
    [isDirectMode, result],
  );
  const heroMetricCards = registration?.getHeroMetrics(result) ?? [];
  const deepDiveConfig = registration?.getDeepDiveConfig(result) ?? {
    title: "继续深挖",
    description: "展开更多细节。",
    placeholder: "输入你想了解的内容...",
    quickActions: [{ label: "继续深挖", cost: 10 }],
  };
  const ctaActions = registration?.getCtaActions(result) ?? [];
  const followUpActions = registration?.getFollowUpActions(result) ?? [];

  // opportunity_prediction 专属标签数据
  // 当 taskPayload 包含 trendOpportunities 时，也视为 opportunity 模式
  const isOpportunity = result.taskIntent === "opportunity_prediction" || hasTrendOpps;
  const windowMeta = WINDOW_META[result.windowStrength];
  const opportunityLabel = OPPORTUNITY_META[result.opportunityType];
  const inputKind = result.normalizedBrief?.inputKind ?? "prompt";
  const inputFocus = INPUT_FOCUS_META[inputKind];

  // Artifact 状态
  const stateResult = state.results.find((item) => item.id === result.id);
  const summaryArtifact =
    state.savedArtifacts.find((item) => item.artifactId === result.id) ??
    state.savedArtifacts.find((item) => item.clientResultId === result.id) ??
    (result.artifactStatus
      ? state.savedArtifacts.find((item) => item.artifactId === result.artifactStatus?.artifactId)
      : undefined);
  const artifactStatus =
    stateResult?.artifactStatus ?? summaryArtifact?.artifactStatus ?? result.artifactStatus;
  const watchTask = artifactStatus?.watchTaskId
    ? watchTasks.find((item) => item.taskId === artifactStatus.watchTaskId)
    : undefined;

  // 运营面板
  const operatorSections = result.operatorPanel
    ? [
        { title: "数据来源", items: result.operatorPanel.sourceNotes },
        { title: "采集状态", items: result.operatorPanel.platformNotes },
        { title: "对标账号", items: result.operatorPanel.benchmarkHints },
        { title: "注意事项", items: result.operatorPanel.riskSplit },
        ...(result.operatorPanel.dataGaps.length > 0 ? [{ title: "当前缺少的数据", items: result.operatorPanel.dataGaps }] : []),
      ].filter((s) => s.items.length > 0)
    : [];

  useEffect(() => {
    if (!autoFocusFollowUp) return;
    setShowDeepDive(true);
  }, [autoFocusFollowUp]);

  // 监听 renderer 发出的 open-deep-dive 事件（解决 CTA 按钮无法点击问题）
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt ?? "";
      setDeepDivePrompt(prompt);
      setShowDeepDive(true);
    };
    window.addEventListener("open-deep-dive", handler);
    return () => window.removeEventListener("open-deep-dive", handler);
  }, []);

  /* ---- Handlers ---- */
  const handleConsume = (cost: number, label: string) => {
    const action = addResultFollowUp(result.id, label, cost);
    if (!action.ok) {
      setShortfall(action.shortfall);
      setPaywallContext({
        actionLabel: label,
        requiredCredits: cost,
        shortfall: action.shortfall,
        contextDescription: `继续「${label}」需要 ${cost} 积分`,
      });
      setPendingAction(() => () => {
        const retry = addResultFollowUp(result.id, label, cost);
        if (retry.ok) setShortfall(null);
      });
      return action;
    }
    setShortfall(null);

    // live 模式下，深挖成功后自动打开编辑器进行 SSE 流式生成
    if (dataMode === "live") {
      setEditorTitle(`深挖：${label.slice(0, 20)}`);
      setEditorSubtitle(`基于「${result.query || result.title}」的进一步分析`);
      setEditorExpanded(false);
      const payload = result.taskPayload;
      const context: Record<string, unknown> = {
        userPrompt: label,
        resultTitle: result.title,
        resultQuery: result.query,
      };
      if (payload?.kind === "breakdown_sample") {
        Object.assign(context, {
          sampleTitle: payload.sampleTitle,
          platform: payload.platform,
          contentForm: payload.contentForm,
          trackTags: payload.trackTags,
          burstReasons: payload.burstReasons,
        });
      }
      setEditorStreamPayload({
        body: {
          actionId: "deep_dive",
          modelId: state.selectedModel,
          context,
          baseCost: cost,
        },
      });
      setEditorMarkdown("");
      setEditorOpen(true);
    }

    return { ok: true };
  };

  /** CTA 按鈕点击后弹出编辑器 */
  const handleCtaWithEditor = (ctaAction: CtaActionConfig) => {
    // watch_7d 特殊处理：直接加入智能监控，而不是生成观察计划文档
    if (ctaAction.id === "watch_7d") {
      handleEnsureWatch();
      return;
    }

    const chargedCost = getChargedCost(ctaAction.cost, state.selectedModel);
    const consumeResult = handleConsume(chargedCost, ctaAction.prompt);
    if (!consumeResult.ok) return;

    setEditorTitle(ctaAction.title);
    setEditorSubtitle(ctaAction.description);
    setEditorExpanded(false);

    if (dataMode === "live") {
      // live 模式：构建真实 SSE 请求体，向后端发起流式调用
      const payload = result.taskPayload;
      const context: Record<string, unknown> = {
        userPrompt: ctaAction.prompt,
        resultTitle: result.title,
        resultQuery: result.query,
      };
      // 注入样本上下文（breakdown_sample 类型）
      if (payload?.kind === "breakdown_sample") {
        Object.assign(context, {
          sampleTitle: payload.sampleTitle,
          platform: payload.platform,
          contentForm: payload.contentForm,
          anomaly: payload.anomaly,
          fansLabel: payload.fansLabel,
          playCount: payload.playCount,
          trackTags: payload.trackTags,
          burstReasons: payload.burstReasons,
          breakdownSummary: payload.breakdownSummary,
          copyPoints: payload.copyPoints,
          avoidPoints: payload.avoidPoints,
          migrationSteps: payload.migrationSteps,
          titleVariants: payload.titleVariants,
          hookVariants: payload.hookVariants,
          contentOutline: payload.contentOutline,
        });
      }
      // 注入机会判断上下文（opportunity_prediction 类型，或包含 trendOpportunities）
      if (payload?.kind === "opportunity_prediction" || result.taskIntent === "opportunity_prediction" || hasTrendOpps) {
        // 注入真实搜索到的内容样本
        const topContents = (result.supportingContents || []).slice(0, 5).map(c => ({
          title: c.title,
          author: c.authorName,
          platform: c.platform,
          likes: c.likeCount,
          comments: c.commentCount,
          shares: c.shareCount,
          collects: c.collectCount,
          keywords: c.keywordTokens,
          structure: c.structureSummary,
        }));
        // 注入真实搜索到的账号样本
        const topAccounts = (result.supportingAccounts || []).slice(0, 5).map(a => ({
          name: a.displayName,
          handle: a.handle,
          platform: a.platform,
          tier: a.tierLabel,
          followers: a.followerCount,
          topics: a.recentTopicClusters,
        }));
        Object.assign(context, {
          opportunityScore: result.score,
          verdictLabel: result.primaryCard?.title,
          whyNow: result.whyNowItems?.map(w => w.fact),
          topContents,
          topAccounts,
          marketEvidence: result.marketEvidence,
          lowFollowerEvidence: (result.lowFollowerEvidence || []).slice(0, 3).map(e => ({
            title: e.title,
            account: e.account,
            fans: e.fansLabel,
            anomaly: e.anomaly,
            playCount: e.playCount,
          })),
          bestFor: result.bestFor,
          notFor: result.notFor,
          trackTags: payload?.kind === "opportunity_prediction" ? payload.supportingProofTitles : [],
        });
      }
      // 注入账号诊断上下文（account_diagnosis 类型）
      if (payload?.kind === "account_diagnosis") {
        const diagPayload = payload as unknown as Record<string, unknown>;
        Object.assign(context, {
          accountHandle: diagPayload.accountHandle,
          accountPlatform: diagPayload.platform,
          accountTrack: diagPayload.primaryTrack,
          accountFollowers: diagPayload.followerCount,
        });
      }
      // 注入选题策略 V2 上下文（topic_strategy 类型）
      if (result.taskIntent === "topic_strategy" && result.topicStrategyV2) {
        const v2 = result.topicStrategyV2;
        Object.assign(context, {
          topicStrategyV2: {
            track: v2.track,
            accountStage: v2.accountStage,
            platforms: v2.platforms,
            strategySummary: v2.strategySummary,
            directions: v2.directions.map(d => ({
              directionName: d.directionName,
              validationScore: d.validationScore,
              logic: d.directionLogic,
              executableTopics: d.executableTopics,
              subDirections: d.evolvedChildren?.map(c => ({ name: c.directionName, angle: c.directionLogic })),
            })),
            peerBenchmarks: v2.peerBenchmarks?.map(p => ({
              accountName: p.displayName,
              followerCount: p.followerCount,
              engagementRate: p.avgInteractionRate,
              recentWorks: p.recentWorks,
            })),
            crossIndustryInsights: v2.crossIndustryInsights?.map(c => ({
              inspiration: c.migrationIdea,
              sourceIndustry: c.sourceIndustry,
              transferableElements: c.transferableElements.map(t => t.element),
            })),
            searchKeywords: v2.searchKeywords,
          },
        });
      }
      setEditorStreamPayload({
        body: {
          actionId: ctaAction.id,
          modelId: state.selectedModel,
          context,
          baseCost: chargedCost,
        },
      });
      setEditorMarkdown(""); // 清空 mock markdown
    } else {
      // mock 模式：本地生成 markdown
      const md = generateCtaMarkdown(ctaAction.id, ctaAction.title, ctaAction.prompt, result);
      setEditorMarkdown(md);
      setEditorStreamPayload(null); // 确保清空
    }

    setEditorOpen(true);
  };

  /** 查看 follow-up 结果时弹出编辑器 */
  const handleViewFollowUp = (item: ResultRecord["followUps"][number]) => {
    setEditorTitle(`深挖：${item.label.slice(0, 20)}`);
    setEditorSubtitle(`基于「${result.query || result.title}」的进一步分析`);
    setEditorExpanded(false);

    if (dataMode === "live" && item.liveStreamPending) {
      // live 模式：通过 SSE 流式调用后端 LLM
      const payload = result.taskPayload;
      const context: Record<string, unknown> = {
        userPrompt: item.label,
        resultTitle: result.title,
        resultQuery: result.query,
      };
      if (payload?.kind === "breakdown_sample") {
        Object.assign(context, {
          sampleTitle: payload.sampleTitle,
          platform: payload.platform,
          contentForm: payload.contentForm,
          trackTags: payload.trackTags,
          burstReasons: payload.burstReasons,
          breakdownSummary: payload.breakdownSummary,
        });
      }
      setEditorStreamPayload({
        body: {
          actionId: "deep_dive",
          modelId: state.selectedModel,
          context,
          baseCost: item.cost,
        },
      });
      setEditorMarkdown("");
    } else {
      // mock 模式：本地生成 markdown
      const md = generateFollowUpMarkdown(item.label, item.result, result);
      setEditorMarkdown(md);
      setEditorStreamPayload(null);
    }

    setEditorOpen(true);
  };

  /* handleCardAction - reserved for future primaryCard click handling
  const handleCardAction = (card: ResultRecord["primaryCard"]) => {
    if (card.actionMode === "navigate") {
      navigate(card.actionTarget ?? resolvePrimaryActionHref(result));
      return;
    }
    if (card.actionMode === "save_snapshot") {
      void (async () => {
        setArtifactAction("save");
        setArtifactError(null);
        try {
          await saveResultArtifact(result);
        } catch (error) {
          setArtifactError(error instanceof Error ? error.message : "保存失败，请稍后再试。");
        } finally {
          setArtifactAction(null);
        }
      })();
      return;
    }
    setDeepDivePrompt(card.actionPrompt ?? "");
    setShowDeepDive(true);
  };
  */

  const handleSaveArtifact = async () => {
    setArtifactAction("save");
    setArtifactError(null);
    try {
      await saveResultArtifact(result);
      toast.success("保存成功", { description: "分析结果已保存，可在历史记录中随时查看" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "保存失败";
      if (msg.includes("后端") || msg.includes("unavailable") || msg.includes("fetch")) {
        toast.error("保存失败", { description: `后端服务未就绪：${msg}` });
        setArtifactError(`后端服务未就绪：${msg}。请确认后端服务已启动。`);
      } else {
        toast.error("保存失败", { description: msg });
        setArtifactError(`保存失败：${msg}`);
      }
    } finally {
      setArtifactAction(null);
    }
  };

  const handleEnsureWatch = async () => {
    if (!canWatch) return;
    setArtifactAction("watch");
    setArtifactError(null);
    try {
      await ensureResultWatch(result);
      toast.success("已加入智能监控", { description: "系统将持续跟踪这个赛道的数据变化，有异动会第一时间通知你" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "加入监控失败";
      if (msg.includes("后端") || msg.includes("unavailable") || msg.includes("fetch")) {
        toast.error("加入监控失败", { description: `后端服务未就绪：${msg}` });
        setArtifactError(`后端服务未就绪：${msg}。请确认后端服务已启动。`);
      } else {
        toast.error("加入监控失败", { description: msg });
        setArtifactError(`加入监控失败：${msg}`);
      }
    } finally {
      setArtifactAction(null);
    }
  };

  const handleRunWatch = async () => {
    if (!artifactStatus?.watchTaskId) return;
    setArtifactAction("run");
    setArtifactError(null);
    try {
      await runResultWatchTask(artifactStatus.watchTaskId);
      toast.success("复查完成", { description: "已获取最新数据，结果已更新" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "复查失败，请稍后再试";
      toast.error("复查失败", { description: msg });
      setArtifactError(msg);
    } finally {
      setArtifactAction(null);
    }
  };

  /* ---- Render ---- */
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
      {/* ========== 顶部：查询回显 + 重新提问 ========== */}
      <div className="flex flex-col items-start gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 w-full break-words text-xs leading-relaxed text-gray-400 line-clamp-2 sm:flex-1">
          {result.query}
        </p>
        {result.taskIntent === "breakdown_sample" ? (
          <button
            type="button"
            onClick={() => navigate("/low-follower-opportunities")}
            className="flex shrink-0 items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <ArrowLeft className="h-3 w-3" />
            返回
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="flex shrink-0 items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <RotateCcw className="h-3 w-3" />
            重新提问
          </button>
        )}
      </div>

      {/* ========== 积分不足提示 ========== */}
      {shortfall !== null && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <Coins className="h-3.5 w-3.5 shrink-0" />
            当前积分不足，还差 {shortfall} 积分。你的输入已保留，可以继续修改或去充值。
          </div>
          <button
            type="button"
            onClick={() => {
              if (paywallContext) {
                setPaywallContext({ ...paywallContext });
              } else {
                navigate("/credits");
              }
            }}
            className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-amber-700"
          >
            立即充值
          </button>
        </div>
      )}

      {/* 场景化付费墙弹窗 */}
      <PaywallModal
        open={paywallContext !== null}
        onClose={() => setPaywallContext(null)}
        context={paywallContext ?? { actionLabel: "", requiredCredits: 0, shortfall: 0 }}
        onTopUpComplete={() => {
          setShortfall(null);
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        }}
      />

      {/* ========== 保存 / 观察面板 ========== */}
      <div className="rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-gray-800">保存 / 观察这次判断</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-400">
              {canWatch
                ? "保存后可随时回看这次分析结果；加入观察后，系统会定期帮你跟踪这个赛道的数据变化，有新变化时及时通知你。"
                : "保存后可随时回看这次分析结果，后续从历史记录继续深入分析。"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                {artifactStatus ? "已保存" : "未保存"}
              </span>
              <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                {canWatch
                  ? getWatchStatusLabel(watchTask?.status ?? artifactStatus?.watchStatus)
                  : "仅保存"}
              </span>
              <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                最近复查：{formatDateTime(artifactStatus?.lastWatchRunAt ?? watchTask?.lastRunAt)}
              </span>
              <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                {getExecutionStatusLabel(
                  artifactStatus?.lastExecutionStatus ?? watchTask?.lastExecutionStatus,
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleSaveArtifact}
              disabled={artifactAction !== null || Boolean(artifactStatus)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
            >
              <Bookmark className="h-4 w-4" />
              {artifactStatus ? "已保存这次结果" : artifactAction === "save" ? "保存中..." : "保存这次结果"}
            </button>
            {canWatch ? (
              <button
                type="button"
                onClick={handleEnsureWatch}
                disabled={artifactAction !== null || Boolean(artifactStatus?.watchTaskId)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <Eye className="h-4 w-4" />
                {artifactStatus?.watchTaskId ? "已经加入观察" : artifactAction === "watch" ? "加入中..." : "加入观察"}
              </button>
            ) : null}
            {canWatch && artifactStatus?.watchTaskId && (
              <button
                type="button"
                onClick={handleRunWatch}
                disabled={artifactAction !== null}
                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
              >
                <RefreshCw className={`h-4 w-4 ${artifactAction === "run" ? "animate-spin" : ""}`} />
                {artifactAction === "run" ? "复查中..." : "立即复查"}
              </button>
            )}
          </div>
        </div>

        {watchTask?.degradeReason && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            上次复查降级说明：{watchTask.degradeReason}
          </p>
        )}

        {artifactError && (
          <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
            {artifactError}
          </p>
        )}
      </div>

      {/* ========== 直接需求模式：用编辑器展示而非结构化卡片 ========== */}
      {isDirectMode ? (
        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {/* 编辑器头部 */}
          <div className="border-b border-gray-50 px-5 py-4 sm:px-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-gray-900">{result.title || result.opportunityTitle || "分析报告"}</h2>
                  <p className="text-[11px] text-gray-400">{taskMeta.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white">{taskMeta.label}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{resultModel.name}</span>
              </div>
            </div>
          </div>

          {/* AI 状态条 */}
          <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50/50 px-6 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] text-gray-500">分析已完成</span>
          </div>

          {/* Markdown 内容区 */}
          <div className="px-8 py-6 prose prose-sm prose-gray max-w-none">
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(directMarkdown
                  .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mb-4">$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-gray-800 mt-6 mb-3">$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3 class="text-sm font-medium text-gray-700 mt-4 mb-2">$1</h3>')
                  .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-gray-200 pl-4 text-xs text-gray-500 my-3">$1</blockquote>')
                  .replace(/^- (.+)$/gm, '<li class="text-sm text-gray-700 ml-4">$1</li>')
                  .replace(/^---$/gm, '<hr class="my-4 border-gray-100" />')
                  .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em class="text-gray-600">$1</em>')
                  .replace(/\|(.+)\|/g, (match) => {
                    if (match.includes('---')) return '';
                    const cells = match.split('|').filter(Boolean).map(c => c.trim());
                    return `<div class="flex gap-4 py-1.5 text-xs border-b border-gray-50">${cells.map(c => `<span class="flex-1 text-gray-600">${c}</span>`).join('')}</div>`;
                  })
                  .replace(/\n\n/g, '<br/>')
                  .replace(/\n/g, ' ')),
              }}
            />
          </div>

          {/* 底部信息 */}
          <div className="border-t border-gray-100 px-6 py-3">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>模型：{resultModel.name}</span>
              <span>余额：{state.credits} 积分</span>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* ========== Hero Header ========== */}
      {!hasTrendOpps && (
      <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 px-5 pb-6 pt-7 sm:px-7">
          {/* 标签区 */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white">
              {taskMeta.label}
            </span>
            {isOpportunity && (
              <span className={`rounded px-2 py-0.5 text-xs ${windowMeta.tone}`}>
                {windowMeta.label}
              </span>
            )}
            {isOpportunity && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {opportunityLabel}
              </span>
            )}
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {TASK_CONFIDENCE_META[result.taskIntentConfidence]}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {ENTRY_SOURCE_META[result.entrySource]}
            </span>
            {isOpportunity && (
              <>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {result.confidenceLabel}置信
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {inputFocus.label}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {getMomentumLabelText(result.marketEvidence.momentumLabel)}
                </span>
              </>
            )}
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {canWatch ? "支持观察" : "保存型产物"}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {resultModel.name}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
              {result.platform.join(" / ")}
            </span>
          </div>

          {/* 标题 + 摘要 + 指标卡 */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),280px]">
            <div className="min-w-0">
              <div className="mb-2 text-sm text-gray-500">{taskMeta.description}</div>
              <h2 className="line-clamp-2 break-words text-2xl leading-tight text-gray-900">
                {result.title}
              </h2>
              <p className="mt-3 break-words text-sm leading-relaxed text-gray-700">
                {result.summary}
              </p>

              {isOpportunity ? (
                <>
                  <p className="mt-3 break-words text-sm leading-relaxed text-gray-500">
                    {windowMeta.body}
                  </p>
                  <p className="mt-2 break-words text-sm leading-relaxed text-gray-500">
                    {inputFocus.body}
                  </p>
                </>
              ) : (
                <>
                  {/* BUG-2 修复：替换无意义的调试文案，改为有价值的任务说明 */}
                  {result.taskIntent === "topic_strategy" ? (
                    <p className="mt-3 break-words text-sm leading-relaxed text-gray-500">
                      基于多平台数据采集和 AI 分析，为你生成了经过验证的选题方向和可执行选题。每个方向都经过了低粉爆款案例、评论区需求、同行对标等多维度交叉验证。
                    </p>
                  ) : (
                    <p className="mt-3 break-words text-sm leading-relaxed text-gray-500">
                      基于你的输入和平台数据，生成了一份可直接使用的分析报告。
                    </p>
                  )}
                </>
              )}

              {isOpportunity && result.missIfWait && (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                  <div className="mb-1 text-xs text-emerald-700">如果现在不做，可能会错过</div>
                  <p className="break-words text-sm leading-relaxed text-emerald-900">
                    {result.missIfWait}
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3">
                <div className="mb-1 text-[11px] text-gray-400">
                  {isOpportunity ? "分析范围" : "当前分析范围"}
                </div>
                <p className="break-words text-sm leading-relaxed text-gray-700">
                  {result.decisionBoundary}
                </p>
              </div>
            </div>

            {/* Hero 指标卡（从 Registry 获取） */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              {heroMetricCards.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl bg-gray-50 px-4 py-4 ${item.span ?? ""}`}
                >
                  <div className="text-[11px] text-gray-400">{item.label}</div>
                  <div className="mt-1 break-words text-sm text-gray-900">{item.value}</div>
                  <div className="mt-1 break-words text-xs text-gray-500">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ========== 任务专属内容（Dumb Renderer） ========== */}
      {RendererComponent ? (
        <RendererComponent result={result} />
      ) : (
        /* Fallback：未注册的任务类型 */
        result.evidenceGaps.length > 0 && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 shadow-sm sm:px-7">
            <div className="mb-2 text-sm text-amber-800">可以进一步探索的方向</div>
            <div className="space-y-1.5">
              {result.evidenceGaps.map((item, index) => (
                <p
                  key={`${result.id}-gap-${index}`}
                  className="break-words text-xs leading-relaxed text-amber-900"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        )
      )}
      </>
      )}

      {/* ========== 推荐下一步任务（trendOpps 存在时隐藏） ========== */}
      {!hasTrendOpps && result.recommendedNextTasks.length > 0 && (
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
              <ChevronRight className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm text-gray-800">Agent 建议下一步</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {result.recommendedNextTasks.map((item) => (
              <div
                key={`${result.id}-${item.taskIntent}-${item.title}`}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-500">
                    {TASK_INTENT_META[item.taskIntent].label}
                  </span>
                  <span className="text-[11px] text-gray-300">推荐串联</span>
                </div>
                <div className="text-sm text-gray-900">{item.title}</div>
                <p className="mt-2 break-words text-xs leading-relaxed text-gray-600">
                  {item.reason}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDeepDivePrompt(`基于这次${taskMeta.label}，继续帮我做「${item.title}」。要求：${item.reason}`);
                    setShowDeepDive(true);
                  }}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700"
                >
                  {item.actionLabel}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== CTA 动作面板（从 Registry 获取配置） ========== */}
      {ctaActions.length > 0 && (
        <RegistryCtaActionsPanel
          actions={ctaActions}
          credits={state.credits}
          modelId={state.selectedModel}
          onConsume={handleConsume}
          onCtaAction={handleCtaWithEditor}
        />
      )}

      {/* ========== FOMO 模糊化增值内容 ========== */}
      <FomoTeaser
        variant="inline"
        requiredCredits={35}
        contextLabel={`解锁「${result.title || result.opportunityTitle}」的完整执行建议`}
      />

      {/* ========== 运营视角展开 ========== */}
      {result.operatorPanel && (
        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowOperatorPanel((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-7"
          >
            <div>
              <div className="text-sm text-gray-800">详细信息</div>
              <div className="mt-1 text-xs text-gray-400">
                数据来源、对标账号、注意事项
              </div>
            </div>
            <span className="text-xs text-gray-500">
              {showOperatorPanel ? "收起" : "展开"}
            </span>
          </button>

          {showOperatorPanel && (
            <div className="border-t border-gray-50 px-5 py-5 sm:px-7">
              <div className="rounded-2xl bg-gray-50 px-4 py-4">
                <div className="mb-2 text-xs text-gray-400">判断摘要</div>
                <p className="break-words text-sm leading-relaxed text-gray-700">
                  {result.operatorPanel.reportSummary}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {operatorSections.map((section) => (
                  <div
                    key={section.title}
                    className="rounded-2xl border border-gray-100 bg-white px-4 py-4"
                  >
                    <div className="mb-2 text-xs text-gray-400">{section.title}</div>
                    <div className="space-y-1.5">
                      {section.items.map((item, index) => (
                        <p key={`${section.title}-${index}`} className="break-words text-xs leading-relaxed text-gray-700">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== 深挖 Follow-Up ========== */}
      {result.followUps.map((item) => (
        <div
          key={item.id}
          className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
        >
          <div
            className="cursor-pointer border-b border-gray-50 px-5 pb-4 pt-5 transition-colors hover:bg-gray-50/50 sm:px-7"
            onClick={() => handleViewFollowUp(item)}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                继续深挖
              </span>
              <span className="text-xs text-gray-300">·</span>
              <span className="min-w-0 truncate text-xs text-gray-400">
                针对：{item.label}
              </span>
              <span className="ml-auto text-[11px] text-blue-500">点击查看完整报告 →</span>
            </div>
            <p className="break-words text-sm leading-relaxed text-gray-700">{item.result}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-50 px-5 py-3.5 sm:px-7">
            <span className="mr-0.5 text-xs text-gray-400">继续到</span>
            {followUpActions.map((nextStep) => (
              <button
                key={`${item.id}-${nextStep.label}`}
                type="button"
                onClick={() => {
                  setDeepDivePrompt(nextStep.prompt);
                  setShowDeepDive(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100"
              >
                {nextStep.label}
                <ChevronRight className="h-3 w-3" />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs sm:px-7">
            <span className="flex items-center gap-1 text-gray-600">
              <Check className="h-3 w-3 text-gray-500" />
              已新增：{item.label}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-gray-400">
              {item.cost === 0 ? "免费" : `◎ ${item.cost} 积分`}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-gray-400">余额 {state.credits}</span>
          </div>
        </div>
      ))}

      {/* ========== 深挖输入面板 ========== */}
      {showDeepDive && (
        <PlaceholderFollowUp
          credits={state.credits}
          modelName={selectedModel.name}
          modelId={state.selectedModel}
          autoFocus={showDeepDive}
          prefillPrompt={deepDivePrompt}
          title={deepDiveConfig.title}
          description={deepDiveConfig.description}
          placeholder={deepDiveConfig.placeholder}
          quickActions={deepDiveConfig.quickActions}
          onConsume={handleConsume}
        />
      )}

      {/* ========== 扣子编辑器抽屉 ========== */}
      <CozeEditorDrawer
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editorTitle}
        subtitle={editorSubtitle}
        markdown={editorStreamPayload ? undefined : editorMarkdown}
        streamPayload={editorStreamPayload ?? undefined}
        generatingLabel="AI 正在生成内容..."
        completeLabel="内容生成完成"
        footerLeft={`模型：${selectedModel.name}`}
        footerRight={`余额：${state.credits} 积分`}
        defaultExpanded={editorExpanded}
        allowResize={true}
      />
    </div>
  );
}
