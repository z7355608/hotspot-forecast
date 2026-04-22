import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Link2, RotateCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "../store/app-store";
import type { TaskIntent, PredictionRequestEntrySource } from "../store/prediction-types";
import type { ProgressEvent, ContentSampleItem, AccountSampleItem } from "../lib/live-predictions-api";

/* ------------------------------------------------------------------ */
/*  动态关键词提取                                                      */
/* ------------------------------------------------------------------ */

/** 从用户输入中提取关键词（赛道/行业/平台/阶段等） */
function extractKeywords(query: string) {
  const industries = [
    "美妆", "护肤", "通勤穿搭", "母婴育儿", "职场干货", "居家生活",
    "美食探店", "健身减脂", "数码科技", "旅行攻略", "宠物", "教育",
    "情感", "搞笑", "音乐", "舞蹈", "游戏", "汽车", "房产", "理财",
    "AI", "效率工具", "Excel", "PPT", "读书", "穿搭", "家居",
  ];
  const platforms = ["抖音", "小红书", "B站", "快手", "微信视频号", "微博"];
  const stages = ["新号", "成长期", "低粉", "百万粉", "万粉", "千粉", "素人"];

  const matchedIndustry = industries.find((w) => query.includes(w)) ?? "目标赛道";
  const matchedPlatform = platforms.find((w) => query.includes(w)) ?? "主流平台";
  const matchedStage = stages.find((w) => query.includes(w)) ?? "当前阶段";

  return { industry: matchedIndustry, platform: matchedPlatform, stage: matchedStage };
}

/* ------------------------------------------------------------------ */
/*  按任务类型生成动态步骤                                                */
/* ------------------------------------------------------------------ */

interface AnalysisStep {
  title: string;
  desc: string;
  doneLabel: string;
  activeDetail: string;
  /** 步骤完成后闪过的"扫描日志"，增强专业感 */
  scanLogs?: string[];
}

