/**
 * Topic Strategy V2 Renderer
 * ===========================
 * 展示 5 阶段 Pipeline 结果：
 *   1. 选题方向 + 验证分数
 *   2. 可执行选题
 *   3. 同行对标
 *   4. 跨行业迁移灵感
 *   5. 数据采集概览
 */

import { useState } from "react";
import {
  FileText,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  Users,
  Lightbulb,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Target,
  Layers,
  Search,
} from "lucide-react";
import type { ResultRecord } from "../../../store/app-data";
import type {
  TopicDirectionV2,
  PeerBenchmarkV2,
  CrossIndustryInsightV2,
  TopicStrategyV2Data,
} from "../../../store/prediction-types";
import { TaskSection } from "../results-shared";
import {
  registerArtifactRenderer,
  type ArtifactRendererProps,
  type HeroMetricCard,
  type DeepDiveConfig,
  type CtaActionConfig,
  type FollowUpAction,
} from "../artifact-registry";

/* ── Helpers ── */

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 55) return "text-amber-600";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-50 border-emerald-200";
  if (score >= 55) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function scoreLabel(score: number): string {
  if (score >= 75) return "强推";
  if (score >= 55) return "值得试";
  if (score >= 35) return "需观察";
  return "谨慎";
}

function platformLabel(p: string): string {
  const map: Record<string, string> = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    kuaishou: "快手",
  };
  return map[p] ?? p;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Sub-Components ── */

function ValidationBreakdownBar({
  label,
  score,
  maxScore = 25,
}: {
  label: string;
  score: number;
  maxScore?: number;
}) {
  const pct = Math.min((score / maxScore) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-gray-500">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-800 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-[11px] text-gray-600">{score}</span>
    </div>
  );
}

