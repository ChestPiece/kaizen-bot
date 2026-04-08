import { supabase } from "@/lib/supabase";
import { embed, leadEmbedText } from "@/lib/embeddings";
import { toLogError, toToolErrorMessage } from "@/lib/safe-error";
import type { CreateLeadArgs, Lead } from "@/types";

export async function executeCreateLead(
  args: CreateLeadArgs,
  agentId: string,
): Promise<
  | { success: boolean; lead: Lead; warning?: string }
  | { error: string }
> {
  try {
    console.info("tool:createLead:start", {
      agentId,
      fullName: args.full_name,
      propertyType: args.property_type,
      intent: args.intent,
      budgetAed: args.budget_aed,
    });

    const now = new Date().toISOString();

    const { data: lead, error } = await supabase
      .from("leads")
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
        status: "new",
        assigned_to: agentId,
        last_contacted_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (error || !lead) {
      console.error("tool:createLead:error", {
        agentId,
        error: toLogError(error),
      });
      return { error: toToolErrorMessage() };
    }

    let embeddingWarning: string | undefined;

    // Generate and store embedding so this lead is findable via match_leads
    try {
      const embedding = await embed(
        leadEmbedText({
          full_name: args.full_name,
          property_type: args.property_type,
          intent: args.intent,
          budget_aed: args.budget_aed,
          preferred_areas: args.preferred_areas ?? [],
          nationality: args.nationality,
        }),
      );
      const { error: embeddingInsertError } = await supabase
        .from("lead_embeddings")
        .insert({ lead_id: (lead as Lead).id, embedding });

      if (embeddingInsertError) {
        console.warn("tool:createLead:embedding_insert_failed", {
          leadId: (lead as Lead).id,
          error: toLogError(embeddingInsertError),
        });
        embeddingWarning =
          "Lead was created, but semantic indexing failed. Search results may be incomplete until indexing is retried.";
      }
    } catch (embErr) {
      // Non-fatal: lead is created, embedding will just be missing
      console.warn("tool:createLead:embedding_failed", {
        leadId: (lead as Lead).id,
        error: toLogError(embErr),
      });
      embeddingWarning =
        "Lead was created, but semantic indexing failed. Search results may be incomplete until indexing is retried.";
    }

    console.info("tool:createLead:success", {
      agentId,
      leadId: (lead as Lead).id,
    });
    return { success: true, lead: lead as Lead, warning: embeddingWarning };
  } catch (err) {
    console.error("tool:createLead:exception", {
      agentId,
      error: toLogError(err),
    });
    return { error: toToolErrorMessage() };
  }
}