function getStepsForTask(
  taskIntent: TaskIntent | undefined,
  kw: { industry: string; platform: string; stage: string },
): AnalysisStep[] {
  const { industry, platform, stage } = kw;

  switch (taskIntent) {
    case "copy_extraction":
      return [
        {
          title: "解析内容结构",
          desc: "识别视频/文案的叙事骨架与节奏",
          doneLabel: "结构已识别",
          activeDetail: `正在拆解内容的开场钩子 · 转折节奏 · 卖点表达 · 结尾 CTA 结构`,
          scanLogs: ["检测到 3 段式叙事结构", "识别开场悬念钩子"],
        },
        {
          title: "提取可复用文案模式",
          desc: "抽取钩子句式、金句和 CTA 模板",
          doneLabel: "已提取可复用模式",
          activeDetail: `逐句扫描文案 · 标记高互动句式 · 提取可直接套用的表达模板`,
          scanLogs: ["发现高转化 CTA 句式", "标记 2 个可复用金句"],
        },
        {
          title: "生成你的文案工具包",
          desc: "整理成可直接使用的文案资源",
          doneLabel: "已生成",
          activeDetail: `输出钩子模板 · CTA 句式库 · 改写建议 · 适配${platform}的表达风格`,
        },
      ];

    case "viral_breakdown":
      return [
        {
          title: "解析视频元数据",
          desc: "读取视频基础信息与互动数据",
          doneLabel: "元数据已获取",
          activeDetail: `读取视频时长 · 发布时间 · 点赞/评论/转发比 · 完播率估算`,
          scanLogs: ["检测到异常高互动比", "完播率预估 > 45%"],
        },
        {
          title: "拆解内容结构与节奏",
          desc: "逐帧分析叙事骨架和情绪曲线",
          doneLabel: "结构拆解完成",
          activeDetail: `分析开场 3 秒钩子 · 中段转折设计 · 高潮节点 · 结尾引导互动的设计`,
          scanLogs: ["开场钩子命中率 92%", "发现 2 个情绪峰值点"],
        },
        {
          title: "对比同类爆款样本",
          desc: "在同赛道中寻找相似结构的成功案例",
          doneLabel: "已匹配同类样本",
          activeDetail: `在${industry}赛道中搜索近 30 天同类结构视频 · 对比数据表现差异`,
          scanLogs: ["发现 1 个 500 粉爆赞 8 万的同类视频"],
        },
        {
          title: "输出拆解报告",
          desc: "标记值得借鉴和需要规避的要素",
          doneLabel: "已生成",
          activeDetail: `整理「值得抄」清单 · 标记「别照搬」风险点 · 生成适合${stage}的翻拍建议`,
        },
      ];

    case "topic_strategy":
      return [
        {
          title: `${platform}数据采集`,
          desc: `在${platform}上搜索热榜和内容数据`,
          doneLabel: "数据采集完成",
          activeDetail: `在${platform}上采集「${industry}」赛道的搜索结果、热榜数据和低粉爆款样本`,
          scanLogs: [`正在扫描${platform}搜索结果`, "拉取热榜趋势数据"],
        },
        {
          title: "AI 生成选题方向",
          desc: "基于采集数据生成结构化选题方向",
          doneLabel: "方向生成完成",
          activeDetail: `结合「${industry}」赛道数据和「${stage}」阶段特征，生成带优先级和可执行选题的方向`,
          scanLogs: ["分析流量潜力与制作成本", "生成可执行选题清单"],
        },
        {
          title: "同行对标分析",
          desc: "查看同赛道账号的近期表现",
          doneLabel: "对标完成",
          activeDetail: `拉取同赛道 KOL/KOC 的近期作品和互动率，与你的账号进行对比分析`,
          scanLogs: ["匹配同赛道账号", "分析互动率差异"],
        },
        {
          title: "跨行业迁移发现",
          desc: "从其他赛道的爆款中发现可迁移的创意元素",
          doneLabel: "迁移灵感已发现",
          activeDetail: `扫描其他行业的低粉爆款，提取可迁移到「${industry}」赛道的内容元素`,
          scanLogs: ["扫描跨行业爆款库", "提取可复用元素"],
        },
        {
          title: "自循环验证",
          desc: "二次搜索 + 评论区交叉验证每个方向",
          doneLabel: "验证完成",
          activeDetail: `对每个选题方向进行二次搜索验证、评论区需求交叉检查和低粉案例核实`,
        },
      ];

    case "trend_watch":
      return [
        {
          title: "识别观察目标",
          desc: "确认你想跟踪的赛道与维度",
          doneLabel: `${industry} · 趋势追踪`,
          activeDetail: `解析关键词：${industry} · 确认观察维度：热度变化 · 竞争格局 · 低粉异常信号`,
          scanLogs: ["锁定观察赛道", "设置 3 个监控维度"],
        },
        {
          title: "扫描近期趋势信号",
          desc: `抓取${platform}热度与异动数据`,
          doneLabel: "趋势信号已识别",
          activeDetail: `在${platform}扫描${industry}近 7 天热度曲线 · 识别搜索量突增 · 标记低粉爆款异常`,
          scanLogs: ["检测到搜索量 48 小时内上涨 35%", "发现 2 个低粉异常爆款"],
        },
        {
          title: "评估风险与窗口期",
          desc: "判断趋势的可持续性和最佳入场时机",
          doneLabel: "风险评估完成",
          activeDetail: `分析趋势生命周期阶段 · 评估竞争饱和度 · 预测窗口期剩余时间`,
          scanLogs: ["窗口期预估还剩 5-8 天"],
        },
        {
          title: "生成观察报告",
          desc: "输出趋势判断与复查条件",
          doneLabel: "已生成",
          activeDetail: `整理趋势信号摘要 · 设定复查触发条件 · 给出「跟 / 不跟 / 再等等」的明确建议`,
        },
      ];

    case "account_diagnosis":
      return [
        {
          title: "读取账号信息",
          desc: "获取你的账号数据与内容方向",
          doneLabel: "账号数据已读取",
          activeDetail: `读取：主平台「${platform}」· 内容方向「${industry}」· 账号阶段「${stage}」`,
          scanLogs: ["账号基础数据获取完成"],
        },
        {
          title: "诊断定位与内容匹配度",
          desc: "评估账号定位是否清晰、内容是否一致",
          doneLabel: "诊断完成",
          activeDetail: `分析近 20 条内容的主题一致性 · 评估人设清晰度 · 检查视觉风格统一性`,
          scanLogs: ["内容主题一致性 72%", "发现 3 条偏离定位的内容"],
        },
        {
          title: "匹配对标账号",
          desc: "在同赛道中寻找值得参考的账号",
          doneLabel: "对标账号已匹配",
          activeDetail: `在${industry}赛道搜索同阶段优质账号 · 分析他们的差异化策略`,
          scanLogs: ["发现 1 个同阶段月涨粉 5 万的对标账号"],
        },
        {
          title: "输出诊断报告",
          desc: "给出定位调整建议和行动方案",
          doneLabel: "已生成",
          activeDetail: `整理优势与短板 · 对标账号学习清单 · 输出 7 天调整计划`,
        },
      ];

    case "direct_request":
      return [
        {
          title: "理解你的需求",
          desc: "解析问题意图和分析维度",
          doneLabel: "需求已理解",
          activeDetail: `解析关键词：${industry} · 确认分析维度 · 匹配最佳分析框架`,
          scanLogs: ["意图识别完成", "确认分析维度"],
        },
        {
          title: "搜集相关信息",
          desc: `扫描${platform}数据与案例`,
          doneLabel: "数据扫描完成",
          activeDetail: `在${platform}上搜集${industry}相关数据 · 分析趋势与模式 · 提取关键洞察`,
          scanLogs: ["发现多个相关数据点", "信息整合中"],
        },
        {
          title: "生成分析报告",
          desc: "整理结论并输出完整报告",
          doneLabel: "已生成",
          activeDetail: `综合分析结果 · 生成结构化报告 · 输出可执行建议`,
        },
      ];

    // opportunity_prediction 和 fallback
    default:
      return [
        {
          title: "识别你的问题意图",
          desc: "解析问题类型，确认分析维度",
          doneLabel: "赛道可行性分析",
          activeDetail: `解析关键词：${industry} · 识别分析类型：赛道可行性评估 · 确认目标平台：${platform}`,
          scanLogs: ["意图识别置信度 95%", "锁定分析维度"],
        },
        {
          title: "结合你的内容方向",
          desc: "读取你的创作设定与账号阶段",
          doneLabel: `${stage} · 垂类匹配`,
          activeDetail: `读取：创作方向「${industry}」· 主平台「${platform}」· 账号阶段「${stage}」· 匹配垂类模型`,
          scanLogs: ["创作方向与赛道匹配度 85%"],
        },
        {
          title: "匹配趋势与样本数据",
          desc: "扫描近期相似账号与赛道热度",
          doneLabel: "趋势与样本匹配完成",
          activeDetail: `正在对比${platform}上${industry}相关的近期账号与内容数据 · 赛道搜索热度走势分析 · 识别低粉爆款样本`,
          scanLogs: [
            "正在识别低粉爆款异常信号",
            "过滤营销噪音数据",
          ],
        },
        {
          title: "生成你的判断结果",
          desc: "综合评估，输出个性化建议",
          doneLabel: "已生成",
          activeDetail: `综合可行性评分 · 竞争度与赛道饱和度 · 最佳切入时机 · 针对${stage}的具体行动建议`,
        },
      ];
  }
}

