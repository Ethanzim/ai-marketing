import { useState, type ReactNode } from "react";
import { useRuns, useWebhookToken } from "../lib/queries";
import { functionUrl } from "../lib/supabase";
import { ago } from "../lib/format";
import { Button, Card, ErrorBox, PageHeader, StatusPill } from "../components/ui";

const PROJECT = "tcqakaugfrznypoudflt";
const STAGES = [
  "Scraped Lead", "Cold Emailed", "Demo Visited", "Mystery Shopper Audit", "Discovery Call",
  "Proposal Sent", "Setup Fee Paid", "Onboarding", "Live", "Active Retainer",
];

export default function Setup() {
  const token = useWebhookToken();
  const syncRuns = useRuns({ limit: 300 });
  const lastSync = syncRuns.data?.find((r) => r.function_name === "ghl-sync");
  const url = (fn: string) => (token.data ? `${functionUrl(fn)}?token=${token.data}` : "…");

  return (
    <>
      <PageHeader
        title="Setup"
        subtitle="Wire GoHighLevel and Vapi to the hub. The webhook URLs below contain a secret token: only paste them into GHL / Vapi."
      />
      <ErrorBox error={token.error} />
      <div className="space-y-4">
        <Step n={1} title="Agency Sales pipeline in GoHighLevel" status={lastSync?.status === "success" ? "done" : undefined}>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>In your <strong>Agency HQ</strong> sub-account go to <em>Opportunities → Pipelines → Create pipeline</em>, name it <Code>Agency Sales</Code>.</li>
            <li>
              Add these stages in order:
              <div className="mt-1 flex flex-wrap gap-1">{STAGES.map((s, i) => <Code key={s}>{i + 1}. {s}</Code>)}</div>
              Lost / churned deals use GHL's built-in <em>Lost</em> status, not a stage.
            </li>
            <li>
              <em>Settings → Private Integrations → Create</em>, scopes <Code>opportunities.readonly</Code> <Code>contacts.readonly</Code>. Copy the token.
            </li>
            <li>
              In the{" "}
              <a className="text-accent underline" href={`https://supabase.com/dashboard/project/${PROJECT}/functions/secrets`} target="_blank" rel="noreferrer">
                Supabase Edge Function secrets
              </a>{" "}
              add <Code>GHL_AGENCY_TOKEN</Code> (that token) and <Code>GHL_AGENCY_LOCATION_ID</Code> (Settings → Business Profile).
            </li>
            <li>Come back to the Dashboard and hit <strong>Sync now</strong>.</li>
          </ol>
          {lastSync && (
            <p className="mt-3 text-xs text-ink-3">
              Last ghl-sync run {ago(lastSync.created_at)}: {lastSync.status === "success" ? "OK" : lastSync.error}
            </p>
          )}
        </Step>

        <Step n={2} title="Real-time pipeline updates (GHL workflow → ghl-sync)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Agency HQ → <em>Automation → Create workflow</em>. Triggers: <Code>Opportunity Created</Code> and <Code>Pipeline Stage Changed</Code> (filter: pipeline = Agency Sales). Also add <Code>Opportunity Status Changed</Code>.</li>
            <li>Action: <em>Webhook</em>, method POST, URL:</li>
          </ol>
          <Copy value={url("ghl-sync")} secret />
          <p className="mt-2">Custom Data: <Code>opportunity_id</Code> = <Code>{"{{opportunity.id}}"}</Code>, <Code>contact_id</Code> = <Code>{"{{contact.id}}"}</Code>. A full sync also runs every 15 minutes as a backstop.</p>
        </Step>

        <Step n={3} title="Vapi API key">
          <p>
            Vapi → <em>Org Settings → API Keys</em>, copy the <strong>Private</strong> key and add it to the{" "}
            <a className="text-accent underline" href={`https://supabase.com/dashboard/project/${PROJECT}/functions/secrets`} target="_blank" rel="noreferrer">
              Edge Function secrets
            </a>{" "}
            as <Code>VAPI_API_KEY</Code>.
          </p>
        </Step>

        <Step n={4} title="Per client: form → AI call (replaces Make.com Scenario 1)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>On the client's page in this hub, fill in their GHL location ID, Vapi assistant ID and Vapi phone number ID.</li>
            <li>In the client's GHL sub-account workflow (Form Submitted → Wait 30 seconds), add a <em>Webhook</em> action, POST to:</li>
          </ol>
          <Copy value={url("lead-intake")} secret />
          <p className="mt-2">
            Custom Data: <Code>location_id</Code> = <Code>{"{{location.id}}"}</Code>, <Code>contact_id</Code> = <Code>{"{{contact.id}}"}</Code>,{" "}
            <Code>first_name</Code> = <Code>{"{{contact.first_name}}"}</Code>, <Code>phone</Code> = <Code>{"{{contact.phone}}"}</Code>,{" "}
            <Code>service_needed</Code> = your form's service field.
          </p>
        </Step>

        <Step n={5} title="Per client: call results → GHL (replaces Make.com Scenario 2)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>In Vapi, open the client's assistant → <em>Advanced → Server URL</em> and paste:</li>
          </ol>
          <Copy value={url("vapi-callback")} secret />
          <ol start={2} className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Make sure the assistant's Structured Data outputs <Code>qualified</Code>, <Code>preferred_time</Code>, <Code>job_details</Code>.</li>
            <li>In the client's GHL sub-account create a Private Integration token (scopes <Code>contacts.write</Code> <Code>contacts.readonly</Code>) and save it on the client's page in this hub.</li>
            <li>Test: submit the client's form with your Google Voice number. You should get a call in ~30 seconds and a note on the GHL contact afterwards.</li>
          </ol>
        </Step>
      </div>
    </>
  );
}

function Step({ n, title, status, children }: { n: number; title: string; status?: "done"; children: ReactNode }) {
  return (
    <Card
      title={<span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-xs">{n}</span>{title}</span>}
      actions={status === "done" ? <StatusPill kind="good">Working</StatusPill> : null}
    >
      <div className="text-sm leading-relaxed text-ink-2">{children}</div>
    </Card>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{children}</code>
);

function Copy({ value, secret }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const display = shown ? value : value.replace(/token=.*/, "token=••••••••••••");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink">{display}</code>
      {secret && <Button variant="ghost" onClick={() => setShown(!shown)}>{shown ? "Hide" : "Show"}</Button>}
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </Button>
    </div>
  );
}
