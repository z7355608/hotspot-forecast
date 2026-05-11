import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { QrPlaceholder } from "./QrPlaceholder";

const QR_TTL_MS = 60_000;

export function LoginQrPanel() {
  const [seed, setSeed] = useState(1);
  const [status, setStatus] = useState<"fresh" | "expired">("fresh");

  useEffect(() => {
    if (status !== "fresh") return;
    const t = setTimeout(() => setStatus("expired"), QR_TTL_MS);
    return () => clearTimeout(t);
  }, [status, seed]);

  const refresh = () => {
    setSeed((s) => s + 1);
    setStatus("fresh");
  };

  return (
    <div className="flex h-full flex-col items-center justify-between bg-gradient-to-br from-violet-50/50 to-white p-8">
      {/* Logo */}
      <div className="flex w-full items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-bold text-white shadow-sm">
          AI
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-gray-400">爆款预测</span>
          <span className="text-sm font-semibold text-gray-900">AI Agent</span>
        </div>
      </div>

      {/* QR */}
      <div className="relative mt-6">
        <div className="rounded-2xl border-2 border-violet-100 bg-white p-3 shadow-sm">
          <QrPlaceholder size={200} seed={seed} />
        </div>

        {status === "expired" && (
          <button
            onClick={refresh}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/85 backdrop-blur-sm transition hover:bg-white/95"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-gray-900">二维码已失效</div>
            <div className="text-xs text-violet-600">点击刷新</div>
          </button>
        )}
      </div>

      {/* Bottom hint */}
      <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-500">
        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#07c160] text-[10px] font-bold text-white">
          微
        </span>
        <span>
          微信扫码 <span className="font-semibold text-gray-900">爆款预测 Agent</span> 快速登录
        </span>
      </div>
    </div>
  );
}
