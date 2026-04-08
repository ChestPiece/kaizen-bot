/**
 * Backfill missing lead embeddings.
 *
 * Dry run (default): npx tsx scripts/backfill-lead-embeddings.ts
 * Apply writes:       npx tsx scripts/backfill-lead-embeddings.ts --apply
 */
import { config } from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { embed, leadEmbedText } from "../lib/embeddings";
import { toLogError } from "../lib/safe-error";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

type LeadRow = {
  id: string;
  full_name: string;
  nationality: string;
  property_type: "residential" | "commercial";
  intent: "buy" | "rent" | "invest";
  budget_aed: number;
  preferred_areas: string[];
};

async function main() {
  const shouldApply = process.argv.includes("--apply");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id, full_name, nationality, property_type, intent, budget_aed, preferred_areas",
    );
  if (leadsError) {
    throw new Error(`Failed to load leads: ${leadsError.message}`);
  }

  const { data: existingEmbeddings, error: embError } = await supabase
    .from("lead_embeddings")
    .select("lead_id");
  if (embError) {
    throw new Error(
      `Failed to load existing lead embeddings: ${embError.message}`,
    );
  }

  const existingLeadIds = new Set(
    (existingEmbeddings ?? []).map((row) => row.lead_id),
  );
  const missing = (leads as LeadRow[]).filter(
    (lead) => !existingLeadIds.has(lead.id),
  );

  console.log(`Total leads: ${(leads ?? []).length}`);
  console.log(`Missing lead embeddings: ${missing.length}`);
  if (!shouldApply) {
    console.log("Dry run mode (no writes). Re-run with --apply to persist.");
  }

  let successCount = 0;
  let failureCount = 0;

  for (const lead of missing) {
    try {
      const embedding = await embed(
        leadEmbedText({
          full_name: lead.full_name,
          nationality: lead.nationality,
          property_type: lead.property_type,
          intent: lead.intent,
          budget_aed: lead.budget_aed,
          preferred_areas: lead.preferred_areas,
        }),
      );

      if (shouldApply) {
        const { error } = await supabase.from("lead_embeddings").upsert({
          lead_id: lead.id,
          embedding,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          failureCount++;
          console.error(
            `- ${lead.id} ${lead.full_name}: upsert failed (${error.message})`,
          );
          continue;
        }
      }

      successCount++;
      console.log(
        `- ${lead.id} ${lead.full_name}: ${shouldApply ? "backfilled" : "would backfill"}`,
      );
    } catch (err) {
      failureCount++;
      console.error(`- ${lead.id} ${lead.full_name}: ${toLogError(err)}`);
    }
  }

  console.log("\nSummary:");
  console.log(`- Processed: ${missing.length}`);
  console.log(`- Success: ${successCount}`);
  console.log(`- Failed: ${failureCount}`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
