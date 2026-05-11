import { useEffect, useState } from "react";
import {
  getDashboard,
  getSkillBreakdown,
  getModelCost,
  getDashboardFunnel,
  type DashboardData,
  type SkillBreakdownRow,
  type ModelCostRow,
  type FunnelStage,
} from "../api";

// ── 视觉飘红规则 ─────────────────────────────────────────────────────────────

function successRateColor(rate: number | null): string {
  if (rate == null) return "text-gray-600";
  if (rate >= 95) return "text-emerald-400";
  if (rate >= 80) return "text-amber-400";
  return "text-red-400";
}

function durationColor(ms: number | null): string {
  if (ms == null) return "text-gray-600";
  if (ms < 5000) return "text-emerald-400";
  if (ms < 15000) return "text-amber-400";
  return "text-red-400";
}

function tokenColor(t: number | null): string {
  if (t == null) return "text-gray-600";
  if (t < 1000) return "text-emerald-400";
  if (t < 4000) return "text-amber-400";
  return "text-red-400";
}

const STAGE_LABEL: Record<string, string> = {
  stage1_input:     "输入",
  stage2_collect:   "采集",
  stage3_analyze:   "分析",
  stage4_predict:   "预测",
  stage5_recommend: "推荐",
  stage6_tools:     "工具",
};

