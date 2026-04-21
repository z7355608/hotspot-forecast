/**
 * LiveDemoPreview — 弹窗式样例演示
 * ================================
 * 展示多种输入类型的 demo 预览：
 * 关键词 / 一句话 / 视频链接 / 账户链接
 * 每种输入类型对应不同的输出结果，让用户秒懂产品价值。
 */

import { useEffect, useState, useCallback } from "react";
import {
  Flame,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Type,
  MessageSquare,
  Link2,
  User,
} from "lucide-react";

/* ── 输入类型定义 ─────────────────────────────────────────── */

interface DemoScenario {
  id: string;
  label: string;
  icon: typeof Type;
  inputLabel: string;
  inputValue: string;
  results: DemoResult[];
}

interface DemoResult {
  topic: string;
  probability: number;
  reason: string;
  tag: string;
  tagColor: string;
}

/* ── 演示数据 — 4 种输入类型 ─────────────────────────────── */

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "keyword",
    label: "关键词",
    icon: Type,
    inputLabel: "输入关键词",
    inputValue: "火锅加盟",
    results: [
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
    ],
  },
  {
    id: "sentence",
    label: "一句话",
    icon: MessageSquare,
    inputLabel: "输入一句话描述",
    inputValue: "我想做穿搭赛道，5000粉新号适合发什么",
    results: [
      {
        topic: "平价穿搭合集",
        probability: 85,
        reason: "低粉账号验证率最高，3 天内 5 个新号跑出爆款",
        tag: "强烈推荐",
        tagColor: "#22c55e",
      },
      {
        topic: "通勤穿搭公式",
        probability: 72,
        reason: "评论区「上班穿什么」需求信号强，搜索量周增 40%",
        tag: "推荐尝试",
        tagColor: "#3b82f6",
      },
      {
        topic: "显瘦穿搭技巧",
        probability: 65,
        reason: "同类账号集中验证中，适合新号切入",
        tag: "可以尝试",
        tagColor: "#8b5cf6",
      },
    ],
  },
  {
    id: "video",
    label: "视频链接",
    icon: Link2,
    inputLabel: "粘贴竞品视频链接",
    inputValue: "https://www.douyin.com/video/7389xxxxx",
    results: [
      {
        topic: "同款选题：家居收纳神器",
        probability: 78,
        reason: "该视频 48h 内涨粉 2w+，评论区复购意愿强",
        tag: "推荐跟拍",
        tagColor: "#22c55e",
      },
      {
        topic: "差异化切入：收纳翻车合集",
        probability: 71,
        reason: "原视频评论区「不好用」吐槽多，反向选题空间大",
        tag: "推荐尝试",
        tagColor: "#3b82f6",
      },
      {
        topic: "升级版：租房改造收纳",
        probability: 64,
        reason: "跨场景延伸，搜索趋势上升中",
        tag: "可以尝试",
        tagColor: "#8b5cf6",
      },
    ],
  },
  {
    id: "account",
    label: "账户链接",
    icon: User,
    inputLabel: "粘贴你的账号主页链接",
    inputValue: "https://www.douyin.com/user/MS4wLjABxxx",
    results: [
      {
        topic: "基于你的粉丝画像：职场效率工具",
        probability: 80,
        reason: "你的粉丝 70% 为 25-35 岁职场人群，该选题匹配度最高",
        tag: "强烈推荐",
        tagColor: "#22c55e",
      },
      {
        topic: "延续爆款：副业赚钱实操",
        probability: 73,
        reason: "你近期「副业」相关内容互动率高于均值 3 倍",
        tag: "推荐尝试",
        tagColor: "#3b82f6",
      },
      {
        topic: "新方向试探：AI 工具测评",
        probability: 61,
        reason: "你的粉丝与 AI 赛道头部账号重合度 45%",
        tag: "可以尝试",
        tagColor: "#8b5cf6",
      },
    ],
  },
];

/* ── 打字机效果 Hook ─────────────────────────────────────── */

function useTypewriter(text: string, speed = 50, startDelay = 0) {
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

/* ── 单个场景演示 ─────────────────────────────────────────── */

function ScenarioDemo({
  scenario,
  onTryIt,
  onViewFull,
}: {
  scenario: DemoScenario;
  onTryIt: () => void;
  onViewFull: () => void;
}) {
  const { displayed: typedInput, done: inputDone } = useTypewriter(
    scenario.inputValue,
    scenario.inputValue.length > 20 ? 30 : 60,
    400,
  );
  const [showResults, setShowResults] = useState(false);
  const [visibleResults, setVisibleResults] = useState(0);

  // 输入完成后，逐个展示结果
  useEffect(() => {
    if (!inputDone) return;
    const timer = setTimeout(() => setShowResults(true), 400);
    return () => clearTimeout(timer);
  }, [inputDone]);

  useEffect(() => {
    if (!showResults) return;
    if (visibleResults >= scenario.results.length) return;
    const timer = setTimeout(
      () => setVisibleResults((v) => v + 1),
      300,
    );
    return () => clearTimeout(timer);
  }, [showResults, visibleResults, scenario.results.length]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* 模拟输入区 */}
      <div className="border-b border-gray-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-400 mb-0.5">
              {scenario.inputLabel}
            </div>
            <div className="text-[14px] font-medium text-gray-800 min-h-[22px] truncate">
              {typedInput}
              {!inputDone && (
                <span className="inline-block w-[2px] h-[14px] bg-gray-800 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
          </div>
          {inputDone && (
            <div className="flex items-center gap-1 text-[11px] text-green-600 bg-green-50 rounded-full px-2 py-0.5 animate-fade-in shrink-0">
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

          {scenario.results.map((item, idx) => (
            <div
              key={item.topic}
              className={`transition-all duration-500 ${
                idx < visibleResults
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-3"
              }`}
            >
              <div className="flex items-start gap-3 rounded-xl bg-gray-50/70 p-3 group">
                {/* 序号 */}
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[12px] font-semibold text-gray-500 shadow-sm">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  {/* 标题行 */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-gray-800 truncate">
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
          {visibleResults >= scenario.results.length && (
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
  const [activeTab, setActiveTab] = useState(0);
  // 用 key 强制重新挂载 ScenarioDemo 以重置动画
  const [animKey, setAnimKey] = useState(0);

  const handleTabChange = useCallback((idx: number) => {
    setActiveTab(idx);
    setAnimKey((k) => k + 1);
  }, []);

  const scenario = DEMO_SCENARIOS[activeTab];

  return (
    <div className="px-5 py-5">
      {/* 标题 */}
      <div className="text-center mb-4">
        <h3 className="text-[15px] font-semibold text-gray-800">
          看看效果
        </h3>
        <p className="text-[12px] text-gray-400 mt-0.5">
          支持多种输入方式，选一种试试
        </p>
      </div>

      {/* Tab 切换 — 4 种输入类型 */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {DEMO_SCENARIOS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === activeTab;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleTabChange(idx)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              }`}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 演示内容 */}
      <ScenarioDemo
        key={animKey}
        scenario={scenario}
        onTryIt={onTryIt}
        onViewFull={onViewFull}
      />
    </div>
  );
}
