import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  Copy,
  Gift,
  Loader2,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getModelOption, normalizePlan } from "../store/app-data";
import { getMembershipLabel, useAppStore } from "../store/app-store";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

/** 充值包配置，与后端 CREDIT_PACKAGES 对应 */
const QUICK_TOPUPS = [
  { packageId: "pkg_100", credits: 100, price: "¥12", tag: "轻量" },
  { packageId: "pkg_300", credits: 300, price: "¥30", tag: "常用" },
  { packageId: "pkg_800", credits: 800, price: "¥70", tag: "高频" },
] as const;

const QUICK_MEMBERSHIPS = [
  {
    id: "plus",
    name: "Plus 会员",
    price: "¥15 / 月",
    desc: "每月 200 积分 + 抖音平台分析",
  },
  {
    id: "pro",
    name: "Pro 会员",
    price: "¥39 / 月",
    desc: "每月 600 积分 + 全平台分析",
  },
] as const;

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  width = "max-w-lg",
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  width?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
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
          className={`w-full ${width} overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-2xl`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">{title}</div>
              <div className="mt-1 text-sm leading-relaxed text-gray-400">
                {subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="关闭弹窗"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function HeroCard({
  icon,
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  className: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 p-4 ${className}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-gray-400">{eyebrow}</div>
          <div className="mt-0.5 text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-gray-500">
            {description}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-gray-100 bg-white p-3">
          <div className="text-base font-semibold text-gray-900">{item.value}</div>
          <div className="mt-1 text-[11px] text-gray-400">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function FooterActions({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  primaryIcon,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  primaryIcon?: ReactNode;
}) {
  return (
    <div className="flex gap-3 border-t border-gray-100 pt-4">
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          {secondaryLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onPrimary}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
      >
        {primaryIcon}
        {primaryLabel}
      </button>
    </div>
  );
}

export function InviteFriendsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useAppStore();
  const [copied, setCopied] = useState(false);

  // 从用户状态中获取真实的邀请数据
  const inviteCode = state.userProfile.nickname
    ? `HOTSPOT-${state.userProfile.nickname.toUpperCase().slice(0, 6)}`
    : "HOTSPOT-INVITE";
  const invitedCount = state.transactions.filter(
    (t) => t.type === "earn" && (t.desc?.includes("邀请") || t.label?.includes("邀请")),
  ).length;
  const totalReward = invitedCount * 500;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="邀请好友"
      subtitle="邀请好友一起使用，双方各得积分奖励。"
    >
      <HeroCard
        icon={<Gift className="h-5 w-5 text-gray-900" />}
        eyebrow="邀请奖励"
        title="每邀请 1 位好友，双方各得 500 积分"
        description="适合分享给协作同事或内容团队成员，成功注册后自动到账。"
        className="bg-gradient-to-br from-gray-50 via-white to-gray-100"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold tracking-tight text-gray-900">
              +500
            </div>
            <div className="mt-1 text-xs text-gray-400">奖励到账后可继续分析或追问</div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[11px] text-gray-500 shadow-sm">
            分享后自动追踪
          </span>
        </div>
      </HeroCard>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="mb-2 text-xs text-gray-400">你的邀请码</div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
          <span className="text-sm tracking-[0.22em] text-gray-900">
            {inviteCode}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>

      <StatGrid
        items={[
          { label: "已邀请", value: String(invitedCount) },
          { label: "累计奖励", value: totalReward > 0 ? totalReward.toLocaleString() : "0" },
          { label: "当前积分", value: state.credits.toLocaleString() },
        ]}
      />

      <FooterActions
        secondaryLabel="关闭"
        onSecondary={onClose}
        primaryLabel={copied ? "邀请码已复制" : "复制邀请码并分享"}
        onPrimary={handleCopy}
        primaryIcon={<Share2 className="h-4 w-4" />}
      />
    </ModalShell>
  );
}

export function CreditsQuickModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, syncBalance } = useAppStore();
  const selectedModel = getModelOption(state.selectedModel);
  const [activeTab, setActiveTab] = useState<"credits" | "membership">("credits");
  const [selectedTopUp, setSelectedTopUp] = useState<string>("pkg_300");
  const [selectedMembership, setSelectedMembership] = useState<"plus" | "pro">(
    "plus",
  );
  const utils = trpc.useUtils();

  const purchaseMut = trpc.credits.purchaseCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`充值成功！积分余额：${data.balance}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getTransactions.invalidate();
      void syncBalance();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const subscribeMut = trpc.credits.subscribe.useMutation({
    onSuccess: (data) => {
      toast.success(`开通成功！积分余额：${data.balance}`);
      utils.credits.getBalance.invalidate();
      utils.credits.getTransactions.invalidate();
      void syncBalance();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isMutating = purchaseMut.isPending || subscribeMut.isPending;

  useEffect(() => {
    if (!open) return;

    const recommendMembership =
      normalizePlan(state.membershipPlan) === "free" && state.credits < 60;
    const timer = window.setTimeout(() => {
      setActiveTab(recommendMembership ? "membership" : "credits");
      setSelectedTopUp(state.credits < 30 ? "pkg_300" : "pkg_100");
      setSelectedMembership(
        normalizePlan(state.membershipPlan) === "plus" ? "pro" : "plus",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, state.membershipPlan, state.credits]);

  const selectedTopUpPackage =
    QUICK_TOPUPS.find((p) => p.packageId === selectedTopUp) ?? QUICK_TOPUPS[1];
  const selectedMembershipPackage =
    QUICK_MEMBERSHIPS.find((p) => p.id === selectedMembership) ??
    QUICK_MEMBERSHIPS[0];
  const selectedMembershipIsCurrent =
    normalizePlan(state.membershipPlan) === selectedMembership;

  const handlePrimaryAction = () => {
    if (activeTab === "credits") {
      purchaseMut.mutate({ packageId: selectedTopUpPackage.packageId });
    } else {
      subscribeMut.mutate({ plan: selectedMembership, billingCycle: "monthly_once" });
    }
  };

  const primaryLabel =
    activeTab === "credits"
      ? `充值 ${selectedTopUpPackage.credits} 积分`
      : selectedMembershipIsCurrent
        ? "当前已是此方案"
        : `开通 ${selectedMembershipPackage.name}`;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="积分与会员"
      subtitle={`当前 ${state.credits} 积分 · ${getMembershipLabel(state.membershipPlan)} · 模型 ${selectedModel.name}`}
    >
      <div className="flex gap-2 rounded-xl bg-gray-100 p-1">
        {(
          [
            { key: "credits", label: "充值积分" },
            { key: "membership", label: "开通会员" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "credits" ? (
        <div className="grid grid-cols-3 gap-3">
          {QUICK_TOPUPS.map((pkg) => {
            const active = selectedTopUp === pkg.packageId;
            return (
              <button
                key={pkg.packageId}
                type="button"
                onClick={() => setSelectedTopUp(pkg.packageId)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-gray-400 bg-gray-50 shadow-sm"
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <div className="text-xl font-semibold text-gray-900">
                  {pkg.credits}
                </div>
                <div className="mt-1 text-sm text-gray-500">{pkg.price}</div>
                <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                  {pkg.tag}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {QUICK_MEMBERSHIPS.map((plan) => {
            const active = selectedMembership === plan.id;
            const isCurrent = normalizePlan(state.membershipPlan) === plan.id;
            const recommended =
              plan.id === "plus" && normalizePlan(state.membershipPlan) === "free";

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedMembership(plan.id)}
                className={`rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-emerald-300 bg-emerald-50 shadow-sm"
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {plan.name}
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-700">
                      {plan.price}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      isCurrent
                        ? "bg-emerald-100 text-emerald-700"
                        : recommended
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {isCurrent ? "当前方案" : recommended ? "推荐" : "可开通"}
                  </span>
                </div>
                <div className="mt-3 text-[11px] leading-relaxed text-gray-500">
                  {plan.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-gray-400">已选方案</div>
            <div className="mt-1 truncate text-sm font-medium text-gray-900">
              {activeTab === "credits"
                ? `${selectedTopUpPackage.credits} 积分包`
                : selectedMembershipPackage.name}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">支付金额</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {activeTab === "credits"
                ? selectedTopUpPackage.price
                : selectedMembershipPackage.price}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={(activeTab === "membership" && selectedMembershipIsCurrent) || isMutating}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
            (activeTab === "membership" && selectedMembershipIsCurrent) || isMutating
              ? "cursor-not-allowed bg-gray-200 text-gray-400"
              : "bg-gray-900 text-white hover:bg-gray-700"
          }`}
        >
          {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isMutating ? "处理中..." : primaryLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function toneClasses(tone: "blue" | "green" | "amber" | "gray") {
  if (tone === "blue") {
    return {
      chip: "bg-blue-50 text-blue-600",
      icon: "bg-blue-50 text-blue-500",
    };
  }
  if (tone === "green") {
    return {
      chip: "bg-green-50 text-green-600",
      icon: "bg-green-50 text-green-500",
    };
  }
  if (tone === "amber") {
    return {
      chip: "bg-amber-50 text-amber-700",
      icon: "bg-amber-50 text-amber-500",
    };
  }
  return {
    chip: "bg-gray-100 text-gray-500",
    icon: "bg-gray-100 text-gray-500",
  };
}

/**
 * 从用户的真实操作历史中生成通知列表
 */
function buildRealNotifications(input: {
  results: Array<{ query: string; createdAt?: string; taskIntent?: string }>;
  connectors: Array<{ id: string; name: string; connected: boolean; lastSync?: string }>;
  credits: number;
  membershipPlan: string;
}) {
  const items: Array<{
    id: string;
    title: string;
    body: string;
    time: string;
    unread: boolean;
    tone: "blue" | "green" | "amber" | "gray";
  }> = [];

  // 最近的预测结果
  const recentResults = [...input.results]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 2);

  for (const result of recentResults) {
    const timeStr = result.createdAt
      ? formatRelativeTime(new Date(result.createdAt))
      : "最近";
    items.push({
      id: `result-${result.query.slice(0, 10)}`,
      title: "分析结果已生成",
      body: `「${result.query.slice(0, 30)}${result.query.length > 30 ? "..." : ""}」分析完成，可查看详细结果。`,
      time: timeStr,
      unread: true,
      tone: "blue",
    });
  }

  // 已连接的平台
  const connectedPlatforms = input.connectors.filter((c) => c.connected);
  if (connectedPlatforms.length > 0) {
    const names = connectedPlatforms.map((c) => c.name).join("、");
    items.push({
      id: "sync-status",
      title: "平台数据同步",
      body: `${names}已连接，数据同步可用。打开创作中心查看最新数据。`,
      time: "最近",
      unread: false,
      tone: "green",
    });
  }

  // 积分状态
  if (input.credits < 50) {
    items.push({
      id: "credits-low",
      title: "积分余额提醒",
      body: `当前剩余 ${input.credits} 积分，建议及时充值以确保分析任务不中断。`,
      time: "系统提醒",
      unread: true,
      tone: "amber",
    });
  }

  // 如果没有任何真实通知，显示引导
  if (items.length === 0) {
    items.push({
      id: "welcome",
      title: "欢迎使用爆款预测Agent",
      body: "开始你的第一次内容分析，在首页输入框输入话题或粘贴链接即可。",
      time: "刚刚",
      unread: true,
      tone: "blue",
    });
    items.push({
      id: "connect-tip",
      title: "连接你的创作账号",
      body: "前往「账号连接」绑定抖音、小红书或快手账号，解锁创作中心数据看板。",
      time: "系统提示",
      unread: false,
      tone: "gray",
    });
  }

  return items.slice(0, 4);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString("zh-CN");
}

export function NotificationsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { state } = useAppStore();
  const [dbNotifications, setDbNotifications] = useState<Array<{
    id: number;
    type: string;
    title: string;
    body: string;
    tone: string;
    isRead: number;
    relatedId: string | null;
    actionUrl: string | null;
    createdAt: string;
  }>>([]);
  const [loading, setLoading] = useState(false);

  // 当弹窗打开时从数据库加载通知
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/trpc/notifications.list", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.result?.data?.items) {
          setDbNotifications(data.result.data.items);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // 合并数据库通知和前端状态通知
  const frontendNotifications = buildRealNotifications({
    results: state.results,
    connectors: state.connectors,
    credits: state.credits,
    membershipPlan: state.membershipPlan,
  });

  // 将数据库通知转换为统一格式
  const dbItems = dbNotifications.map((n) => ({
    id: `db-${n.id}`,
    dbId: n.id,
    title: n.title,
    body: n.body,
    time: formatRelativeTime(new Date(n.createdAt)),
    unread: n.isRead === 0,
    tone: (n.tone as "blue" | "green" | "amber" | "gray") || "blue",
    actionUrl: n.actionUrl,
  }));

  // 数据库通知优先，前端通知补充
  const allNotifications = [
    ...dbItems,
    ...frontendNotifications.filter(
      (fn) => !dbItems.some((db) => db.title === fn.title && db.body === fn.body)
    ),
  ].slice(0, 10);

  const unreadCount = allNotifications.filter((item) => item.unread).length;

  const handleMarkAllRead = () => {
    fetch("/api/trpc/notifications.markAllRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    }).then(() => {
      setDbNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
    }).catch(() => {});
  };

  const handleMarkRead = (dbId: number) => {
    fetch("/api/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: dbId }),
    }).then(() => {
      setDbNotifications((prev) =>
        prev.map((n) => (n.id === dbId ? { ...n, isRead: 1 } : n))
      );
    }).catch(() => {});
  };

  const handleDismiss = (item: typeof allNotifications[0]) => {
    if (item.id.startsWith("db-") && "dbId" in item) {
      handleMarkRead((item as any).dbId);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title="通知中心"
      subtitle="任务完成、数据同步和系统提醒会出现在这里。"
    >
      <HeroCard
        icon={<Bell className="h-5 w-5 text-blue-500" />}
        eyebrow="最近更新"
        title={loading ? "加载中..." : unreadCount > 0 ? `你有 ${unreadCount} 条未读通知` : "暂无未读通知"}
        description="分析结果、监控报告、数据同步和积分变动会实时推送到这里。"
        className="bg-gradient-to-br from-blue-50 via-white to-indigo-50"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] text-gray-500 shadow-sm">
            共 {allNotifications.length} 条
          </span>
          {unreadCount > 0 && (
            <>
              <span className="rounded-full bg-gray-900 px-3 py-1 text-[11px] text-white">
                {unreadCount} 条未读
              </span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="rounded-full bg-blue-50 px-3 py-1 text-[11px] text-blue-600 transition-colors hover:bg-blue-100"
              >
                全部已读
              </button>
            </>
          )}
        </div>
      </HeroCard>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {allNotifications.length === 0 && !loading && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <Bell className="mx-auto h-8 w-8 text-gray-300 mb-3" />
            <div className="text-sm text-gray-500">暂无通知</div>
            <div className="mt-1 text-xs text-gray-400">开始使用分析功能后，通知会出现在这里</div>
          </div>
        )}
        {allNotifications.map((item) => {
          const toneClass = toneClasses(item.tone);
          const isDbItem = item.id.startsWith("db-");
          return (
            <div
              key={item.id}
              className={`rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50 cursor-pointer ${item.unread ? "" : "opacity-60"}`}
              onClick={() => {
                if (isDbItem && item.unread && "dbId" in item) {
                  handleMarkRead((item as any).dbId);
                }
                if ("actionUrl" in item && (item as any).actionUrl) {
                  onClose();
                  navigate((item as any).actionUrl);
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClass.icon}`}>
                  {item.tone === "blue" ? (
                    <Bell className="h-4 w-4" />
                  ) : item.tone === "green" ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : item.tone === "amber" ? (
                    <Gift className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-gray-900">{item.title}</div>
                    {item.unread ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${toneClass.chip}`}>
                        未读
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[10px] bg-gray-100 text-gray-400">
                        已读
                      </span>
                    )}
                  </div>
                  <div className="text-xs leading-relaxed text-gray-500">{item.body}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{item.time}</span>
                    {item.unread && isDbItem && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(item);
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Check className="h-3 w-3" />
                        标记已读
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <FooterActions
        secondaryLabel="前往设置"
        onSecondary={() => {
          onClose();
          navigate("/settings");
        }}
        primaryLabel="查看历史记录"
        onPrimary={() => {
          onClose();
          navigate("/history");
        }}
        primaryIcon={<ArrowUpRight className="h-4 w-4" />}
      />
    </ModalShell>
  );
}
