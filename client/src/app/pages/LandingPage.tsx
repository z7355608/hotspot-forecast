import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Play,
  Sparkles,
  TrendingUp,
  Search,
  Eye,
  BarChart3,
  Zap,
  Shield,
  Clock,
  Target,
  Star,
  Check,
  ArrowRight,
  Users,
  Flame,
  Brain,
  MonitorSmartphone,
} from "lucide-react";

/* ─── Hero background thumbnails ─── */
const HERO_THUMBNAILS = [
  "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1533750349088-cd871a92f312?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=300&h=170&fit=crop",
  "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=300&h=170&fit=crop",
];

/* ─── Trusted creators marquee ─── */
const TRUSTED_CREATORS = [
  { name: "小杨哥", followers: "1.2亿", avatar: "🎬" },
  { name: "李子柒", followers: "4200万", avatar: "🌿" },
  { name: "papi酱", followers: "3600万", avatar: "😂" },
  { name: "张同学", followers: "1800万", avatar: "🏠" },
  { name: "刘畊宏", followers: "7600万", avatar: "💪" },
  { name: "董宇辉", followers: "2800万", avatar: "📚" },
  { name: "罗翔", followers: "2500万", avatar: "⚖️" },
  { name: "何同学", followers: "1400万", avatar: "📱" },
  { name: "房琪kiki", followers: "2100万", avatar: "✈️" },
  { name: "毛毛姐", followers: "3200万", avatar: "🎤" },
  { name: "陈翔六点半", followers: "5800万", avatar: "🎭" },
  { name: "仙女酵母", followers: "960万", avatar: "🧪" },
];

