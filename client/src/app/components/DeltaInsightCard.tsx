import {
  ArrowDownRight,
  AlertTriangle,
  Eye,
  Zap,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type InsightTrend = "up" | "down" | "alert" | "new";

export interface DeltaInsight {
  id: string;
  /** 赛道/领域名称 */
  track: string;
  /** 变化摘要文案 */
  headline: string;
  /** 补充说明 */
  detail: string;
  /** 趋势方向 */
  trend: InsightTrend;
  /** 关联的数据指标 */
  metric?: string;
  /** 变化幅度 */
  delta?: string;
  /** 时间窗口描述 */
  timeWindow: string;
  /** 快捷操作按钮文案 */
  actionLabel: string;
  /** 快捷操作的 prompt */
  actionPrompt: string;
}

const TREND_CONFIG: Record<
  InsightTrend,
  {
    icon: LucideIcon;
    /** 指标数字颜色 */
    deltaColor: string;
    /** 图标容器背景 */
    iconBg: string;
    /** 图标颜色 */
    iconColor: string;
    /** 卡片边框 */
    border: string;
    /** 趋势标签文案 */
    label: string;
  }
> = {
  up: {
    icon: TrendingUp,
    deltaColor: "text-emerald-700",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    border: "border-gray-100",
    label: "上升",
  },
  down: {
    icon: ArrowDownRight,
    deltaColor: "text-gray-700",
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
    border: "border-gray-100",
    label: "下降",
  },
  alert: {
    icon: AlertTriangle,
    deltaColor: "text-gray-700",
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
    border: "border-gray-100",
    label: "异常",
  },
  new: {
    icon: Zap,
    deltaColor: "text-gray-900",
    iconBg: "bg-gray-900",
    iconColor: "text-white",
    border: "border-gray-100",
    label: "新发现",
  },
};

export function DeltaInsightCard({
  insight,
  onAction,
}: {
  insight: DeltaInsight;
  onAction: (prompt: string) => void;
}) {
  const config = TREND_CONFIG[insight.trend];
  const Icon = config.icon;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border ${config.border} bg-white p-4 transition-all hover:shadow-sm`}
    >
      {/* 顶部：趋势图标 + 赛道 + 时间 */}
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${config.iconBg}`}
        >
          <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
        </div>
        <span className="text-sm font-medium text-gray-800">
          {insight.track}
        </span>
        <span className="ml-auto text-[11px] text-gray-400">
          {insight.timeWindow}
        </span>
      </div>

      {/* 核心变化文案 */}
      <p className="mb-1.5 text-[13px] leading-relaxed text-gray-700">
        {insight.headline}
      </p>

      {/* 指标 + 变化幅度 */}
      {(insight.metric || insight.delta) && (
        <div className="mb-3 flex items-center gap-3">
          {insight.metric && (
            <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
              {insight.metric}
            </span>
          )}
          {insight.delta && (
            <span className={`text-xs font-medium ${config.deltaColor}`}>
              {insight.delta}
            </span>
          )}
        </div>
      )}

      {/* 补充说明 */}
      <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
        {insight.detail}
      </p>

      {/* 快捷操作按钮 */}
      <button
        type="button"
        onClick={() => onAction(insight.actionPrompt)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow"
      >
        <Eye className="h-3 w-3" />
        {insight.actionLabel}
      </button>
    </div>
  );
}
