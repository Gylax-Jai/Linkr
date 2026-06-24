import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Wraps the app with a React Query client (one instance per mount). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 4_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            refetchIntervalInBackground: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
