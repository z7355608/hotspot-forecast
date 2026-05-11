import { useEffect, useState } from "react";
import { ArrowLeft, Clock, FileX } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ResultsView } from "../components/ResultsView";
import { fetchResultArtifact } from "../lib/result-artifacts-api";
import { normalizeRemoteResult } from "../lib/normalize-result";
import type { ResultRecord } from "../store/app-data";
import { useAppStore } from "../store/app-store";

function InvalidState({
  onReset,
  onHistory,
  title = "该结果不存在或已被删除",
  description = "这条分析记录可能已被删除，或者本地状态尚未恢复",
  detail = "你可以重新提问，或回到历史记录继续查看其他分析",
}: {
  onReset: () => void;
  onHistory: () => void;
  title?: string;
  description?: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
        <FileX className="h-6 w-6 text-gray-300" />
      </div>
      <p className="mb-1 text-base text-gray-700">{title}</p>
      <p className="mb-2 text-sm text-gray-400">{description}</p>
      <p className="mb-8 text-xs text-gray-300">{detail}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onHistory}
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Clock className="h-4 w-4" />
          查看历史记录
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页重新提问
        </button>
      </div>
    </div>
  );
}

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { dataMode, getResultById, state } = useAppStore();
  const localResult = id ? getResultById(id) : null;
  const [remoteResult, setRemoteResult] = useState<ResultRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const autoFocusFollowUp = searchParams.get("focus") === "execute";

  useEffect(() => {
    let active = true;
    if (!id || localResult || dataMode !== "live" || state.apiHealth.status === "unavailable") {
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
    }, 0);
    void fetchResultArtifact(id)
      .then((payload) => {
        if (!active) return;
        setRemoteResult(normalizeRemoteResult(payload.item));
      })
      .catch(() => {
        if (!active) return;
        setRemoteResult(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [dataMode, id, localResult, state.apiHealth.status]);

  const result = localResult ?? remoteResult;

  if (loading && !result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 text-sm text-gray-400">
        正在恢复已保存结果...
      </div>
    );
  }

  if (!result) {
    const modeLabel = dataMode === "live" ? "真实数据" : "演示数据";
    return (
      <InvalidState
        onReset={() => navigate("/predict")}
        onHistory={() => navigate("/history")}
        title={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? "当前环境未接通真实数据后端"
            : `当前${modeLabel}下不存在该结果`
        }
        description={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? state.apiHealth.message ||
              "需要把同源 /api 反向代理到 Node 服务，结果页才能恢复真实保存快照。"
            : `结果 ID ${id ?? "--"} 不属于当前数据源，系统不会混显另一模式的数据。`
        }
        detail={
          dataMode === "live" && state.apiHealth.status === "unavailable"
            ? "请先接通真实后端，或切回演示数据后再查看本地结果。"
            : "你可以去设置切换数据源，或回到历史记录查看当前模式下可用的结果。"
        }
      />
    );
  }

  return (
    <ResultsView
      result={result}
      autoFocusFollowUp={autoFocusFollowUp}
      onReset={() => navigate("/predict")}
    />
  );
}
