import { Sparkles } from "lucide-react";

export function HeroSection({
  onViewPlan,
  onStartTrial,
}: {
  onViewPlan?: () => void;
  onStartTrial?: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-3 pt-8 sm:px-6 sm:pt-12">
      <div className="space-y-3 text-center">
        {/* 核心价值描述 — 一句话让用户秒懂 */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs text-white">
          <Sparkles className="h-3 w-3" />
          AI 爆款预测
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight text-gray-900 sm:text-[32px]">
          你今天最值得拍什么，我们直接告诉你
        </h1>
        <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-gray-500">
          输入行业关键词、竞品链接或你的账号链接，立即获取当前高概率爆款选题
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onStartTrial}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            立即开始预测
          </button>
          <button
            type="button"
            onClick={onViewPlan}
            className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
          >
            看看示例
          </button>
        </div>
      </div>
    </div>
  );
}
