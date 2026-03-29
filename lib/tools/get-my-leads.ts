import { supabase } from '@/lib/supabase'
import type { GetMyLeadsArgs, Lead } from '@/types'

export async function executeGetMyLeads(
  args: GetMyLeadsArgs,
  agentId: string
): Promise<{ leads: Lead[] } | { error: string }> {
  try {
    let query = supabase
      .from('leads')
      .select('*')
      .eq('assigned_to', agentId)
      .order('last_contacted_at', { ascending: true }) // oldest contact first = most urgent

    if (args.status) {
      query = query.eq('status', args.status)
    }

    const { data, error } = await query

    if (error) return { error: error.message }
    return { leads: (data as Lead[]) ?? [] }
  } catch (err) {
    return { error: String(err) }
  }
}
