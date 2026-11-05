-- Scheduled jobs: full GHL pipeline pull every 15 min (backstop for missed webhooks)
-- and 90-day retention on automation_runs.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ghl-sync-full',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://tcqakaugfrznypoudflt.supabase.co/functions/v1/ghl-sync?mode=full',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-token', (select decrypted_secret from vault.decrypted_secrets where name = 'webhook_token')
    ),
    body    := '{"source":"cron"}'::jsonb
  );
  $$
);

select cron.schedule(
  'prune-automation-runs',
  '0 4 * * *',
  $$ delete from public.automation_runs where created_at < now() - interval '90 days' $$
);
