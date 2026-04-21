/**
 * LiveDemoPreview — 内嵌式样例演示
 * ================================
 * 在首页输入框下方展示一个精简的 demo 预览：
 * "输入 → 输出" 的动态示意，让用户秒懂产品价值。
 *
 * 文档要求：
 * - 新增一个固定样例模块
 * - 输入：AI工具 → 输出：当前建议拍的 3 个选题 + 对应概率
 * - 目标：降低用户第一次试用的心理门槛
 */

import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  Flame,
  TrendingUp,
  Sparkles,
  Play,
  ChevronRight,
} from "lucide-react";

/* ── 演示数据 ─────────────────────────────────────────────── */

const DEMO_INPUT = "火锅加盟";

const DEMO_RESULTS = [
  {
    topic: "火锅食材成本拆解",
    probability: 82,
    reason: "评论区高频出现「成本」「利润」关键词",
    tag: "强烈推荐",
    tagColor: "#22c55e",
  },
  {
    topic: "加盟避坑指南",
    probability: 75,
    reason: "低粉样本已验证，3 个千粉账号跑出 10w+",
    tag: "推荐尝试",
    tagColor: "#3b82f6",
  },
  {
    topic: "探店真实体验对比",
    probability: 68,
    reason: "同类账号集中发布，72h 内增速异常",
    tag: "可以尝试",
    tagColor: "#8b5cf6",
  },
];

/* ── 打字机效果 Hook ─────────────────────────────────────── */

function useTypewriter(text: string, speed = 60, startDelay = 0) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const startTimer = setTimeout(() => {
      const tick = () => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1));
          i++;
          timer = setTimeout(tick, speed);
        } else {
          setDone(true);
        }
      };
      tick();
    }, startDelay);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(timer);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

/* ── 概率条动画 ─────────────────────────────────────────── */

function ProbabilityBar({ value, delay }: { value: number; delay: number }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const color =
    value >= 80
      ? "bg-gradient-to-r from-green-400 to-emerald-500"
      : value >= 70
        ? "bg-gradient-to-r from-blue-400 to-blue-500"
        : "bg-gradient-to-r from-violet-400 to-purple-500";

  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/* ── 主组件 ─────────────────────────────────────────────── */

export function LiveDemoPreview({
  onTryIt,
  onViewFull,
}: {
  onTryIt: () => void;
  onViewFull: () => void;
}) {
  const { displayed: typedInput, done: inputDone } = useTypewriter(
    DEMO_INPUT,
    80,
    800,
  );
  const [showResults, setShowResults] = useState(false);
  const [visibleResults, setVisibleResults] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 输入完成后，逐个展示结果
  useEffect(() => {
    if (!inputDone) return;
    const timer = setTimeout(() => setShowResults(true), 400);
    return () => clearTimeout(timer);
  }, [inputDone]);

  useEffect(() => {
    if (!showResults) return;
    if (visibleResults >= DEMO_RESULTS.length) return;
    const timer = setTimeout(
      () => setVisibleResults((v) => v + 1),
      300,
    );
    return () => clearTimeout(timer);
  }, [showResults, visibleResults]);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-10">
      {/* 标题 */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Play className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[12px] text-gray-400 tracking-wide">
          看看效果：输入一个关键词，立即获得预测结果
        </span>
      </div>

      {/* 演示卡片 */}
      <div
        ref={containerRef}
        className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
      >
        {/* 模拟输入区 */}
        <div className="border-b border-gray-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-gray-400 mb-0.5">输入关键词</div>
              <div className="text-[15px] font-medium text-gray-800 min-h-[22px]">
                {typedInput}
                {!inputDone && (
                  <span className="inline-block w-[2px] h-[16px] bg-gray-800 ml-0.5 animate-pulse align-text-bottom" />
                )}
              </div>
            </div>
            {inputDone && (
              <div className="flex items-center gap-1 text-[11px] text-green-600 bg-green-50 rounded-full px-2 py-0.5 animate-fade-in">
                <TrendingUp className="h-3 w-3" />
                预测中…
              </div>
            )}
          </div>
        </div>

        {/* 结果区 */}
        {showResults && (
          <div className="px-5 py-4 space-y-3 animate-fade-in">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Flame className="h-3 w-3 text-orange-400" />
              当前建议拍的 3 个方向
            </div>

            {DEMO_RESULTS.map((item, idx) => (
              <div
                key={item.topic}
                className={`transition-all duration-500 ${
                  idx < visibleResults
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-3"
                }`}
              >
                <div className="flex items-start gap-3 rounded-xl bg-gray-50/70 p-3.5 group">
                  {/* 序号 */}
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[12px] font-semibold text-gray-500 shadow-sm">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 标题行 */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-medium text-gray-800">
                        {item.topic}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
                        style={{ backgroundColor: item.tagColor }}
                      >
                        {item.tag}
                      </span>
                    </div>

                    {/* 概率条 */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <ProbabilityBar
                        value={item.probability}
                        delay={idx < visibleResults ? 200 : 800}
                      />
                      <span className="shrink-0 text-[13px] font-bold text-gray-700 tabular-nums">
                        {item.probability}%
                      </span>
                    </div>

                    {/* 理由 */}
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      {item.reason}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* CTA 按钮 */}
            {visibleResults >= DEMO_RESULTS.length && (
              <div className="flex items-center justify-center gap-3 pt-2 animate-fade-in">
                <button
                  type="button"
                  onClick={onTryIt}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-gray-700 active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  试试我的行业
                </button>
                <button
                  type="button"
                  onClick={onViewFull}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-500 transition-all hover:border-gray-300 hover:text-gray-700"
                >
                  查看完整报告
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
