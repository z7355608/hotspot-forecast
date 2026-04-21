/**
 * WelcomeFlow — Module A
 * ======================
 * 三步欢迎分流，不打断 URL，覆盖在首页上方。
 * A1: 你是谁  A2: 你在哪个平台  A3: 你现在最想做什么
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import {
  useOnboarding,
  useTrack,
  type UserGoal,
  type UserRole,
} from "../../lib/onboarding-context";

/* ------------------------------------------------------------------ */
/*  Platform icons (inline SVGs matching ConnectorsPage style)         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Data                                                                */
/* ------------------------------------------------------------------ */

const ROLES = [
  { id: "creator" as UserRole, emoji: "🎬", label: "个人创作者", desc: "自己运营账号" },
  { id: "mcn" as UserRole,     emoji: "📊", label: "MCN 运营",   desc: "管理多个账号" },
  { id: "brand" as UserRole,   emoji: "🏢", label: "品牌方",     desc: "品牌内容营销" },
  { id: "visitor" as UserRole, emoji: "👀", label: "只是看看",   desc: "了解产品功能" },
];

const PLATFORMS = [
  { id: "douyin",    label: "抖音",     Icon: DouyinIcon,   color: "#000" },
  { id: "xhs",       label: "小红书",   Icon: XhsIcon,      color: "#FF2442" },
  { id: "wechat",    label: "微信公众号", Icon: WechatIcon,   color: "#07C160" },
  { id: "youtube",   label: "YouTube",  Icon: YoutubeIcon,  color: "#FF0000" },
  { id: "bilibili",  label: "B站",      Icon: BilibiliIcon, color: "#00AEEC" },
  { id: "multi",     label: "多个平台",  Icon: null,         color: "#8979FF" },
];

const GOALS = [
  { id: "topics"  as UserGoal, emoji: "🎯", label: "找到下一个选题方向", desc: "发什么会火？" },
  { id: "viral"   as UserGoal, emoji: "📚", label: "学习爆款套路",      desc: "拆解成功内容" },
  { id: "predict" as UserGoal, emoji: "📈", label: "预测内容表现",      desc: "先测后发" },
  { id: "explore" as UserGoal, emoji: "🔍", label: "我还不确定，先看看", desc: "随便逛逛" },
];

/* ------------------------------------------------------------------ */
/*  ProgressBar                                                         */
/* ------------------------------------------------------------------ */

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-1 flex-1 rounded-full transition-all duration-300"
          style={{ backgroundColor: n <= step ? "#1E2939" : "#E5E7EB" }}
        />
      ))}
      <span className="ml-1 text-[12px] text-[#99A1AF] shrink-0">{step} / 3</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — 你是谁                                                     */
/* ------------------------------------------------------------------ */

