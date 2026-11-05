-- AI Marketing Ops Hub: core schema
-- GHL is the CRM. The `customers` table mirrors the GHL "Agency Sales" pipeline.
-- Columns marked GHL-owned are written only by the ghl-sync edge function (service role).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- tools (tech stack checklist, seeded from the CSV)
-- ---------------------------------------------------------------------------
create table public.tools (
  id bigint generated always as identity primary key,
  sort_order int not null default 0,
  category text not null check (category in ('Core', 'Outbound & Lead Gen', 'Support & Billing')),
  name text not null unique,
  setup_step text,
  role text,
  base_cost text,
  usage_cost text,
  monthly_base_usd numeric(10,2) not null default 0,
  integrates_with text,
  required_keys text,           -- names of keys/IDs only, never the values
  notes text,
  url text,
  is_ready boolean not null default false,
  ready_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.tools_ready_at() returns trigger
language plpgsql as $$
begin
  if new.is_ready and (tg_op = 'INSERT' or not old.is_ready) then
    new.ready_at = now();
  elsif not new.is_ready then
    new.ready_at = null;
  end if;
  return new;
end $$;

create trigger tools_updated_at before update on public.tools
  for each row execute function public.set_updated_at();
create trigger tools_ready_at before insert or update of is_ready on public.tools
  for each row execute function public.tools_ready_at();

-- ---------------------------------------------------------------------------
-- pipeline_stages (synced from GHL)
-- ---------------------------------------------------------------------------
create table public.pipeline_stages (
  ghl_stage_id text primary key,
  ghl_pipeline_id text not null,
  name text not null,
  position int not null,
  synced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- customers (one row per GHL opportunity)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),

  -- GHL-owned (written only by ghl-sync)
  ghl_opportunity_id text not null unique,
  ghl_contact_id text,
  name text not null,
  contact_name text,
  company_name text,
  phone text,
  email text,
  stage_id text references public.pipeline_stages (ghl_stage_id) on delete set null,
  status text,                         -- open | won | lost | abandoned
  monetary_value numeric(12,2),
  ghl_created_at timestamptz,
  ghl_updated_at timestamptz,
  stage_changed_at timestamptz,
  synced_at timestamptz,

  -- hub-owned (edited in the hub, never touched by sync)
  niche text,
  lead_bucket text check (lead_bucket in ('A', 'B')),
  tier text,
  setup_fee numeric(12,2),
  monthly_retainer numeric(12,2),
  client_location_id text unique,      -- the client's own GHL sub-account
  vapi_assistant_id text,
  vapi_phone_number_id text,
  owner text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_stage_idx on public.customers (stage_id);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stage_history (filled by trigger)
-- ---------------------------------------------------------------------------
create table public.stage_history (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  from_stage_id text,
  from_stage_name text,
  to_stage_id text,
  to_stage_name text,
  from_status text,
  to_status text,
  changed_at timestamptz not null default now()
);
create index stage_history_customer_idx on public.stage_history (customer_id, changed_at desc);

create or replace function public.log_stage_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stage_history (customer_id, to_stage_id, to_stage_name, to_status, changed_at)
    values (new.id, new.stage_id,
            (select name from public.pipeline_stages where ghl_stage_id = new.stage_id),
            new.status,
            coalesce(new.stage_changed_at, new.ghl_created_at, now()));
  elsif new.stage_id is distinct from old.stage_id or new.status is distinct from old.status then
    insert into public.stage_history
      (customer_id, from_stage_id, from_stage_name, to_stage_id, to_stage_name, from_status, to_status, changed_at)
    values (new.id,
            old.stage_id, (select name from public.pipeline_stages where ghl_stage_id = old.stage_id),
            new.stage_id, (select name from public.pipeline_stages where ghl_stage_id = new.stage_id),
            old.status, new.status,
            case when new.stage_id is distinct from old.stage_id
                 then coalesce(new.stage_changed_at, now()) else now() end);
  end if;
  return new;
end $$;

create trigger customers_stage_history after insert or update of stage_id, status on public.customers
  for each row execute function public.log_stage_change();

-- ---------------------------------------------------------------------------
-- onboarding_tasks
-- ---------------------------------------------------------------------------
create table public.onboarding_tasks (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  position int not null default 0,
  title text not null,
  done boolean not null default false,
  done_at timestamptz,
  unique (customer_id, title)
);

create or replace function public.onboarding_done_at() returns trigger
language plpgsql as $$
begin
  new.done_at = case when new.done then coalesce(new.done_at, now()) else null end;
  return new;
end $$;
create trigger onboarding_done_at before insert or update of done on public.onboarding_tasks
  for each row execute function public.onboarding_done_at();

create or replace function public.create_onboarding_checklist(p_customer_id uuid) returns void
language sql as $$
  insert into public.onboarding_tasks (customer_id, position, title)
  select p_customer_id, t.pos, t.title
  from (values
    (1,  'Load Master Snapshot into client GHL sub-account'),
    (2,  'Connect client domain & publish website'),
    (3,  'Buy Vapi local phone number'),
    (4,  'Create & configure Vapi assistant for client'),
    (5,  'Add client IDs in hub (GHL location, Vapi assistant, Vapi phone number)'),
    (6,  'Save client GHL Private Integration token in hub'),
    (7,  'Point client GHL form workflow webhook to lead-intake'),
    (8,  'Set Vapi assistant Server URL to vapi-callback'),
    (9,  'Run live test call from Google Voice number'),
    (10, 'Start Stripe recurring subscription')
  ) as t (pos, title)
  on conflict (customer_id, title) do nothing;
$$;

create or replace function public.seed_onboarding_on_stage() returns trigger
language plpgsql as $$
begin
  if new.stage_id is not null
     and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id)
     and exists (select 1 from public.pipeline_stages
                 where ghl_stage_id = new.stage_id and name ilike '%onboarding%') then
    perform public.create_onboarding_checklist(new.id);
  end if;
  return new;
