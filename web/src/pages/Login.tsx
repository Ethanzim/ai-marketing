import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  async function reset() {
    if (!email) return setError("Enter your email first.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) setError(error.message);
    else setNotice("Check your email for a reset link.");
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">⚡</div>
          <div>
            <div className="font-semibold">Ops Hub</div>
            <div className="text-xs text-ink-3">Team sign-in</div>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorBox error={error} />
          {notice && <p className="text-sm text-good-text">{notice}</p>}
          <Button variant="primary" className="w-full py-2" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <button type="button" onClick={reset} className="w-full text-center text-xs text-ink-3 hover:text-ink">
            Forgot password?
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-ink-3">Invite-only. Ask an admin to add you in Supabase.</p>
      </form>
    </div>
  );
}
