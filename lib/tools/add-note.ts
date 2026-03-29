import { supabase } from '@/lib/supabase'
import type { AddNoteArgs, LeadNote } from '@/types'

export async function executeAddNote(
  args: AddNoteArgs,
  agentId: string
): Promise<{ success: boolean; note: LeadNote } | { error: string }> {
  try {
    const now = new Date().toISOString()

    const { data: note, error: noteError } = await supabase
      .from('lead_notes')
      .insert({
        lead_id: args.lead_id,
        content: args.content,
        created_by: agentId,
        created_at: now,
      })
      .select()
      .single()

    if (noteError || !note) {
      return { error: noteError?.message ?? 'Failed to add note' }
    }

    // Update last_contacted_at on the lead
    await supabase
      .from('leads')
      .update({ last_contacted_at: now })
      .eq('id', args.lead_id)

    return { success: true, note: note as LeadNote }
  } catch (err) {
    return { error: String(err) }
  }
}
