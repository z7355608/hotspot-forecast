import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { useAuthModal } from "./auth-modal-context";
import { LoginFormPanel } from "./LoginFormPanel";
import { LoginQrPanel } from "./LoginQrPanel";

export function LoginModal() {
  const { view, openWelcome } = useAuthModal();
  const open = view === "login";

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="grid max-w-4xl grid-cols-1 gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-4xl md:grid-cols-[1fr_1.1fr]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">登录爆款预测 Agent</DialogTitle>

        {/* Close button (top right) — returns to welcome modal */}
        <button
          onClick={openWelcome}
          aria-label="关闭"
          className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left: QR panel (hidden on small screens) */}
        <div className="hidden md:block">
          <LoginQrPanel />
        </div>

        {/* Right: form panel */}
        <LoginFormPanel />
      </DialogContent>
    </Dialog>
  );
}
