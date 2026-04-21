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
  intent?: string;
  prompt_template_id?: string;
  is_active?: number;
  is_premium?: number;
  cost?: number;
  sort_order?: number;
}

export interface PromptTemplate {
  id: string;
  version: number;
  label: string;
  intent: string;
  category: string;
  system_prompt_doubao: string;
  user_prompt_template: string;
  output_format: string;
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
