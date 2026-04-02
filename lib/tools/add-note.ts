import { supabase } from "@/lib/supabase";
import { toLogError, toToolErrorMessage } from "@/lib/safe-error";
import type { AddNoteArgs, LeadNote } from "@/types";

export async function executeAddNote(
  args: AddNoteArgs,
  agentId: string,
): Promise<{ success: boolean; note: LeadNote } | { error: string }> {
  try {
    console.info("tool:addNote:start", {
      agentId,
      leadId: args.lead_id,
      contentLength: args.content.length,
    });

    const now = new Date().toISOString();

    const { data: note, error: noteError } = await supabase.rpc(
      "add_lead_note_and_touch_lead",
      {
        p_lead_id: args.lead_id,
        p_agent_id: agentId,
        p_content: args.content,
        p_created_at: now,
      },
    );

    if (noteError || !note) {
      const message = noteError?.message ?? "Failed to add note";
      if (message.includes("Lead not found or not assigned to you")) {
        console.error("tool:addNote:error", {
          agentId,
          leadId: args.lead_id,
          error: toLogError(noteError) || message,
        });
        return { error: "Lead not found or not assigned to you" };
      }
      console.error("tool:addNote:error", {
        agentId,
        leadId: args.lead_id,
        error: toLogError(noteError) || message,
      });
      return { error: toToolErrorMessage() };
    }

    console.info("tool:addNote:success", {
      agentId,
      leadId: args.lead_id,
      noteId: (note as LeadNote).id,
    });
    return { success: true, note: note as LeadNote };
  } catch (err) {
    console.error("tool:addNote:exception", {
      agentId,
      leadId: args.lead_id,
      error: toLogError(err),
    });
    return { error: toToolErrorMessage() };
  }
}
