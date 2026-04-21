import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  ChevronRight,
  Flame,
  Gift,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useAppStore } from "../store/app-store";

/* ------------------------------------------------------------------ */
/*  Achievement / Level system                                         */
/* ------------------------------------------------------------------ */

interface UserLevel {
  level: number;
  title: string;
  icon: React.ElementType;
  minAnalyses: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

const LEVELS: UserLevel[] = [
  {
    level: 1,
    title: "内容新手",
    icon: Sparkles,
    minAnalyses: 0,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  },
  {
    level: 2,
    title: "赛道探索者",
    icon: Target,
    minAnalyses: 3,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    level: 3,
    title: "赛道猎手",
    icon: Flame,
    minAnalyses: 8,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  {
    level: 4,
    title: "爆款拆解师",
    icon: Zap,
    minAnalyses: 15,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  {
    level: 5,
    title: "内容操盘手",
    icon: Trophy,
    minAnalyses: 30,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
];

function getUserLevel(analysisCount: number): UserLevel {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (analysisCount >= level.minAnalyses) {
      current = level;
    }
  }
  return current;
}

function getNextLevel(current: UserLevel): UserLevel | null {
  const index = LEVELS.findIndex((l) => l.level === current.level);
  return index < LEVELS.length - 1 ? LEVELS[index + 1] : null;
}

/* ------------------------------------------------------------------ */
/*  Modal content types                                                */
/* ------------------------------------------------------------------ */

type ModalType =
  | "intel_flash"
  | "achievement"
  | "data_change"
  | "weekly_challenge"
  | "level_up";

interface ModalContent {
  type: ModalType;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  body: string;
  highlight?: string;
  ctaLabel: string;
  ctaAction: string;
  secondaryLabel?: string;
  secondaryAction?: string;
}

/* ------------------------------------------------------------------ */
/*  Mock intelligence data                                             */
/* ------------------------------------------------------------------ */

const INTEL_FLASH_POOL = [
  {
    track: "职场干货",
    newHits: 3,
    topStat: "500 粉拿了 8.2 万赞",
    trend: "up",
  },
  {
    track: "AI 效率工具",
    newHits: 5,
    topStat: "200 粉拿了 12 万播放",
    trend: "up",
  },
  {
    track: "家居收纳",
    newHits: 2,
    topStat: "800 粉拿了 5.6 万赞",
    trend: "stable",
  },
  {
    track: "宠物日常",
    newHits: 7,
    topStat: "300 粉拿了 15 万播放",
    trend: "up",
  },
  {
    track: "健身教程",
    newHits: 4,
    topStat: "600 粉拿了 9.1 万赞",
    trend: "up",
  },
];

const DATA_CHANGE_POOL = [
  {
    track: "AI 效率工具",
    oldScore: 72,
    newScore: 85,
    direction: "up" as const,
    insight: "窗口正在打开，竞争者还没跟上",
  },
  {
    track: "职场干货",
    oldScore: 65,
    newScore: 78,
    direction: "up" as const,
    insight: "低粉爆款密度增加，新手友好度提升",
  },
  {
    track: "美食探店",
    oldScore: 80,
    newScore: 68,
    direction: "down" as const,
    insight: "头部账号集中度上升，新手窗口收窄",
  },
];

const CHALLENGE_POOL = [
  {
    title: "本周挑战：爆款猎人",
    tasks: ["完成 1 次爆款拆解", "完成 1 次爆款预测"],
    reward: 50,
    deadline: "本周日 23:59",
  },
  {
    title: "本周挑战：赛道侦察兵",
    tasks: ["完成 2 次爆款预测", "加入 1 个趋势观察"],
    reward: 40,
    deadline: "本周日 23:59",
  },
  {
    title: "本周挑战：内容工匠",
    tasks: ["完成 1 次文案提取", "完成 1 次账号诊断"],
    reward: 60,
    deadline: "本周日 23:59",
  },
];

/* ------------------------------------------------------------------ */
/*  Build modal content                                                */
/* ------------------------------------------------------------------ */

function buildModalContent(
  analysisCount: number,
  hasResults: boolean,
): ModalContent | null {
  if (!hasResults || analysisCount === 0) return null;

  const level = getUserLevel(analysisCount);
  const nextLevel = getNextLevel(level);

  // Deterministic selection based on analysis count to avoid showing same modal
  const seed = analysisCount + new Date().getDate();
  const pool: ModalContent[] = [];

  // 1. Intel flash
  const intel = INTEL_FLASH_POOL[seed % INTEL_FLASH_POOL.length];
  pool.push({
    type: "intel_flash",
    icon: TrendingUp,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    title: "情报速递",
    subtitle: `你关注的「${intel.track}」赛道有新动态`,
    body: `过去 24 小时新增了 ${intel.newHits} 个低粉爆款，最高一条 ${intel.topStat}。这些样本的结构值得你立刻拆解。`,
    highlight: `+${intel.newHits} 个新爆款样本`,
    ctaLabel: "立即查看",
    ctaAction: "/low-follower-opportunities",
    secondaryLabel: "去拆解一个",
    secondaryAction: "/",
  });

  // 2. Achievement / level progress
  if (nextLevel) {
    const remaining = nextLevel.minAnalyses - analysisCount;
    pool.push({
      type: "achievement",
      icon: Award,
      iconColor: level.color,
      iconBg: level.bgColor,
      title: `当前等级：${level.title}`,
      subtitle: `再完成 ${remaining} 次分析即可升级为「${nextLevel.title}」`,
      body: `你已经完成了 ${analysisCount} 次分析。每一次分析都在帮你建立对赛道的判断力。继续保持，距离下一个等级只差 ${remaining} 步。`,
      highlight: `${analysisCount} / ${nextLevel.minAnalyses}`,
      ctaLabel: "继续挑战",
      ctaAction: "/",
      secondaryLabel: "查看历史分析",
      secondaryAction: "/history",
    });
  } else {
    pool.push({
      type: "achievement",
      icon: Trophy,
      iconColor: "text-amber-600",
      iconBg: "bg-amber-50",
      title: "最高等级：内容操盘手",
      subtitle: "你已经达到了最高等级！",
      body: `你已经完成了 ${analysisCount} 次分析，是真正的内容操盘手。继续使用高级功能，保持你的竞争优势。`,
      highlight: "MAX LEVEL",
      ctaLabel: "继续分析",
      ctaAction: "/",
    });
  }

  // 3. Data change alert
  const dataChange = DATA_CHANGE_POOL[seed % DATA_CHANGE_POOL.length];
  pool.push({
    type: "data_change",
    icon: dataChange.direction === "up" ? Rocket : Target,
    iconColor:
      dataChange.direction === "up" ? "text-emerald-600" : "text-amber-600",
    iconBg:
      dataChange.direction === "up" ? "bg-emerald-50" : "bg-amber-50",
    title: "赛道异动提醒",
    subtitle: `「${dataChange.track}」爆款概率发生变化`,
    body: `爆款概率从 ${dataChange.oldScore} ${dataChange.direction === "up" ? "涨到" : "降到"} ${dataChange.newScore}。${dataChange.insight}。`,
    highlight: `${dataChange.oldScore} → ${dataChange.newScore}`,
    ctaLabel:
      dataChange.direction === "up" ? "抓住机会" : "重新评估",
    ctaAction: "/",
    secondaryLabel: "查看详情",
    secondaryAction: "/history",
  });

  // 4. Weekly challenge
  const challenge = CHALLENGE_POOL[seed % CHALLENGE_POOL.length];
  pool.push({
    type: "weekly_challenge",
    icon: Gift,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
    title: challenge.title,
    subtitle: `完成任务可获得 ${challenge.reward} 积分奖励`,
    body: `任务清单：${challenge.tasks.join("、")}。截止时间：${challenge.deadline}。完成后积分自动到账。`,
    highlight: `+${challenge.reward} 积分`,
    ctaLabel: "开始挑战",
    ctaAction: "/",
    secondaryLabel: "查看积分",
    secondaryAction: "/credits",
  });

  // Select based on seed rotation
  return pool[seed % pool.length];
}

/* ------------------------------------------------------------------ */
/*  LevelUpModal Component                                             */
/* ------------------------------------------------------------------ */

const MODAL_STORAGE_KEY = "figma-hotspot-forecast.levelup-modal.last-shown";
const MODAL_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours cooldown

export function LevelUpModal() {
  const navigate = useNavigate();
  const { state } = useAppStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const analysisCount = state.results.length;
  const hasResults = analysisCount > 0;

  const content = useMemo(
    () => buildModalContent(analysisCount, hasResults),
    [analysisCount, hasResults],
  );

  useEffect(() => {
    if (!content) return;

    // Check cooldown
    const lastShown = localStorage.getItem(MODAL_STORAGE_KEY);
    if (lastShown) {
      const elapsed = Date.now() - Number(lastShown);
      if (elapsed < MODAL_COOLDOWN_MS) return;
    }

    // Delay showing for a natural feel
    const timer = setTimeout(() => {
      setVisible(true);
      localStorage.setItem(MODAL_STORAGE_KEY, String(Date.now()));
    }, 800);

    return () => clearTimeout(timer);
  }, [content]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 250);
  }, []);

  const handleCta = useCallback(() => {
    if (!content) return;
    handleClose();
    setTimeout(() => navigate(content.ctaAction), 300);
  }, [content, handleClose, navigate]);

  const handleSecondary = useCallback(() => {
    if (!content?.secondaryAction) return;
    handleClose();
    setTimeout(() => navigate(content.secondaryAction!), 300);
  }, [content, handleClose, navigate]);

  if (!visible || !content) return null;

  const Icon = content.icon;
  const level = getUserLevel(analysisCount);
  const nextLevel = getNextLevel(level);
  const progress = nextLevel
    ? Math.min(
        ((analysisCount - level.minAnalyses) /
          (nextLevel.minAnalyses - level.minAnalyses)) *
          100,
        100,
      )
    : 100;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-250 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md transform rounded-3xl bg-white shadow-2xl transition-all duration-300 ${
          closing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header with icon */}
        <div className="px-6 pb-2 pt-8 text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${content.iconBg}`}
          >
            <Icon className={`h-8 w-8 ${content.iconColor}`} />
          </div>

          <h3 className="text-lg font-semibold text-gray-900">
            {content.title}
          </h3>
          <p className="mt-1 text-sm text-gray-500">{content.subtitle}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-center text-sm leading-relaxed text-gray-600">
            {content.body}
          </p>

          {/* Highlight badge */}
          {content.highlight && (
            <div className="mt-4 flex justify-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${content.iconBg} ${content.iconColor}`}
              >
                <Sparkles className="h-4 w-4" />
                {content.highlight}
              </span>
            </div>
          )}

          {/* Progress bar for achievement type */}
          {content.type === "achievement" && nextLevel && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                <span>{level.title}</span>
                <span>{nextLevel.title}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    level.level >= 4
                      ? "bg-gradient-to-r from-amber-400 to-amber-500"
                      : level.level >= 3
                        ? "bg-gradient-to-r from-orange-400 to-orange-500"
                        : level.level >= 2
                          ? "bg-gradient-to-r from-blue-400 to-blue-500"
                          : "bg-gradient-to-r from-gray-400 to-gray-500"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 text-center text-[11px] text-gray-400">
                {analysisCount} / {nextLevel.minAnalyses} 次分析
              </div>
            </div>
          )}

