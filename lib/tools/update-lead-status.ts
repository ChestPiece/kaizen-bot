import { supabase } from '@/lib/supabase'
import type { UpdateLeadStatusArgs, Lead } from '@/types'

export async function executeUpdateLeadStatus(
  args: UpdateLeadStatusArgs,
  agentId: string
): Promise<{ success: boolean; lead: Lead } | { error: string }> {
  try {
    const now = new Date().toISOString()

    const { data: lead, error: updateError } = await supabase
      .from('leads')
      .update({ status: args.new_status, last_contacted_at: now })
      .eq('id', args.lead_id)
      .select()
      .single()

    if (updateError || !lead) {
      return { error: updateError?.message ?? 'Failed to update lead' }
    }

    // If a reason was given, log it as a note
    if (args.reason) {
      await supabase.from('lead_notes').insert({
        lead_id: args.lead_id,
        content: `Status changed to "${args.new_status}": ${args.reason}`,
        created_by: agentId,
        created_at: now,
      })
    }

    return { success: true, lead: lead as Lead }
  } catch (err) {
    return { error: String(err) }
  }
}