end $$;
create trigger customers_onboarding_ins after insert on public.customers
  for each row execute function public.seed_onboarding_on_stage();
create trigger customers_onboarding_upd after update of stage_id on public.customers
  for each row execute function public.seed_onboarding_on_stage();

-- ---------------------------------------------------------------------------
-- customer_secrets (per-client GHL token; never readable by the frontend)
-- ---------------------------------------------------------------------------
create table public.customer_secrets (
  customer_id uuid primary key references public.customers (id) on delete cascade,
  ghl_location_token text not null,
  updated_at timestamptz not null default now()
);

-- write-only setter for the hub
create or replace function public.set_client_ghl_token(p_customer_id uuid, p_token text) returns void
language sql security definer set search_path = public as $$
  insert into public.customer_secrets (customer_id, ghl_location_token, updated_at)
  values (p_customer_id, p_token, now())
  on conflict (customer_id) do update
    set ghl_location_token = excluded.ghl_location_token, updated_at = now();
$$;

create or replace function public.client_token_status()
returns table (customer_id uuid, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select customer_id, updated_at from public.customer_secrets;
$$;

-- ---------------------------------------------------------------------------
-- calls (one row per Vapi call placed by lead-intake)
-- ---------------------------------------------------------------------------
create table public.calls (
  vapi_call_id text primary key,
  customer_id uuid references public.customers (id) on delete set null,
  ghl_contact_id text,
  lead_name text,
  lead_phone text,
  service_needed text,
  status text not null default 'queued',  -- queued | ended
  qualified boolean,
  preferred_time text,
  job_details text,
  summary text,
  recording_url text,
  ended_reason text,
  duration_seconds numeric,
  cost_usd numeric(10,4),
  ghl_note_written boolean not null default false,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index calls_customer_idx on public.calls (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- automation_runs (log of every edge function run)
-- ---------------------------------------------------------------------------
create table public.automation_runs (
  id bigint generated always as identity primary key,
  function_name text not null,
  trigger text not null,               -- webhook | cron | manual | rerun
  customer_id uuid references public.customers (id) on delete set null,
  status text not null check (status in ('success', 'error')),
  request jsonb,
  response jsonb,
  error text,
  duration_ms int,
  rerun_of bigint references public.automation_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index automation_runs_created_idx on public.automation_runs (created_at desc);
create index automation_runs_customer_idx on public.automation_runs (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- webhook token (lives only in Vault, generated here, never in the repo)
-- ---------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(24), 'hex'),
  'webhook_token',
  'Shared token appended to GHL / Vapi webhook URLs'
);

create or replace function public.check_webhook_token(p_token text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'webhook_token' and decrypted_secret = p_token
  );
$$;

-- lets logged-in team members see the URLs to paste into GHL / Vapi
create or replace function public.get_webhook_token() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'webhook_token';
$$;

-- ---------------------------------------------------------------------------
-- privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.tools            enable row level security;
alter table public.pipeline_stages  enable row level security;
alter table public.customers        enable row level security;
alter table public.stage_history    enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.customer_secrets enable row level security;
alter table public.calls            enable row level security;
alter table public.automation_runs  enable row level security;

revoke all on public.tools, public.pipeline_stages, public.customers, public.stage_history,
              public.onboarding_tasks, public.customer_secrets, public.calls, public.automation_runs
  from anon, authenticated;

-- tools: team can fully manage
grant select, insert, update, delete on public.tools to authenticated;
create policy tools_team on public.tools for all to authenticated using (true) with check (true);

-- read-only mirrors / logs
grant select on public.pipeline_stages, public.stage_history, public.calls, public.automation_runs to authenticated;
create policy stages_read  on public.pipeline_stages for select to authenticated using (true);
create policy history_read on public.stage_history   for select to authenticated using (true);
create policy calls_read   on public.calls           for select to authenticated using (true);
create policy runs_read    on public.automation_runs for select to authenticated using (true);

-- customers: read all, update hub-owned columns only
grant select on public.customers to authenticated;
grant update (niche, lead_bucket, tier, setup_fee, monthly_retainer, client_location_id,
              vapi_assistant_id, vapi_phone_number_id, owner, notes)
  on public.customers to authenticated;
create policy customers_read   on public.customers for select to authenticated using (true);
create policy customers_update on public.customers for update to authenticated using (true) with check (true);

-- onboarding: team can manage
grant select, insert, update, delete on public.onboarding_tasks to authenticated;
create policy onboarding_team on public.onboarding_tasks for all to authenticated using (true) with check (true);

-- customer_secrets: no grants, no policies -> service role only

-- functions
revoke execute on function public.set_client_ghl_token(uuid, text)   from public, anon;
revoke execute on function public.client_token_status()              from public, anon;
revoke execute on function public.create_onboarding_checklist(uuid)  from public, anon;
revoke execute on function public.get_webhook_token()                from public, anon;
revoke execute on function public.check_webhook_token(text)          from public, anon, authenticated;
grant  execute on function public.set_client_ghl_token(uuid, text)   to authenticated;
grant  execute on function public.client_token_status()              to authenticated;
grant  execute on function public.create_onboarding_checklist(uuid)  to authenticated;
grant  execute on function public.get_webhook_token()                to authenticated;
grant  execute on function public.check_webhook_token(text)          to service_role;

-- ---------------------------------------------------------------------------
-- seed: tools from "AI Speed-to-Lead & Smart Website Tech Stack Checklist"
-- (Make.com replaced by Supabase Edge Functions)
-- ---------------------------------------------------------------------------
insert into public.tools
  (sort_order, category, name, setup_step, role, base_cost, usage_cost, monthly_base_usd,
   integrates_with, required_keys, notes, url)
values
(1, 'Core', 'GoHighLevel (GHL)', 'Step 0 & Steps 1-3 (Core)',
 'Core CRM, Smart Website Builder, Client Portal, Forms, Calendar & SMS',
 '$97/mo (14-day free trial)', '$1.15/mo per local phone number + ~$0.0079/SMS', 97,
 'Supabase Edge Functions (webhooks + LeadConnector API), Stripe, Google Business Profile',
 'Location ID (Settings -> Business Profile); Private Integration token per sub-account',
 'Create "Master Website + AI Template" Sub-Account first. Build the Universal Quote Form, Simple Calendar, Niche Website Template, Client Portal, and 30-second Wait + Webhook Workflow here, then save as a Master Snapshot. Also create the "Agency HQ" sub-account with the Agency Sales pipeline that this hub syncs.',
 'https://gohighlevel.com'),
(2, 'Core', 'OpenAI API Platform', 'Step 0 & Step 4 (Core)',
 'AI Conversation Brain (gpt-4o-mini / gpt-4o)',
 '$10.00 initial credit preload', '<$0.01 per phone call (pay-as-you-go)', 0,
 'Vapi.ai (via Provider Keys)', 'Secret API Key (sk-...)',
 'Separate from ChatGPT Plus subscription. Go to platform.openai.com -> Settings -> Billing -> add $10 credit. Then go to API Keys -> Create new secret key and paste it into Vapi.ai.',
 'https://platform.openai.com'),
(3, 'Core', 'Vapi.ai', 'Step 0 & Step 4 (Core)',
 '30-Second AI Voice Receptionist Platform',
 '$10.00 initial credit preload', '$2.00/mo per local phone number + ~$0.05-$0.09/min call time', 0,
 'OpenAI API, ElevenLabs (built-in), Supabase Edge Functions (call API + Server URL)',
 'Private API Key (Org Settings), Assistant ID, Phone Number ID',
 'Paste OpenAI key under Provider Keys. Buy a local phone number ($2/mo). Create "Sarah" Assistant with gpt-4o-mini (Temp 0.3), dynamic variables ({{first_name}}, {{company_name}}, {{service_needed}}), and Structured Data (qualified, preferred_time, job_details).',
 'https://vapi.ai'),
(4, 'Core', 'ElevenLabs (via Vapi)', 'Step 4 (Built into Vapi)',
 'Hyper-Realistic Human Voice Engine',
 '$0/mo standalone (bundled inside Vapi)', 'Included in Vapi per-minute call rate', 0,
 'Vapi.ai (Voice tab)', 'None (Native inside Vapi)',
 'Inside Vapi Assistant -> Voice tab, select "11labs" and pick "Sarah", "Matilda", or "Chris". Set Background Sound to "Office" at low volume so callers hear a realistic front-desk ambiance.',
 'https://vapi.ai'),
(5, 'Core', 'Supabase (Edge Functions + DB)', 'Step 0 & Step 5 (Core)',
 'Automation bridge (replaces Make.com) + database & team login for this hub',
 'Free tier (500k function calls/mo)', '$0/mo at current volume', 0,
 'GoHighLevel (webhooks + LeadConnector API), Vapi.ai (call API + Server URL), this hub',
 'Project URL + anon key (frontend); VAPI_API_KEY, GHL_AGENCY_TOKEN, GHL_AGENCY_LOCATION_ID (function secrets)',
 'lead-intake catches the GHL form webhook and POSTs to https://api.vapi.ai/call/phone. vapi-callback catches the Vapi end-of-call-report and writes the summary + recording to the client GHL contact. ghl-sync mirrors the Agency Sales pipeline into this hub. Webhook URLs are on the Setup page.',
 'https://supabase.com'),
(6, 'Outbound & Lead Gen', 'Outscraper (or Apify)', 'Section 6 (Lead Scraping)',
 'Google Maps Local Business Lead Scraper',
 'Free starter tier (Pay-as-you-go)', '~$3.00 per 1,000 scraped local business leads', 0,
 'CSV Export -> Google Sheets -> Instantly.ai / GoHighLevel', 'None (Web dashboard CSV export)',
 'Scrape South Florida high-ticket niches (Roofing, Custom Pools, Impact Windows, MedSpas, Estate Management). Filter CSV into Bucket A (Website column is BLANK + 10+ reviews) and Bucket B (Active Website + running ads).',
 'https://outscraper.com'),
(7, 'Outbound & Lead Gen', 'Instantly.ai', 'Section 7 (Automated Outbound)',
 'Automated B2B Cold Email Engine',
 '$37/mo (Growth Plan)', '$0/mo', 37,
 'Secondary Outreach Domains, GoHighLevel Dynamic Showcase URL (?company={{companyName}})', 'None',
 'Warm up 2-3 secondary domains for 14 days, load Bucket A and Bucket B CSV lists, and auto-send 100-150 emails/day driving business owners to your "Try and Stump It" live demo funnel page.',
 'https://instantly.ai'),
(8, 'Support & Billing', 'Porkbun or Namecheap', 'Section 7 & 9 (Domains)',
 'Domain Registrar (Demo Funnel & Cold Email Domains)',
 '~$10-$12/year per .com domain', 'Optional (~$12/yr if registering a domain for a Tier 1/Tier 3 Website client)', 3,
 'GoHighLevel (Settings -> Domains) & Instantly.ai (Email accounts)', 'DNS Login (Cloudflare / Registrar)',
 'Buy 1 domain for your GHL live demo showcase site (e.g., demo.yourdomain.com) and 2-3 lookalike domains for Instantly.ai cold email warmup (never send cold emails from your main primary domain).',
 'https://porkbun.com'),
(9, 'Support & Billing', 'Google Voice', 'Section 6 (Mystery Shopper)',
 'Secondary Phone Line for 4:45 PM "Mystery Shopper" Audits',
 'Free', '$0', 0,
 'Personal Cell Phone / Web Browser', 'Free Google Voice local phone number',
 'Use this secondary number to submit quote requests on 20 local contractors websites at 4:45 PM so you can prove on the next morning call that nobody called or texted back.',
 'https://voice.google.com'),
(10, 'Support & Billing', 'Stripe', 'Section 10 (Client Billing)',
 'Client Payment Processing & Auto-Recurring Retainers',
 '$0/mo', '2.9% + $0.30 per successful card charge (or 0.8% ACH cap $5)', 0,
 'GoHighLevel (Payments -> Integrations -> Stripe)', 'Stripe Account Login (1-click OAuth inside GHL)',
 'Connect inside GoHighLevel Payments tab to send 1-click payment links for $2,500-$7,500 setup fees and automatically bill $297/mo or $1,500/mo recurring subscriptions.',
 'https://stripe.com'),
(11, 'Support & Billing', 'Meta Ads Manager', 'Section 7 (Optional Paid Traffic)',
 'Local $15/Day B2B Direct-to-Demo Video Ad',
 'Optional ($10-$20/day ad spend once funnel is live)', '$0', 0,
 'GoHighLevel "Try and Stump It" B2B Landing Page & Meta Pixel', 'Meta Pixel ID (optional)',
 'Run a 30-second phone video showing a second phone on speakerphone getting called by the AI 15 seconds after submitting a quote form. Target a 25-mile radius in South Florida (Broward, Palm Beach, Miami-Dade).',
 'https://adsmanager.facebook.com');
