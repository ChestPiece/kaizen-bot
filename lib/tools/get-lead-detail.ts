import { supabase } from "@/lib/supabase";
import { toLogError, toToolErrorMessage } from "@/lib/safe-error";
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
      const message = "Lead not found or not assigned to you";
      console.error("tool:getLeadDetail:error", {
        agentId,
        leadId: args.lead_id,
        error: toLogError(leadError) || message,
      });
      return { error: message };
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
        error: toLogError(notesError),
      });
      return { error: toToolErrorMessage() };
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
      error: toLogError(err),
    });
    return { error: toToolErrorMessage() };
  }
}
