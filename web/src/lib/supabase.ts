import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export const supabase = createClient(SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const functionUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

/** Call an edge function as the logged-in user (Sync now / Re-run). */
export async function invoke<T = unknown>(name: string, body: unknown, query = ""): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`${name}${query}`, { body: body as object });
  if (error) {
    // surface the function's JSON error message when there is one
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}
