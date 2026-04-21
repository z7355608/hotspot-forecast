import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { router } from "./routes";
import { AppStoreProvider } from "./store/app-store";
import { ThemeProvider } from "@/contexts/ThemeContext";

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Don't retry in Figma Make environment
            retry: import.meta.env.VITE_OAUTH_PORTAL_URL ? 1 : false,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          // Fail silently in Figma Make environment
          fetch: (url, options) => {
            if (!import.meta.env.VITE_OAUTH_PORTAL_URL) {
              return Promise.reject(new Error("Mock environment - no backend"));
            }
            return fetch(url, options);
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" switchable>
          <AppStoreProvider>
            <Toaster position="top-center" richColors closeButton />
            <RouterProvider router={router} />
          </AppStoreProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
