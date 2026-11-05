import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { cx } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import CustomerDetail from "./pages/CustomerDetail";
import Tools from "./pages/Tools";
import Automations from "./pages/Automations";
import Setup from "./pages/Setup";
import Account from "./pages/Account";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Shell email={session.user.email ?? ""} />}>
        <Route index element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="tools" element={<Tools />} />
        <Route path="automations" element={<Automations />} />
        <Route path="setup" element={<Setup />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/tools", label: "Tech stack" },
  { to: "/automations", label: "Automations" },
  { to: "/setup", label: "Setup" },
];

function Shell({ email }: { email: string }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    cx(
      "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
      isActive ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
    );

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">⚡</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Ops Hub</div>
            <div className="text-xs text-ink-3">Speed-to-lead agency</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={link}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line px-4 py-3 md:block">
          <NavLink to="/account" className="block truncate text-xs text-ink-2 hover:text-ink">
            {email}
          </NavLink>
          <button onClick={() => supabase.auth.signOut()} className="mt-1 text-xs text-ink-3 hover:text-ink">
            Sign out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
