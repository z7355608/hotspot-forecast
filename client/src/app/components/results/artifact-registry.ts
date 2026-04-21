/**
 * Artifact Renderer Registry
 * ===========================
 * 核心架构：统一路由 + 产物渲染器注册表（Registry Pattern）
 *
 * 设计原则：
 * 1. Smart Shell 只负责通用控制（积分、分享、导航、深挖、CTA）
 * 2. 每种 artifactType 注册独立的 Dumb Renderer，自由定制展示
 * 3. 新增任务类型只需新增一个 renderer 文件并注册，无需修改 shell
 */

import type React from "react";
import type { ResultRecord } from "../../store/app-data";
import type { TaskArtifactType, TaskIntent } from "../../store/prediction-types";

/* ------------------------------------------------------------------ */
/*  Renderer 接口定义                                                   */
/* ------------------------------------------------------------------ */

/**
 * 每个 Dumb Renderer 接收的 props。
 * Shell 只传入 result，renderer 自行从中提取所需数据。
 */
export interface ArtifactRendererProps {
  result: ResultRecord;
}

/**
 * 每个 renderer 模块需要提供的注册信息。
 */
export interface ArtifactRendererRegistration {
  /** 产物类型标识 */
  artifactType: TaskArtifactType;
  /** 对应的任务意图（用于 fallback 匹配） */
  taskIntent: TaskIntent;
  /** 渲染器组件 */
  component: React.ComponentType<ArtifactRendererProps>;
  /** 该产物类型的 Hero 指标卡配置 */
  getHeroMetrics: (result: ResultRecord) => HeroMetricCard[];
  /** 该产物类型的深挖配置 */
  getDeepDiveConfig: (result: ResultRecord) => DeepDiveConfig;
  /** 该产物类型的 CTA 动作配置 */
  getCtaActions: (result: ResultRecord) => CtaActionConfig[];
  /** 该产物类型的 follow-up 快捷动作 */
  getFollowUpActions: (result: ResultRecord) => FollowUpAction[];
}

/* ------------------------------------------------------------------ */
/*  Shell 通用数据结构                                                   */
/* ------------------------------------------------------------------ */

export interface HeroMetricCard {
  label: string;
  value: string;
  detail: string;
  span?: string;
}

export interface DeepDiveConfig {
  title: string;
  description: string;
  placeholder: string;
  quickActions: ReadonlyArray<{ label: string; cost: number }>;
}

export interface CtaActionConfig {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  value: string;
  cost: number;
  prompt: string;
  highlight?: boolean;
}

export interface FollowUpAction {
  label: string;
  prompt: string;
}

/* ------------------------------------------------------------------ */
/*  Registry 实现                                                       */
/* ------------------------------------------------------------------ */

const registryByArtifactType = new Map<TaskArtifactType, ArtifactRendererRegistration>();
const registryByTaskIntent = new Map<TaskIntent, ArtifactRendererRegistration>();

/**
 * 注册一个产物渲染器。
 * 在各 renderer 模块的顶层调用。
 */
export function registerArtifactRenderer(registration: ArtifactRendererRegistration): void {
  registryByArtifactType.set(registration.artifactType, registration);
  registryByTaskIntent.set(registration.taskIntent, registration);
}

/**
 * 根据 ResultRecord 解析出对应的渲染器注册信息。
 * 优先按 artifactType 匹配，fallback 到 taskIntent。
 * 特殊规则：如果 taskPayload 包含 trendOpportunities，强制使用 opportunity_prediction 渲染器
 * （因为意图分类可能将爆款预测误分为 topic_strategy 等其他类型）
 */
export function resolveRenderer(result: ResultRecord): ArtifactRendererRegistration | null {
  // 特殊规则：如果 taskPayload 包含 trendOpportunities，强制使用 opportunity_prediction 渲染器
  const tp = result.taskPayload as unknown as Record<string, unknown> | undefined;
  if (tp && Array.isArray(tp.trendOpportunities) && tp.trendOpportunities.length > 0) {
    const oppRenderer = registryByTaskIntent.get("opportunity_prediction" as TaskIntent);
    if (oppRenderer) return oppRenderer;
  }
  const artifactType = result.primaryArtifact?.artifactType;
  if (artifactType && registryByArtifactType.has(artifactType)) {
    return registryByArtifactType.get(artifactType)!;
  }
  if (registryByTaskIntent.has(result.taskIntent)) {
    return registryByTaskIntent.get(result.taskIntent)!;
  }
  return null;
}

/**
 * 获取所有已注册的渲染器（用于调试或动态列表）。
 */
export function getAllRegistrations(): ArtifactRendererRegistration[] {
  return Array.from(registryByArtifactType.values());
}
