// Shared request wrapper for every edge function:
//  - CORS (the hub calls "Sync now" / "Re-run" from the browser)
//  - auth: Vault webhook token (GHL, Vapi, cron) OR a logged-in team member's JWT
//  - replay of a previous run (`{ "rerun_of": <automation_runs.id> }`)
//  - timing + logging to automation_runs
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Trigger = "webhook" | "cron" | "manual" | "rerun";

export interface Ctx {
  trigger: Trigger;
  query: Record<string, string>;
  body: any;
  /** attach the run to a customer for the log */
  setCustomer(id: string | null | undefined): void;
}

export interface Result {
  status?: number;
  body: unknown;
  /** false = don't write an automation_runs row (e.g. ignored Vapi events) */
  log?: boolean;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function authorize(req: Request, url: URL): Promise<"token" | "user" | null> {
  const token = url.searchParams.get("token") ??
    req.headers.get("x-webhook-token") ??
    req.headers.get("x-vapi-secret");
  if (token) {
    const { data } = await admin.rpc("check_webhook_token", { p_token: token });
    return data === true ? "token" : null;
  }
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (!error && data.user) return "user";
  }
  return null;
}

export function serveLogged(functionName: string, handler: (ctx: Ctx) => Promise<Result>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json(405, { error: "POST only" });

    const url = new URL(req.url);
    const via = await authorize(req, url);
    if (!via) return json(401, { error: "unauthorized" });

    let body: any = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json(400, { error: "invalid JSON body" });
    }

    const query = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "token"));
    let trigger: Trigger = via === "user" ? "manual" : body?.source === "cron" ? "cron" : "webhook";
    let rerunOf: number | null = null;

    if (via === "user" && body?.rerun_of) {
      const { data: prev, error } = await admin
        .from("automation_runs")
        .select("id, function_name, request")
        .eq("id", body.rerun_of)
        .single();
      if (error || !prev || prev.function_name !== functionName) {
        return json(404, { error: `run ${body.rerun_of} not found for ${functionName}` });
      }
      rerunOf = prev.id;
      trigger = "rerun";
      body = prev.request?.body ?? {};
      Object.assign(query, prev.request?.query ?? {});
    }

    let customerId: string | null = null;
    const ctx: Ctx = { trigger, query, body, setCustomer: (id) => (customerId = id ?? null) };
    const started = Date.now();
    let result: Result;
    let errorMsg: string | null = null;

    try {
      result = await handler(ctx);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      result = { status: 500, body: { error: errorMsg } };
    }

    const status = result.status ?? 200;
    if (result.log !== false) {
      const { error: logErr } = await admin.from("automation_runs").insert({
        function_name: functionName,
        trigger,
        customer_id: customerId,
        status: status < 400 ? "success" : "error",
        request: { query, body },
        response: result.body,
        error: errorMsg ?? (status >= 400 ? JSON.stringify(result.body).slice(0, 2000) : null),
        duration_ms: Date.now() - started,
        rerun_of: rerunOf,
      });
      if (logErr) console.error("failed to log run", logErr);
    }
    return json(status, result.body);
  });
}
