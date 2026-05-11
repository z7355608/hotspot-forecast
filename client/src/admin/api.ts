/**
 * 管理后台 API 客户端
 * 封装所有 /api/admin/* 接口调用
 */

const TOKEN_KEY = "admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    window.location.href = "/admin";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "请求失败");
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AdminUser {
  phone: string;
  nickname: string;
  isAdmin: boolean;
}

export async function login(phone: string, code: string): Promise<{ token: string } & AdminUser> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export async function getMe(): Promise<AdminUser> {
  return request("/me");
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardData {
  coreKPIs: {
    totalUsers: number;
    totalUsersYesterday: number;
    dau: number;
    newToday: number;
    totalCredits: string | number;
    todayRevenue: number;
    totalRevenue: number;
    paidUsers: number;
    totalArtifacts: number;
  };
  activityTrend: Array<{ date: string; count: number }>;
  retention: {
    d1: string;
    d7: string;
    d30: string;
    newUserWeek: string;
    newUserMonth: string;
    trend: Array<{ date: string; d1: number; d7: number }>;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
    arpu: number;
    trend: Array<{ date: string; amount: number }>;
    byType: Array<{ type: string; amount: number }>;
  };
  userComposition: {
    membershipDistribution: Record<string, number>;
    newUserTrend: Array<{ date: string; count: number }>;
    paidConversionRate: number;
  };
}

export async function getDashboard(): Promise<DashboardData> {
  return request("/dashboard");
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface AdminUserRecord {
  id: string;
  phone: string;
  nickname: string;
  membershipPlan: string;
  credits: number;
  totalSpent: number;
  totalEarned: number;
  totalPredictions: number;
  isAdmin: boolean;
  status: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface UsersResponse {
  users: AdminUserRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<UsersResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.search) q.set("search", params.search);
  return request(`/users?${q}`);
}

export async function updateUser(
  id: string,
  data: { credits?: number; membershipPlan?: string }
): Promise<{ success: boolean }> {
  return request(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface SystemConfig {
  adminWhitelist: Array<{ phone: string; nickname: string; isActive: boolean }>;
  defaultCredits: number;
  maxFreeCredits: number;
  maintenanceMode: boolean;
  tikhubEnabled: boolean;
  dailyFreeLimit: number;
  monthlyPrice: number;
  yearlyPrice: number;
}

export async function getConfig(): Promise<SystemConfig> {
  return request("/config");
}

export async function updateConfig(data: Partial<SystemConfig>): Promise<{ success: boolean }> {
  return request("/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Skills ────────────────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  label: string;
  desc_text: string;
  icon: string;
  enabled: boolean;
  creditCost: number;
  requiredPlan: string;
  // Extended fields from DB
  category?: string;
  /** Pipeline stage: stage1_input | stage2_collect | stage3_analyze | stage4_predict | stage5_recommend | stage6_tools */
  stage?: string | null;
  /** Where this skill is invoked: workbench | pipeline | cta */
  entry_source?: string;
  entry_source_label?: string;
  intent?: string;
  prompt_template_id?: string;
  is_active?: number;
  is_premium?: number;
  cost?: number;
  sort_order?: number;
}

export interface SkillStats {
  skillId: string;
  windowDays: number;
  total: number;
  success: number;
  failed: number;
  successRate: number | null;
  avgTokens: number | null;
  avgDurationMs: number | null;
  dailyTrend: Array<{ day: string; count: number }>;
}

export interface PipelineStage {
  id: string;
  order: number;
  label: string;
  summary: string;
  skills: Array<{
    id: string;
    label: string;
    entrySource: string;
    promptTemplateId: string | null;
    isActive: boolean;
  }>;
}

export interface PipelineTopology {
  stages: PipelineStage[];
}

export interface PromptTemplate {
  id: string;
  version: number;
  label: string;
  intent: string;
  category: string;
  system_prompt_doubao: string;
  user_prompt_template: string;
  required_params?: string | string[] | null;
  optional_params?: string | string[] | null;
  output_format: string;
  output_schema?: string | Record<string, unknown> | null;
  preferred_model: string;
  max_tokens: number;
  base_cost: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SkillsResponse {
  skills: Skill[];
}

export async function getSkills(): Promise<SkillsResponse> {
  return request("/skills");
}

export async function updateSkill(
  id: string,
  data: Partial<Skill> & { is_active?: number; cost?: number }
): Promise<{ ok: boolean }> {
  return request(`/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getPromptTemplate(id: string): Promise<{ template: PromptTemplate }> {
  return request(`/prompt-templates/${id}`);
}

export async function updatePromptTemplate(
  id: string,
  data: { system_prompt_doubao?: string; user_prompt_template?: string; label?: string; max_tokens?: number }
): Promise<{ ok: boolean; newVersion?: number }> {
  return request(`/prompt-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getPromptTemplateVersions(id: string): Promise<{ versions: PromptTemplate[] }> {
  return request(`/prompt-templates/${id}/versions`);
}

// 模板列表（用于"新建技能"时下拉选已有模板）
export interface PromptTemplateSummary {
  id: string;
  version: number;
  label: string;
  intent: string;
  category: string;
  output_format: string;
  preferred_model: string;
  max_tokens: number;
  is_active: number;
}

export async function listPromptTemplates(): Promise<{ templates: PromptTemplateSummary[] }> {
  return request(`/prompt-templates`);
}

// 新建模板
export async function createPromptTemplate(payload: {
  id: string;
  label: string;
  intent?: string;
  category?: string;
  system_prompt_doubao: string;
  user_prompt_template?: string;
  required_params?: string[];
  optional_params?: string[];
  output_format?: string;
  preferred_model?: string;
  max_tokens?: number;
  base_cost?: number;
}): Promise<{ id: string }> {
  return request(`/prompt-templates`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 新建技能
export async function createSkill(payload: {
  id?: string;
  label: string;
  desc_text: string;
  icon?: string;
  category: string;
  prompt_template_id: string;
  intent?: string;
  entry_source?: string;
  result_card_type?: string;
  cost?: number;
  sort_order?: number;
  is_active?: boolean;
  is_premium?: boolean;
}): Promise<{ id: string }> {
  return request(`/skills`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 删除技能
export async function deleteSkill(id: string): Promise<{ ok: boolean }> {
  return request(`/skills/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getSkillStats(id: string): Promise<SkillStats> {
  return request(`/skills/${id}/stats`);
}

export async function getPipelineTopology(): Promise<PipelineTopology> {
  return request(`/pipeline/topology`);
}

// ── Traces / Bad Cases ─────────────────────────────────────────────────────────

export interface TraceListItem {
  sessionId: string;
  userId: string | null;
  startedAt: string;
  endedAt: string;
  skillCount: number;
  totalTokens: number;
  totalDurationMs: number;
  failedCount: number;
  successCount: number;
  firstInput: string;
  skillIds: string[];
  feedbackRating: "good" | "bad" | null;
}

export interface TraceStep {
  id: number;
  skillId: string;
  skillLabel: string;
  stage: string | null;
  promptTemplateId: string | null;
  modelUsed: string;
  status: string;
  tokensUsed: number | null;
  creditsCharged: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  artifactId: string | null;
  createdAt: string;
}

export interface TraceFeedbackEntry {
  id: number;
  source: string;
  reporterId: string | null;
  rating: "good" | "bad";
  note: string | null;
  promptTemplateId: string | null;
  createdAt: string;
}

export interface TraceDetail {
  sessionId: string;
  steps: TraceStep[];
  feedback: TraceFeedbackEntry[];
}

export interface BadCaseItem {
  id: number;
  sessionId: string | null;
  artifactId: string | null;
  skillId: string | null;
  skillLabel: string | null;
  userId: string | null;
  modelUsed: string | null;
  reporterId: string | null;
  note: string | null;
  promptTemplateId: string | null;
  createdAt: string;
}

export async function listTraces(params: {
  days?: number;
  limit?: number;
  userId?: string;
  onlyBad?: boolean;
} = {}): Promise<{ traces: TraceListItem[]; days: number; limit: number }> {
  const q = new URLSearchParams();
  if (params.days)   q.set("days", String(params.days));
  if (params.limit)  q.set("limit", String(params.limit));
  if (params.userId) q.set("user_id", params.userId);
  if (params.onlyBad) q.set("only_bad", "1");
  const qs = q.toString();
  return request(`/traces${qs ? `?${qs}` : ""}`);
}

export async function getTraceDetail(sessionId: string): Promise<TraceDetail> {
  return request(`/traces/${encodeURIComponent(sessionId)}`);
}

export async function postTraceFeedback(payload: {
  session_id?: string;
  artifact_id?: string;
  rating: "good" | "bad";
  note?: string;
  prompt_template_id?: string;
}): Promise<{ ok: boolean }> {
  return request(`/traces/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBadCases(params: { promptTemplateId?: string; limit?: number } = {}): Promise<{ badCases: BadCaseItem[] }> {
  const q = new URLSearchParams();
  if (params.promptTemplateId) q.set("prompt_template_id", params.promptTemplateId);
  if (params.limit)            q.set("limit", String(params.limit));
  const qs = q.toString();
  return request(`/bad-cases${qs ? `?${qs}` : ""}`);
}

// ── Dashboard breakdowns ──────────────────────────────────────────────────────

export interface SkillBreakdownRow {
  skillId: string;
  label: string;
  stage: string;
  entrySource: string;
  callCount: number;
  successCount: number;
  failedCount: number;
  successRate: number | null;
  avgTokens: number | null;
  avgDurationMs: number | null;
  totalTokens: number;
}

export interface ModelCostRow {
  modelId: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalCredits: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export async function getSkillBreakdown(days = 7): Promise<{ days: number; breakdown: SkillBreakdownRow[] }> {
  return request(`/dashboard/skill-breakdown?days=${days}`);
}

export async function getModelCost(days = 7): Promise<{ days: number; models: ModelCostRow[] }> {
  return request(`/dashboard/model-cost?days=${days}`);
}

export async function getDashboardFunnel(): Promise<{ funnel: FunnelStage[] }> {
  return request(`/dashboard/funnel`);
}

// ── User detail（深度聚合）────────────────────────────────────────────────────

export interface UserDetailProfile {
  id: string;
  phone: string;
  nickname: string;
  membershipPlan: string;
  credits: number;
  totalSpent: number;
  totalEarned: number;
  totalPredictions: number;
  status: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface UserActivityEntry {
  type: string;
  date: string;
  ip: string | null;
  at: string;
}

export interface UserRecentTrace {
  sessionId: string;
  startedAt: string;
  skillCount: number;
  totalTokens: number;
  totalDurationMs: number;
  failedCount: number;
  firstInput: string;
}

export interface UserConsumption {
  callCount: number;
  totalCharged: number;
  totalTokens: number;
}

export interface UserRevenueEntry {
  type: string;
  amount: number;
  description: string | null;
  paymentMethod: string | null;
  revenueDate: string;
  createdAt: string;
}

export interface UserDetail {
  profile: UserDetailProfile;
  activity: UserActivityEntry[];
  recentTraces: UserRecentTrace[];
  consumption: UserConsumption;
  revenue: UserRevenueEntry[];
}

export async function getUserDetail(id: string): Promise<UserDetail> {
  return request(`/users/${encodeURIComponent(id)}/detail`);
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export interface AdminLog {
  id: string;
  timestamp: string;
  adminPhone: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
}

export interface LogsResponse {
  logs: AdminLog[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLogs(params: { page?: number; pageSize?: number }): Promise<LogsResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  return request(`/logs?${q}`);
}
