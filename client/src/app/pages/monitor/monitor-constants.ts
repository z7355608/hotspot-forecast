/**
 * 监控页面共享常量和工具函数
 * 从 MonitorPage.tsx 提取
 */
import {
  Activity,
  BarChart3,
  Calendar,
  Eye,
  FileText,
  Hash,
  Link2,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { WatchTaskSummary } from "../../lib/result-artifacts-api";
import type {
  PredictionWatchScheduleTier,
  PredictionWatchTaskType,
} from "../../store/prediction-types";

export type { PredictionWatchScheduleTier, PredictionWatchTaskType };

export const TASK_TYPE_META: Record<
  string,
  { label: string; shortLabel: string; color: string; bg: string; icon: typeof Eye; description: string }
> = {
  topic_watch: {
    label: "赛道监控",
    shortLabel: "赛道",
    color: "text-purple-600",
    bg: "bg-purple-50",
    icon: TrendingUp,
    description: "追踪赛道热度趋势、爆款出现频率和竞争格局变化",
  },
  account_watch: {
    label: "账号监控",
    shortLabel: "账号",
    color: "text-blue-600",
    bg: "bg-blue-50",
    icon: Users,
    description: "追踪竞品/对标账号的粉丝变化、发布频率和爆款动态",
  },
  content_watch: {
    label: "作品监控",
    shortLabel: "作品",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    icon: FileText,
    description: "追踪单条内容的数据走势、互动变化和流量来源",
  },
  validation_watch: {
    label: "验证监控",
    shortLabel: "验证",
    color: "text-amber-600",
    bg: "bg-amber-50",
    icon: RefreshCw,
    description: "自动验证之前的预测结论是否仍然成立",
  },
};

export const SCHEDULE_OPTIONS: {
  value: PredictionWatchScheduleTier;
  label: string;
  desc: string;
  costPerRun: number;
  runsPerMonth: number;
}[] = [
  { value: "daily", label: "每天", desc: "高频追踪，适合热点赛道", costPerRun: 15, runsPerMonth: 30 },
  { value: "every_72h", label: "每 3 天", desc: "常规监控，性价比最高", costPerRun: 15, runsPerMonth: 10 },
  { value: "weekly", label: "每周", desc: "低频观察，节省积分", costPerRun: 15, runsPerMonth: 4 },
];

export const STATUS_META: Record<
  string,
  { label: string; dot: string; bg: string }
> = {
  pending: { label: "等待中", dot: "bg-yellow-400", bg: "bg-yellow-50 text-yellow-700" },
  running: { label: "运行中", dot: "bg-green-400 animate-pulse", bg: "bg-green-50 text-green-700" },
  completed: { label: "已完成", dot: "bg-green-500", bg: "bg-green-50 text-green-700" },
  failed: { label: "已暂停", dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600" },
};

export const PLATFORM_OPTIONS = [
  { value: "douyin" as const, label: "抖音" },
  { value: "xiaohongshu" as const, label: "小红书" },
  { value: "kuaishou" as const, label: "快手" },
];

export const PLATFORM_LABEL: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  kuaishou: "快手",
};

/** 各监控类型可选的监控维度 */
export const DIMENSION_PRESETS: Record<string, { label: string; icon: typeof Eye }[]> = {
  topic_watch: [
    { label: "赛道热度趋势", icon: TrendingUp },
    { label: "爆款出现频率", icon: Zap },
    { label: "新入场创作者", icon: Users },
    { label: "话题搜索热度", icon: Search },
    { label: "竞争格局变化", icon: BarChart3 },
    { label: "低粉爆款异常", icon: Activity },
  ],
  account_watch: [
    { label: "粉丝增长趋势", icon: Users },
    { label: "发布频率变化", icon: Calendar },
    { label: "互动率变化", icon: Activity },
    { label: "爆款率追踪", icon: Zap },
    { label: "内容方向变化", icon: Hash },
    { label: "新爆款出现", icon: TrendingUp },
  ],
  content_watch: [
    { label: "播放量/阅读量趋势", icon: Eye },
    { label: "互动数据变化", icon: Activity },
    { label: "评论区舆情", icon: FileText },
    { label: "分享传播链路", icon: Link2 },
    { label: "流量来源分布", icon: BarChart3 },
    { label: "数据异常增长", icon: TrendingUp },
  ],
  validation_watch: [
    { label: "预测结论验证", icon: Target },
    { label: "趋势方向校验", icon: TrendingUp },
    { label: "竞争格局复查", icon: Users },
  ],
};

export function formatRelativeTime(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function estimateMonthlyCost(task: WatchTaskSummary) {
  const schedule = SCHEDULE_OPTIONS.find((s) => s.value === task.scheduleTier);
  if (!schedule) return 0;
  return schedule.costPerRun * schedule.runsPerMonth;
}
