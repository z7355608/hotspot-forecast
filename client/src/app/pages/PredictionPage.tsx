import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, RefreshCw, TrendingUp, Zap, ChevronRight,
  Sparkles, Coins, Flame, BarChart2, Clock, Target,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────── */
interface Methodology {
  label: string;
  icon: React.ReactNode;
}

interface PredictionCard {
  id: string;
  score: number;           // 0–100
  platform: string;
  contentForm: string;
  title: string;           // 拍什么会火
  hook: string;            // 一句话描述切口
  reason: string;          // 核心爆因判断
  methodologies: Methodology[];
  platformColor: string;
  window: string;          // 机会窗口
  difficulty: '低' | '中' | '高';
}

/* ─────────────────────────────────────────────────────────────────
   Batches of prediction data
───────────────────────────────────────────────────────────────── */
const BATCHES: PredictionCard[][] = [
  /* Batch 0 */
  [
    {
      id: 'b0-0', score: 91, platform: '抖音', contentForm: '竖屏视频',
      title: '「普通人一年省下 5 万的真实账单」',
      hook: '用每月账单截图代替经验说教，真实感是最强的钩子',
      reason: '搞钱赛道近 30 天低粉账号异常率上升 34%，「真实流水账」类内容完播率是教程类 1.8 倍',
      methodologies: [
        { label: '趋势加速中',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '竞争窗口期',   icon: <Clock className="w-2.5 h-2.5" /> },
        { label: '低粉可跑出',   icon: <Zap className="w-2.5 h-2.5" /> },
        { label: '情绪触发强',   icon: <Flame className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-gray-900/80',
      window: '近 7 天', difficulty: '低',
    },
    {
      id: 'b0-1', score: 78, platform: '小红书', contentForm: '图文',
      title: '「入职 90 天，我为什么主动申请降薪」',
      hook: '反常识职场决策 + 真实心路历程，制造认知悬念',
      reason: '职场情绪类内容在小红书收藏率近期上升，「主动放弃」类叙事切口尚未竞争饱和',
      methodologies: [
        { label: '情绪共鸣强',   icon: <Flame className="w-2.5 h-2.5" /> },
        { label: '反常识切口',   icon: <Target className="w-2.5 h-2.5" /> },
        { label: '低竞争密度',   icon: <BarChart2 className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-red-700/80',
      window: '近 14 天', difficulty: '低',
    },
    {
      id: 'b0-2', score: 84, platform: '抖音', contentForm: '口播',
      title: '「30 岁之前，你一定要知道的 3 个钱的真相」',
      hook: '年龄锚点 + 信息差型标题，强制代入目标人群',
      reason: '「年龄锚点 + 真相揭秘」在搞钱赛道是稳定爆因结构，近期低粉样本验证率高',
      methodologies: [
        { label: '结构验证稳定', icon: <Sparkles className="w-2.5 h-2.5" /> },
        { label: '高搜索量词',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '低粉可跑出',   icon: <Zap className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-gray-900/80',
      window: '近 30 天', difficulty: '中',
    },
  ],
  /* Batch 1 */
  [
    {
      id: 'b1-0', score: 88, platform: '抖音', contentForm: '竖屏视频',
      title: '「我把一个月工资全花在吃饭上，值得吗」',
      hook: '极端消费实验 + 自我审视，引发评论区强烈讨论',
      reason: '消费实验类内容在生活方式赛道互动率是普通记录的 2.4 倍，评论区自带话题发酵',
      methodologies: [
        { label: '强互动结构',   icon: <Flame className="w-2.5 h-2.5" /> },
        { label: '话题发酵强',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '低门槛拍摄',   icon: <Zap className="w-2.5 h-2.5" /> },
        { label: '竞争窗口期',   icon: <Clock className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-gray-900/80',
      window: '近 7 天', difficulty: '低',
    },
    {
      id: 'b1-1', score: 72, platform: '视频号', contentForm: '竖屏视频',
      title: '「40 岁第一次学剪辑，第 3 个月涨粉 2000」',
      hook: '高龄新手 + 真实数据，降低门槛感，激发中年用户认同',
      reason: '视频号中年创作者群体增速明显，「素人起步」叙事在该平台有强共鸣基础',
      methodologies: [
        { label: '平台偏好匹配', icon: <Target className="w-2.5 h-2.5" /> },
        { label: '情绪共鸣强',   icon: <Flame className="w-2.5 h-2.5" /> },
        { label: '低竞争密度',   icon: <BarChart2 className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-green-800/80',
      window: '近 21 天', difficulty: '低',
    },
    {
      id: 'b1-2', score: 93, platform: '小红书', contentForm: '图文',
      title: '「我用 3 个月把公寓从 6 分改造成 9 分」',
      hook: '分数化评估 + 明确前后对比，信息密度高且可视化',
      reason: '家居改造类「量化对比」内容在小红书收藏率极高，3 个月时间跨度兼具可信度和参考价值',
      methodologies: [
        { label: '高收藏率结构', icon: <Sparkles className="w-2.5 h-2.5" /> },
        { label: '搜索流量强',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '竞争窗口期',   icon: <Clock className="w-2.5 h-2.5" /> },
        { label: '情绪触发强',   icon: <Flame className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-red-700/80',
      window: '近 7 天', difficulty: '中',
    },
  ],
  /* Batch 2 */
  [
    {
      id: 'b2-0', score: 86, platform: '抖音', contentForm: '竖屏视频',
      title: '「同样的材料，我做出来为什么比博主好看」',
      hook: '复刻失败 → 反超的自我修正叙事，完播率极高',
      reason: '「跟拍 → 超越」类内容触发竞争性情绪，分享欲强，已在美食/手工赛道多次验证',
      methodologies: [
        { label: '趋势加速中',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '情绪触发强',   icon: <Flame className="w-2.5 h-2.5" /> },
        { label: '结构验证稳定', icon: <Sparkles className="w-2.5 h-2.5" /> },
        { label: '低粉可跑出',   icon: <Zap className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-gray-900/80',
      window: '近 7 天', difficulty: '低',
    },
    {
      id: 'b2-1', score: 76, platform: 'B站', contentForm: '横屏视频',
      title: '「我花 2 年研究了 100 个失业的人，发现一个规律」',
      hook: '大样本 + 规律性结论，建立专业权威感',
      reason: 'B站长视频在职场/社会观察赛道有稳定的完播率和收藏基础，「样本研究」类选题分享率高',
      methodologies: [
        { label: '高收藏率结构', icon: <Sparkles className="w-2.5 h-2.5" /> },
        { label: '信息差强',     icon: <Target className="w-2.5 h-2.5" /> },
        { label: '平台偏好匹配', icon: <BarChart2 className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-blue-700/80',
      window: '近 30 天', difficulty: '高',
    },
    {
      id: 'b2-2', score: 89, platform: '快手', contentForm: '竖屏视频',
      title: '「县城小店开业 3 个月，流水超过大城市同行」',
      hook: '地域反差 + 真实营业数据，击中快手用户的本地认同感',
      reason: '快手本地商业故事赛道近 30 天爆发率上升 41%，「地方 vs 大城市」叙事有天然传播优势',
      methodologies: [
        { label: '平台偏好匹配', icon: <Target className="w-2.5 h-2.5" /> },
        { label: '趋势加速中',   icon: <TrendingUp className="w-2.5 h-2.5" /> },
        { label: '竞争窗口期',   icon: <Clock className="w-2.5 h-2.5" /> },
        { label: '情绪触发强',   icon: <Flame className="w-2.5 h-2.5" /> },
      ],
      platformColor: 'bg-orange-700/80',
      window: '近 7 天', difficulty: '低',
    },
  ],
];

/* ─────────────────────────────────────────────────────────────────
   Animated score counter
───────────────────────────────────────────────────────────────── */
function useCountUp(target: number, duration = 1200, delay = 0): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    setValue(0);
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, delay]);

  return value;
}

/* ─────────────────────────────────────────────────────────────────
   Score arc SVG
───────────────────────────────────────────────────────────────── */
function ScoreArc({ score, animated }: { score: number; animated: number }) {
  const size = 88;
  const cx = size / 2, cy = size / 2;
  const r = 36;
  const strokeW = 5;
  // Arc spans 240° (from 150° to 390°)
  const startAngle = 150 * (Math.PI / 180);
  const totalAngle = 240 * (Math.PI / 180);
  const circ = r * totalAngle;
  const offset = circ - (animated / 100) * circ;

  const pathD = (a: number, large: boolean) => {
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    return `${x},${y}`;
  };

  const startX = cx + r * Math.cos(startAngle);
  const startY = cy + r * Math.sin(startAngle);
  const endAngle = startAngle + totalAngle;
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);

  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 1 1 ${endX} ${endY}`;

  const isHigh = score >= 80;
  const trackColor = isHigh ? '#fef3c7' : '#f3f4f6';
  const progressColor = isHigh ? '#d97706' : '#374151';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <path d={arcPath} fill="none" stroke={trackColor} strokeWidth={strokeW}
        strokeLinecap="round" />
      {/* Progress */}
      <path d={arcPath} fill="none" stroke={progressColor} strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.05s linear' }}
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Score display (arc + number)
───────────────────────────────────────────────────────────────── */
function ScoreDisplay({ score, delay }: { score: number; delay: number }) {
  const animated = useCountUp(score, 1200, delay);
  const isHigh = score >= 80;
  return (
    <div className="relative flex items-center justify-center">
      <ScoreArc score={score} animated={animated} />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-2xl leading-none tabular-nums transition-colors ${isHigh ? 'text-amber-600' : 'text-gray-800'}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {animated}
        </span>
        <span className="text-[10px] text-gray-400 mt-0.5">分</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Glow pulse for high-score cards
───────────────────────────────────────────────────────────────── */
function GlowBorder({ children, score }: { children: React.ReactNode; score: number }) {
  const isHigh = score >= 80;
  const isCritical = score >= 88;

  if (!isHigh) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="relative h-full" style={{ isolation: 'isolate' }}>
      {/* Animated glow halo */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: isCritical
            ? 'radial-gradient(ellipse at 50% 0%, rgba(217,119,6,0.18) 0%, transparent 70%)'
            : 'radial-gradient(ellipse at 50% 0%, rgba(217,119,6,0.10) 0%, transparent 70%)',
          animation: 'glowPulse 2.8s ease-in-out infinite',
        }}
      />
      {/* Outer glow ring */}
      <div
        className="absolute -inset-[1px] rounded-2xl pointer-events-none"
        style={{
          boxShadow: isCritical
            ? '0 0 0 1.5px rgba(217,119,6,0.5), 0 0 20px rgba(217,119,6,0.18), 0 0 48px rgba(217,119,6,0.10)'
            : '0 0 0 1px rgba(217,119,6,0.35), 0 0 16px rgba(217,119,6,0.12)',
          animation: 'ringPulse 2.8s ease-in-out infinite',
        }}
      />
      <div className="bg-white rounded-2xl border border-amber-200/60 shadow-md h-full flex flex-col overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Prediction Card
───────────────────────────────────────────────────────────────── */
function PredictionCard({ card, index, visible }: { card: PredictionCard; index: number; visible: boolean }) {
  const isHigh = card.score >= 80;
  const delay = index * 120;

  return (
    <div
      className="h-full transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      <GlowBorder score={card.score}>
        {/* Top accent — amber for high, gray for medium */}
        {isHigh && (
          <div className="h-[2px] bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 flex-shrink-0" />
        )}

        <div className="flex-1 flex flex-col p-5">
          {/* Row 1: platform + form + window + difficulty */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md text-white ${card.platformColor}`}>
                {card.platform}
              </span>
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
                {card.contentForm}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400">{card.window}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                card.difficulty === '低'
                  ? 'bg-green-50 text-green-700'
                  : card.difficulty === '中'
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-orange-50 text-orange-600'
              }`}>
                {card.difficulty}难度
              </span>
            </div>
          </div>

          {/* Score + title row */}
          <div className="flex items-start gap-4 mb-3">
            {/* Score arc */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <ScoreDisplay score={card.score} delay={delay + 200} />
              <span className="text-[10px] text-gray-400 mt-0.5">机会评分</span>
            </div>
            {/* Title block */}
            <div className="flex-1 pt-1">
              {isHigh && (
                <div className="flex items-center gap-1 mb-1.5">
                  <Flame className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] text-amber-600">机会高 · 建议优先做</span>
                </div>
              )}
              <h3 className="text-sm text-gray-900 leading-snug mb-1">
                {card.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">{card.hook}</p>
            </div>
          </div>

          {/* Reason — highlighted block */}
          <div className={`rounded-xl px-3.5 py-2.5 mb-3 border-l-[3px] ${
            isHigh
              ? 'bg-amber-50/60 border-amber-400'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-xs leading-relaxed ${isHigh ? 'text-amber-900/80' : 'text-gray-600'}`}>
              {card.reason}
            </p>
          </div>

          {/* Methodology chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="text-[10px] text-gray-400">预测依据</span>
            {card.methodologies.map((m, i) => (
              <span
                key={i}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                  isHigh
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-gray-50 text-gray-600 border-gray-100'
                }`}
              >
                {m.icon}
                {m.label}
              </span>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action area */}
          <div className="pt-3.5 border-t border-gray-50 space-y-2">
            {/* Primary action */}
            <button
              className={`w-full py-2.5 flex items-center justify-between px-4 rounded-xl text-sm transition-colors ${
                isHigh
                  ? 'bg-gray-900 hover:bg-gray-800 text-white'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-100'
              }`}
            >
              <span>生成内容框架</span>
              <div className="flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className={`text-xs ${isHigh ? 'text-white/70' : 'text-amber-600'}`}>20</span>
              </div>
            </button>
            {/* Secondary row */}
            <div className="flex items-center gap-2">
              <button className="flex-1 py-2 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-800 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-xl transition-colors">
                查看相似爆款
                <ChevronRight className="w-3 h-3" />
              </button>
              <button className="flex-1 py-2 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-800 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-xl transition-colors">
                <Coins className="w-3 h-3 text-amber-500" />
                生成标题 30
              </button>
            </div>
          </div>
        </div>
      </GlowBorder>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PredictionPage
───────────────────────────────────────────────────────────────── */
export function PredictionPage() {
  const navigate = useNavigate();
  const [batchIndex,  setBatchIndex]  = useState(0);
  const [visible,     setVisible]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [queryLabel,  setQueryLabel]  = useState('抖音职场赛道');

  const queries = ['抖音职场赛道', '小红书生活方式', 'B站知识区', '快手本地内容', '视频号情感赛道'];
  const [queryIdx, setQueryIdx] = useState(0);

  // Entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setVisible(false);
    setTimeout(() => {
      setBatchIndex(i => (i + 1) % BATCHES.length);
      setQueryIdx(i => (i + 1) % queries.length);
      setQueryLabel(queries[(queryIdx + 1) % queries.length]);
      setVisible(true);
      setRefreshing(false);
    }, 380);
  }, [refreshing, queryIdx, queries]);

  const cards = BATCHES[batchIndex];
  const maxScore = Math.max(...cards.map(c => c.score));

  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
        @keyframes ringPulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Full-height layout */}
      <div className="flex flex-col h-full px-6 py-6" style={{ minHeight: 'calc(100vh - 56px)' }}>

        {/* ── Header ── */}
        <div
          className="flex items-center justify-between mb-5 flex-shrink-0"
          style={{ animation: 'fadeSlideIn 0.4s ease-out both' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-900">爆款预测</span>
                <span className="text-xs text-gray-400">· {queryLabel}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 ml-5.5">
                基于近 30 天样本库 + 平台算法模型 + 趋势加速信号综合预测
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Batch indicator */}
            <div className="flex items-center gap-1">
              {BATCHES.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === batchIndex ? 'w-4 h-1.5 bg-gray-700' : 'w-1.5 h-1.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-sm text-gray-600 hover:text-gray-900 rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              换一批
            </button>
          </div>
        </div>

        {/* ── Best pick label ── */}
        <div
          className="flex items-center gap-2 mb-4 flex-shrink-0"
          style={{ animation: 'fadeSlideIn 0.4s ease-out 0.1s both' }}
        >
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white border border-gray-100 px-3 py-1.5 rounded-xl shadow-sm">
            <Flame className="w-3 h-3 text-amber-500" />
            <span>评分 ≥ 80 为高机会 · 有光效标识</span>
            <span className="w-px h-3 bg-gray-200" />
            <span>{cards.filter(c => c.score >= 80).length} 张高机会</span>
            <span className="w-px h-3 bg-gray-200" />
            <span>最高 {maxScore} 分</span>
          </div>
        </div>

        {/* ── 3-column cards — fill remaining height ── */}
        <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
          {cards.map((card, i) => (
            <PredictionCard key={card.id} card={card} index={i} visible={visible} />
          ))}
        </div>

        {/* ── Bottom note ── */}
        <div
          className="mt-4 flex-shrink-0 flex items-center justify-center gap-2 text-xs text-gray-300"
          style={{ animation: 'fadeSlideIn 0.4s ease-out 0.5s both' }}
        >
          <span>数据来源：近 30 天多平台低粉样本库</span>
          <span>·</span>
          <span>预测模型每 24h 更新</span>
          <span>·</span>
          <span>结果仅供参考，不构成保证</span>
        </div>
      </div>
    </>
  );
}
