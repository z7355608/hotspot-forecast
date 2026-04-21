/**
 * TooltipHints — Module E
 * =======================
 * 首次触达功能时出现的上下文 tooltip，dismissed 后不再显示。
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useOnboarding, useTrack } from "../../lib/onboarding-context";

interface TooltipProps {
  id: string;
  text: string;
  direction?: "top" | "bottom" | "left" | "right";
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps any element and shows a tooltip the first time it is visible.
 * Once dismissed (or clicked), it never shows again.
 */
export function FirstTimeTooltip({
  id,
  text,
  direction = "bottom",
  className = "",
  children,
}: TooltipProps) {
  const { tooltipsSeen, markTooltipSeen } = useOnboarding();
  const track = useTrack();
  const seen = tooltipsSeen[id];
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (seen) return;
    // Show after a short delay so the UI settles
    timerRef.current = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(timerRef.current);
  }, [seen]);

  const dismiss = () => {
    setShow(false);
    markTooltipSeen(id);
    track("tooltip_dismissed", { id });
  };

  const directionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "bottom-[-6px] left-1/2 -translate-x-1/2 border-t-[#1E2939] border-l-transparent border-r-transparent border-b-transparent",
    bottom: "top-[-6px] left-1/2 -translate-x-1/2 border-b-[#1E2939] border-l-transparent border-r-transparent border-t-transparent",
    left: "right-[-6px] top-1/2 -translate-y-1/2 border-l-[#1E2939] border-t-transparent border-b-transparent border-r-transparent",
    right: "left-[-6px] top-1/2 -translate-y-1/2 border-r-[#1E2939] border-t-transparent border-b-transparent border-l-transparent",
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      {children}
      {show && !seen && (
        <div
          className={`absolute z-50 w-max max-w-[220px] ${directionClasses[direction]}`}
          style={{ animation: "fadeInScale 0.2s ease-out" }}
        >
          <div className="relative flex items-start gap-2 bg-[#1E2939] text-white rounded-[10px] px-3 py-2 shadow-lg">
            <p className="text-[12px] leading-[17px]">{text}</p>
            <button
              onClick={dismiss}
              className="shrink-0 mt-0.5 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            {/* Arrow */}
            <div
              className={`absolute w-0 h-0 border-[6px] ${arrowClasses[direction]}`}
            />
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * Standalone tooltip for use on the prediction page (E2) and breakdown page (E3).
 * Renders as a positioned callout, not wrapped around a child.
 */
export function PageTooltip({
  id,
  text,
  anchorSelector,
}: {
  id: string;
  text: string;
  anchorSelector?: string;
}) {
  const { tooltipsSeen, markTooltipSeen } = useOnboarding();
  const track = useTrack();
  const seen = tooltipsSeen[id];
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (seen) return;
    const timer = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(timer);
  }, [seen]);

  const dismiss = () => {
    setShow(false);
    markTooltipSeen(id);
    track("page_tooltip_dismissed", { id });
  };

  if (seen || !show) return null;

  return (
    <div
      className="inline-flex items-start gap-2 bg-[#1E2939] text-white rounded-[10px] px-3 py-2.5 shadow-lg text-[12px] leading-[17px] max-w-[240px]"
      style={{ animation: "fadeInScale 0.2s ease-out" }}
    >
      <span className="flex-1">{text}</span>
      <button
        onClick={dismiss}
        className="shrink-0 mt-0.5 text-white/60 hover:text-white transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
