// account-center/OverviewSection.tsx — Overview sub-components

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Link2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ConnectorRecord } from "../../store/app-data";
import type { FanProfile, TrendDataPoint } from "./types";
import { formatNumber } from "./types";

// ─── NoConnectorGuide ───────────────────────────────────────────────

export function NoConnectorGuide({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50">
          <Link2 className="h-7 w-7 text-blue-500" />
        </div>
        <h2 className="mb-2 text-lg font-medium text-gray-900">
          还没有绑定社交媒体账号
        </h2>
        <p className="mb-6 max-w-md text-sm text-gray-500">
          绑定你的社交媒体账号后，即可在这里查看账号数据概览、作品表现分析、粉丝画像等详细数据，
          帮助你更好地了解账号运营状况。
        </p>
        <div className="mb-8 grid grid-cols-3 gap-4 text-left">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <BarChart3 className="mb-2 h-5 w-5 text-blue-500" />
            <p className="text-xs font-medium text-gray-800">数据概览</p>
            <p className="mt-1 text-[11px] text-gray-400">粉丝、点赞、评论等核心指标一目了然</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <TrendingUp className="mb-2 h-5 w-5 text-green-500" />
            <p className="text-xs font-medium text-gray-800">趋势分析</p>
            <p className="mt-1 text-[11px] text-gray-400">近 30 天数据趋势，洞察增长规律</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <Sparkles className="mb-2 h-5 w-5 text-amber-500" />
            <p className="text-xs font-medium text-gray-800">AI 洞察</p>
            <p className="mt-1 text-[11px] text-gray-400">AI 自动总结评论区，发现用户真实需求</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          <Link2 className="h-4 w-4" />
          去绑定账号
        </button>
      </div>
    </div>
  );
}

// ─── PlatformSelector ───────────────────────────────────────────────

export function PlatformSelector({
  connectors,
  selected,
  onSelect,
}: {
  connectors: ConnectorRecord[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {connectors.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            selected === c.id
              ? "bg-gray-900 text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: c.color }}
          />
          {c.name}
        </button>
      ))}
    </div>
  );
}

// ─── MetricCard ─────────────────────────────────────────────────────

export function MetricCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel,
  color,
  isPercentage: _isPercentage,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  color: string;
  isPercentage?: boolean;
}) {
  const isPositive = change >= 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}>
          {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {changeLabel}
        </div>
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

// ─── MiniTrendChart ─────────────────────────────────────────────────

export function MiniTrendChart({
  data,
  dataKey,
  color,
  label,
}: {
  data: TrendDataPoint[];
  dataKey: string;
  color: string;
  label: string;
}) {
  const recent = data.slice(-14);

  if (recent.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <span className="text-xs text-gray-400">近 14 天</span>
        </div>
        <div className="flex h-16 items-center justify-center text-xs text-gray-400">
          暂无趋势数据，请点击"同步数据"获取
        </div>
      </div>
    );
  }

  const recentValues = recent.map((d) => (d[dataKey] as number) || 0);
  const recentMax = Math.max(...recentValues);
  const recentMin = Math.min(...recentValues);
  const recentRange = recentMax - recentMin || 1;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">近 14 天</span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: 64 }}>
        {recent.map((d, i) => {
          const val = (d[dataKey] as number) || 0;
          const h = Math.max(4, ((val - recentMin) / recentRange) * 56 + 8);
          return (
            <div
              key={d.date}
              className="flex-1 rounded-t transition-all hover:opacity-80"
              style={{ height: h, backgroundColor: color, opacity: 0.3 + (i / recent.length) * 0.7 }}
              title={`${d.date}: ${formatNumber(val)}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
        <span>{recent[0]?.date}</span>
        <span className="font-medium text-gray-600">{formatNumber(recentValues[recentValues.length - 1])}</span>
        <span>{recent[recent.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ─── FanProfileSection ──────────────────────────────────────────────

export function FanProfileSection({ profile }: { profile: FanProfile }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-800">粉丝画像</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* 性别比例 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-medium text-gray-600">性别分布</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-pink-600">女性</span>
                <span className="font-medium">{profile.genderRatio.female}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-pink-400 transition-all" style={{ width: `${profile.genderRatio.female}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-blue-600">男性</span>
                <span className="font-medium">{profile.genderRatio.male}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${profile.genderRatio.male}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* 年龄分布 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-medium text-gray-600">年龄分布</p>
          <div className="space-y-2">
            {profile.ageDistribution.map((item) => (
              <div key={item.range} className="flex items-center gap-2">
                <span className="w-16 text-[10px] text-gray-500">{item.range}</span>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${item.percentage * 2.5}%` }} />
                  </div>
                </div>
                <span className="w-8 text-right text-[10px] font-medium text-gray-600">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 城市分布 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-medium text-gray-600">城市 TOP 6</p>
          <div className="space-y-2">
            {profile.topCities.map((item, i) => (
              <div key={item.city} className="flex items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-xs text-gray-700">{item.city}</span>
                <span className="text-[10px] font-medium text-gray-500">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 兴趣标签 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-medium text-gray-600">兴趣标签</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.interestTags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
