import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Brain, Eye, Search } from "lucide-react";
import { useAuthModal } from "./auth-modal-context";
import { QrPlaceholder } from "./QrPlaceholder";

const FEATURES = [
  { icon: Brain, title: "爆款预测", desc: "预判选题、预测命中率" },
  { icon: BarChart3, title: "爆款拆解", desc: "拆解爆款，场景分析" },
  { icon: Search, title: "低粉爆款", desc: "收集低粉爆款样本发现" },
  { icon: Eye, title: "智能监控", desc: "AI 追踪赛道、账号与作品" },
] as const;

export function WelcomeTrialModal() {
  const { view, openLogin } = useAuthModal();
  const open = view === "welcome";

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl gap-0 overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-0 shadow-2xl sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">欢迎使用 爆款预测agent</DialogTitle>

        {/* Top-right: existing-account login link */}
        <button
          onClick={openLogin}
          className="absolute right-6 top-6 z-10 text-xs text-gray-400 transition hover:text-violet-600"
        >
          已有账号？登录 →
        </button>

        <div className="px-12 pb-10 pt-12">
          {/* Title */}
          <h2 className="text-center text-2xl font-bold text-gray-900 md:text-3xl">
            欢迎使用{" "}
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              爆款预测agent
            </span>
          </h2>

          {/* Feature cards */}
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-violet-100 bg-white/80 p-4 backdrop-blur-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-[9px] font-bold text-white">
                    AI
                  </div>
                  <Icon className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <div className="mt-2 text-sm font-semibold text-gray-900">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</div>
              </div>
            ))}
          </div>

          {/* QR + CTA + illustration */}
          <div className="relative mt-8 flex flex-col items-center">
            <div className="rounded-2xl border-2 border-violet-100 bg-white p-3 shadow-sm">
              <QrPlaceholder size={180} seed={3} />
            </div>

            <button
              onClick={openLogin}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:from-violet-700 hover:to-indigo-700"
            >
              微信扫码自动开启免费试用
            </button>

            <p className="mt-4 text-center text-xs text-gray-400">
              *若操作完成后，未启请尝试刷新页面，或者联系客服
            </p>

            {/* Phone illustration (right corner) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-2 bottom-6 hidden text-4xl md:block"
            >
              <span role="img" aria-label="phone-touch">
                📱
              </span>
              <span role="img" aria-label="touch" className="-ml-3">
                👆
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
