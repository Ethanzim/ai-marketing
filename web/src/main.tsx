import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router";
import { supabase } from "./lib/supabase";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

async function boot() {
  // Invite / password-reset emails land with tokens in the URL hash, which collides with
  // HashRouter. Let supabase-js consume them first, then rewrite the hash to a real route.
  const hash = window.location.hash;
  if (/access_token=|error_description=/.test(hash)) {
    await supabase.auth.getSession();
    const setPassword = /type=(invite|recovery|signup)/.test(hash);
    window.history.replaceState(null, "", window.location.pathname + (setPassword ? "#/account?welcome=1" : "#/"));
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

boot();
