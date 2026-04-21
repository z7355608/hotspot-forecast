import { useState } from "react";
import { getMembershipLabel, useAppStore } from "../store/app-store";
import type { MembershipPlan } from "../store/app-data";
import {
  BadgeCheck,
  Calendar,
  Check,
  CreditCard,
  Crown,
  Gift,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import { useOnboarding } from "../lib/onboarding-context";

/* ── 常量 ── */

const CREDIT_PACKAGES = [
  { id: "pkg_100", credits: 100, price: 12, tag: "" },
  { id: "pkg_300", credits: 300, price: 30, tag: "热门" },
  { id: "pkg_800", credits: 800, price: 70, tag: "优惠" },
  { id: "pkg_2000", credits: 2000, price: 150, tag: "超值" },
] as const;

const PLUS_PLANS = [
  { id: "monthly_once" as const, label: "月付", price: 19, credits: 200, badge: "" },
  { id: "monthly_auto" as const, label: "连续包月", price: 15, credits: 200, badge: "推荐" },
  { id: "yearly" as const, label: "年付", price: 108, credits: 2400, badge: "省¥120", perMonth: 9 },
];

const PRO_PLANS = [
  { id: "monthly_once" as const, label: "月付", price: 49, credits: 600, badge: "" },
  { id: "monthly_auto" as const, label: "连续包月", price: 39, credits: 600, badge: "推荐" },
  { id: "yearly" as const, label: "年付", price: 300, credits: 7200, badge: "省¥288", perMonth: 25 },
];

const PLUS_FEATURES = [
  "每月200积分",
  "抖音平台分析",
  "基础爆款预测",
  "低粉爆款库",
  "内容日历",
];

const PRO_FEATURES = [
  "每月600积分",
  "全平台（抖音+小红书+快手）",
  "高级爆款预测",
  "低粉爆款库",
  "内容日历",
  "选题策略自进化",
  "效果追踪闭环",
  "优先客服",
];

type TabId = "recharge" | "membership" | "history";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "recharge", label: "积分充值", icon: <Zap className="h-4 w-4" /> },
  { id: "membership", label: "会员套餐", icon: <Crown className="h-4 w-4" /> },
  { id: "history", label: "消费记录", icon: <History className="h-4 w-4" /> },
];

/* ── 工具函数 ── */

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getTxIcon(type: string) {
  if (type === "checkin") return <Gift className="h-3.5 w-3.5 text-green-500" />;
  if (type === "purchase") return <CreditCard className="h-3.5 w-3.5 text-blue-500" />;
  if (type === "subscription") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
  if (type === "consume") return <TrendingUp className="h-3.5 w-3.5 text-gray-400" />;
  if (type === "refund") return <RefreshCw className="h-3.5 w-3.5 text-green-500" />;
  return <Sparkles className="h-3.5 w-3.5 text-purple-400" />;
}

/* ── 主页面 ── */

