/**
 * WelcomeFlow — 4-step onboarding survey
 * =======================================
 * Step 1: Role (with value-hook hero on the side)
 * Step 2: Platforms (multi)
 * Step 3: Niches (multi) + Account stage (single)
 * Step 4: Activation intent → reward → route
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import {
  useOnboarding,
  useTrack,
  type UserGoal,
  type UserRole,
  type UserStage,
} from "../../lib/onboarding-context";

/* ─── Platform icons (sub-set) ─── */

function DouyinIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.4a6.84 6.84 0 0 0-.79-.05A6.33 6.33 0 0 0 3.15 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}
function XhsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-7c-1.38 0-2.5 1.12-2.5 2.5S10.62 14.5 12 14.5s2.5-1.12 2.5-2.5S13.38 9.5 12 9.5z" />
    </svg>
  );
}
function WechatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.67.82 3.17 2.12 4.21L4.5 16l2.36-1.18A7.6 7.6 0 0 0 9.5 15a6.2 6.2 0 0 1-.5-2.5C9 9.46 11.91 7 15.5 7a6.5 6.5 0 0 1 .52.02C15.22 5.72 12.12 4 9.5 4zM16.5 9C13.46 9 11 11.01 11 13.5S13.46 18 16.5 18a6.5 6.5 0 0 0 1.86-.28L20.5 19l-.9-2.03A4.42 4.42 0 0 0 21 13.5C21 11.01 18.54 9 16.5 9z" />
    </svg>
  );
}
function YoutubeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16.2 5 12 5 12 5s-4.2 0-7 .1c-.4.1-1.3.1-2 .9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.8C6.7 19 12 19 12 19s4.2 0 7-.2c.4-.1 1.3-.1 2-.9.6-.6.8-2 .8-2S22 14.3 22 12.7v-1.5C22 9.6 21.8 8 21.8 8zM9.7 14.5V9l5.4 2.8-5.4 2.7z" />
    </svg>
  );
}
function BilibiliIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L8.653 4.44c.071.071.134.142.187.213h6.72c.053-.071.116-.142.187-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.787 1.898v7.36c.018.769.281 1.4.787 1.898.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.497.769-1.129.787-1.898v-7.36c-.018-.769-.281-1.4-.787-1.898-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" />
    </svg>
  );
}

/* ─── Data ─── */

const ROLES: { id: NonNullable<UserRole>; emoji: string; label: string; desc: string }[] = [
  { id: "creator", emoji: "🎬", label: "个人创作者", desc: "单人能跑通的爆款公式" },
  { id: "mcn", emoji: "📊", label: "MCN 运营", desc: "批量孵化模板与监控" },
  { id: "brand", emoji: "🏢", label: "品牌方", desc: "ROI 视角的内容策略" },
  { id: "visitor", emoji: "👀", label: "只是看看", desc: "让我先随便逛逛" },
];

const PLATFORMS = [
  { id: "douyin", label: "抖音", Icon: DouyinIcon, color: "#000" },
  { id: "xhs", label: "小红书", Icon: XhsIcon, color: "#FF2442" },
  { id: "wechat", label: "微信公众号", Icon: WechatIcon, color: "#07C160" },
  { id: "youtube", label: "YouTube", Icon: YoutubeIcon, color: "#FF0000" },
  { id: "bilibili", label: "B站", Icon: BilibiliIcon, color: "#00AEEC" },
  { id: "multi", label: "多个平台", Icon: null, color: "#7c3aed" },
];

const NICHES = [
  "美妆", "母婴", "职场", "宠物", "知识", "旅行",
  "美食", "健身", "时尚", "数码", "财经", "影视",
  "三农", "情感", "家居", "其他",
];

const STAGES: { id: NonNullable<UserStage>; label: string; desc: string }[] = [
  { id: "none", label: "暂无账号", desc: "刚开始" },
  { id: "starter", label: "< 1k", desc: "起号期" },
  { id: "growing", label: "1k-1w", desc: "成长期" },
  { id: "breakout", label: "1w-10w", desc: "突破期" },
  { id: "monetizing", label: "10w+", desc: "变现期" },
];

