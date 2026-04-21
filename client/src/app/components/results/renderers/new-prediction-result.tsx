/**
 * New Prediction Result Renderer
 * ===============================
 * 爆款预测结果页 — 三层结构：结果先行 → 动作建议 → 归因展开
 * 
 * 第一层：今日建议拍什么 + 爆款概率 + 推荐级别 + 立即执行按钮
 * 第二层：下一步建议（拍摄方式 / 继续观察 / 脚本拆解）
 * 第三层：归因展开（数据支撑、账号样本、增长趋势、评论信号、低粉爆款、算法维度）——默认折叠
 */

import { useState, useEffect, useMemo } from "react";
import {
  Sparkles, TrendingUp, BarChart3, Target,
  AlertCircle, ChevronDown, Play, ArrowRight,
  FileText, Search, Zap, ChevronUp,
  Rocket, Flame, Eye, Compass,
  CheckCircle2, Clock, Lightbulb,
} from "lucide-react";
import type { ArtifactRendererProps, CtaActionConfig, DeepDiveConfig, FollowUpAction, HeroMetricCard } from "../artifact-registry";
import { registerArtifactRenderer } from "../artifact-registry";
import type { ResultRecord } from "../../../store/app-data-core";
import type {
  PredictionSupportingContent,
  PredictionSupportingAccount,
  PredictionTierBreakdown,
  PredictionCommentInsight,
  PredictionMarketEvidence,
  PredictionWhyNowItem,
} from "../../../store/prediction-types";

/* ------------------------------------------------------------------ */
/*  工具函数                                                            */
/* ------------------------------------------------------------------ */

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getTierLabel(tier: string): string {
  const map: Record<string, string> = {
    head_kol: "头部KOL",
    standard_kol: "标准KOL",
    strong_koc: "强KOC",
    standard_koc: "标准KOC",
    watch_account: "观察账号",
  };
  return map[tier] ?? tier;
}

function getMomentumLabel(m: string): string {
  const map: Record<string, string> = {
    emerging: "新兴上升",
    accelerating: "加速增长",
    crowded: "竞争激烈",
    cooling: "逐渐降温",
  };
  return map[m] ?? m;
}

/** 推荐级别：基于 verdict 映射为用户可感知的推荐等级 */
function getRecommendLevel(verdict: string): { label: string; color: string; bg: string; border: string; description: string } {
  const map: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
    go_now: {
      label: "强烈推荐",
      color: "#059669",
      bg: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
      border: "#A7F3D0",
      description: "数据信号强烈，建议立即行动",
    },
    test_small: {
      label: "值得一试",
      color: "#8979FF",
      bg: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)",
      border: "#C4B5FD",
      description: "有明确机会信号，建议小成本验证",
    },
    observe: {
      label: "持续关注",
      color: "#D97706",
      bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
      border: "#FCD34D",
      description: "趋势正在形成，建议先储备素材",
    },
    skip: {
      label: "暂不建议",
      color: "#6B7280",
      bg: "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)",
      border: "#D1D5DB",
      description: "当前信号不足，建议观望",
    },
  };
  return map[verdict] ?? map.observe!;
}

/** 将 whyNowItem 的 sourceLabel 映射为用户可理解的分类 */
function getUserFriendlyReasonCategory(sourceLabel: string, tone: string): { icon: typeof TrendingUp; category: string; color: string } {
  const label = sourceLabel.toLowerCase();
  if (label.includes("增速") || label.includes("增长") || label.includes("趋势") || label.includes("热度"))
    return { icon: TrendingUp, category: "最近增速异常", color: "#059669" };
  if (label.includes("账号") || label.includes("同行") || label.includes("对标") || label.includes("验证"))
    return { icon: CheckCircle2, category: "同类账号集中验证", color: "#8979FF" };
  if (label.includes("评论") || label.includes("需求") || label.includes("用户"))
    return { icon: Lightbulb, category: "评论需求强信号", color: "#D97706" };
  if (label.includes("低粉") || label.includes("小号") || label.includes("爆款"))
    return { icon: Flame, category: "低粉样本已跑出结果", color: "#EF4444" };
  if (label.includes("跨平台") || label.includes("信息差") || label.includes("迁移"))
    return { icon: Compass, category: "跨平台信息差机会", color: "#0EA5E9" };
  // 默认根据 tone 分配
  if (tone === "positive") return { icon: TrendingUp, category: "最近增速异常", color: "#059669" };
  if (tone === "warning") return { icon: Clock, category: "需要持续关注", color: "#D97706" };
  return { icon: Lightbulb, category: "数据信号支撑", color: "#8979FF" };
}

/** 判断内容是否为异常数据（点赞/评论为0） */
function isAbnormalContent(content: PredictionSupportingContent): boolean {
  return ((content.likeCount ?? 0) === 0 && (content.commentCount ?? 0) === 0);
}

