import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Tab = "password" | "sms";

const PHONE_RE = /^1[3-9]\d{9}$/;

export function LoginFormPanel() {
  const [tab, setTab] = useState<Tab>("sms");
  const [error, setError] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  // Auto-clear hint after 3s
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3000);
    return () => clearTimeout(t);
  }, [hint]);

  const showComingSoon = () =>
    setHint("功能即将开放 · 当前请使用短信登录直接体验");

  return (
    <div className="flex h-full flex-col px-10 py-9">
      {/* Tab header */}
      <div className="flex items-center gap-8 border-b border-gray-100">
        <TabHeader label="账号登录" active={tab === "password"} onClick={() => { setTab("password"); setError(""); }} />
        <TabHeader label="短信登录" active={tab === "sms"} onClick={() => { setTab("sms"); setError(""); }} />
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
      )}

      {/* Forms */}
      <div className="mt-6 flex-1">
        {tab === "sms" ? (
          <SmsForm setError={setError} />
        ) : (
          <PasswordForm setError={setError} />
        )}
      </div>

      {/* Inline hint */}
      {hint && (
        <div className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-center text-[11px] text-violet-700">
          {hint}
        </div>
      )}

      {/* Footer links — placeholder buttons until register/reset is wired up */}
      <div className="mt-6 flex justify-center gap-6 text-xs text-gray-400">
        <button type="button" onClick={showComingSoon} className="transition hover:text-violet-600">
          注册账号
        </button>
        <span className="text-gray-200">|</span>
        <button type="button" onClick={showComingSoon} className="transition hover:text-violet-600">
          忘记密码
        </button>
      </div>
    </div>
  );
}

function TabHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative pb-3 text-base font-medium transition ${
        active ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
      }`}
    >
      {label}
      {active && (
        <span className="absolute -bottom-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-gray-900" />
      )}
    </button>
  );
}

/* ─── SMS form ─── */
function SmsForm({ setError }: { setError: (msg: string) => void }) {
  const { refresh } = useAuth({ mode: "modal" });
  const phoneLogin = trpc.auth.phoneLogin.useMutation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const phoneValid = PHONE_RE.test(phone);
  const codeValid = /^\d{4,6}$/.test(code);
  const canSubmit = phoneValid && codeValid && !submitting;

  const sendCode = useCallback(async () => {
    if (!phoneValid || countdown > 0) return;
    setError("");
    // MVP: no real SMS gateway — just start countdown
    await new Promise((r) => setTimeout(r, 400));
    setCountdown(60);
  }, [phoneValid, countdown, setError]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await phoneLogin.mutateAsync({ phone, code });
      await refresh();
      // view='closed' is set by AuthModalProvider effect once refresh returns user
    } catch (err: any) {
      setError(err?.message || "验证码错误，请重试（开发期固定码：888888）");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, phone, code, phoneLogin, refresh, setError]);

  return (
    <div className="flex h-full flex-col">
      <input
        type="tel"
        value={phone}
        onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 11)); setError(""); }}
        placeholder="请输入手机号"
        maxLength={11}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
      />

      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
          placeholder="短信验证码"
          maxLength={6}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
        />
        <button
          onClick={sendCode}
          disabled={!phoneValid || countdown > 0}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs font-medium text-gray-700 transition hover:border-violet-300 hover:text-violet-600 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          {countdown > 0 ? `${countdown}s` : "获取验证码"}
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        登录即代表你已阅读并同意{" "}
        <Link to="/terms" className="text-violet-600 hover:underline" target="_blank">
          《Agent 用户服务协议》
        </Link>
      </p>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition ${
          canSubmit
            ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700"
            : "bg-gray-300 text-white"
        }`}
      >
        {submitting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          "登录"
        )}
      </button>
    </div>
  );
}

/* ─── Password form ─── */
function PasswordForm({ setError }: { setError: (msg: string) => void }) {
  const { refresh } = useAuth({ mode: "modal" });
  const phoneLogin = trpc.auth.phoneLogin.useMutation();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = account.length > 0 && password.length >= 6 && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      // MVP: backend has only phoneLogin; account treated as phone, password as code.
      await phoneLogin.mutateAsync({ phone: account, code: password });
      await refresh();
    } catch (err: any) {
      setError(err?.message || "账号或密码错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, account, password, phoneLogin, refresh, setError]);

  return (
    <div className="flex h-full flex-col">
      <input
        type="text"
        value={account}
        onChange={(e) => { setAccount(e.target.value); setError(""); }}
        placeholder="请输入用户名"
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
      />

      <input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(""); }}
        placeholder="请输入密码"
        className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
      />

      <p className="mt-4 text-xs text-gray-400">
        登录即代表你已阅读并同意{" "}
        <Link to="/terms" className="text-violet-600 hover:underline" target="_blank">
          《Agent 用户服务协议》
        </Link>
      </p>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition ${
          canSubmit
            ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700"
            : "bg-gray-300 text-white"
        }`}
      >
        {submitting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          "登录"
        )}
      </button>
    </div>
  );
}
