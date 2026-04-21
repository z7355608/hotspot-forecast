/**
 * store-types.ts — app-store-provider 的类型定义
 * 从 app-store-provider.tsx 中提取，供 store-helpers.ts 和 app-store-provider.tsx 共享
 */

import type {
  AIModelId,
  BreakdownGeneratedResult,
  ConnectorRecord,
  MembershipPlan,
  NotificationChannelRecord,
  ResultRecord,
  TransactionRecord,
} from "./app-data";
import type { SavedResultArtifactSummary, WatchTaskSummary } from "../lib/result-artifacts-api";
import type { AppDataMode, UserProfile } from "./prediction-types";

export interface AppState {
  dataMode: AppDataMode;
  credits: number;
  membershipPlan: MembershipPlan;
  selectedModel: AIModelId;
  connectors: ConnectorRecord[];
  /** 用户选择参与分析的平台ID列表（与账号绑定 connected 分离） */
  selectedPlatformIds: string[];
  notificationChannels: NotificationChannelRecord[];
  results: ResultRecord[];
  savedArtifacts: SavedResultArtifactSummary[];
  watchTasks: WatchTaskSummary[];
  breakdownResults: Record<string, BreakdownGeneratedResult[]>;
  apiHealth: ApiHealthState;
  endpointHealth: EndpointHealthSummary[];
  transactions: TransactionRecord[];
  monthlySpent: number;
  totalEarned: number;
  userProfile: UserProfile;
}

export interface ModeScopedState {
  connectors: ConnectorRecord[];
  selectedPlatformIds: string[];
  notificationChannels: NotificationChannelRecord[];
  results: ResultRecord[];
  savedArtifacts: SavedResultArtifactSummary[];
  watchTasks: WatchTaskSummary[];
  breakdownResults: Record<string, BreakdownGeneratedResult[]>;
  apiHealth: ApiHealthState;
  endpointHealth: EndpointHealthSummary[];
}

export interface GlobalState {
  dataMode: AppDataMode;
  credits: number;
  membershipPlan: MembershipPlan;
  selectedModel: AIModelId;
  transactions: TransactionRecord[];
  monthlySpent: number;
  totalEarned: number;
  userProfile: UserProfile;
}

export interface EndpointHealthSummary {
  path: string;
  method: "GET" | "POST";
  capability: string;
  httpStatus: number;
  businessCode: number | null;
  stable: boolean;
  tier: "L1" | "L2" | "L3";
  verifiedAt: string;
  failureReason?: string;
}

export interface ApiHealthState {
  status: "unknown" | "checking" | "ready" | "unavailable";
  message?: string;
  checkedAt?: string;
  services: {
    livePrediction: boolean;
    notifications: boolean;
  };
}

export interface StartAnalysisSuccess {
  ok: true;
  resultId: string;
  cost: number;
}

export interface ActionFailure {
  ok: false;
  shortfall: number;
  error?: string;
}

export type ActionResult = StartAnalysisSuccess | ActionFailure;
