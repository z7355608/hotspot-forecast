/**
 * PromptTemplates — Module B
 * ==========================
 * 嵌入 AIWorkbench 下方的「推荐给你」prompt 模板卡片区。
 * 根据 OnboardingContext 中的 userGoal / userPlatforms 个性化排序。
 */

import { ArrowRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../lib/onboarding-context";

interface PromptCard {
  id: string;
  label: string;
  prompt: string;
  tag?: string;
  tagColor?: string;
}

/* ------------------------------------------------------------------ */
/*  Prompt 模板库                                                       */
/* ------------------------------------------------------------------ */

const ALL_PROMPTS: PromptCard[] = [
  // topics
  {
    id: "p1",
    label: "本周小红书美妆爆款方向",
    prompt: "帮我分析小红书美妆赛道本周爆款方向，我是5000粉的新号",
    tag: "选题",
    tagColor: "#8979FF",
  },
  {
    id: "p2",
    label: "抖音职场干货赛道分析",
    prompt: "分析抖音职场干货赛道最近30天的爆款规律，适合1万粉的账号",
    tag: "选题",
    tagColor: "#8979FF",
  },
  {
    id: "p3",
    label: "下个月哪个内容方向会爆？",
    prompt: "根据当前平台趋势，预测下个月在抖音最容易爆的内容方向",
    tag: "预测",
    tagColor: "#36B37E",
  },
  // viral
  {
    id: "p4",
    label: "拆解一条爆款视频",
    prompt: "帮我拆解这条视频为什么会爆，分析其标题、开头和内容结构",
    tag: "拆解",
    tagColor: "#FF928A",
  },
  {
    id: "p5",
    label: "学习百万播放的标题套路",
    prompt: "分析抖音美食赛道近期百万播放视频的标题规律，总结可复用的框架",
    tag: "拆解",
    tagColor: "#FF928A",
  },
  // predict
  {
    id: "p6",
    label: "我的下一条视频能爆吗？",
    prompt: "预测一条关于「职场新人Excel入门」主题的视频在抖音的爆款概率",
    tag: "预测",
    tagColor: "#36B37E",
  },
  {
    id: "p7",
    label: "B站最近什么赛道在涨号？",
    prompt: "分析B站近期哪些内容赛道的中小创作者涨粉最快",
    tag: "趋势",
    tagColor: "#0EA5E9",
  },
  {
    id: "p8",
    label: "我的账号诊断",
    prompt: "诊断一下我的账号数据，找出最近互动率下滑的原因和改进方向",
    tag: "诊断",
    tagColor: "#B07D2A",
  },
];

/* 按 goal 排序 */
function getPersonalizedPrompts(
  goal: string | null,
  platforms: string[],
): PromptCard[] {
  let ordered = [...ALL_PROMPTS];

  if (goal === "topics") {
    ordered = [...ALL_PROMPTS.filter((p) => p.tag === "选题"), ...ALL_PROMPTS.filter((p) => p.tag !== "选题")];
  } else if (goal === "viral") {
    ordered = [...ALL_PROMPTS.filter((p) => p.tag === "拆解"), ...ALL_PROMPTS.filter((p) => p.tag !== "拆解")];
  } else if (goal === "predict") {
    ordered = [...ALL_PROMPTS.filter((p) => p.tag === "预测"), ...ALL_PROMPTS.filter((p) => p.tag !== "预测")];
  }

  // Platform-aware: prioritize platform mentions
  if (platforms.length > 0 && !platforms.includes("multi")) {
    const platformKeywords: Record<string, string> = {
      douyin: "抖音",
      xhs: "小红书",
      wechat: "微信",
      youtube: "YouTube",
      bilibili: "B站",
    };
    const keywords = platforms.map((p) => platformKeywords[p]).filter(Boolean);
    if (keywords.length > 0) {
      ordered = [
        ...ordered.filter((p) => keywords.some((k) => p.prompt.includes(k) || p.label.includes(k))),
        ...ordered.filter((p) => !keywords.some((k) => p.prompt.includes(k) || p.label.includes(k))),
      ];
    }
  }

  return ordered.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function PromptTemplates({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const { welcomeCompleted, userGoal, userPlatforms } = useOnboarding();
  const navigate = useNavigate();
  const prompts = getPersonalizedPrompts(userGoal, userPlatforms);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-4">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[12px] text-[#99A1AF]">
          {welcomeCompleted ? "推荐给你" : "快速开始"}
        </span>
        <button
          onClick={() => navigate("/results/demo")}
          className="flex items-center gap-1 text-[12px] text-[#8979FF] hover:text-[#6B5ED6] transition-colors"
        >
          <span>看看爆款预测示例</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {prompts.map((card) => (
          <button
            key={card.id}
            onClick={() => onSelect(card.prompt)}
            className="flex items-start gap-2.5 p-3.5 rounded-[14px] border border-[#F3F4F6] bg-white hover:border-[rgba(137,121,255,0.3)] hover:shadow-[0_2px_8px_rgba(137,121,255,0.08)] transition-all duration-150 text-left group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                {card.tag && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] shrink-0"
                    style={{ backgroundColor: `${card.tagColor}18`, color: card.tagColor }}
                  >
                    {card.tag}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#364153] leading-[17px] group-hover:text-[#1E2939] transition-colors">
                {card.label}
              </p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[#D1D5DC] group-hover:text-[#8979FF] shrink-0 mt-0.5 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
