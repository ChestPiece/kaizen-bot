import { createClient } from "@supabase/supabase-js";
import { toLogError } from "@/lib/safe-error";
import type { Agent } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL",
  );
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY",
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

/**
 * Look up an internal agent record by their Slack user ID.
 * Returns null if the Slack user has not been registered in the agents table.
 */
export async function getAgentBySlackId(
  slackUserId: string,
): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("slack_user_id", slackUserId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 = no rows found; anything else is a connectivity or config issue
      console.error("getAgentBySlackId: unexpected DB error", {
        slackUserId,
        code: error.code,
        message: toLogError(error),
      });
    }
    return null;
  }
  if (!data) return null;
  return data as Agent;
}

/**
 * Look up an internal agent record by their Discord user ID.
 * Returns null if the Discord user has not been registered in the agents table.
 */
export async function getAgentByDiscordId(
  discordUserId: string,
): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 = no rows found; anything else is a connectivity or config issue
      console.error("getAgentByDiscordId: unexpected DB error", {
        discordUserId,
        code: error.code,
        message: toLogError(error),
      });
    }
    return null;
  }
  if (!data) return null;
  return data as Agent;
}
