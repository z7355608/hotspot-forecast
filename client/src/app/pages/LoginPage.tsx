import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Phone,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Star,
  Search,
  Brain,
  Eye,
  BarChart3,
  Check,
  Lock,
  User,
  EyeOff,
  Eye as EyeIcon,
} from "lucide-react";

/* ─── Feature pills shown on the right panel ─── */
const FEATURE_PILLS = [
  { icon: Brain, label: "爆款预测 Agent" },
  { icon: Search, label: "低粉爆款发现" },
  { icon: Eye, label: "智能监控 Pro" },
  { icon: BarChart3, label: "赛道分析" },
];

/* ─── Testimonials for left panel ─── */
const TESTIMONIALS = [
  {
    text: "用了爆款预测 Agent 之后，我的选题效率提升了 10 倍，再也不用靠感觉做内容了。",
    author: "小鱼同学",
    role: "美妆博主 · 12万粉",
  },
  {
    text: "低粉爆款功能帮我找到了 3 个可复制的内容结构，第一条视频就破了 50 万播放。",
    author: "阿杰说职场",
    role: "职场博主 · 8万粉",
  },
];

/* ─── Left panel feature tags ─── */
const LEFT_FEATURES = [
  "爆款预测",
  "低粉爆款",
  "智能监控",
  "文案提取",
  "翻拍脚本",
  "选题策略",
];

/* ─── Auth mode type ─── */
type AuthMode = "sms-login" | "password-login" | "register";

/* ═══════════════════════════════════════════════
   Login Page Component
   ═══════════════════════════════════════════════ */
