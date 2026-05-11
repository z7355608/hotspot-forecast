/**
 * New Prediction Result Renderer
 * ===============================
 * 爆款预测结果页定位：判断、证据、切口、适配、风险、下一步生成入口。
 */

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Flame,
  ImageOff,
  Play,
  Rocket,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Video,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  ArtifactRendererProps,
  CtaActionConfig,
  DeepDiveConfig,
  FollowUpAction,
  HeroMetricCard,
} from "../artifact-registry";
import { registerArtifactRenderer } from "../artifact-registry";
import type { ResultRecord } from "../../../store/app-data";
import {
  buildPredictionBattlePlan,
  type NextGenerationAction,
  type PositiveRecommendation,
  type PredictionBattlePlan,
  type ReferenceVideoInsight,
  type ScoreExplanationItem,
  type SignalCard,
} from "./prediction-battle-plan";
import { parseVideo } from "../../../lib/video-api";
import { fetchWorkComments, type CommentItem } from "../../../lib/creator-api";

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDate(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(time));
}

function formatCommentMetric(value: number | null | undefined) {
  if (value == null) return "待补";
  return formatNumber(value);
}

function hasMetricValue(value: number | null | undefined) {
  return value != null && Number.isFinite(value);
}

function formatInteractionCount(video: Pick<ReferenceVideoInsight, "likeCount" | "commentCount">) {
  if (!hasMetricValue(video.likeCount) && !hasMetricValue(video.commentCount)) return "待补";
  return formatNumber((video.likeCount ?? 0) + (video.commentCount ?? 0));
}

function platformIdFromLabel(platform: string) {
  if (platform.includes("小红书")) return "xiaohongshu";
  if (platform.includes("快手")) return "kuaishou";
  if (platform.includes("B站") || platform.toLowerCase().includes("bilibili")) return "bilibili";
  return "douyin";
}

function extractContentIdFromUrl(url: string | undefined, platformId: string) {
  if (!url) return "";
  if (platformId === "xiaohongshu") {
    return url.match(/(?:explore|item)\/([0-9a-f]{24})/)?.[1] ?? "";
  }
  if (platformId === "kuaishou") {
    return url.match(/(?:photo|short-video)\/([A-Za-z0-9_-]{8,24})/)?.[1] ?? "";
  }
  return url.match(/video\/([0-9]{15,22})/)?.[1] ?? url.match(/aweme_id=([0-9]{15,22})/)?.[1] ?? "";
}

function getVideoWorkId(video: ReferenceVideoInsight) {
  const platformId = platformIdFromLabel(video.platform);
  const fromId = video.id && !video.id.startsWith("content_") ? video.id : "";
  return fromId || extractContentIdFromUrl(video.contentUrl, platformId);
}

function padTime(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function formatCountdown(remainingMs: number) {
  if (remainingMs <= 0) return "窗口已过";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
}

function useLiveCountdown(plan: PredictionBattlePlan) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!plan.publishDeadlineAt || plan.publishWindowStatus !== "active") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [plan.publishDeadlineAt, plan.publishWindowStatus]);

  if (plan.publishWindowStatus === "expired" || plan.publishWindowStatus === "unknown" || plan.publishWindowStatus === "watch") {
    return {
      label: plan.countdownLabel,
      isExpired: plan.publishWindowStatus === "expired",
      isActive: false,
    };
  }

  if (!plan.publishDeadlineAt) {
    return {
      label: plan.countdownLabel,
      isExpired: false,
      isActive: plan.publishWindowStatus === "active",
    };
  }

  const deadlineMs = new Date(plan.publishDeadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) {
    return {
      label: plan.countdownLabel,
      isExpired: false,
      isActive: plan.publishWindowStatus === "active",
    };
  }

  const remainingMs = deadlineMs - now;
  return {
    label: formatCountdown(remainingMs),
    isExpired: remainingMs <= 0,
    isActive: remainingMs > 0,
  };
}

