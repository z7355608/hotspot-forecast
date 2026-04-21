import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronRight } from "lucide-react";
import { getChargedCost, type ResultRecord } from "../../store/app-data";

export function PlaceholderFollowUp({
  credits,
  modelName,
  modelId,
  autoFocus,
  prefillPrompt,
  title,
  description,
  placeholder,
  quickActions,
  onConsume,
}: {
  credits: number;
  modelName: string;
  modelId: "doubao" | "gpt54" | "claude46";
  autoFocus?: boolean;
  prefillPrompt?: string;
  title: string;
  description: string;
  placeholder: string;
  quickActions: ReadonlyArray<{ label: string; cost: number }>;
  onConsume: (cost: number, label: string) => { ok: boolean; shortfall?: number };
}) {
  const [customPrompt, setCustomPrompt] = useState(() => prefillPrompt ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    textareaRef.current?.focus();
  }, [autoFocus]);

  const submitCustomPrompt = () => {
    if (!customPrompt.trim()) return;
    const action = onConsume(10, customPrompt);
    if (action.ok) {
      setCustomPrompt("");
    }
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="px-5 py-5 sm:px-7">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-gray-800">{title}</div>
            <div className="mt-0.5 text-xs text-gray-400">
              {description} · 当前模型 {modelName}
            </div>
          </div>
          <div className="text-xs text-gray-400">余额 {credits}</div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            ref={textareaRef}
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value)}
            rows={2}
            placeholder={placeholder}
            className="min-h-[92px] flex-1 resize-none rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none sm:min-h-0"
          />
          <button
            type="button"
            onClick={submitCustomPrompt}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-gray-900 text-white transition-colors hover:bg-gray-700 sm:h-9 sm:w-9 sm:rounded-full"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-gray-50 px-5 py-4 sm:px-7">
        <div className="mb-2 text-[11px] text-gray-400">快捷动作</div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => onConsume(action.cost, action.label)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100"
            >
              {action.label}
              <span className="text-[10px] text-gray-300">
                {getChargedCost(action.cost, modelId)} 积分
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultCardPanel({
  title,
  description,
  reason,
  ctaLabel,
  previewSections,
  onAction,
}: {
  title: string;
  description: string;
  reason: string;
  ctaLabel: string;
  previewSections: ResultRecord["primaryCard"]["previewSections"];
  onAction: () => void;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 break-words text-base text-gray-900">{title}</div>
          <p className="mt-1 break-words text-sm leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>
      <p className="mt-3 break-words rounded-2xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
        {reason}
      </p>

      <div className="mt-4 space-y-3">
        {previewSections.map((section) => (
          <div
            key={`${title}-${section.title}`}
            className={`rounded-2xl px-3 py-3 ${
              section.tone === "warning"
                ? "bg-amber-50"
                : section.tone === "positive"
                  ? "bg-emerald-50"
                  : "bg-gray-50"
            }`}
          >
            <div className="mb-2 text-[11px] text-gray-400">{section.title}</div>
            <div className="space-y-1.5">
              {section.items.map((item, index) => (
                <p
                  key={`${section.title}-${index}`}
                  className="break-words text-xs leading-relaxed text-gray-700"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAction}
        className="mt-4 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white transition-colors hover:bg-gray-700"
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TaskSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
      <div className="mb-4">
        <div className="text-sm text-gray-800">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-relaxed text-gray-400">{description}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
