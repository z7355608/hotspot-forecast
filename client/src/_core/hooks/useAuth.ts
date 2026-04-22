import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo } from "react";

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

  // Redirect to login page when auth check completes and user is not authenticated
  useEffect(() => {
    if (options?.redirectOnUnauthenticated && !loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [options?.redirectOnUnauthenticated, loading, user]);

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
