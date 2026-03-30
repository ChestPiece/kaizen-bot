import { supabase } from "@/lib/supabase";
import type { GetLeadDetailArgs, LeadWithNotes } from "@/types";

export async function executeGetLeadDetail(
  args: GetLeadDetailArgs,
  agentId: string,
): Promise<{ lead: LeadWithNotes } | { error: string }> {
  try {
    console.info("tool:getLeadDetail:start", { agentId, leadId: args.lead_id });

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*, assigned_agent:agents(*)")
      .eq("id", args.lead_id)
      .eq("assigned_to", agentId)
      .single();

    if (leadError || !lead) {
      console.error("tool:getLeadDetail:error", {
        agentId,
        leadId: args.lead_id,
        error: leadError?.message ?? "Lead not found or not assigned to you",
      });
      return {
        error: leadError?.message ?? "Lead not found or not assigned to you",
      };
    }

    const { data: notes, error: notesError } = await supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", args.lead_id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notesError) {
      console.error("tool:getLeadDetail:error", {
        agentId,
        leadId: args.lead_id,
        error: notesError.message,
      });
      return { error: notesError.message };
    }

    console.info("tool:getLeadDetail:success", {
      agentId,
      leadId: args.lead_id,
      notesCount: notes?.length ?? 0,
    });

    return {
      lead: {
        ...lead,
        notes: notes ?? [],
      } as LeadWithNotes,
    };
  } catch (err) {
    console.error("tool:getLeadDetail:exception", {
      agentId,
      leadId: args.lead_id,
      error: String(err),
    });
    return { error: String(err) };
  }
}
