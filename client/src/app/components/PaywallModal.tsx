import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Coins,
  Loader2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAppStore } from "../store/app-store";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  定价配置                                                           */
/* ------------------------------------------------------------------ */

/** 充值包配置，与后端 CREDIT_PACKAGES 对应 */
const TOPUP_PACKAGES = [
  {
    packageId: "pkg_100",
    credits: 100,
    price: "¥12",
    tag: "首单推荐",
    highlight: true,
    perCredit: "¥0.12",
    desc: "适合先体验一次完整链路",
  },
  {
    packageId: "pkg_300",
    credits: 300,
    price: "¥30",
    tag: "常用",
    highlight: false,
    perCredit: "¥0.10",
    desc: "约 15 次基础分析",
  },
  {
    packageId: "pkg_800",
    credits: 800,
    price: "¥70",
    tag: "高频",
    highlight: false,
    perCredit: "¥0.09",
    desc: "约 40 次基础分析",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  PaywallModal Shell                                                 */
/* ------------------------------------------------------------------ */

function PaywallShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PaywallModal 主组件                                                */
/* ------------------------------------------------------------------ */

export interface PaywallContext {
  /** 触发场景描述（如"继续深挖"、"生成执行文案"） */
  actionLabel: string;
  /** 需要消耗的积分 */
  requiredCredits: number;
  /** 差额 */
  shortfall: number;
  /** 场景化描述（如"解锁这 5 个低粉爆款脚本"） */
  contextDescription?: string;
}

export function PaywallModal({
  open,
  onClose,
  context,
  onTopUpComplete,
}: {
  open: boolean;
  onClose: () => void;
  context: PaywallContext;
  /** 充值完成后的回调，可用于自动继续之前的操作 */
  onTopUpComplete?: () => void;
}) {
  const { state, syncBalance } = useAppStore();
  const [selectedPackage, setSelectedPackage] = useState(0);
  const utils = trpc.useUtils();

  const purchaseMut = trpc.credits.purchaseCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`充值成功！积分余额：${data.balance}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getTransactions.invalidate();
      // 同步后端积分到本地 state，确保积分判断一致
      void syncBalance();
      onClose();
      if (onTopUpComplete) {
        window.setTimeout(onTopUpComplete, 300);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // 打开时默认选中首单推荐包
  useEffect(() => {
    if (open) setSelectedPackage(0);
  }, [open]);

  const pkg = TOPUP_PACKAGES[selectedPackage];
  const liveCredits = trpc.credits.getBalance.useQuery(undefined, { enabled: open });
  const currentCredits = liveCredits.data?.credits ?? state.credits;
  const afterTopUp = currentCredits + pkg.credits;
  const canContinue = afterTopUp >= context.requiredCredits;

  const handleTopUp = () => {
    purchaseMut.mutate({ packageId: pkg.packageId });
  };

  return (
    <PaywallShell open={open} onClose={onClose}>
      {/* 头部：场景化文案 */}
      <div className="border-b border-gray-100 bg-gray-50 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100">
                <Coins className="h-4 w-4 text-gray-600" />
              </div>
              <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                积分不足
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-gray-900">
              {context.contextDescription || `继续「${context.actionLabel}」`}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              还需要{" "}
              <span className="font-medium text-gray-800">
                {context.shortfall} 积分
              </span>
              ，选一个积分包即可继续。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 当前状态 */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-3 py-2">
            <div className="text-center">
              <div className="text-xs text-gray-400">当前余额</div>
              <div className="text-lg font-semibold text-gray-900">
                {currentCredits}
              </div>
            </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <div className="text-xs text-gray-400">本次需要</div>
            <div className="text-lg font-semibold text-gray-900">
              {context.requiredCredits}
            </div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <div className="text-xs text-gray-400">差额</div>
            <div className="text-lg font-semibold text-gray-700">
              -{context.shortfall}
            </div>
          </div>
        </div>
      </div>

      {/* 积分包选择 */}
      <div className="space-y-3 px-5 py-4">
        {TOPUP_PACKAGES.map((item, index) => {
          const active = selectedPackage === index;
          return (
            <button
              key={item.credits}
              type="button"
              onClick={() => setSelectedPackage(index)}
              className={`relative w-full rounded-2xl border p-4 text-left transition-all ${
                active
                  ? "border-gray-300 bg-gray-50 shadow-sm ring-1 ring-gray-200"
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              {item.highlight && (
                <div className="absolute -right-1 -top-2.5 flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                  <Sparkles className="h-2.5 w-2.5" />
                  限时首单特惠
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                    <Zap className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">
                        {item.credits} 积分
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                        {item.tag}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {item.desc}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold text-gray-900">
                    {item.price}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {item.perCredit}/积分
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部操作区 */}
      <div className="border-t border-gray-100 px-5 py-4">
        {/* 充值后预览 */}
        <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
          <span className="text-xs text-gray-400">充值后余额</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {afterTopUp} 积分
            </span>
            {canContinue && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                <Check className="h-2.5 w-2.5" />
                可继续
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={handleTopUp}
            disabled={purchaseMut.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
          >
            {purchaseMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Coins className="h-4 w-4" />
            )}
            立即充值 {pkg.price}
          </button>
        </div>

        <p className="mt-2.5 text-center text-[11px] text-gray-400">
          充值后将自动继续「{context.actionLabel}」操作
        </p>
      </div>
    </PaywallShell>
  );
}
