import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export interface SearchPropertiesArgs {
  query: string;
  intent?: "buy" | "rent" | "invest";
  match_count?: number;
}

export interface PropertyResult {
  id: string;
  title: string;
  property_type: string;
  intent: string;
  area: string;
  bedrooms: number | null;
  bathrooms: number | null;
  size_sqft: number | null;
  price_aed: number;
  amenities: string[];
  status: string;
  similarity: number;
}

export async function executeSearchProperties(
  args: SearchPropertiesArgs,
): Promise<{ properties: PropertyResult[] } | { error: string }> {
  try {
    console.info("tool:searchProperties:start", {
      query: args.query,
      intent: args.intent ?? null,
      match_count: args.match_count ?? 5,
    });

    const queryEmbedding = await embed(args.query);

    const { data, error } = await supabase.rpc("match_properties", {
      query_embedding: queryEmbedding,
      match_count: args.match_count ?? 5,
      filter_status: "available",
      filter_intent: args.intent ?? null,
    });

    if (error) {
      console.error("tool:searchProperties:error", { error: error.message });
      return { error: error.message };
    }

    const properties = (data as PropertyResult[]) ?? [];
    console.info("tool:searchProperties:success", { count: properties.length });
    return { properties };
  } catch (err) {
    console.error("tool:searchProperties:exception", { error: String(err) });
    return { error: String(err) };
  }
}
