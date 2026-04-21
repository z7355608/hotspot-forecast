/**
 * Opportunity Prediction Renderer
 * ================================
 * 爆款预测的 Dumb Renderer。
 */

import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Eye,
  Lightbulb,
  Rocket,
  Flame,
  Compass,
  MessageSquare,
  ThumbsUp,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
  Clock,
  Target,
  Sparkles,
} from "lucide-react";
import type { ResultRecord } from "../../../store/app-data";
import type {
  TrendOpportunity,
  TrendOpportunityStage,
  OpportunityPredictionTaskPayload,
} from "../../../store/prediction-types";
import {
  formatMetricValue,
  getTierLabelLabel,
} from "../../../store/result-evidence-adapter-core";
import {
  formatShortDate,
  WHY_NOW_TONE,
} from "../results-view-meta";
import { ResultCardPanel } from "../results-shared";
import {
  registerArtifactRenderer,
  type ArtifactRendererProps,
  type HeroMetricCard,
  type DeepDiveConfig,
  type CtaActionConfig,
  type FollowUpAction,
} from "../artifact-registry.js";

/* ------------------------------------------------------------------ */
/*  爆款预测：趋势机会卡片组件                                          */
/* ------------------------------------------------------------------ */

const STAGE_CONFIG: Record<TrendOpportunityStage, {
  label: string;
  gradient: string;
  cardGradient: string;
  borderColor: string;
  glowColor: string;
  pulse: boolean;
  textColor: string;
  badgeBg: string;
}> = {
  pre_burst: {
    label: "爆发前夜",
    gradient: "from-orange-500 to-rose-600",
    cardGradient: "from-orange-950/80 via-rose-950/60 to-slate-900/90",
    borderColor: "border-orange-500/40",
    glowColor: "shadow-orange-500/20",
    pulse: true,
    textColor: "text-orange-400",
    badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  },
  validated: {
    label: "已验证",
    gradient: "from-emerald-500 to-teal-600",
    cardGradient: "from-emerald-950/80 via-teal-950/60 to-slate-900/90",
    borderColor: "border-emerald-500/40",
    glowColor: "shadow-emerald-500/20",
    pulse: false,
    textColor: "text-emerald-400",
    badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  high_risk: {
    label: "高风险假热",
    gradient: "from-slate-500 to-slate-600",
    cardGradient: "from-slate-900/90 via-slate-800/60 to-slate-900/90",
    borderColor: "border-slate-500/30",
    glowColor: "shadow-slate-500/10",
    pulse: false,
    textColor: "text-slate-400",
    badgeBg: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  },
};

interface CircularProgressProps {
  value: number;
  label: string;
  color: string;
  size?: number;
}

function CircularProgress({ value, label, color, size = 72 }: CircularProgressProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayValue / 100) * circumference;
  const strokeDashoffset = circumference - progress;

  useEffect(() => {
    let raf: number;
    const duration = 800;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold" style={{ fontSize: size * 0.22 }}>{displayValue}</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap">{label}</span>
    </div>
  );
}

function TrendOpportunityCard({ opportunity, index }: { opportunity: TrendOpportunity; index: number }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const cfg = STAGE_CONFIG[opportunity.stage] ?? STAGE_CONFIG.validated;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 120);
    return () => clearTimeout(t);
  }, [index]);

  const scoreColor = opportunity.opportunityScore >= 75 ? "#f97316" : opportunity.opportunityScore >= 55 ? "#10b981" : "#64748b";
  const timingColor = opportunity.timingScore >= 75 ? "#f97316" : opportunity.timingScore >= 55 ? "#3b82f6" : "#64748b";

  return (
    <div
      className={`
        relative rounded-2xl border overflow-hidden shadow-xl ${cfg.glowColor} ${cfg.borderColor}
        transition-all duration-700
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
      `}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${cfg.cardGradient}`} />
      <div className={`absolute -top-16 -right-16 w-32 h-32 rounded-full opacity-20 blur-3xl bg-gradient-to-br ${cfg.gradient}`} />

      <div className="relative z-10 p-5">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* 序号徽章 */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black border ${
                index === 0
                  ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                  : index === 1
                  ? "bg-slate-400/15 border-slate-400/30 text-slate-300"
                  : "bg-slate-600/15 border-slate-600/30 text-slate-400"
              }`}>
                #{index + 1} {index === 0 ? "最佳机会" : index === 1 ? "次选机会" : "备选机会"}
              </span>
              {/* 阶段标签 */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.badgeBg} ${cfg.pulse ? "animate-pulse" : ""}`}>
                {cfg.pulse && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-gradient-to-r ${cfg.gradient}`} />
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 bg-gradient-to-r ${cfg.gradient}`} />
                  </span>
                )}
                {cfg.label}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white leading-tight">{opportunity.opportunityName}</h3>
            <p className={`text-sm mt-1 ${cfg.textColor} font-medium`}>{opportunity.oneLiner}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <CircularProgress value={opportunity.opportunityScore} label="机会分" color={scoreColor} />
            <CircularProgress value={opportunity.timingScore} label="时机分" color={timingColor} />
          </div>
        </div>

        {/* 为什么现在做 */}
        {opportunity.whyNow.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">为什么现在做</span>
            </div>
            <ul className="space-y-1.5">
              {opportunity.whyNow.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-xs font-bold">{i + 1}</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 行动建议 */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">现在做</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{opportunity.doNow}</p>
          </div>
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400">先观察</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{opportunity.observe}</p>
          </div>
        </div>

        {/* 可执行选题 */}
        {opportunity.executableTopics.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">可执行选题</span>
            </div>
            <div className="space-y-2">
              {opportunity.executableTopics.map((topic, i) => (
                <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-3 hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200">
                  <p className="text-sm font-medium text-white mb-1.5">{topic.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.hookType && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">{topic.hookType}</span>}
                    {topic.angle && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">{topic.angle}</span>}
                    {topic.estimatedDuration && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30">⏱ {topic.estimatedDuration}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 证据折叠 */}
        {opportunity.evidenceSummary && (
          <div className="mt-2">
            <button onClick={() => setEvidenceOpen(!evidenceOpen)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>数据证据</span>
              {evidenceOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {evidenceOpen && (
              <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-3">
                <p className="text-xs text-slate-400 leading-relaxed">{opportunity.evidenceSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TrendOpportunitiesPanel({ result }: { result: ResultRecord }) {
  const taskPayload = result.taskPayload as OpportunityPredictionTaskPayload;
  const trendOpportunities = taskPayload?.trendOpportunities ?? [];
  const overviewOneLiner = taskPayload?.overviewOneLiner ?? "";
  const [headerVisible, setHeaderVisible] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHeaderVisible(true), 50);
    const t2 = setTimeout(() => setTitleVisible(true), 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!trendOpportunities || trendOpportunities.length === 0) return null;

  const seedTopic = result.normalizedBrief?.seedTopic ?? result.opportunityTitle ?? "当前赛道";
  const topScore = Math.max(...trendOpportunities.map((o) => o.opportunityScore));
  const topStage = trendOpportunities.find((o) => o.opportunityScore === topScore)?.stage ?? "validated";
  const stageCfg = STAGE_CONFIG[topStage];
  const hasBurst = trendOpportunities.some((o) => o.stage === "pre_burst");

  return (
    <div className="space-y-5">
      {/* 终极爆款预测 — Hero 头部 */}
      <div
        className={`
          relative rounded-2xl overflow-hidden
          transition-all duration-700
          ${headerVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-6"}
        `}
        style={{ boxShadow: hasBurst ? "0 0 40px rgba(251,146,60,0.15), 0 0 80px rgba(251,146,60,0.05)" : "0 0 40px rgba(16,185,129,0.12), 0 0 80px rgba(16,185,129,0.04)" }}
      >
        {/* 背景层 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className={`absolute inset-0 bg-gradient-to-br ${stageCfg.gradient} opacity-[0.08]`} />
        {/* 顶部光条 */}
        <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${hasBurst ? "from-transparent via-orange-400 to-transparent" : "from-transparent via-emerald-400 to-transparent"}`} />
        {/* 左侧装饰线 */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${stageCfg.gradient}`} />
        <div className="relative z-10 p-5 pl-6">
          {/* 主标题区 */}
          <div className={`transition-all duration-500 delay-150 ${titleVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold tracking-widest uppercase ${hasBurst ? "bg-orange-500/15 border-orange-500/30 text-orange-400" : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"}`}>
                <Sparkles className="w-3 h-3" />
                AI 终极爆款预测
              </div>
              {hasBurst && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 animate-pulse">
                  <Flame className="w-3 h-3" />
                  爆发前夜
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-white leading-tight tracking-tight">
              {seedTopic}
              <span className={`ml-2 text-lg font-bold bg-gradient-to-r ${stageCfg.gradient} bg-clip-text text-transparent`}>的爆款机会</span>
            </h1>
            {overviewOneLiner && (
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed max-w-xl">{overviewOneLiner}</p>
            )}
          </div>
          {/* 数据摘要行 */}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`text-4xl font-black bg-gradient-to-r ${stageCfg.gradient} bg-clip-text text-transparent leading-none`}>
                {trendOpportunities.length}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">个趋势机会</div>
                <div className="text-xs text-slate-500">已发现</div>
              </div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="text-2xl font-black text-white leading-none">{topScore}</div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white">最高机会分</div>
                <div className="text-xs text-slate-500">100分满</div>
              </div>
            </div>
            {result.platform.length > 0 && (
              <>
                <div className="w-px h-8 bg-white/10" />
                <div className="flex flex-wrap gap-1.5">
                  {result.platform.map((p) => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10">{p}</span>
                  ))}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-500 border border-white/5">
                    {result.supportingContents.length}条内容 · {result.supportingAccounts.length}个账号
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 机会卡片列表 — 带 stagger 进场 */}
      {trendOpportunities.map((opp, i) => (
        <TrendOpportunityCard key={i} opportunity={opp} index={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: 格式化数字（万/亿）                                          */
/* ------------------------------------------------------------------ */

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return n.toLocaleString("zh-CN");
}

/* ------------------------------------------------------------------ */
/*  Sub-component: 内容卡片（支持折叠）                                  */
/* ------------------------------------------------------------------ */

const CONTENT_INITIAL_SHOW = 3;

function calcEngagementScore(content: ResultRecord["supportingContents"][number]): string {
  const like = content.likeCount ?? 0;
  const comment = content.commentCount ?? 0;
  const collect = content.collectCount ?? 0;
  const share = content.shareCount ?? 0;
  // 互动力指数 = 点赞 + 评论*3 + 收藏*2 + 分享*5
  const score = like + comment * 3 + collect * 2 + share * 5;
  if (score >= 100_000_000) return `${(score / 100_000_000).toFixed(1)}亿`;
  if (score >= 10_000) return `${(score / 10_000).toFixed(1)}万`;
  return score.toLocaleString("zh-CN");
}

function calcCollectLikeRatio(content: ResultRecord["supportingContents"][number]): string {
  const like = content.likeCount ?? 0;
  const collect = content.collectCount ?? 0;
  if (like === 0) return "—";
  return `${((collect / like) * 100).toFixed(1)}%`;
}

function isKuaishouContent(content: { platform: string }): boolean {
  return content.platform === "快手" || content.platform === "kuaishou";
}

function ContentList({ contents }: { contents: ResultRecord["supportingContents"] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? contents : contents.slice(0, CONTENT_INITIAL_SHOW);
  const hasMore = contents.length > CONTENT_INITIAL_SHOW;

  if (contents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-xs leading-relaxed text-gray-400">
        当前没有搜索到相关爆款内容。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((content) => {
        const isKs = isKuaishouContent(content);
        const inner = (
          <>
            <div className="min-w-0">
              <div className="line-clamp-2 break-words text-sm leading-snug text-gray-900 flex items-start gap-1">
                <span>{content.title}</span>
                {content.contentUrl && <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />}
              </div>
              <div className="mt-1 break-words text-xs text-gray-400">
                {content.authorName} · {content.platform} · {formatShortDate(content.publishedAt)}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              {isKs && content.viewCount != null && (
                <div>
                  <div className="text-gray-400">播放</div>
                  <div className="mt-1 font-medium text-gray-800">{fmtNum(content.viewCount)}</div>
                </div>
              )}
              <div>
                <div className="text-gray-400">点赞</div>
                <div className="mt-1 font-medium text-gray-800">{fmtNum(content.likeCount)}</div>
              </div>
              {!isKs && (
                <div>
                  <div className="text-gray-400">评论</div>
                  <div className="mt-1 font-medium text-gray-800">{fmtNum(content.commentCount)}</div>
                </div>
              )}
              {isKs ? (
                <div>
                  <div className="text-gray-400">转发</div>
                  <div className="mt-1 font-medium text-gray-800">{fmtNum(content.shareCount)}</div>
                </div>
              ) : (
                <div>
                  <div className="text-gray-400">收藏</div>
                  <div className="mt-1 font-medium text-gray-800">{fmtNum(content.collectCount)}</div>
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              {isKs ? (
                <>
                  <div>
                    <div className="text-gray-400">评论</div>
                    <div className="mt-1 font-medium text-gray-500">不可用</div>
                  </div>
                  <div>
                    <div className="text-gray-400">互动力</div>
                    <div className="mt-1 font-medium text-gray-800">{calcEngagementScore(content)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">转发率</div>
                    <div className="mt-1 font-medium text-gray-800">
                      {(content.likeCount ?? 0) > 0 ? `${(((content.shareCount ?? 0) / (content.likeCount ?? 1)) * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-gray-400">分享</div>
                    <div className="mt-1 font-medium text-gray-800">{fmtNum(content.shareCount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">互动力</div>
                    <div className="mt-1 font-medium text-gray-800">{calcEngagementScore(content)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">收藏率</div>
                    <div className="mt-1 font-medium text-gray-800">{calcCollectLikeRatio(content)}</div>
                  </div>
                </>
              )}
            </div>
            {content.keywordTokens.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {content.keywordTokens.map((token, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-gray-100 bg-white px-2 py-0.5 text-[11px] text-gray-500"
                  >
                    {token}
                  </span>
                ))}
              </div>
            )}
          </>
        );
        return content.contentUrl ? (
          <a
            key={content.contentId}
            href={content.contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl bg-gray-50 px-4 py-4 min-w-0 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            {inner}
          </a>
        ) : (
          <div key={content.contentId} className="rounded-2xl bg-gray-50 px-4 py-4 min-w-0">
            {inner}
          </div>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-gray-200 py-2.5 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" />收起</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" />还有 {contents.length - CONTENT_INITIAL_SHOW} 条，点击展开</>
          )}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: 账号卡片                                             */
/* ------------------------------------------------------------------ */

function AccountList({ accounts }: { accounts: ResultRecord["supportingAccounts"] }) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-xs leading-relaxed text-gray-400">
        当前没有可展示的调研账号。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {accounts.map((account) => {
        const Wrapper = account.profileUrl
          ? ({ children, className }: { children: React.ReactNode; className: string }) => (
              <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className={`${className} block cursor-pointer hover:bg-gray-100 transition-colors`}>
                {children}
              </a>
            )
          : ({ children, className }: { children: React.ReactNode; className: string }) => (
              <div className={className}>{children}</div>
            );
        return (
          <Wrapper key={account.accountId} className="rounded-2xl bg-gray-50 px-4 py-4 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="line-clamp-2 break-words text-sm text-gray-900 flex items-center gap-1">
                  {account.displayName}
                  {account.profileUrl && <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />}
                </div>
                {account.handle && account.handle !== account.accountId && (
                  <div className="mt-1 break-words text-xs text-gray-400">
                    @{account.handle} · {account.platform}
                  </div>
                )}
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-gray-500">
                {getTierLabelLabel(account.tierLabel)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <div className="text-gray-400">粉丝</div>
                <div className="mt-1 font-medium text-gray-800">
                  {fmtNum(account.followerCount)}
                </div>
              </div>
              <div>
                <div className="text-gray-400">关注</div>
                <div className="mt-1 font-medium text-gray-800">
                  {fmtNum(account.followingCount)}
                </div>
              </div>
              <div>
                <div className="text-gray-400">获赞</div>
                <div className="mt-1 font-medium text-gray-800">
                  {fmtNum(account.totalLikeCount)}
                </div>
              </div>
            </div>
            {account.recentTopicClusters.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {account.recentTopicClusters.map((item, index) => (
                  <span
                    key={index}
                    className="max-w-full truncate rounded-md border border-gray-100 bg-white px-2 py-0.5 text-[11px] text-gray-500"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Renderer Component                                                  */
/* ------------------------------------------------------------------ */

function OpportunityPredictionBody({ result }: ArtifactRendererProps) {
  const scrollToDeepDive = (prompt: string) => {
    // Dispatch a custom event that results-view-shell listens for
    window.dispatchEvent(new CustomEvent("open-deep-dive", { detail: { prompt } }));
  };
  const inputKind = result.normalizedBrief?.inputKind ?? "prompt";
  const recommendedSamples = result.lowFollowerEvidence;
  const taskPayload = result.taskPayload as OpportunityPredictionTaskPayload;
  const hasTrendOpportunities = (taskPayload?.trendOpportunities?.length ?? 0) > 0;

  const sampleSections = useMemo(() => {
    const sections = [
      {
        key: "accounts",
        title: "调研账号",
        description: "哪些账号已经在做这个方向，点击可查看。",
      },
      {
        key: "contents",
        title: inputKind === "content_url" ? "结构样本" : "爆款内容",
        description:
          inputKind === "content_url"
            ? "这批内容证明当前真正跑起来的是哪些结构，点击可查看原视频。"
            : "已经跑通的爆款内容，点击可查看原视频。",
      },
      {
        key: "lowFollower",
        title: "低粉爆款数据",
        description: "低粉账号跑出来的真实数据，可以直接参考。",
      },
    ];

    if (inputKind === "account") {
      return [sections[0], sections[2], sections[1]];
    }
    if (inputKind === "content_url") {
      return [sections[1], sections[0], sections[2]];
    }
    return sections;
  }, [inputKind]);

  return (
    <>
      {/* 爆款预测：多趋势机会卡片（有数据时显示） */}
      {hasTrendOpportunities && (
        <TrendOpportunitiesPanel result={result} />
      )}

      {/* 旧版详细区块：当有 trendOpportunities 时隐藏 */}
      {!hasTrendOpportunities && (<>
      {/* 为什么是现在 */}
      <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="px-5 py-5 sm:px-7">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
              <TrendingUp className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm text-gray-800">为什么是现在</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {result.whyNowItems.map((item) => (
              <div
                key={`${result.id}-${item.sourceLabel}-${item.fact}`}
                className={`rounded-2xl border px-4 py-4 ${WHY_NOW_TONE[item.tone]}`}
              >
                <div className="mb-3">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-gray-500">
                    {item.sourceLabel}
                  </span>
                </div>
                <p className="break-words text-sm leading-relaxed text-gray-800 font-medium">
                  {item.fact}
                </p>
                <p className="mt-2 break-words text-xs leading-relaxed text-gray-600">
                  {item.inference}
                </p>
                <p className="mt-2 break-words text-xs leading-relaxed text-gray-500 border-t border-white/50 pt-2">
                  {item.userImpact}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 行业验证带 */}
      <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
            <BarChart3 className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm text-gray-800">市场数据</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            { label: "命中 KOL", value: formatMetricValue(result.marketEvidence.kolCount), desc: "大账号已入场" },
            { label: "命中 KOC", value: formatMetricValue(result.marketEvidence.kocCount), desc: "中小账号已入场" },
            { label: "新创作者", value: formatMetricValue(result.marketEvidence.newCreatorCount), desc: "新人也在做" },
            { label: "相似内容", value: formatMetricValue(result.marketEvidence.similarContentCount), desc: "已有内容样本" },
            { label: "近 7 天增长", value: `${result.marketEvidence.growth7d > 0 ? "+" : ""}${result.marketEvidence.growth7d}%`, desc: "热度趋势" },
            { label: "低粉异常占比", value: formatMetricValue(result.marketEvidence.lowFollowerAnomalyRatio, "percent"), desc: "低粉爆款比例" },
            ...(result.hotSeedCount != null && result.hotSeedCount > 0
              ? [{ label: "热榜/热词命中", value: String(result.hotSeedCount), desc: "热榜热词相关条数" }]
              : []),
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-gray-50 px-4 py-4">
              <div className="text-[11px] text-gray-400">{item.label}</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{item.value}</div>
              <div className="mt-1 text-[10px] text-gray-400">{item.desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white px-4 py-4">
          <div className="mb-3">
            <div className="text-sm text-gray-800">账号层级分布</div>
            <div className="mt-1 text-xs text-gray-400">
              {result.marketEvidence.timingLabel}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "头部 KOL（百万粉+）", value: result.marketEvidence.tierBreakdown.headKol },
              { label: "标准 KOL（10万粉+）", value: result.marketEvidence.tierBreakdown.standardKol },
              { label: "强 KOC（1万粉+）", value: result.marketEvidence.tierBreakdown.strongKoc },
              { label: "标准 KOC（1万粉以下）", value: result.marketEvidence.tierBreakdown.standardKoc },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-[10px] text-gray-400 leading-tight">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 样本证明区 */}
      <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
            <Users className="h-3 w-3 text-white" />
          </div>
          <span className="text-sm text-gray-800">样本证明</span>
        </div>



        <div className="grid gap-4 lg:grid-cols-3">
          {sampleSections.map((section) => (
            <div key={section.key} className="rounded-3xl border border-gray-100 bg-white px-4 py-4">
              <div className="mb-4 min-w-0">
                <div className="text-sm font-medium text-gray-800">{section.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-gray-400">
                  {section.description}
                </div>
              </div>

              {section.key === "accounts" && (
                <div>
                  {(result.marketEvidence.kolCount + result.marketEvidence.kocCount + result.marketEvidence.newCreatorCount) > 0 && (
                    <div className="mb-2 text-xs text-gray-400">
                      共发现 {result.marketEvidence.kolCount + result.marketEvidence.kocCount + result.marketEvidence.newCreatorCount} 个相关创作者，展示 Top {Math.min(result.supportingAccounts.length, 6)}
                    </div>
                  )}
                  <AccountList accounts={result.supportingAccounts} />
                </div>
              )}

              {section.key === "contents" && (
                <div>
                  {result.marketEvidence.similarContentCount > 0 && (
                    <div className="mb-2 text-xs text-gray-400">
                      共搜索到 {formatMetricValue(result.marketEvidence.similarContentCount)} 条相关内容，展示 Top {Math.min(result.supportingContents.length, 3)}
                    </div>
                  )}
                  <ContentList contents={result.supportingContents} />
                </div>
              )}

              {section.key === "lowFollower" && (
                <div className="space-y-3">
                  {recommendedSamples.length > 0 ? (
                    recommendedSamples.map((sample) => {
                      const sLike = (sample as any).likeCount ?? 0;
                      const sComment = (sample as any).commentCount ?? 0;
                      const sCollect = (sample as any).collectCount ?? 0;
                      const sShare = (sample as any).shareCount ?? 0;
                      const engScore = sLike + sComment * 3 + sCollect * 2 + sShare * 5;
                      const engStr = engScore >= 10_000 ? `${(engScore / 10_000).toFixed(1)}万` : engScore.toLocaleString("zh-CN");
                      const collectRatio = sLike > 0 ? `${((sCollect / sLike) * 100).toFixed(1)}%` : "—";
                      const coverUrl = (sample as any).coverUrl as string | null | undefined;
                      const inner = (
                        <>
                          <div className="flex gap-3 min-w-0">
                            {coverUrl && (
                              <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                                <img
                                  src={coverUrl}
                                  alt={sample.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-2 break-words text-sm text-gray-900 flex items-start gap-1">
                                <span>{sample.title}</span>
                                {(sample as any).contentUrl && <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />}
                              </div>
                              <div className="mt-1 break-words text-xs text-gray-400">
                                {(sample as any).authorName ?? sample.account} · {sample.platform} · {formatShortDate(sample.publishedAt)}
                              </div>
                              {sample.fansLabel && (
                                <div className="mt-1">
                                  <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">
                                    {sample.fansLabel}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          {(() => {
                            const isKsSample = isKuaishouContent(sample);
                            return isKsSample ? (
                              <>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                  {sample.playCount && (
                                    <div>
                                      <div className="text-gray-400">播放</div>
                                      <div className="mt-1 font-medium text-gray-800">{sample.playCount}</div>
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-gray-400">点赞</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sLike)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">转发</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sShare)}</div>
                                  </div>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                  <div>
                                    <div className="text-gray-400">评论</div>
                                    <div className="mt-1 font-medium text-gray-500">不可用</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">互动力</div>
                                    <div className="mt-1 font-medium text-gray-800">{engStr}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">转发率</div>
                                    <div className="mt-1 font-medium text-gray-800">
                                      {sLike > 0 ? `${((sShare / sLike) * 100).toFixed(1)}%` : "—"}
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                  <div>
                                    <div className="text-gray-400">点赞</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sLike)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">评论</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sComment)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">收藏</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sCollect)}</div>
                                  </div>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                  <div>
                                    <div className="text-gray-400">分享</div>
                                    <div className="mt-1 font-medium text-gray-800">{fmtNum(sShare)}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">互动力</div>
                                    <div className="mt-1 font-medium text-gray-800">{engStr}</div>
                                  </div>
                                  <div>
                                    <div className="text-gray-400">收藏率</div>
                                    <div className="mt-1 font-medium text-gray-800">{collectRatio}</div>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                          {sample.trackTags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {sample.trackTags.map((item, index) => (
                                <span
                                  key={`${sample.id}-${index}`}
                                  className="max-w-full truncate rounded-md border border-gray-100 bg-white px-2 py-0.5 text-[11px] text-gray-500"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="mt-3 break-words text-xs leading-relaxed text-gray-600">
                            {sample.suggestion}
                          </p>
                        </>
                      );
                      return (sample as any).contentUrl ? (
                        <a
                          key={sample.id}
                          href={(sample as any).contentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full rounded-2xl bg-gray-50 px-4 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={sample.id} className="w-full rounded-2xl bg-gray-50 px-4 py-4">
                          {inner}
                        </div>
                      );
                    })
                  ) : (() => {
                    // 兆底：从 supportingAccounts 中筛选低粉账号作为参考
                    const lowFollowerAccounts = result.supportingAccounts.filter(
                      (a) => a.followerCount != null && a.followerCount < 10000
                    );
                    if (lowFollowerAccounts.length > 0) {
                      return (
                        <div>
                          <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            未发现“异常爆款”低粉样本，以下是搜索到的低粉账号普通表现，可作为参考基准。
                          </div>
                          {lowFollowerAccounts.slice(0, 3).map((account) => (
                            <div key={account.accountId} className="mb-2 rounded-2xl bg-gray-50 px-4 py-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="line-clamp-1 break-words text-sm text-gray-900">
                                    {account.displayName}
                                  </div>
                                  {account.handle && (
                                    <div className="mt-1 text-xs text-gray-400">
                                      @{account.handle} · {account.platform}
                                    </div>
                                  )}
                                </div>
                                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] text-gray-500">
                                  {getTierLabelLabel(account.tierLabel)}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                <div>
                                  <div className="text-gray-400">粉丝</div>
                                  <div className="mt-1 font-medium text-gray-800">{fmtNum(account.followerCount)}</div>
                                </div>
                                <div>
                                  <div className="text-gray-400">关注</div>
                                  <div className="mt-1 font-medium text-gray-800">{fmtNum(account.followingCount)}</div>
                                </div>
                                <div>
                                  <div className="text-gray-400">获赞</div>
                                  <div className="mt-1 font-medium text-gray-800">{fmtNum(account.totalLikeCount)}</div>
                                </div>
                              </div>
                              {account.recentTopicClusters.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {account.recentTopicClusters.map((item, idx) => (
                                    <span key={idx} className="max-w-full truncate rounded-md border border-gray-100 bg-white px-2 py-0.5 text-[11px] text-gray-500">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-xs leading-relaxed text-gray-400">
                        当前搜索范围内未发现低粉账号（&lt;1万粉）的内容样本。建议通过“拆解低粉爆款”CTA 让 AI 专门搜索低粉案例。
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 评论洞察区 */}
      {result.commentInsight && result.commentInsight.unavailableReason && (
        <div className="rounded-3xl border border-amber-100 bg-amber-50/50 px-5 py-4 shadow-sm sm:px-7">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100">
              <MessageSquare className="h-3 w-3 text-amber-600" />
            </div>
            <span className="text-sm text-amber-800">用户声音</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-600">
              暂不可用
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-700">
            {result.commentInsight.unavailableReason.includes("快手") || result.commentInsight.unavailableReason.includes("kuaishou")
              ? "快手平台评论接口当前不可用，无法采集评论数据。系统每周自动检测接口状态，恢复后将自动启用评论分析功能。"
              : result.commentInsight.unavailableReason}
          </p>
        </div>
      )}
      {result.commentInsight && result.commentInsight.totalCommentsCollected > 0 && (
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
              <MessageSquare className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm text-gray-800">用户声音</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600">
              已采集 {result.commentInsight.totalCommentsCollected} 条评论
            </span>
          </div>

          {/* 高频词标签 */}
          {result.commentInsight.highFreqKeywords.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs text-gray-500">评论高频词 · 可直接用作标题关键词</div>
              <div className="flex flex-wrap gap-2">
                {result.commentInsight.highFreqKeywords.map((keyword, idx) => (
                  <span
                    key={idx}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700 font-medium"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 需求信号 */}
          {result.commentInsight.demandSignals.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs text-gray-500">用户真实需求信号 · 评论中的买家意图</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.commentInsight.demandSignals.map((signal, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    「{signal}」
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 情感分布 */}
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs text-gray-500">整体情感：</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              result.commentInsight.sentimentSummary === "positive" ? "bg-emerald-50 text-emerald-700" :
              result.commentInsight.sentimentSummary === "negative" ? "bg-red-50 text-red-700" :
              result.commentInsight.sentimentSummary === "mixed" ? "bg-amber-50 text-amber-700" :
              "bg-gray-50 text-gray-500"
            }`}>
              {result.commentInsight.sentimentSummary === "positive" ? "✅ 正面为主" :
               result.commentInsight.sentimentSummary === "negative" ? "⚠️ 负面偏多" :
               result.commentInsight.sentimentSummary === "mixed" ? "💬 正负参半" :
               "— 暂无明显倾向"}
            </span>
          </div>

          {/* 热门评论展示 */}
          {result.commentInsight.highlights.length > 0 && (
            <div>
              <div className="mb-3 text-xs text-gray-500">热门评论样本</div>
              <div className="grid gap-3 lg:grid-cols-2">
                {result.commentInsight.highlights.slice(0, 4).map((highlight) => (
                  <div key={highlight.contentId} className="rounded-2xl bg-gray-50 px-4 py-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="line-clamp-1 text-xs font-medium text-gray-700">
                        {highlight.contentTitle}
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-400">
                        {highlight.totalCommentCount} 条评论
                      </span>
                    </div>
                    <div className="space-y-2">
                      {highlight.topComments.map((comment, idx) => (
                        <div key={idx} className="rounded-xl bg-white px-3 py-2.5">
                          <p className="break-words text-xs leading-relaxed text-gray-700">
                            “{comment.text.slice(0, 80)}{comment.text.length > 80 ? "…" : ""}”
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-400">
                            <span>{comment.authorName}</span>
                            {comment.likeCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <ThumbsUp className="h-2.5 w-2.5" />
                                {comment.likeCount}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 你能不能接 + 你现在拿走什么 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr),minmax(0,1.08fr)]">
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100">
              <Lightbulb className="h-3 w-3 text-gray-700" />
            </div>
            <span className="text-sm text-gray-800">你能不能接</span>
          </div>

          <p className="break-words text-sm leading-relaxed text-gray-700">
            {result.accountMatchSummary}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                更适合
              </div>
              <div className="space-y-1.5">
                {result.bestFor.map((item, index) => (
                  <p key={`best-for-${index}`} className="break-words text-xs leading-relaxed text-emerald-900">
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                换个角度切入
              </div>
              <div className="space-y-1.5">
                {result.notFor.map((item, index) => (
                  <p key={`not-for-${index}`} className="break-words text-xs leading-relaxed text-amber-900">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
              <div className="mb-2 text-xs text-emerald-700">继续加码，看这两个反馈</div>
              <div className="space-y-1.5">
                {result.primaryCard.continueIf.map((item, index) => (
                  <p key={`continue-${index}`} className="break-words text-xs leading-relaxed text-gray-700">
                    {item}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3">
              <div className="mb-2 text-xs text-amber-700">调整信号，及时优化</div>
              <div className="space-y-1.5">
                {result.primaryCard.stopIf.map((item, index) => (
                  <p key={`stop-${index}`} className="break-words text-xs leading-relaxed text-gray-700">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900">
              <ChevronRight className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm text-gray-800">可借鉴样本</span>
          </div>

          <div className="space-y-4">
            <ResultCardPanel
              title={result.primaryCard.title}
              description={result.primaryCard.description}
              reason={result.primaryCard.reason}
              ctaLabel={result.primaryCard.ctaLabel}
              previewSections={result.primaryCard.previewSections}
              onAction={() => scrollToDeepDive(result.primaryCard.title)}
            />
          </div>
        </div>
      </div>
    </>)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Registry Configuration                                              */
/* ------------------------------------------------------------------ */

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const taskPayload = result.taskPayload as OpportunityPredictionTaskPayload;
  const trendOpportunities = taskPayload?.trendOpportunities ?? [];

  if (trendOpportunities.length > 0) {
    const topOpp = trendOpportunities.reduce((a, b) => a.opportunityScore > b.opportunityScore ? a : b);
    const stageCfg = STAGE_CONFIG[topOpp.stage];
    return [
      {
        label: "发现机会",
        value: `${trendOpportunities.length} 个`,
        detail: topOpp.opportunityName,
      },
      {
        label: "最高机会分",
        value: `${topOpp.opportunityScore}`,
        detail: stageCfg.label,
      },
      {
        label: "数据支撑",
        value: `${result.supportingContents.length}条`,
        detail: `${result.supportingAccounts.length}个账号`,
        span: "col-span-2 lg:col-span-1",
      },
    ];
  }

  // 旧版 fallback
  const verdictScoreLabel =
    result.verdict === "go_now" ? "强推" :
    result.verdict === "test_small" ? "值得试" :
    result.verdict === "observe" ? "潜力股" : "蓄力中";
  return [
    {
      label: "综合机会分",
      value: `${result.score}`,
      detail: verdictScoreLabel,
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

function getOpportunityDeepDiveConfig(_result: ResultRecord): DeepDiveConfig {
  return {
    title: "继续深挖这次机会",
    description: "基于真实样本数据，继续展开具体问题。",
    placeholder: "给我这次机会的开拍方案",
    quickActions: [
      { label: "给我这次机会的开拍方案", cost: 10 },
      { label: "明确效果评估标准和升级信号", cost: 10 },
      { label: "帮我分析这个赛道的竞争格局", cost: 10 },
    ],
  };
}

function getOpportunityCtaActions(result: ResultRecord): CtaActionConfig[] {
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
    description: "加入智能监控，系统每天自动复查这个赛道的数据变化，有异动立刻通知你",
    value: "不错过最佳入场时机",
    cost: 0,
    prompt: `加入监控`,
    highlight: false,
  };
  const topicStrategy: CtaActionConfig = {
    id: "topic_strategy",
    icon: Compass,
    title: "生成选题策略",
    description: "基于这次爆款预测，生成完整的选题方向和可执行选题",
    value: "从爆款预测到选题一步到位",
    cost: 25,
    prompt: `基于这次爆款预测（${result.query}），帮我生成完整的选题策略，包括多个选题方向、同行对标和可执行选题。`,
    highlight: false,
  };

  // 根据机会分动态排序和高亮
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

function getOpportunityFollowUpActions(result: ResultRecord): FollowUpAction[] {
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
  component: OpportunityPredictionBody,
  getHeroMetrics,
  getDeepDiveConfig: getOpportunityDeepDiveConfig,
  getCtaActions: getOpportunityCtaActions,
  getFollowUpActions: getOpportunityFollowUpActions,
});
