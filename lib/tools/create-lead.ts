import { supabase } from '@/lib/supabase'
import type { CreateLeadArgs, Lead } from '@/types'

export async function executeCreateLead(
  args: CreateLeadArgs,
  agentId: string
): Promise<{ success: boolean; lead: Lead } | { error: string }> {
  try {
    const now = new Date().toISOString()

    const { data: lead, error } = await supabase
      .from('leads')
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
        status: 'new',
        assigned_to: agentId,
        last_contacted_at: now,
        created_at: now,
      })
      .select()
      .single()

    if (error || !lead) {
      return { error: error?.message ?? 'Failed to create lead' }
    }

    return { success: true, lead: lead as Lead }
  } catch (err) {
    return { error: String(err) }
  }
}
