import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  MessageSquare,
  Radar,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import type { SavedResultArtifactSummary } from "../lib/result-artifacts-api";
import { formatHistoryDate } from "../store/app-data";
import { getResultHistoryMeta, useAppStore } from "../store/app-store";
import { TASK_INTENT_META } from "../store/agent-runtime";

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-50 text-green-700";
  if (score >= 70) return "bg-blue-50 text-blue-700";
  if (score >= 60) return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

const TYPE_COLORS: Record<string, string> = {
  爆款预测: "bg-blue-50 text-blue-600",
  趋势观察: "bg-sky-50 text-sky-600",
  爆款拆解: "bg-orange-50 text-orange-600",
  选题策略: "bg-green-50 text-green-600",
  文案提取: "bg-fuchsia-50 text-fuchsia-600",
  账号诊断: "bg-amber-50 text-amber-700",
  继续深挖: "bg-gray-50 text-gray-500",
  追问补充: "bg-gray-50 text-gray-500",
};

function getHistoryType(
  taskIntent: SavedResultArtifactSummary["taskIntent"] | undefined,
  fallback: string,
) {
  return taskIntent ? TASK_INTENT_META[taskIntent].historyType : fallback;
}

/* ------------------------------------------------------------------ */
/*  统一的历史条目类型                                                  */
/* ------------------------------------------------------------------ */

type MergedEntry =
  | { kind: "local"; result: ReturnType<typeof useAppStore>["state"]["results"][number]; artifact?: SavedResultArtifactSummary }
  | { kind: "artifact"; artifact: SavedResultArtifactSummary };

function isWatching(entry: MergedEntry): boolean {
  if (entry.kind === "local") {
    return !!(entry.result.artifactStatus?.watchTaskId || entry.artifact?.artifactStatus?.watchTaskId);
  }
  return !!entry.artifact.artifactStatus?.watchTaskId;
}

/* ------------------------------------------------------------------ */
/*  HistoryCard 单条卡片                                               */
/* ------------------------------------------------------------------ */

