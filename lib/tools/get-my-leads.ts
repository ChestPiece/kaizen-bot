import { supabase } from "@/lib/supabase";
import type { GetMyLeadsArgs, Lead } from "@/types";

export async function executeGetMyLeads(
  args: GetMyLeadsArgs,
  agentId: string,
): Promise<{ leads: Lead[] } | { error: string }> {
  try {
    console.info("tool:getMyLeads:start", {
      agentId,
      status: args.status ?? null,
    });

    let query = supabase
      .from("leads")
      .select("*")
      .eq("assigned_to", agentId)
      .order("last_contacted_at", { ascending: true }) // oldest contact first = most urgent
      .limit(50);

    if (args.status) {
      query = query.eq("status", args.status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("tool:getMyLeads:error", { agentId, error: error.message });
      return { error: error.message };
    }

    const leads = (data as Lead[]) ?? [];
    console.info("tool:getMyLeads:success", { agentId, count: leads.length });
    return { leads };
  } catch (err) {
    console.error("tool:getMyLeads:exception", { agentId, error: String(err) });
    return { error: String(err) };
  }
}
