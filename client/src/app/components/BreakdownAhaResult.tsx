import { useState, useCallback, type ReactNode } from "react";
import {
  AlertTriangle,
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Film,
  Flame,
  Layers,
  Play,
  Shield,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Volume2,
} from "lucide-react";

/* ================================================================== */
/*  类型                                                                */
/* ================================================================== */

export interface BreakdownVideoInfo {
  videoUrl: string;
  title?: string;
  coverUrl?: string;
  author?: string;
}

export interface ShotItem {
  id: number;
  timestamp: { start_seconds: number; end_seconds: number };
  scene_type: string;
  audio_layer: { script: string; bgm_mood: string; sfx_design: string };
  visual_layer: {
    subject_action: string;
    environment: string;
    camera_language: string;
    lighting_style: string;
    visual_stimuli: string;
  };
  neuro_marketing_layer: {
    audience_emotion: string;
    retention_tactic: string;
    conversion_priming: string;
  };
  replication_note: string;
}

export interface BreakdownData {
  meta_strategy: {
    summary: string;
    visual_hammer: string;
    viral_formula: {
      tagline: string;
      hook_strategy: string;
      conversion_logic: string;
      pacing_analysis: string;
    };
    replication_advice: { flaws: string; improvement_plan: string };
  };
  shot_list: ShotItem[];
}