// ── 通用组件 ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "indigo",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "indigo" | "emerald" | "amber" | "rose";
}) {
  const colorMap = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

// ── 漏斗组件 ─────────────────────────────────────────────────────────────────

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) {
    return <p className="text-gray-600 text-sm">暂无数据</p>;
  }
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((s, idx) => {
        const widthPct = (s.count / max) * 100;
        // 转化率 = 当前阶段 / 上一阶段
        const prevCount = idx > 0 ? stages[idx - 1].count : null;
        const conversion = prevCount && prevCount > 0
          ? Math.round((s.count / prevCount) * 1000) / 10
          : null;
        // 飘红：转化率 < 30% 标红
        const convColor = conversion == null
          ? ""
          : conversion >= 50
            ? "text-emerald-400"
            : conversion >= 30
              ? "text-amber-400"
              : "text-red-400";
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="w-28 flex-shrink-0">
              <p className="text-sm text-gray-300">{s.label}</p>
              {conversion != null && (
                <p className={`text-xs font-mono ${convColor}`}>↳ {conversion}%</p>
              )}
            </div>
            <div className="flex-1 bg-gray-800 rounded-md h-8 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-700 to-indigo-500 rounded-md transition-all"
                style={{ width: `${widthPct}%` }}
              />
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-xs font-mono text-white">{s.count.toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 主页面 ───────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [breakdown, setBreakdown] = useState<SkillBreakdownRow[]>([]);
  const [models, setModels] = useState<ModelCostRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDashboard(),
      getSkillBreakdown(days),
      getModelCost(days),
      getDashboardFunnel(),
    ])
      .then(([d, b, m, f]) => {
        setData(d);
        setBreakdown(b.breakdown);
        setModels(m.models);
        setFunnel(f.funnel);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
        加载失败：{error}
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.coreKPIs;

  // KPI 飘红：今日新增同比昨日跌 ≥ 20% → 红
  const newTodayDrop = kpis.totalUsersYesterday > 0
    ? (kpis.totalUsers - kpis.totalUsersYesterday) / kpis.totalUsersYesterday
    : 0;
  const dauColor = newTodayDrop < -0.2 ? "rose" : "amber";

  // 时间窗口选择器
  const periodSelector = (
    <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
      {[1, 7, 14, 30].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDays(d)}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            days === d ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          {d}天
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">核心指标</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="总用户数" value={kpis.totalUsers} color="indigo" />
          <KpiCard label="今日新增" value={kpis.newToday} color="emerald" />
          <KpiCard label="日活用户 (DAU)" value={kpis.dau} color={dauColor} />
          <KpiCard
            label="付费用户"
            value={kpis.paidUsers}
            sub={`转化率 ${data.userComposition.paidConversionRate.toFixed(1)}%`}
            color="rose"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="积分总量" value={Number(kpis.totalCredits).toLocaleString()} color="indigo" />
        <KpiCard label="今日收入" value={`¥${kpis.todayRevenue}`} color="emerald" />
        <KpiCard label="总收入" value={`¥${kpis.totalRevenue}`} color="amber" />
        <KpiCard label="预测任务总数" value={kpis.totalArtifacts} color="rose" />
      </div>

      {/* 业务漏斗 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">业务漏斗</h2>
          <span className="text-xs text-gray-600">注册 → 首次预测 → 活跃 → 付费 → 续费 · 各阶段转化率（飘红：&lt; 30%）</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <FunnelChart stages={funnel} />
        </div>
      </div>

      {/* 技能调用切片表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">技能调用切片</h2>
          {periodSelector}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">技能</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">阶段</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">调用次数</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">成功率</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">平均耗时</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">平均 Token</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">总 Token</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">暂无调用数据</td>
                </tr>
              ) : (
                breakdown.map((row) => (
                  <tr key={row.skillId} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm">{row.label}</span>
                        {row.entrySource === "workbench" && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800">入口</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {STAGE_LABEL[row.stage] ?? row.stage}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-300">
                      {row.callCount.toLocaleString()}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm ${successRateColor(row.successRate)}`}>
                      {row.successRate != null ? `${row.successRate}%` : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm ${durationColor(row.avgDurationMs)}`}>
                      {row.avgDurationMs != null ? `${row.avgDurationMs}ms` : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-sm ${tokenColor(row.avgTokens)}`}>
                      {row.avgTokens ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-400">
                      {row.totalTokens.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          飘红规则：成功率 &lt; 80% 标红、80-95% 标黄；平均耗时 &gt; 15s 标红、5-15s 标黄；平均 token &gt; 4000 标红、1000-4000 标黄
        </p>
      </div>

      {/* 模型成本切片 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">模型成本（近 {days} 日）</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {models.length === 0 ? (
            <div className="md:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-6 text-gray-600 text-sm text-center">
              暂无模型调用数据
            </div>
          ) : (
            models.map((m) => (
              <div key={m.modelId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white font-medium">{m.modelId}</span>
                  <span className="text-xs text-gray-500">{m.callCount.toLocaleString()} 次</span>
                </div>
                <p className="text-2xl font-bold text-amber-400">{m.totalCredits.toLocaleString()}</p>
                <p className="text-xs text-gray-600 mt-1">总积分消耗</p>
                <div className="flex gap-3 mt-3 text-xs text-gray-500">
                  <span>prompt: <span className="text-gray-400 font-mono">{m.promptTokens.toLocaleString()}</span></span>
                  <span>completion: <span className="text-gray-400 font-mono">{m.completionTokens.toLocaleString()}</span></span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 留存（带视觉飘红） */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">留存率</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "次日留存 D1", value: data.retention.d1, threshold: { good: 40, warn: 20 } },
            { label: "7日留存 D7",  value: data.retention.d7, threshold: { good: 25, warn: 10 } },
            { label: "30日留存 D30", value: data.retention.d30, threshold: { good: 15, warn: 5 } },
          ].map((r) => {
            const v = parseFloat(String(r.value));
            const color = isNaN(v)
              ? "text-gray-500"
              : v >= r.threshold.good
                ? "text-emerald-400"
                : v >= r.threshold.warn
                  ? "text-amber-400"
                  : "text-red-400";
            return (
              <div key={r.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">{r.label}</p>
                <p className={`text-2xl font-bold ${color}`}>{r.value}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Revenue */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">收入概览</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="今日" value={`¥${data.revenue.today}`} color="emerald" />
          <KpiCard label="本周" value={`¥${data.revenue.thisWeek}`} color="emerald" />
          <KpiCard label="本月" value={`¥${data.revenue.thisMonth}`} color="emerald" />
          <KpiCard label="ARPU" value={`¥${data.revenue.arpu}`} color="emerald" />
        </div>
      </div>

      {/* Membership Distribution */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">会员分布</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex flex-wrap gap-4">
            {Object.entries(data.userComposition.membershipDistribution).map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-sm text-gray-300 capitalize">{plan}</span>
                <span className="text-sm font-semibold text-white">{count} 人</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
