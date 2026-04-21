/**
 * New Prediction Result Renderer
 * ===============================
 * 爆款预测结果页 - 极简设计风格
 */

import { useState, useEffect } from "react";
import {
  RotateCcw, Sparkles, TrendingUp, BarChart3, Target,
  AlertCircle, Bell, Coins, ChevronDown, Play, ArrowRight,
  AlertTriangle, FileText, CalendarDays, Search, Zap,
  ChevronUp,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  导航栏                                                             */
/* ------------------------------------------------------------------ */
function DemoNavbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#F3F4F6] h-[52px] flex items-center px-5">
      <div className="flex items-center justify-between w-full max-w-[960px] mx-auto">
        <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-[#F9FAFB] transition-colors">
          <span className="text-[14px] text-[#1E2939]">douhao 2.0 seed</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#99A1AF]" />
        </button>
        <div className="flex items-center gap-2">
          <button className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F9FAFB] transition-colors">
            <Bell className="w-4 h-4 text-[#6A7282]" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#F9FAFB] rounded-lg hover:bg-[#F3F4F6] transition-colors">
            <Coins className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[13px] text-[#1E2939]">2,500</span>
          </button>
          <div className="w-8 h-8 rounded-lg bg-[#1a6b5a] flex items-center justify-center text-[12px] text-white">宁</div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  圆形进度条                                                         */
/* ------------------------------------------------------------------ */
function CircularGauge({ value, size = 144 }: { value: number; size?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayValue / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current += 2;
        if (current >= value) { setDisplayValue(value); clearInterval(interval); }
        else setDisplayValue(current);
      }, 20);
      return () => clearInterval(interval);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#E2E1EE" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#8979FF" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] text-[#191B24]">{displayValue}%</span>
        <span className="text-[12px] text-[#6A7282] mt-0.5">爆款概率</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  季节性雷达图                                                       */
/* ------------------------------------------------------------------ */
function SeasonalTrendChart() {
  const cx = 142.5; const cy = 116; const innerR = 40; const outerR = 96;
  const segments = [
    { label: "5-6月", angle: -90 }, { label: "7-8月", angle: -30 },
    { label: "9-10月", angle: 30 }, { label: "11-12月", angle: 90 },
    { label: "1-2月", angle: 150 }, { label: "3-4月", angle: 210 },
  ];
  const values = [0.52, 0.42, 0.48, 0.58, 0.38, 0.95];
  const radarPoints = segments.map(({ angle }, i) => {
    const rad = (angle * Math.PI) / 180;
    const r = innerR + values[i] * (outerR - innerR);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  });
  const radarPath = radarPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="relative w-[270px] h-[234px] mx-auto">
      <svg viewBox="0 0 285 234" className="w-full h-full">
        {[0.25, 0.5, 0.75, 1].map((level) => (
          <circle key={level} cx={cx} cy={cy} r={innerR + level * (outerR - innerR)}
            fill="none" stroke="#DBDEE4" strokeWidth="1" opacity="0.6" />
        ))}
        {segments.map(({ angle }) => {
          const rad = (angle * Math.PI) / 180;
          return <line key={angle}
            x1={cx + innerR * Math.cos(rad)} y1={cy + innerR * Math.sin(rad)}
            x2={cx + outerR * Math.cos(rad)} y2={cy + outerR * Math.sin(rad)}
            stroke="#DBDEE4" strokeWidth="1" />;
        })}
        <path d={radarPath} fill="rgba(137,121,255,0.15)" stroke="#8979FF" strokeWidth="1.5" />
        {(() => { const p = radarPoints[5]; return (<><circle cx={p.x} cy={p.y} r="7" fill="rgba(137,121,255,0.25)" /><circle cx={p.x} cy={p.y} r="4" fill="#8979FF" /></>); })()}
      </svg>
      {segments.map(({ label, angle }, i) => {
        const rad = (angle * Math.PI) / 180; const lr = 118;
        const x = cx + lr * Math.cos(rad); const y = cy + lr * Math.sin(rad);
        const isPeak = i === 5;
        return (
          <div key={label} className={`absolute text-center ${isPeak ? "text-[#8979FF]" : "text-[#54555A]"}`}
            style={{ left: `${(x/285)*100}%`, top: `${(y/234)*100}%`, transform: "translate(-50%,-50%)", fontSize: "11px", fontWeight: isPeak ? 600 : 400 }}>
            {label}{isPeak && <div style={{ fontSize: "9px", marginTop: "1px" }}>高峰</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  柱状图                                                             */
/* ------------------------------------------------------------------ */
function BarChart() {
  const data = [
    { label: "头部KOL\n（百万粉+）", value: 140 },
    { label: "标准KOL\n(10万粉+）", value: 185 },
    { label: "强KOC\n(1万粉+）", value: 120 },
    { label: "标准KOC\n（1万粉以下）", value: 155 },
  ];
  return (
    <div className="relative w-full h-[240px]">
      <div className="absolute left-0 top-0 right-0 bottom-[36px] flex flex-col justify-between">
        {[200, 150, 100, 50, 0].map((v) => (
          <div key={v} className="flex items-center gap-2">
            <span className="text-[11px] text-[#99A1AF] w-7 text-right shrink-0">{v}</span>
            <div className="flex-1 border-t border-[#F3F4F6]" />
          </div>
        ))}
      </div>
      <div className="absolute left-10 right-0 top-0 bottom-[36px] flex items-end justify-around gap-2 px-2">
        {data.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="w-full bg-[#B3A9FF] rounded-t-[8px]" style={{ height: `${(item.value/200)*100}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute left-10 right-0 bottom-0 flex justify-around px-2 h-[36px] items-start pt-1">
        {data.map((item, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-[#99A1AF] leading-[14px] whitespace-pre-line">{item.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  饼图                                                               */
/* ------------------------------------------------------------------ */
function PieChart() {
  const data = [
    { label: "命中kol", value: 150, color: "#8979FF" },
    { label: "命中koc", value: 150, color: "#B3CFFF" },
    { label: "新创作者", value: 120, color: "#F7D5A6" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  let cur = -90;
  const slices = data.map((item) => {
    const angle = (item.value / total) * 360;
    const s = cur; cur += angle; const e = cur;
    const r = 76;
    const sRad = (s * Math.PI) / 180; const eRad = (e * Math.PI) / 180;
    const x1 = 100 + r * Math.cos(sRad); const y1 = 100 + r * Math.sin(sRad);
    const x2 = 100 + r * Math.cos(eRad); const y2 = 100 + r * Math.sin(eRad);
    return { ...item, d: `M 100 100 L ${x1} ${y1} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2} Z` };
  });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 200 200" className="w-[130px] h-[130px] shrink-0">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="#fff" strokeWidth="2" />)}
        <circle cx="100" cy="100" r="44" fill="white" />
      </svg>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: item.color }} />
            <div>
              <div className="text-[12px] text-[#364153]">{item.label}</div>
              <div className="text-[12px] text-[#99A1AF]">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  视频推荐数据（按方向）                                             */
/* ------------------------------------------------------------------ */
const DIRECTION_VIDEOS: Record<number, {
  category: string;
  videos: { title: string; tags: string[]; imageUrl: string; hook: string; why: string; script: string }[];
}[]> = {
  0: [
    {
      category: "#职场新人入门",
      videos: [
        {
          title: "打工第1天，老板让我做数据报告",
          tags: ["入职场景", "新人痛点"],
          imageUrl: "https://images.unsplash.com/photo-1664575599736-c5197c684128?w=600&q=80",
          hook: "「你Excel会吗？」——第一天就被问到了",
          why: "入职场景高共鸣，评论区容易引发「我也是」的互动浪潮，完播率预测 62%",
          script: "开头5秒：特写电脑屏幕，空白 Excel → 中段：3个必学函数演示 → 结尾：成品截图 + 「明天继续」",
        },
        {
          title: "Excel 5个函数，新人必会，老人必知",
          tags: ["干货教程", "实用技能"],
          imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80",
          hook: "这5个函数，用了10年的老员工都不一定全会",
          why: "数字钩子 + 「对比」结构天然制造好奇心，收藏率预测高于同类 40%",
          script: "快切节奏，每个函数 8 秒演示，加字幕强调，结尾放一个「进阶版」悬念",
        },
        {
          title: "职场数据可视化，从0到1只要10分钟",
          tags: ["效率提升", "图表制作"],
          imageUrl: "https://images.unsplash.com/photo-1543286386-713bdd548da4?w=600&q=80",
          hook: "领导看到这份报告，直接说「下次汇报让你来」",
          why: "结果导向，让观众看到「终态」激发学习欲，适合做系列第一集",
          script: "先展示成品图表（3秒）→ 倒叙讲制作过程 → 10分钟时间轴跳剪",
        },
      ],
    },
  ],
  1: [
    {
      category: "#效率对比实测",
      videos: [
        {
          title: "用 AI 写 PPT vs 自己写，差距有多大",
          tags: ["AI工具", "对比实测"],
          imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80",
          hook: "同一个 PPT，一个花了2小时，一个花了8分钟",
          why: "极端时间差 + AI话题双重热点，分享欲极强，预测转发率是均值的 2.3 倍",
          script: "分屏对比剪辑，左屏手动制作（加速），右屏 AI 生成（实时），最后并排对比",
        },
        {
          title: "Excel 手动 vs 快捷键，谁更快？",
          tags: ["操作对比", "快捷技巧"],
          imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80",
          hook: "我同事用鼠标点了 5 分钟，我按了 3 个键就完成了",
          why: "「被颠覆感」是驱动转发的核心情绪，操作对比可重复学习，保存率高",
          script: "计时画面 + 特写键盘，中途暂停强调快捷键，结尾用秒数做对比字幕",
        },
        {
          title: "普通周报 vs 高效模板，领导反应差多少",
          tags: ["职场实测", "模板分享"],
          imageUrl: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&q=80",
          hook: "写了三年周报，被领导批了三年，直到我发现这个模板",
          why: "情绪共鸣 + 实操价值双线并行，评论区引导填写「你的领导怎么看」互动题",
          script: "对比展示两份周报截图 → 领导回复截图（打码）→ 揭晓模板结构",
        },
      ],
    },
  ],
  2: [
    {
      category: "#面试升职干货",
      videos: [
        {
          title: "面试被问这个，99%的人都答错了",
          tags: ["面试技巧", "情绪共鸣"],
          imageUrl: "https://images.unsplash.com/photo-1565688534245-05d6b5be184a?w=600&q=80",
          hook: "「你有什么缺点？」——这道题你真的会答吗",
          why: "数字震撼 + 反常识结构，点击率高，职场类评论互动密集，账号权重提升快",
          script: "先演「错误答法」（5秒）→ 说出正确逻辑 → 给3个可直接套用的话术",
        },
        {
          title: "升职申请被拒后，我做了这3件事扭转",
          tags: ["升职策略", "真实案例"],
          imageUrl: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&q=80",
          hook: "被拒那天我哭了，但3个月后我自己来找了领导谈",
          why: "真实情绪开头触发代入感，干货主体保障留存，是情绪 + 价值组合的爆款公式",
          script: "第1句讲结局（好结果）→ 倒叙讲被拒 → 3个策略各10秒 → 呼应开头",
        },
        {
          title: "应届生 vs 3年老员工，职场汇报差距在哪",
          tags: ["职场对比", "成长赛道"],
          imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&q=80",
          hook: "同一份数据，两个人汇报完，领导的表情完全不同",
          why: "对比结构 + 「年限」标签让目标用户强烈代入，完播率预测超过 65%",
          script: "角色扮演：应届生版本（对话）→ 有经验版本（对话）→ 总结关键差异点",
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  可展开视频卡片                                                     */
/* ------------------------------------------------------------------ */
function VideoCard({
  title, tags, imageUrl, hook, why, script,
}: {
  title: string; tags: string[]; imageUrl: string;
  hook: string; why: string; script: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-[16px] border bg-white overflow-hidden transition-all duration-200 ${expanded ? "border-[rgba(137,121,255,0.3)] shadow-[0_4px_16px_rgba(137,121,255,0.1)]" : "border-[#F3F4F6] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"}`}>
      {/* 封面 */}
      <div className="h-[148px] bg-gray-100 relative overflow-hidden">
        <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* 标题 + 标签 */}
      <div className="px-4 pt-3.5 pb-0">
        <h4 className="text-[13px] text-[#1E2939] leading-[18px] mb-2">{title}</h4>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#F5F5F5] rounded-[6px] text-[10px] text-[#5E6776]">{tag}</span>
          ))}
        </div>
      </div>

      {/* 展开按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 mt-1 text-[11px] text-[#99A1AF] hover:text-[#8979FF] transition-colors group"
      >
        <span className="group-hover:text-[#8979FF] transition-colors">{expanded ? "收起分析" : "查看拍摄分析"}</span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5" />
          : <ChevronDown className="w-3.5 h-3.5" />
        }
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#F5F4FF]">
          <div className="pt-3 space-y-2.5">
            {/* 黄金钩子 */}
            <div className="rounded-[10px] bg-[#FFFBF0] px-3 py-2.5">
              <div className="text-[10px] text-[#B07D2A] mb-1">黄金开头钩子</div>
              <div className="text-[12px] text-[#4A3C10] leading-[17px]">「{hook}」</div>
            </div>
            {/* 为什么推荐 */}
            <div className="rounded-[10px] bg-[#F9F8FF] px-3 py-2.5">
              <div className="text-[10px] text-[#8979FF] mb-1">为什么推荐</div>
              <div className="text-[12px] text-[#4A5565] leading-[17px]">{why}</div>
            </div>
            {/* 拍摄思路 */}
            <div className="rounded-[10px] bg-[#F6FFFE] px-3 py-2.5">
              <div className="text-[10px] text-[#0E8A77] mb-1">拍摄思路</div>
              <div className="text-[12px] text-[#374151] leading-[17px]">{script}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  现在开始行动 — CTA 按钮组                                         */
/* ------------------------------------------------------------------ */
function ActionButtons({ directionIndex }: { directionIndex: number }) {
  const directionLabels = ["职场新人 Excel 入门", "打工人效率对比实测", "面试/升职必备技能"];
  const label = directionLabels[directionIndex];

  const actions = [
    {
      icon: FileText,
      color: "#8979FF",
      bg: "#F0EEFF",
      title: "帮我写第一条视频脚本",
      desc: `根据「${label}」选题，生成可直接拍摄的完整分镜脚本`,
      badge: "最常用",
      badgeBg: "#F0EEFF",
      badgeColor: "#8979FF",
    },
    {
      icon: Zap,
      color: "#FF928A",
      bg: "#FFF4F3",
      title: "一键生成标题 & 文案",
      desc: "生成10个高点击标题 + 正文文案框架 + 话题标签推荐",
      badge: "省时",
      badgeBg: "#FFF4F3",
      badgeColor: "#FF928A",
    },
    {
      icon: Search,
      color: "#36B37E",
      bg: "#F0FAF6",
      title: "深度竞品分析",
      desc: "拆解同赛道近30天爆款账号的发布规律与内容结构",
      badge: null,
      badgeBg: "",
      badgeColor: "",
    },
    {
      icon: CalendarDays,
      color: "#0EA5E9",
      bg: "#F0F9FF",
      title: "制定30天内容日历",
      desc: "生成本月发布计划、选题安排与最佳发布时间建议",
      badge: null,
      badgeBg: "",
      badgeColor: "",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <button
            key={i}
            className="flex items-start gap-3 p-4 rounded-[16px] border border-[#F3F4F6] bg-white hover:border-[rgba(137,121,255,0.25)] hover:shadow-[0_2px_12px_rgba(137,121,255,0.08)] transition-all duration-200 text-left group"
          >
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: action.bg }}>
              <Icon className="w-4 h-4" style={{ color: action.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] text-[#1E2939] group-hover:text-[#8979FF] transition-colors">
                  {action.title}
                </span>
                {action.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] shrink-0"
                    style={{ backgroundColor: action.badgeBg, color: action.badgeColor }}>
                    {action.badge}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#99A1AF] leading-[16px]">{action.desc}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#D1D5DC] group-hover:text-[#8979FF] shrink-0 mt-1 transition-colors" />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */
export function NewPredictionResult() {
  // 当前选中的方向（0=Excel入门, 1=效率对比, 2=面试升职）
  const [selectedDirection, setSelectedDirection] = useState(0);

  const directions = [
    { title: "职场新人 Excel 入门", tag: "推荐", tagColor: "#8979FF", tagBg: "#F0EEFF" },
    { title: "打工人效率对比实测", tag: "高潜", tagColor: "#FF928A", tagBg: "#FFF4F3" },
    { title: "面试/升职必备技能", tag: "情绪共鸣", tagColor: "#99A1AF", tagBg: "#F9FAFB" },
  ];

  const currentVideos = DIRECTION_VIDEOS[selectedDirection] ?? [];

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <DemoNavbar />

      <div className="px-6 py-8">
        <div className="max-w-[896px] mx-auto space-y-4">

          {/* 查询回显 */}
          <div className="flex items-center justify-between px-1 text-[12px] text-[#99A1AF]">
            <span>拍什么会火</span>
            <button className="flex items-center gap-1 hover:text-gray-600 transition-colors">
              <RotateCcw className="w-3 h-3" /><span>重新提问</span>
            </button>
          </div>

          {/* ① 主推荐卡片 */}
          <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] overflow-hidden">
            <div className="px-7 pt-7 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    <span className="inline-block px-2 py-0.5 bg-[#F9FAFB] rounded text-[12px] text-[#99A1AF]">综合判断</span>
                  </div>
                  <h2 className="text-[20px] text-[#101828] leading-[28px] mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#8979FF] shrink-0" />
                    <span>极力推荐你拍：职场必会技巧</span>
                  </h2>
                  <p className="text-[14px] text-[#1E2939] leading-[26px]">
                    现在就是你的窗口期。「职场新人视角」在这条赛道里几乎是空白——头部KOL在教技术，没人在讲<span className="text-[#8979FF]">感受</span>。你 5 万粉的体量正好，大账号做不了你这个调性，小账号又没你这个积累。<span className="text-[#1E2939] border-b border-[#1E2939]">这一波，你能吃到。</span>
                  </p>
                </div>
                <div className="shrink-0"><CircularGauge value={68} /></div>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-[#F9FAFB]">
              <div className="px-6 py-4 border-r border-[#F9FAFB]">
                <div className="flex items-center gap-1 text-[12px] text-[#B10C16] mb-2"><TrendingUp className="w-3.5 h-3.5" /><span>赛道热度</span></div>
                <div className="text-[14px] text-[#364153] mb-1">稳定偏升</div>
                <div className="text-[12px] text-[#99A1AF]">近 30 天搜索量 +11%</div>
              </div>
              <div className="px-6 py-4 border-r border-[#F9FAFB]">
                <div className="flex items-center gap-1 text-[12px] text-[#6B38D4] mb-2"><BarChart3 className="w-3.5 h-3.5" /><span>竞争程度</span></div>
                <div className="text-[14px] text-[#364153] mb-1">中等偏高</div>
                <div className="text-[12px] text-[#99A1AF]">头部账号集中度较低</div>
              </div>
              <div className="px-6 py-4">
                <div className="flex items-center gap-1 text-[12px] text-[#8979FF] mb-2"><Target className="w-3.5 h-3.5" /><span>你的差异空间</span></div>
                <div className="text-[14px] text-[#364153] mb-1">较大</div>
                <div className="text-[12px] text-[#99A1AF]">新人视角仍有空白</div>
              </div>
            </div>
          </div>

          {/* ② 好时机 + 建议切入（可点击选方向）+ 需注意 */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* 左：现在是好时机 */}
            <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] px-5 py-6">
              <div className="mb-2"><span className="text-[14px] text-[#1E2939]">现在是好时机</span></div>
              <p className="text-[12px] text-[#6A7282] leading-[20px] mb-5">
                每年 3–4 月为职场新人内容的搜索高峰。你目前处于成长期，正是建立垂类认知的窗口期，不宜再等待。
              </p>
              <SeasonalTrendChart />
            </div>

            {/* 右：建议切入方向（可点击）+ 需注意 */}
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] px-[24px] py-[47px]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center justify-center w-5 h-5 bg-[#101828] rounded-full">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[14px] text-[#1E2939]">建议切入方向</span>
                  <span className="ml-auto text-[11px] text-[#99A1AF]">点击选择 · 推荐内容随之切换</span>
                </div>

                <div className="space-y-2 mb-4">
                  {directions.map((item, i) => {
                    const active = selectedDirection === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDirection(i)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[12px] border transition-all duration-200 ${
                          active
                            ? "border-[rgba(137,121,255,0.4)] bg-[#F9F8FF]"
                            : "border-transparent bg-[#F9FAFB] hover:bg-[#F3F4F6]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {/* 单选圆点 */}
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                            active ? "border-[#8979FF]" : "border-[#D1D5DC]"
                          }`}>
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-[#8979FF]" />}
                          </div>
                          <span className={`text-[13px] transition-colors ${active ? "text-[#1E2939]" : "text-[#4A5565]"}`}>
                            {item.title}
                          </span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{ backgroundColor: item.tagBg, color: item.tagColor }}>
                          {item.tag}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="py-3 border-t border-[#F9FAFB] text-[12px] text-[#99A1AF] leading-[18px]">
                  你目前的 Excel 技巧内容可直接复用，调整标题框架为「新人视角」即可降低改造成本。
                </div>
                <div className="flex justify-end mt-2">
                  <button className="flex items-center gap-1 text-[12px] text-[#8979FF] hover:text-[#6B5ED6] transition-colors">
                    <span>查看热门异常数据</span><ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 需注意 */}
              
            </div>
          </div>

          {/* ③ 现在拍什么（随方向联动 + 可展开分析） */}
          <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] p-7">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[14px] text-[#1E2939]">热门作品</span>
              {/* 当前方向指示器 */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F9F8FF] rounded-full border border-[rgba(137,121,255,0.2)]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8979FF]" />
                <span className="text-[11px] text-[#8979FF]">{directions[selectedDirection].title}</span>
              </div>
            </div>

            {currentVideos.map((group, gi) => (
              <div key={gi} className={gi > 0 ? "mt-7" : ""}>
                <div className="flex flex-wrap gap-2 mb-3">
                  {group.category.split(/\s+/).map((kw, ki) => (
                    <span
                      key={ki}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#E9EAEC] bg-white text-[12px] text-[#4A5565] hover:border-[rgba(137,121,255,0.4)] hover:bg-[#F9F8FF] hover:text-[#8979FF] transition-all duration-150 cursor-pointer select-none"
                    >
                      <Search className="w-3 h-3 opacity-50" />
                      {kw}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {group.videos.map((video, vi) => (
                    <VideoCard key={`${selectedDirection}-${gi}-${vi}`} {...video} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ④ 现在开始行动 */}
          <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] p-7">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[14px] text-[#1E2939]">现在开始行动</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F9F8FF] rounded-full">
                <span className="text-[11px] text-[#8979FF]">基于：{directions[selectedDirection].title}</span>
              </div>
            </div>
            <ActionButtons directionIndex={selectedDirection} />
          </div>

          {/* ⑤ 相似账号参考 */}
          <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] p-7">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] text-[#1E2939]">相似账号参考</span>
              <span className="text-[12px] text-[#364153]">近 30 天成长期样本</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { name: "@职场Excel姐", fans: "12.3万", growth: "+2400/月", tag: "教程类" },
                { name: "@办公效率李老师", fans: "8.7万", growth: "+1800/月", tag: "干货类" },
                { name: "@新人打工人日记", fans: "31.5万", growth: "+6200/月", tag: "情绪共鸣" },
              ].map((account, i) => (
                <div key={i} className="rounded-[16px] bg-[#F9FAFB] px-4 py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[12px] text-[#364153]">{account.name}</div>
                    <div className="text-[12px] text-[#99A1AF]">{account.fans} · {account.growth}</div>
                  </div>
                  <span className="px-1.5 py-0.5 bg-white border border-[#F3F4F6] rounded text-[12px] text-[#99A1AF]">{account.tag}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-6 mb-4">
                <h3 className="text-[13px] text-black">月度用户增长</h3>
                <div className="flex items-center gap-4 text-[12px]">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#8979FF]" /><span className="text-[#464554]">新用户</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#FF928A]" /><span className="text-[#464554]">老用户</span></div>
                </div>
              </div>
              <div className="h-[180px]">
                <svg viewBox="0 0 790 180" className="w-full h-full">
                  {[0, 1000, 2000, 3000].map((v, i) => (
                    <text key={v} x="72" y={162 - i * 44} fontSize="11" fill="#99A1AF" textAnchor="end">
                      {v === 0 ? "0" : `${v/1000}k`}
                    </text>
                  ))}
                  {[0,1,2,3].map((i) => <line key={i} x1="82" y1={162 - i*44} x2="740" y2={162 - i*44} stroke="#F3F4F6" strokeWidth="1" />)}
                  <path d="M 120 132 L 260 108 L 400 118 L 540 88 L 680 72 L 680 162 L 120 162 Z" fill="rgba(137,121,255,0.08)" />
                  <path d="M 120 132 L 260 108 L 400 118 L 540 88 L 680 72" fill="none" stroke="#8979FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  <path d="M 120 132 L 260 108 L 400 118 L 540 112 L 680 124" fill="none" stroke="#FF928A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  {["第一周","第二周","第三周","第四周","第五周"].map((label, i) => (
                    <text key={label} x={120 + i*140} y="176" fontSize="11" fill="#99A1AF" textAnchor="middle">{label}</text>
                  ))}
                </svg>
              </div>
            </div>
          </div>

          {/* ⑥ 市场视频数据 */}
          <div className="bg-white rounded-[24px] border border-[#F3F4F6] shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)] p-7">
            <div className="mb-6"><span className="text-[14px] text-[#1E2939]">市场相关视频数据</span></div>
            <div className="grid grid-cols-2 gap-8 items-start">

              {/* 左列：发布账号分布 + 最佳时段 + 热门标签 */}
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[13px] text-[#1E2939] mb-4">发布账号 / 等级分布</h3>
                  <BarChart />
                  <div className="grid grid-cols-3 gap-3 mt-5">
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">相似内容</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[16px] text-black">20</span>
                        <span className="px-1.5 py-0.5 bg-[rgba(0,76,201,0.1)] rounded text-[10px] text-[#004CC9]">已有样本</span>
                      </div>
                    </div>
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">近7天增长</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] text-[#006443]">20%</span>
                        <TrendingUp className="w-4 h-4 text-[#006443]" />
                      </div>
                    </div>
                    <div className="bg-[#F9FAFB] rounded-[14px] p-3.5">
                      <div className="text-[11px] text-[#364153] mb-2">低粉异常占比</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] text-[#BA1A1A]">10%</span>
                        <AlertCircle className="w-4 h-4 text-[#BA1A1A]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 最佳发布时段 */}
                <div className="border-t border-[#F3F4F6] pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] text-[#1E2939]">最佳发布时段</h3>
                    <span className="text-[11px] text-[#99A1AF]">基于同赛道近30天数据</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: "早 07–09", slots: [2, 3, 4, 2, 3, 5, 5] },
                      { label: "午 12–14", slots: [3, 4, 3, 4, 4, 3, 2] },
                      { label: "晚 20–23", slots: [5, 5, 4, 5, 5, 4, 3] },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-[#99A1AF] w-[60px] shrink-0">{row.label}</span>
                        <div className="flex gap-1 flex-1">
                          {row.slots.map((heat, di) => {
                            const cls = heat === 5 ? "bg-[#8979FF]" : heat === 4 ? "bg-[#B3A9FF]" : heat === 3 ? "bg-[#D6D1FF]" : "bg-[#EBEBFB]";
                            return (
                              <div key={di} className={`flex-1 h-6 rounded-[5px] ${cls} relative cursor-default`}>
                                {heat === 5 && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[9px] text-white opacity-90">峰</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-[60px]" />
                      <div className="flex flex-1 gap-1">
                        {["周一","周二","周三","周四","周五","周六","周日"].map((d) => (
                          <div key={d} className="flex-1 text-center text-[9px] text-[#C4C9D4]">{d}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[10px] text-[#99A1AF]">互动热度：</span>
                    {[["#EBEBFB","低"],["#D6D1FF","中"],["#B3A9FF","高"],["#8979FF","峰值"]].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: color }} />
                        <span className="text-[10px] text-[#99A1AF]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 相关热门话题标签 */}
                <div className="border-t border-[#F3F4F6] pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] text-[#1E2939]">相关热门话题标签</h3>
                    <span className="text-[11px] text-[#99A1AF]">近7天播放量</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { tag: "#职场干货", views: "4.2亿", trend: "+18%", w: 88 },
                      { tag: "#Excel技巧", views: "1.8亿", trend: "+31%", w: 62 },
                      { tag: "#职场新人", views: "9600万", trend: "+12%", w: 45 },
                      { tag: "#打工人日常", views: "6.3亿", trend: "+5%",  w: 100 },
                      { tag: "#效率提升",  views: "7100万", trend: "+24%", w: 38 },
                    ].map((item) => (
                      <div key={item.tag} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#8979FF] w-[88px] shrink-0">{item.tag}</span>
                        <div className="flex-1 h-1.5 bg-[#F0EEFF] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#8979FF]" style={{ width: `${item.w}%` }} />
                        </div>
                        <span className="text-[11px] text-[#99A1AF] w-[44px] text-right shrink-0">{item.views}</span>
                        <span className={`text-[10px] w-[36px] text-right shrink-0 ${item.trend.startsWith("+") ? "text-[#36B37E]" : "text-[#BA1A1A]"}`}>
                          {item.trend}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 右列：受众分析 + 热门评论 */}
              <div className="bg-[#F9FAFB] rounded-[20px] p-6 flex flex-col gap-6">
                <div>
                  <h3 className="text-[13px] text-[#1E2939] mb-5">受众分析</h3>
                  <PieChart />
                </div>

                <div className="border-t border-[#EBEBEB] pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] text-[#1E2939]">热门视频评论区</h3>
                    <span className="text-[11px] text-[#99A1AF]">高频词云 · 真实用户声音</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { avatar: "职", color: "#8979FF", bg: "#F0EEFF", name: "职场小白兔", text: "终于有人讲透了！收藏了三遍", likes: 312, hot: true },
                      { avatar: "林", color: "#36B37E", bg: "#F0FAF6", name: "林小鹿在努力", text: "我就是那种用了5年Excel却不会VLOOKUP的人😭", likes: 208, hot: false },
                      { avatar: "打", color: "#FF928A", bg: "#FFF4F3", name: "打工人觉醒", text: "这个我上班第一周就需要啊，晚发了三年", likes: 175, hot: true },
                      { avatar: "鱼", color: "#0EA5E9", bg: "#F0F9FF", name: "鱼唐的日记", text: "求出进阶版！！函数那块我完全跟不上", likes: 143, hot: false },
                      { avatar: "萌", color: "#B07D2A", bg: "#FFFBF0", name: "萌新求带飞", text: "老板今天问我会不会做数据透视表，我哭了", likes: 97, hot: false },
                    ].map((c, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] shrink-0 mt-0.5"
                          style={{ backgroundColor: c.bg, color: c.color }}>
                          {c.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="inline-block max-w-full px-3 py-2 rounded-[12px] rounded-tl-[4px] bg-white border border-[#EBEBEB]">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[11px] text-[#99A1AF]">{c.name}</span>
                              {c.hot && <span className="px-1.5 py-0.5 rounded bg-[#FFF4F3] text-[9px] text-[#FF928A]">热评</span>}
                            </div>
                            <p className="text-[12px] text-[#364153] leading-[17px]">{c.text}</p>
                          </div>
                          <div className="mt-1 pl-1">
                            <span className="text-[10px] text-[#C4C9D4]">👍 {c.likes}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#EBEBEB]">
                    <div className="text-[11px] text-[#99A1AF] mb-2.5">评论高频词</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { word: "收藏了", weight: 3 }, { word: "求进阶", weight: 2 },
                        { word: "晚知道了", weight: 3 }, { word: "新人必看", weight: 2 },
                        { word: "讲得好懂", weight: 1 }, { word: "老板让我做", weight: 2 },
                        { word: "哭了", weight: 1 }, { word: "求模板", weight: 3 },
                        { word: "转发给同事", weight: 1 },
                      ].map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full border border-[#E2E2E2] text-[#5E6776] bg-white"
                          style={{ fontSize: tag.weight === 3 ? "12px" : tag.weight === 2 ? "11px" : "10px" }}>
                          {tag.word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="h-8" />
        </div>
      </div>
    </div>
  );
}