/* ─── Showcase videos ─── */
const SHOWCASE_CATEGORIES = ["全部", "美妆", "美食", "职场", "宠物", "生活"];
const SHOWCASE_VIDEOS = [
  { title: "我用超市 9.9 元的产品化了一个全妆", factor: "7.5x", category: "美妆", views: "32.8万", img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=225&fit=crop" },
  { title: "小镇上 5 元一碗的面，我吃了 20 年", factor: "8.2x", category: "美食", views: "31.2万", img: "https://images.unsplash.com/photo-1555126634-323283e090fa?w=400&h=225&fit=crop" },
  { title: "我入职第一天就想跑路，后来…", factor: "7.1x", category: "职场", views: "28.4万", img: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=225&fit=crop" },
  { title: "我家狗子听到洗澡两个字的反应", factor: "9.1x", category: "宠物", views: "45.2万", img: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=225&fit=crop" },
  { title: "租房改造花了 200 元，房东看了都想加租", factor: "5.9x", category: "生活", views: "21.5万", img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=225&fit=crop" },
  { title: "全网最简单的电饭煲食谱，懒人必学", factor: "7.8x", category: "美食", views: "38.4万", img: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=225&fit=crop" },
];

/* ─── Features ─── */
const FEATURES = [
  {
    icon: Brain,
    title: "爆款预测 Agent",
    desc: "输入你的创作方向，AI 自动分析赛道趋势、竞品数据和爆款规律，给出可执行的内容策略。",
    color: "from-violet-500 to-purple-600",
    link: "/",
  },
  {
    icon: Search,
    title: "低粉爆款发现",
    desc: "实时抓取全平台低粉高播放异常样本，拆解爆因和可迁移结构，帮你找到可复制的爆款路径。",
    color: "from-amber-500 to-orange-600",
    link: "/low-follower-opportunities",
  },
  {
    icon: MonitorSmartphone,
    title: "智能监控 Pro",
    desc: "7×24 小时监控你关注的赛道和竞品，异常数据实时推送，AI 自动生成分析报告。",
    color: "from-emerald-500 to-teal-600",
    link: "/monitor",
  },
];

/* ─── Testimonials ─── */
const TESTIMONIALS = [
  { text: "用了爆款预测 Agent 之后，我的选题效率提升了 10 倍，再也不用靠感觉做内容了。", author: "小鱼同学", role: "美妆博主 · 12万粉", stars: 5 },
  { text: "低粉爆款功能帮我找到了 3 个可复制的内容结构，第一条视频就破了 50 万播放。", author: "阿杰说职场", role: "职场博主 · 8万粉", stars: 5 },
  { text: "智能监控让我比同行早 24 小时发现趋势变化，这就是信息差。", author: "探食小分队", role: "美食博主 · 25万粉", stars: 5 },
  { text: "从选题到文案到拍摄提纲，一个工具全搞定，省了我至少 3 个小时。", author: "猫奴日记", role: "宠物博主 · 6万粉", stars: 5 },
];

/* ─── Pricing (aligned with system: CreditsPage / QuickAccessModals) ─── */
const PRICING_PLANS = [
  {
    name: "免费版",
    price: 0,
    originalPrice: 0,
    period: "/月",
    badge: "",
    desc: "体验核心功能",
    subdesc: "",
    cta: "免费开始",
    ctaStyle: "border border-gray-300 text-gray-900 hover:bg-gray-50",
    features: ["每日 1 次爆款预测", "低粉爆款浏览（前 5 条）", "基础赛道情报", "60 积分体验额度"],
    popular: false,
  },
  {
    name: "Plus 会员",
    price: 15,
    originalPrice: 19,
    period: "/月",
    badge: "入门之选",
    desc: "每月 200 积分 + 抖音平台分析",
    subdesc: "连续包月 ¥15/月",
    cta: "立即订阅",
    ctaStyle: "border border-gray-300 text-gray-900 hover:bg-gray-50",
    features: ["不限次数爆款预测", "低粉爆款库", "内容日历", "每月 200 积分", "抖音平台分析"],
    popular: false,
  },
  {
    name: "Pro 会员",
    price: 39,
    originalPrice: 49,
    period: "/月",
    badge: "最受欢迎",
    desc: "每月 600 积分 + 全平台分析",
    subdesc: "连续包月 ¥39/月",
    cta: "立即订阅",
    ctaStyle: "bg-primary text-white hover:bg-primary/90",
    features: ["Plus 全部功能", "全平台（抖音+小红书+快手）", "智能监控不限赛道", "每月 600 积分", "选题策略自进化", "优先客服支持"],
    popular: true,
  },
];

/* ─── FAQ ─── */
const FAQ_ITEMS = [
  { q: "爆款预测Agent 是什么？", a: "爆款预测Agent 是一款 AI 驱动的内容创作辅助工具，通过分析全平台爆款数据，帮助创作者做出更科学的内容决策。它包含爆款预测、低粉爆款发现、智能监控等核心功能。" },
  { q: "免费版有什么限制？", a: "免费版每天可以使用 1 次爆款预测 Agent，浏览低粉爆款库的前 5 条数据，获得 60 积分体验额度。升级后可解锁全部功能和更多积分。" },
  { q: "积分是怎么消耗的？", a: "积分用于消费 AI 生成的深度内容，例如翻拍脚本（60积分）、文案模式提取（30积分）、选题策略（40积分）等。每月会根据套餐自动充值。" },
  { q: "支持哪些平台的数据？", a: "目前支持抖音和小红书两大平台的数据分析，后续会陆续接入快手、B站、视频号等平台。" },
  { q: "数据更新频率是多少？", a: "低粉爆款数据每日更新，智能监控数据实时推送，赛道趋势数据每 6 小时刷新一次。" },
  { q: "可以退款吗？", a: "订阅后 7 天内如果不满意可以申请全额退款，无需任何理由。" },
];

/* ─── Animated Counter with random step-speed cycling ─── */
/*
 * Counts from `start` to `target` using three randomly cycling modes:
 *   - "slow":  +1 per tick,  interval 150-300ms
 *   - "medium": +2~5 per tick, interval 80-150ms
 *   - "fast":  +10~50 per tick, interval 40-80ms
 * Each mode runs for a random duration (2-6s), then switches to another.
 * Occasional pauses (0.5-2s) are inserted between mode switches.
 */
function AnimatedCounter({
  target = 100_000,
  start = 1_000,
}: {
  target?: number;
  start?: number;
}) {
  const [count, setCount] = useState(start);
  const ref = useRef<HTMLSpanElement>(null);
  const hasStarted = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef(start);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          runCycle();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  type SpeedMode = "slow" | "medium" | "fast";

  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  const getStepConfig = (mode: SpeedMode) => {
    switch (mode) {
      case "slow":   return { stepMin: 1,  stepMax: 1,  intervalMin: 150, intervalMax: 300 };
      case "medium": return { stepMin: 2,  stepMax: 5,  intervalMin: 80,  intervalMax: 150 };
      case "fast":   return { stepMin: 10, stepMax: 50, intervalMin: 40,  intervalMax: 80 };
    }
  };

  const pickNextMode = (current: SpeedMode): SpeedMode => {
    const modes: SpeedMode[] = ["slow", "medium", "fast"];
    const others = modes.filter((m) => m !== current);
    return others[rand(0, others.length - 1)];
  };

  const runCycle = useCallback(() => {
    let mode: SpeedMode = "slow";
    let modeEndTime = Date.now() + rand(2000, 6000);

    const tick = () => {
      if (currentRef.current >= target) {
        currentRef.current = target;
        setCount(target);
        return;
      }

      const now = Date.now();

      // Time to switch mode?
      if (now >= modeEndTime) {
        mode = pickNextMode(mode);
        modeEndTime = now + rand(2000, 6000);

        // 40% chance of a pause between mode switches
        if (Math.random() < 0.4) {
          const pauseMs = rand(500, 2000);
          timerRef.current = setTimeout(tick, pauseMs);
          return;
        }
      }

      const config = getStepConfig(mode);
      const step = rand(config.stepMin, config.stepMax);
      currentRef.current = Math.min(currentRef.current + step, target);
      setCount(currentRef.current);

      if (currentRef.current < target) {
        const interval = rand(config.intervalMin, config.intervalMax);
        timerRef.current = setTimeout(tick, interval);
      }
    };

    tick();
  }, [target, start]);

  return <span ref={ref}>{count.toLocaleString()}+</span>;
}

/* ═══════════════════════════════════════════════
   Landing Page Component
   ═══════════════════════════════════════════════ */
export function LandingPage() {
  const [activeCategory, setActiveCategory] = useState("全部");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const filteredVideos =
    activeCategory === "全部"
      ? SHOWCASE_VIDEOS
      : SHOWCASE_VIDEOS.filter((v) => v.category === activeCategory);

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Navigation ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
              AI
            </div>
            <span className="text-lg font-bold text-gray-900">爆款预测Agent</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-gray-600 transition hover:text-gray-900">功能</a>
            <a href="#pricing" className="text-sm text-gray-600 transition hover:text-gray-900">定价</a>
            <a href="#faq" className="text-sm text-gray-600 transition hover:text-gray-900">常见问题</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-600 transition hover:text-gray-900">
              登录
            </Link>
            <Link
              to="/login"
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary/90"
            >
              免费开始
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden pt-16">
        {/* Background thumbnail grid */}
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="grid grid-cols-4 gap-2 p-4 md:grid-cols-6">
            {HERO_THUMBNAILS.map((src, i) => (
              <div key={i} className="aspect-video overflow-hidden rounded-lg">
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-20 text-center md:pb-24 md:pt-28">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 shadow-sm">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>已有 <strong className="text-gray-900"><AnimatedCounter /></strong> 创作者在使用</span>
          </div>

          {/* Headline */}
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-6xl lg:text-7xl">
            结束靠感觉做内容的时代
            <br />
            <span className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text pb-3 pr-4 italic text-transparent" style={{ overflow: 'visible' }}>
              用数据驱动爆款
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 md:text-xl">
            全平台爆款数据分析，AI 驱动的内容决策引擎。
            <br className="hidden md:block" />
            从选题、拆解到执行，一站式提升你的创作效率。
          </p>

          {/* Feature tabs */}
          <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-2">
            {[
              { icon: Brain, label: "爆款预测" },
              { icon: Search, label: "低粉爆款" },
              { icon: Eye, label: "智能监控" },
              { icon: BarChart3, label: "赛道分析" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow-md"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:bg-primary/90 hover:shadow-xl"
            >
              <Zap className="h-5 w-5" />
              免费开始使用
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
              <Play className="h-5 w-5" />
              观看演示
            </button>
          </div>


        </div>

        {/* Trusted creators marquee */}
        <div className="relative overflow-hidden border-y border-gray-100 bg-gray-50/50 py-6">
          <div className="animate-marquee flex gap-8 whitespace-nowrap">
            {[...TRUSTED_CREATORS, ...TRUSTED_CREATORS].map((c, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">
                  {c.avatar}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.followers}粉丝</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Showcase Section ─── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-center text-sm font-medium text-gray-400">
            AI 实时发现全平台低粉爆款样本，拆解可复制的爆款结构
          </p>

          {/* Category tabs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {SHOWCASE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  activeCategory === cat
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Video grid */}
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideos.map((v, i) => (
              <div
                key={i}
                className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-lg"
              >
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={v.img}
                    alt={v.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute right-2 top-2 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                    {v.factor}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{v.title}</h3>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{v.category}</span>
                    <span>{v.views}次播放</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 transition hover:text-violet-700"
            >
              查看全部低粉爆款样本
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600">
              <Sparkles className="h-4 w-4 text-violet-500" />
              研究 & 创作
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 md:text-5xl">
              做爆款内容
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text italic text-transparent">
                {" "}你需要的一切
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-500">
              从发现爆款到拆解结构，从生成文案到制定策略，AI 全流程辅助你的内容创作。
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition hover:shadow-lg"
              >
                <div
                  className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white`}
                >
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{f.desc}</p>
                <Link
                  to={f.link}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-violet-600 transition hover:text-violet-700"
                >
                  了解更多
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>

          {/* Extra feature pills */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: Target, label: "文案提取" },
              { icon: Flame, label: "翻拍脚本" },
              { icon: TrendingUp, label: "赛道情报" },
              { icon: Clock, label: "实时监控" },
              { icon: Shield, label: "选题策略" },
              { icon: Users, label: "竞品追踪" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600"
              >
                <Icon className="h-4 w-4 text-gray-400" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Social Proof / Testimonials ─── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 md:text-5xl">
              看看
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text italic text-transparent">
                {" "}创作者们{" "}
              </span>
              怎么说
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-500">
              已有超过 <strong><AnimatedCounter /></strong> 名创作者使用爆款预测Agent 提升创作效率
            </p>
          </div>

          {/* Bento grid */}
          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
            {/* Big stat card */}
            <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 p-10 text-center text-white">
              <div className="text-5xl font-extrabold"><AnimatedCounter /></div>
              <div className="mt-2 text-lg font-medium text-white/80">创作者信赖我们</div>
              <div className="mt-4 flex -space-x-2">
                {["🎬", "🌿", "😂", "🏠", "💪"].map((e, i) => (
                  <div
                    key={i}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-sm"
                  >
                    {e}
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonial cards */}
            {TESTIMONIALS.slice(0, 2).map((t, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 ${
                  i === 1 ? "bg-gray-900 text-white" : "border border-gray-100 bg-white"
                }`}
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star
                      key={j}
                      className={`h-4 w-4 ${i === 1 ? "fill-amber-400 text-amber-400" : "fill-amber-400 text-amber-400"}`}
                    />
                  ))}
                </div>
                <p className={`mt-4 text-sm leading-relaxed ${i === 1 ? "text-gray-300" : "text-gray-600"}`}>
                  "{t.text}"
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-bold text-white">
                    {t.author[0]}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${i === 1 ? "text-white" : "text-gray-900"}`}>
                      {t.author}
                    </div>
                    <div className={`text-xs ${i === 1 ? "text-gray-400" : "text-gray-400"}`}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Second row */}
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            {TESTIMONIALS.slice(2).map((t, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-8">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-gray-600">"{t.text}"</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
                    {t.author[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.author}</div>
                    <div className="text-xs text-gray-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 md:text-5xl">
              简单透明的定价
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-500">
              选择适合你的方案，随时升级或取消
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {PRICING_PLANS.map((plan, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-8 transition ${
                  plan.popular
                    ? "border-2 border-violet-500 bg-white shadow-lg shadow-violet-100"
                    : "border border-gray-200 bg-white"
                }`}
              >
                {plan.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold text-white ${
                    plan.popular ? "bg-violet-500" : "bg-amber-500"
                  }`}>
                    {plan.badge}
                  </div>
                )}
                <div className="text-sm font-medium text-gray-500">{plan.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">
                    ¥{plan.price}
                  </span>
                  <span className="text-sm text-gray-400">{plan.period}</span>
                  {plan.originalPrice > plan.price && (
                    <span className="ml-1 text-sm text-gray-300 line-through">¥{plan.originalPrice}</span>
                  )}
                </div>
                {plan.subdesc && (
                  <div className="mt-1 text-xs text-violet-600">
                    {plan.subdesc}
                  </div>
                )}
                <p className="mt-2 text-sm text-gray-400">{plan.desc}</p>

                <Link
                  to="/login"
                  className={`mt-6 block w-full rounded-full py-3 text-center text-sm font-semibold transition ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </Link>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-extrabold text-gray-900 md:text-5xl">
            常见问题
          </h2>
          <div className="mt-12 space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white transition"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left"
                >
                  <span className="text-sm font-medium text-gray-900">{item.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="border-t border-gray-100 px-6 py-4 text-sm leading-relaxed text-gray-500">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="bg-gradient-to-br from-violet-600 to-indigo-700 py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white md:text-5xl">
            今天就开始，免费体验
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
            加入 10,000+ 创作者，用数据驱动你的内容决策
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-violet-700 shadow-lg transition hover:bg-gray-50"
            >
              <Zap className="h-5 w-5" />
              免费开始使用
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10">
              <Play className="h-5 w-5" />
              观看演示 2 分钟
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-100 bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                  AI
                </div>
                <span className="text-lg font-bold text-gray-900">爆款预测Agent</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-400">
                AI 驱动的内容决策引擎，帮助创作者做出更科学的内容决策。
              </p>
            </div>

            {/* Links */}
            <div>
              <div className="text-sm font-semibold text-gray-900">产品</div>
              <ul className="mt-4 space-y-2.5">
                <li><a href="#features" className="text-sm text-gray-400 transition hover:text-gray-600">爆款预测 Agent</a></li>
                <li><a href="#features" className="text-sm text-gray-400 transition hover:text-gray-600">低粉爆款发现</a></li>
                <li><a href="#features" className="text-sm text-gray-400 transition hover:text-gray-600">智能监控 Pro</a></li>
                <li><a href="#features" className="text-sm text-gray-400 transition hover:text-gray-600">创作工具箱</a></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">支持</div>
              <ul className="mt-4 space-y-2.5">
                <li><a href="#faq" className="text-sm text-gray-400 transition hover:text-gray-600">常见问题</a></li>
                <li><a href="#" className="text-sm text-gray-400 transition hover:text-gray-600">联系我们</a></li>
                <li><a href="#pricing" className="text-sm text-gray-400 transition hover:text-gray-600">定价方案</a></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">法律</div>
              <ul className="mt-4 space-y-2.5">
                <li><Link to="/terms" className="text-sm text-gray-400 transition hover:text-gray-600">服务条款</Link></li>
                <li><Link to="/privacy" className="text-sm text-gray-400 transition hover:text-gray-600">隐私政策</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-gray-100 pt-8 text-center text-sm text-gray-400">
            © {new Date().getFullYear()} 爆款预测Agent. All rights reserved.
          </div>
        </div>
      </footer>

      {/* ─── Marquee animation ─── */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
