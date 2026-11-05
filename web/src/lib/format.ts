const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => (n == null ? "—" : usd0.format(Number(n)));

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const daysSince = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const GHL_APP = (import.meta.env.VITE_GHL_APP_URL as string) || "https://app.gohighlevel.com";
const GHL_LOC = import.meta.env.VITE_GHL_AGENCY_LOCATION_ID as string | undefined;

/** Deep link to a contact in the Agency HQ sub-account (null if location ID not configured). */
export const ghlContactUrl = (contactId: string | null) =>
  GHL_LOC && contactId ? `${GHL_APP}/v2/location/${GHL_LOC}/contacts/detail/${contactId}` : null;
