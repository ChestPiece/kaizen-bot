import { supabase } from "@/lib/supabase";
import type { CreateLeadArgs, Lead } from "@/types";

export async function executeCreateLead(
  args: CreateLeadArgs,
  agentId: string,
): Promise<{ success: boolean; lead: Lead } | { error: string }> {
  try {
    console.info("tool:createLead:start", {
      agentId,
      fullName: args.full_name,
      propertyType: args.property_type,
      intent: args.intent,
      budgetAed: args.budget_aed,
    });

    const now = new Date().toISOString();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        full_name: args.full_name,
        phone: args.phone,
        email: args.email ?? null,
        nationality: args.nationality,
        property_type: args.property_type,
        intent: args.intent,
        budget_aed: args.budget_aed,
        preferred_areas: args.preferred_areas ?? [],
        source: args.source ?? null,
        status: "new",
        assigned_to: agentId,
        last_contacted_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (error || !lead) {
      console.error("tool:createLead:error", {
        agentId,
        error: error?.message ?? "Failed to create lead",
      });
      return { error: error?.message ?? "Failed to create lead" };
    }

    console.info("tool:createLead:success", {
      agentId,
      leadId: (lead as Lead).id,
    });
    return { success: true, lead: lead as Lead };
  } catch (err) {
    console.error("tool:createLead:exception", { agentId, error: String(err) });
    return { error: String(err) };
  }
}