const GOALS: { id: NonNullable<UserGoal>; emoji: string; label: string; desc: string }[] = [
  { id: "topics", emoji: "🎯", label: "现在就要 3 个能跑的爆款选题", desc: "直接给我可以拍的方向" },
  { id: "viral", emoji: "🔬", label: "拆解一条爆款看它为什么爆", desc: "学习 Aha 公式" },
  { id: "predict", emoji: "🌱", label: "粉丝少，给我同段位的爆款样本", desc: "低粉同款、可复制" },
  { id: "explore", emoji: "🔭", label: "先随便逛逛", desc: "我自己探索" },
];

/* ─── ProgressBar ─── */

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-7 flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const active = n <= step;
        return (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              active
                ? "bg-gradient-to-r from-violet-500 to-indigo-500"
                : "bg-gray-100"
            }`}
          />
        );
      })}
      <span className="ml-1 shrink-0 text-[12px] font-medium text-gray-400">
        {step} / {total}
      </span>
    </div>
  );
}

/* ─── Step 1: Role + Hero ─── */

function Step1({ onSelect }: { onSelect: (role: NonNullable<UserRole>) => void }) {
  return (
    <div>
      {/* Hero */}
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
          <Sparkles className="h-3 w-3" />
          仅需 4 步 · 不到 30 秒
        </div>
        <h2 className="text-[22px] font-bold leading-tight text-gray-900">
          3 步打造你的{" "}
          <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            爆款工作台
          </span>
        </h2>
        <p className="mt-1.5 text-[13px] text-gray-500">
          已为 <span className="font-semibold text-gray-700">12,000+</span> 创作者完成定制 · 平均命中率提升{" "}
          <span className="font-semibold text-violet-600">7.2×</span>
        </p>
      </div>

      <p className="mb-3 text-[13px] font-medium text-gray-700">先告诉我你是谁</p>
      <div className="grid grid-cols-2 gap-2.5">
        {ROLES.map((role) => (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_4px_16px_rgba(124,58,237,0.12)]"
          >
            <span className="text-[22px] leading-none">{role.emoji}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-gray-900">{role.label}</div>
              <div className="truncate text-[11px] text-gray-400">{role.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2: Platforms ─── */

function Step2({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  const canNext = selected.length > 0;
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-gray-900">你主要在哪些平台？</h2>
      <p className="mb-6 text-[13px] text-gray-500">可多选 · 决定你的爆款数据池</p>
      <div className="mb-7 grid grid-cols-3 gap-2.5">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.id);
          const Icon = p.Icon;
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p.id)}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3.5 transition-all duration-150 ${
                isSelected
                  ? "border-violet-500 bg-violet-50 shadow-[0_2px_8px_rgba(124,58,237,0.12)]"
                  : "border-gray-100 bg-white hover:border-violet-200"
              }`}
            >
              {isSelected && (
                <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              <div style={{ color: p.color }}>
                {Icon ? <Icon size={22} /> : <span className="text-[20px]">🌐</span>}
              </div>
              <span className="text-[12px] text-gray-700">{p.label}</span>
            </button>
          );
        })}
      </div>
      <PrimaryButton onClick={onNext} disabled={!canNext}>
        继续
      </PrimaryButton>
    </div>
  );
}

/* ─── Step 3: Niches + Stage ─── */

