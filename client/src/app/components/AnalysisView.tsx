import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Link2,
  MessageCircle,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  Share2,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "../store/app-store";
import type { TaskIntent, PredictionRequestEntrySource } from "../store/prediction-types";
import type { ProgressEvent } from "../lib/live-predictions-api";

type DataCollectedEvent = Extract<ProgressEvent, { type: "data_collected" }>;

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
          title: "解析输入意图",
          desc: "识别赛道关键词，确定分析平台与模式",
          doneLabel: "意图识别完成",
          activeDetail: `识别赛道关键词：「${industry}」· 确定分析平台：${platform} · 选择分析模式：赛道机会判断`,
          scanLogs: ["意图类型：机会判断", `目标平台：${platform}`],
        },
        {
          title: "多平台数据采集（并行）",
          desc: `同时搜索${platform}赛道内容，提取创作者账号`,
          doneLabel: "平台数据采集完成",
          activeDetail: `并行采集${platform}赛道内容 · 提取创作者账号画像 · 过滤30天内有效数据 · 筛除营销噪音`,
          scanLogs: [`${platform}内容采集中`, "提取账号信息并去重"],
        },
        {
          title: "评论信号采集",
          desc: "获取热门作品评论，提取需求关键词",
          doneLabel: "评论信号提取完成",
          activeDetail: `采集热门作品评论区 · 情感倾向分类 · 提取「怎么/求/想买」等需求模式 · 统计高频2-4字词组`,
          scanLogs: ["检测需求信号词", "正向/负向评论分类"],
        },
        {
          title: "低粉爆款算法扫描",
          desc: "计算粉丝效率比，发现算法窗口期信号",
          doneLabel: "低粉样本扫描完成",
          activeDetail: `计算粉丝效率比（互动/粉丝数）· 对比P75互动基准 · 识别低粉高互动内容 · 评估时效性衰减`,
          scanLogs: ["扫描低粉高互动样本", "计算异常互动倍数"],
        },
        {
          title: "LLM 深度分析",
          desc: "融合多平台证据，评估赛道竞争格局",
          doneLabel: "AI 分析完成",
          activeDetail: `融合多平台证据 · 评估赛道竞争饱和度 · 判断算法窗口期强度 · 生成机会结论`,
          scanLogs: ["分析维度：需求/竞争/时机", "AI 推理中"],
        },
        {
          title: "评分与决策模型",
          desc: "7维度量化评分，输出 Verdict 四分类",
          doneLabel: "评分与决策完成",
          activeDetail: `7维度评分（需求/竞争/异常/适配/机会/时机/风险）· Verdict 四分类 · 确定最优动作推荐`,
          scanLogs: ["机会指数计算完成", "确定推荐等级"],
        },
        {
          title: "生成 AI 选题建议",
          desc: "基于证据生成可直接拍摄的选题方向",
          doneLabel: "已生成",
          activeDetail: `结合真实样本生成可拍选题 · 匹配「怎么拍/为什么现在」· 标注对标账号和推荐动作`,
          scanLogs: ["生成可执行选题清单"],
        },
      ];
  }
}

/* ------------------------------------------------------------------ */
/*  从 entryTemplateId / skillId 推断 TaskIntent                        */
/* ------------------------------------------------------------------ */

/** 爆款预测 / 未显式标注任务：5 步进度条，与 SSE progressEvents 对齐 */
function getOpportunityEventDrivenSteps(kw: { industry: string; platform: string; stage: string }): AnalysisStep[] {
  const { industry, platform } = kw;
  return [
    {
      title: "识别用户需求",
      desc: "确认这是不是适合抖音 / 小红书创作者做的选题",
      doneLabel: "需求已确认",
      activeDetail: `正在判断「${industry}」是不是适合当前账号跟进的创作机会…`,
    },
    {
      title: "扫描相似热点",
      desc: "寻找相似内容、热点样本和近期讨论",
      doneLabel: "热点已扫描",
      activeDetail: `正在从 ${platform} 等渠道筛选与「${industry}」相关的起量样本…`,
    },
    {
      title: "判断起量信号",
      desc: "分析点赞、评论、收藏、分享是否异常",
      doneLabel: "信号已判断",
      activeDetail: "正在判断用户为什么会点赞、评论、收藏或转发这些内容…",
    },
    {
      title: "筛选低粉机会",
      desc: "判断普通账号是否也能跟上",
      doneLabel: "低粉机会已筛",
      activeDetail: "正在筛选低粉起量样本，判断这个方向是不是只有大号能做…",
    },
    {
      title: "生成行动方案",
      desc: "输出选题、形式、平台和发布时间建议",
      doneLabel: "行动方案已生成",
      activeDetail: "正在生成今晚可以直接发布的选题方案…",
    },
  ];
}

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

function formatCompactNumber(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return "0";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function useAnimatedNumber(value: number, duration = 700) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);
  return displayValue;
}

function AnimatedMetric({
  label,
  value,
  suffix = "",
  tone = "blue",
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "blue" | "rose" | "emerald" | "amber";
}) {
  const displayValue = useAnimatedNumber(value);
  const colorClass =
    tone === "rose"
      ? "text-rose-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "amber"
          ? "text-amber-600"
          : "text-blue-600";
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 shadow-sm">
      <div className={`font-mono text-lg font-semibold tabular-nums tracking-normal ${colorClass}`}>
        {formatCompactNumber(displayValue)}
        {suffix}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-400">{label}</div>
    </div>
  );
}

