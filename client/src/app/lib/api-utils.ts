export const API_BACKEND_UNAVAILABLE_MESSAGE =
  "当前环境未接通真实数据后端，需要把同源 /api 反向代理到 Node 服务。";

/**
 * 统一的 API fetch 封装，自动携带 credentials: 'include' 以传递 session cookie。
 * 所有调用后端 /api/* 的请求都应使用此函数，而非裸 fetch。
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.headers),
    },
  });
}

export function normalizeApiError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (/Failed to fetch/i.test(error.message)) {
      return API_BACKEND_UNAVAILABLE_MESSAGE;
    }
    if (/Unexpected token/i.test(error.message) || /JSON/i.test(error.message)) {
      return API_BACKEND_UNAVAILABLE_MESSAGE;
    }
    return error.message;
  }
  return fallback;
}

/**
 * 从后端 tRPC 获取最新积分余额和会员状态。
 * 用于在 app-store-provider 中同步后端真实积分到本地 state。
 */
export async function fetchServerBalance(): Promise<{
  credits: number;
  membershipPlan: string;
} | null> {
  try {
    const input = encodeURIComponent(
      JSON.stringify({ "0": { json: null, meta: { values: ["undefined"] } } }),
    );
    const resp = await fetch(
      `/api/trpc/credits.getBalance?batch=1&input=${input}`,
      { credentials: "include" },
    );
    if (!resp.ok) return null;
    const body = await resp.json();
    // tRPC batch response: [{result:{data:{json:{credits,membershipPlan}}}}]
    const data = body?.[0]?.result?.data?.json;
    if (data && typeof data.credits === "number") {
      return { credits: data.credits, membershipPlan: data.membershipPlan ?? "free" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let payload: (T & { error?: string }) | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as T & { error?: string }) : ({} as T & { error?: string });
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : raw.trim() || `Request failed with HTTP ${response.status}`;
    if (response.status === 404 && /not found/i.test(message)) {
      throw new Error(API_BACKEND_UNAVAILABLE_MESSAGE);
    }
    throw new Error(message);
  }

  if (!payload) {
    throw new Error(API_BACKEND_UNAVAILABLE_MESSAGE);
  }

  return payload;
}
