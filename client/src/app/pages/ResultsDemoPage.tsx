/**
 * ResultsDemoPage — Module F1
 * ============================
 * 路由 /results/demo
 * 展示完整的 mock 预测结果，顶部有浅黄色 banner 提示这是示例。
 * 同时标记 Checklist 中「查看爆款预测」已完成。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { NewPredictionResult } from "../components/results/renderers/new-prediction-result";
import { useOnboarding } from "../lib/onboarding-context";

export function ResultsDemoPage() {
  const navigate = useNavigate();
  const [bannerVisible, setBannerVisible] = useState(true);
  const { markChecklistDone } = useOnboarding();

  // 上手任务追踪：查看爆款预测（C1 第4项）
  useEffect(() => {
    markChecklistDone("prediction");
  }, [markChecklistDone]);

  return (
    <div className="relative">
      {/* Demo banner */}
      {bannerVisible && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[13px] text-[#92400E]">
            <Sparkles className="h-4 w-4 shrink-0 text-[#D97706]" />
            <span>这是一个示例分析，展示 AI 输出的真实质量。</span>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 text-[#D97706] underline underline-offset-2 transition-colors hover:text-[#B45309]"
            >
              开始你自己的分析
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setBannerVisible(false)}
            className="ml-4 shrink-0 text-[#92400E]/60 transition-colors hover:text-[#92400E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <NewPredictionResult />
    </div>
  );
}