function useAnimatedNumber(value: number, duration = 700) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);
  return displayValue;
}

function getProxiedCoverUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}

function openCtaEditor(action: NextGenerationAction | { id: string; prompt?: string }, plan: PredictionBattlePlan) {
  window.dispatchEvent(
    new CustomEvent("open-cta-editor", {
      detail: {
        ctaId: action.id,
        prompt: action.prompt,
        directionContext: {
          title: plan.recommendedTitle,
          description: plan.recommendedCut,
          directionTitle: plan.recommendedCut,
          directionDescription: plan.expertJudgement,
          howToShoot: plan.videoStructure.map((step) => `${step.time}：${step.content}`).join("\n"),
          whyNow: plan.whyNow.join("\n"),
          tags: plan.hashtagSuggestions,
        },
      },
    }),
  );
}

function Section({
  id,
  eyebrow,
  title,
  icon: Icon,
  description,
  children,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7 ${className}`}>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-indigo-600">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold leading-8 tracking-normal text-slate-950">{title}</h2>
        {description && <p className="mt-2 max-w-4xl text-[15px] leading-7 text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function toneClass(tone: ScoreExplanationItem["tone"]) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "watch") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function fitToneClass(tone: "good" | "watch" | "risk") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "watch") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function signalToneClass(tone: SignalCard["tone"]) {
  if (tone === "good") return "border-indigo-100 bg-white text-slate-900";
  if (tone === "watch") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-950";
}

function findScore(plan: PredictionBattlePlan, label: string) {
  return plan.scoreExplanation.find((item) => item.label.includes(label));
}

function signalIcon(key: SignalCard["key"]) {
  if (key === "trend") return TrendingUp;
  if (key === "demand") return Target;
  if (key === "supply") return BarChart3;
  return UserCheck;
}

function HeroPredictionCard({ plan }: { plan: PredictionBattlePlan }) {
  const lowFollower = findScore(plan, "低粉");
  const competition = findScore(plan, "竞争");
  const contentGap = findScore(plan, "内容空档");
  const coreScores = compactMetricRows([lowFollower, competition, contentGap]);
  const liveCountdown = useLiveCountdown(plan);
  const animatedScore = useAnimatedNumber(plan.score, 1200);
  const isExpired = liveCountdown.isExpired;
  const isWatch = plan.publishWindowStatus === "watch";
  const urgencyTitle = isExpired
    ? "热度可能已经转向，先复查再补拍"
    : isWatch
      ? "窗口进入后段，先小样验证"
      : "现在不拍，今晚就会被同行铺满";
  const urgencyAction = isExpired
    ? "先复查，再决定是否补拍"
    : isWatch
      ? "轻量测试，不重投入"
      : "今天先拍一条，不要等完整准备";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
        <div className="flex h-full flex-col p-6 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700">
              <Flame className="h-4 w-4" />
              预测结论：{plan.predictionLabel}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">{plan.opportunityLevel}</span>
          </div>

          <h1 className="max-w-5xl text-[36px] font-semibold leading-[1.14] tracking-normal text-slate-950">
            {plan.recommendedTitle}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            {plan.hashtagSuggestions.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-medium leading-5 text-slate-600">
                {tag}
              </span>
            ))}
          </div>

          <p className="mt-5 max-w-4xl text-[17px] font-medium leading-8 text-slate-700">
            推荐切口：{plan.recommendedAngle || plan.recommendedCut}
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <FitBox type="good" title="适合账号" items={plan.suitableAccounts.slice(0, 4)} />
            <FitBox type="risk" title="不适合账号" items={plan.unsuitableAccounts.slice(0, 3)} />
          </div>

          <HeroSourceVideos videos={plan.representativeVideos} />
        </div>

        <aside className="border-t border-slate-100 bg-gradient-to-br from-orange-50/70 via-white to-indigo-50/70 p-6 sm:p-7 lg:border-l lg:border-t-0">
          <div className="grid gap-4">
            <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm ring-1 ring-orange-50">
              <div className="flex w-full flex-col justify-between gap-4">
                <div>
                  <div className={`inline-flex rounded-full px-3 py-1.5 text-[12px] font-semibold leading-5 ${isExpired ? "bg-red-50 text-red-700" : isWatch ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"}`}>
                    {isExpired ? "先复查热度" : isWatch ? "窗口后段" : "今天就该动手"}
                  </div>
                  <h2 className="mt-4 text-[26px] font-semibold leading-tight tracking-normal text-slate-950">
                    {urgencyTitle}
                  </h2>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${isExpired ? "bg-red-50" : isWatch ? "bg-amber-50" : "bg-orange-50"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className={`text-[12px] font-semibold leading-5 ${isExpired ? "text-red-700" : isWatch ? "text-amber-700" : "text-orange-700"}`}>
                        {isExpired ? "窗口状态" : "还能抢先的时间"}
                      </div>
                      <div className={`mt-1 font-mono text-[38px] font-semibold leading-none tabular-nums tracking-normal ${liveCountdown.isActive ? "text-orange-600" : isWatch ? "text-amber-700" : "text-red-700"}`}>
                        {liveCountdown.label}
                      </div>
                    </div>
                    <div className={`rounded-xl bg-white/80 px-3 py-2 text-[13px] font-semibold leading-5 ${isExpired ? "text-red-800" : isWatch ? "text-amber-800" : "text-orange-800"}`}>
                      {urgencyAction}
                    </div>
                  </div>
                  <p className={`mt-3 text-[13px] leading-5 ${isExpired ? "text-red-700" : isWatch ? "text-amber-700" : "text-orange-700"}`}>
                    {plan.publishWindowHint || plan.actionWindow}
                  </p>
                </div>
              </div>
            </div>

            <div className="score-presence rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm ring-1 ring-indigo-50">
              <ScorePresenceStyles />
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start">
                <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-[repeating-conic-gradient(from_0deg,#c7d2fe_0deg,#c7d2fe_2deg,transparent_2deg,transparent_12deg)] opacity-45" />
                  <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.18),transparent_68%)]" />
                  <div
                    className="score-ring relative flex h-24 w-24 items-center justify-center rounded-full p-2 shadow-[0_0_28px_rgba(79,70,229,0.14)]"
                    style={{ background: `conic-gradient(#4f46e5 ${animatedScore * 3.6}deg, #eef2ff 0deg)` }}
                    aria-label={`爆发指数 ${plan.score} 分`}
                  >
                    <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner">
                      <div className="text-3xl font-semibold tracking-normal text-slate-950">{animatedScore}</div>
                      <div className="text-[11px] font-medium text-slate-500">/100 爆发指数</div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-6 text-slate-900">{plan.scoreLabel}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {coreScores.map((item) => (
                      <ScoreMetricChip key={item.label} item={item} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {coreScores.map((item) => (
                  <div key={`${item.label}-reason`} className="rounded-xl bg-indigo-50/70 px-3 py-2">
                    <div className="text-[12px] font-semibold leading-5 text-indigo-700">{item.label}</div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-600">{item.reason}</p>
                  </div>
                ))}
              </div>
              <a
                href="#data-signals"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold leading-5 text-white transition hover:bg-indigo-700"
              >
                查看数据详情
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </aside>
      </div>

      <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 sm:px-7">
        <div className="flex gap-3 text-[15px] leading-7 text-amber-950">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>专家判断：</strong>
            {plan.finalVerdict.replace("系统结论：", "")} 核心切口应放在「{plan.recommendedCut}」，不要直接做资讯合集。
          </span>
        </div>
      </div>
    </section>
  );
}

function ScorePresenceStyles() {
  return (
    <style>
      {`
        @keyframes scorePresence {
          0% { box-shadow: 0 0 0 rgba(79,70,229,0), 0 0 0 rgba(249,115,22,0); }
          28% { box-shadow: 0 18px 42px rgba(79,70,229,0.14), 0 0 0 1px rgba(79,70,229,0.04); }
          100% { box-shadow: 0 10px 28px rgba(15,23,42,0.04), 0 0 0 1px rgba(79,70,229,0.02); }
        }

        @keyframes scoreRingSettle {
          0% { filter: saturate(1.18) brightness(1.04); transform: translateZ(0) scale(1.015); }
          100% { filter: saturate(1) brightness(1); transform: translateZ(0) scale(1); }
        }

        .score-presence {
          animation: scorePresence 3600ms ease-out both;
        }

        .score-ring {
          animation: scoreRingSettle 2800ms ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .score-presence,
          .score-ring {
            animation: none;
          }
        }
      `}
    </style>
  );
}

function HeroSourceVideos({ videos }: { videos: ReferenceVideoInsight[] }) {
  const visibleVideos = videos.slice(0, 3);
  if (visibleVideos.length === 0) return null;
  return (
    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold leading-5 text-blue-800">推荐来源样本</div>
          <p className="mt-1 text-[12px] leading-5 text-blue-700">这个机会不是凭空判断，来自这些已采集内容的共同信号。</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          {visibleVideos.length} 条
        </span>
      </div>
      <div className="grid gap-2">
        {visibleVideos.map((video) => (
          <div key={video.id} className="grid gap-3 rounded-xl bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{video.platform}</span>
                <span className="truncate">@{video.authorName || "未知作者"}</span>
              </div>
              <div className="line-clamp-1 text-[13px] font-semibold leading-5 text-slate-950">{video.title}</div>
              <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-blue-700">{video.topicReason}</div>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <SourceMetric label="互动" value={formatInteractionCount(video)} />
              <SourceMetric label="赞" value={formatNumber(video.likeCount)} />
              <SourceMetric label="评" value={formatCommentMetric(video.commentCount)} muted={video.commentCount == null} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceMetric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${muted ? "bg-slate-50 text-slate-400" : "bg-blue-50 text-blue-700"}`}>
      <div className="text-[10px] leading-3 opacity-70">{label}</div>
      <div className="mt-0.5 truncate font-semibold leading-4">{value}</div>
    </div>
  );
}

function compactMetricRows(items: Array<ScoreExplanationItem | undefined>): ScoreExplanationItem[] {
  return items.filter((item): item is ScoreExplanationItem => Boolean(item));
}

function ScoreMetricChip({ item }: { item: ScoreExplanationItem }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="truncate text-[12px] font-medium leading-4 text-slate-500">{item.label}</div>
      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-5 ${toneClass(item.tone)}`}>{item.value}</div>
    </div>
  );
}

function FitBox({ type, title, items }: { type: "good" | "risk"; title: string; items: string[] }) {
  const positive = type === "good";
  return (
    <div className={`rounded-2xl border p-4 ${positive ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className={`mb-2 flex items-center gap-2 text-[13px] font-semibold leading-5 ${positive ? "text-emerald-800" : "text-red-800"}`}>
        {positive ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {title}
      </div>
      <div className={`text-[15px] leading-7 ${positive ? "text-emerald-950" : "text-red-950"}`}>
        {items.length ? items.join(" / ") : "暂无账号画像信息"}
      </div>
    </div>
  );
}

function SignalSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <Section id="data-signals" eyebrow="预测依据" title="为什么这个机会值得跟？" icon={TrendingUp}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plan.signalCards.map((card) => (
          <SignalCardArticle key={card.key} card={card} />
        ))}
      </div>
    </Section>
  );
}

function SignalCardArticle({ card }: { card: SignalCard }) {
  const Icon = signalIcon(card.key);
  const animatedValue = useAnimatedNumber(card.chartValue, 800);
  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${signalToneClass(card.tone)}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <div className="text-[15px] font-semibold leading-6">{card.label}</div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="whitespace-nowrap text-[26px] font-semibold leading-tight tracking-normal text-slate-950 sm:text-[28px]">{card.value}</div>
          <div className="mt-2 text-[12px] font-medium leading-4 text-slate-400">{card.chartLabel}</div>
        </div>
        <MiniBarChart value={animatedValue} tone={card.tone} />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-700 ease-out" style={{ width: `${animatedValue}%` }} />
      </div>
      <p className="mt-3 text-[14px] leading-6 text-slate-600">{card.detail}</p>
      {card.subDetail && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-500">{card.subDetail}</p>}
    </article>
  );
}

function MiniBarChart({ value, tone }: { value: number; tone: SignalCard["tone"] }) {
  const bars = [20, 40, 60, 80, 100];
  const color = tone === "risk" ? "bg-red-500" : tone === "watch" ? "bg-amber-500" : "bg-indigo-600";
  return (
    <div className="flex h-14 w-20 items-end gap-1 rounded-xl bg-slate-50 px-2 py-2">
      {bars.map((bar) => (
        <span
          key={bar}
          className={`block flex-1 rounded-t transition-colors ${value >= bar ? color : "bg-indigo-100"}`}
          style={{ height: `${bar}%` }}
        />
      ))}
    </div>
  );
}

function BestCutSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <Section
      eyebrow="推荐创作切口"
      title="今天先按这个角度拍"
      icon={Target}
      description="别做泛泛的 AI 资讯，先用这个切口发一条验证内容。"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="text-[16px] font-semibold leading-6 text-emerald-900">推荐切口：{plan.recommendedCut}</div>
          <p className="mt-3 text-[15px] leading-7 text-emerald-950">{plan.recommendedAngle}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InfoBlock label="内容类型" value={plan.recommendedContentType} />
            <InfoBlock label="叙事方式" value={plan.narrativeApproach} />
            <InfoBlock label="承接方式" value={plan.conversionApproach} />
          </div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="text-[16px] font-semibold leading-6 text-red-900">不推荐切口</div>
          <div className="mt-4 grid gap-2">
            {plan.notRecommendedCuts.map((item) => (
              <div key={item} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-[15px] leading-7 text-red-900">
                <XCircle className="mt-1 h-4 w-4 shrink-0 text-red-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="text-[12px] font-medium leading-4 text-slate-400">{label}</div>
      <div className="mt-1 text-[15px] font-semibold leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function AccountFitSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <Section eyebrow="账号适配判断" title="你的账号适配度参考" icon={UserCheck}>
      <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[13px] font-semibold leading-5 text-indigo-900">账号数据</div>
            <div className="mt-1 text-[15px] leading-7 text-indigo-950">{plan.accountContextLabel}</div>
          </div>
          <div className="rounded-xl bg-white px-3 py-2 text-[13px] leading-5 text-indigo-700 sm:max-w-xl">
            {plan.accountContextNote}
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {plan.accountFitAssessments.map((item) => (
          <article key={item.accountType} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="text-[15px] font-semibold leading-6 text-slate-950">{item.accountType}</div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${fitToneClass(item.tone)}`}>{item.fit}</span>
            </div>
            <p className="text-[14px] leading-6 text-slate-600">{item.suggestion}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function CompetitiveSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <Section eyebrow="竞品内容现状" title="现在别人怎么做？你怎么避开同质化？" icon={Search}>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        {plan.competitiveSummary.map((finding, index) => (
          <article
            key={finding.label}
            className={`rounded-2xl border p-5 ${
              index === 0
                ? "border-emerald-200 bg-emerald-50"
                : index === 1
                  ? "border-orange-200 bg-orange-50"
                  : "border-teal-200 bg-teal-50"
            }`}
          >
            <div className="text-[15px] font-semibold leading-6 text-slate-950">{finding.label}</div>
            <p className="mt-2 text-[15px] leading-7 text-slate-700">{finding.currentState}</p>
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[14px] leading-6 text-emerald-700">机会：{finding.opportunity}</p>
          </article>
        ))}
      </div>
      <ReferenceVideosSection plan={plan} />
    </Section>
  );
}

function ReferenceVideosSection({ plan }: { plan: PredictionBattlePlan }) {
  const [expanded, setExpanded] = useState(false);
  const visibleVideos = expanded ? plan.referenceVideoInsights : plan.representativeVideos;
  if (plan.referenceVideoInsights.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold leading-6 text-slate-950">代表性参考视频</div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">先看 3 条代表样本：学结构、避同质化、找低粉切入点。</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {visibleVideos.map((video) => (
          <ReferenceVideoCard key={video.id} video={video} />
        ))}
      </div>
      {plan.referenceVideoInsights.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-medium leading-5 text-slate-600 transition hover:bg-slate-50"
        >
          <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "收起更多参考" : `查看更多参考视频（共 ${plan.referenceVideoInsights.length} 条）`}
        </button>
      )}
    </div>
  );
}

function roleLabel(role: ReferenceVideoInsight["role"]) {
  if (role === "learn") return "最值得学习";
  if (role === "avoid") return "容易同质化";
  return "适合中腰部复制";
}

function ReferenceVideoCard({ video }: { video: ReferenceVideoInsight }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const cover = getProxiedCoverUrl(video.coverUrl);
  const showCover = Boolean(cover) && !coverFailed;
  const body = (
    <article className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[16/10] bg-slate-100">
        {showCover ? (
          <img
            src={cover ?? ""}
            alt={video.title}
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
            <ImageOff className="h-5 w-5" />
            <span className="text-xs">封面待补充</span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-slate-950/85 px-2 py-1 text-[11px] font-semibold text-white">
          {roleLabel(video.role)}
        </span>
        {video.contentUrl && (
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
            <Play className="ml-0.5 h-3.5 w-3.5 text-slate-900" />
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-[12px] leading-4 text-slate-400">
          <span className="truncate">@{video.authorName}</span>
          <span className="shrink-0">{formatDate(video.publishedAt)}</span>
        </div>
        <h3 className="line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-slate-950">{video.title}</h3>
        <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-[12px] leading-5 text-blue-700">{video.topicReason}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="互动" value={formatInteractionCount(video)} />
          <Metric label="赞" value={formatNumber(video.likeCount)} />
          <Metric label="评" value={formatCommentMetric(video.commentCount)} muted={video.commentCount == null} />
        </div>
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <InsightLine label="爆点" value={video.viralPoint} />
          <InsightLine label="可复制点" value={video.copyablePoint} />
          <InsightLine label="不建议复制" value={video.avoidPoint} />
        </div>
      </div>
    </article>
  );
  if (!video.contentUrl) return body;
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPlayerOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPlayerOpen(true);
          }
        }}
        className="block h-full w-full cursor-pointer text-left"
      >
        {body}
      </div>
      {playerOpen && (
        <InlineVideoPlayer
          video={video}
          coverUrl={cover}
          onClose={() => setPlayerOpen(false)}
        />
      )}
    </>
  );
}

function InlineVideoPlayer({
  video,
  coverUrl,
  onClose,
}: {
  video: ReferenceVideoInsight;
  coverUrl: string | null;
  onClose: () => void;
}) {
  const [videoSrc, setVideoSrc] = useState("");
  const [playerStatus, setPlayerStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playerError, setPlayerError] = useState("");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsStatus, setCommentsStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [commentsError, setCommentsError] = useState("");
  const platformId = platformIdFromLabel(video.platform);
  const workId = getVideoWorkId(video);

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
                <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-500">{video.platform}</span>
                <span>{formatDate(video.publishedAt)}</span>
              </div>
              <p className="text-sm font-semibold leading-6 text-slate-950">{video.title}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="互动" value={formatInteractionCount(video)} />
                <Metric label="赞" value={formatNumber(video.likeCount)} />
                <Metric label="评" value={formatCommentMetric(video.commentCount)} muted={video.commentCount == null} />
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

function Metric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${muted ? "bg-amber-50" : "bg-slate-50"}`}>
      <div className={`text-[11px] leading-4 ${muted ? "text-amber-500" : "text-slate-400"}`}>{label}</div>
      <div className={`truncate text-[12px] font-semibold leading-4 ${muted ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function InsightLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold leading-4 text-indigo-700">{label}</div>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">{value}</p>
    </div>
  );
}

function PositiveAdviceSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <Section
      eyebrow="关键 Aha"
      title="这波机会真正押在哪里？"
      icon={CheckCircle2}
      description="不是再给一组普通建议，而是把真实样本里最值得下注的杠杆讲清楚。"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plan.positiveRecommendations.map((item) => (
          <PositiveAdviceCard key={item.label} item={item} />
        ))}
      </div>
    </Section>
  );
}

