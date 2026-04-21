import { useState } from "react";
import { login, setToken } from "../api";

interface Props {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !code) {
      setError("请填写手机号和验证码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await login(phone, code);
      setToken(res.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查手机号和验证码");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">爆款预测Agent管理后台</h1>
          <p className="text-gray-400 text-sm mt-1">仅限授权管理员访问</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-800">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">手机号</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入管理员手机号"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">验证码</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入验证码"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">测试环境验证码：888888</p>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-3.5 py-2.5 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? "登录中..." : "登录管理后台"}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          © 2026 爆款预测Agent · 内部系统，请勿外传
        </p>
      </div>
    </div>
  );
}
