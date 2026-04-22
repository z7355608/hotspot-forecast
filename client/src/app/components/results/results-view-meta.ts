import { TASK_INTENT_META } from "../../store/agent-runtime";
import type { ResultRecord } from "../../store/app-data";

export const WINDOW_META = {
  strong_now: {
    label: "强烈推荐",
    tone: "bg-emerald-50 text-emerald-700",
    body: "多维度数据信号一致，爆发指数较高，建议优先行动。",
  },
  validate_first: {
    label: "值得一试",
    tone: "bg-amber-50 text-amber-700",
    body: "有明确爆款信号，建议小成本快速验证。",
  },
  observe: {
    label: "持续关注",
    tone: "bg-sky-50 text-sky-700",
    body: "趋势正在形成，建议先储备素材，等信号更强时出击。",
  },
  avoid: {
    label: "暂不建议",
    tone: "bg-gray-100 text-gray-700",
    body: "当前信号不足，建议观望或换方向。",
  },
} as const;

export const OPPORTUNITY_META = {
  search_window: "搜索需求窗口",
  anomaly_window: "爆款信号窗口",
  structure_window: "结构迁移窗口",
  fit_window: "账号适配窗口",
  false_heat: "短期热度窗口",
} as const;

export const WHY_NOW_TONE = {
  positive: "border-emerald-100 bg-emerald-50/60",
  neutral: "border-gray-100 bg-gray-50",
  warning: "border-amber-100 bg-amber-50/70",
} as const;

export const INPUT_FOCUS_META = {
  prompt: {
    label: "爆款预测",
    body: "输入关键词，预测当前最值得拍的方向和爆发指数。",
  },
  content_url: {
    label: "竞品分析",
    body: "粘贴竞品链接，分析哪些内容结构已被验证可复用。",
  },
  account: {
    label: "账号诊断",
    body: "粘贴你的账号链接，找到最适合你的可拍方向。",
  },
  uploaded_asset: {
    label: "素材分析",
    body: "基于你的素材，找到最佳发布策略和内容方向。",
  },
} as const;

export const TASK_CONFIDENCE_META = {
  high: "高匹配",
  medium: "中匹配",
  low: "低匹配",
} as const;

export const ENTRY_SOURCE_META = {
  manual: "首页输入",
  example: "示例任务",
  skill: "技能入口",
} as const;

const DEFAULT_QUICK_ACTIONS = [
  { label: "把这次结果收成可执行步骤", cost: 10 },
  { label: "给我一版完整的执行方案", cost: 10 },
  { label: "帮我分析这个赛道的竞争格局", cost: 10 },
] as const;

export function getDeepDiveConfig(result: ResultRecord) {
  switch (result.taskIntent) {
    case "trend_watch":
      return {
        title: "继续扩展这次观察任务",
        description: "可继续补观察清单、提醒条件、复查节奏或关键指标。",
        placeholder:
          "把这波趋势的观察清单写清楚\n告诉我什么变化值得重点关注\n帮我设置关键指标的监控阈值",
        quickActions: [
          { label: "补一版观察清单", cost: 10 },
          { label: "设置关键监控指标", cost: 10 },
          { label: "给我一版提醒文案", cost: 10 },
        ],
      };
    case "viral_breakdown":
      return {
        title: "继续展开这次拆解结果",
        description: "可继续补可抄点、迁移步骤、脚本骨架和实操指南。",
        placeholder:
          "把这条内容拆成可抄点\n给我一版可以直接拍的结构\n帮我标出最值得复用的部分",
        quickActions: [
          { label: "拆成实操步骤", cost: 10 },
          { label: "给我一版可拍结构", cost: 30 },
          { label: "标出最值得复用的部分", cost: 10 },
        ],
      };
    case "topic_strategy":
      return {
        title: "继续深挖选题策略",
        description: "可以细化方向、生成可拍脚本、排期表或重新验证。",
        placeholder:
          "把最优方向拆成 3 条可以直接拍的脚本\n帮我生成一份 7 天内容排期表\n换个角度重新验证这个方向",
        quickActions: [
          { label: "把最优方向拆成脚本", cost: 20 },
          { label: "生成 7 天排期表", cost: 30 },
          { label: "换角度重新验证", cost: 10 },
        ],
      };
    case "copy_extraction":
      return {
        title: "继续提取表达资产",
        description: "可继续补钩子、过渡句、CTA 模式和可改写表达。",
        placeholder:
          "提取这次内容里的钩子和 CTA\n给我一组可直接改写的表达\n把结构过渡句整理出来",
        quickActions: [
          { label: "提取 3 个钩子", cost: 10 },
          { label: "整理 CTA 模式", cost: 10 },
          { label: "生成可改写表达包", cost: 30 },
        ],
      };
    case "account_diagnosis":
      return {
        title: "继续深化账号诊断",
        description: "可继续补账号打法、对标账号、内容优化方向和增长策略。",
        placeholder:
          "把这个号的优势方向讲清楚\n给我一版对标账号打法\n帮我找到最快的增长路径",
        quickActions: [
          { label: "看账号打法", cost: 10 },
          { label: "给我对标账号", cost: 10 },
          { label: "找到增长突破口", cost: 10 },
        ],
      };
    case "opportunity_prediction":
      return {
        title: "继续深挖这次预测",
        description: "基于真实样本数据，继续展开具体问题。",
        placeholder: "给我这次预测的开拍方案",
        quickActions: [
          { label: "给我这次预测的开拍方案", cost: 10 },
          { label: "明确效果评估标准和升级信号", cost: 10 },
          { label: "帮我分析这个赛道的竞争格局", cost: 10 },
        ],
      };
    default:
      return {
        title: "继续深挖",
        description: "基于这次分析结果，继续展开具体问题。",
        placeholder:
          "把这次结果收成可执行步骤\n给我一版完整的执行方案\n帮我分析竞争格局",
        quickActions: DEFAULT_QUICK_ACTIONS,
      };
  }
}

export function buildNextTaskPrompt(
  result: ResultRecord,
  nextTask: ResultRecord["recommendedNextTasks"][number],
) {
  return `基于这次${TASK_INTENT_META[result.taskIntent].label}，继续帮我做「${nextTask.title}」。要求：${nextTask.reason}`;
}

export function buildFollowUpActions(result: ResultRecord) {
  if (result.recommendedNextTasks.length > 0) {
    return result.recommendedNextTasks.slice(0, 2).map((item) => ({
      label: item.actionLabel,
      prompt: buildNextTaskPrompt(result, item),
    }));
  }

  return getDeepDiveConfig(result).quickActions.slice(0, 2).map((item) => ({
    label: item.label,
    prompt: item.label,
  }));
}

export function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(iso: string | undefined) {
  if (!iso) return "未记录";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getWatchStatusLabel(status: string | undefined) {
  if (status === "completed") return "监控中";
  if (status === "running") return "复查中";
  if (status === "failed") return "复查失败";
  if (status === "pending") return "待复查";
  return "未监控";
}

export function getExecutionStatusLabel(status: string | undefined) {
  if (status === "success") return "本次复查成功";
  if (status === "partial_success") return "本次复查部分成功";
  if (status === "failed") return "本次复查失败";
  return "还没有复查记录";
}

export function resolvePrimaryActionHref(result: ResultRecord) {
  if (result.bestActionNow.type === "low_follower_validation") {
    return "/low-follower-opportunities";
  }

  return `/results/${result.id}?focus=execute`;
}