export function CreditsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("recharge");
  const [selectedPkg, setSelectedPkg] = useState<string>("pkg_300");
  const [selectedTier, setSelectedTier] = useState<"plus" | "pro">("pro");
  const [selectedBilling, setSelectedBilling] = useState<"monthly_once" | "monthly_auto" | "yearly">("monthly_auto");
  const [txOffset, setTxOffset] = useState(0);
  const { creditsBannerDismissed, dismissCreditsBanner } = useOnboarding();

  const utils = trpc.useUtils();
  const { syncBalance } = useAppStore();

  const balanceQuery = trpc.credits.getBalance.useQuery();
  const txQuery = trpc.credits.getTransactions.useQuery({ limit: 20, offset: txOffset });
  const checkinQuery = trpc.credits.getCheckinStatus.useQuery();
  const subQuery = trpc.credits.getSubscription.useQuery();

  const purchaseMut = trpc.credits.purchaseCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`充值成功！积分余额：${data.balance}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getTransactions.invalidate();
      void syncBalance();
    },
    onError: (err) => toast.error(err.message),
  });

  const subscribeMut = trpc.credits.subscribe.useMutation({
    onSuccess: (data) => {
      toast.success(`订阅成功！已赠送 ${data.creditsAwarded} 积分，到期：${formatDate(data.endAt)}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getSubscription.invalidate();
      utils.credits.getTransactions.invalidate();
      void syncBalance();
    },
    onError: (err) => toast.error(err.message),
  });

  const checkinMut = trpc.credits.checkin.useMutation({
    onSuccess: (data) => {
      toast.success(`签到成功！获得 ${data.creditsAwarded} 积分，余额：${data.balance}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getCheckinStatus.invalidate();
      utils.credits.getTransactions.invalidate();
      void syncBalance();
    },
    onError: (err) => toast.error(err.message),
  });

  const credits = balanceQuery.data?.credits ?? 0;
  const membershipPlan = (balanceQuery.data?.membershipPlan ?? "free") as MembershipPlan;
  const checkedIn = checkinQuery.data?.checkedIn ?? false;
  const subscription = subQuery.data?.subscription;

  const currentPlans = selectedTier === "plus" ? PLUS_PLANS : PRO_PLANS;
  const selectedPlan = currentPlans.find((p) => p.id === selectedBilling) ?? currentPlans[1];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">

      {/* ── Module D3: 新用户积分 Banner ── */}
      {!creditsBannerDismissed && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Gift className="h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <span className="font-medium">新用户已赠送 120 积分</span>
              <span className="ml-2 text-amber-600">足够完成约 4–6 次深度分析，无需充值即可体验全流程</span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissCreditsBanner}
            className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 余额概览卡片 ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
              <Zap className="h-7 w-7 text-amber-400" />
            </div>
            <div>
              <p className="mb-1 text-sm text-white/60">当前积分余额</p>
              {balanceQuery.isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-white/40" />
              ) : (
                <p className="text-4xl font-light tracking-tight">
                  {credits}
                  <span className="ml-2 text-base text-white/40">积分</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-white/40">当前会员</p>
              <p className="mt-0.5 font-medium text-white/80">
                {getMembershipLabel(membershipPlan)}
              </p>
            </div>
            {subscription && (
              <>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-xs text-white/40">到期时间</p>
                  <p className="mt-0.5 text-white/80">{formatDate(subscription.endAt)}</p>
                </div>
              </>
            )}
            <div className="h-8 w-px bg-white/10" />
            {/* 签到按钮 */}
            <button
              type="button"
              onClick={() => checkinMut.mutate()}
              disabled={checkedIn || checkinMut.isPending}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                checkedIn
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-amber-500 text-white hover:bg-amber-400"
              }`}
            >
              {checkinMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Calendar className="h-3.5 w-3.5" />
              )}
              {checkedIn ? "已签到" : "每日签到 +5"}
            </button>
          </div>
        </div>
        {credits < 50 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
            <Sparkles className="h-4 w-4 shrink-0" />
            积分余额不足，建议及时充值以确保分析任务不中断
          </div>
        )}
      </div>

      {/* ── Tab 切换 ── */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm transition-all ${
              activeTab === tab.id
                ? "bg-white font-medium text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 积分充值 Tab ── */}
      {activeTab === "recharge" && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-medium text-gray-900">积分包</h3>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                充值即到账 · 永不过期
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPkg(pkg.id)}
                  className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                    selectedPkg === pkg.id
                      ? "border-gray-900 bg-white shadow-sm"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  }`}
                >
                  {pkg.tag && (
                    <span className="absolute right-2.5 top-2.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                      {pkg.tag}
                    </span>
                  )}
                  <p className="mb-0.5 text-2xl text-gray-900">{pkg.credits}</p>
                  <p className="text-xs text-gray-400">积分</p>
                  <p className="mt-3 text-sm font-medium text-gray-700">¥{pkg.price}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    ≈ ¥{(pkg.price / pkg.credits * 10).toFixed(2)}/10积分
                  </p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const pkg = CREDIT_PACKAGES.find((p) => p.id === selectedPkg);
                if (!pkg) return;
                purchaseMut.mutate({ packageId: selectedPkg });
              }}
              disabled={purchaseMut.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
            >
              {purchaseMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              立即充值 ¥{CREDIT_PACKAGES.find((p) => p.id === selectedPkg)?.price ?? ""}
            </button>
            <p className="text-center text-xs text-gray-400">
              支持微信支付、支付宝。充值后积分立即到账，永不过期。
            </p>
          </div>

          {/* 积分消耗说明 */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <h4 className="mb-3 text-xs font-medium text-gray-700">积分消耗说明</h4>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>爆款预测（抖音单平台）</span>
                <span className="font-medium text-gray-700">20 积分/次</span>
              </div>
              <div className="flex justify-between">
                <span>每增加一个平台（小红书/快手）</span>
                <span className="font-medium text-amber-600">+10 积分/次</span>
              </div>
              <div className="flex justify-between">
                <span>每日签到奖励</span>
                <span className="font-medium text-green-600">+5 积分/天</span>
              </div>
              <div className="flex justify-between">
                <span>新用户注册赠送</span>
                <span className="font-medium text-green-600">+60 积分</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 会员套餐 Tab ── */}
      {activeTab === "membership" && (
        <div className="space-y-6">
          {/* 套餐选择 */}
          <div className="flex gap-2 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setSelectedTier("plus")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm transition-all ${
                selectedTier === "plus"
                  ? "bg-white font-medium text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Sparkles className="h-4 w-4 text-blue-500" />
              Plus
            </button>
            <button
              type="button"
              onClick={() => setSelectedTier("pro")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm transition-all ${
                selectedTier === "pro"
                  ? "bg-white font-medium text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Crown className="h-4 w-4 text-amber-500" />
              Pro
            </button>
          </div>

          {/* 计费周期选择 */}
          <div className="grid grid-cols-3 gap-3">
            {currentPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedBilling(plan.id)}
                className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                  selectedBilling === plan.id
                    ? "border-gray-900 bg-white shadow-sm"
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                {plan.badge && (
                  <span className={`absolute -right-1 -top-2.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white shadow-sm ${
                    plan.badge === "推荐" ? "bg-blue-500" : "bg-amber-500"
                  }`}>
                    {plan.badge}
                  </span>
                )}
                <p className="text-xs text-gray-500">{plan.label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">¥{plan.price}</p>
                {"perMonth" in plan && (
                  <p className="text-[10px] text-gray-400">¥{plan.perMonth}/月</p>
                )}
                <p className="mt-1 text-[10px] text-amber-600">{plan.credits} 积分</p>
              </button>
            ))}
          </div>

          {/* 权益列表 */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              {selectedTier === "plus" ? (
                <Sparkles className="h-5 w-5 text-blue-500" />
              ) : (
                <Crown className="h-5 w-5 text-amber-500" />
              )}
              <h3 className="font-semibold text-gray-900">
                {selectedTier === "plus" ? "Plus" : "Pro"} 会员权益
              </h3>
            </div>
            <ul className="space-y-2.5">
              {(selectedTier === "plus" ? PLUS_FEATURES : PRO_FEATURES).map((feature) => (
                <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <Check className="h-2.5 w-2.5 text-green-600" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* 订阅按钮 */}
          <button
            type="button"
            onClick={() => subscribeMut.mutate({ plan: selectedTier, billingCycle: selectedBilling })}
            disabled={subscribeMut.isPending}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
              selectedTier === "plus"
                ? "bg-blue-600 hover:bg-blue-500"
                : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"
            }`}
          >
            {subscribeMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BadgeCheck className="h-4 w-4" />
            )}
            订阅 {selectedTier === "plus" ? "Plus" : "Pro"} {selectedPlan.label} · ¥{selectedPlan.price}
          </button>

          {/* 权益对比 */}
          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">权益</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">免费版</th>
                  <th className="px-4 py-3 text-center font-medium text-blue-600">Plus</th>
                  <th className="px-4 py-3 text-center font-medium text-amber-600">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ["每月积分", "60（新用户）", "200", "600"],
                  ["分析平台", "抖音", "抖音", "全平台"],
                  ["爆款预测", "✓", "✓", "✓（高级）"],
                  ["低粉爆款库", "✓", "✓", "✓"],
                  ["内容日历", "✓", "✓", "✓"],
                  ["选题策略自进化", "✗", "✗", "✓"],
                  ["效果追踪", "✗", "✗", "✓"],
                  ["优先客服", "✗", "✗", "✓"],
                ].map(([feature, free, plus, pro]) => (
                  <tr key={feature} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{feature}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{free}</td>
                    <td className="px-4 py-3 text-center text-blue-600">{plus}</td>
                    <td className="px-4 py-3 text-center text-amber-600">{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 消费记录 Tab ── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {txQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
            </div>
          ) : !txQuery.data?.transactions.length ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-16">
              <History className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-400">暂无消费记录</p>
              <p className="mt-1 text-xs text-gray-300">使用分析功能后，消费记录会出现在这里</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                {txQuery.data.transactions.map((tx, index) => (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${
                      index < txQuery.data.transactions.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        tx.amount > 0 ? "bg-green-50" : "bg-gray-50"
                      }`}>
                        {getTxIcon(tx.type)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-700">{tx.description}</p>
                        <p className="text-xs text-gray-400">{formatDate(tx.createdAt)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-sm font-medium ${tx.amount > 0 ? "text-green-600" : "text-gray-500"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </span>
                      <p className="text-[10px] text-gray-400">余额 {tx.balance}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">共 {txQuery.data.total} 条记录</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTxOffset(Math.max(0, txOffset - 20))}
                    disabled={txOffset === 0}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxOffset(txOffset + 20)}
                    disabled={txOffset + 20 >= (txQuery.data.total ?? 0)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}