function PositiveAdviceCard({ item }: { item: PositiveRecommendation }) {
  const watch = item.tone === "watch";
  return (
    <article className={`rounded-2xl border p-5 ${watch ? "border-amber-200 bg-amber-50" : "border-violet-200 bg-violet-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[15px] font-semibold leading-6 ${watch ? "text-amber-900" : "text-violet-900"}`}>{item.label}</div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${watch ? "bg-white text-amber-700" : "bg-white text-violet-700"}`}>
          {item.sourceLabel}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold leading-8 tracking-normal text-slate-950">{item.value}</div>
      <p className="mt-3 text-[15px] leading-7 text-slate-700">{item.detail}</p>
    </article>
  );
}

function NextGenerationSection({ plan }: { plan: PredictionBattlePlan }) {
  return (
    <section id="next-generation" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-indigo-600">
            <Rocket className="h-4 w-4" />
            下一步行动
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-8 tracking-normal text-slate-950">确认机会后，再进入内容生成</h2>
          <p className="mt-2 text-[15px] leading-7 text-slate-500">选好切口后，可以直接生成要拍的脚本、标题封面和评论引导，不用重新描述选题。</p>
        </div>
        <button
          type="button"
          onClick={() => openCtaEditor(plan.nextGenerationActions[0] ?? { id: "shoot_plan" }, plan)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-[14px] font-semibold leading-5 text-white transition hover:bg-slate-800"
        >
          按这个预测生成内容方案
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plan.nextGenerationActions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            onClick={() => openCtaEditor(action, plan)}
            className={`rounded-2xl border p-5 text-left transition ${
              index === 0
                ? "border-indigo-200 bg-indigo-50 text-slate-950 hover:bg-indigo-100"
                : "border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] font-semibold leading-6">{action.title}</div>
              <Zap className={`h-4 w-4 ${index === 0 ? "text-indigo-600" : "text-slate-400"}`} />
            </div>
            <p className="mt-2 text-[13px] leading-5 text-slate-600">{action.description}</p>
            <div className="mt-3 text-[12px] leading-4 text-slate-500">{action.suitableFor}</div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
              进入生成
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TopicSwitcher({
  result,
  activeTopicIndex,
  setActiveTopicIndex,
}: {
  result: ResultRecord;
  activeTopicIndex: number;
  setActiveTopicIndex: (index: number) => void;
}) {
  const topics = result.aiTopicSuggestions ?? [];
  if (topics.length <= 1) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 text-[13px] font-medium leading-5 text-slate-400">切换预测切口</div>
      <div className="grid gap-2 md:grid-cols-3">
        {topics.map((topic, index) => (
          <button
            key={`${topic.title}-${index}`}
            type="button"
            onClick={() => setActiveTopicIndex(index)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              activeTopicIndex === index
                ? "border-indigo-300 bg-indigo-50 text-slate-950"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
            }`}
          >
            <div className="mb-1 text-[12px] font-semibold leading-4">切口 #{index + 1}</div>
            <div className="line-clamp-2 text-[15px] font-medium leading-6">{topic.angle || topic.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewPredictionResultBody({ result }: ArtifactRendererProps) {
  const [activeTopicIndex, setActiveTopicIndex] = useState(0);
  const plan = useMemo(() => buildPredictionBattlePlan(result, activeTopicIndex), [result, activeTopicIndex]);

  return (
    <div className="space-y-5 bg-slate-50/60 text-slate-900">
      <HeroPredictionCard plan={plan} />
      <TopicSwitcher result={result} activeTopicIndex={activeTopicIndex} setActiveTopicIndex={setActiveTopicIndex} />
      <SignalSection plan={plan} />
      <BestCutSection plan={plan} />
      <AccountFitSection plan={plan} />
      <CompetitiveSection plan={plan} />
      <PositiveAdviceSection plan={plan} />
      <NextGenerationSection plan={plan} />
    </div>
  );
}

export { NewPredictionResultBody };
export default NewPredictionResultBody;

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const plan = buildPredictionBattlePlan(result);
  return [
    {
      label: "预测结论",
      value: plan.predictionLabel,
      detail: plan.expertJudgement,
      span: "col-span-2 lg:col-span-1",
    },
    {
      label: "爆发指数",
      value: `${plan.score}`,
      detail: plan.scoreExplanation[0]?.reason ?? result.scoreLabel,
    },
    {
      label: "推荐切口",
      value: plan.recommendedCut,
      detail: plan.actionWindow,
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDiveConfig(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续深挖这次预测",
    description: "基于真实样本数据，继续判断切口、风险和账号适配。",
    placeholder: "帮我判断这个机会适不适合我的账号",
    quickActions: [
      { label: "帮我判断这个机会适不适合我的账号", cost: 10 },
      { label: "换一个更适合中腰部账号的切口", cost: 10 },
      { label: "告诉我什么情况下应该放弃这个机会", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  const plan = buildPredictionBattlePlan(result);
  return [
    {
      id: "shoot_plan",
      icon: Rocket,
      title: "生成抖音口播脚本",
      description: "确认机会后，生成 60 秒口播脚本和分镜建议。",
      value: "从预测到可拍内容",
      cost: 30,
      prompt: `基于当前预测切口「${plan.recommendedCut}」，生成抖音口播脚本。`,
      highlight: true,
    },
    {
      id: "xiaohongshu_plan",
      icon: Video,
      title: "生成小红书图文方案",
      description: "把预测切口改成教程型或清单型图文结构。",
      value: "平台适配",
      cost: 25,
      prompt: `基于当前预测切口「${plan.recommendedCut}」，生成小红书图文方案。`,
    },
    {
      id: "title_cover",
      icon: Sparkles,
      title: "生成标题与封面图",
      description: "生成标题、封面文案，并用 Apollo 生成真实封面图。",
      value: "发布包装",
      cost: 25,
      prompt: `基于当前预测切口「${plan.recommendedCut}」，生成标题与封面方案。`,
    },
    {
      id: "weekly_plan",
      icon: CalendarClock,
      title: "生成3天追热点计划",
      description: "把这个机会拆成连续跟进节奏。",
      value: "窗口期跟进",
      cost: 20,
      prompt: `基于当前预测切口「${plan.recommendedCut}」，生成3天追热点计划。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  const plan = buildPredictionBattlePlan(result);
  return [
    { label: "判断这个机会适不适合我的账号", prompt: `基于「${plan.recommendedCut}」判断是否适合我的账号。` },
    { label: "换一个更低粉友好的切口", prompt: `围绕「${plan.originalTopic}」换一个更适合中腰部账号的切口。` },
  ];
}

registerArtifactRenderer({
  artifactType: "opportunity_memo",
  taskIntent: "opportunity_prediction",
  component: NewPredictionResultBody,
  getHeroMetrics,
  getDeepDiveConfig,
  getCtaActions,
  getFollowUpActions,
});