function EvidenceList({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  const [open, setOpen] = useState(false);
  const preview = items.slice(0, 2);
  const hasMore = items.length > 2;
  return (
    <div className="ml-[72px] rounded-lg bg-white/50 px-2.5 py-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-[10px] text-gray-500 hover:text-gray-700"
      >
        {icon}
        <span>{label} ({items.length})</span>
        {hasMore && (
          open ? <ChevronUp className="ml-auto h-2.5 w-2.5" /> : <ChevronDown className="ml-auto h-2.5 w-2.5" />
        )}
      </button>
      <div className="mt-1 space-y-0.5">
        {(open ? items : preview).map((item, i) => (
          <div key={`ev-${i}`} className="truncate text-[10px] text-gray-500">
            • {item}
          </div>
        ))}
        {!open && hasMore && (
          <div className="text-[10px] text-gray-400">… 点击展开查看全部</div>
        )}
      </div>
    </div>
  );
}

function DirectionCard({
  dir,
  index,
  expanded,
  onToggle,
}: {
  dir: TopicDirectionV2;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const bd = dir.validationBreakdown;
  return (
    <div className={`rounded-2xl border ${scoreBg(dir.validationScore)} p-4 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-medium text-white">
              {index + 1}
            </span>
            <span className="text-sm font-medium text-gray-900">{dir.directionName}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{dir.directionLogic}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-lg font-semibold ${scoreColor(dir.validationScore)}`}>
            {dir.validationScore}
          </span>
          <span className={`text-[10px] ${scoreColor(dir.validationScore)}`}>
            {scoreLabel(dir.validationScore)}
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] text-gray-600">
          流量潜力 {dir.trafficPotential}
        </span>
        <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] text-gray-600">
          制作成本 {dir.productionCost}
        </span>
        <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] text-gray-600">
          竞争度 {dir.competitionLevel}
        </span>
        {dir.executableTopics.length > 0 && (
          <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] text-gray-600">
            {dir.executableTopics.length} 个可执行选题
          </span>
        )}
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="mt-3 flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "收起详情" : "展开详情"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gray-200/50 pt-3">
          {/* Validation breakdown with evidence */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-gray-700">验证分拆解</div>
            <ValidationBreakdownBar label="搜索命中" score={bd.searchHitScore} />

            <ValidationBreakdownBar label="低粉爆款" score={bd.lowFollowerScore} />
            {dir.validationEvidence?.matchedContentTitles && dir.validationEvidence.matchedContentTitles.length > 0 && (
              <EvidenceList
                icon={<Zap className="h-3 w-3 text-amber-500" />}
                label="命中的低粉爆款内容"
                items={dir.validationEvidence.matchedContentTitles}
              />
            )}

            <ValidationBreakdownBar label="评论需求" score={bd.commentDemandScore} />
            {dir.validationEvidence?.realCommentDemands && dir.validationEvidence.realCommentDemands.length > 0 && (
              <EvidenceList
                icon={<FileText className="h-3 w-3 text-blue-500" />}
                label="评论区真实需求信号"
                items={dir.validationEvidence.realCommentDemands}
              />
            )}

            <ValidationBreakdownBar label="同行验证" score={bd.peerSuccessScore} />
            {dir.validationEvidence?.matchedPeerNames && dir.validationEvidence.matchedPeerNames.length > 0 && (
              <EvidenceList
                icon={<Users className="h-3 w-3 text-violet-500" />}
                label="有相关作品的同行"
                items={dir.validationEvidence.matchedPeerNames}
              />
            )}
          </div>

          {/* Platform scores */}
          {Object.keys(dir.platformScores).length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-gray-700">各平台表现</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(dir.platformScores).map(([p, ps]) => (
                  <div
                    key={p}
                    className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="text-gray-500">{platformLabel(p)}</span>
                    <span className={`ml-1.5 font-medium ${scoreColor(ps.score)}`}>{ps.score}</span>
                    <span className="ml-1 text-gray-400">({ps.searchHits} 命中)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test plan */}
          <div>
            <div className="mb-1 text-[11px] font-medium text-gray-700">验证方案</div>
            <p className="text-[11px] leading-relaxed text-gray-600">{dir.testPlan}</p>
          </div>

          {/* Executable topics */}
          {dir.executableTopics.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-gray-700">可执行选题</div>
              <div className="space-y-1.5">
                {dir.executableTopics.map((topic, i) => (
                  <div key={`topic-${i}`} className="rounded-lg bg-white/70 px-3 py-2">
                    <div className="text-xs font-medium text-gray-800">{topic.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-gray-500">
                      <span>角度: {topic.angle}</span>
                      <span>钩子: {topic.hookType}</span>
                      <span>时长: {topic.estimatedDuration}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evolved children */}
          {dir.evolvedChildren && dir.evolvedChildren.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-gray-700">
                <Sparkles className="h-3 w-3 text-amber-500" />
                自进化子方向（验证分 &gt; 80 自动生成）
              </div>
              <div className="space-y-1.5">
                {dir.evolvedChildren.map((child, ci) => (
                  <div key={`child-${ci}`} className="rounded-lg bg-white/70 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-800">{child.directionName}</span>
                      <span className={`text-xs font-medium ${scoreColor(child.validationScore)}`}>
                        {child.validationScore}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500">
                      {child.directionLogic}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeerBenchmarkCard({ peer }: { peer: PeerBenchmarkV2 }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-3">
        {peer.avatarUrl ? (
          <img
            src={peer.avatarUrl}
            alt={peer.displayName}
            className="h-9 w-9 rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">
            {peer.displayName.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{peer.displayName}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              {platformLabel(peer.platform)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-500">
            <span>{(peer.followerCount / 10000).toFixed(1)}w 粉丝</span>
            <span>互动率 {(peer.avgInteractionRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
      {peer.comparisonNotes && (
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{peer.comparisonNotes}</p>
      )}
      {peer.recentWorks.length > 0 && (
        <div className="mt-2 space-y-1">
          {peer.recentWorks.slice(0, 3).map((work, i) => (
            <div key={`work-${i}`} className="flex items-center justify-between text-[11px]">
              <span className="min-w-0 flex-1 truncate text-gray-600">{work.title}</span>
              <span className="ml-2 shrink-0 text-gray-400">
                {work.likeCount >= 10000
                  ? `${(work.likeCount / 10000).toFixed(1)}w`
                  : work.likeCount}{" "}
                赞
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrossIndustryCard({ insight }: { insight: CrossIndustryInsightV2 }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="text-sm font-medium text-gray-900">{insight.migrationIdea}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
            <span>来源行业: {insight.sourceIndustry}</span>
            <span>·</span>
            <span>{platformLabel(insight.sourcePlatform)}</span>
          </div>
        </div>
        <span className={`shrink-0 text-sm font-medium ${scoreColor(insight.confidence)}`}>
          {insight.confidence}%
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-600">
        原始爆款: {insight.sourceTitle}
      </p>
      {insight.transferableElements.length > 0 && (
        <div className="mt-2 space-y-1">
          {insight.transferableElements.map((el, i) => (
            <div key={`el-${i}`} className="rounded-lg bg-white/60 px-2.5 py-1.5">
              <div className="text-[11px] font-medium text-gray-700">{el.element}</div>
              <div className="mt-0.5 text-[10px] text-gray-500">
                {el.reason} → {el.adaptationHint}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Renderer ── */

function TopicStrategyBody({ result }: ArtifactRendererProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  // 尝试从 result 中获取 V2 数据
  const v2: TopicStrategyV2Data | null =
    (result as unknown as Record<string, unknown>).topicStrategyV2 as TopicStrategyV2Data | null;

  // V1 fallback
  if (!v2) {
    const payload =
      result.taskPayload.kind === "topic_strategy"
        ? result.taskPayload
        : {
            kind: "topic_strategy" as const,
            strategySummary: result.summary,
            topicDirections: [] as Array<{ title: string; whyNow: string; fitNote: string }>,
            fitRationale: result.accountMatchSummary,
            firstMoves: result.continueIf,
            stopRules: result.stopIf,
          };

    return (
      <div className="space-y-4">
        <TaskSection title="选题方向" description="基于数据分析生成的选题建议">
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <p className="break-words text-sm leading-relaxed text-gray-700">
              {payload.strategySummary}
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {payload.topicDirections.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
              >
                <div className="text-sm text-gray-900">{item.title}</div>
                <p className="mt-2 break-words text-xs leading-relaxed text-gray-600">
                  {item.whyNow}
                </p>
                <p className="mt-2 break-words text-xs leading-relaxed text-gray-500">
                  {item.fitNote}
                </p>
              </div>
            ))}
          </div>
        </TaskSection>
      </div>
    );
  }

  // V2 full render
  const sortedDirs = [...v2.directions].sort((a, b) => a.priorityRank - b.priorityRank);
  const avgScore =
    v2.directions.length > 0
      ? Math.round(v2.directions.reduce((s, d) => s + d.validationScore, 0) / v2.directions.length)
      : 0;

  return (
    <div className="space-y-4">
      {/* ── Section 1: 数据采集概览 ── */}
      <TaskSection
        title="数据采集概览"
        description={`已在 ${v2.platforms.map(platformLabel).join(" + ")} 上完成 5 阶段分析`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
            <div className="text-lg font-semibold text-gray-900">
              {v2.rawDataSummary.totalContents}
            </div>
            <div className="text-[11px] text-gray-500">采集内容</div>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
            <div className="text-lg font-semibold text-gray-900">
              {v2.rawDataSummary.totalAccounts}
            </div>
            <div className="text-[11px] text-gray-500">分析账号</div>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
            <div className="text-lg font-semibold text-gray-900">
              {v2.rawDataSummary.totalHotSeeds}
            </div>
            <div className="text-[11px] text-gray-500">热榜命中</div>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
            <div className="text-lg font-semibold text-gray-900">
              {formatMs(v2.pipelineProgress.total_ms)}
            </div>
            <div className="text-[11px] text-gray-500">分析耗时</div>
          </div>
        </div>

        {/* Platform breakdown */}
        {Object.keys(v2.rawDataSummary.byPlatform).length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(v2.rawDataSummary.byPlatform).map(([p, stats]) => (
              <span
                key={p}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600"
              >
                {platformLabel(p)}: {stats.contents} 内容 · {stats.accounts} 账号
              </span>
            ))}
          </div>
        )}
      </TaskSection>

      {/* ── Section 2: 策略总结 ── */}
      <TaskSection title="策略总结">
        <div className="rounded-2xl bg-gray-50 px-4 py-4">
          <p className="text-sm leading-relaxed text-gray-700">{v2.strategySummary}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-lg bg-gray-800 px-2.5 py-1 text-[11px] text-white">
              {v2.track}
            </span>
            <span className="rounded-lg bg-gray-200 px-2.5 py-1 text-[11px] text-gray-600">
              {v2.accountStage}
            </span>
            <span className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${scoreColor(avgScore)}`}>
              平均验证分 {avgScore}
            </span>
          </div>
        </div>
      </TaskSection>

      {/* ── Section 3: 选题方向（核心） ── */}
      <TaskSection
        title={`${sortedDirs.length} 个选题方向`}
        description="按优先级排序，验证分越高越值得优先执行。点击展开查看详情和可执行选题。"
      >
        <div className="space-y-3">
          {sortedDirs.map((dir, idx) => (
            <DirectionCard
              key={dir.id}
              dir={dir}
              index={idx}
              expanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            />
          ))}
        </div>
      </TaskSection>

      {/* ── Section 4: 同行对标 ── */}
      {v2.peerBenchmarks.length > 0 && (
        <TaskSection
          title="同行对标"
          description={`分析了 ${v2.peerBenchmarks.length} 个同赛道账号的近期表现`}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {v2.peerBenchmarks.slice(0, 6).map((peer, i) => (
              <PeerBenchmarkCard key={`peer-${i}`} peer={peer} />
            ))}
          </div>
        </TaskSection>
      )}

      {/* ── Section 5: 跨行业迁移灵感 ── */}
      {v2.crossIndustryInsights.length > 0 && (
        <TaskSection
          title="跨行业迁移灵感"
          description="从其他赛道的爆款中发现可迁移到你领域的创意元素"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {v2.crossIndustryInsights.map((insight, i) => (
              <CrossIndustryCard key={`ci-${i}`} insight={insight} />
            ))}
          </div>
        </TaskSection>
      )}

      {/* ── Section 6: 搜索关键词 ── */}
      {v2.searchKeywords.length > 0 && (
        <TaskSection title="数据采集关键词" description="本次分析使用的搜索词">
          <div className="flex flex-wrap gap-2">
            {v2.searchKeywords.map((kw, i) => (
              <span
                key={`kw-${i}`}
                className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600"
              >
                {kw.keyword}
                <span className="ml-1 text-gray-400">({platformLabel(kw.platform)})</span>
              </span>
            ))}
          </div>
        </TaskSection>
      )}
    </div>
  );
}

/* ── Registry Configuration ── */

function getHeroMetrics(result: ResultRecord): HeroMetricCard[] {
  const v2 = (result as unknown as Record<string, unknown>).topicStrategyV2 as TopicStrategyV2Data | undefined;

  if (v2) {
    const avgScore =
      v2.directions.length > 0
        ? Math.round(v2.directions.reduce((s, d) => s + d.validationScore, 0) / v2.directions.length)
        : 0;
    const topDir = [...v2.directions].sort((a, b) => b.validationScore - a.validationScore)[0];

    return [
      {
        label: "选题方向",
        value: `${v2.directions.length} 个方向`,
        detail: `平均验证分 ${avgScore}，覆盖 ${v2.platforms.length} 个平台`,
      },
      {
        label: "最优方向",
        value: topDir?.directionName ?? "待生成",
        detail: topDir
          ? `验证分 ${topDir.validationScore}，${topDir.executableTopics.length} 个可执行选题`
          : "暂无数据",
      },
      {
        label: "数据覆盖",
        value: `${v2.rawDataSummary.totalContents} 条内容`,
        detail: `${v2.rawDataSummary.totalAccounts} 个账号 · ${v2.rawDataSummary.totalHotSeeds} 个热榜命中`,
        span: "col-span-2 lg:col-span-1",
      },
    ];
  }

  return [
    {
      label: "当前主结果",
      value: result.primaryCard.title,
      detail: result.primaryCard.reason,
    },
    {
      label: "推荐下一步",
      value: result.recommendedNextTasks[0]?.title ?? result.primaryCtaLabel,
      detail: result.recommendedNextTasks[0]?.reason ?? result.bestActionNow.reason,
    },
    {
      label: "任务匹配度",
      value:
        result.taskIntentConfidence === "high"
          ? "高匹配"
          : result.taskIntentConfidence === "medium"
            ? "中匹配"
            : "低匹配",
      detail: result.classificationReasons[0] ?? "选题策略任务",
      span: "col-span-2 lg:col-span-1",
    },
  ];
}

function getDeepDive(result: ResultRecord): DeepDiveConfig {
  const v2 = (result as unknown as Record<string, unknown>).topicStrategyV2 as TopicStrategyV2Data | undefined;
  const topDir = v2
    ? [...v2.directions].sort((a, b) => b.validationScore - a.validationScore)[0]
    : null;

  return {
    title: "继续深挖选题策略",
    description: topDir
      ? `当前最优方向「${topDir.directionName}」验证分 ${topDir.validationScore}，可以继续细化。`
      : "可以继续补充选题方向、验证方式和执行计划。",
    placeholder: topDir
      ? `帮我把「${topDir.directionName}」拆成 3 条可以直接拍的脚本\n换一个角度重新验证这个方向\n给我这个方向的 7 天排期表`
      : "帮我生成 3 个优先选题\n给每个选题配一版脚本\n用数据验证优先级",
    quickActions: [
      { label: "把最优方向拆成脚本", cost: 20 },
      { label: "生成 7 天排期表", cost: 30 },
      { label: "换个角度重新验证", cost: 10 },
    ],
  };
}

function getCtaActions(result: ResultRecord): CtaActionConfig[] {
  const v2 = (result as unknown as Record<string, unknown>).topicStrategyV2 as TopicStrategyV2Data | undefined;
  const topDir = v2
    ? [...v2.directions].sort((a, b) => b.validationScore - a.validationScore)[0]
    : null;
  const track = v2?.track ?? result.query;

  return [
    {
      id: "direction_scripts",
      icon: FileText,
      title: "把最优方向变成脚本",
      description: topDir
        ? `直接为「${topDir.directionName}」的 ${topDir.executableTopics.length} 个选题生成可拍脚本`
        : "为推荐的选题方向生成可拍脚本",
      value: "从选题到开拍零等待",
      cost: 30,
      prompt: topDir
        ? `基于选题策略中验证分最高的方向「${topDir.directionName}」，为其中的 ${topDir.executableTopics.length} 个可执行选题各生成一版完整脚本，包含口播文案、分镜和标题。`
        : `基于这次选题策略（${track}），为每个推荐的选题都生成一版完整脚本。`,
      highlight: true,
    },
    {
      id: "direction_calendar",
      icon: Sparkles,
      title: "生成 7 天排期表",
      description: v2
        ? `基于 ${v2.directions.length} 个方向的 ${v2.directions.reduce((s, d) => s + d.executableTopics.length, 0)} 个选题，智能排布 7 天内容计划`
        : "每天拍什么、什么时候发，全部安排好",
      value: "一周内容规划一键搞定",
      cost: 30,
      prompt: v2
        ? `基于选题策略（${track}）的 ${v2.directions.length} 个方向和 ${v2.directions.reduce((s, d) => s + d.executableTopics.length, 0)} 个可执行选题，生成 7 天内容排期表，优先安排验证分最高的选题。`
        : `基于这次选题策略（${track}），帮我生成一份 7 天内容排期表。`,
    },
    {
      id: "opportunity_check",
      icon: Search,
      title: "运行爆款预测",
      description: `对「${track}」赛道进行完整的爆款预测，看看当前是否是入场的好时机`,
      value: "用数据验证赛道机会",
      cost: 25,
      prompt: `帮我对「${track}」赛道进行爆款预测，分析当前是否是入场的好时机。`,
    },
    {
      id: "revalidate",
      icon: Zap,
      title: "换个角度重新验证",
      description: "用不同的关键词和数据源重新验证当前方向",
      value: "确保方向判断准确",
      cost: 10,
      prompt: `基于这次选题策略（${track}），用不同的搜索词和数据维度重新验证当前的选题方向，看看是否有遗漏的机会或风险。`,
    },
    {
      id: "refresh_peer_dynamics",
      icon: Search,
      title: "刷新同行动态",
      description: v2?.peerBenchmarks && v2.peerBenchmarks.length > 0
        ? `查看 ${v2.peerBenchmarks.length} 个对标同行的最新作品和策略变化`
        : "查看同赛道同行的最新作品和策略变化",
      value: "知己知彼，及时调整策略",
      cost: 15,
      prompt: v2?.peerBenchmarks && v2.peerBenchmarks.length > 0
        ? `帮我刷新「${track}」赛道的同行动态，重点关注这些同行：${v2.peerBenchmarks.map(p => p.displayName).join("、")}。分析他们最近的内容策略变化、爆款规律和值得借鉴的做法。`
        : `帮我查看「${track}」赛道同行的最新动态，分析他们最近的内容策略变化和值得借鉴的做法。`,
    },
  ];
}

function getFollowUpActions(result: ResultRecord): FollowUpAction[] {
  const v2 = (result as unknown as Record<string, unknown>).topicStrategyV2 as TopicStrategyV2Data | undefined;

  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: `基于这次选题策略，继续帮我做「${item.title}」。要求：${item.reason}`,
    }));
  }

  if (v2) {
    const topDir = [...v2.directions].sort((a, b) => b.validationScore - a.validationScore)[0];
    return [
      {
        label: topDir ? `为「${topDir.directionName}」写脚本` : "生成脚本",
        prompt: topDir
          ? `帮我为「${topDir.directionName}」方向写 3 条可以直接拍的脚本`
          : "帮我为推荐的选题方向写脚本",
      },
      {
        label: "生成 7 天排期",
        prompt: `基于这次选题策略，帮我生成一份 7 天内容排期表`,
      },
    ];
  }

  return [
    { label: "给我 3 个优先题目", prompt: "给我 3 个优先题目" },
    { label: "把题目改成试拍版", prompt: "把题目改成试拍版" },
  ];
}

/* ── Register ── */

registerArtifactRenderer({
  artifactType: "topic_plan",
  taskIntent: "topic_strategy",
  component: TopicStrategyBody,
  getHeroMetrics,
  getDeepDiveConfig: getDeepDive,
  getCtaActions,
  getFollowUpActions,
});

export { TopicStrategyBody };
