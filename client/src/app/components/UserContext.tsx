import React from 'react';
import { Target, Compass, Settings } from 'lucide-react';

export function UserContext() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 border-t border-gray-100">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-sm text-gray-500 uppercase tracking-wide">当前上下文</h3>
        <button className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
          <Settings className="w-4 h-4" />
          <span>调整偏好</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 平台偏好 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Compass className="w-4 h-4" />
            <span className="text-sm font-medium">平台偏好</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-100">
              YouTube
            </span>
            <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-100">
              小红书
            </span>
            <span className="px-3 py-1.5 bg-gray-50 text-gray-600 text-sm rounded-full border border-gray-200">
              抖音
            </span>
          </div>
        </div>

        {/* 内容方向 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Target className="w-4 h-4" />
            <span className="text-sm font-medium">内容方向</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 bg-purple-50 text-purple-700 text-sm rounded-full border border-purple-100">
              技术教学
            </span>
            <span className="px-3 py-1.5 bg-purple-50 text-purple-700 text-sm rounded-full border border-purple-100">
              效率工具
            </span>
          </div>
        </div>

        {/* 当前目标 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <Target className="w-4 h-4" />
            <span className="text-sm font-medium">当前目标</span>
          </div>
          <p className="text-sm text-gray-600">
            扩大影响力，建立技术创作者个人品牌
          </p>
        </div>
      </div>
    </div>
  );
}
