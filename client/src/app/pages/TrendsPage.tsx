import React from 'react';
import { useNavigate } from 'react-router';
import { TrendingUp, ArrowLeft } from 'lucide-react';

export function TrendsPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] px-6 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
        <TrendingUp className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-base text-gray-700 mb-2">热门趋势</p>
      <p className="text-sm text-gray-400 mb-1">全平台创作趋势聚合看板，预计 Q2 上线</p>
      <p className="text-xs text-gray-300 mb-8">实时热点 · 赛道涨粉速率 · 跨平台趋势对比</p>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回首页
      </button>
    </div>
  );
}
