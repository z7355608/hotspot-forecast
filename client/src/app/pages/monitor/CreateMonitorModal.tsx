/**
 * 创建监控任务弹窗
 * 从 MonitorPage.tsx 提取
 */
import { useState } from "react";
import {
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import {
  TASK_TYPE_META,
  SCHEDULE_OPTIONS,
  PLATFORM_OPTIONS,
  DIMENSION_PRESETS,
} from "./monitor-constants";
import type {
  PredictionWatchScheduleTier,
  PredictionWatchTaskType,
} from "./monitor-constants";

type CreateStep = "type" | "config";

export interface CreateMonitorModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    taskType: PredictionWatchTaskType;
    platform: "douyin" | "xiaohongshu" | "kuaishou";
    title: string;
    target: string;
    dimensions: string[];
    scheduleTier: PredictionWatchScheduleTier;
  }) => { ok: boolean; shortfall?: number };
  credits: number;
}

export function CreateMonitorModal({ open, onClose, onCreate, credits }: CreateMonitorModalProps) {
  const [step, setStep] = useState<CreateStep>("type");
  const [taskType, setTaskType] = useState<PredictionWatchTaskType>("topic_watch");
  const [platform, setPlatform] = useState<"douyin" | "xiaohongshu" | "kuaishou">("douyin");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [scheduleTier, setScheduleTier] = useState<PredictionWatchScheduleTier>("every_72h");
  const [error, setError] = useState("");

  if (!open) return null;

  const typeMeta = TASK_TYPE_META[taskType];
  const presetDimensions = DIMENSION_PRESETS[taskType] ?? [];
  const selectedSchedule = SCHEDULE_OPTIONS.find((s) => s.value === scheduleTier)!;
  const monthlyCost = selectedSchedule.costPerRun * selectedSchedule.runsPerMonth;

  const toggleDimension = (label: string) => {
    setDimensions((prev) =>
      prev.includes(label) ? prev.filter((d) => d !== label) : [...prev, label],
    );
  };

  const handleSelectType = (type: PredictionWatchTaskType) => {
    setTaskType(type);
    setDimensions([]);
    setStep("config");
  };

  const handleCreate = () => {
    if (!title.trim()) {
      setError("请输入监控名称");
      return;
    }
    if (!target.trim()) {
      setError(taskType === "topic_watch" ? "请输入赛道关键词" : taskType === "account_watch" ? "请输入账号链接或名称" : "请输入作品链接");
      return;
    }
    if (dimensions.length === 0) {
      setError("请至少选择一个监控维度");
      return;
    }
    const result = onCreate({
      taskType,
      platform,
      title: title.trim(),
      target: target.trim(),
      dimensions,
      scheduleTier,
    });
    if (result.ok) {
      setStep("type");
      setTitle("");
      setTarget("");
      setDimensions([]);
      setScheduleTier("every_72h");
      setError("");
      onClose();
    } else {
      setError(`积分不足，还差 ${result.shortfall} 积分`);
    }
  };

  const handleBack = () => {
    setStep("type");
    setError("");
  };

  const targetPlaceholder =
    taskType === "topic_watch"
      ? "输入赛道关键词，如「美妆护肤」「健身减脂」"
      : taskType === "account_watch"
        ? "输入账号主页链接或账号名称"
        : taskType === "content_watch"
          ? "输入作品链接（抖音/小红书）"
          : "输入要验证的预测主题";

  const targetLabel =
    taskType === "topic_watch"
      ? "赛道关键词"
      : taskType === "account_watch"
        ? "目标账号"
        : taskType === "content_watch"
          ? "作品链接"
          : "验证主题";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            {step === "config" && (
              <button
                type="button"
                onClick={handleBack}
                className="mr-1 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <h2 className="text-base font-medium text-gray-900">
              {step === "type" ? "创建监控任务" : `配置${typeMeta.label}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1: 选择监控类型 */}
        {step === "type" && (
          <div className="p-6">
            <p className="mb-4 text-sm text-gray-500">
              选择你要创建的监控类型
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["topic_watch", "account_watch", "content_watch", "validation_watch"] as PredictionWatchTaskType[]).map(
                (type) => {
                  const meta = TASK_TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSelectType(type)}
                      className="group flex flex-col items-start rounded-xl border border-gray-200 p-4 text-left transition-all hover:border-gray-300 hover:shadow-sm"
                    >
                      <div
                        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${meta.bg}`}
                      >
                        <Icon className={`h-5 w-5 ${meta.color}`} />
                      </div>
                      <p className="text-sm font-medium text-gray-800">
                        {meta.label}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {meta.description}
                      </p>
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}

        {/* Step 2: 配置详情 */}
        {step === "config" && (
          <div className="max-h-[70vh] overflow-y-auto p-6">
            {/* 监控名称 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                监控名称
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError("");
                }}
                placeholder="给监控任务起个名字"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
              />
            </div>

            {/* 目标平台 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                目标平台
              </label>
              <div className="flex gap-2">
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPlatform(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      platform === opt.value
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 监控目标 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                {targetLabel}
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setError("");
                }}
                placeholder={targetPlaceholder}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
              />
            </div>

            {/* 监控维度 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                监控维度
                <span className="ml-1 text-gray-400">（至少选 1 个）</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {presetDimensions.map((dim) => {
                  const isSelected = dimensions.includes(dim.label);
                  const DimIcon = dim.icon;
                  return (
                    <button
                      key={dim.label}
                      type="button"
                      onClick={() => toggleDimension(dim.label)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <DimIcon className="h-3 w-3" />
                      {dim.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 执行频率 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                执行频率
              </label>
              <div className="space-y-2">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScheduleTier(opt.value)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                      scheduleTier === opt.value
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-800">
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {opt.desc}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-700">
                        {opt.costPerRun} 积分/次
                      </p>
                      <p className="text-[10px] text-gray-400">
                        ~{opt.costPerRun * opt.runsPerMonth} 积分/月
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 积分预估 */}
            <div className="mb-4 rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">创建消耗</span>
                <span className="font-medium text-gray-700">15 积分</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">月度预估</span>
                <span className="font-medium text-gray-700">~{monthlyCost} 积分/月</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">当前余额</span>
                <span className={`font-medium ${credits < 15 ? "text-red-600" : "text-gray-700"}`}>
                  {credits} 积分
                </span>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Plus className="h-3.5 w-3.5" />
                创建监控
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
