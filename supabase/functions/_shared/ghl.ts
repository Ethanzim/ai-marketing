// Minimal LeadConnector (GoHighLevel API v2) client.
const BASE = "https://services.leadconnectorhq.com";

export async function ghl<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${res.status} ${init.method ?? "GET"} ${path}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  pipelineId: string;
  pipelineStageId: string;
  status?: string;
  contactId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastStageChangeAt?: string;
  contact?: { id?: string; name?: string; companyName?: string; email?: string; phone?: string };
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; position?: number }[];
}
