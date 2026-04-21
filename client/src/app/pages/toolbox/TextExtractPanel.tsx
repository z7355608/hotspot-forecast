/**
 * 文案提取面板（真实 API + aha moment 交付）
 * 从 ToolboxPage.tsx 提取
 */
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  Lightbulb,
  Link2,
  Loader2,
  Play,
  Sparkles,
  Star,
  Target,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ToolDef, CopywritingResult } from "./toolbox-constants";
import { formatNumber, formatDuration } from "./toolbox-constants";
import { PlatformTags, CopyButton } from "./ToolboxShared";

/* ================================================================== */
/*  文案提取 aha moment 交付组件                                          */
/* ================================================================== */

function CopywritingAhaResult({ result }: { result: CopywritingResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const [activeTab, setActiveTab] = useState<"copy" | "hooks" | "structure">("copy");

  const durationStr = formatDuration(result.audioDurationMs);

  return (
    <div className="space-y-5">
      {/* 顶部成就卡片 — 第一眼就看到价值 */}
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
        {/* 视频信息 */}
        {result.mediaInfo && (
          <div className="flex gap-4 p-4">
            {result.mediaInfo.coverUrl ? (
              <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg">
                <img src={result.mediaInfo.coverUrl} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="h-6 w-6 text-white" fill="white" />
                </div>
              </div>
            ) : (
              <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-200">
                <Play className="h-8 w-8 text-emerald-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">{result.mediaInfo.title}</h4>
              <div className="mb-2 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{result.mediaInfo.platform}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{durationStr}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {result.mediaInfo.stats.likeCount > 0 && <span>{formatNumber(result.mediaInfo.stats.likeCount)} 赞</span>}
                {result.mediaInfo.stats.collectCount > 0 && <span>{formatNumber(result.mediaInfo.stats.collectCount)} 藏</span>}
                <span>{result.rawTranscript.length} 字</span>
              </div>
            </div>
          </div>
        )}

        {/* aha moment 数据条 */}
        <div className="grid grid-cols-4 gap-px border-t border-emerald-100 bg-emerald-100">
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-emerald-600">{result.rawTranscript.length}</div>
            <div className="text-[10px] text-gray-400">提取字数</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-amber-500">{result.hooks.length}</div>
            <div className="text-[10px] text-gray-400">钩子句式</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-blue-500">{result.ctaPatterns.length}</div>
            <div className="text-[10px] text-gray-400">CTA 模式</div>
          </div>
          <div className="bg-white px-3 py-3 text-center">
            <div className="text-lg font-bold text-purple-500">{result.keyPhrases.length}</div>
            <div className="text-[10px] text-gray-400">关键金句</div>
          </div>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {([
          { id: "copy" as const, label: "AI 优化文案", icon: Sparkles },
          { id: "hooks" as const, label: "表达资产", icon: Lightbulb },
          { id: "structure" as const, label: "结构分析", icon: Target },
        ]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: AI 优化文案 */}
      {activeTab === "copy" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <Sparkles className="h-4 w-4 text-amber-500" />
              优化后的完整文案
            </h4>
            <CopyButton text={result.optimizedCopy} label="复制全文" />
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{result.optimizedCopy}</pre>
          </div>

          {/* 原始文案 */}
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
          >
            <FileText className="h-3 w-3" />
            {showRaw ? "收起原始识别文案" : "对比查看原始 ASR 识别文案"}
          </button>
          {showRaw && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">ASR 原始识别（未优化）</span>
                <CopyButton text={result.rawTranscript} label="复制原文" />
              </div>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">{result.rawTranscript}</pre>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 表达资产 — 钩子 + CTA + 金句 */}
      {activeTab === "hooks" && (
        <div className="space-y-5">
          {/* 钩子句式 */}
          {result.hooks.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                可复用钩子 · 直接拿走改写
              </h4>
              <p className="text-xs text-gray-400">这些开头句式经过验证有效，可以直接套用到你的内容中</p>
              <div className="space-y-1.5">
                {result.hooks.map((hook, i) => (
                  <div
                    key={i}
                    className="group flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 transition-colors hover:border-amber-200 hover:bg-amber-50/30"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-sm text-gray-700">{hook}</p>
                    <CopyButton text={hook} size="xs" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA 模式 */}
          {result.ctaPatterns.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ChevronRight className="h-4 w-4 text-emerald-500" />
                CTA 行动号召 · 提升转化率
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.ctaPatterns.map((cta, i) => (
                  <span
                    key={i}
                    className="group relative cursor-pointer rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-100"
                    onClick={() => navigator.clipboard.writeText(cta).catch(() => {})}
                  >
                    {cta}
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      点击复制
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 关键金句 */}
          {result.keyPhrases.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Star className="h-4 w-4 text-purple-500" />
                关键金句 · 值得收藏的表达
              </h4>
              <div className="space-y-1.5">
                {result.keyPhrases.map((phrase, i) => (
                  <div
                    key={i}
                    className="group flex items-center gap-2 rounded-lg border-l-2 border-purple-300 bg-purple-50/50 px-3 py-2"
                  >
                    <p className="flex-1 text-sm italic text-purple-800">"{phrase}"</p>
                    <CopyButton text={phrase} size="xs" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: 结构分析 */}
      {activeTab === "structure" && (
        <div className="space-y-4">
          {result.structureAnalysis && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-800">
                <Target className="h-4 w-4" />
                文案叙事结构
              </h4>
              <p className="text-sm leading-relaxed text-blue-700">{result.structureAnalysis}</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-900">结构拆解</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <span className="text-[10px] font-bold text-amber-700">1</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700">开头钩子</p>
                  <p className="text-xs text-gray-500">{result.hooks[0] || "未检测到明显钩子"}</p>
                </div>
              </div>
              <div className="ml-3 border-l border-dashed border-gray-200 pl-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <span className="text-[10px] font-bold text-blue-700">2</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700">正文展开</p>
                    <p className="text-xs text-gray-500">共 {result.rawTranscript.length} 字，{result.audioDurationMs > 0 ? `时长 ${durationStr}` : ""}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-700">3</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700">结尾 CTA</p>
                  <p className="text-xs text-gray-500">{result.ctaPatterns[0] || "未检测到明显 CTA"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部快捷操作 */}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        <CopyButton text={result.optimizedCopy} label="复制优化文案" />
        <CopyButton text={result.rawTranscript} label="复制原始文案" />
        <CopyButton
          text={[
            "【钩子句式】",
            ...result.hooks.map((h, i) => `${i + 1}. ${h}`),
            "",
            "【CTA 模式】",
            ...result.ctaPatterns.map((c, i) => `${i + 1}. ${c}`),
            "",
            "【关键金句】",
            ...result.keyPhrases.map((p, i) => `${i + 1}. ${p}`),
          ].join("\n")}
          label="复制全部资产"
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TextExtractPanel 主组件                                              */
/* ================================================================== */

export function TextExtractPanel({
  tool,
  credits,
  onSpend,
}: {
  tool: ToolDef;
  credits: number;
  onSpend: (cost: number, desc: string) => boolean;
}) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "extracting" | "done" | "error">("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CopywritingResult | null>(null);

  const Icon = tool.icon;

  const extractMutation = trpc.copywriting.extract.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        onSpend(tool.cost, `文案提取: ${data.mediaInfo?.title ?? "视频"}`);
        setResult(data as CopywritingResult);
        setStatus("done");
        setProgressMsg("文案提取完成");
        setProgressPct(100);
      } else {
        setError(data.error ?? "文案提取失败");
        setStatus("error");
      }
    },
    onError: (err) => {
      setError(err.message || "请求失败，请稍后重试");
      setStatus("error");
    },
  });

  const handleSubmit = useCallback(() => {
    if (!url.trim()) return;
    if (credits < tool.cost) {
      setError(`积分不足，需要 ${tool.cost} 积分，当前余额 ${credits} 积分`);
      setStatus("error");
      return;
    }

    setStatus("extracting");
    setError("");
    setResult(null);
    setProgressMsg("正在解析视频链接...");
    setProgressPct(10);

    const progressSteps = [
      { msg: "正在解析视频链接...", pct: 15, delay: 1000 },
      { msg: "解析成功，正在提取音频...", pct: 30, delay: 3000 },
      { msg: "火山引擎 ASR 语音识别中...", pct: 50, delay: 6000 },
      { msg: "语音识别中，请稍候...", pct: 65, delay: 10000 },
      { msg: "AI 正在优化文案结构...", pct: 80, delay: 15000 },
      { msg: "正在提取钩子和金句...", pct: 90, delay: 20000 },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const step of progressSteps) {
      timers.push(setTimeout(() => { setProgressMsg(step.msg); setProgressPct(step.pct); }, step.delay));
    }

    extractMutation.mutate({ url: url.trim() }, { onSettled: () => { for (const t of timers) clearTimeout(t); } });
  }, [url, credits, tool, extractMutation, onSpend]);

  const handleReset = useCallback(() => {
    setUrl("");
    setStatus("idle");
    setResult(null);
    setError("");
    setProgressMsg("");
    setProgressPct(0);
  }, []);

  return (
    <div className="space-y-6">
      {/* 工具头部 */}
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tool.bgColor}`}>
          <Icon className={`h-6 w-6 ${tool.color}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-900">{tool.name}</h2>
            <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              <Zap className="h-3 w-3" />{tool.cost} 积分/次
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">
              火山引擎 ASR + AI 优化
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{tool.desc}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-400">支持平台</p>
        <PlatformTags platforms={tool.supportedPlatforms} />
      </div>

      {/* 输入区 */}
      <div className="space-y-2">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Link2 className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (status === "error") setStatus("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter" && status === "idle") handleSubmit(); }}
            placeholder={tool.inputPlaceholder}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-300"
            disabled={status === "extracting"}
          />
        </div>
        <p className="text-xs text-gray-400">{tool.inputHint}</p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!url.trim() || status === "extracting"}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "extracting" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />提取中...</>
          ) : (
            <><Sparkles className="h-4 w-4" />开始提取</>
          )}
        </button>
        {status === "done" && (
          <button type="button" onClick={handleReset} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            继续使用
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {status === "error" && error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* 提取进度 */}
      {status === "extracting" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{progressMsg}</p>
              <p className="text-xs text-gray-400">
                {progressPct < 35 ? "解析视频信息中..." : progressPct < 65 ? "火山引擎语音识别处理中..." : "AI 正在分析和优化文案..."}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-right text-xs text-gray-400">{progressPct}%</p>
        </div>
      )}

      {/* 结果展示 — aha moment 交付 */}
      {status === "done" && result && <CopywritingAhaResult result={result} />}
    </div>
  );
}
