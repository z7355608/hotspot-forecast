import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Coins,
  Eye,
  Lightbulb,
  Loader2,
  Lock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
// `Coins` 已经在原 import 里：用于「余额 / 本次消耗」展示
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { PaywallModal, type PaywallContext } from "../components/PaywallModal";
import {
  getChargedCost,
  getModelOption,
  normalizePlan,
  type LowFollowerSample,
} from "../store/app-data";

/**
 * 与后端 `BASE_ANALYSIS_COST` 同值。后端是计费源，这里仅做 UI 展示与拦截。
 */
const BREAKDOWN_COST = 20;

/**
 * 解析 viralBreakdownDirect 抛的 INSUFFICIENT_CREDITS 错误：
 * 错误 message 形如 `INSUFFICIENT_CREDITS:{cost}:{balance}`，
 * 由 server/routers/copywriting.ts 在余额不足或扣减失败时构造。
 */
function parseInsufficientCreditsError(
  msg: string | undefined,
): { cost: number; balance: number } | null {
  if (!msg) return null;
  const m = /INSUFFICIENT_CREDITS:(\d+):(\d+)/.exec(msg);
  if (!m) return null;
  return { cost: Number(m[1]), balance: Number(m[2]) };
}
import { useAppStore } from "../store/app-store";
import { useOnboarding } from "../lib/onboarding-context";
import { getProxiedImageUrl } from "../lib/media-proxy";
import { trpc } from "@/lib/trpc";
import { stripHashtags, type LowFollowerItem } from "./HotTopicRecommendationsPage";

const ACTIONS = [
  {
    id: "advice",
    primary: true,
    cost: 20,
    label: "生成我的借鉴建议",
    shortDesc: "基于样本爆因，生成适合你账号方向的可落地策略",
    desc: "借鉴建议",
    confirmDesc: "基于你的账号方向生成可落地的借鉴策略",
  },
  {
    id: "rewrite",
    primary: false,
    cost: 20,
    label: "按我的方向重写切口",
    shortDesc: "保留爆因结构，替换成你的赛道和内容表达",
    desc: "切口改写",
    confirmDesc: "将这个选题切口改写成适合你内容角度的版本",
  },
  {
    id: "title",
    primary: false,
    cost: 30,
    label: "生成类似标题",
    shortDesc: "输出 3 个可直接使用的标题方向",
    desc: "3 个标题方向",
    confirmDesc: "生成 3 个适配你平台和赛道的类似标题",
  },
  {
    id: "hook",
    primary: false,
    cost: 30,
    label: "生成开头钩子",
    shortDesc: "生成 3 个强留存的前 3 秒钩子",
    desc: "3 个钩子方向",
    confirmDesc: "生成 3 个适配短视频前 3 秒留存逻辑的钩子",
  },
  {
    id: "outline",
    primary: false,
    cost: 30,
    label: "输出内容提纲",
    shortDesc: "含节奏建议的完整内容结构提纲",
    desc: "完整提纲结构",
    confirmDesc: "输出含节奏建议的完整内容结构提纲",
  },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-12">
        <svg className="-rotate-90 h-12 w-12" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r={r} fill="none" stroke="#f3f4f6" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke="#1f2937"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-800">
          {score}
        </span>
      </div>
      <span className="text-center text-[11px] leading-tight text-gray-500">{label}</span>
    </div>
  );
}

function AnalysisCard({
  title,
  judgment,
  explanation,
  evidence,
  evidenceStat,
  icon,
  locked,
  membershipLocked,
}: {
  title: string;
  judgment: string;
  explanation: string;
  evidence: string;
  evidenceStat: string;
  icon: ReactNode;
  locked?: boolean;
  membershipLocked?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5">
      {locked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/88 backdrop-blur-sm">
          <Lock className="mb-1.5 h-4 w-4 text-gray-300" />
          <p className="mb-3 text-xs text-gray-400">会员查看完整爆因拆解</p>
          {membershipLocked}
        </div>
      )}
      <div className={locked ? "select-none opacity-25" : ""}>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
            {icon}
          </div>
          <span className="text-[11px] uppercase tracking-wide text-gray-500">{title}</span>
        </div>
        <p className="mb-2 text-sm leading-snug text-gray-800">{judgment}</p>
        <p className="mb-3 text-xs leading-relaxed text-gray-500">{explanation}</p>
        <div className="flex items-start gap-2 border-t border-gray-50 pt-3">
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-[10px] text-gray-600">
            <TrendingUp className="h-2.5 w-2.5 text-gray-500" />
            {evidenceStat}
          </div>
          <p className="text-[11px] leading-relaxed text-gray-400">{evidence}</p>
        </div>
      </div>
    </div>
  );
}