          {/* Challenge tasks list */}
          {content.type === "weekly_challenge" && (
            <div className="mt-4 space-y-2">
              {CHALLENGE_POOL[
                (analysisCount + new Date().getDate()) %
                  CHALLENGE_POOL.length
              ].tasks.map((task, index) => (
                <div
                  key={task}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2.5"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-[10px] text-gray-400">
                    {index + 1}
                  </div>
                  <span className="text-sm text-gray-700">{task}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={handleCta}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            {content.ctaLabel}
            <ChevronRight className="h-4 w-4" />
          </button>

          {content.secondaryLabel && (
            <button
              type="button"
              onClick={handleSecondary}
              className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs text-gray-400 transition-colors hover:text-gray-600"
            >
              {content.secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Level Badge (for use in header/nav)                         */
/* ------------------------------------------------------------------ */

export function UserLevelBadge() {
  const { state } = useAppStore();
  const analysisCount = state.results.length;
  const level = getUserLevel(analysisCount);
  const nextLevel = getNextLevel(level);
  const Icon = level.icon;

  const progress = nextLevel
    ? Math.min(
        ((analysisCount - level.minAnalyses) /
          (nextLevel.minAnalyses - level.minAnalyses)) *
          100,
        100,
      )
    : 100;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${level.borderColor} ${level.bgColor}`}
    >
      <Icon className={`h-3.5 w-3.5 ${level.color}`} />
      <span className={`text-xs font-medium ${level.color}`}>
        {level.title}
      </span>
      {nextLevel && (
        <div className="flex items-center gap-1">
          <div className="h-1 w-8 overflow-hidden rounded-full bg-white/60">
            <div
              className="h-full rounded-full bg-current opacity-60"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] opacity-60">Lv.{level.level}</span>
        </div>
      )}
    </div>
  );
}
