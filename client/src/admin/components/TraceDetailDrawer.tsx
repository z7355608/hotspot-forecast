import { useEffect, useState } from "react";
import {
  getTraceDetail,
  postTraceFeedback,
  type TraceDetail,
  type TraceStep,
} from "../api";

const STAGE_LABEL: Record<string, string> = {
  stage1_input:     "1·输入",
  stage2_collect:   "2·采集",
  stage3_analyze:   "3·分析",
  stage4_predict:   "4·预测",
  stage5_recommend: "5·推荐",
  stage6_tools:     "6·工具",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}

function TraceStepRow({ step, index }: { step: TraceStep; index: number }) {
  const statusColor =
    step.status === "success" ? "bg-emerald-900/40 text-emerald-300" :
    step.status === "failed"  ? "bg-red-900/40 text-red-300" :
                                "bg-gray-800 text-gray-400";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-500 text-xs font-mono w-6">#{index + 1}</span>
        {step.stage && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300 font-mono">
            {STAGE_LABEL[step.stage] ?? step.stage}
          </span>
        )}
        <span className="text-white text-sm font-medium">{step.skillLabel}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${statusColor}`}>{step.status}</span>
        <span className="ml-auto text-xs text-gray-600 font-mono">
          {step.durationMs != null ? formatDuration(step.durationMs) : "—"}
          {" · "}
          {step.tokensUsed != null ? `${step.tokensUsed}t` : "—"}
        </span>
      </div>
      <div className="ml-8 flex items-center gap-3 text-xs text-gray-600">
        <span>模型 <span className="text-gray-400 font-mono">{step.modelUsed}</span></span>
        {step.promptTemplateId && (
          <span>模板 <span className="text-gray-400 font-mono">{step.promptTemplateId}</span></span>
        )}
        {step.creditsCharged != null && <span>积分 {step.creditsCharged}</span>}
      </div>
      {step.errorMessage && (
        <p className="ml-8 mt-1 text-xs text-red-400 font-mono">{step.errorMessage}</p>
      )}
    </div>
  );
}

export function TraceDetailDrawer({
  sessionId,
  onClose,
  onFeedbackSubmitted,
}: {
  sessionId: string;
  onClose: () => void;
  onFeedbackSubmitted?: () => void;
}) {
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [err, setErr] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  useEffect(() => {
    setDetail(null);
    setErr("");
    getTraceDetail(sessionId)
      .then(setDetail)
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, [sessionId]);

  async function submitFeedback(rating: "good" | "bad") {
    setFeedbackBusy(true);
    setFeedbackMsg("");
    try {
      await postTraceFeedback({
        session_id: sessionId,
        rating,
        note: feedbackNote || undefined,
      });
      setFeedbackMsg(rating === "bad" ? "✅ 已标记 bad case，将进入 prompt 优化输入源" : "✅ 已标记 good case");
      setFeedbackNote("");
      const fresh = await getTraceDetail(sessionId);
      setDetail(fresh);
      onFeedbackSubmitted?.();
    } catch (e) {
      setFeedbackMsg(e instanceof Error ? e.message : "提交失败");
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-3xl bg-gray-950 border-l border-gray-800 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">调用链路详情</h2>
            <p className="text-gray-500 text-xs mt-0.5 font-mono">{sessionId}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {err ? (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-300 text-sm">{err}</div>
          ) : !detail ? (
            <div className="text-gray-500 text-sm">加载中...</div>
          ) : (
            <>
              <section>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  执行步骤（共 {detail.steps.length} 步）
                </h3>
                {detail.steps.length === 0 ? (
                  <p className="text-gray-600 text-sm italic">无步骤记录</p>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
                    {detail.steps.map((step, idx) => (
                      <TraceStepRow key={step.id} step={step} index={idx} />
                    ))}
                  </div>
                )}
              </section>

              {detail.feedback.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">反馈历史</h3>
                  <div className="space-y-2">
                    {detail.feedback.map((f) => (
                      <div
                        key={f.id}
                        className={`rounded-lg p-3 border ${
                          f.rating === "bad"
                            ? "bg-red-900/20 border-red-800"
                            : "bg-emerald-900/20 border-emerald-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                            f.rating === "bad" ? "bg-red-900/60 text-red-300" : "bg-emerald-900/60 text-emerald-300"
                          }`}>
                            {f.rating === "bad" ? "✗ bad" : "✓ good"}
                          </span>
                          <span className="text-xs text-gray-500">{f.source} · {f.reporterId ?? "—"}</span>
                          <span className="ml-auto text-xs text-gray-600">{formatRelativeTime(f.createdAt)}</span>
                        </div>
                        {f.note && <p className="text-sm text-gray-300 mt-1">{f.note}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="pt-4 border-t border-gray-800">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">标记本次结果</h3>
                <textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  placeholder="（可选）描述具体问题：哪一步输出有偏差？用户反馈了什么？"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                />
                <div className="flex gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => submitFeedback("bad")}
                    disabled={feedbackBusy}
                    className="px-4 py-2 bg-red-900/40 hover:bg-red-900/70 border border-red-800 text-red-300 text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    ✗ 标记 bad case
                  </button>
                  <button
                    type="button"
                    onClick={() => submitFeedback("good")}
                    disabled={feedbackBusy}
                    className="px-4 py-2 bg-emerald-900/40 hover:bg-emerald-900/70 border border-emerald-800 text-emerald-300 text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    ✓ 标记 good case
                  </button>
                  {feedbackMsg && (
                    <span className="self-center text-xs text-gray-400">{feedbackMsg}</span>
                  )}
                </div>
                <p className="text-gray-600 text-xs mt-2">
                  bad case 将关联 prompt 模板，回流到技能详情页"最近 bad cases"区块，供下次 prompt 优化参考。
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const traceDetailUtils = { formatDuration, formatRelativeTime };