function HistoryCard({
  entry,
  watching,
  onNavigate,
  onRemove,
}: {
  entry: MergedEntry;
  watching: boolean;
  onNavigate: (path: string) => void;
  onRemove: (id: string) => void;
}) {
  const result = entry.kind === "local" ? entry.result : null;
  const artifact = (entry.kind === "local" ? entry.artifact : entry.artifact) ?? null;
  if (!result && !artifact) return null;

  const localResult = result;
  const safeArtifact =
    artifact ??
    ({
      artifactId: localResult!.id,
      clientResultId: localResult!.id,
      taskIntent: localResult!.taskIntent,
      artifactType: localResult!.primaryArtifact.artifactType,
      createdAt: localResult!.createdAt,
      updatedAt: localResult!.updatedAt,
      query: localResult!.query,
      type: localResult!.type,
      title: localResult!.title,
      summary: localResult!.summary,
      platform: localResult!.platform,
      score: localResult!.score,
      scoreLabel: localResult!.scoreLabel,
      verdict: localResult!.verdict,
      windowStrength: localResult!.windowStrength,
      confidenceLabel: localResult!.confidenceLabel,
      opportunityTitle: localResult!.opportunityTitle,
      coreBet: localResult!.coreBet,
      watchable: localResult!.primaryArtifact.watchable,
      shareable: localResult!.primaryArtifact.shareable,
      artifactStatus:
        localResult!.artifactStatus ?? {
          artifactId: localResult!.id,
          savedAt: localResult!.createdAt,
        },
    } satisfies SavedResultArtifactSummary);

  const meta = result
    ? getResultHistoryMeta(result)
    : {
        type: getHistoryType(safeArtifact.taskIntent, safeArtifact.type),
        scoreLabel: safeArtifact.scoreLabel ?? "已保存",
        model: {
          id: "doubao",
          name: "服务端快照",
          badge: "saved",
          multiplier: 1,
          requiredPlan: "free",
          summary: "服务端已保存结果快照",
        },
      };

  const displayTitle =
    result?.title ??
    safeArtifact.title ??
    result?.opportunityTitle ??
    safeArtifact.opportunityTitle;
  const displaySummary =
    result?.summary ??
    safeArtifact.summary ??
    result?.coreBet ??
    safeArtifact.coreBet ??
    "";
  const hasFollowUps = result ? result.followUps.length > 0 : false;
  const createdDate = formatHistoryDate(result?.createdAt ?? safeArtifact.createdAt);
  const updatedDate = formatHistoryDate(result?.updatedAt ?? safeArtifact.updatedAt);
  const wasUpdated = updatedDate !== createdDate;
  const routeId = result?.id ?? safeArtifact.artifactId;
  const artifactStatus = result?.artifactStatus ?? safeArtifact.artifactStatus;

  return (
    <div
      className={`group rounded-2xl border px-4 pb-3 pt-4 transition-all hover:shadow-sm sm:px-5 ${
        watching
          ? "border-indigo-100 bg-indigo-50/30 hover:border-indigo-200"
          : "border-gray-100 bg-white hover:border-gray-200"
      }`}
    >
      <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${scoreColor(
            result?.score ?? safeArtifact.score ?? 60,
          )}`}
        >
          <span className="text-base leading-none">
            {result?.score ?? safeArtifact.score ?? "--"}
          </span>
          <span className="mt-0.5 text-[10px]">{meta.scoreLabel}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="line-clamp-2 break-words text-sm text-gray-800">
              {displayTitle}
            </p>
            {watching && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                <Eye className="h-2.5 w-2.5" />
                观察中
              </span>
            )}
          </div>
          {displaySummary && (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-gray-500">
              {displaySummary}
            </p>
          )}
          <p className="mt-1.5 truncate text-[11px] text-gray-400">
            {result?.query ?? safeArtifact.query}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                TYPE_COLORS[meta.type] ?? "bg-gray-50 text-gray-500"
              }`}
            >
              {meta.type}
            </span>
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
              {meta.model.name}
            </span>
            <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-400">
              {meta.model.badge}
            </span>
            {(result?.platform ?? safeArtifact.platform).map((platform) => (
              <span key={platform} className="text-xs text-gray-400">
                {platform}
              </span>
            ))}
            {artifactStatus && (
              <>
                <span className="text-xs text-gray-300">·</span>
                <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
                  {artifactStatus.watchTaskId ? "观察中" : "已保存"}
                </span>
              </>
            )}
            <span className="text-xs text-gray-300">·</span>
            {hasFollowUps ? (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <MessageSquare className="h-3 w-3" />
                {result?.followUps.length ?? 0} 次追问
              </span>
            ) : (
              <span className="text-xs text-gray-300">未追问</span>
            )}
            <span className="text-xs text-gray-300">·</span>
            {wasUpdated ? (
              <span className="text-xs text-gray-400">
                最后更新 <span className="text-gray-500">{updatedDate}</span>
              </span>
            ) : (
              <span className="text-xs text-gray-400">{createdDate}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onNavigate(`/results/${routeId}`)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            查看
          </button>
          <button
            type="button"
            onClick={() => result && onRemove(result.id)}
            disabled={!result}
            className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-200 sm:block" />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-50 pt-2.5">
        <button
          type="button"
          onClick={() => onNavigate(`/results/${routeId}`)}
          className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-800"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          继续追问
          <ChevronRight className="h-3 w-3" />
        </button>
        <span className="text-gray-200">·</span>
        <button
          type="button"
          onClick={() => onNavigate(`/results/${routeId}?focus=execute`)}
          className="flex items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-800"
        >
          <Zap className="h-3.5 w-3.5" />
          继续生成建议
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HistoryPage 主组件                                                 */
/* ------------------------------------------------------------------ */

export function HistoryPage() {
  const navigate = useNavigate();
  const { state, savedArtifacts, removeResult } = useAppStore();
  const [search, setSearch] = useState("");
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);

  const { activeEntries, archivedEntries } = useMemo(() => {
    const artifactByClientId = new Map(
      savedArtifacts
        .filter((item) => item.clientResultId)
        .map((item) => [item.clientResultId as string, item]),
    );

    const merged: MergedEntry[] = state.results.map((item) => ({
      kind: "local" as const,
      result: item,
      artifact: artifactByClientId.get(item.id),
    }));

    const artifactOnly: MergedEntry[] = savedArtifacts
      .filter(
        (artifact) =>
          !artifact.clientResultId ||
          !state.results.some((item) => item.id === artifact.clientResultId),
      )
      .map((artifact) => ({
        kind: "artifact" as const,
        artifact,
      }));

    const all = [...merged, ...artifactOnly]
      .filter((entry) => {
        const query = entry.kind === "local" ? entry.result.query : entry.artifact.query;
        const title =
          entry.kind === "local"
            ? entry.result.title || entry.result.opportunityTitle
            : entry.artifact.title || entry.artifact.opportunityTitle;
        const summary =
          entry.kind === "local"
            ? entry.result.summary || entry.result.coreBet
            : entry.artifact.summary || entry.artifact.coreBet || "";
        const type =
          entry.kind === "local"
            ? getResultHistoryMeta(entry.result).type
            : getHistoryType(entry.artifact.taskIntent, entry.artifact.type);
        const platforms =
          entry.kind === "local" ? entry.result.platform : entry.artifact.platform;
        const followUpCount = entry.kind === "local" ? entry.result.followUps.length : 0;
        const matchesSearch =
          !search ||
          query.includes(search) ||
          title.includes(search) ||
          summary.includes(search) ||
          type.includes(search) ||
          platforms.some((platform) => platform.includes(search));
        const matchesFollowUp = !onlyFollowUps || followUpCount > 0;
        return matchesSearch && matchesFollowUp;
      })
      .sort((left, right) => {
        const leftUpdated =
          left.kind === "local" ? left.result.updatedAt : left.artifact.updatedAt;
        const rightUpdated =
          right.kind === "local" ? right.result.updatedAt : right.artifact.updatedAt;
        return Date.parse(rightUpdated) - Date.parse(leftUpdated);
      });

    // 分离活跃观察任务和历史归档
    const active: MergedEntry[] = [];
    const archived: MergedEntry[] = [];

    for (const entry of all) {
      if (isWatching(entry)) {
        active.push(entry);
      } else {
        archived.push(entry);
      }
    }

    return { activeEntries: active, archivedEntries: archived };
  }, [onlyFollowUps, savedArtifacts, search, state.results]);

  const totalCount = activeEntries.length + archivedEntries.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 text-xl text-gray-900">历史记录</h1>
          <p className="text-sm text-gray-400">
            共 {totalCount} 条任务结果 · 可继续深挖或回看已保存产物
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索记录…"
              className="w-full min-w-0 text-sm text-gray-700 placeholder-gray-300 outline-none sm:w-44"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyFollowUps((value) => !value)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
              onlyFollowUps
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            仅看已追问
          </button>
        </div>
      </div>

      {/* 活跃观察区 */}
      {activeEntries.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100">
              <Radar className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <h2 className="text-sm font-medium text-gray-700">
              持续观察中
            </h2>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
              {activeEntries.length}
            </span>
            <p className="ml-2 text-[11px] text-gray-400">
              这些任务正在持续追踪，有新变化时会通知你
            </p>
          </div>
          <div className="space-y-3">
            {activeEntries.map((entry) => {
              const routeId =
                entry.kind === "local"
                  ? entry.result.id
                  : entry.artifact.artifactId;
              return (
                <HistoryCard
                  key={routeId}
                  entry={entry}
                  watching
                  onNavigate={navigate}
                  onRemove={removeResult}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 历史归档区 */}
      <div>
        {activeEntries.length > 0 && archivedEntries.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
            </div>
            <h2 className="text-sm font-medium text-gray-700">
              历史归档
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              {archivedEntries.length}
            </span>
          </div>
        )}

        <div className="space-y-3">
          {totalCount === 0 && (
            /* ── Module D1: 历史页空状态 ── */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                <Clock className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="mb-2 text-base text-gray-700">你的分析记录会出现在这里</h3>
              <p className="mb-6 max-w-xs text-sm text-gray-400 leading-relaxed">
                每次分析都会自动保存，方便你随时回顾和对比，找到内容规律
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white hover:bg-gray-800 transition-colors"
                >
                  开始第一次分析
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

              </div>
            </div>
          )}

          {archivedEntries.map((entry) => {
            const routeId =
              entry.kind === "local"
                ? entry.result.id
                : entry.artifact.artifactId;
            return (
              <HistoryCard
                key={routeId}
                entry={entry}
                watching={false}
                onNavigate={navigate}
                onRemove={removeResult}
              />
            );
          })}
        </div>
      </div>

      {totalCount > 0 && (
        <p className="mt-8 text-center text-xs text-gray-300">已展示全部记录</p>
      )}
    </div>
  );
}