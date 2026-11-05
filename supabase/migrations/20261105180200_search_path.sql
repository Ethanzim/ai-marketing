-- Pin search_path on trigger/helper functions (Supabase advisor: function_search_path_mutable)
alter function public.set_updated_at()                   set search_path = public;
alter function public.tools_ready_at()                   set search_path = public;
alter function public.log_stage_change()                 set search_path = public;
alter function public.onboarding_done_at()               set search_path = public;
alter function public.seed_onboarding_on_stage()         set search_path = public;
alter function public.create_onboarding_checklist(uuid)  set search_path = public;
