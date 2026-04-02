import { supabase } from "@/lib/supabase";
import { toLogError, toToolErrorMessage } from "@/lib/safe-error";
import type { UpdateLeadStatusArgs, Lead } from "@/types";

export async function executeUpdateLeadStatus(
  args: UpdateLeadStatusArgs,
  agentId: string,
): Promise<
  { success: true; lead: Lead; warning?: string } | { error: string }
> {
  try {
    console.info("tool:updateLeadStatus:start", {
      agentId,
      leadId: args.lead_id,
      newStatus: args.new_status,
      hasReason: Boolean(args.reason),
    });

    const now = new Date().toISOString();

    const { data: lead, error: updateError } = await supabase
      .from("leads")
      .update({ status: args.new_status, last_contacted_at: now })
      .eq("id", args.lead_id)
      .eq("assigned_to", agentId)
      .select()
      .single();

    if (updateError || !lead) {
      const message =
        updateError?.code === "PGRST116"
          ? "Lead not found or not assigned to you"
          : "Failed to update lead";
      console.error("tool:updateLeadStatus:error", {
        agentId,
        leadId: args.lead_id,
        error: toLogError(updateError) || message,
      });
      return { error: message };
    }

    // If a reason was given, log it as a note
    if (args.reason) {
      const { error: noteError } = await supabase.from("lead_notes").insert({
        lead_id: args.lead_id,
        content: `Status changed to "${args.new_status}": ${args.reason}`,
        created_by: agentId,
        created_at: now,
      });

      if (noteError) {
        const warning =
          "Lead status updated, but failed to save the reason note.";
        console.error("tool:updateLeadStatus:error", {
          agentId,
          leadId: args.lead_id,
          error: toLogError(noteError),
          partialSuccess: true,
        });
        return {
          success: true,
          lead: lead as Lead,
          warning,
        };
      }
    }

    console.info("tool:updateLeadStatus:success", {
      agentId,
      leadId: args.lead_id,
      newStatus: args.new_status,
    });
    return { success: true, lead: lead as Lead };
  } catch (err) {
    console.error("tool:updateLeadStatus:exception", {
      agentId,
      leadId: args.lead_id,
      error: toLogError(err),
    });
    return { error: toToolErrorMessage() };
  }
}
