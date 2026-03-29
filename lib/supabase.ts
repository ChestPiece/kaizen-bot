import { createClient } from '@supabase/supabase-js'
import type { Agent } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Singleton server-side client using service role key (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

/**
 * Look up an internal agent record by their Slack user ID.
 * Returns null if the Slack user has not been registered in the agents table.
 */
export async function getAgentBySlackId(slackUserId: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('slack_user_id', slackUserId)
    .single()

  if (error || !data) return null
  return data as Agent
}
