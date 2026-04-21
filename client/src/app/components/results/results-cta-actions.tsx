import { useState } from "react";
import {
  ChevronRight,
  Coins,
  Eye,
  FileText,
  Flame,
  Lightbulb,
  Rocket,
  Scissors,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import type { ResultRecord } from "../../store/app-data";
import { getChargedCost } from "../../store/app-data";
import type { TaskIntent } from "../../store/prediction-types";

/* ------------------------------------------------------------------ */
/*  Per-task-intent CTA configuration                                  */
/* ------------------------------------------------------------------ */

interface CtaAction {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  value: string;
  cost: number;
  prompt: string;
  highlight?: boolean;
}

function getCtaActions(result: ResultRecord): CtaAction[] {
  const intent: TaskIntent = result.taskIntent;

  switch (intent) {
    case "opportunity_prediction": {
      const score = result.score ?? 50;
      // 定义所有 CTA 卡片
      const shootPlan: CtaAction = {
        id: "shoot_plan",
        icon: Rocket,
        title: "生成开拍方案",
        description: "基于真实样本，直接给你一版能拍的脚本和分镜",
        value: "省去 2 小时选题策划时间",
        cost: 30,
        prompt: `基于这次爆款预测（${result.query}），帮我生成一版完整的开拍方案，包含：脚本结构、分镜说明、标题建议和发布时间建议。`,
        highlight: false,
      };
      const breakdownLow: CtaAction = {
        id: "breakdown_low",
        icon: Flame,
        title: "拆解低粉爆款",
        description: "看看别人低粉怎么做到高互动的，拆成你能抄的步骤",
        value: "直接获得可复用的爆款结构",
        cost: 20,
        prompt: `基于这次爆款预测（${result.query}），帮我拆解低粉爆款案例，每个说清楚：为什么爆、结构是什么、我能抄什么。`,
        highlight: false,
      };
      const watch7d: CtaAction = {
        id: "watch_7d",
        icon: Eye,
        title: "加入 7 天监控",
        description: "加入智能监控，持续追踪这个赛道，有异动自动通知你",
        value: "不错过最佳入场时机",
        cost: 0,
        prompt: `加入监控`,
        highlight: false,
      };

      // 根据爆款概率动态排序和高亮
      if (score >= 75) {
        // 强烈推荐：开拍方案优先
        shootPlan.highlight = true;
        return [shootPlan, breakdownLow, watch7d];
      } else if (score >= 55) {
        // 值得尝试：拆解爆款优先
        breakdownLow.highlight = true;
        return [breakdownLow, shootPlan, watch7d];
      } else {
        // 潜力股 / 蓄力中：观察优先
        watch7d.highlight = true;
        return [watch7d, breakdownLow, shootPlan];
      }
    }

    case "viral_breakdown":
      return [
        {
          id: "remake_script",
          icon: Sparkles,
          title: "生成翻拍脚本",
          description: "把这条爆款改成你能直接用的版本，保留结构去掉雷点",
          value: "5 分钟拿到可开拍的脚本",
          cost: 30,
          prompt: `基于这次爆款拆解（${result.query}），帮我生成一版翻拍脚本，保留核心爆点结构，替换掉不能直接照搬的部分，给出分镜和口播文案。`,
          highlight: true,
        },
        {
          id: "extract_hooks",
          icon: Scissors,
          title: "提取钩子和金句",
          description: "把这条内容里最值钱的表达直接抄走",
          value: "获得 5-8 个可复用的钩子句式",
          cost: 10,
          prompt: `基于这次爆款拆解（${result.query}），帮我提取所有值得复用的钩子、金句、CTA 模式和过渡句，按使用场景分类。`,
        },
        {
          id: "find_similar",
          icon: Target,
          title: "找 5 个同类爆款",
          description: "扩大参考样本，看这个结构还有谁在用",
          value: "验证爆款结构的可复制性",
          cost: 20,
          prompt: `基于这次爆款拆解（${result.query}），帮我找到 5 个使用类似结构的爆款内容，对比它们的共同点和差异点。`,
        },
      ];

    case "topic_strategy":
      return [
        {
          id: "weekly_plan",
          icon: FileText,
          title: "生成 7 天排期表",
          description: "每天拍什么、什么时候发，全部安排好",
          value: "一周内容规划一键搞定",
          cost: 30,
          prompt: `基于这次选题策略（${result.query}），帮我生成一份 7 天内容排期表，每天包含：选题、脚本要点、最佳发布时间和预期效果。`,
          highlight: true,
        },
        {
          id: "topic_scripts",
          icon: Sparkles,
          title: "每个题目配一版脚本",
          description: "不只是给选题，直接给你能开拍的脚本",
          value: "从选题到开拍零等待",
          cost: 30,
          prompt: `基于这次选题策略（${result.query}），为每个推荐的选题都生成一版完整脚本，包含口播文案、分镜和标题。`,
        },
        {
          id: "priority_validate",
          icon: Zap,
          title: "用数据排优先级",
          description: "告诉你哪个题先做，用真实数据说话",
          value: "避免在低回报选题上浪费时间",
          cost: 10,
          prompt: `基于这次选题策略（${result.query}），帮我用数据验证每个选题的优先级，告诉我哪个最值得先做，为什么。`,
        },
      ];

    case "copy_extraction":
      return [
        {
          id: "rewrite_pack",
          icon: Sparkles,
          title: "生成可改写表达包",
          description: "把提取的表达改成 5 个不同风格的版本，直接能用",
          value: "一次提取，多次复用",
          cost: 30,
          prompt: `基于这次文案提取（${result.query}），把所有提取的钩子和金句改写成 5 个不同风格版本（口语化/专业/幽默/悬念/共情），每个都能直接用。`,
          highlight: true,
        },
        {
          id: "hook_library",
          icon: Lightbulb,
          title: "扩展钩子句式库",
          description: "基于这次提取的模式，生成 20 个同类钩子",
          value: "建立你自己的爆款钩子弹药库",
          cost: 20,
          prompt: `基于这次文案提取（${result.query}），分析钩子的底层模式，然后生成 20 个同类型但不同主题的钩子句式。`,
        },
        {
          id: "cta_patterns",
          icon: Target,
          title: "整理 CTA 转化模式",
          description: "把高转化的行动号召拆成可复用的模板",
          value: "提升每条内容的转化率",
          cost: 10,
          prompt: `基于这次文案提取（${result.query}），整理所有 CTA 模式，按转化目的分类（关注/评论/收藏/购买），给出可直接套用的模板。`,
        },
      ];

    case "account_diagnosis":
      return [
        {
          id: "account_playbook",
          icon: Rocket,
          title: "生成账号打法方案",
          description: "基于诊断结果，给你一份完整的账号运营策略",
          value: "明确接下来 30 天该怎么做",
          cost: 30,
          prompt: `基于这次账号诊断（${result.query}），帮我生成一份完整的账号打法方案，包含：内容方向调整、发布节奏、对标账号和 30 天目标。`,
          highlight: true,
        },
        {
          id: "benchmark_accounts",
          icon: Target,
          title: "找 3 个对标账号",
          description: "看看同赛道做得好的人是怎么运营的",
          value: "找到可参考的成功路径",
          cost: 20,
          prompt: `基于这次账号诊断（${result.query}），帮我找到 3 个值得对标的账号，分析他们的内容策略、增长路径和可借鉴的点。`,
        },
        {
          id: "stop_list",
          icon: Scissors,
          title: "列出该停的内容",
          description: "哪些内容可以优化替换，释放更多精力做高价值内容",
          value: "聚焦核心优势",
          cost: 10,
          prompt: `基于这次账号诊断（${result.query}），帮我列出所有应该停掉的内容类型，说清楚为什么要停，以及停掉后该用什么替代。`,
        },
      ];

    case "trend_watch":
      return [
        {
          id: "trend_action",
          icon: Rocket,
          title: "把趋势变成行动",
          description: "基于这波趋势，直接给你一版能拍的方案",
          value: "从观察到行动只需一步",
          cost: 30,
          prompt: `基于这次趋势观察（${result.query}），帮我把观察到的趋势转化为具体的内容行动方案，包含选题、脚本结构和发布建议。`,
          highlight: true,
        },
        {
          id: "trend_alert",
          icon: Eye,
          title: "设置智能提醒",
          description: "当趋势出现关键变化时，第一时间通知你",
          value: "不错过任何入场窗口",
          cost: 10,
          prompt: `基于这次趋势观察（${result.query}），帮我设置升格阈值和提醒条件，当趋势出现关键变化时自动通知我。`,
        },
        {
          id: "trend_deep",
          icon: Flame,
          title: "深挖趋势背后的机会",
          description: "这波趋势里藏着哪些还没被发现的切入点",
          value: "发现别人看不到的蓝海",
          cost: 20,
          prompt: `基于这次趋势观察（${result.query}），帮我深挖趋势背后还没被充分开发的细分机会，找到差异化的切入点。`,
        },
      ];

    default:
      return [
        {
          id: "default_plan",
          icon: Rocket,
          title: "生成执行方案",
          description: "把这次分析变成你能直接执行的行动计划",
          value: "从分析到行动零等待",
          cost: 30,
          prompt: `基于这次分析（${result.query}），帮我生成一份完整的执行方案。`,
          highlight: true,
        },
        {
          id: "default_deep",
          icon: Lightbulb,
          title: "继续深挖",
          description: "还有哪些没被发现的机会和风险",
          value: "获得更全面的判断依据",
          cost: 20,
          prompt: `基于这次分析（${result.query}），帮我继续深挖还没被充分探索的机会和潜在风险。`,
        },
        {
          id: "default_watch",
          icon: Eye,
          title: "加入持续观察",
          description: "让 AI 帮你盯着，有变化自动通知",
          value: "不错过关键时机",
          cost: 10,
          prompt: `把这次分析（${result.query}）加入持续观察，设定好提醒条件。`,
        },
      ];
  }
}

/* ------------------------------------------------------------------ */
/*  CTA Actions Panel Component                                        */
/* ------------------------------------------------------------------ */

export function CtaActionsPanel({
  result,
  credits,
  modelId,
  onConsume,
}: {
  result: ResultRecord;
  credits: number;
  modelId: "doubao" | "gpt54" | "claude46";
  onConsume: (cost: number, label: string) => { ok: boolean; shortfall?: number };
}) {
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const actions = getCtaActions(result);

  const handleAction = (action: CtaAction) => {
    setActivatingId(action.id);
    const chargedCost = getChargedCost(action.cost, modelId);
    const consumeResult = onConsume(chargedCost, action.prompt);
    if (!consumeResult.ok) {
      setActivatingId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm sm:px-7">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">下一步，你想要什么？</div>
          <div className="mt-1 text-xs text-gray-400">
            点一下就给你，不用自己想该问什么
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Coins className="h-3 w-3" />
          余额 {credits}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const chargedCost = getChargedCost(action.cost, modelId);
          const isActivating = activatingId === action.id;

          return (
            <button
              key={action.id}
              type="button"
              disabled={isActivating}
              onClick={() => handleAction(action)}
              className={`group relative flex flex-col rounded-2xl border px-4 pb-4 pt-4 text-left transition-all duration-200 ${
                action.highlight
                  ? "border-gray-900 bg-gray-900 text-white hover:bg-gray-800"
                  : "border-gray-100 bg-gray-50 text-gray-900 hover:border-gray-200 hover:bg-gray-100"
              } ${isActivating ? "opacity-60" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    action.highlight
                      ? "bg-white/15"
                      : "bg-white"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      action.highlight ? "text-white" : "text-gray-700"
                    }`}
                  />
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    action.highlight
                      ? "bg-white/15 text-white/80"
                      : "bg-white text-gray-400"
                  }`}
                >
                  {chargedCost} 积分
                </span>
              </div>

              <div
                className={`text-sm font-medium ${
                  action.highlight ? "text-white" : "text-gray-900"
                }`}
              >
                {action.title}
              </div>

              <p
                className={`mt-1.5 text-xs leading-relaxed ${
                  action.highlight ? "text-white/70" : "text-gray-500"
                }`}
              >
                {action.description}
              </p>

              <div
                className={`mt-3 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${
                  action.highlight
                    ? "bg-white/10 text-white/60"
                    : "bg-white text-gray-400"
                }`}
              >
                <Zap className="h-3 w-3" />
                {action.value}
              </div>

              <div
                className={`mt-3 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-colors ${
                  action.highlight
                    ? "bg-white text-gray-900 group-hover:bg-gray-100"
                    : "bg-gray-900 text-white group-hover:bg-gray-700"
                }`}
              >
                {isActivating ? "处理中..." : "立即获取"}
                {!isActivating && <ChevronRight className="h-3.5 w-3.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
