/**
 * Seed 15 Dubai property listings into the properties table with embeddings.
 *
 * Usage:
 *   npx tsx scripts/seed-properties.ts           # dry run (no inserts)
 *   npx tsx scripts/seed-properties.ts --apply   # actually insert
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";
import { embed, propertyEmbedText } from "../lib/embeddings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const PROPERTIES = [
  {
    title: "Marina Gate Studio",
    description: "Modern studio in the heart of Dubai Marina with full marina views",
    property_type: "residential",
    intent: "rent",
    area: "Dubai Marina",
    bedrooms: null,
    size_sqft: 450,
    price_aed: 75_000,
    status: "available",
    amenities: ["gym", "pool", "concierge", "marina view"],
  },
  {
    title: "Marina Gate 2BR Apartment",
    description: "Spacious 2-bedroom apartment with open-plan kitchen and balcony overlooking Dubai Marina",
    property_type: "residential",
    intent: "rent",
    area: "Dubai Marina",
    bedrooms: 2,
    size_sqft: 1_100,
    price_aed: 130_000,
    status: "available",
    amenities: ["gym", "pool", "parking", "marina view"],
  },
  {
    title: "Downtown Burj View 3BR",
    description: "Luxury 3-bedroom apartment with direct Burj Khalifa and fountain views",
    property_type: "residential",
    intent: "buy",
    area: "Downtown Dubai",
    bedrooms: 3,
    size_sqft: 1_800,
    price_aed: 3_500_000,
    status: "available",
    amenities: ["burj view", "fountain view", "gym", "pool", "concierge"],
  },
  {
    title: "Palm Signature Villa",
    description: "Stunning 5-bedroom signature villa on the Palm Jumeirah frond with private beach and pool",
    property_type: "residential",
    intent: "buy",
    area: "Palm Jumeirah",
    bedrooms: 5,
    size_sqft: 8_500,
    price_aed: 15_000_000,
    status: "available",
    amenities: ["private beach", "private pool", "maid room", "driver room", "sea view"],
  },
  {
    title: "JVC Modern 1BR",
    description: "Contemporary 1-bedroom apartment in a quiet JVC community, ideal for young professionals",
    property_type: "residential",
    intent: "rent",
    area: "JVC",
    bedrooms: 1,
    size_sqft: 700,
    price_aed: 55_000,
    status: "available",
    amenities: ["gym", "pool", "covered parking"],
  },
  {
    title: "Business Bay Penthouse 3BR",
    description: "Exceptional 3-bedroom penthouse with panoramic Canal and Downtown views, high ROI",
    property_type: "residential",
    intent: "invest",
    area: "Business Bay",
    bedrooms: 3,
    size_sqft: 3_200,
    price_aed: 4_200_000,
    status: "available",
    amenities: ["canal view", "downtown view", "private terrace", "gym", "concierge"],
  },
  {
    title: "JBR Beachfront 2BR",
    description: "Walk-to-beach 2-bedroom apartment in Jumeirah Beach Residence with direct sea access",
    property_type: "residential",
    intent: "buy",
    area: "JBR",
    bedrooms: 2,
    size_sqft: 1_300,
    price_aed: 2_800_000,
    status: "available",
    amenities: ["beach access", "sea view", "gym", "pool"],
  },
  {
    title: "Arabian Ranches Villa 4BR",
    description: "Family-friendly 4-bedroom villa in a gated community with garden and golf course access",
    property_type: "residential",
    intent: "buy",
    area: "Arabian Ranches",
    bedrooms: 4,
    size_sqft: 4_200,
    price_aed: 6_500_000,
    status: "available",
    amenities: ["private garden", "golf access", "community pool", "school nearby"],
  },
  {
    title: "Dubai Hills Semi-Detached 5BR",
    description: "Semi-detached 5-bedroom villa in Dubai Hills Estate with golf course views",
    property_type: "residential",
    intent: "buy",
    area: "Dubai Hills",
    bedrooms: 5,
    size_sqft: 6_000,
    price_aed: 8_200_000,
    status: "available",
    amenities: ["golf view", "private garden", "maid room", "community pool"],
  },
  {
    title: "DIFC Office Suite",
    description: "Grade A office suite in the financial district, ideal for financial or legal firms",
    property_type: "commercial",
    intent: "buy",
    area: "DIFC",
    bedrooms: null,
    size_sqft: 2_800,
    price_aed: 2_100_000,
    status: "available",
    amenities: ["grade A", "24/7 security", "concierge", "parking"],
  },
  {
    title: "Business Bay Retail Unit",
    description: "Ground-floor retail unit on a busy Business Bay boulevard, strong foot traffic",
    property_type: "commercial",
    intent: "invest",
    area: "Business Bay",
    bedrooms: null,
    size_sqft: 900,
    price_aed: 1_800_000,
    status: "available",
    amenities: ["ground floor", "high foot traffic", "boulevard frontage"],
  },
  {
    title: "Al Barsha 2BR Apartment",
    description: "Affordable 2-bedroom apartment near Mall of the Emirates, great for families",
    property_type: "residential",
    intent: "rent",
    area: "Al Barsha",
    bedrooms: 2,
    size_sqft: 1_050,
    price_aed: 90_000,
    status: "available",
    amenities: ["gym", "pool", "parking", "mall nearby"],
  },
  {
    title: "Downtown Studio Investment",
    description: "High-yield studio apartment in Downtown Dubai, strong short-term rental demand",
    property_type: "residential",
    intent: "invest",
    area: "Downtown Dubai",
    bedrooms: null,
    size_sqft: 420,
    price_aed: 1_200_000,
    status: "available",
    amenities: ["burj view", "hotel-style amenities", "short-term rental allowed"],
  },
  {
    title: "Marina Walk Retail",
    description: "Premium retail unit on Dubai Marina Walk, high visibility and tourist foot traffic",
    property_type: "commercial",
    intent: "rent",
    area: "Dubai Marina",
    bedrooms: null,
    size_sqft: 600,
    price_aed: 250_000,
    status: "available",
    amenities: ["marina walk frontage", "tourist area", "high visibility"],
  },
  {
    title: "Palm Garden Apartment 3BR",
    description: "Elegant 3-bedroom apartment on Palm Jumeirah with private garden and sea views",
    property_type: "residential",
    intent: "buy",
    area: "Palm Jumeirah",
    bedrooms: 3,
    size_sqft: 2_800,
    price_aed: 7_000_000,
    status: "available",
    amenities: ["private garden", "sea view", "beach access", "gym", "pool"],
  },
] as const;

async function main() {
  const dryRun = !process.argv.includes("--apply");

  if (dryRun) {
    console.log("[dry-run] Pass --apply to insert. Showing what would be inserted:\n");
  }

  let inserted = 0;
  let errors = 0;

  for (const prop of PROPERTIES) {
    const embeddingText = propertyEmbedText(prop);

    if (dryRun) {
      console.log(`[dry-run] ${prop.title} (${prop.intent}, ${prop.area}, AED ${prop.price_aed.toLocaleString()})`);
      console.log(`         embed text: "${embeddingText.substring(0, 80)}..."\n`);
      continue;
    }

    process.stdout.write(`Inserting: ${prop.title} ... `);

    let embedding: number[];
    try {
      embedding = await embed(embeddingText);
    } catch (err) {
      console.error(`FAILED (embed): ${(err as Error).message}`);
      errors++;
      continue;
    }

    const { error } = await supabase.from("properties").insert({
      ...prop,
      amenities: [...prop.amenities],
      embedding,
    });

    if (error) {
      console.error(`FAILED (insert): ${error.message}`);
      errors++;
    } else {
      console.log("OK");
      inserted++;
    }
  }

  if (!dryRun) {
    console.log(`\nDone: ${inserted} inserted, ${errors} errors`);
    if (errors > 0) process.exit(1);
  } else {
    console.log(`[dry-run] ${PROPERTIES.length} properties would be inserted. Run with --apply to proceed.`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
