import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { data: user, isLoading: loading, error: queryError, refetch } = trpc.auth.me.useQuery(
    undefined,
    {
      retry: false,
      staleTime: 60_000,
    }
  );

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = getLoginUrl();
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const state = useMemo(() => {
    return {
      user: user ?? null,
      loading,
      error: queryError,
      isAuthenticated: Boolean(user),
    };
  }, [user, loading, queryError]);

  return {
    ...state,
    refresh: refetch,
    logout,
  };
}
