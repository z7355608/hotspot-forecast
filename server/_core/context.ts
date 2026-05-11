import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** 当前会话的 user_sessions.id，老 token 没带就是 null */
  sessionId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sessionId: number | null = null;

  try {
    const auth = await sdk.authenticateRequestWithSession(opts.req);
    user = auth.user;
    sessionId = auth.sessionId ?? null;
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
    sessionId = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionId,
  };
}
