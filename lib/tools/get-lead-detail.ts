import { supabase } from '@/lib/supabase'
import type { GetLeadDetailArgs, LeadWithNotes } from '@/types'

export async function executeGetLeadDetail(
  args: GetLeadDetailArgs,
  _agentId: string
): Promise<{ lead: LeadWithNotes } | { error: string }> {
  try {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*, assigned_agent:agents(*)')
      .eq('id', args.lead_id)
      .single()

    if (leadError || !lead) {
      return { error: leadError?.message ?? 'Lead not found' }
    }

    const { data: notes, error: notesError } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', args.lead_id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (notesError) return { error: notesError.message }

    return {
      lead: {
        ...lead,
        notes: notes ?? [],
      } as LeadWithNotes,
    }
  } catch (err) {
    return { error: String(err) }
  }
}