function Step3({
  niches,
  stage,
  onToggleNiche,
  onSelectStage,
  onNext,
}: {
  niches: string[];
  stage: UserStage;
  onToggleNiche: (n: string) => void;
  onSelectStage: (s: NonNullable<UserStage>) => void;
  onNext: () => void;
}) {
  const canNext = niches.length > 0 && stage !== null;
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-gray-900">你的赛道与账号阶段？</h2>
      <p className="mb-5 text-[13px] text-gray-500">用来精准匹配同赛道、同段位的爆款样本</p>

      <div className="mb-2 text-[12px] font-medium text-gray-700">赛道（可多选）</div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {NICHES.map((n) => {
          const active = niches.includes(n);
          return (
            <button
              key={n}
              onClick={() => onToggleNiche(n)}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                active
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-violet-200"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-[12px] font-medium text-gray-700">账号体量</div>
      <div className="mb-7 grid grid-cols-5 gap-1.5">
        {STAGES.map((s) => {
          const active = stage === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelectStage(s.id)}
              className={`flex flex-col items-center rounded-xl border px-1 py-2 transition ${
                active
                  ? "border-violet-500 bg-violet-50"
                  : "border-gray-100 bg-white hover:border-violet-200"
              }`}
            >
              <span className={`text-[12px] font-semibold ${active ? "text-violet-700" : "text-gray-900"}`}>
                {s.label}
              </span>
              <span className="text-[10px] text-gray-400">{s.desc}</span>
            </button>
          );
        })}
      </div>

      <PrimaryButton onClick={onNext} disabled={!canNext}>
        继续
      </PrimaryButton>
    </div>
  );
}

/* ─── Step 4: Goal (activation intent) ─── */

function Step4({ onSelect }: { onSelect: (goal: NonNullable<UserGoal>) => void }) {
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-gray-900">最后，最想立刻得到什么？</h2>
      <p className="mb-6 text-[13px] text-gray-500">点完即解锁奖励 · 我直接带你过去</p>
      <div className="space-y-2">
        {GOALS.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelect(g.id)}
            className="group flex w-full items-center gap-3.5 rounded-2xl border border-gray-100 bg-white p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_4px_16px_rgba(124,58,237,0.12)]"
          >
            <span className="shrink-0 text-[22px] leading-none">{g.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-gray-900">{g.label}</div>
              <div className="text-[11px] text-gray-400">{g.desc}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-violet-600" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Reward overlay (Step 4 → completion) ─── */

function RewardOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-white/95 backdrop-blur-sm">
      <div className="flex flex-col items-center px-8 text-center">
        <div className="relative mb-4">
          <div className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/40">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
        </div>
        <h3 className="text-[18px] font-bold text-gray-900">定制完成 🎉</h3>
        <p className="mt-1.5 text-[13px] text-gray-600">
          已为你解锁{" "}
          <span className="font-semibold text-violet-600">100 积分</span>
          {" + "}
          <span className="font-semibold text-violet-600">3 次免费分析</span>
        </p>
        <p className="mt-1 text-[11px] text-gray-400">正在为你跳转到合适的工作台…</p>
      </div>
    </div>
  );
}

/* ─── Primary button ─── */

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[14px] font-semibold transition-all duration-150 ${
        disabled
          ? "cursor-not-allowed bg-gray-100 text-gray-300"
          : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30 hover:from-violet-700 hover:to-indigo-700"
      }`}
    >
      {children}
      {!disabled && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}

/* ─── Main WelcomeFlow ─── */

const TOTAL_STEPS = 4;

export function WelcomeFlow() {
  const { completeWelcome } = useOnboarding();
  const navigate = useNavigate();
  const track = useTrack();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [role, setRole] = useState<UserRole>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [niches, setNiches] = useState<string[]>([]);
  const [stage, setStage] = useState<UserStage>(null);
  const [showReward, setShowReward] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    track("onboarding_started");
  }, [track]);

  const handleRoleSelect = (selected: NonNullable<UserRole>) => {
    setRole(selected);
    track("onboarding_role_selected", { role: selected });
    setStep(2);
  };

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const toggleNiche = (n: string) => {
    setNiches((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const handleGoalSelect = (goal: NonNullable<UserGoal>) => {
    track("onboarding_goal_selected", { goal });
    setShowReward(true);
    // After reward animation, persist + route + dismiss
    setTimeout(() => {
      completeWelcome({ role, platforms, niches, stage, goal });
      if (goal === "predict") {
        navigate("/low-follower-opportunities");
      }
      // topics / viral / explore stay on "/"
      setVisible(false);
    }, 1100);
  };

  const handleDismiss = () => {
    track("onboarding_dismissed", { step });
    setVisible(false);
    setTimeout(() => {
      completeWelcome({
        role: role ?? "visitor",
        platforms,
        niches,
        stage,
        goal: "explore",
      });
    }, 320);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[3px] transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="relative mx-4 w-full max-w-[440px] rounded-[24px] bg-white p-7 shadow-[0_24px_64px_rgba(0,0,0,0.16)]">
        {/* Skip / dismiss */}
        {!showReward && (
          <button
            onClick={handleDismiss}
            className="absolute right-4 top-4 flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            title="跳过定制（可在设置里重做）"
          >
            稍后填写
            <X className="h-3 w-3" />
          </button>
        )}

        {!showReward && <ProgressBar step={step} total={TOTAL_STEPS} />}

        {step === 1 && <Step1 onSelect={handleRoleSelect} />}
        {step === 2 && (
          <Step2
            selected={platforms}
            onToggle={togglePlatform}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            niches={niches}
            stage={stage}
            onToggleNiche={toggleNiche}
            onSelectStage={setStage}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && <Step4 onSelect={handleGoalSelect} />}

        {showReward && <RewardOverlay />}
      </div>
    </div>
  );
}
