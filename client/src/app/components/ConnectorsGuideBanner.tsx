import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useOnboarding } from "../lib/onboarding-context";
import { useAppStore } from "../store/app-store";

/** 当前会话内「稍后再说」后不再展示 */
const SESSION_DISMISS = "connectors_guide_dismissed";

/**
 * 首次完成预测后，引导接入账号（可关闭，不阻断阅读）。
 */
export function ConnectorsGuideBanner() {
  const navigate = useNavigate();
  const { checklistItems, dismissConnectorsGuide, connectorsGuideDismissed } = useOnboarding();
  const { connectedConnectors } = useAppStore();
  const [sessionSnoozed, setSessionSnoozed] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_DISMISS) === "1",
  );

  const visible = useMemo(() => {
    if (connectorsGuideDismissed || sessionSnoozed) return false;
    if (connectedConnectors.length > 0) return false;
    const firstDone = checklistItems.find((i) => i.id === "first_query")?.done;
    if (!firstDone) return false;
    return true;
  }, [checklistItems, connectedConnectors.length, connectorsGuideDismissed, sessionSnoozed]);

  if (!visible) return null;

  return (
    <div className="relative rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3 pr-10 shadow-sm sm:px-5">
      <button
        type="button"
        aria-label="关闭"
        onClick={() => dismissConnectorsGuide()}
        className="absolute right-2 top-2 rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-sm leading-relaxed text-gray-800">
        🎯 接入你的账号后，预测准确率从 <strong>75%</strong> 提升到 <strong>90%</strong>（基于历史用户均值）
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate("/connectors")}
          className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
        >
          立即接入
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(SESSION_DISMISS, "1");
            } catch {
              /* ignore */
            }
            setSessionSnoozed(true);
          }}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}