function RollingCompactNumber({
  value,
  className = "",
}: {
  value?: number | null;
  className?: string;
}) {
  const displayValue = useAnimatedNumber(value ?? 0);
  if (value == null || Number.isNaN(value)) {
    return <span className={className}>--</span>;
  }
  return (
    <span className={`tabular-nums ${className}`}>
      {formatCompactNumber(displayValue)}
    </span>
  );
}

type PreviewDimension = "samples" | "cut" | "low_follower";
type PlatformStatusInfo = {
  name: string;
  status: "collecting" | "done" | "failed";
  contentCount?: number;
  hotCount?: number;
  topContent?: string;
};
type PlatformStatusList = Array<[string, PlatformStatusInfo]>;

const PREVIEW_DIMENSIONS: Array<{ id: PreviewDimension; label: string; detail: string }> = [
  { id: "samples", label: "热门样本", detail: "先看真实跑起来的内容" },
  { id: "cut", label: "切口预测", detail: "提前看 Agent 判断维度" },
  { id: "low_follower", label: "低粉机会", detail: "关注中腰部可复制性" },
];

function LoadingValueBanner({
  dataCollected,
  lowFollowerCandidateCount,
  keywords,
}: {
  dataCollected: DataCollectedEvent | null;
  lowFollowerCandidateCount: number;
  keywords: { industry: string; platform: string; stage: string };
}) {
  const hotCount = dataCollected?.hotCount ?? 0;
  const contentCount = dataCollected?.contentCount ?? 0;
  const accountCount = dataCollected?.accountCount ?? 0;
  const lowFollowerLabel =
    lowFollowerCandidateCount > 0 ? `${lowFollowerCandidateCount} 个低粉号案例` : "正在识别低粉号案例";

  return (
    <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Sparkles className="h-4 w-4" />
            Agent 正在为你分析爆款机会
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            正在围绕「{keywords.industry}」抓取
            <span className="mx-1 font-semibold text-blue-700">{hotCount > 0 ? `${hotCount} 条热榜样本` : "热榜样本"}</span>
            、扫描
            <span className="mx-1 font-semibold text-emerald-700">{contentCount > 0 ? `${contentCount} 条热门内容` : "热门内容"}</span>
            和
            <span className="mx-1 font-semibold text-amber-700">{lowFollowerLabel}</span>
            。等待完成后，你将获得最优创作切口和高胜率预测。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
          <AnimatedMetric label="热榜信号" value={hotCount} tone="blue" />
          <AnimatedMetric label="热门内容" value={contentCount} tone="emerald" />
          <AnimatedMetric label="账号样本" value={accountCount} tone="amber" />
        </div>
      </div>
    </div>
  );
}

function CompactLoadingValueBanner({
  dataCollected,
  lowFollowerCandidateCount,
  keywords,
}: {
  dataCollected: DataCollectedEvent | null;
  lowFollowerCandidateCount: number;
  keywords: { industry: string; platform: string; stage: string };
}) {
  const hotCount = dataCollected?.hotCount ?? 0;
  const contentCount = dataCollected?.contentCount ?? 0;
  const lowFollowerLabel =
    lowFollowerCandidateCount > 0 ? `${lowFollowerCandidateCount} 个低粉案例` : "识别低粉案例";

  return (
    <div className="shrink-0 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-amber-50 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <Sparkles className="h-4 w-4" />
            Agent 正在分析爆款机会
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
            围绕「{keywords.industry}」抓取热榜与热门样本。完成后会给出最优创作切口、高胜率预测和下一步生成入口。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="font-mono text-base font-semibold text-blue-600 tabular-nums">{formatCompactNumber(hotCount)}</div>
            <div className="text-[11px] text-gray-400">热榜样本</div>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="font-mono text-base font-semibold text-emerald-600 tabular-nums">{formatCompactNumber(contentCount)}</div>
            <div className="text-[11px] text-gray-400">热门内容</div>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2">
            <div className="text-sm font-semibold text-amber-600">{lowFollowerLabel}</div>
            <div className="text-[11px] text-gray-400">等待价值</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DimensionPreviewTabs({
  active,
  onChange,
}: {
  active: PreviewDimension;
  onChange: (value: PreviewDimension) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {PREVIEW_DIMENSIONS.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-2xl border px-3 py-3 text-left transition ${
              selected
                ? "border-blue-200 bg-blue-50 text-blue-900 shadow-sm"
                : "border-gray-100 bg-white text-gray-500 hover:border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{item.label}</span>
              <ChevronRight className={`h-4 w-4 transition ${selected ? "translate-x-0.5 text-blue-500" : "text-gray-300"}`} />
            </div>
            <div className="mt-1 text-xs leading-5 opacity-70">{item.detail}</div>
          </button>
        );
      })}
    </div>
  );
}