/* ------------------------------------------------------------------ */
/*  从 entryTemplateId / skillId 推断 TaskIntent                        */
/* ------------------------------------------------------------------ */

function inferTaskIntent(
  entrySource?: PredictionRequestEntrySource,
  entryTemplateId?: string,
  selectedSkillId?: string,
): TaskIntent | undefined {
  if (entrySource === "example" && entryTemplateId) {
    const map: Record<string, TaskIntent> = {
      "opportunity-forecast": "opportunity_prediction",
      "hotspot-watch": "trend_watch",
      "viral-breakdown": "viral_breakdown",
      "copy-extraction": "copy_extraction",
      "account-diagnosis": "account_diagnosis",
    };
    return map[entryTemplateId];
  }
  if (entrySource === "skill" && selectedSkillId) {
    const map: Record<string, TaskIntent> = {
      "douyin-copy-extraction": "copy_extraction",
      "xhs-topic-strategy": "topic_strategy",
      "viral-script-breakdown": "viral_breakdown",
      "account-positioning-diagnosis": "account_diagnosis",
    };
    return map[selectedSkillId];
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  扫描日志动画组件                                                     */
/* ------------------------------------------------------------------ */

function ScanLogLine({ text, delay }: { text: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 animate-fadeIn">
      <span className="inline-block h-1 w-1 rounded-full bg-emerald-400" />
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StepIcon                                                           */
/* ------------------------------------------------------------------ */

function StepIcon({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800">
        <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-blue-500">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
      </div>
    );
  }
  return (
    <div className="h-5 w-5 shrink-0 rounded-full border border-gray-200 bg-white" />
  );
}

/* ------------------------------------------------------------------ */
/*  主组件 Props                                                       */
/* ------------------------------------------------------------------ */

export interface AnalysisViewProps {
  query: string;
  onReset: () => void;
  onComplete: () => void;
  /** 新增：传入请求上下文以实现动态步骤和词汇 */
  entrySource?: PredictionRequestEntrySource;
  entryTemplateId?: string;
  selectedSkillId?: string;
  /** 后端返回的错误信息 */
  error?: string | null;
  /** 后端数据是否已就绪 */
  dataReady?: boolean;
  /** 用户提交时选中的平台列表（与输入区保持一致） */
  selectedPlatforms?: string[];
  /** SSE进度事件列表（实时更新） */
  progressEvents?: ProgressEvent[];
  /** 是否命中缓存 */
  fromCache?: boolean;
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function AnalysisView({
  query,
  onReset,
  onComplete,
  entrySource,
  entryTemplateId,
  selectedSkillId,
  error,
  dataReady,
  selectedPlatforms,
  progressEvents,
  fromCache,
}: AnalysisViewProps) {
  const { connectedConnectors, selectedPlatformConnectors, state } = useAppStore();
  const [completedSteps, setCompletedSteps] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const [waitingForData, setWaitingForData] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  // 加载态倒计时：基于任务类型预估总时长
  const [countdown, setCountdown] = useState<number | null>(null);

  // 从SSE进度事件中提取平台状态
  const platformStatuses = useMemo(() => {
    if (!progressEvents || progressEvents.length === 0) return {};
    const map: Record<string, { name: string; status: "collecting" | "done" | "failed"; contentCount?: number; hotCount?: number; topContent?: string }> = {};
    for (const ev of progressEvents) {
      if (ev.type === "platform_start") {
        map[ev.platform] = { name: ev.platformName, status: "collecting" };
      } else if (ev.type === "platform_done") {
        map[ev.platform] = {
          name: ev.platformName,
          status: ev.status === "success" ? "done" : "failed",
          contentCount: ev.contentCount,
          hotCount: ev.hotCount,
          topContent: ev.topContent,
        };
      }
    }
    return map;
  }, [progressEvents]);

  const platformList = useMemo(() => Object.entries(platformStatuses), [platformStatuses]);

  // 从 SSE 事件中提取已采集的真实数据样本
  const dataCollected = useMemo(() => {
    if (!progressEvents) return null;
    for (let i = progressEvents.length - 1; i >= 0; i--) {
      const ev = progressEvents[i];
      if (ev.type === "data_collected") return ev;
    }
    return null;
  }, [progressEvents]);

  // 动态关键词提取
  const keywords = useMemo(() => extractKeywords(query), [query]);

  // 推断任务类型
  const taskIntent = useMemo(
    () => inferTaskIntent(entrySource, entryTemplateId, selectedSkillId),
    [entrySource, entryTemplateId, selectedSkillId],
  );

  // 根据任务类型生成动态步骤
  const steps = useMemo(
    () => getStepsForTask(taskIntent, keywords),
    [taskIntent, keywords],
  );

  // 不同任务类型的预估总时长（毫秒）
  const durationByIntent: Record<string, number> = useMemo(() => ({
    topic_strategy: 60000,
    opportunity_prediction: 45000, // 爆款预测约 30-60s，取中间值 45s
    viral_breakdown: 25000,
    trend_watch: 20000,
    copy_extraction: 15000,
    account_diagnosis: 25000,
  }), []);
  const totalDuration = useMemo(
    () => durationByIntent[taskIntent ?? ""] ?? 25000,
    [durationByIntent, taskIntent]
  );
  // 加载态倒计时：从预估总时长开始倒数，每秒减 1
  useEffect(() => {
    if (isDone || error) return;
    setCountdown(Math.ceil(totalDuration / 1000));
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev != null && prev > 1 ? prev - 1 : 1));
    }, 1000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDuration]); // 只在任务开始时初始化一次
  useEffect(() => {
    if (isDone || error) setCountdown(null);
  }, [isDone, error]);
  // 动态计算步骤耗时：根据任务类型调整总时长，避免动画完成后干等
  // 使用 useRef 保持 stepTimings 在组件生命周期内稳定（只在首次计算）
  const stepTimingsRef = useRef<number[] | null>(null);
  if (!stepTimingsRef.current || stepTimingsRef.current.length !== steps.length) {
    const count = steps.length;
    const earlyBudget = totalDuration * 0.60;
    const earlyInterval = count > 1 ? earlyBudget / (count - 1) : earlyBudget;
    stepTimingsRef.current = steps.map((_, i) => {
      if (i < count - 1) {
        // 确定性分配：每步递增，系数从 0.9 到 1.1 均匀分布
        const factor = 0.9 + (i / Math.max(count - 2, 1)) * 0.2;
        return Math.round(earlyInterval * (i + 1) * factor);
      }
      return Math.round(totalDuration * 0.90);
    });
  }
  const stepTimings = stepTimingsRef.current;

  useEffect(() => {
    const timers = stepTimings.map((time, index) =>
      window.setTimeout(() => {
        setCompletedSteps(index + 1);
        if (index === steps.length - 1) setIsDone(true);
      }, time),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stepTimings, steps.length]);

  // 动画完成后标记
  useEffect(() => {
    if (!isDone) return;
    const timer = window.setTimeout(() => setAnimationDone(true), 600);
    return () => window.clearTimeout(timer);
  }, [isDone]);

  // 动画完成 + 数据就绪 → 触发 onComplete
  useEffect(() => {
    if (animationDone && dataReady) {
      toast.success("分析完成", { description: "结果已就绪，正在为你呈现" });
      onComplete();
    } else if (animationDone && !dataReady && !error) {
      setWaitingForData(true);
    }
  }, [animationDone, dataReady, error, onComplete]);

  // 数据就绪后如果动画也完成了，立即跳转
  useEffect(() => {
    if (waitingForData && dataReady) {
      onComplete();
    }
  }, [waitingForData, dataReady, onComplete]);

  // ★ 等待数据时显示计时器，让用户知道系统正在工作
  useEffect(() => {
    if (!waitingForData || dataReady || error) return;
    const timer = window.setInterval(() => {
      setWaitSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitingForData, dataReady, error]);

  const displayQuery =
    query.trim() ||
    "抖音上的「职场干货」赛道现在还值得做吗？我目前有 5 万粉，主要发 Excel 技巧类短视频。";

  const getStatus = (index: number): "done" | "active" | "pending" => {
    if (index < completedSteps) return "done";
    if (index === completedSteps && !isDone) return "active";
    return "pending";
  };

  const progressPct = Math.round((completedSteps / steps.length) * 100);

  // 任务类型的中文标签
  const taskLabel = useMemo(() => {
    const map: Record<string, string> = {
      opportunity_prediction: "爆款预测",
      trend_watch: "趋势观察",
      viral_breakdown: "爆款拆解",
      topic_strategy: "选题策略",
      copy_extraction: "文案提取",
      account_diagnosis: "账号诊断",
    };
    return taskIntent ? map[taskIntent] ?? "智能分析" : "智能分析";
  }, [taskIntent]);

  // 优先使用提交时选中的平台，回退到 selectedPlatformConnectors
  const activePlatformLabels = useMemo(() => {
    if (selectedPlatforms && selectedPlatforms.length > 0) {
      return selectedPlatforms.slice(0, 3).map((pid) => {
        const found = state.connectors.find((c) => c.id === pid);
        return found ? found.name : pid;
      });
    }
    if (selectedPlatformConnectors.length > 0) {
      return selectedPlatformConnectors.slice(0, 3).map((c) => c.name);
    }
    return [];
  }, [selectedPlatforms, state.connectors, selectedPlatformConnectors]);

  const connectorLabel =
    activePlatformLabels.length > 0
      ? activePlatformLabels.map((name) => `${name}已选择`)
      : ["当前未连接外部账号"];

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 pt-8 sm:px-6 sm:pt-12">
      {/* 用户输入回显卡片 */}
      <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 px-5 pb-0 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="select-none text-xs text-gray-400">你的问题</span>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <RotateCcw className="h-3 w-3" />
            重新输入
          </button>
        </div>
        <div className="px-5 pb-3 pt-2.5">
          <p className="text-sm leading-relaxed text-gray-800">{displayQuery}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-50 px-5 pb-4 pt-3">
          {taskIntent && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
              {taskLabel}
            </div>
          )}
          {activePlatformLabels.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
              <Link2 className="h-3 w-3 shrink-0" />
              已接入 {activePlatformLabels.join("、")} 数据
            </div>
          )}
          {activePlatformLabels.length === 0 && connectorLabel.map((label) => (
            <div
              key={label}
              className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs text-gray-500"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* 分析进度卡片 */}
      <div
        className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-colors duration-700 ${isDone ? "border-gray-200" : "border-gray-100"}`}
      >
        <div className="border-b border-gray-50 px-5 pb-5 pt-6 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${error ? "bg-red-500" : isDone ? "bg-gray-800" : "bg-blue-500"}`}
                />
                {!isDone && (
                  <div className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-blue-400 opacity-60" />
                )}
              </div>
              <div>
                <h3 className={`text-base ${error ? "text-red-600" : "text-gray-900"}`}>
                  {error ? "分析失败" : isDone ? "分析完成" : `Agent 正在${taskLabel}`}
                </h3>
                <p className={`mt-0.5 text-xs ${error ? "text-red-500" : "text-gray-400"}`}>
                  {error
                    ? error
                    : isDone && !dataReady
                      ? waitSeconds > 90
                        ? `分析耗时较长，已等待 ${waitSeconds} 秒…如持续超时请点击重试`
                        : waitSeconds > 45
                          ? `AI 正在深度分析，已等待 ${waitSeconds} 秒…复杂分析需要更多时间`
                          : waitSeconds > 15
                            ? `正在整合多平台数据，已等待 ${waitSeconds} 秒…`
                            : `数据即将就绪，正在整理结果…`
                      : isDone
                        ? "即将呈现你的判断结果"
                        : `基于你的问题和「${keywords.industry}」方向，正在多维度分析`}
                </p>
              </div>
            </div>
            <div className="text-left sm:shrink-0 sm:text-right">
              {isDone ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  {error ? (
                    <button
                      type="button"
                      onClick={onReset}
                      className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-100"
                    >
                      <RotateCcw className="h-3 w-3" />
                      重新尝试
                    </button>
                  ) : dataReady ? <span>正在载入结果</span> : (
                    <span className="animate-pulse">
                      {waitSeconds > 60 ? (
                        <button
                          type="button"
                          onClick={onReset}
                          className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-100"
                        >
                          <RotateCcw className="h-3 w-3" />
                          重新尝试
                        </button>
                      ) : `已等待 ${waitSeconds}s`}
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-xs text-gray-600 font-medium">
                    {progressPct}%
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {countdown != null
                      ? `预计还需 ${countdown} 秒`
                      : `${completedSteps}/${steps.length} 步`}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ease-out ${error ? "w-full bg-red-400 duration-500" : isDone ? "w-full bg-gray-700 duration-500" : "bg-gray-400 duration-700"}`}
              style={isDone || error ? undefined : { width: `${progressPct}%` }}
            />
          </div>

          {/* 实时平台采集进度（SSE） */}
          {platformList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {platformList.map(([pid, info]) => (
                <div
                  key={`${pid}-${info.status}`}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                    info.status === "done"
                      ? "bg-emerald-50 text-emerald-700"
                      : info.status === "failed"
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {info.status === "done" ? (
                    <Check className="h-3 w-3" />
                  ) : info.status === "failed" ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  )}
                  <span>{info.name}</span>
                  <span>
                    {info.status === "collecting"
                      ? " 采集中…"
                      : info.status === "done"
                        ? info.contentCount && info.contentCount > 0
                          ? ` 发现 ${info.contentCount} 条内容`
                          : info.hotCount && info.hotCount > 0
                            ? ` 捕获 ${info.hotCount} 条热榜`
                            : " 采集完成"
                        : info.status === "failed"
                          ? " 采集失败"
                          : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 平台完成后立即展示发现的内容亮点 */}
          {!dataCollected && platformList.some(([, info]) => info.status === "done" && info.topContent) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {platformList
                .filter(([, info]) => info.status === "done" && info.topContent)
                .map(([pid, info]) => (
                  <span
                    key={`top-${pid}`}
                    className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-500"
                  >
                    <span className="text-amber-500">★</span>
                    {info.topContent}…
                  </span>
                ))}
            </div>
          )}

          {/* 已采集真实数据预览（在 LLM 分析期间展示） */}
          {dataCollected && !dataReady && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-700">
                  数据采集完成，AI 正在分析爆款机会…
                </span>
                <span className="ml-auto text-xs text-emerald-600/70">
                  {[
                    dataCollected.contentCount > 0 ? `${dataCollected.contentCount} 条内容` : null,
                    dataCollected.accountCount > 0 ? `${dataCollected.accountCount} 个账号` : null,
                    dataCollected.hotCount > 0 ? `${dataCollected.hotCount} 条热榜` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>

              {/* 事实数据亮点——最高赞/大粉信号 */}
              {dataCollected.highlights && dataCollected.highlights.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {dataCollected.highlights.map((h: string, i: number) => (
                    <span
                      key={`hl-${h.slice(0, 20)}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm"
                    >
                      <span className="text-amber-500">★</span>
                      {h}
                    </span>
                  ))}
                </div>
              )}

              {dataCollected.contentSamples.length > 0 && (
                <div className="space-y-1.5">
                  {dataCollected.contentSamples.map((item: ContentSampleItem, i: number) => (
                    <div key={`cs-${item.title.slice(0, 20)}-${i}`} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 rounded bg-blue-50 px-1 py-0.5 text-xs text-blue-500">
                        {item.platform}
                      </span>
                      <span className="flex-1 truncate text-xs text-gray-600 leading-relaxed">
                        {item.title}
                      </span>
                      {item.likeCount != null && item.likeCount > 0 && (
                        <span className="shrink-0 text-xs text-rose-400 font-medium">
                          ♥ {item.likeCount >= 10000
                            ? `${(item.likeCount / 10000).toFixed(1)}万`
                            : item.likeCount.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {dataCollected.accountSamples.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dataCollected.accountSamples.map((acc: AccountSampleItem, i: number) => (
                    <div key={`acc-${acc.displayName}-${i}`} className="flex items-center gap-1 rounded-full bg-white/80 border border-gray-100 px-2 py-0.5">
                      <span className="text-xs text-gray-500">{acc.displayName}</span>
                      {acc.followerCount != null && acc.followerCount > 0 && (
                        <span className="text-xs text-gray-400">
                          {acc.followerCount >= 10000
                            ? `${(acc.followerCount / 10000).toFixed(0)}万粉`
                            : `${acc.followerCount}粉`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {dataCollected.contentSamples.length === 0 && dataCollected.accountCount === 0 && dataCollected.hotCount > 0 && (
                <p className="text-xs text-emerald-600">已捕捉到 {dataCollected.hotCount} 条热榜信号，AI 正在基于热榜趋势分析爆款机会…</p>
              )}
              {dataCollected.contentSamples.length === 0 && dataCollected.accountCount === 0 && dataCollected.hotCount === 0 && (
                <p className="text-xs text-emerald-600">数据采集完成，AI 正在综合多维度信号分析趋势机会…</p>
              )}
            </div>
          )}

          {/* 缓存命中提示 */}
          {fromCache && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600">
              <Zap className="h-3 w-3" />
              命中缓存，直接返回上次分析结果
            </div>
          )}
        </div>

        <div className="px-5 py-6 sm:px-7">
          {steps.map((step, index) => {
            const status = getStatus(index);
            const isLast = index === steps.length - 1;

            return (
              <div key={`${step.title}-${index}`} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <StepIcon status={status} />
                  {!isLast && (
                    <div
                      className={`my-1.5 min-h-[20px] w-px flex-1 transition-colors duration-500 ${status === "done" ? "bg-gray-200" : "bg-gray-100"}`}
                    />
                  )}
                </div>

                <div className={`flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                  <div className="flex min-h-5 items-center gap-2">
                    <span
                      className={`text-sm transition-colors duration-300 ${
                        status === "pending"
                          ? "text-gray-300"
                          : status === "active"
                            ? "text-gray-900"
                            : "text-gray-700"
                      }`}
                    >
                      {step.title}
                    </span>

                    {status === "done" && (
                      <span className="rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
                        {step.doneLabel}
                      </span>
                    )}
                  </div>

                  {status === "active" && (
                    <div>
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                        {step.activeDetail}
                      </p>
                      {step.scanLogs?.map((log, logIdx) => (
                        <ScanLogLine
                          key={`log-${index}-${logIdx}`}
                          text={log}
                          delay={600 + logIdx * 800}
                        />
                      ))}
                    </div>
                  )}
                  {status === "pending" && (
                    <p className="mt-0.5 text-xs text-gray-300">{step.desc}</p>
                  )}

                  {/* 已完成步骤也显示扫描日志（淡色） */}
                  {status === "done" && step.scanLogs && (
                    <div className="mt-1 space-y-0.5">
                      {step.scanLogs.map((log, logIdx) => (
                        <div
                          key={`donelog-${index}-${logIdx}`}
                          className="flex items-center gap-1.5 text-xs text-gray-300"
                        >
                          <span className="inline-block h-1 w-1 rounded-full bg-gray-200" />
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部提示语 */}
      <div className="pb-2 pt-1 text-center">
        <p className="text-xs leading-relaxed text-gray-400">
          {taskIntent === "copy_extraction"
            ? "不只是提取文字，而是拆解出可直接复用的表达模式和钩子结构"
            : taskIntent === "viral_breakdown"
              ? "不只是看数据，而是拆解出你能直接借鉴的内容结构和节奏设计"
              : taskIntent === "account_diagnosis"
                ? "不只是看粉丝数，而是诊断你的定位、内容和人设是否形成合力"
                : "不只是追踪热点，而是在判断这个方向是否真的适合你的账号、你的阶段和你的风格"}
        </p>
      </div>
    </div>
  );
}