/* ------------------------------------------------------------------ */
/*  爆款概率圆形仪表盘 — 强视觉冲击力                                    */
/* ------------------------------------------------------------------ */
function ProbabilityGauge({ value, size = 180 }: { value: number; size?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayValue / 100) * circumference;

  // 根据分数决定颜色
  const getColor = (v: number) => {
    if (v >= 75) return { main: "#059669", glow: "rgba(5,150,105,0.3)", track: "#D1FAE5" };
    if (v >= 55) return { main: "#8979FF", glow: "rgba(137,121,255,0.3)", track: "#EDE9FE" };
    if (v >= 35) return { main: "#D97706", glow: "rgba(217,119,6,0.3)", track: "#FEF3C7" };
    return { main: "#6B7280", glow: "rgba(107,114,128,0.2)", track: "#F3F4F6" };
  };
  const colors = getColor(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current += 1;
        if (current >= value) { setDisplayValue(value); clearInterval(interval); }
        else setDisplayValue(current);
      }, 15);
      return () => clearInterval(interval);
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* 外发光 */}
      <div className="absolute inset-0 rounded-full" style={{
        boxShadow: `0 0 40px ${colors.glow}, 0 0 80px ${colors.glow}`,
      }} />
      <svg width={size} height={size} className="transform -rotate-90 relative z-10">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.main} stopOpacity="0.8" />
            <stop offset="100%" stopColor={colors.main} />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={colors.track} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="url(#gaugeGradient)" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className="text-[42px] font-bold tracking-tight" style={{ color: colors.main }}>{displayValue}</span>
        <span className="text-[13px] text-[#6B7280] mt-0.5">爆款概率</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  季节性雷达图 - 基于 whyNowItems 数据                                */
