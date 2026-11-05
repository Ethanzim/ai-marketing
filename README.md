# AI Marketing Ops Hub

Internal hub for the AI speed-to-lead agency:

- **Tech stack**: setup and readiness of every tool (seeded from `AI Speed-to-Lead & Smart Website Tech Stack Checklist - Sheet.csv`).
- **Pipeline**: read-only mirror of the GoHighLevel **Agency Sales** pipeline. GHL stays the CRM.
- **Client details**: data GHL doesn't hold: niche, tier, retainer, Vapi wiring, onboarding checklist, AI call results.
- **Automations**: replaces Make.com with three Supabase Edge Functions, each logged and replayable.

```
GHL Agency Sales ──webhook / 15-min cron──▶ ghl-sync ──▶ Supabase ◀── React hub (GitHub Pages)
Client GHL form (30s wait) ──webhook──▶ lead-intake ──▶ Vapi call
Vapi end-of-call-report ──▶ vapi-callback ──▶ note + tag on client's GHL contact
```

## Layout

| Path | What |
|---|---|
| `web/` | Vite + React + TypeScript + Tailwind app |
| `supabase/migrations/` | schema, RLS, triggers, tool seed, cron jobs |
| `supabase/functions/` | `ghl-sync`, `lead-intake`, `vapi-callback` (+ `_shared/`) |
| `.github/workflows/deploy.yml` | builds `web/` and publishes to GitHub Pages on push to `main` |

## Local development

```bash
cd web
nvm use            # Node 22.12+ (Vite 8 requirement)
npm install
npm run dev        # http://localhost:5173/ai-marketing/
```

`web/.env` holds the Supabase URL and **publishable** key. Both are public by design, because RLS protects the data. Never put the secret/service-role key in the frontend.

## Backend changes

```bash
supabase db push --remote                           # apply new migrations
supabase functions deploy <name> --use-api          # redeploy a function
```

Edge Function secrets (Supabase dashboard → Edge Functions → Secrets):
`GHL_AGENCY_TOKEN`, `GHL_AGENCY_LOCATION_ID`, `VAPI_API_KEY` (optional: `GHL_PIPELINE_ID`, `GHL_PIPELINE_NAME`).

The webhook token is generated inside Supabase Vault. The full webhook URLs are on the hub's **Setup** page, visible to logged-in team members only.

## Team access

Invite-only. Add people in Supabase → Authentication → Users → *Add user* (email and password, auto-confirm), or *Invite* (they set a password on first visit).
