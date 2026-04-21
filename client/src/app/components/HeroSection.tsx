export function HeroSection({
  onViewPlan,
  onStartTrial,
}: {
  onViewPlan?: () => void;
  onStartTrial?: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-3 pt-8 sm:px-6 sm:pt-12">
      <div className="space-y-2 text-center">
        <h1 className="text-[26px] tracking-tight text-gray-900 sm:text-3xl">
          结束靠感觉做内容的时代
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-gray-500">
          不只是追踪热点，而是理解趋势背后的价值。让 AI
          帮你做出更高质量的创作决策。
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onViewPlan}
            className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
          >
            免费计划
          </button>
          <button
            type="button"
            onClick={onStartTrial}
            className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
          >
            开始试用
          </button>
        </div>
      </div>
    </div>
  );
}