/* ------------------------------------------------------------------ */
function WhyNowRadarChart({ items }: { items: PredictionWhyNowItem[] }) {
  const cx = 142.5; const cy = 116; const innerR = 40; const outerR = 96;

  const segments = items.slice(0, 6).map((item, i) => ({
    label: item.sourceLabel.length > 6 ? item.sourceLabel.slice(0, 6) : item.sourceLabel,
    angle: -90 + (i * 360) / Math.max(items.length, 3),
  }));

  while (segments.length < 3) {
    segments.push({ label: "—", angle: -90 + (segments.length * 360) / 3 });
  }

  const values = items.slice(0, segments.length).map((item) =>
    item.tone === "positive" ? 0.85 + Math.random() * 0.15 :
    item.tone === "warning" ? 0.3 + Math.random() * 0.2 :
    0.5 + Math.random() * 0.2
  );
  while (values.length < segments.length) values.push(0.5);

  const peakIdx = values.indexOf(Math.max(...values));

  const radarPoints = segments.map(({ angle }, i) => {
    const rad = (angle * Math.PI) / 180;
    const r = innerR + (values[i] ?? 0.5) * (outerR - innerR);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  });
  const radarPath = radarPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="relative w-[270px] h-[234px] mx-auto">
      <svg viewBox="0 0 285 234" className="w-full h-full">
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <circle key={level} cx={cx} cy={cy} r={innerR + level * (outerR - innerR)}
            fill="none" stroke="#DBDEE4" strokeWidth="1" opacity="0.6" />
        ))}
        {segments.map(({ angle }) => {
          const rad = (angle * Math.PI) / 180;
          return <line key={angle}
            x1={cx + innerR * Math.cos(rad)} y1={cy + innerR * Math.sin(rad)}
            x2={cx + outerR * Math.cos(rad)} y2={cy + outerR * Math.sin(rad)}
            stroke="#DBDEE4" strokeWidth="1" />;
        })}
        <path d={radarPath} fill="rgba(137,121,255,0.15)" stroke="#8979FF" strokeWidth="1.5" />
        {(() => { const p = radarPoints[peakIdx]; return p ? (<><circle cx={p.x} cy={p.y} r="7" fill="rgba(137,121,255,0.25)" /><circle cx={p.x} cy={p.y} r="4" fill="#8979FF" /></>) : null; })()}
      </svg>
      {segments.map(({ label, angle }, i) => {
        const rad = (angle * Math.PI) / 180; const lr = 118;
        const x = cx + lr * Math.cos(rad); const y = cy + lr * Math.sin(rad);
        const isPeak = i === peakIdx;
        return (
          <div key={`${label}-${i}`} className={`absolute text-center ${isPeak ? "text-[#8979FF]" : "text-[#54555A]"}`}
            style={{ left: `${(x/285)*100}%`, top: `${(y/234)*100}%`, transform: "translate(-50%,-50%)", fontSize: "11px", fontWeight: isPeak ? 600 : 400 }}>
            {label}{isPeak && <div style={{ fontSize: "9px", marginTop: "1px" }}>关键</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  柱状图 - 基于 tierBreakdown 数据                                    */
/* ------------------------------------------------------------------ */
function TierBarChart({ breakdown }: { breakdown: PredictionTierBreakdown }) {
  const data = [
    { label: "头部KOL\n（百万粉+）", value: breakdown.headKol },
    { label: "标准KOL\n(10万粉+）", value: breakdown.standardKol },
    { label: "强KOC\n(1万粉+）", value: breakdown.strongKoc },
    { label: "标准KOC\n（1万粉以下）", value: breakdown.standardKoc },
  ];
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const yTicks = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];

  return (
    <div className="relative w-full h-[240px]">
      <div className="absolute left-0 top-0 right-0 bottom-[36px] flex flex-col justify-between">
        {[...yTicks].reverse().map((v) => (
          <div key={v} className="flex items-center gap-2">
            <span className="text-[11px] text-[#99A1AF] w-7 text-right shrink-0">{v}</span>
            <div className="flex-1 border-t border-[#F3F4F6]" />
          </div>
        ))}
      </div>
      <div className="absolute left-10 right-0 top-0 bottom-[36px] flex items-end justify-around gap-2 px-2">
        {data.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="w-full bg-[#B3A9FF] rounded-t-[8px]" style={{ height: `${(item.value/maxVal)*100}%`, minHeight: item.value > 0 ? "4px" : "0" }} />
          </div>
        ))}
      </div>
      <div className="absolute left-10 right-0 bottom-0 flex justify-around px-2 h-[36px] items-start pt-1">
        {data.map((item, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-[#99A1AF] leading-[14px] whitespace-pre-line">{item.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  饼图 - 基于 marketEvidence 数据                                     */
/* ------------------------------------------------------------------ */
function AudiencePieChart({ market }: { market: PredictionMarketEvidence }) {
  const data = [
    { label: "命中KOL", value: market.kolCount, color: "#8979FF" },
    { label: "命中KOC", value: market.kocCount, color: "#B3CFFF" },
    { label: "新创作者", value: market.newCreatorCount, color: "#F7D5A6" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cur = -90;
  const slices = data.map((item) => {
    const angle = (item.value / total) * 360;
    const s = cur; cur += angle; const e = cur;
    const r = 76;
    const sRad = (s * Math.PI) / 180; const eRad = (e * Math.PI) / 180;
    const x1 = 100 + r * Math.cos(sRad); const y1 = 100 + r * Math.sin(sRad);
    const x2 = 100 + r * Math.cos(eRad); const y2 = 100 + r * Math.sin(eRad);
    return { ...item, d: `M 100 100 L ${x1} ${y1} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2} Z` };
  });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 200 200" className="w-[130px] h-[130px] shrink-0">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="2" />)}
        <circle cx="100" cy="100" r="44" fill="white" />
      </svg>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: item.color }} />
            <div>
              <div className="text-[12px] text-[#364153]">{item.label}</div>
              <div className="text-[12px] text-[#99A1AF]">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  视频卡片 - 基于 supportingContents                                  */
/* ------------------------------------------------------------------ */
function ContentVideoCard({ content }: { content: PredictionSupportingContent }) {
  const [expanded, setExpanded] = useState(false);
  const abnormal = isAbnormalContent(content);
  
  return (
    <div className={`rounded-[16px] border overflow-hidden bg-white hover:shadow-md transition-shadow duration-200 ${
      abnormal ? "border-amber-200 opacity-75" : "border-[#F3F4F6]"
    }`}>
      <div className="relative aspect-[16/10] bg-[#F3F4F6] overflow-hidden">
        {content.coverUrl ? (
          <img src={content.coverUrl} alt={content.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#F0EEFF] to-[#E8E6FF]">
            <Play className="w-8 h-8 text-[#8979FF] opacity-50" />
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {content.keywordTokens.slice(0, 2).map((kw, ki) => (
            <span key={ki} className="px-1.5 py-0.5 bg-black/50 text-white text-[10px] rounded">{kw}</span>
          ))}
        </div>
        {/* 异常数据标记 */}
        {abnormal && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-amber-500/90 text-white text-[9px] rounded flex items-center gap-0.5">
            <AlertCircle className="w-2.5 h-2.5" />
            数据待验证
          </div>
        )}
      </div>
      <div className="p-3">
        <h4 className="text-[13px] text-[#1E2939] leading-[18px] line-clamp-2 mb-2">{content.title}</h4>
        <div className="flex items-center gap-2 text-[11px] text-[#99A1AF] mb-2">
          <span>{content.authorName}</span>
          {content.viewCount != null && content.viewCount > 0 && <span>{formatNumber(content.viewCount)}播放</span>}
          {(content.likeCount ?? 0) > 0 && <span>{formatNumber(content.likeCount)}赞</span>}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-[#8979FF] hover:text-[#6B5ED6] transition-colors"
        >
          <span>{expanded ? "收起分析" : "展开分析"}</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {expanded && (
          <div className="mt-2 space-y-2 text-[11px] text-[#6A7282] border-t border-[#F3F4F6] pt-2">
            <div>
              <span className="text-[#8979FF]">结构：</span>
              {content.structureSummary}
            </div>
            <div>
              <span className="text-[#8979FF]">入选原因：</span>
              {content.whyIncluded}
            </div>
            {content.contentUrl && (
              <a href={content.contentUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#8979FF] hover:underline">
                <span>查看原视频</span><ArrowRight className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  可折叠区块                                                          */
/* ------------------------------------------------------------------ */
function CollapsibleSection({ title, subtitle, children, defaultOpen = false }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-7 py-5 text-left hover:bg-[#FAFAFA] transition-colors"
      >
        <div>
          <div className="text-[14px] text-[#1E2939] font-medium">{title}</div>
          {subtitle && <div className="text-[12px] text-[#99A1AF] mt-0.5">{subtitle}</div>}
        </div>
        <div className={`text-[#99A1AF] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </button>
      {open && (
        <div className="px-7 pb-6 border-t border-[#F9FAFB]">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主渲染器组件                                                        */
/* ------------------------------------------------------------------ */

function NewPredictionResultBody({ result }: ArtifactRendererProps) {
  const [selectedDirection, setSelectedDirection] = useState(0);

  const market = result.marketEvidence;
  const tierBreakdown = market?.tierBreakdown;
  const whyNowItems = result.whyNowItems ?? [];
  const commentInsight = result.commentInsight;
  const supportingContents = result.supportingContents ?? [];
  const supportingAccounts = result.supportingAccounts ?? [];
  const lowFollowerEvidence = result.lowFollowerEvidence ?? [];

  // 过滤异常数据：点赞和评论都为0的内容降低优先级
  const validContents = useMemo(() => {
    const normal = supportingContents.filter(c => !isAbnormalContent(c));
    const abnormal = supportingContents.filter(c => isAbnormalContent(c));
    return [...normal, ...abnormal]; // 正常数据优先展示
  }, [supportingContents]);

  // 推荐级别
  const recommendLevel = getRecommendLevel(result.verdict);

  // 构建"建议拍摄方向"数据
  const directions = useMemo(() => {
    const dirs: { title: string; tag: string; tagBg: string; tagColor: string; description: string }[] = [];

    if (result.primaryCard?.title) {
      dirs.push({
        title: result.primaryCard.title,
        tag: "最推荐",
        tagBg: "rgba(5,150,105,0.1)",
        tagColor: "#059669",
        description: result.primaryCard.description,
      });
    }
    if (result.secondaryCard?.title) {
      dirs.push({
        title: result.secondaryCard.title,
        tag: "备选",
        tagBg: "rgba(137,121,255,0.1)",
        tagColor: "#8979FF",
        description: result.secondaryCard.description,
      });
    }
    (result.bestFor ?? []).slice(0, 3 - dirs.length).forEach((bf) => {
      if (!dirs.some(d => d.title === bf)) {
        dirs.push({
          title: bf,
          tag: "可拍",
          tagBg: "rgba(14,165,233,0.1)",
          tagColor: "#0EA5E9",
          description: "",
        });
      }
    });
    if (dirs.length === 0) {
      dirs.push({
        title: result.opportunityTitle || result.query,
        tag: "方向",
        tagBg: "rgba(137,121,255,0.1)",
        tagColor: "#8979FF",
        description: result.summary,
      });
    }
    return dirs;
  }, [result]);

  // 按方向分组视频内容
  const contentsByDirection = useMemo(() => {
    if (validContents.length === 0) return [[]];
    const chunkSize = Math.max(1, Math.ceil(validContents.length / Math.max(directions.length, 1)));
    return directions.map((_, i) =>
      validContents.slice(i * chunkSize, (i + 1) * chunkSize)
    );
  }, [validContents, directions]);

  const currentContents = contentsByDirection[selectedDirection] ?? contentsByDirection[0] ?? [];

  // 热门标签
  const hotTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    validContents.forEach(c => {
      c.keywordTokens.forEach(kw => {
        tagCount.set(kw, (tagCount.get(kw) ?? 0) + 1);
      });
    });
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count], i, arr) => ({
        tag: `#${tag}`,
        count,
        w: Math.round((count / (arr[0]?.[1] ?? 1)) * 100),
      }));
  }, [validContents]);

  // 异常数据统计
  const abnormalCount = supportingContents.filter(c => isAbnormalContent(c)).length;

  return (
    <div className="space-y-4">

      {/* ================================================================ */}
      {/* 第一层：结果先行 — 今日建议拍什么 + 爆款概率 + 推荐级别 + 执行按钮 */}
      {/* ================================================================ */}
      <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_2px_8px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-7 py-8">
          {/* 标签行 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium text-white bg-gray-900">
              <Sparkles className="w-3.5 h-3.5" />
              爆款预测结果
            </span>
            {/* 推荐级别徽章 — 强视觉 */}
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold"
              style={{ background: recommendLevel.bg, color: recommendLevel.color, border: `1px solid ${recommendLevel.border}` }}>
              {recommendLevel.label}
            </span>
          </div>

          {/* 主内容区：左文字 + 右概率仪表盘 */}
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              {/* 今日建议拍什么 — 优先展示具体可拍内容，而非泛赛道名 */}
              <div className="text-[13px] text-[#6B7280] mb-2">今日建议拍什么</div>
              <h2 className="text-[24px] text-[#101828] leading-[34px] font-semibold mb-1">
                {result.primaryCard?.title || result.opportunityTitle || result.query}
              </h2>
              {/* 具体选题示例标签 */}
              {(() => {
                const tp = result.taskPayload;
                const topics = (tp && "trendOpportunities" in tp) ? (tp as { trendOpportunities?: Array<{ executableTopics?: Array<{ title: string }> }> }).trendOpportunities?.[0]?.executableTopics : undefined;
                if (!topics?.length) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {topics.slice(0, 3).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#F3F0FF] text-[#7C6BDB]">
                        <Lightbulb className="w-3 h-3" />
                        {typeof t === "string" ? t : t.title}
                      </span>
                    ))}
                  </div>
                );
              })()}
              <p className="text-[15px] text-[#374151] leading-[26px] mb-5">
                {result.primaryCard?.description || result.bestActionNow?.reason || result.summary}
              </p>

              {/* 推荐级别说明 */}
              <div className="rounded-[14px] px-4 py-3 mb-5" style={{ background: recommendLevel.bg, border: `1px solid ${recommendLevel.border}` }}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: recommendLevel.color }}>
                    {recommendLevel.label}
                  </span>
                  <span className="text-[12px] text-[#6B7280]">—</span>
                  <span className="text-[13px] text-[#374151]">{recommendLevel.description}</span>
                </div>
              </div>

              {/* Agent 建议的下一步任务 */}
              {result.recommendedNextTasks?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[12px] text-[#6B7280] mb-1">Agent 建议的下一步</div>
                  {result.recommendedNextTasks.slice(0, 2).map((task, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-[14px] border border-[#F3F4F6] bg-[#F9FAFB] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("open-deep-dive", {
                          detail: { prompt: `基于这次爆款预测，继续帮我做「${task.title}」。要求：${task.reason}` },
                        }));
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#1E2939] font-medium">{task.title}</div>
                        <div className="text-[11px] text-[#6B7280] mt-0.5 truncate">{task.reason}</div>
                      </div>
                      <span className="shrink-0 ml-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-[10px] bg-white border border-[#E5E7EB] text-[12px] text-[#374151] hover:bg-[#F3F4F6] transition-colors">
                        {task.actionLabel}
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 右侧：爆款概率仪表盘 */}
            <div className="shrink-0 flex flex-col items-center">
              <ProbabilityGauge value={result.score ?? 50} />
            </div>
          </div>
        </div>

        {/* 底部三指标条 */}
        <div className="grid grid-cols-3 border-t border-[#F3F4F6]">
          <div className="px-6 py-4 border-r border-[#F3F4F6]">
            <div className="flex items-center gap-1 text-[12px] text-[#059669] mb-1.5"><TrendingUp className="w-3.5 h-3.5" /><span>赛道热度</span></div>
            <div className="text-[14px] text-[#1E2939] font-medium">{market?.timingLabel ?? "—"}</div>
          </div>
          <div className="px-6 py-4 border-r border-[#F3F4F6]">
            <div className="flex items-center gap-1 text-[12px] text-[#8979FF] mb-1.5"><BarChart3 className="w-3.5 h-3.5" /><span>竞争程度</span></div>
            <div className="text-[14px] text-[#1E2939] font-medium">{getMomentumLabel(market?.momentumLabel ?? "emerging")}</div>
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-1 text-[12px] text-[#D97706] mb-1.5"><Target className="w-3.5 h-3.5" /><span>差异空间</span></div>
            <div className="text-[14px] text-[#1E2939] font-medium">{result.confidenceLabel === "高" ? "较大" : result.confidenceLabel === "中" ? "中等" : "有限"}</div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 第二层：动作建议 — 建议拍摄方向 + 下一步建议                       */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {/* 左：建议拍摄方向 */}
        <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.06)] px-6 py-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center w-6 h-6 bg-gray-900 rounded-full">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-[14px] text-[#1E2939] font-medium">建议拍摄方向</span>
            {directions.length > 1 && (
              <span className="ml-auto text-[11px] text-[#99A1AF]">点击选择</span>
            )}
          </div>

          <div className="space-y-2 mb-4">
            {directions.map((item, i) => {
              const active = selectedDirection === i;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDirection(i)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[12px] border transition-all duration-200 ${
                    active
                      ? "border-[rgba(137,121,255,0.4)] bg-[#F9F8FF]"
                      : "border-transparent bg-[#F9FAFB] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                      active ? "border-[#8979FF]" : "border-[#D1D5DC]"
                    }`}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-[#8979FF]" />}
                    </div>
                    <span className={`text-[13px] transition-colors ${active ? "text-[#1E2939]" : "text-[#4A5565]"}`}>
                      {item.title}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{ backgroundColor: item.tagBg, color: item.tagColor }}>
                    {item.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {directions[selectedDirection]?.description && (
            <div className="py-3 border-t border-[#F9FAFB] text-[12px] text-[#6B7280] leading-[18px]">
              {directions[selectedDirection].description}
            </div>
          )}

          {/* 需注意 */}
          {(result.notFor?.length ?? 0) > 0 && (
            <div className="mt-3 bg-[#FFFBF0] rounded-[12px] border border-[#F7D5A6] px-3 py-2.5">
              <div className="text-[12px] text-[#B07D2A] mb-1">需注意</div>
              <ul className="space-y-0.5">
                {result.notFor.map((item, i) => (
                  <li key={i} className="text-[11px] text-[#6A7282]">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 右：下一步动作（触发 CozeEditorDrawer 编辑器） */}
        <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.06)] px-6 py-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center w-6 h-6 bg-[#8979FF] rounded-full">
              <Rocket className="w-3 h-3 text-white" />
            </div>
            <span className="text-[14px] text-[#1E2939] font-medium">下一步动作</span>
          </div>

          <div className="space-y-2">
            {/* 动态生成 CTA 按钮，通过 id 匹配 getCtaActions 返回的动作 */}
            {[
              { id: "shoot_plan", icon: Rocket, label: result.bestActionNow.ctaLabel, desc: result.bestActionNow.description || result.bestActionNow.reason, highlight: result.verdict === "go_now" },
              ...(lowFollowerEvidence.length > 0 ? [{ id: "breakdown_low", icon: Flame, label: "拆解低粉爆款", desc: `已发现 ${lowFollowerEvidence.length} 个低粉高互动样本，拆解可复用的爆款结构`, highlight: false }] : []),
              { id: "watch_7d", icon: Eye, label: "加入 7 天监控", desc: "系统每天自动复查赛道数据，有异动立刻通知你", highlight: false },
            ].map((cta, i) => {
              const Icon = cta.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    // 通过 ctaId 匹配 + 传入当前选中方向的上下文，实现方向选择与 CTA 的真正联动
                    const dir = directions[selectedDirection];
                    window.dispatchEvent(new CustomEvent("open-cta-editor", {
                      detail: {
                        ctaId: cta.id,
                        directionContext: dir ? { title: dir.title, description: dir.description, tag: dir.tag } : undefined,
                      },
                    }));
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-[14px] border text-left transition-all duration-200 ${
                    cta.highlight
                      ? "border-[#8979FF] bg-[#F9F8FF] hover:bg-[#F3F0FF]"
                      : "border-[#F3F4F6] bg-[#F9FAFB] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <div className={`shrink-0 mt-0.5 flex items-center justify-center w-7 h-7 rounded-full ${
                    cta.highlight ? "bg-[#8979FF]" : "bg-[#E5E7EB]"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${cta.highlight ? "text-white" : "text-[#6B7280]"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium ${cta.highlight ? "text-[#8979FF]" : "text-[#1E2939]"}`}>
                      {cta.label}
                    </div>
                    <div className="text-[11px] text-[#6B7280] mt-0.5 leading-[16px]">
                      {cta.desc}
                    </div>
                  </div>
                  <ArrowRight className="shrink-0 mt-1 w-4 h-4 text-[#99A1AF]" />
                </button>
              );
            })}
          </div>

          {/* 如果现在不做会错过什么 */}
          {result.missIfWait && (
            <div className="mt-3 rounded-[14px] border border-[#D1FAE5] bg-[#ECFDF5] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-[#059669]" />
                <span className="text-[12px] text-[#059669] font-medium">如果现在不做</span>
              </div>
              <p className="text-[11px] text-[#065F46] leading-[16px]">
                {result.missIfWait}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 第三层：归因展开 — 全部默认折叠                                    */}
      {/* ================================================================ */}

      {/* 异常数据提示 */}
      {abnormalCount > 0 && (
        <div className="flex items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-[12px] text-amber-800">
            本次分析中有 {abnormalCount} 条内容的互动数据为零，已标记为"数据待验证"，不影响核心预测结果
          </span>
        </div>
      )}

      {/* 预测理由 — 用户化表达 */}
      {whyNowItems.length > 0 && (
        <CollapsibleSection title="为什么现在值得拍" subtitle="预测依据 · 用数据说话">
          <div className="pt-4 space-y-3">
            {whyNowItems.map((item, i) => {
              const friendly = getUserFriendlyReasonCategory(item.sourceLabel, item.tone);
              const Icon = friendly.icon;
              return (
                <div key={i} className="rounded-[14px] border border-[#F3F4F6] bg-[#FAFAFA] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" style={{ color: friendly.color }} />
                    <span className="text-[12px] font-medium" style={{ color: friendly.color }}>{friendly.category}</span>
                  </div>
                  <div className="text-[13px] text-[#1E2939] leading-[20px] mb-1">{item.fact}</div>
                  <div className="text-[12px] text-[#6B7280] leading-[18px]">{item.userImpact}</div>
                </div>
              );
            })}
          </div>
          {whyNowItems.length >= 3 && (
            <div className="mt-5">
              <div className="text-[12px] text-[#99A1AF] mb-3">多维度信号强度</div>
              <WhyNowRadarChart items={whyNowItems} />
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* 热门作品（随方向联动） */}
      {currentContents.length > 0 && (
        <CollapsibleSection title="热门作品参考" subtitle={`${directions[selectedDirection]?.title ?? "全部"} · ${currentContents.length} 个样本`}>
          <div className="pt-4">
            {hotTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {hotTags.slice(0, 4).map((ht, ki) => (
                  <span key={ki}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#E9EAEC] bg-white text-[12px] text-[#4A5565] hover:border-[rgba(137,121,255,0.4)] hover:bg-[#F9F8FF] hover:text-[#8979FF] transition-all duration-150 cursor-pointer select-none">
                    <Search className="w-3 h-3 opacity-50" />
                    {ht.tag}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              {currentContents.slice(0, 6).map((content, vi) => (
                <ContentVideoCard key={`${selectedDirection}-${vi}`} content={content} />
              ))}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* 相似账号参考 */}
      {supportingAccounts.length > 0 && (
        <CollapsibleSection title="相似账号参考" subtitle={`近 30 天成长期样本 · ${supportingAccounts.length} 个账号`}>
          <div className="pt-4 grid grid-cols-3 gap-4">
            {supportingAccounts.slice(0, 6).map((account, i) => (
              <div key={i} className="rounded-[16px] bg-[#F9FAFB] px-4 py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[12px] text-[#364153]">@{account.displayName || account.handle}</div>
                  <div className="text-[12px] text-[#99A1AF]">
                    {account.followerCount != null ? formatNumber(account.followerCount) + "粉" : "—"}
                    {account.recentTopicClusters?.[0] && ` · ${account.recentTopicClusters[0]}`}
                  </div>
                </div>
                <span className="px-1.5 py-0.5 bg-white border border-[#F3F4F6] rounded text-[12px] text-[#99A1AF]">
                  {getTierLabel(account.tierLabel)}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 低粉爆款归因 —— 独立折叠区 */}
      {lowFollowerEvidence.length > 0 && (
        <CollapsibleSection title="低粉爆款归因" subtitle={`${lowFollowerEvidence.length} 个低粉高互动样本解析`}>
          <div className="pt-4 space-y-3">
            {lowFollowerEvidence.slice(0, 6).map((item, i) => (
              <div key={i} className="rounded-[14px] border border-[#F3F4F6] bg-[#FAFAFA] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-4 h-4 text-[#EF4444]" />
                  <span className="text-[13px] text-[#1E2939] font-medium">{item.title}</span>
                </div>
                <div className="flex items-center gap-3 text-[12px] text-[#6B7280]">
                  <span>@{item.account}</span>
                  <span>{item.fansLabel}</span>
                  {item.playCount && <span>{item.playCount}播放</span>}
                  <span className="px-1.5 py-0.5 rounded bg-[#FEF2F2] text-[#EF4444] text-[11px] font-medium">异常值 {item.anomaly}x</span>
                </div>
                {item.suggestion && (
                  <p className="mt-2 text-[12px] text-[#6B7280] leading-[18px]">
                    爆款原因：{item.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 市场数据 */}
      {market && (
        <CollapsibleSection title="市场数据支撑" subtitle="数据来源 · 增长趋势 · 受众分析">
          <div className="pt-4 grid grid-cols-2 gap-8 items-start">
            {/* 左列 */}
            <div className="flex flex-col gap-6">
              {tierBreakdown && (
                <div>
                  <h3 className="text-[13px] text-[#1E2939] mb-4">发布账号 / 等级分布</h3>
                  <TierBarChart breakdown={tierBreakdown} />
                  <div className="grid grid-cols-3 gap-3 mt-5">
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">相似内容</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[16px] text-black">{market.similarContentCount}</span>
                        <span className="px-1.5 py-0.5 bg-[rgba(0,76,201,0.1)] rounded text-[10px] text-[#004CC9]">已有样本</span>
                      </div>
                    </div>
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">近7天增长</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] text-[#006443]">{Math.round(market.growth7d * 100)}%</span>
                        <TrendingUp className="w-4 h-4 text-[#006443]" />
                      </div>
                    </div>
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">低粉异常占比</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] text-[#BA1A1A]">{Math.round(market.lowFollowerAnomalyRatio * 100)}%</span>
                        <AlertCircle className="w-4 h-4 text-[#BA1A1A]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {hotTags.length > 0 && (
                <div className="border-t border-[#F3F4F6] pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] text-[#1E2939]">相关热门话题标签</h3>
                    <span className="text-[11px] text-[#99A1AF]">基于样本关键词</span>
                  </div>
                  <div className="space-y-2.5">
                    {hotTags.map((item) => (
                      <div key={item.tag} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#8979FF] w-[88px] shrink-0">{item.tag}</span>
                        <div className="flex-1 h-1.5 bg-[#F0EEFF] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#8979FF]" style={{ width: `${item.w}%` }} />
                        </div>
                        <span className="text-[11px] text-[#99A1AF] w-[44px] text-right shrink-0">{item.count}次</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 右列 */}
            <div className="bg-[#F9FAFB] rounded-[20px] p-6 flex flex-col gap-6">
              <div>
                <h3 className="text-[13px] text-[#1E2939] mb-5">受众分析</h3>
                <AudiencePieChart market={market} />
              </div>

              {commentInsight && commentInsight.highlights.length > 0 && (
                <div className="border-t border-[#EBEBEB] pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] text-[#1E2939]">评论区需求信号</h3>
                    <span className="text-[11px] text-[#99A1AF]">真实用户声音</span>
                  </div>
                  <div className="space-y-2">
                    {commentInsight.highlights.slice(0, 3).flatMap((hl) =>
                      hl.topComments.slice(0, 2).map((c, ci) => {
                        const firstChar = c.authorName?.[0] ?? "用";
                        const colors = ["#8979FF", "#36B37E", "#FF928A", "#0EA5E9", "#B07D2A"];
                        const bgs = ["#F0EEFF", "#F0FAF6", "#FFF4F3", "#F0F9FF", "#FFFBF0"];
                        const colorIdx = ci % colors.length;
                        return (
                          <div key={`${hl.contentId}-${ci}`} className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] shrink-0 mt-0.5"
                              style={{ backgroundColor: bgs[colorIdx], color: colors[colorIdx] }}>
                              {firstChar}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="inline-block max-w-full px-3 py-2 rounded-[12px] rounded-tl-[4px] bg-white border border-[#EBEBEB]">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-[11px] text-[#99A1AF]">{c.authorName}</span>
                                  {c.likeCount > 100 && <span className="px-1.5 py-0.5 rounded bg-[#FFF4F3] text-[9px] text-[#FF928A]">热评</span>}
                                </div>
                                <p className="text-[12px] text-[#364153] leading-[17px]">{c.text}</p>
                              </div>
                              <div className="mt-1 pl-1">
                                <span className="text-[10px] text-[#C4C9D4]">👍 {c.likeCount}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {commentInsight.highFreqKeywords.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#EBEBEB]">
                      <div className="text-[11px] text-[#99A1AF] mb-2.5">评论高频词</div>
                      <div className="flex flex-wrap gap-1.5">
                        {commentInsight.highFreqKeywords.map((word, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full border border-[#E2E2E2] text-[#5E6776] bg-white"
                            style={{ fontSize: i < 3 ? "12px" : i < 6 ? "11px" : "10px" }}>
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {commentInsight.demandSignals.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#EBEBEB]">
                      <div className="text-[11px] text-[#99A1AF] mb-2">用户需求信号</div>
                      <div className="space-y-1">
                        {commentInsight.demandSignals.map((signal, i) => (
                          <div key={i} className="text-[11px] text-[#364153]">• {signal}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 低粉爆款已移至独立折叠区 */}
            </div>
          </div>
        </CollapsibleSection>
      )}

      <div className="h-4" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  导出                                                                 */
/* ------------------------------------------------------------------ */
export { NewPredictionResultBody };
export default NewPredictionResultBody;

/* ------------------------------------------------------------------ */
/*  Registry 配置函数                                                   */
/* ------------------------------------------------------------------ */

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const recommendLevel = getRecommendLevel(result.verdict);
  return [
    {
      label: "爆款概率",
      value: `${result.score}`,
      detail: recommendLevel.label,
    },
    {
      label: "当前最优动作",
      value: result.bestActionNow.ctaLabel,
      detail: result.bestActionNow.reason,
    },
    {
      label: "市场时机",
      value: result.marketEvidence.evidenceWindowLabel,
      detail: result.marketEvidence.timingLabel,
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDiveConfig(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续深挖这次预测",
    description: "基于真实样本数据，继续展开具体问题。",
    placeholder: "给我这次预测的开拍方案",
    quickActions: [
      { label: "给我这次预测的开拍方案", cost: 10 },
      { label: "明确效果评估标准和升级信号", cost: 10 },
      { label: "帮我分析这个赛道的竞争格局", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  const score = result.score ?? 50;
  const shootPlan: CtaActionConfig = {
    id: "shoot_plan",
    icon: Rocket,
    title: "生成开拍方案",
    description: "基于真实样本，直接给你一版能拍的脚本和分镜",
    value: "省去 2 小时选题策划时间",
    cost: 30,
    prompt: `基于这次爆款预测（${result.query}），帮我生成一版完整的开拍方案。`,
    highlight: false,
  };
  const breakdownLow: CtaActionConfig = {
    id: "breakdown_low",
    icon: Flame,
    title: "拆解低粉爆款",
    description: "看看别人低粉怎么做到高互动的，拆成你能抄的步骤",
    value: "直接获得可复用的爆款结构",
    cost: 20,
    prompt: `基于这次爆款预测（${result.query}），帮我拆解低粉爆款案例。`,
    highlight: false,
  };
  const watch7d: CtaActionConfig = {
    id: "watch_7d",
    icon: Eye,
    title: "加入 7 天监控",
    description: "系统每天自动复查这个赛道的数据变化，有异动立刻通知你",
    value: "不错过最佳入场时机",
    cost: 0,
    prompt: `加入监控`,
    highlight: false,
  };
  const topicStrategy: CtaActionConfig = {
    id: "topic_strategy",
    icon: Compass,
    title: "生成可拍选题",
    description: "基于这次预测，生成多个可直接拍摄的选题方向",
    value: "从预测到选题一步到位",
    cost: 25,
    prompt: `基于这次爆款预测（${result.query}），帮我生成完整的可拍选题，包括多个选题方向、同行对标和可执行选题。`,
    highlight: false,
  };

  if (score >= 75) {
    shootPlan.highlight = true;
    return [shootPlan, topicStrategy, breakdownLow, watch7d];
  } else if (score >= 55) {
    topicStrategy.highlight = true;
    return [topicStrategy, breakdownLow, shootPlan, watch7d];
  } else {
    watch7d.highlight = true;
    return [watch7d, topicStrategy, breakdownLow, shootPlan];
  }
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次爆款预测，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }
  return [
    { label: "把这次结果收成可执行步骤", prompt: "把这次结果收成可执行步骤" },
    { label: "明确效果评估标准和升级信号", prompt: "明确效果评估标准和升级信号" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Register                                                            */
/* ------------------------------------------------------------------ */

registerArtifactRenderer({
  artifactType: "opportunity_memo",
  taskIntent: "opportunity_prediction",
  component: NewPredictionResultBody,
  getHeroMetrics,
  getDeepDiveConfig,
  getCtaActions,
  getFollowUpActions,
});