/* ================================================================== */
/*  辅助函数                                                            */
/* ================================================================== */

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 10);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}.${ms}` : `${s}.${ms}s`;
}

function CopyBtn({
  text,
  label = "复制",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "xs";
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (size === "xs") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        copied
          ? "bg-green-50 text-green-600"
          : "bg-gray-900 text-white hover:bg-gray-800"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}

/* ================================================================== */
/*  BreakdownAhaResult — 爆款拆解可视化交付组件                            */
/* ================================================================== */

export function BreakdownAhaResult({
  data,
  videoInfo,
}: {
  data: BreakdownData;
  videoInfo: BreakdownVideoInfo;
}) {
  const [activeTab, setActiveTab] = useState<
    "formula" | "shots" | "neuro" | "replicate"
  >("formula");
  const [expandedShot, setExpandedShot] = useState<number | null>(null);

  const meta = data.meta_strategy;
  const shots = data.shot_list || [];
  const totalDuration =
    shots.length > 0 ? shots[shots.length - 1].timestamp.end_seconds : 0;

  return (
    <div className="space-y-5">
      {/* 顶部成就卡片 — 第一眼就看到价值 */}
      <div className="overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50">
        {/* 视频信息 */}
        <div className="flex gap-4 p-4">
          {videoInfo.coverUrl ? (
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg">
              <img
                src={videoInfo.coverUrl}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Play className="h-6 w-6 text-white" fill="white" />
              </div>
            </div>
          ) : (
            <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-amber-200">
              <Brain className="h-8 w-8 text-orange-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">
              {videoInfo.title || "视频拆解"}
            </h4>
            {videoInfo.author && (
              <p className="mb-1 text-xs text-gray-500">
                @{videoInfo.author}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {totalDuration > 0
                  ? `${Math.round(totalDuration)}s`
                  : "未知"}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {shots.length} 个分镜
              </span>
            </div>
          </div>
        </div>

        {/* 爆点公式 — aha moment 核心 */}
        <div className="border-t border-orange-100 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-white" />
            <span className="text-xs font-medium text-orange-100">
              爆点公式
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-white">
            {meta.viral_formula.tagline}
          </p>
        </div>

        {/* aha moment 数据条 */}
        <div className="grid grid-cols-4 gap-px border-t border-orange-100 bg-orange-100">
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-orange-600">
              {shots.length}
            </div>
            <div className="text-[10px] text-gray-400">分镜数</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-amber-500">
              {Math.round(totalDuration)}s
            </div>
            <div className="text-[10px] text-gray-400">视频时长</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-blue-500">
              {
                shots.filter(
                  (s) => s.neuro_marketing_layer.retention_tactic,
                ).length
              }
            </div>
            <div className="text-[10px] text-gray-400">防流失点</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-purple-500">
              {
                shots.filter(
                  (s) => s.neuro_marketing_layer.conversion_priming,
                ).length
              }
            </div>
            <div className="text-[10px] text-gray-400">转化铺垫</div>
          </div>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {(
          [
            { id: "formula" as const, label: "爆点公式", icon: Flame },
            { id: "shots" as const, label: "分镜时间轴", icon: Film },
            { id: "neuro" as const, label: "神经营销", icon: Brain },
            { id: "replicate" as const, label: "复刻清单", icon: Target },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: 爆点公式 */}
      {activeTab === "formula" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-800">
              <Sparkles className="h-4 w-4" />
              视频核心逻辑
            </h4>
            <p className="text-sm leading-relaxed text-gray-700">
              {meta.summary}
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
              <Eye className="h-4 w-4" />
              视觉锤（Visual Hammer）
            </h4>
            <p className="text-sm leading-relaxed text-gray-700">
              {meta.visual_hammer}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <Target className="h-3.5 w-3.5" />
                钩子策略
              </h5>
              <p className="text-sm text-gray-700">
                {meta.viral_formula.hook_strategy}
              </p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                <TrendingUp className="h-3.5 w-3.5" />
                转化逻辑
              </h5>
              <p className="text-sm text-gray-700">
                {meta.viral_formula.conversion_logic}
              </p>
            </div>
            <div className="col-span-full rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <h5 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <Timer className="h-3.5 w-3.5" />
                节奏分析
              </h5>
              <p className="text-sm text-gray-700">
                {meta.viral_formula.pacing_analysis}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 分镜时间轴 */}
      {activeTab === "shots" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            点击展开查看每个分镜的完整拆解（画面、台词、音效、情绪）
          </p>
          {shots.map((shot) => {
            const isExpanded = expandedShot === shot.id;
            const durationSec =
              shot.timestamp.end_seconds - shot.timestamp.start_seconds;
            return (
              <div
                key={shot.id}
                className="overflow-hidden rounded-xl border border-gray-200 transition-all"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedShot(isExpanded ? null : shot.id)
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-xs font-bold text-orange-700">
                    {shot.id}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900">
                        {formatSeconds(shot.timestamp.start_seconds)} –{" "}
                        {formatSeconds(shot.timestamp.end_seconds)}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {durationSec.toFixed(1)}s
                      </span>
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                        {shot.scene_type}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                      {shot.audio_layer.script}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50/50 px-4 py-4">
                    <div className="rounded-lg bg-white p-3">
                      <h6 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                        <Volume2 className="h-3.5 w-3.5" />
                        音频层
                      </h6>
                      <div className="space-y-1.5">
                        <div className="group flex items-start gap-2">
                          <span className="w-12 shrink-0 text-[10px] text-gray-400">
                            台词
                          </span>
                          <p className="flex-1 text-xs text-gray-700">
                            {shot.audio_layer.script}
                          </p>
                          <CopyBtn
                            text={shot.audio_layer.script}
                            size="xs"
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-12 shrink-0 text-[10px] text-gray-400">
                            BGM
                          </span>
                          <p className="flex-1 text-xs text-gray-600">
                            {shot.audio_layer.bgm_mood}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-12 shrink-0 text-[10px] text-gray-400">
                            音效
                          </span>
                          <p className="flex-1 text-xs text-gray-600">
                            {shot.audio_layer.sfx_design}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white p-3">
                      <h6 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <Camera className="h-3.5 w-3.5" />
                        视觉层
                      </h6>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <span className="text-[10px] text-gray-400">
                            主体动作
                          </span>
                          <p className="text-xs text-gray-700">
                            {shot.visual_layer.subject_action}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400">
                            环境
                          </span>
                          <p className="text-xs text-gray-700">
                            {shot.visual_layer.environment}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400">
                            镜头语言
                          </span>
                          <p className="text-xs text-gray-700">
                            {shot.visual_layer.camera_language}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400">
                            光影风格
                          </span>
                          <p className="text-xs text-gray-700">
                            {shot.visual_layer.lighting_style}
                          </p>
                        </div>
                        <div className="col-span-full">
                          <span className="text-[10px] text-gray-400">
                            视觉刺激点
                          </span>
                          <p className="text-xs text-gray-700">
                            {shot.visual_layer.visual_stimuli}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white p-3">
                      <h6 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-purple-700">
                        <Brain className="h-3.5 w-3.5" />
                        神经营销洞察
                      </h6>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-gray-400">
                            观众情绪
                          </span>
                          <p className="flex-1 text-xs text-gray-700">
                            {shot.neuro_marketing_layer.audience_emotion}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-gray-400">
                            防流失
                          </span>
                          <p className="flex-1 text-xs font-medium text-orange-700">
                            {shot.neuro_marketing_layer.retention_tactic}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-gray-400">
                            转化铺垫
                          </span>
                          <p className="flex-1 text-xs text-gray-700">
                            {shot.neuro_marketing_layer.conversion_priming}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                      <h6 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-orange-700">
                        <Target className="h-3.5 w-3.5" />
                        复刻要点
                      </h6>
                      <p className="text-xs text-orange-800">
                        {shot.replication_note}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: 神经营销洞察 */}
      {activeTab === "neuro" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
              <Eye className="h-4 w-4" />
              视觉锤（Visual Hammer）
            </h4>
            <p className="text-sm leading-relaxed text-gray-700">
              {meta.visual_hammer}
            </p>
            <p className="mt-2 text-xs text-purple-500">
              视觉锤是植入用户心智的超级符号，让观众看一眼就记住
            </p>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-orange-800">
              <Shield className="h-4 w-4" />
              防流失设计（每一秒如何对抗"划走"）
            </h4>
            <div className="space-y-2">
              {shots.map((shot) => (
                <div
                  key={shot.id}
                  className="flex items-start gap-3 rounded-lg bg-white p-2.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-orange-100 text-[10px] font-bold text-orange-700">
                    {shot.id}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {formatSeconds(shot.timestamp.start_seconds)}–
                        {formatSeconds(shot.timestamp.end_seconds)}
                      </span>
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-600">
                        {shot.scene_type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-orange-700">
                      {shot.neuro_marketing_layer.retention_tactic}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      情绪: {shot.neuro_marketing_layer.audience_emotion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-800">
              <TrendingUp className="h-4 w-4" />
              转化漏斗拆解
            </h4>
            <div className="space-y-2">
              {shots
                .filter((s) => s.neuro_marketing_layer.conversion_priming)
                .map((shot) => (
                  <div
                    key={shot.id}
                    className="flex items-start gap-3 rounded-lg bg-white p-2.5"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-700">
                      {shot.id}
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] text-gray-400">
                        {formatSeconds(shot.timestamp.start_seconds)}–
                        {formatSeconds(shot.timestamp.end_seconds)}
                      </span>
                      <p className="mt-0.5 text-xs text-blue-700">
                        {shot.neuro_marketing_layer.conversion_priming}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: 复刻清单 */}
      {activeTab === "replicate" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              原视频不足
            </h4>
            <p className="text-sm text-gray-700">
              {meta.replication_advice.flaws}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
              <Sparkles className="h-4 w-4" />
              复刻优化方案
            </h4>
            <p className="text-sm text-gray-700">
              {meta.replication_advice.improvement_plan}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900">
              <Layers className="h-4 w-4" />
              逐镜复刻要点
            </h4>
            <div className="space-y-2">
              {shots.map((shot) => (
                <div
                  key={shot.id}
                  className="group flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 hover:border-orange-200 hover:bg-orange-50/30"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-xs font-bold text-orange-700">
                    {shot.id}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900">
                        {formatSeconds(shot.timestamp.start_seconds)}–
                        {formatSeconds(shot.timestamp.end_seconds)}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {shot.scene_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-orange-800">
                      {shot.replication_note}
                    </p>
                  </div>
                  <CopyBtn
                    text={`[${formatSeconds(shot.timestamp.start_seconds)}-${formatSeconds(shot.timestamp.end_seconds)}] ${shot.scene_type}: ${shot.replication_note}`}
                    size="xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <CopyBtn
              text={[
                `【爆点公式】${meta.viral_formula.tagline}`,
                ``,
                `【视觉锤】${meta.visual_hammer}`,
                ``,
                `【钩子策略】${meta.viral_formula.hook_strategy}`,
                ``,
                `【转化逻辑】${meta.viral_formula.conversion_logic}`,
                ``,
                `【原视频不足】${meta.replication_advice.flaws}`,
                ``,
                `【复刻优化方案】${meta.replication_advice.improvement_plan}`,
                ``,
                `【逐镜复刻要点】`,
                ...shots.map(
                  (s) =>
                    `${s.id}. [${formatSeconds(s.timestamp.start_seconds)}-${formatSeconds(s.timestamp.end_seconds)}] ${s.scene_type}: ${s.replication_note}`,
                ),
              ].join("\n")}
              label="复制全部拆解报告"
            />
          </div>
        </div>
      )}
    </div>
  );
}
