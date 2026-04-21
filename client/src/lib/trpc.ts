import { createTRPCReact } from "@trpc/react-query";

// Mock AppRouter type for Figma Make environment
// In production, this would be imported from the server
type AppRouter = any;

export const trpc = createTRPCReact<AppRouter>();