export function LoginPage() {
  const navigate = useNavigate();

  /* ─── Shared state ─── */
  const [mode, setMode] = useState<AuthMode>("sms-login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ─── SMS login state ─── */
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  /* ─── Password login state ─── */
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  /* ─── Register state ─── */
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCountdown, setRegCountdown] = useState(0);
  const [regNickname, setRegNickname] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regStep, setRegStep] = useState<"info" | "verify">("info");
  const [agreeTerms, setAgreeTerms] = useState(false);

  /* ─── Countdown timers ─── */
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (regCountdown <= 0) return;
    const timer = setTimeout(() => setRegCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [regCountdown]);

  /* ─── Validations ─── */
  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const isCodeValid = /^\d{4,6}$/.test(code);
  const isRegPhoneValid = /^1[3-9]\d{9}$/.test(regPhone);
  const isRegCodeValid = /^\d{4,6}$/.test(regCode);
  const isPasswordValid = loginPassword.length >= 6;
  const isRegPasswordValid = regPassword.length >= 8;
  const isRegPasswordMatch = regPassword === regConfirmPassword && regConfirmPassword.length > 0;

  /* ─── Reset state when switching modes ─── */
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError("");
    setLoading(false);
    if (newMode === "register") {
      setRegStep("info");
    }
  };

  /* ─── SMS: send verification code ─── */
  const handleSendCode = useCallback(async () => {
    if (!isPhoneValid || countdown > 0) return;
    setError("");
    setLoading(true);
    try {
      // TODO: integrate with Alibaba Cloud SMS API
      await new Promise((r) => setTimeout(r, 800));
      setCountdown(60);
    } catch {
      setError("验证码发送失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [isPhoneValid, countdown, phone]);

  /* ─── SMS: verify code and login ─── */
  const handleSmsLogin = useCallback(async () => {
    if (!isCodeValid) return;
    setError("");
    setLoading(true);
    try {
      // TODO: integrate with Alibaba Cloud SMS verification API
      await new Promise((r) => setTimeout(r, 800));
      navigate("/");
    } catch {
      setError("验证码错误或已过期，请重新获取");
    } finally {
      setLoading(false);
    }
  }, [isCodeValid, phone, code, navigate]);

  /* ─── Password: login ─── */
  const handlePasswordLogin = useCallback(async () => {
    if (!loginAccount || !isPasswordValid) return;
    setError("");
    setLoading(true);
    try {
      // TODO: integrate with backend auth API
      await new Promise((r) => setTimeout(r, 800));
      navigate("/");
    } catch {
      setError("账号或密码错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [loginAccount, isPasswordValid, navigate]);

  /* ─── Register: send verification code ─── */
  const handleRegSendCode = useCallback(async () => {
    if (!isRegPhoneValid || regCountdown > 0) return;
    setError("");
    setLoading(true);
    try {
      // TODO: integrate with Alibaba Cloud SMS API
      await new Promise((r) => setTimeout(r, 800));
      setRegStep("verify");
      setRegCountdown(60);
    } catch {
      setError("验证码发送失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [isRegPhoneValid, regCountdown, regPhone]);

  /* ─── Register: verify and create account ─── */
  const handleRegister = useCallback(async () => {
    if (!isRegCodeValid || !isRegPasswordValid || !isRegPasswordMatch || !agreeTerms) return;
    setError("");
    setLoading(true);
    try {
      // TODO: integrate with backend registration API
      await new Promise((r) => setTimeout(r, 1000));
      navigate("/");
    } catch {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [isRegCodeValid, isRegPasswordValid, isRegPasswordMatch, agreeTerms, regPhone, regCode, regPassword, regNickname, navigate]);

  /* ─── Render form based on mode ─── */
  const renderForm = () => {
    switch (mode) {
      /* ═══ SMS Login ═══ */
      case "sms-login":
        return (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">手机号码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(""); }}
                  placeholder="请输入手机号码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  maxLength={11}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">验证码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <ShieldCheck className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="请输入验证码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-28 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  maxLength={6}
                />
                <button
                  onClick={handleSendCode}
                  disabled={!isPhoneValid || countdown > 0 || loading}
                  className="absolute inset-y-1 right-1 rounded-lg bg-violet-50 px-3 text-xs font-medium text-violet-600 transition hover:bg-violet-100 disabled:bg-transparent disabled:text-gray-400"
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </button>
              </div>
            </div>

            <button
              onClick={handleSmsLogin}
              disabled={!isPhoneValid || !isCodeValid || loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>登录 <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </>
        );

      /* ═══ Password Login ═══ */
      case "password-login":
        return (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">手机号码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={loginAccount}
                  onChange={(e) => { setLoginAccount(e.target.value); setError(""); }}
                  placeholder="请输入手机号码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">密码</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setError(""); }}
                  placeholder="请输入密码"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                onClick={() => switchMode("sms-login")}
                className="text-xs text-violet-600 hover:underline"
              >
                忘记密码？使用验证码登录
              </button>
            </div>

            <button
              onClick={handlePasswordLogin}
              disabled={!loginAccount || !isPasswordValid || loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>登录 <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </>
        );

      /* ═══ Register ═══ */
      case "register":
        return (
          <>
            {regStep === "info" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">手机号码</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Phone className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => { setRegPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(""); }}
                      placeholder="请输入手机号码"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                      maxLength={11}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">昵称</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={regNickname}
                      onChange={(e) => setRegNickname(e.target.value)}
                      placeholder="设置你的昵称"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                      maxLength={20}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">设置密码</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type={showRegPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => { setRegPassword(e.target.value); setError(""); }}
                      placeholder="至少 8 位，包含字母和数字"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  </div>
                  {regPassword && !isRegPasswordValid && (
                    <p className="mt-1 text-xs text-amber-600">密码长度至少 8 位</p>
                  )}
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">确认密码</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type={showRegPassword ? "text" : "password"}
                      value={regConfirmPassword}
                      onChange={(e) => { setRegConfirmPassword(e.target.value); setError(""); }}
                      placeholder="再次输入密码"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                  {regConfirmPassword && !isRegPasswordMatch && (
                    <p className="mt-1 text-xs text-red-500">两次输入的密码不一致</p>
                  )}
                </div>

                {/* Terms agreement */}
                <div className="mt-5 flex items-start gap-2">
                  <button
                    onClick={() => setAgreeTerms(!agreeTerms)}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      agreeTerms ? "border-violet-500 bg-violet-500" : "border-gray-300 bg-white"
                    }`}
                  >
                    {agreeTerms && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <span className="text-xs text-gray-500">
                    我已阅读并同意{" "}
                    <Link to="/terms" className="text-violet-600 hover:underline" target="_blank">服务条款</Link>
                    {" "}和{" "}
                    <Link to="/privacy" className="text-violet-600 hover:underline" target="_blank">隐私政策</Link>
                  </span>
                </div>

                <button
                  onClick={handleRegSendCode}
                  disabled={!isRegPhoneValid || !isRegPasswordValid || !isRegPasswordMatch || !agreeTerms || !regNickname || loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>获取验证码 <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </>
            )}

            {regStep === "verify" && (
              <>
                <div className="mb-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-700">
                  验证码已发送至 <strong>{regPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")}</strong>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">验证码</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                      <ShieldCheck className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={regCode}
                      onChange={(e) => { setRegCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                      placeholder="请输入 6 位验证码"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-28 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                      maxLength={6}
                      autoFocus
                    />
                    <button
                      onClick={handleRegSendCode}
                      disabled={!isRegPhoneValid || regCountdown > 0}
                      className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-medium text-violet-600 transition hover:bg-violet-50 disabled:text-gray-400"
                    >
                      {regCountdown > 0 ? `${regCountdown}s 后重发` : "重新获取"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleRegister}
                  disabled={!isRegCodeValid || loading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>完成注册 <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>

                <button
                  onClick={() => setRegStep("info")}
                  className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600"
                >
                  返回修改信息
                </button>
              </>
            )}
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ─── Left Brand Panel ─── */}
      <div className="hidden w-[52%] flex-col justify-between bg-white p-12 lg:flex xl:p-16">
        {/* Top: Logo */}
        <div>
          <Link to="/landing" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
              AI
            </div>
            <span className="text-xl font-bold text-gray-900">爆款预测Agent</span>
          </Link>
        </div>

        {/* Middle: Hero text */}
        <div className="max-w-lg">
          <h1 className="overflow-visible text-4xl font-extrabold leading-tight text-gray-900 xl:text-5xl">
            用数据驱动
            <br />
            <span className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text pr-3 italic text-transparent">
              爆款内容创作
            </span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-gray-500">
            加入数千名创作者，使用 AI 驱动的内容决策引擎，发现爆款规律，提升创作效率。
          </p>

          {/* Product screenshot mockup */}
          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
              <div className="ml-3 h-5 flex-1 rounded bg-gray-200" />
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {[
                { label: "爆款预测", value: "7.5x", color: "bg-violet-50 text-violet-700" },
                { label: "播放增长", value: "+320%", color: "bg-emerald-50 text-emerald-700" },
                { label: "监控赛道", value: "12个", color: "bg-amber-50 text-amber-700" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-lg p-3 ${stat.color}`}>
                  <div className="text-xs opacity-70">{stat.label}</div>
                  <div className="mt-1 text-lg font-bold">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              "{TESTIMONIALS[0].text}"
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-bold text-white">
                {TESTIMONIALS[0].author[0]}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{TESTIMONIALS[0].author}</div>
                <div className="text-xs text-gray-400">{TESTIMONIALS[0].role}</div>
              </div>
            </div>
          </div>

          {/* Feature tags */}
          <div className="mt-6 flex flex-wrap gap-2">
            {LEFT_FEATURES.map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500"
              >
                <Check className="h-3 w-3 text-violet-500" />
                {f}
              </div>
            ))}
          </div>

          {/* Trust line */}
          <div className="mt-6 flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {["🎬", "🌿", "😂", "🏠", "💪"].map((e, i) => (
                <div
                  key={i}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs"
                >
                  {e}
                </div>
              ))}
            </div>
            <span className="text-sm text-gray-400">
              <strong className="text-gray-600">10,000+</strong> 创作者信赖
            </span>
          </div>
        </div>

        {/* Bottom spacer */}
        <div />
      </div>

      {/* ─── Right Login Panel ─── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-6">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            AI
          </div>
          <span className="text-xl font-bold text-gray-900">爆款预测Agent</span>
        </div>

        <div className="w-full max-w-md">
          {/* Badge */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-500" />
              加入 10,000+ 创作者
            </div>
          </div>

          {/* Title */}
          <h2 className="overflow-visible text-center text-2xl font-extrabold text-gray-900 md:text-3xl">
            {mode === "register" ? "创建账户" : "开始创作"}
            <span className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text pr-2 italic text-transparent">
              {mode === "register" ? " 加入我们" : " 爆款内容"}
            </span>
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500">
            {mode === "register"
              ? "注册账户，即刻体验 AI 内容决策"
              : mode === "password-login"
                ? "使用账号密码登录"
                : "使用手机号快速登录，即刻体验 AI 内容决策"}
          </p>

          {/* Mode tabs */}
          {mode !== "register" && (
            <div className="mt-6 flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
              <button
                onClick={() => switchMode("sms-login")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "sms-login"
                    ? "bg-primary text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                验证码登录
              </button>
              <button
                onClick={() => switchMode("password-login")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "password-login"
                    ? "bg-primary text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                密码登录
              </button>
            </div>
          )}

          {/* Login form */}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {/* Error message */}
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            {renderForm()}

            {/* Terms (for login modes) */}
            {mode !== "register" && (
              <p className="mt-4 text-center text-xs text-gray-400">
                登录即表示同意{" "}
                <Link to="/terms" className="text-violet-600 hover:underline">服务条款</Link>
                {" "}和{" "}
                <Link to="/privacy" className="text-violet-600 hover:underline">隐私政策</Link>
              </p>
            )}
          </div>

          {/* Switch between login and register */}
          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === "register" ? (
              <>
                已有账户？{" "}
                <button onClick={() => switchMode("sms-login")} className="font-medium text-violet-600 hover:underline">
                  立即登录
                </button>
              </>
            ) : (
              <>
                还没有账户？{" "}
                <button onClick={() => switchMode("register")} className="font-medium text-violet-600 hover:underline">
                  立即注册
                </button>
              </>
            )}
          </div>

          {/* Feature pills */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {FEATURE_PILLS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500"
              >
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} 爆款预测Agent. All rights reserved.
        </div>
      </div>
    </div>
  );
}
