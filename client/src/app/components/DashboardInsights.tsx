import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Radar,
} from "lucide-react";
import { useAppStore } from "../store/app-store";

/* ------------------------------------------------------------------ */
/*  赛道情报 — 融合行业洞察 + 用户真实数据                                  */
/* ------------------------------------------------------------------ */

interface InsightCard {
  id: string;
  track: string;
  headline: string;
  delta: string;
  actionPrompt: string;
}

/** 从用户 niche 字符串中提取关键词 */
function parseNicheKeywords(niche: string): string[] {
  if (!niche.trim()) return [];
  return niche
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── 行业情报池（基于赛道关键词匹配） ─────────────────────────── */

const INSIGHT_POOL: Array<{
  trackMatch: string[];
  track: string;
  headline: string;
  delta: string;
  actionPrompt: string;
}> = [
  {
    trackMatch: ["美妆", "穿搭", "护肤", "化妆"],
    track: "美妆",
    headline: "「素颜/反差」内容在小红书爆发",
    delta: "低粉占比 41%，互动率 2.3x",
    actionPrompt: "请帮我拆解小红书上最近的素颜/反差类美妆爆款内容",
  },
  {
    trackMatch: ["职场", "干货", "Excel", "办公", "PPT"],
    track: "职场",
    headline: "72h 出现 2 个新低粉爆款",
    delta: "「新人视角」结构异常爆发",
    actionPrompt: "请基于职场干货赛道最近 72 小时的新低粉爆款，帮我重新生成选题策略",
  },
  {
    trackMatch: ["母婴", "育儿", "亲子", "宝宝"],
    track: "育儿",
    headline: "「即时解法」内容互动率创新高",
    delta: "收藏率 3.2x，评论区需求密集",
    actionPrompt: "请基于育儿赛道增长趋势，帮我生成适合新手账号的选题策略",
  },
  {
    trackMatch: ["美食", "探店", "做饭", "烹饪", "菜谱", "吃"],
    track: "美食",
    headline: "本地探店热度持续攀升",
    delta: "「人均 XX 元」CTR +18%",
    actionPrompt: "请帮我分析美食探店赛道最近 7 天的趋势变化",
  },
  {
    trackMatch: ["健身", "减脂", "运动", "瑜伽", "跑步"],
    track: "健身",
    headline: "「对比图」类内容逆势增长",
    delta: "30天挑战完播率 -12%，转向短周期",
    actionPrompt: "请帮我重新评估健身减脂赛道的机会",
  },
  {
    trackMatch: ["宠物", "萌宠", "猫", "狗", "养猫", "养狗"],
    track: "宠物",
    headline: "「宠物 + 职场」跨界内容爆发",
    delta: "互动率 2.1x，低粉爆款频出",
    actionPrompt: "请帮我分析宠物+职场跨界内容的机会",
  },
  {
    trackMatch: ["搞钱", "副业", "理财", "赚钱", "创业"],
    track: "副业",
    headline: "「真实记录」搞钱内容稳定起量",
    delta: "抖音同类开始下滑，小红书接力",
    actionPrompt: "请帮我对比搞钱/副业赛道在抖音和小红书的表现差异",
  },
  {
    trackMatch: ["情感", "恋爱", "婚姻", "两性"],
    track: "情感",
    headline: "视频号分享率飙升",
    delta: "+34%，中年女性占 67%",
    actionPrompt: "请帮我判断情感类内容在视频号的新机会",
  },
  {
    trackMatch: ["旅行", "旅游", "出行", "自驾"],
    track: "旅行",
    headline: "「小众目的地」笔记流量暴涨",
    delta: "互动率 +52%，收藏率 3.1x",
    actionPrompt: "请帮我分析旅行赛道小众目的地内容的爆款机会",
  },
  {
    trackMatch: ["数码", "科技", "手机", "电脑", "AI"],
    track: "数码",
    headline: "「真实体验」评测内容受追捧",
    delta: "完播率 +28%，低粉爆款占比升",
    actionPrompt: "请帮我分析数码科技赛道的内容趋势和机会",
  },
  {
    trackMatch: ["教育", "知识", "学习", "考研", "考公"],
    track: "知识",
    headline: "「碎片化知识」短视频持续增长",
    delta: "收藏率 2.8x，评论区高频提问",
    actionPrompt: "请帮我分析知识类内容在短视频平台的最新趋势",
  },
  {
    trackMatch: ["居家", "家居", "装修", "收纳"],
    track: "家居",
    headline: "「改造前后」内容爆发式增长",
    delta: "低粉爆款占比 38%",
    actionPrompt: "请帮我分析家居改造类内容的爆款模式",
  },
  {
    trackMatch: ["摄影", "拍照", "修图", "Vlog"],
    track: "摄影",
    headline: "手机摄影教程需求激增",
    delta: "搜索量 +45%，教程类完播率高",
    actionPrompt: "请帮我分析摄影教程赛道的内容机会",
  },
  {
    trackMatch: ["游戏", "电竞", "王者", "原神"],
    track: "游戏",
    headline: "「攻略+搞笑」混合内容起量",
    delta: "互动率 1.9x，评论区活跃",
    actionPrompt: "请帮我分析游戏赛道的内容趋势和低粉机会",
  },
  {
    trackMatch: ["音乐", "翻唱", "乐器", "唱歌"],
    track: "音乐",
    headline: "「教学+表演」内容稳定增长",
    delta: "完播率 +22%，粉丝粘性高",
    actionPrompt: "请帮我分析音乐赛道的内容创作机会",
  },
];

/** 通用 fallback 卡片（无匹配时使用） */
const FALLBACK_CARDS: InsightCard[] = [
  {
    id: "fallback-1",
    track: "抖音",
    headline: "算法调整，完播率权重提升",
    delta: "3 分钟内容获更多曝光",
    actionPrompt: "请帮我分析抖音最近的算法调整对我的内容策略有什么影响",
  },
  {
    id: "fallback-2",
    track: "小红书",
    headline: "「笔记灵感」AI 辅助创作上线",
    delta: "创作效率 +40%，新号友好",
    actionPrompt: "请帮我分析 AI 辅助创作工具对内容创作者的影响",
  },
  {
    id: "fallback-3",
    track: "全平台",
    headline: "短剧带货内容爆发式增长",
    delta: "新号入局窗口期，低粉爆款频出",
    actionPrompt: "请帮我判断短剧带货赛道的机会和风险",
  },
];

/* ── 生成情报卡片 ─────────────────────────────────────────── */

/**
 * 融合策略：
 * 1. 有高分历史结果 → 生成"深挖机会"卡片（真实数据驱动）
 * 2. 有低分历史结果 → 生成"换方向"卡片（真实数据驱动）
 * 3. 有 niche/历史关键词 → 匹配行业情报池（行业洞察）
 * 4. 都没有 → 通用 fallback
 *
 * 最终输出 3 张卡片，优先级：真实数据 > 行业情报 > 通用
 */
function generateInsightCards(
  nicheKeywords: string[],
  results: Array<{ query: string; score?: number; taskIntent?: string; createdAt?: string }>,
  connectedPlatforms: string[],
): InsightCard[] {
  const cards: InsightCard[] = [];

  // ── 1. 真实数据驱动的卡片 ──
  const recentResults = [...results]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 10);

  // 高分结果 → 深挖机会（带具体数据）
  const highScoreResults = recentResults.filter((r) => (r.score ?? 0) >= 60);
  if (highScoreResults.length > 0) {
    const best = highScoreResults[0];
    const queryShort = best.query.length > 12 ? best.query.slice(0, 12) + "…" : best.query;
    cards.push({
      id: "data-high-score",
      track: best.taskIntent === "topic_strategy" ? "选题方向" : "爆款预测",
      headline: `「${queryShort}」得分 ${best.score}，值得深挖`,
      delta: `高于 ${Math.round(((best.score ?? 0) / 100) * 85)}% 的同类选题`,
      actionPrompt: `请帮我围绕「${best.query}」做更深入的内容拆解和执行建议`,
    });
  }

  // 低分结果 → 换方向（带建设性建议）
  const lowScoreResults = recentResults.filter((r) => (r.score ?? 0) > 0 && (r.score ?? 0) < 40);
  if (lowScoreResults.length > 0 && cards.length < 2) {
    const worst = lowScoreResults[0];
    const queryShort = worst.query.length > 12 ? worst.query.slice(0, 12) + "…" : worst.query;
    cards.push({
      id: "data-low-score",
      track: "方向调整",
      headline: `「${queryShort}」竞争激烈，建议换角度`,
      delta: "尝试细分赛道或差异化内容形式",
      actionPrompt: `「${worst.query}」得分较低，请帮我找到这个赛道中更有机会的细分方向`,
    });
  }

  // ── 2. 行业情报池匹配 ──
  // 从 niche + 历史查询中提取所有关键词
  const historyKeywords: string[] = [];
  for (const r of recentResults) {
    const words = r.query
      .replace(/[？?！!。，,、\s]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 2);
    historyKeywords.push(...words.slice(0, 3));
  }
  const allKeywords = [...nicheKeywords, ...historyKeywords];

  if (allKeywords.length > 0) {
    // 匹配情报池
    const matched = INSIGHT_POOL.filter((insight) =>
      insight.trackMatch.some((kw) =>
        allKeywords.some((userKw) => userKw.includes(kw) || kw.includes(userKw)),
      ),
    );
    // 随机打乱匹配结果，避免每次看到同样的
    const shuffled = matched.sort(() => Math.random() - 0.5);
    for (const insight of shuffled) {
      if (cards.length >= 3) break;
      // 避免重复赛道
      if (cards.some((c) => c.track === insight.track)) continue;
      cards.push({
        id: `pool-${insight.track}`,
        track: insight.track,
        headline: insight.headline,
        delta: insight.delta,
        actionPrompt: insight.actionPrompt,
      });
    }
  }

  // ── 3. 已连接平台专属建议 ──
  if (cards.length < 3 && connectedPlatforms.length > 0) {
    const platformNames: Record<string, string> = {
      douyin: "抖音",
      xiaohongshu: "小红书",
      kuaishou: "快手",
    };
    for (const pid of connectedPlatforms) {
      if (cards.length >= 3) break;
      if (cards.some((c) => c.track === (platformNames[pid] || pid))) continue;
      const pName = platformNames[pid] || pid;
      cards.push({
        id: `platform-${pid}`,
        track: pName,
        headline: `${pName}近期内容趋势变化`,
        delta: "对比同行数据，发现增长机会",
        actionPrompt: `请帮我分析我在${pName}上的内容表现，对比同赛道优秀账号，找到提升方向`,
      });
    }
  }

  // ── 4. 通用 fallback ──
  if (cards.length < 3) {
    for (const fb of FALLBACK_CARDS) {
      if (cards.length >= 3) break;
      cards.push(fb);
    }
  }

  return cards.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  DashboardInsights 主组件 — 卡片式横向展示，支持收起/展开              */
/* ------------------------------------------------------------------ */

export function DashboardInsights({
  onQuickAction,
}: {
  onQuickAction: (prompt: string) => void;
}) {
  const { state } = useAppStore();
  const [expanded, setExpanded] = useState(true);

  const nicheKeywords = useMemo(
    () => parseNicheKeywords(state.userProfile.niche),
    [state.userProfile.niche],
  );

  const connectedPlatforms = useMemo(
    () => state.selectedPlatformIds,
    [state.selectedPlatformIds],
  );

  const cards = useMemo(
    () => generateInsightCards(nicheKeywords, state.results, connectedPlatforms),
    [nicheKeywords, state.results, connectedPlatforms],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-2 pt-5 sm:px-6">
      {/* 标题行 + 收起/展开按钮 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-gray-50"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-900">
          <Radar className="h-2.5 w-2.5 text-white" />
        </div>
        <span className="flex-1 text-xs font-medium text-gray-500">
          {expanded ? "赛道情报" : `赛道情报 · ${cards.map((c) => c.track).join(" / ")}`}
        </span>
        <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
          {cards.length} 条
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </span>
      </button>

      {/* 展开态：卡片横向排列 */}
      {expanded && (
        <div className="grid grid-cols-3 gap-2.5">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onQuickAction(card.actionPrompt)}
              className="group flex flex-col rounded-xl border border-gray-100 bg-white px-3.5 py-3 text-left transition-all hover:border-gray-200 hover:shadow-sm"
            >
              {/* 赛道标签 */}
              <span className="mb-1.5 inline-flex w-fit rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {card.track}
              </span>

              {/* 标题 */}
              <span className="mb-1 line-clamp-2 text-[13px] font-medium leading-snug text-gray-800">
                {card.headline}
              </span>

              {/* 变化指标 */}
              <span className="mb-2 text-[11px] text-gray-400">
                {card.delta}
              </span>

              {/* 追问箭头 */}
              <div className="mt-auto flex items-center gap-1 text-[11px] text-gray-300 transition-colors group-hover:text-gray-600">
                <span>追问</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
