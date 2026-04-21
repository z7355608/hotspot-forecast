import { useEffect, useState } from "react";
import { getDashboard, type DashboardData } from "../api";

function KpiCard({
  label,
  value,
  sub,
  color = "indigo",
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

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">核心指标</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="总用户数" value={kpis.totalUsers} color="indigo" />
          <KpiCard label="今日新增" value={kpis.newToday} color="emerald" />
          <KpiCard label="日活用户 (DAU)" value={kpis.dau} color="amber" />
          <KpiCard label="付费用户" value={kpis.paidUsers} sub={`转化率 ${data.userComposition.paidConversionRate.toFixed(1)}%`} color="rose" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="积分总量" value={Number(kpis.totalCredits).toLocaleString()} color="indigo" />
        <KpiCard label="今日收入" value={`¥${kpis.todayRevenue}`} color="emerald" />
        <KpiCard label="总收入" value={`¥${kpis.totalRevenue}`} color="amber" />
        <KpiCard label="预测任务总数" value={kpis.totalArtifacts} color="rose" />
      </div>

      {/* Retention */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">留存率</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">次日留存 D1</p>
            <p className="text-2xl font-bold text-indigo-400">{data.retention.d1}%</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">7日留存 D7</p>
            <p className="text-2xl font-bold text-indigo-400">{data.retention.d7}%</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">30日留存 D30</p>
            <p className="text-2xl font-bold text-indigo-400">{data.retention.d30}%</p>
          </div>
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
