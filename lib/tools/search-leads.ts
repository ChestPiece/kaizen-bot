import { supabase } from "@/lib/supabase";
import type { SearchLeadsArgs, Lead } from "@/types";

export async function executeSearchLeads(
  args: SearchLeadsArgs,
  agentId: string,
): Promise<{ leads: Lead[] } | { error: string }> {
  try {
    console.info("tool:searchLeads:start", {
      agentId,
      hasQuery: Boolean(args.query),
      status: args.status ?? null,
      propertyType: args.property_type ?? null,
      area: args.area ?? null,
    });

    let query = supabase
      .from("leads")
      .select("*")
      .eq("assigned_to", agentId)
      .limit(20);

    if (args.query) {
      const safeQuery = args.query.replace(/[,%()]/g, "");
      query = query.or(
        `full_name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`,
      );
    }
    if (args.status) {
      query = query.eq("status", args.status);
    }
    if (args.property_type) {
      query = query.eq("property_type", args.property_type);
    }
    if (args.area) {
      query = query.contains("preferred_areas", [args.area]);
    }
    const { data, error } = await query;

    if (error) {
      console.error("tool:searchLeads:error", {
        agentId,
        error: error.message,
      });
      return { error: error.message };
    }

    const leads = (data as Lead[]) ?? [];
    console.info("tool:searchLeads:success", { agentId, count: leads.length });
    return { leads };
  } catch (err) {
    console.error("tool:searchLeads:exception", {
      agentId,
      error: String(err),
    });
    return { error: String(err) };
  }
}