function Step1({ onSelect }: { onSelect: (role: UserRole) => void }) {
  return (
    <div>
      <h2 className="text-[22px] text-[#1E2939] mb-1">你好，欢迎使用</h2>
      <p className="text-[14px] text-[#99A1AF] mb-7">先告诉我你是谁，我来为你定制体验</p>
      <div className="grid grid-cols-2 gap-3">
        {ROLES.map((role) => (
          <button
            key={role.id}
            onClick={() => onSelect(role.id)}
            className="flex items-center gap-3 p-4 rounded-[16px] border border-[#F3F4F6] bg-white hover:border-[#1E2939] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-150 text-left group"
          >
            <span className="text-[24px] leading-none">{role.emoji}</span>
            <div>
              <div className="text-[14px] text-[#1E2939] group-hover:text-[#1E2939]">{role.label}</div>
              <div className="text-[12px] text-[#99A1AF]">{role.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — 你在哪个平台                                               */
/* ------------------------------------------------------------------ */

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
      <h2 className="text-[22px] text-[#1E2939] mb-1">你主要在哪个平台？</h2>
      <p className="text-[14px] text-[#99A1AF] mb-7">可以多选，这将影响首页推荐内容</p>
      <div className="grid grid-cols-3 gap-3 mb-7">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.id);
          const Icon = p.Icon;
          return (
            <button
              key={p.id}
              onClick={() => onToggle(p.id)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-[16px] border transition-all duration-150 ${
                isSelected
                  ? "border-[#1E2939] bg-[#F9FAFB] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                  : "border-[#F3F4F6] bg-white hover:border-[#D1D5DC]"
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#1E2939] flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div style={{ color: p.color }}>
                {Icon ? <Icon size={24} /> : <span className="text-[20px]">🌐</span>}
              </div>
              <span className="text-[12px] text-[#364153]">{p.label}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onNext}
        disabled={!canNext}
        className={`w-full py-3 rounded-[14px] text-[14px] transition-all duration-150 ${
          canNext
            ? "bg-[#1E2939] text-white hover:bg-[#2D3A4B]"
            : "bg-[#F3F4F6] text-[#C4C9D4] cursor-not-allowed"
        }`}
      >
        继续
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 — 你现在最想做什么                                           */
/* ------------------------------------------------------------------ */

function Step3({ onSelect }: { onSelect: (goal: UserGoal) => void }) {
  return (
    <div>
      <h2 className="text-[22px] text-[#1E2939] mb-1">你现在最想做什么？</h2>
      <p className="text-[14px] text-[#99A1AF] mb-7">我会把你带到最合适的地方</p>
      <div className="space-y-2.5">
        {GOALS.map((goal) => (
          <button
            key={goal.id}
            onClick={() => onSelect(goal.id)}
            className="w-full flex items-center gap-4 p-4 rounded-[16px] border border-[#F3F4F6] bg-white hover:border-[#1E2939] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-150 text-left group"
          >
            <span className="text-[24px] leading-none shrink-0">{goal.emoji}</span>
            <div className="flex-1">
              <div className="text-[14px] text-[#1E2939]">{goal.label}</div>
              <div className="text-[12px] text-[#99A1AF]">{goal.desc}</div>
            </div>
            <svg className="w-4 h-4 text-[#D1D5DC] group-hover:text-[#1E2939] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main WelcomeFlow                                                    */
/* ------------------------------------------------------------------ */

export function WelcomeFlow() {
  const { completeWelcome } = useOnboarding();
  const navigate = useNavigate();
  const track = useTrack();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<UserRole>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    track("onboarding_started");
  }, [track]);

  const handleRoleSelect = (selected: UserRole) => {
    setRole(selected);
    track("onboarding_role_selected", { role: selected });
    setStep(2);
  };

  const handlePlatformToggle = (id: string) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleGoalSelect = (goal: UserGoal) => {
    track("onboarding_goal_selected", { goal });
    // 先淡出，动画结束后再 completeWelcome，避免 Root 立即 unmount 打断动画
    setVisible(false);
    setTimeout(() => {
      completeWelcome(role, platforms, goal);
      if (goal === "viral") navigate("/low-follower-opportunities");
      else if (goal === "predict") navigate("/results/demo");
      // "topics" and "explore" stay on "/" — handled by HomePage
    }, 320);
  };

  const handleDismiss = () => {
    track("onboarding_dismissed");
    setVisible(false);
    setTimeout(() => {
      completeWelcome(role ?? "visitor", platforms, "explore");
    }, 320);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="relative w-full max-w-[420px] mx-4 bg-white rounded-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.12)] p-8">
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#99A1AF] hover:bg-[#F3F4F6] hover:text-[#364153] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <ProgressBar step={step} />

        {step === 1 && <Step1 onSelect={handleRoleSelect} />}

        {step === 2 && (
          <Step2
            selected={platforms}
            onToggle={handlePlatformToggle}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && <Step3 onSelect={handleGoalSelect} />}
      </div>
    </div>
  );
}
