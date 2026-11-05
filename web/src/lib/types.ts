export interface Tool {
  id: number;
  sort_order: number;
  category: "Core" | "Outbound & Lead Gen" | "Support & Billing";
  name: string;
  setup_step: string | null;
  role: string | null;
  base_cost: string | null;
  usage_cost: string | null;
  monthly_base_usd: number;
  integrates_with: string | null;
  required_keys: string | null;
  notes: string | null;
  url: string | null;
  is_ready: boolean;
  ready_at: string | null;
}

export interface Stage {
  ghl_stage_id: string;
  ghl_pipeline_id: string;
  name: string;
  position: number;
}

export interface Customer {
  id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string | null;
  name: string;
  contact_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  stage_id: string | null;
  status: string | null;
  monetary_value: number | null;
  ghl_created_at: string | null;
  stage_changed_at: string | null;
  synced_at: string | null;
  niche: string | null;
  lead_bucket: "A" | "B" | null;
  tier: string | null;
  setup_fee: number | null;
  monthly_retainer: number | null;
  client_location_id: string | null;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
  owner: string | null;
  notes: string | null;
}

/** Fields the hub is allowed to edit (column grants enforce this server-side too). */
export const HUB_FIELDS = [
  "niche",
  "lead_bucket",
  "tier",
  "setup_fee",
  "monthly_retainer",
  "client_location_id",
  "vapi_assistant_id",
  "vapi_phone_number_id",
  "owner",
  "notes",
] as const;
export type HubField = (typeof HUB_FIELDS)[number];

export interface StageHistory {
  id: number;
  from_stage_name: string | null;
  to_stage_name: string | null;
  from_status: string | null;
  to_status: string | null;
  changed_at: string;
}

export interface OnboardingTask {
  id: number;
  customer_id: string;
  position: number;
  title: string;
  done: boolean;
  done_at: string | null;
}

export interface Call {
  vapi_call_id: string;
  customer_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  service_needed: string | null;
  status: string;
  qualified: boolean | null;
  preferred_time: string | null;
  job_details: string | null;
  summary: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  ghl_note_written: boolean;
  created_at: string;
}

export interface AutomationRun {
  id: number;
  function_name: string;
  trigger: string;
  customer_id: string | null;
  status: "success" | "error";
  request: unknown;
  response: unknown;
  error: string | null;
  duration_ms: number | null;
  rerun_of: number | null;
  created_at: string;
}