function LiveSampleWorkbench({
  dataCollected,
  activeDimension,
  expandedSampleIndex,
  onExpandSample,
  platformList,
  compact = false,
}: {
  dataCollected: DataCollectedEvent | null;
  activeDimension: PreviewDimension;
  expandedSampleIndex: number | null;
  onExpandSample: (index: number) => void;
  platformList: PlatformStatusList;
  compact?: boolean;
}) {
  const contentSamples = dataCollected?.contentSamples ?? [];
  const accountSamples = dataCollected?.accountSamples ?? [];
  const fallbackTopContents = platformList
    .filter(([, info]) => info.topContent)
    .map(([, info]) => ({
      title: info.topContent ?? "正在发现热门样本",
      platform: info.name,
      likeCount: undefined,
      viewCount: undefined,
      commentCount: undefined,
      collectCount: undefined,
      shareCount: undefined,
      authorFollowerCount: undefined,
      whyIncluded: "平台已返回候选内容，互动信号待补。",
    }));
  const samples = contentSamples.length > 0 ? contentSamples : fallbackTopContents;

  if (activeDimension === "cut") {
    return (
      <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-3"}`}>
        {[
          { icon: TrendingUp, title: "趋势窗口", value: dataCollected?.hotCount ?? 0, desc: "判断当前是不是值得抢先发布。" },
          { icon: MessageCircle, title: "评论需求", value: dataCollected?.contentCount ?? 0, desc: "看用户是在求教程、接梗，还是只围观。" },
          { icon: Target, title: "内容空档", value: dataCollected?.accountCount ?? 0, desc: "寻找中腰部账号能切入的具体场景。" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className={`rounded-2xl border border-gray-100 bg-white shadow-sm ${compact ? "p-3" : "p-4"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Icon className="h-4 w-4 text-blue-500" />
                {item.title}
              </div>
              <div className="mt-3">
                <AnimatedMetric label="已回传信号" value={item.value} tone="blue" />
              </div>
              <p className={`${compact ? "mt-2 line-clamp-2" : "mt-3"} text-xs leading-5 text-gray-500`}>{item.desc}</p>
            </div>
          );
        })}
      </div>
    );
  }

  if (activeDimension === "low_follower") {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {accountSamples.length > 0 ? accountSamples.slice(0, compact ? 3 : accountSamples.length).map((account, index) => (
          <div
            key={`${account.displayName}-${index}`}
            className={`animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-amber-100 bg-amber-50/60 shadow-sm ${compact ? "p-3" : "p-4"}`}
            style={{ animationDelay: `${index * 140}ms` }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Users className="h-4 w-4 text-amber-600" />
              {account.displayName}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-white px-2 py-1 text-xs text-amber-700">{account.platform}</span>
              <span className="font-mono text-sm font-semibold text-amber-700">
                <RollingCompactNumber value={account.followerCount} />粉
              </span>
            </div>
            <p className={`${compact ? "mt-2 line-clamp-2" : "mt-3"} text-xs leading-5 text-gray-500`}>等待 Agent 判断是否属于低粉高互动可复制样本。</p>
          </div>
        )) : (
          <div className="col-span-full rounded-2xl border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            正在识别低粉号案例，完成后会判断哪些样本对中腰部创作者更可复制。
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {samples.length > 0 ? samples.slice(0, compact ? 2 : 4).map((sample, index) => (
        <button
          key={`${sample.title}-${index}`}
          type="button"
          onClick={() => onExpandSample(index)}
          className={`animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${compact ? "p-3" : "p-4"}`}
          style={{ animationDelay: `${index * 130}ms` }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">{sample.platform}</span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <MousePointerClick className="h-3 w-3" />
              可查看
            </span>
          </div>
          <div className={`${compact ? "line-clamp-2 text-sm leading-5" : "line-clamp-2 text-sm leading-6"} font-semibold text-gray-900`}>{sample.title}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            <div className="rounded-xl bg-rose-50 px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-rose-500">
                <Heart className="h-3 w-3" />
                点赞
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-rose-600">
                <RollingCompactNumber value={sample.likeCount} />
              </div>
            </div>
            <div className="rounded-xl bg-blue-50 px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-blue-500">
                <MessageCircle className="h-3 w-3" />
                评论
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-blue-600">
                <RollingCompactNumber value={sample.commentCount} />
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <Bookmark className="h-3 w-3" />
                收藏
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-emerald-700">
                <RollingCompactNumber value={sample.collectCount} />
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Share2 className="h-3 w-3" />
                分享
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-amber-700">
                <RollingCompactNumber value={sample.shareCount} />
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
            {sample.whyIncluded || "互动信号待补，Agent 正在等待更多证据回传。"}
            {sample.authorFollowerCount != null && sample.authorFollowerCount > 0 && (
              <span className="mt-1 block text-gray-400">
                作者粉丝：{formatCompactNumber(sample.authorFollowerCount)}
              </span>
            )}
          </div>
          {expandedSampleIndex === index && (
            <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
              Agent 会继续校验：评论区是否有争议、收藏/分享是否强、低粉账号能否复用这个切口。
            </div>
          )}
        </button>
      )) : (
        Array.from({ length: compact ? 2 : 4 }).map((_, index) => (
          <div
            key={`sample-skeleton-${index}`}
            className="animate-pulse rounded-2xl border border-dashed border-gray-200 bg-white p-4"
            style={{ animationDelay: `${index * 120}ms` }}
          >
            <div className="h-5 w-20 rounded-full bg-gray-100" />
            <div className="mt-4 h-4 w-full rounded bg-gray-100" />
            <div className="mt-2 h-4 w-2/3 rounded bg-gray-100" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-12 rounded-xl bg-gray-100" />
              <div className="h-12 rounded-xl bg-gray-100" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function getCollectedSampleCount(dataCollected: DataCollectedEvent | null, platformList: PlatformStatusList) {
  if (dataCollected?.contentCount) return dataCollected.contentCount;
  return platformList.reduce((sum, [, info]) => sum + (info.contentCount ?? info.hotCount ?? 0), 0);
}

function OpportunityStatusHeader({
  displayQuery,
  taskLabel,
  activePlatformLabels,
  connectorLabel,
  progressPct,
  sampleCount,
  countdown,
  isDone,
  dataReady,
  waitSeconds,
  error,
  onReset,
}: {
  displayQuery: string;
  taskLabel: string;
  activePlatformLabels: string[];
  connectorLabel: string[];
  progressPct: number;
  sampleCount: number;
  countdown: number | null;
  isDone: boolean;
  dataReady: boolean;
  waitSeconds: number;
  error?: string | null;
  onReset: () => void;
}) {
  return (
    <section className="shrink-0 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white">
              <Sparkles className="h-3 w-3" />
              {taskLabel}
            </span>
            {activePlatformLabels.length > 0 ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                <Link2 className="h-3 w-3 shrink-0" />
                <span className="truncate">已接入 {activePlatformLabels.join("、")} 数据</span>
              </span>
            ) : (
              connectorLabel.map((label) => (
                <span key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                  {label}
                </span>
              ))
            )}
          </div>
          <h1 className="mt-3 line-clamp-2 text-xl font-semibold tracking-normal text-gray-950 sm:text-2xl">
            正在预测「{displayQuery}」爆款机会
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">进度 {progressPct}%</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">已采集 {sampleCount} 条样本</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              <Clock3 className="h-3 w-3" />
              {isDone
                ? dataReady
                  ? "正在载入结果"
                  : "正在整理判断"
                : countdown != null
                  ? "机会窗口正在收窄"
                  : "正在研判"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重新输入
        </button>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ease-out ${
            error ? "w-full bg-red-400 duration-500" : isDone ? "w-full bg-gray-800 duration-500" : "bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 duration-700"
          }`}
          style={isDone || error ? undefined : { width: `${progressPct}%` }}
        >
          {!isDone && !error && <div className="h-full w-full animate-pulse bg-white/25" />}
        </div>
      </div>
      {error && <p className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
    </section>
  );
}

function AgentProgressColumn({
  steps,
  getStatus,
  dataCollected,
  platformList,
  lowFollowerCandidateCount,
}: {
  steps: AnalysisStep[];
  getStatus: (index: number) => "done" | "active" | "pending";
  dataCollected: DataCollectedEvent | null;
  platformList: PlatformStatusList;
  lowFollowerCandidateCount: number;
}) {
  const doneCount = steps.filter((_, index) => getStatus(index) === "done").length;
  const activeStep = steps.find((_, index) => getStatus(index) === "active") ?? steps[steps.length - 1];
  const sampleCount = getCollectedSampleCount(dataCollected, platformList);

  return (
    <aside className="flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-950">爆款预测流程</div>
            <p className="mt-1 text-xs leading-5 text-gray-500">按真实证据判断今天值不值得拍。</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <div className="font-mono text-sm font-semibold text-gray-900">{sampleCount}</div>
            <div className="text-[11px] text-gray-400">样本证据</div>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2">
            <div className="font-mono text-sm font-semibold text-amber-700">{lowFollowerCandidateCount}</div>
            <div className="text-[11px] text-amber-600">低粉候选</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
          <span className="font-semibold text-blue-900">当前：</span>{activeStep.title}
        </div>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
        {steps.map((step, index) => {
          const status = getStatus(index);
          const isLast = index === steps.length - 1;
          const activeText =
            index === 1 && platformList.length > 0
              ? platformList
                  .filter(([, s]) => s.status === "done")
                  .map(([, s]) => `${s.name} 已找到 ${s.contentCount ?? s.hotCount ?? 0} 条`)
                  .join("，") || step.activeDetail
              : index === 2 && dataCollected
                ? `正在分析 ${dataCollected.contentCount} 条样本的点赞、评论、收藏、分享信号`
                : index === 3
                  ? lowFollowerCandidateCount > 0
                    ? `已发现 ${lowFollowerCandidateCount} 个低粉机会，正在判断可复制性`
                    : "正在判断普通账号是否也能跟"
                  : step.activeDetail;

          return (
            <div
              key={`opportunity-step-${step.title}-${index}`}
              className={`flex gap-2 rounded-xl px-2 py-1.5 transition-colors duration-300 ${
                status === "active" ? "bg-blue-50/70" : "bg-transparent"
              }`}
            >
              <div className="flex flex-col items-center">
                <StepIcon status={status} />
                {!isLast && (
                  <div
                    className={`my-1 min-h-[14px] w-px flex-1 transition-colors duration-500 ${
                      status === "done" ? "bg-gray-200" : status === "active" ? "bg-gradient-to-b from-blue-300 to-gray-100" : "bg-gray-100"
                    }`}
                  />
                )}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-2"}`}>
                <div className="flex min-h-5 items-center gap-2">
                  <span
                    className={`truncate text-[13px] font-medium transition-colors duration-300 ${
                      status === "pending" ? "text-gray-300" : status === "active" ? "text-gray-950" : "text-gray-700"
                    }`}
                  >
                    {index + 1}. {step.title}
                  </span>
                  {status === "done" && (
                    <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-400">
                      {step.doneLabel}
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 line-clamp-1 text-xs leading-5 ${status === "pending" ? "text-gray-300" : "text-gray-500"}`}>
                  {status === "active" ? activeText : step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
        目标：判断今天能不能拍、从哪个切口拍。
      </div>
    </aside>
  );
}

function EvidenceStreamPanel({
  dataCollected,
  activePreviewDimension,
  setActivePreviewDimension,
  expandedSampleIndex,
  setExpandedSampleIndex,
  platformList,
}: {
  dataCollected: DataCollectedEvent | null;
  activePreviewDimension: PreviewDimension;
  setActivePreviewDimension: (dimension: PreviewDimension) => void;
  expandedSampleIndex: number | null;
  setExpandedSampleIndex: Dispatch<SetStateAction<number | null>>;
  platformList: PlatformStatusList;
}) {
  const contentCount = dataCollected?.contentCount ?? 0;
  const hotCount = dataCollected?.hotCount ?? 0;
  const accountCount = dataCollected?.accountCount ?? 0;

  return (
    <section className="flex min-h-0 flex-col rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="shrink-0 border-b border-gray-100 p-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              正在发现起量样本
            </div>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              先看 Agent 正在抓哪些证据、为什么入选；最终选题和脚本会在结果页生成。
            </p>
          </div>
          <DimensionPreviewTabs active={activePreviewDimension} onChange={setActivePreviewDimension} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { label: "热门内容", value: contentCount, tone: "text-emerald-700 bg-emerald-50" },
            { label: "热榜信号", value: hotCount, tone: "text-blue-700 bg-blue-50" },
            { label: "账号样本", value: accountCount, tone: "text-amber-700 bg-amber-50" },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl px-3 py-2 ${item.tone}`}>
              <div className="font-mono text-base font-semibold">{formatCompactNumber(item.value)}</div>
              <div className="text-[11px] opacity-70">{item.label}</div>
            </div>
          ))}
        </div>

        {platformList.length > 0 && (
          <div className="mt-3 flex max-h-16 flex-wrap gap-2 overflow-hidden">
            {platformList.map(([pid, info]) => {
              const isAsrSkipped = pid === "asr" && info.status === "failed";
              return (
                <div
                  key={`${pid}-${info.status}`}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                    info.status === "done"
                      ? "bg-emerald-50 text-emerald-700"
                      : isAsrSkipped
                        ? "bg-gray-100 text-gray-500"
                        : info.status === "failed"
                          ? "bg-red-50 text-red-600"
                          : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {info.status === "done" ? (
                    <Check className="h-3 w-3" />
                  ) : isAsrSkipped ? (
                    <span className="text-[10px]">—</span>
                  ) : info.status === "failed" ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  )}
                  <span>{info.name}</span>
                  <span>
                    {info.status === "collecting"
                      ? "采集中"
                      : info.status === "done"
                        ? info.contentCount && info.contentCount > 0
                          ? `${info.contentCount}条`
                          : info.hotCount && info.hotCount > 0
                            ? `${info.hotCount}条热榜`
                            : "完成"
                        : isAsrSkipped
                          ? "已跳过"
                          : info.status === "failed"
                            ? "失败"
                            : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {dataCollected?.highlights && dataCollected.highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {dataCollected.highlights.slice(0, 3).map((h: string, i: number) => (
              <span
                key={`evidence-hl-${h.slice(0, 20)}-${i}`}
                className="inline-flex max-w-full animate-in items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 fade-in slide-in-from-bottom-1 duration-500"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <span className="text-amber-500">★</span>
                <span className="truncate">{h}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <LiveSampleWorkbench
          dataCollected={dataCollected}
          activeDimension={activePreviewDimension}
          expandedSampleIndex={expandedSampleIndex}
          onExpandSample={(index) => setExpandedSampleIndex((current) => (current === index ? null : index))}
          platformList={platformList}
          compact
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  StepIcon                                                           */
/* ------------------------------------------------------------------ */

function StepIcon({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 shadow-sm">
        <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white shadow-[0_0_0_4px_rgba(59,130,246,0.10)]">
        <div className="absolute inset-0 animate-ping rounded-full border border-blue-400 opacity-60" />
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
  const [activePreviewDimension, setActivePreviewDimension] = useState<PreviewDimension>("samples");
  const [expandedSampleIndex, setExpandedSampleIndex] = useState<number | null>(0);
  // 加载态倒计时：基于任务类型预估总时长
  const [countdown, setCountdown] = useState<number | null>(null);
  const completionTriggeredRef = useRef(false);
  const liveFinalizeTimerRef = useRef<number | null>(null);

  // 从SSE进度事件中提取平台状态
  const platformStatuses = useMemo(() => {
    if (!progressEvents || progressEvents.length === 0) return {};
    const map: Record<string, PlatformStatusInfo> = {};
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

  const lowFollowerCandidateCount = useMemo(() => {
    if (!dataCollected) return 0;
    return dataCollected.accountSamples.filter(
      (account) => account.followerCount != null && account.followerCount > 0 && account.followerCount <= 50_000,
    ).length;
  }, [dataCollected]);

  // 动态关键词提取
  const keywords = useMemo(() => extractKeywords(query), [query]);

  // 推断任务类型
  const taskIntent = useMemo(
    () => inferTaskIntent(entrySource, entryTemplateId, selectedSkillId),
    [entrySource, entryTemplateId, selectedSkillId],
  );

  const useLiveEventSteps =
    !taskIntent || taskIntent === "opportunity_prediction";

  // 根据任务类型生成动态步骤
  const steps = useMemo(
    () =>
      useLiveEventSteps ? getOpportunityEventDrivenSteps(keywords) : getStepsForTask(taskIntent, keywords),
    [useLiveEventSteps, taskIntent, keywords],
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
    () =>
      durationByIntent[taskIntent ?? ""] ??
      (useLiveEventSteps ? durationByIntent.opportunity_prediction : 25000),
    [durationByIntent, taskIntent, useLiveEventSteps],
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
  // 非爆款预测路径：仍按预估时间推进步骤（无 SSE 或任务形态不同时）
  const stepTimingsRef = useRef<number[] | null>(null);
  if (!useLiveEventSteps) {
    if (!stepTimingsRef.current || stepTimingsRef.current.length !== steps.length) {
      const count = steps.length;
      const earlyBudget = totalDuration * 0.6;
      const earlyInterval = count > 1 ? earlyBudget / (count - 1) : earlyBudget;
      stepTimingsRef.current = steps.map((_, i) => {
        if (i < count - 1) {
          const factor = 0.9 + (i / Math.max(count - 2, 1)) * 0.2;
          return Math.round(earlyInterval * (i + 1) * factor);
        }
        return Math.round(totalDuration * 0.9);
      });
    }
  } else {
    stepTimingsRef.current = null;
  }
  const stepTimings = stepTimingsRef.current;

  useEffect(() => {
    if (useLiveEventSteps || !stepTimings) return;
    const timers = stepTimings.map((time, index) =>
      window.setTimeout(() => {
        setCompletedSteps(index + 1);
        if (index === steps.length - 1) setIsDone(true);
      }, time),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [stepTimings, steps.length, useLiveEventSteps]);

  // 爆款预测：步骤与 SSE progressEvents 对齐（缓存命中走快速路径）
  useEffect(() => {
    if (!useLiveEventSteps || error) return;

    if (liveFinalizeTimerRef.current != null) {
      window.clearTimeout(liveFinalizeTimerRef.current);
      liveFinalizeTimerRef.current = null;
    }

    if (fromCache || progressEvents?.some((e) => e.type === "cache_hit")) {
      setCompletedSteps(4);
      liveFinalizeTimerRef.current = window.setTimeout(() => {
        setCompletedSteps(5);
        setIsDone(true);
        liveFinalizeTimerRef.current = null;
      }, 3000);
      return () => {
        if (liveFinalizeTimerRef.current != null) {
          window.clearTimeout(liveFinalizeTimerRef.current);
          liveFinalizeTimerRef.current = null;
        }
      };
    }

    const evs = progressEvents ?? [];
    let completed = 1;
    if (evs.some((e) => e.type === "platform_start" || e.type === "platform_done")) {
      completed = 2;
    }
    if (evs.some((e) => e.type === "data_collected")) {
      completed = 3;
    }
    if (evs.some((e) => e.type === "llm_start")) {
      completed = 4;
    }
    if (evs.some((e) => e.type === "llm_done")) {
      setCompletedSteps(4);
      liveFinalizeTimerRef.current = window.setTimeout(() => {
        setCompletedSteps(5);
        setIsDone(true);
        liveFinalizeTimerRef.current = null;
      }, 3000);
    } else {
      setCompletedSteps(completed);
    }

    return () => {
      if (liveFinalizeTimerRef.current != null) {
        window.clearTimeout(liveFinalizeTimerRef.current);
        liveFinalizeTimerRef.current = null;
      }
    };
  }, [progressEvents, fromCache, useLiveEventSteps, error]);

  // 动画完成后标记
  useEffect(() => {
    if (!isDone) return;
    const timer = window.setTimeout(() => setAnimationDone(true), 600);
    return () => window.clearTimeout(timer);
  }, [isDone]);

  // 数据就绪优先：不再被动画完成门控，避免“结果已返回但仍等待动画”
  useEffect(() => {
    if (!completionTriggeredRef.current && dataReady && !error) {
      completionTriggeredRef.current = true;
      toast.success("分析完成", { description: "结果已就绪，正在为你呈现" });
      onComplete();
      return;
    }

    if (animationDone && !dataReady && !error) {
      setWaitingForData(true);
    }
  }, [animationDone, dataReady, error, onComplete, waitSeconds, isDone]);

  // waiting 模式下的数据就绪兜底（与 completionTriggeredRef 防重复）
  useEffect(() => {
    if (waitingForData && dataReady && !completionTriggeredRef.current && !error) {
      completionTriggeredRef.current = true;
      onComplete();
    }
  }, [waitingForData, dataReady, onComplete, waitSeconds]);

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

  if (useLiveEventSteps) {
    const liveSampleCount = getCollectedSampleCount(dataCollected, platformList);
    return (
      <div className="mx-auto flex h-[calc(100dvh-76px)] max-w-[1280px] flex-col gap-3 overflow-hidden px-4 py-3 sm:px-5">
        <OpportunityStatusHeader
          displayQuery={displayQuery}
          taskLabel={taskLabel}
          activePlatformLabels={activePlatformLabels}
          connectorLabel={connectorLabel}
          progressPct={progressPct}
          sampleCount={liveSampleCount}
          countdown={countdown}
          isDone={isDone}
          dataReady={!!dataReady}
          waitSeconds={waitSeconds}
          error={error}
          onReset={onReset}
        />

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]">
          <AgentProgressColumn
            steps={steps}
            getStatus={getStatus}
            dataCollected={dataCollected}
            platformList={platformList}
            lowFollowerCandidateCount={lowFollowerCandidateCount}
          />
          <EvidenceStreamPanel
            dataCollected={dataCollected}
            activePreviewDimension={activePreviewDimension}
            setActivePreviewDimension={setActivePreviewDimension}
            expandedSampleIndex={expandedSampleIndex}
            setExpandedSampleIndex={setExpandedSampleIndex}
            platformList={platformList}
          />
        </div>
      </div>
    );

    return (
      <div className="mx-auto flex h-[calc(100dvh-76px)] max-w-5xl flex-col gap-3 overflow-hidden px-4 py-4 sm:px-6">
        <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="select-none text-xs text-gray-400">你的问题</span>
              <button
                type="button"
                onClick={onReset}
                className="flex shrink-0 items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
              >
                <RotateCcw className="h-3 w-3" />
                重新输入
              </button>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-800">{displayQuery}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                {taskLabel}
              </div>
              {activePlatformLabels.length > 0 ? (
                <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">已接入 {activePlatformLabels.join("、")} 数据</span>
                </div>
              ) : connectorLabel.map((label) => (
                <div
                  key={label}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs text-gray-500"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <CompactLoadingValueBanner
            dataCollected={dataCollected}
            lowFollowerCandidateCount={lowFollowerCandidateCount}
            keywords={keywords}
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-50 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <div
                      className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${error ? "bg-red-500" : isDone ? "bg-gray-800" : "bg-blue-500"}`}
                    />
                    {!isDone && (
                      <div className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-blue-400 opacity-60" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-base ${error ? "text-red-600" : "text-gray-900"}`}>
                      {error ? "分析失败" : isDone ? "分析完成" : `Agent 正在${taskLabel}`}
                    </h3>
                    <p className={`mt-0.5 line-clamp-1 text-xs ${error ? "text-red-500" : "text-gray-400"}`}>
                      {error
                        ? error
                        : isDone && !dataReady
                          ? waitSeconds > 45
                            ? "AI 正在深度分析，机会窗口还在收窄…"
                            : `数据即将就绪，正在整理结果…`
                          : isDone
                            ? "即将呈现你的判断结果"
                            : `基于「${keywords.industry}」方向，正在多维度判断机会`}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  {isDone ? (
	                    <div className="text-xs text-gray-400">{dataReady ? "正在载入结果" : "正在整理判断"}</div>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-gray-600">{progressPct}%</div>
                      <div className="mt-0.5 text-xs text-gray-400">
	                        {countdown != null ? "机会窗口正在收窄" : "步骤推进中"}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ease-out ${error ? "w-full bg-red-400 duration-500" : isDone ? "w-full bg-gray-700 duration-500" : "bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 duration-700"}`}
                  style={isDone || error ? undefined : { width: `${progressPct}%` }}
                >
                  {!isDone && !error && <div className="h-full w-full animate-pulse bg-white/25" />}
                </div>
              </div>

              {platformList.length > 0 && (
                <div className="mt-3 flex max-h-16 flex-wrap gap-2 overflow-hidden">
                  {platformList.map(([pid, info]) => {
                    const isAsrSkipped = pid === "asr" && info.status === "failed";
                    return (
                      <div
                        key={`${pid}-${info.status}`}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                          info.status === "done"
                            ? "bg-emerald-50 text-emerald-700"
                            : isAsrSkipped
                              ? "bg-gray-100 text-gray-500"
                              : info.status === "failed"
                                ? "bg-red-50 text-red-600"
                                : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {info.status === "done" ? (
                          <Check className="h-3 w-3" />
                        ) : isAsrSkipped ? (
                          <span className="text-[10px]">—</span>
                        ) : info.status === "failed" ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : (
                          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                        )}
                        <span>{info.name}</span>
                        <span>
                          {info.status === "collecting"
                            ? "采集中"
                            : info.status === "done"
                              ? info.contentCount && info.contentCount > 0
                                ? `${info.contentCount}条`
                                : info.hotCount && info.hotCount > 0
                                  ? `${info.hotCount}条热榜`
                                  : "完成"
                              : isAsrSkipped
                                ? "已跳过"
                                : info.status === "failed"
                                  ? "失败"
                                  : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <div className="flex h-full min-h-0 flex-col rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-4">
                <div className="mb-3 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                      </span>
                      实时样本工作台
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-500">
                      可切换预测维度，先看 Agent 正在使用哪些证据。
                    </p>
                  </div>
                  <DimensionPreviewTabs active={activePreviewDimension} onChange={setActivePreviewDimension} />
                </div>

                {(dataCollected?.highlights?.length ?? 0) > 0 && (
                  <div className="mb-3 flex shrink-0 flex-wrap gap-1.5 overflow-hidden">
                    {(dataCollected?.highlights ?? []).slice(0, 3).map((h: string, i: number) => (
                      <span
                        key={`compact-hl-${h.slice(0, 20)}-${i}`}
                        className="inline-flex max-w-full animate-in items-center gap-1 rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm fade-in slide-in-from-bottom-1 duration-500"
                        style={{ animationDelay: `${i * 120}ms` }}
                      >
                        <span className="text-amber-500">★</span>
                        <span className="truncate">{h}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-hidden">
                  <LiveSampleWorkbench
                    dataCollected={dataCollected}
                    activeDimension={activePreviewDimension}
                    expandedSampleIndex={expandedSampleIndex}
                    onExpandSample={(index) => setExpandedSampleIndex((current) => (current === index ? null : index))}
                    platformList={platformList}
                    compact
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="shrink-0">
              <div className="text-sm font-semibold text-gray-900">任务进度</div>
              <p className="mt-1 text-xs text-gray-400">当前步骤高亮，完成后自动进入结果页。</p>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-hidden">
              {steps.map((step, index) => {
                const status = getStatus(index);
                const isLast = index === steps.length - 1;

                return (
                  <div
                    key={`compact-${step.title}-${index}`}
                    className={`flex gap-3 rounded-2xl px-2 py-1.5 transition-colors duration-300 ${
                      status === "active" ? "bg-blue-50/70" : "bg-transparent"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <StepIcon status={status} />
                      {!isLast && (
                        <div
                          className={`my-1 min-h-[14px] w-px flex-1 transition-colors duration-500 ${
                            status === "done" ? "bg-gray-200" : status === "active" ? "bg-gradient-to-b from-blue-300 to-gray-100" : "bg-gray-100"
                          }`}
                        />
                      )}
                    </div>
                    <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-2"}`}>
                      <div className="flex min-h-5 items-center gap-2">
                        <span
                          className={`truncate text-sm transition-colors duration-300 ${
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
                          <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400">
                            {step.doneLabel}
                          </span>
                        )}
                      </div>
                      {status === "active" && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                          {index === 2 && dataCollected
                            ? `已汇总 ${dataCollected.contentCount} 条内容、${dataCollected.accountCount} 个账号`
                            : index === 1 && platformList.length > 0
                              ? platformList
                                  .filter(([, s]) => s.status === "done")
                                  .map(([, s]) => {
                                    const label = s.name || "平台";
                                    const n =
                                      s.contentCount && s.contentCount > 0
                                        ? `${s.contentCount} 条`
                                        : s.hotCount && s.hotCount > 0
                                          ? `${s.hotCount} 条热榜`
                                          : "已完成";
                                    return `${label} 已采到 ${n}`;
                                  })
                                  .join("，") || step.activeDetail
                              : step.activeDetail}
                        </p>
                      )}
                      {status === "pending" && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-300">{step.desc}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 shrink-0 rounded-2xl bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
              不只是追踪热点，而是在判断这个方向是否真的适合你的账号和当前阶段。
            </div>
          </aside>
        </div>
      </div>
    );
  }

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

      {useLiveEventSteps && (
        <LoadingValueBanner
          dataCollected={dataCollected}
          lowFollowerCandidateCount={lowFollowerCandidateCount}
          keywords={keywords}
        />
      )}

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
	                        ? "分析耗时较长，如持续卡住请点击重试"
                        : waitSeconds > 45
	                          ? "AI 正在深度分析，复杂分析需要更多时间"
                          : waitSeconds > 15
	                            ? "正在整合多平台数据…"
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
	                      ) : "正在整理判断"}
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
	                      ? "机会窗口正在收窄"
	                      : "步骤推进中"}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ease-out ${error ? "w-full bg-red-400 duration-500" : isDone ? "w-full bg-gray-700 duration-500" : "bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 duration-700"}`}
              style={isDone || error ? undefined : { width: `${progressPct}%` }}
            >
              {!isDone && !error && <div className="h-full w-full animate-pulse bg-white/25" />}
            </div>
          </div>

          {/* 实时平台采集进度（SSE） */}
          {platformList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {platformList.map(([pid, info]) => {
                // ASR（语音转录）失败是非阻塞的中间态——视频可能就没有口播，
                // 或 ASR 服务临时不可用，主流程会继续跑 LLM 分析。
                // 这种情况下不应该用红色「失败」吓用户，降级成灰底「已跳过」。
                const isAsrSkipped = pid === "asr" && info.status === "failed";
                return (
                  <div
                    key={`${pid}-${info.status}`}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                      info.status === "done"
                        ? "bg-emerald-50 text-emerald-700"
                        : isAsrSkipped
                          ? "bg-gray-100 text-gray-500"
                          : info.status === "failed"
                            ? "bg-red-50 text-red-600"
                            : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {info.status === "done" ? (
                      <Check className="h-3 w-3" />
                    ) : isAsrSkipped ? (
                      <span className="text-[10px]">—</span>
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
                          : isAsrSkipped
                            ? " 无口播文案 · 已跳过"
                            : info.status === "failed"
                              ? " 采集失败"
                              : null}
                    </span>
                  </div>
                );
              })}
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

          {useLiveEventSteps && !dataReady && (
            <div className="mt-4 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-4">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    </span>
                    实时样本工作台
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    你可以先切换预测维度，或点开样本卡片查看 Agent 正在用哪些证据判断机会。
                  </p>
                </div>
                <DimensionPreviewTabs active={activePreviewDimension} onChange={setActivePreviewDimension} />
              </div>
              {dataCollected?.highlights && dataCollected.highlights.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {dataCollected.highlights.map((h: string, i: number) => (
                    <span
                      key={`hl-${h.slice(0, 20)}-${i}`}
                      className="inline-flex animate-in items-center gap-1 rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-700 shadow-sm fade-in slide-in-from-bottom-1 duration-500"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <span className="text-amber-500">★</span>
                      {h}
                    </span>
                  ))}
                </div>
              )}
              <LiveSampleWorkbench
                dataCollected={dataCollected}
                activeDimension={activePreviewDimension}
                expandedSampleIndex={expandedSampleIndex}
                onExpandSample={(index) => setExpandedSampleIndex((current) => (current === index ? null : index))}
                platformList={platformList}
              />
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
              <div
                key={`${step.title}-${index}`}
                className={`flex gap-4 rounded-2xl px-2 py-1 transition-colors duration-300 ${
                  status === "active" ? "bg-blue-50/60" : "bg-transparent"
                }`}
              >
                <div className="flex flex-col items-center">
                  <StepIcon status={status} />
                  {!isLast && (
                    <div
                      className={`my-1.5 min-h-[20px] w-px flex-1 transition-colors duration-500 ${
                        status === "done" ? "bg-gray-200" : status === "active" ? "bg-gradient-to-b from-blue-300 to-gray-100" : "bg-gray-100"
                      }`}
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
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-400 whitespace-pre-line">
                        {useLiveEventSteps
                          ? index === 2 && dataCollected
                            ? `已汇总 ${dataCollected.contentCount} 条内容、${dataCollected.accountCount} 个账号`
                            : index === 1 && platformList.length > 0
                              ? platformList
                                  .filter(([, s]) => s.status === "done")
                                  .map(([, s]) => {
                                    const label = s.name || "平台";
                                    const n =
                                      s.contentCount && s.contentCount > 0
                                        ? `${s.contentCount} 条`
                                        : s.hotCount && s.hotCount > 0
                                          ? `${s.hotCount} 条热榜`
                                          : "已完成";
                                    return `${label} 已采到 ${n}`;
                                  })
                                  .join("\n") || step.activeDetail
                              : step.activeDetail
                          : step.activeDetail}
                      </p>
                      {!useLiveEventSteps &&
                        step.scanLogs?.map((log, logIdx) => (
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
                  {status === "done" && !useLiveEventSteps && step.scanLogs && (
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
