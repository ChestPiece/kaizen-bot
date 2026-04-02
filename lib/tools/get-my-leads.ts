import { supabase } from "@/lib/supabase";
import { toLogError, toToolErrorMessage } from "@/lib/safe-error";
import type { GetMyLeadsArgs, Lead } from "@/types";

export async function executeGetMyLeads(
  args: GetMyLeadsArgs,
  agentId: string,
): Promise<{ leads: Lead[] } | { error: string }> {
  try {
    const assignedOnly = args.assigned_only ?? false;

    console.info("tool:getMyLeads:start", {
      agentId,
      assignedOnly,
      status: args.status ?? null,
    });

    let query = supabase
      .from("leads")
      .select("*")
      .order("last_contacted_at", { ascending: true }) // oldest contact first = most urgent
      .limit(50);

    if (assignedOnly) {
      query = query.eq("assigned_to", agentId);
    }

    if (args.status) {
      query = query.eq("status", args.status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("tool:getMyLeads:error", {
        agentId,
        error: toLogError(error),
      });
      return { error: toToolErrorMessage() };
    }

    const leads = (data as Lead[]) ?? [];
    console.info("tool:getMyLeads:success", {
      agentId,
      assignedOnly,
      status: args.status ?? null,
      count: leads.length,
    });
    return { leads };
  } catch (err) {
    console.error("tool:getMyLeads:exception", {
      agentId,
      error: toLogError(err),
    });
    return { error: toToolErrorMessage() };
  }
}
