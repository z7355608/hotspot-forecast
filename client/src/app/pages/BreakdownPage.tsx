import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Coins,
  Eye,
  Lightbulb,
  Lock,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import {
  getChargedCost,
  getModelOption,
  normalizePlan,
  type LowFollowerSample,
} from "../store/app-data";
import { useAppStore } from "../store/app-store";
import { useOnboarding } from "../lib/onboarding-context";

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
          <ImageWithFallback src={sample.img} alt={sample.title} className="h-28 w-full object-cover" />
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

export function BreakdownPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
   */
  useEffect(() => {
    if (!id || dataMode === "live") return;
    const result = createBreakdownSampleResult(id);
    if (result.ok) {
      navigate(`/results/${result.resultId}`, { replace: true });
    }
  }, [id, dataMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      evidence: `近 30 天同类 ${primaryTrack} 样本中，具备明确场景限定的内容平均播放更高。`,
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
              src={sample.img}
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
