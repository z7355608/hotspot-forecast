import { getLoginUrl } from "@/const";
import { useCallback, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

// Mock user data for static deployment / preview environment
const MOCK_USER = {
  id: "preview-user",
  name: "预览用户",
  username: "预览用户",
  email: "preview@example.com",
  credits: 1000,
  tier: "pro" as const,
  avatar: null,
};

export function useAuth(options?: UseAuthOptions) {
  // Always use mock authentication in static deployment
  const [mockUser] = useState(MOCK_USER);

  const logout = useCallback(async () => {
    console.log("Logout called in preview mode");
  }, []);

  const state = useMemo(() => {
    return {
      user: mockUser,
      loading: false,
      error: null,
      isAuthenticated: Boolean(mockUser),
    };
  }, [mockUser]);

  // No redirect in Figma Make environment
  return {
    ...state,
    refresh: () => Promise.resolve({ data: mockUser }),
    logout,
  };
}