function SimilarCard({
  sample,
  locked,
}: {
  sample: LowFollowerSample;
  locked?: boolean;
}) {
  const coverUrl = getProxiedImageUrl(sample.img);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white">
      {locked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/82 backdrop-blur-sm">
          <Lock className="mb-1.5 h-4 w-4 text-gray-400" />
          <p className="mb-3 text-xs text-gray-400">解锁完整相似样本</p>
        </div>
      )}
      <div className={locked ? "select-none opacity-25" : ""}>
        <div className="relative">
          <ImageWithFallback src={coverUrl ?? sample.img} alt={sample.title} className="h-28 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute left-2 top-2">
            <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] text-white">
              {sample.anomaly}倍
            </span>
          </div>
          <div className="absolute bottom-2 left-2">
            <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] text-gray-600">
              {sample.platform}
            </span>
          </div>
        </div>
        <div className="p-3.5">
          <p className="mb-1.5 line-clamp-2 text-xs leading-snug text-gray-800">{sample.title}</p>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-gray-400">{sample.account}</span>
            <span className="shrink-0 text-[11px] text-gray-400">{sample.fansLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {sample.trackTags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedPreviewSection({
  title,
  desc,
  actionLabel,
  onAction,
}: {
  title: string;
  desc: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
      <p className="mb-1.5 text-sm text-gray-800">{title}</p>
      <p className="mx-auto mb-4 max-w-md text-xs leading-relaxed text-gray-400">
        {desc}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="rounded-xl bg-gray-900 px-4 py-2 text-xs text-white transition-colors hover:bg-gray-700"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function InvalidBreakdown({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 text-base text-gray-700">这个样本不存在</p>
      <p className="mb-6 text-sm text-gray-400">可能已被移除，或者当前本地状态尚未恢复。</p>
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
      >
        返回低粉爆款
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live Breakdown View                                                 */
/*                                                                      */
/*  当从「爆款选题推荐」页跳转过来（location.state.kind === "live"）时，     */
/*  使用作品的 contentUrl 调用 viralBreakdownDirect，渲染完整拆解结果。   */
/*  这条路径绕过预测 agent / 意图识别，作品信息已知，直接拆解。            */
/* ------------------------------------------------------------------ */

function LiveBreakdownView({ item }: { item: LowFollowerItem }) {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const triggeredRef = useRef(false);
  const cleanTitle = stripHashtags(item.title) || item.title || "未命名作品";
  const coverUrl = getProxiedImageUrl(item.coverUrl);

  // 余额：进页拉一次，扣减成功后会用返回的 balanceAfter 直接 setQueryData 同步
  const balanceQuery = trpc.credits.getBalance.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const credits = balanceQuery.data?.credits ?? 0;

  // 付费墙状态：从拆解 mutation 错误中识别 INSUFFICIENT_CREDITS 时打开
  const [paywallContext, setPaywallContext] = useState<PaywallContext | null>(null);

  const mutation = trpc.copywriting.viralBreakdownDirect.useMutation({
    onSuccess: (data) => {
      // 后端返回 charge.balanceAfter；写回本地缓存避免重复 query
      if (data?.charge && typeof data.charge.balanceAfter === "number") {
        const next = data.charge.balanceAfter;
        trpcUtils.credits.getBalance.setData(undefined, (prev) => ({
          ...(prev ?? { credits: 0, membershipPlan: "free" }),
          credits: next,
        }));
      }
    },
    onError: (err) => {
      const insufficient = parseInsufficientCreditsError(err.message);
      if (insufficient) {
        // 同步真实余额（后端给的更可信），并打开付费墙
        trpcUtils.credits.getBalance.setData(undefined, (prev) => ({
          ...(prev ?? { credits: 0, membershipPlan: "free" }),
          credits: insufficient.balance,
        }));
        setPaywallContext({
          actionLabel: "深度拆解",
          requiredCredits: insufficient.cost,
          shortfall: Math.max(0, insufficient.cost - insufficient.balance),
          contextDescription: `解锁「${cleanTitle}」的完整 AI 拆解（含 25 分镜脚本）`,
        });
      }
    },
  });

  const trigger = () => {
    if (!item.contentUrl) return;
    triggeredRef.current = true;
    mutation.mutate({
      videoUrl: item.contentUrl,
      videoId: item.videoId,
      platform: item.platform,
      title: cleanTitle,
      coverUrl: item.coverUrl ?? undefined,
      author: item.authorName,
    });
  };

  useEffect(() => {
    if (triggeredRef.current) return;
    // 余额不足时不直接发起拆解，先弹付费墙；用户充值后会被 onTopUpComplete 重试
    if (credits > 0 && credits < BREAKDOWN_COST) {
      triggeredRef.current = true;
      setPaywallContext({
        actionLabel: "深度拆解",
        requiredCredits: BREAKDOWN_COST,
        shortfall: BREAKDOWN_COST - credits,
        contextDescription: `解锁「${cleanTitle}」的完整 AI 拆解（含 25 分镜脚本）`,
      });
      return;
    }
    trigger();
    // 余额可能在异步 query 后才回来；balanceQuery.data 变化时让 effect 再判断一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceQuery.data]);

  const breakdown = mutation.data?.breakdown ?? null;
  const charge = mutation.data?.charge ?? null;
  const isPending = mutation.isPending;
  const error = mutation.error;
  // 错误是 INSUFFICIENT_CREDITS 时，错误卡不展示（已用付费墙处理）
  const isInsufficientErr = !!parseInsufficientCreditsError(error?.message);
  const displayError = error && !isInsufficientErr ? error : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      {/* 顶部返回 + 余额状态条 */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回选题推荐
        </button>
        {/*
         * 配额可视化：本次消耗 / 缓存命中 / 余额。
         * - 加载完成后，charge.cacheHit=true 时显示「本次缓存命中，未扣积分」
         * - charge.deducted=true 时显示「本次消耗 -20」，并把余额压到这一刻的值
         * - 失败/未触发时仅显示当前余额
         */}
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {charge?.cacheHit && (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
              缓存命中 · 免费
            </span>
          )}
          {charge?.deducted && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
              本次消耗 −{charge.cost}
            </span>
          )}
          <span className="flex items-center gap-1 text-gray-500">
            <Coins className="h-3 w-3" />
            余额 {credits} 积分
          </span>
        </div>
      </div>

      {/* 作品头部 */}
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row">
          <div className="relative shrink-0 border-b border-gray-100 lg:w-56 lg:border-b-0 lg:border-r">
            {coverUrl ? (
              <ImageWithFallback
                src={coverUrl}
                alt={cleanTitle}
                className="min-h-[220px] w-full object-cover lg:h-full"
              />
            ) : (
              <div className="flex min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <Zap className="h-8 w-8 text-gray-300" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute left-3 top-3">
              <span className="rounded-md bg-gradient-to-br from-purple-600 to-pink-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                {item.viralScore}%
              </span>
            </div>
            <div className="absolute bottom-3 left-3">
              <span className="rounded-md bg-white/90 px-2 py-0.5 text-xs text-gray-700">
                {item.platform}
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 py-5 sm:px-7">
            <h1 className="mb-2 text-lg leading-snug text-gray-900">{cleanTitle}</h1>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>{item.authorName}</span>
              {item.publishedAt && (
                <>
                  <span className="text-gray-200">·</span>
                  <span>{item.publishedAt.slice(0, 10)}</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: "互动", value: formatStat(item.likeCount + item.commentCount + item.shareCount + item.saveCount) },
                { label: "点赞", value: formatStat(item.likeCount) },
                { label: "评论", value: formatStat(item.commentCount) },
                { label: "互动率", value: `${(item.engagementRate * 100).toFixed(1)}%` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="text-[11px] text-gray-400">{stat.label}</div>
                  <p className="mt-0.5 text-sm text-gray-800">{stat.value}</p>
                </div>
              ))}
            </div>
            {item.contentUrl && (
              <a
                href={item.contentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
              >
                查看原视频 →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 拆解结果 */}
      {isPending && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-16 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <p className="text-sm text-gray-600">AI 正在拆解视频结构…</p>
          <p className="text-xs text-gray-400">通常需要 30-90 秒，正在做多模态分析</p>
        </div>
      )}

      {displayError && !isPending && (() => {
        const msg = displayError.message || "";
        const is503 = /503|high demand|Service Unavailable/i.test(msg);
        const is429 = /429|rate limit/i.test(msg);
        const isTransient = is503 || is429;
        return (
          <div
            className={`rounded-3xl border px-6 py-8 text-sm ${
              isTransient
                ? "border-amber-100 bg-amber-50 text-amber-800"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {is503
                  ? "AI 模型当前正忙"
                  : is429
                  ? "请求过于频繁"
                  : "拆解失败"}
              </span>
            </div>
            <p
              className={`text-xs leading-relaxed ${
                isTransient ? "text-amber-700" : "text-red-600"
              }`}
            >
              {is503
                ? "Apollo Gemini 模型正处于高峰，已自动重试 3 次仍未成功。请稍后再试，通常 1-3 分钟可恢复。"
                : is429
                ? "短时间内请求过多，请稍等几秒再重试。"
                : msg}
            </p>
            <button
              type="button"
              onClick={trigger}
              className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white transition-colors ${
                isTransient
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              <RotateCcw className="h-3 w-3" />
              重试
            </button>
          </div>
        );
      })()}

      {breakdown && !isPending && <BreakdownResultBody breakdown={breakdown} />}

      {/* 余额不足付费墙：mutation 报错 INSUFFICIENT_CREDITS 或 effect 主动检测时打开 */}
      <PaywallModal
        open={paywallContext !== null}
        onClose={() => {
          setPaywallContext(null);
          // 用户取消付费，回到选题页避免空白卡死
          if (!breakdown) navigate(-1);
        }}
        context={
          paywallContext ?? {
            actionLabel: "深度拆解",
            requiredCredits: BREAKDOWN_COST,
            shortfall: 0,
          }
        }
        onTopUpComplete={() => {
          // 充值完成后：重置已触发标记 → 让 effect 重新发起拆解
          triggeredRef.current = false;
          setPaywallContext(null);
          // 直接调一次（不等 effect）
          mutation.reset();
          trigger();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BreakdownResult 渲染：meta_strategy + shot_list                     */
/* ------------------------------------------------------------------ */

type BreakdownData = NonNullable<
  ReturnType<typeof trpc.copywriting.viralBreakdownDirect.useMutation>["data"]
>["breakdown"];

function BreakdownResultBody({ breakdown }: { breakdown: BreakdownData }) {
  const meta = breakdown.meta_strategy;
  const shots = breakdown.shot_list ?? [];

  return (
    <div className="space-y-4">
      {/* 1. 核心叙事与变现 */}
      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 px-5 pb-3 pt-5 sm:px-7">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            <h2 className="text-sm font-semibold text-gray-900">核心叙事与变现逻辑</h2>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4 sm:px-7">
          <p className="text-sm leading-relaxed text-gray-700">{meta.summary}</p>
          {meta.visual_hammer && (
            <div className="rounded-2xl bg-violet-50 px-4 py-3">
              <div className="mb-1 text-xs font-medium text-violet-700">🔨 视觉锤</div>
              <p className="text-sm leading-relaxed text-violet-900">{meta.visual_hammer}</p>
            </div>
          )}
        </div>
      </section>

      {/* 2. 爆款公式 */}
      {meta.viral_formula && (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 px-5 pb-3 pt-5 sm:px-7">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">爆款公式</h2>
            </div>
            {meta.viral_formula.tagline && (
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {meta.viral_formula.tagline}
              </p>
            )}
          </div>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 sm:px-7">
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <div className="mb-1 text-xs font-medium text-amber-700">⚡ 黄金 3 秒钩子</div>
              <p className="text-sm leading-relaxed text-amber-950">
                {meta.viral_formula.hook_strategy}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <div className="mb-1 text-xs font-medium text-emerald-700">🎯 转化漏斗</div>
              <p className="text-sm leading-relaxed text-emerald-950">
                {meta.viral_formula.conversion_logic}
              </p>
            </div>
            <div className="rounded-2xl bg-pink-50 px-4 py-3 sm:col-span-2">
              <div className="mb-1 text-xs font-medium text-pink-700">📊 节奏与信息密度</div>
              <p className="text-sm leading-relaxed text-pink-950">
                {meta.viral_formula.pacing_analysis}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. 复刻建议 */}
      {meta.replication_advice && (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 px-5 pb-3 pt-5 sm:px-7">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-900">复刻与优化建议</h2>
            </div>
          </div>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 sm:px-7">
            <div className="rounded-2xl bg-rose-50 px-4 py-3">
              <div className="mb-1 text-xs font-medium text-rose-700">⚠️ 原视频不足</div>
              <p className="text-sm leading-relaxed text-rose-950">
                {meta.replication_advice.flaws}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 px-4 py-3">
              <div className="mb-1 text-xs font-medium text-blue-700">✨ 升级方案</div>
              <p className="text-sm leading-relaxed text-blue-950">
                {meta.replication_advice.improvement_plan}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. 分镜脚本 */}
      {shots.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 px-5 pb-3 pt-5 sm:px-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-indigo-500" />
                <h2 className="text-sm font-semibold text-gray-900">逐镜复刻脚本</h2>
              </div>
              <span className="text-xs text-gray-400">{shots.length} 个分镜</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {shots.map((shot) => (
              <ShotCard key={shot.id} shot={shot} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ShotCard({ shot }: { shot: BreakdownData["shot_list"][number] }) {
  const start = shot.timestamp?.start_seconds ?? 0;
  const end = shot.timestamp?.end_seconds ?? 0;
  return (
    <div className="px-5 py-4 sm:px-7">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
          #{shot.id}
        </span>
        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
          {start.toFixed(1)}s – {end.toFixed(1)}s
        </span>
        {shot.scene_type && (
          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
            {shot.scene_type}
          </span>
        )}
      </div>

      {shot.audio_layer && (
        <div className="mb-2 rounded-2xl bg-gray-50 px-3 py-2.5">
          <div className="mb-1 text-[11px] font-medium text-gray-500">🎙 音频层</div>
          {shot.audio_layer.script && (
            <p className="mb-1 text-sm leading-relaxed text-gray-800">
              「{shot.audio_layer.script}」
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            {shot.audio_layer.bgm_mood && <span>BGM：{shot.audio_layer.bgm_mood}</span>}
            {shot.audio_layer.sfx_design && <span>音效：{shot.audio_layer.sfx_design}</span>}
          </div>
        </div>
      )}

      {shot.visual_layer && (
        <div className="mb-2 rounded-2xl bg-amber-50/50 px-3 py-2.5">
          <div className="mb-1 text-[11px] font-medium text-amber-700">🎬 画面层</div>
          {shot.visual_layer.subject_action && (
            <p className="mb-1 text-sm leading-relaxed text-gray-800">
              {shot.visual_layer.subject_action}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-900/70">
            {shot.visual_layer.environment && <span>环境：{shot.visual_layer.environment}</span>}
            {shot.visual_layer.camera_language && <span>运镜：{shot.visual_layer.camera_language}</span>}
            {shot.visual_layer.lighting_style && <span>光影：{shot.visual_layer.lighting_style}</span>}
            {shot.visual_layer.visual_stimuli && <span>刺激点：{shot.visual_layer.visual_stimuli}</span>}
          </div>
        </div>
      )}

      {shot.neuro_marketing_layer && (
        <div className="mb-2 rounded-2xl bg-pink-50/60 px-3 py-2.5">
          <div className="mb-1 text-[11px] font-medium text-pink-700">🧠 神经营销</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-pink-900/70">
            {shot.neuro_marketing_layer.audience_emotion && (
              <span>情绪：{shot.neuro_marketing_layer.audience_emotion}</span>
            )}
            {shot.neuro_marketing_layer.retention_tactic && (
              <span>留存：{shot.neuro_marketing_layer.retention_tactic}</span>
            )}
            {shot.neuro_marketing_layer.conversion_priming && (
              <span>转化铺垫：{shot.neuro_marketing_layer.conversion_priming}</span>
            )}
          </div>
        </div>
      )}

      {shot.replication_note && (
        <div className="rounded-2xl border border-gray-100 bg-white px-3 py-2.5 text-xs leading-relaxed text-gray-600">
          <span className="font-medium text-gray-700">📝 复刻要点：</span>
          {shot.replication_note}
        </div>
      )}
    </div>
  );
}

function formatStat(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 100000) return `${(n / 10000).toFixed(0)}万`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千`;
  return String(n);
}

export function BreakdownPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Live 模式：从「爆款选题推荐」携带 LowFollowerItem 跳转过来
  const liveItem =
    location.state &&
    typeof location.state === "object" &&
    (location.state as Record<string, unknown>).kind === "live" &&
    (location.state as Record<string, unknown>).item
      ? ((location.state as Record<string, unknown>).item as LowFollowerItem)
      : null;
  const {
    dataMode,
    state,
    lowFollowerSamples,
    getSampleById,
    consumeBreakdownAction,
    getBreakdownResults,
    createBreakdownSampleResult,
  } = useAppStore();
  const sample = id ? getSampleById(id) : null;
  const autoAction = searchParams.get("action") as ActionId | null;
  const [pendingActionId, setPendingActionId] = useState<ActionId | null>(() =>
    ACTIONS.some((item) => item.id === autoAction) ? autoAction : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const isMember = normalizePlan(state.membershipPlan) !== "free";
  const selectedModel = getModelOption(state.selectedModel);
  const { markChecklistDone } = useOnboarding();

  // 上手任务追踪：体验爆款拆解（C1 第3项）
  useEffect(() => { markChecklistDone("breakdown"); }, [markChecklistDone]);

  /**
   * 方案B 兴容层：将 /breakdown/:id 重定向到统一结果页
   * 旧书签和外部链接仍可正常访问，会自动跳转到 /results/:id
   * Live 模式（从选题推荐携带 item 跳转）跳过此重定向，由 LiveBreakdownView 接管。
   */
  useEffect(() => {
    if (!id || dataMode === "live" || liveItem) return;
    const result = createBreakdownSampleResult(id);
    if (result.ok) {
      navigate(`/results/${result.resultId}`, { replace: true });
    }
  }, [id, dataMode, liveItem]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live 模式：从「爆款选题推荐」跳转过来，直接拆解视频，不走 sample/store 路径
  if (liveItem) {
    return <LiveBreakdownView item={liveItem} />;
  }

  if (dataMode === "live") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-2 text-base text-gray-800">爆款拆解暂未接入真实数据</p>
        <p className="mb-6 text-sm leading-relaxed text-gray-400">
          当前是真实数据模式，这个页面仍依赖本地低粉样本和演示拆解能力，因此已自动降级隐藏。
        </p>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
        >
          去设置切回演示数据
        </button>
      </div>
    );
  }

  if (!sample) {
    return <InvalidBreakdown onBack={() => navigate("/low-follower-opportunities")} />;
  }

  const primaryTrack = sample.trackTags[0] ?? "内容";
  const secondaryTrack = sample.trackTags[1] ?? sample.platform;
  const borrowScore = Math.min(96, Math.round(sample.anomaly * 12 + sample.newbieFriendly * 0.4));
  const newbieScore = sample.newbieFriendly;
  const riskLabel = sample.anomaly >= 6 ? "中等" : "较低";
  const similarSamples = lowFollowerSamples
    .filter(
      (item) =>
        item.id !== sample.id &&
        (item.trackTags.some((tag) => sample.trackTags.includes(tag)) || item.platform === sample.platform),
    )
    .slice(0, 3);
  const pendingAction = ACTIONS.find((item) => item.id === pendingActionId) ?? null;
  const generatedResults = getBreakdownResults(sample.id);
  const freePreviewStats = [
    { icon: <Eye className="h-3 w-3" />, label: "互动数据", value: sample.playCount },
    {
      icon: <TrendingUp className="h-3 w-3" />,
      label: "互动粉丝比",
      value: `${sample.anomaly}倍`,
    },
  ];
  const freePreviewChecklist = [
    "这是一条明显高于同量级账号基线的异常样本",
    "当前只保留“值不值得继续看”的基础判断，不展开具体爆因结构",
    "更适合先确认是否同平台、同赛道，再决定是否解锁完整拆解",
  ];

  const whyCards = [
    {
      title: "选题切口",
      judgment: `「${sample.burstReasons[0]}」让这条 ${primaryTrack} 内容具备了更强的代入点`,
      explanation: `样本没有泛泛谈 ${primaryTrack}，而是把问题压缩成一个观众能立刻识别的具体场景。`,
      evidence: `近 30 天同类 ${primaryTrack} 样本中，具备明确场景限定的内容互动表现更高。`,
      evidenceStat: `+${sample.anomaly.toFixed(1)}× 表现`,
      icon: <Lightbulb className="h-3.5 w-3.5 text-gray-500" />,
      locked: false,
    },
    {
      title: "标题结构",
      judgment: "标题里同时给了对象、冲突和结果，所以点击意图很明确",
      explanation: "观众能第一眼判断这条内容是不是讲给自己听的，是否值得花时间继续看。",
      evidence: `样本标题属于高密度价值表达，尤其适合 ${sample.platform} 的首屏竞争环境。`,
      evidenceStat: "+38% CTR",
      icon: <TrendingUp className="h-3.5 w-3.5 text-gray-500" />,
      locked: false,
    },
    {
      title: "开头钩子",
      judgment: "结果或冲突前置，帮助前 3 秒迅速建立悬念",
      explanation: "如果一开始就让观众知道“会得到什么”，留存会明显优于纯铺垫叙述。",
      evidence: "同类内容里，结果先行结构在短视频平台里更容易拿到完播。",
      evidenceStat: "+22% 完播",
      icon: <Zap className="h-3.5 w-3.5 text-gray-500" />,
      locked: !isMember,
    },
    {
      title: "评论区反馈",
      judgment: "评论区可延展出下一轮内容，说明这个方向不仅有流量，还有持续话题性",
      explanation: "真正值得借鉴的样本，不只是数据好，而是会自然带出更多后续问题和二次创作空间。",
      evidence: `这类 ${secondaryTrack} 问题型内容通常具备更高的收藏和追问意图。`,
      evidenceStat: "高收藏潜力",
      icon: <Users className="h-3.5 w-3.5 text-gray-500" />,
      locked: !isMember,
    },
  ];

  const handleActionClick = (actionId: ActionId) => {
    setPendingActionId(actionId);
    setShortfall(null);
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    setIsLoading(true);

    window.setTimeout(() => {
      const action = consumeBreakdownAction(sample.id, pendingAction.id, pendingAction.cost);
      if (!action.ok) {
        setShortfall(action.shortfall);
        setIsLoading(false);
        return;
      }

      setPendingActionId(null);
      setShortfall(null);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={() => navigate("/low-follower-opportunities")}
        className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回低粉爆款
      </button>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row">
          <div className="relative shrink-0 border-b border-gray-100 lg:w-52 lg:border-b-0 lg:border-r">
            <ImageWithFallback
              src={getProxiedImageUrl(sample.img) ?? sample.img}
              alt="样本封面"
              className="min-h-[240px] w-full object-cover lg:h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <div className="absolute left-3 top-3">
              <span className="rounded-lg bg-gray-900 px-2 py-1 text-xs text-white">
                {sample.anomaly}倍
              </span>
            </div>
            <div className="absolute bottom-3 left-3">
              <span className="rounded-md bg-white/90 px-2 py-0.5 text-xs text-gray-700">
                {sample.platform} · {sample.contentForm}
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-5 py-6 sm:px-7">
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <h1 className="mb-2 text-lg leading-snug text-gray-900">{sample.title}</h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  {isMember ? (
                    <>
                      <span>{sample.account}</span>
                      <span className="text-gray-200">·</span>
                      <span>{sample.fansLabel}</span>
                      <span className="text-gray-200">·</span>
                      <span>{sample.platform}</span>
                      <span className="text-gray-200">·</span>
                      <span>{sample.publishedAt.slice(0, 10)}</span>
                    </>
                  ) : (
                    <>
                      <span>{sample.platform}</span>
                      <span className="text-gray-200">·</span>
                      <span>{sample.publishedAt.slice(0, 10)}</span>
                      <span className="text-gray-200">·</span>
                      <span>免费预览</span>
                    </>
                  )}
                </div>
              </div>
              {isMember ? (
                <div className="grid grid-cols-2 gap-5 self-start">
                  <ScoreRing score={borrowScore} label="可借鉴度" />
                  <ScoreRing score={newbieScore} label="新手适合" />
                </div>
              ) : (
                <div className="self-start rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-right">
                  <div className="text-[11px] text-gray-400">会员查看适配评分</div>
                  <div className="mt-1 text-sm text-gray-700">可借鉴度 / 新手适合</div>
                </div>
              )}
            </div>

            <div className={`mb-4 grid gap-2.5 ${isMember ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
              {(isMember
                ? [
                    { icon: <Eye className="h-3 w-3" />, label: "互动数据", value: sample.playCount },
                    {
                      icon: <TrendingUp className="h-3 w-3" />,
                      label: "互动粉丝比",
                      value: `${sample.anomaly}倍`,
                    },
                    {
                      icon: <Lightbulb className="h-3 w-3" />,
                      label: "爆因数量",
                      value: `${sample.burstReasons.length} 项`,
                    },
                    {
                      icon: <Users className="h-3 w-3" />,
                      label: "适合赛道",
                      value: primaryTrack,
                    },
                  ]
                : freePreviewStats
              ).map((stat) => (
                <div key={stat.label} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1 text-[11px] text-gray-400">
                    {stat.icon}
                    {stat.label}
                  </div>
                  <p className="text-sm text-gray-800">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-xs leading-relaxed text-gray-500">
                <span className="text-gray-700">判断：</span>
                {isMember
                  ? `这条样本的核心竞争力在于「${sample.burstReasons[0]} × ${sample.burstReasons[1] ?? "明确结果"}」的结构组合，适合借鉴的是表达框架和叙事顺序，而不是直接复制素材。`
                  : "这条样本已经具备继续拆解的价值，但免费页只保留基础预判，不直接展开具体爆因、结构拆分和适配方法。"}
              </p>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              {(isMember
                ? [
                    { label: "异常值", value: `${sample.anomaly}倍`, strong: true },
                    { label: "可借鉴度", value: borrowScore >= 80 ? "高" : "中高" },
                    {
                      label: "适合对象",
                      value: sample.newbieFriendly >= 85 ? "新手账号优先" : "成长期账号",
                    },
                    { label: "风险度", value: riskLabel },
                  ]
                : [
                    { label: "异常值", value: `${sample.anomaly}倍`, strong: true },
                    { label: "风险度", value: riskLabel },
                  ]
              ).map((tag) => (
                <div
                  key={tag.label}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-1.5"
                >
                  <span className="text-[11px] text-gray-400">{tag.label}</span>
                  <span className={`text-xs ${tag.strong ? "text-gray-900" : "text-gray-600"}`}>
                    {tag.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-gray-50 pt-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-gray-400">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                免费 · 仅查看样本预判
              </span>
              <span className="flex items-center gap-1.5 text-gray-400">
                <Lock className="h-3 w-3" />
                会员 · 完整拆解与适配判断
              </span>
              <span className="flex items-center gap-1.5 text-amber-500">
                <Coins className="h-3 w-3" />
                积分 · 生成专属借鉴建议
              </span>
            </div>
          </div>
        </div>
      </div>

      {!isMember && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 text-sm text-gray-600">
          当前为免费预览。这里先帮你判断这条样本值不值得继续看；完整爆因、借鉴边界、适配判断和相似样本会在会员层展开。
        </div>
      )}

      <div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm text-gray-900">它为什么能爆</h2>
          {isMember && (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                免费 2 项
              </span>
              <span className="text-gray-200">·</span>
              <span className="flex items-center gap-1">
                <Lock className="h-2.5 w-2.5 text-gray-400" />
                会员 2 项
              </span>
            </div>
          )}
        </div>
        {isMember ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {whyCards.map((card) => (
              <AnalysisCard
                key={card.title}
                {...card}
                membershipLocked={
                  !isMember ? (
                    <button
                      type="button"
                      onClick={() => navigate("/credits")}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] text-white transition-colors hover:bg-gray-700"
                    >
                      开通会员
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                  <Eye className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span className="text-[11px] uppercase tracking-wide text-gray-500">免费预判</span>
              </div>
              <p className="text-sm leading-relaxed text-gray-800">
                这条样本值得继续看，但当前只保留“是否值得拆解”的基础判断，不直接提供可执行拆解。
              </p>
              <div className="mt-4 space-y-2">
                {freePreviewChecklist.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500"
                  >
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <LockedPreviewSection
              title="完整爆因拆解已收起"
              desc="免费页不再直接展示标题结构、开头钩子、评论反馈等可执行信息，避免一次给出过多借鉴路径。"
              actionLabel="开通会员继续查看"
              onAction={() => navigate("/credits")}
            />
          </div>
        )}
      </div>

      {isMember ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                <AlertTriangle className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                借鉴边界判断
              </span>
            </div>
            <p className="text-sm leading-relaxed text-gray-800">
              适合借的是「{sample.burstReasons[0]} + 明确结果」的表达结构，不适合直接照搬
              {sample.account} 的人物设定和具体叙事素材。
            </p>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              你应该迁移的是结构，不是话术。尤其在 {sample.platform} 上，过度模仿会很快失去可信度。
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                <Check className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                适配判断
              </span>
            </div>
            <p className="text-sm leading-relaxed text-gray-800">
              如果你当前也是做 {primaryTrack} 或 {secondaryTrack} 相关内容，这个样本的切口结构值得优先测试。
            </p>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              更适合把同样的结构迁移到你已经熟悉的素材池里，而不是强行转赛道。
            </p>
          </div>
        </div>
      ) : (
        <LockedPreviewSection
          title="完整拆解和适配判断已收起"
          desc="免费用户先看基础判断，避免一次暴露过多信息。开通会员后再查看借鉴边界、账号适配判断和更细的爆因解释。"
          actionLabel="开通会员继续查看"
          onAction={() => navigate("/credits")}
        />
      )}

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm text-gray-900">相似样本参考</h2>
          <span className="text-xs text-gray-400">同平台 / 同赛道近 30 天</span>
        </div>
        {isMember ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {similarSamples.map((item) => (
              <SimilarCard key={item.id} sample={item} />
            ))}
          </div>
        ) : (
          <LockedPreviewSection
            title="相似样本参考需会员查看"
            desc="相似样本会显著增加可复制路径和误判风险判断，因此免费预览中不再直接展开。"
            actionLabel="开通会员解锁样本池"
            onAction={() => navigate("/credits")}
          />
        )}
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm text-gray-900">生成专属借鉴建议</h2>
            <p className="mt-1 text-xs text-gray-400">
              当前余额 {state.credits} 积分 · {selectedModel.name} · {selectedModel.badge} 计费
            </p>
          </div>
          {!isMember && (
            <button
              type="button"
              onClick={() => navigate("/credits")}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
            >
              会员可看完整拆解
            </button>
          )}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleActionClick("advice")}
            className="flex w-full items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-left transition-colors hover:border-gray-300 hover:bg-white"
          >
            <div>
              <div className="mb-1 text-sm text-gray-900">{ACTIONS[0].label}</div>
              <div className="text-xs leading-relaxed text-gray-500">{ACTIONS[0].shortDesc}</div>
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-500">
              {getChargedCost(ACTIONS[0].cost, state.selectedModel)} 积分
            </span>
          </button>

          {isMember ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ACTIONS.slice(1).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleActionClick(action.id)}
                  className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-left transition-colors hover:border-gray-200 hover:bg-gray-50"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-900">{action.label}</span>
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
                      {getChargedCost(action.cost, state.selectedModel)} 积分
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500">{action.shortDesc}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-400">
              免费预览先保留 1 个主入口，降低信息密度。更多改写、标题、钩子和提纲生成能力在会员层展开。
            </div>
          )}
        </div>
      </div>

      {pendingAction && !isLoading && (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-800">
                本次将解锁：{pendingAction.desc} · 预计消耗 {getChargedCost(pendingAction.cost, state.selectedModel)} 积分
              </p>
              <p className="text-[11px] text-gray-400">{pendingAction.confirmDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingActionId(null)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-gray-700"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}

      {shortfall !== null && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>当前积分不足 · 还差 {shortfall} 积分</span>
            <button
              type="button"
              onClick={() => navigate("/credits")}
              className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-amber-700"
            >
              去充值
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 text-sm text-gray-500 shadow-sm">
          正在生成中，准备把样本结构转换成适合你账号的执行建议…
        </div>
      )}

      {generatedResults.map((result) => (
        <div
          key={result.id}
          className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
        >
          <div className="border-b border-gray-50 px-5 pb-4 pt-5 sm:px-7">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500">已生成</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">
                {ACTIONS.find((action) => action.id === result.actionId)?.desc}
              </span>
            </div>
            <h3 className="text-sm text-gray-900">{result.title}</h3>
          </div>
          <div className="space-y-2 px-5 py-4 sm:px-7">
            {result.items.map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-gray-700">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-50 px-5 py-3 text-xs text-gray-400 sm:px-7">
            <span>消耗 {result.cost} 积分</span>
            <span className="text-gray-200">·</span>
            <span>余额 {state.credits}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
