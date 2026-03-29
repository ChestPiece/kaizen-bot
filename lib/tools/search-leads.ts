import { supabase } from '@/lib/supabase'
import type { SearchLeadsArgs, Lead } from '@/types'

export async function executeSearchLeads(
  args: SearchLeadsArgs,
  _agentId: string
): Promise<{ leads: Lead[] } | { error: string }> {
  try {
    let query = supabase.from('leads').select('*').limit(20)

    if (args.query) {
      query = query.or(
        `full_name.ilike.%${args.query}%,phone.ilike.%${args.query}%`
      )
    }
    if (args.status) {
      query = query.eq('status', args.status)
    }
    if (args.property_type) {
      query = query.eq('property_type', args.property_type)
    }
    if (args.area) {
      query = query.contains('preferred_areas', [args.area])
    }
    if (args.assigned_to) {
      query = query.eq('assigned_to', args.assigned_to)
    }

    const { data, error } = await query

    if (error) return { error: error.message }
    return { leads: (data as Lead[]) ?? [] }
  } catch (err) {
    return { error: String(err) }
  }
}
