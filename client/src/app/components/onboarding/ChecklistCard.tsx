/**
 * ChecklistCard — Module C (v2)
 * ==============================
 * 右下角浮动上手任务卡片。可收起，全部完成后自动消失。
 *
 * Bug fixes vs v1:
 * - `dismissed` initialises to `true` if already allDone (returning user skips card)
 * - `celebratedRef` guards: celebration only fires once per session
 * - Collapsed state persisted in sessionStorage
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Zap, X } from "lucide-react";
import { useOnboarding, useTrack } from "../../lib/onboarding-context";

/* 积分奖励 */
const ITEM_REWARDS: Record<string, number> = {
  welcome:      0,
  first_query: 15,
  breakdown:   10,
  prediction:  10,
};

function MiniProgress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[5px] rounded-full overflow-hidden bg-[#F3F4F6]">
        <div
          className="h-full rounded-full transition-all duration-600 ease-out"
          style={{ width: `${pct}%`, background: pct === 100 ? "#36B37E" : "#1E2939" }}
        />
      </div>
      <span className="text-[11px] text-[#99A1AF] shrink-0 tabular-nums">{done}/{total}</span>
    </div>
  );
}

export function ChecklistCard() {
  const { welcomeCompleted, checklistItems } = useOnboarding();
  const track = useTrack();

  const doneCount = checklistItems.filter((i) => i.done).length;
  const totalCount = checklistItems.length;
  const allDone = doneCount === totalCount;

  // Returning user who already has all items done → don't show card
  const [dismissed, setDismissed] = useState(() => allDone);

  // Collapsed state persisted across page navigations
  const [collapsed, setCollapsed] = useState(() => {
    try { return sessionStorage.getItem("checklist_collapsed") === "1"; }
    catch { return false; }
  });

  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    try { sessionStorage.setItem("checklist_collapsed", next ? "1" : "0"); }
    catch { /* ignore */ }
  };

  // Track newly completed items this session for micro-animation
  const prevDoneRef = useRef<Set<string>>(
    new Set(checklistItems.filter((i) => i.done).map((i) => i.id)),
  );
  const [recentlyCompleted, setRecentlyCompleted] = useState<string | null>(null);
  const recentTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const nowDone = new Set(checklistItems.filter((i) => i.done).map((i) => i.id));
    let newlyDone: string | null = null;
    for (const id of nowDone) {
      if (!prevDoneRef.current.has(id)) { newlyDone = id; break; }
    }
    prevDoneRef.current = nowDone;
    if (newlyDone) {
      clearTimeout(recentTimerRef.current);
      setRecentlyCompleted(newlyDone);
      toggleCollapsed(false);
      recentTimerRef.current = setTimeout(() => setRecentlyCompleted(null), 2200);
    }
  }, [checklistItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Celebrate + auto-dismiss when all complete (only fires once per session)
  const celebratedRef = useRef<boolean>(false);
  useEffect(() => {
    if (allDone && !dismissed && !celebratedRef.current) {
      celebratedRef.current = true;
      toggleCollapsed(false);
      track("onboarding_checklist_all_done");
      const t = setTimeout(() => setDismissed(true), 4500);
      return () => clearTimeout(t);
    }
  }, [allDone, dismissed, track]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!welcomeCompleted || dismissed) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-[272px]"
      style={{ animation: "slideUpIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}
    >
      <style>{`
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes checkPop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div className="overflow-hidden rounded-[20px] border border-[#EAECF0] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.09)]">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[#1E2939]">
                {allDone ? "🎉 上手完成！" : "上手任务"}
              </span>
              {!allDone && (
                <span className="text-[11px] text-[#99A1AF]">{doneCount}/{totalCount}</span>
              )}
            </div>
            {!collapsed && !allDone && (
              <div className="mt-1.5">
                <MiniProgress done={doneCount} total={totalCount} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleCollapsed(!collapsed)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#B5BCC8] transition-colors hover:bg-[#F7F8FA] hover:text-[#364153]"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => { setDismissed(true); track("onboarding_checklist_dismissed"); }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#B5BCC8] transition-colors hover:bg-[#F7F8FA] hover:text-[#364153]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Item list */}
        {!collapsed && (
          <div className="space-y-1 px-3 pb-3">
            {checklistItems.map((item) => {
              const isNew = recentlyCompleted === item.id;
              const reward = ITEM_REWARDS[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 transition-all duration-300 ${
                    isNew ? "bg-[#F0FDF4]" : item.done ? "opacity-50" : "bg-[#F9FAFB]"
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-[#36B37E]"
                      style={isNew ? { animation: "checkPop 0.35s ease-out both" } : undefined}
                    />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-[#D1D5DC]" />
                  )}
                  <span
                    className={`flex-1 text-[12px] leading-snug ${
                      item.done ? "line-through text-[#99A1AF]" : "text-[#364153]"
                    }`}
                  >
                    {item.label}
                  </span>
                  {!item.done && reward > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                      <Zap className="h-2.5 w-2.5" />+{reward}
                    </span>
                  )}
                  {isNew && reward > 0 && (
                    <span className="shrink-0 text-[10px] text-[#36B37E]">+{reward}积分</span>
                  )}
                </div>
              );
            })}

            {/* All done row */}
            {allDone && (
              <div className="mt-1 flex items-center justify-center gap-2 rounded-[12px] bg-[#F0FDF4] px-3 py-2.5">
                <span className="text-[12px] text-[#36B37E]">全部完成，共获得 35 积分</span>
                <span className="text-base">🎊</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
