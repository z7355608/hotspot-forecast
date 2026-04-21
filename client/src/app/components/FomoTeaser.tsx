import { Crown, Lock, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import { PaywallModal } from "./PaywallModal";
import { useAppStore } from "../store/app-store";

/* ------------------------------------------------------------------ */
/*  FOMO 模糊化增值信息展示                                             */
/*  用于在情报控制台和结果页中，对积分不足的用户展示模糊化的高价值内容     */
/* ------------------------------------------------------------------ */

/** 模糊化样本卡片数据 */
interface FomoSample {
  title: string;
  metric: string;
  metricLabel: string;
  tag: string;
}

const FOMO_SAMPLES: FomoSample[] = [
  {
    title: "3 天涨粉 2.8w 的「反差穿搭」脚本模板",
    metric: "2.8w",
    metricLabel: "涨粉",
    tag: "穿搭赛道",
  },
  {
    title: "低粉号 7 天破 50w 播放的「情绪钩子」公式",
    metric: "50w+",
    metricLabel: "播放",
    tag: "情绪内容",
  },
  {
    title: "小红书爆款笔记标题的 12 种高转化句式",
    metric: "92%",
    metricLabel: "命中率",
    tag: "标题优化",
  },
];

function BlurredSampleCard({ sample }: { sample: FomoSample }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4">
      {/* 模糊层 */}
      <div className="absolute inset-0 z-10 backdrop-blur-[6px]" />
      {/* 锁定遮罩 */}
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/30">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900/80">
            <Lock className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[10px] font-medium text-gray-600">
            升级解锁
          </span>
        </div>
      </div>
      {/* 底层内容（模糊后可见轮廓但不可读） */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              {sample.tag}
            </span>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              <TrendingUp className="mr-0.5 inline h-2.5 w-2.5" />
              热门
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-800">
            {sample.title}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            基于近 7 天数据分析，已有 128 位创作者参考此策略
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold text-gray-900">{sample.metric}</div>
          <div className="text-[10px] text-gray-400">{sample.metricLabel}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FomoTeaser 主组件                                                  */
/* ------------------------------------------------------------------ */

export function FomoTeaser({
  variant = "inline",
  requiredCredits = 15,
  contextLabel = "解锁完整分析报告",
}: {
  /** 展示变体：inline（嵌入式）或 banner（横幅式） */
  variant?: "inline" | "banner";
  /** 解锁所需积分 */
  requiredCredits?: number;
  /** 上下文描述 */
  contextLabel?: string;
}) {
  const { state } = useAppStore();
  const [showPaywall, setShowPaywall] = useState(false);

  const shortfall = Math.max(0, requiredCredits - state.credits);
  const isLocked = state.credits < requiredCredits;

  // 积分充足时不展示 FOMO
  if (!isLocked) return null;

  if (variant === "banner") {
    return (
      <>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                <Crown className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  还有 {FOMO_SAMPLES.length} 条高价值洞察等你解锁
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  充值 {shortfall} 积分即可查看完整内容，包括脚本模板和执行建议
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPaywall(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              <Zap className="h-3.5 w-3.5" />
              立即解锁
            </button>
          </div>
        </div>

        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          context={{
            actionLabel: contextLabel,
            requiredCredits,
            shortfall,
            contextDescription: `解锁 ${FOMO_SAMPLES.length} 条高价值洞察`,
          }}
        />
      </>
    );
  }

  // inline 变体：展示模糊化卡片 + 解锁按钮
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-600">
            更多高价值内容
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
            需升级查看
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FOMO_SAMPLES.map((sample) => (
            <BlurredSampleCard key={sample.title} sample={sample} />
          ))}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <Lock className="h-3.5 w-3.5" />
            充值 {shortfall} 积分解锁全部内容
          </button>
        </div>
      </div>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context={{
          actionLabel: contextLabel,
          requiredCredits,
          shortfall,
          contextDescription: `解锁 ${FOMO_SAMPLES.length} 条高价值洞察和执行建议`,
        }}
      />
    </>
  );
}
