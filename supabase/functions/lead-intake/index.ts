// Replaces Make.com Scenario 1.
// A client's GHL form workflow (30-second Wait -> Webhook) posts the new lead here,
// and we tell Vapi to call that lead with the client's assistant + phone number.
//
// In the GHL Webhook action, add Custom Data:
//   location_id    = {{location.id}}
//   contact_id     = {{contact.id}}
//   first_name     = {{contact.first_name}}
//   phone          = {{contact.phone}}
//   service_needed = {{contact.service_needed}}   (your form's custom field)
// Standard GHL payload fields are used as fallbacks.
import { admin, serveLogged } from "../_shared/handler.ts";

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function toE164(raw: string): string {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error(`Can't normalise phone number "${raw}" to E.164`);
}

serveLogged("lead-intake", async (ctx) => {
  if (!VAPI_API_KEY) throw new Error("VAPI_API_KEY is not set in Edge Function secrets");

  const b = ctx.body ?? {};
  const cd = b.customData ?? {};
  const locationId: string | undefined = cd.location_id ?? b.location?.id ?? b.location_id ?? b.locationId;
  const contactId: string | undefined = cd.contact_id ?? b.contact_id ?? b.contactId;
  const rawPhone: string | undefined = cd.phone ?? b.phone;
  const fullName: string = b.full_name ?? [b.first_name, b.last_name].filter(Boolean).join(" ");
  const firstName: string = cd.first_name ?? b.first_name ?? fullName.split(" ")[0] ?? "";
  const serviceNeeded: string = cd.service_needed ?? b.service_needed ?? "";

  if (!locationId) throw new Error("No location id in payload (add Custom Data location_id = {{location.id}})");
  if (!rawPhone) throw new Error("No phone number in payload");

  const { data: customer, error } = await admin
    .from("customers")
    .select("id, name, company_name, vapi_assistant_id, vapi_phone_number_id")
    .eq("client_location_id", locationId)
    .maybeSingle();
  if (error) throw error;
  if (!customer) throw new Error(`No client in the hub has GHL location ID ${locationId}`);
  ctx.setCustomer(customer.id);
  if (!customer.vapi_assistant_id || !customer.vapi_phone_number_id) {
    throw new Error(`${customer.name} is missing a Vapi assistant ID or phone number ID in the hub`);
  }

  const phone = toE164(rawPhone);

  // GHL can retry webhooks; never call the same lead twice within 2 minutes (manual re-runs bypass this)
  if (ctx.trigger !== "rerun") {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("calls")
      .select("vapi_call_id")
      .eq("customer_id", customer.id)
      .eq("lead_phone", phone)
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return { body: { skipped: "duplicate within 2 minutes", vapi_call_id: recent[0].vapi_call_id } };
  }

  const companyName: string = cd.company_name ?? b.location?.name ?? customer.company_name ?? customer.name;

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      assistantId: customer.vapi_assistant_id,
      phoneNumberId: customer.vapi_phone_number_id,
      customer: { number: phone, name: fullName || firstName || undefined },
      assistantOverrides: {
        variableValues: { first_name: firstName, company_name: companyName, service_needed: serviceNeeded },
        metadata: { customer_id: customer.id, ghl_contact_id: contactId ?? null },
      },
    }),
  });
  const call = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${JSON.stringify(call).slice(0, 500)}`);

  await admin.from("calls").insert({
    vapi_call_id: call.id,
    customer_id: customer.id,
    ghl_contact_id: contactId ?? null,
    lead_name: fullName || firstName || null,
    lead_phone: phone,
    service_needed: serviceNeeded || null,
  });

  return { body: { vapi_call_id: call.id, status: call.status, to: phone } };
});
