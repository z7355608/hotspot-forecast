/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export * from "./_core/errors";

// Placeholder types for static deployment (drizzle schema not available)
export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};
