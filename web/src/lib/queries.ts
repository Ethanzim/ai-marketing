import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke, supabase } from "./supabase";
import type { AutomationRun, Call, Customer, OnboardingTask, Stage, StageHistory, Tool } from "./types";

async function rows<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const useTools = () =>
  useQuery({
    queryKey: ["tools"],
    queryFn: () => rows<Tool[]>(supabase.from("tools").select("*").order("sort_order")),
  });

export const useStages = () =>
  useQuery({
    queryKey: ["stages"],
    queryFn: () => rows<Stage[]>(supabase.from("pipeline_stages").select("*").order("position")),
  });

export const useCustomers = () =>
  useQuery({
    queryKey: ["customers"],
    queryFn: () => rows<Customer[]>(supabase.from("customers").select("*").order("ghl_created_at", { ascending: false })),
    refetchInterval: 60_000,
  });

export const useCustomer = (id: string) =>
  useQuery({
    queryKey: ["customer", id],
    queryFn: () => rows<Customer>(supabase.from("customers").select("*").eq("id", id).single()),
  });

export const useStageHistory = (customerId: string) =>
  useQuery({
    queryKey: ["history", customerId],
    queryFn: () =>
      rows<StageHistory[]>(
        supabase.from("stage_history").select("*").eq("customer_id", customerId).order("changed_at", { ascending: false }),
      ),
  });

export const useOnboarding = (customerId: string) =>
  useQuery({
    queryKey: ["onboarding", customerId],
    queryFn: () =>
      rows<OnboardingTask[]>(supabase.from("onboarding_tasks").select("*").eq("customer_id", customerId).order("position")),
  });

export const useCalls = (customerId?: string) =>
  useQuery({
    queryKey: ["calls", customerId ?? "all"],
    queryFn: () => {
      let q = supabase.from("calls").select("*").order("created_at", { ascending: false }).limit(200);
      if (customerId) q = q.eq("customer_id", customerId);
      return rows<Call[]>(q);
    },
    refetchInterval: 30_000,
  });

export const useRuns = (opts: { customerId?: string; limit?: number } = {}) =>
  useQuery({
    queryKey: ["runs", opts.customerId ?? "all", opts.limit ?? 100],
    queryFn: () => {
      let q = supabase.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
      if (opts.customerId) q = q.eq("customer_id", opts.customerId);
      return rows<AutomationRun[]>(q);
    },
    refetchInterval: 30_000,
  });

export const useTokenStatus = () =>
  useQuery({
    queryKey: ["token-status"],
    queryFn: () => rows<{ customer_id: string; updated_at: string }[]>(supabase.rpc("client_token_status")),
  });

export const useWebhookToken = () =>
  useQuery({
    queryKey: ["webhook-token"],
    queryFn: () => rows<string>(supabase.rpc("get_webhook_token")),
    staleTime: Infinity,
  });

export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ upserted: number; markedDeleted: number }>("ghl-sync", {}, "?mode=full"),
    onSettled: () => qc.invalidateQueries(),
  });
}

export function useRerun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (run: AutomationRun) => invoke(run.function_name, { rerun_of: run.id }),
    onSettled: () => qc.invalidateQueries(),
  });
}
