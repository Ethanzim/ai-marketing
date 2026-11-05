import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../lib/supabase";
import { Button, Card, ErrorBox, Field, Input, PageHeader } from "../components/ui";

export default function Account() {
  const [params] = useSearchParams();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setError(error.message);
    else {
      setMsg("Password saved.");
      setPw("");
    }
  }

  return (
    <>
      <PageHeader title="Account" subtitle={params.get("welcome") ? "Welcome! Set a password so you can sign in next time." : undefined} />
      <Card title="Set password" className="max-w-md">
        <form onSubmit={submit} className="space-y-3">
          <Field label="New password" hint="At least 8 characters.">
            <Input type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <ErrorBox error={error} />
          {msg && <p className="text-sm text-good-text">{msg}</p>}
          <Button variant="primary">Save password</Button>
        </form>
      </Card>
      <Button variant="ghost" className="mt-4 md:hidden" onClick={() => supabase.auth.signOut()}>
        Sign out
      </Button>
    </>
  );
}
