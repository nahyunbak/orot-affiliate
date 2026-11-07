"use client";
import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  listenForSessionChanges,
  registerAuthCacheClear,
} from "@/lib/web-auth-client";
import { usePreferencesStore } from "@/zustand/preferences";
import "@/i18n/client";
import { trackPageView } from "@/lib/analytics";
export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  useEffect(() => {
    const unregister = registerAuthCacheClear(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    void usePreferencesStore.persist.rehydrate();
    const stopListening = listenForSessionChanges();
    trackPageView();
    return () => {
      unregister();
      stopListening();
    };
  }, [queryClient]);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
