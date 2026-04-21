import { useEffect, useState } from "react";
import { Eye, Target, TrendingUp, Trophy, Zap } from "lucide-react";

const slides = [
  {
    text: "不是发出去才知道，而是发之前先知道",
    icon: Eye,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    text: "内容值不值得做，先看结论再决定投入",
    icon: Target,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    text: "从“事后复盘”升级成“事前判断”",
    icon: TrendingUp,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    text: "热点不是用来看的，是用来抢的",
    icon: Zap,
    gradient: "from-orange-500 to-red-500",
  },
  {
    text: "帮你找到还能做、还能赢、还能吃到红利的趋势",
    icon: Trophy,
    gradient: "from-amber-500 to-yellow-500",
  },
] as const;

export function ValueCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % slides.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  const CurrentIcon = slides[currentIndex].icon;

  return (
    <div className="mx-auto max-w-4xl border-t border-gray-100 px-4 py-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100/50 p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-purple-500/5 blur-3xl" />

        <div className="relative">
          <div className="flex min-h-[90px] flex-col items-center justify-center gap-4 text-center sm:flex-row sm:gap-6 sm:text-left">
            <div className="relative h-24 w-24 shrink-0">
              <div className="absolute inset-0 rounded-xl bg-white shadow-sm" />
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 p-4">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${slides[currentIndex].gradient}`}
                >
                  <CurrentIcon className="h-4 w-4 text-white" strokeWidth={2} />
                </div>
                <div className="flex items-end gap-1">
                  <div
                    className={`h-8 w-4 rounded-sm bg-gradient-to-t ${slides[currentIndex].gradient} opacity-20`}
                  />
                  <div
                    className={`h-12 w-4 rounded-sm bg-gradient-to-t ${slides[currentIndex].gradient} opacity-40`}
                  />
                  <div
                    className={`h-16 w-4 rounded-sm bg-gradient-to-t ${slides[currentIndex].gradient} opacity-60`}
                  />
                  <div
                    className={`h-10 w-4 rounded-sm bg-gradient-to-t ${slides[currentIndex].gradient} opacity-30`}
                  />
                </div>
              </div>
            </div>

            <div className="max-w-md flex-1">
              <p className="text-base leading-relaxed text-gray-900 transition-opacity duration-500">
                {slides[currentIndex].text}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.text}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`rounded-full transition-all ${
                    index === currentIndex
                      ? "h-2 w-8 bg-gray-900"
                      : "h-2 w-2 bg-gray-300 hover:bg-gray-400"
                  }`}
                  aria-label={`跳转到第 ${index + 1} 条`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
