-- Migration 004: security hardening (RLS + function search_path)

-- Enable RLS on public tables exposed through PostgREST.
ALTER TABLE IF EXISTS public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.thread_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lead_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_state_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_state_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_state_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_state_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_state_subscriptions ENABLE ROW LEVEL SECURITY;

-- Pin function search_path to reduce role-mutable search path risk.
DO $$
BEGIN
  IF to_regprocedure('public.add_lead_note_and_touch_lead(uuid,uuid,text,timestamptz)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.add_lead_note_and_touch_lead(uuid, uuid, text, timestamptz) SET search_path = public, pg_temp';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.match_properties(vector,integer,text,lead_intent)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.match_properties(vector, integer, text, lead_intent) SET search_path = public, pg_temp';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.match_leads(vector,integer)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.match_leads(vector, integer) SET search_path = public, pg_temp';
  END IF;
END $$;
