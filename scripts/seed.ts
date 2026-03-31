/**
 * Seed script: inserts 15 Dubai properties + 5 leads, generates embeddings for all.
 * Run: npx tsx scripts/seed.ts
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */
import { config } from "dotenv";
import path from "path";

// Load .env.local first, fall back to .env
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { propertyEmbedText, leadEmbedText } from "../lib/embeddings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

// ─── Property seed data ────────────────────────────────────────────────────────

const properties = [
  // Dubai Marina
  {
    title: "Spacious 2BR Apartment in Dubai Marina",
    description:
      "Bright 2-bedroom apartment with full marina view, modern kitchen, and access to shared pool and gym.",
    property_type: "residential",
    intent: "buy",
    area: "Dubai Marina",
    bedrooms: 2,
    bathrooms: 2,
    size_sqft: 1150,
    price_aed: 1_850_000,
    amenities: ["marina view", "pool", "gym", "concierge", "parking"],
    status: "available",
  },
  {
    title: "Cozy 1BR in Dubai Marina Walk",
    description:
      "Well-maintained 1-bedroom unit steps from the Marina Walk promenade and JBR beach.",
    property_type: "residential",
    intent: "buy",
    area: "Dubai Marina",
    bedrooms: 1,
    bathrooms: 1,
    size_sqft: 720,
    price_aed: 1_100_000,
    amenities: ["walk to beach", "balcony", "gym", "parking"],
    status: "available",
  },
  {
    title: "3BR Marina View Apartment for Rent",
    description:
      "Fully furnished 3-bedroom apartment with panoramic marina views, high floor, available immediately.",
    property_type: "residential",
    intent: "rent",
    area: "Dubai Marina",
    bedrooms: 3,
    bathrooms: 3,
    size_sqft: 1800,
    price_aed: 220_000,
    amenities: ["furnished", "marina view", "high floor", "pool", "gym"],
    status: "available",
  },

  // Downtown Dubai
  {
    title: "2BR Apartment with Burj Khalifa View",
    description:
      "Stunning 2-bedroom apartment overlooking the Burj Khalifa and Dubai Fountain in the heart of Downtown.",
    property_type: "residential",
    intent: "buy",
    area: "Downtown Dubai",
    bedrooms: 2,
    bathrooms: 2,
    size_sqft: 1300,
    price_aed: 3_200_000,
    amenities: ["Burj Khalifa view", "fountain view", "pool", "gym", "valet"],
    status: "available",
  },
  {
    title: "Studio in Downtown Dubai near Dubai Mall",
    description:
      "Compact studio apartment 5 minutes walk from Dubai Mall. Perfect for professionals or investors.",
    property_type: "residential",
    intent: "buy",
    area: "Downtown Dubai",
    bedrooms: null,
    bathrooms: 1,
    size_sqft: 480,
    price_aed: 980_000,
    amenities: ["near Dubai Mall", "gym", "pool", "concierge"],
    status: "available",
  },
  {
    title: "1BR Downtown Dubai for Rent",
    description:
      "Modern 1-bedroom apartment in Downtown, semi-furnished, close to metro and business district.",
    property_type: "residential",
    intent: "rent",
    area: "Downtown Dubai",
    bedrooms: 1,
    bathrooms: 1,
    size_sqft: 750,
    price_aed: 130_000,
    amenities: ["semi-furnished", "near metro", "gym", "pool"],
    status: "available",
  },

  // Palm Jumeirah
  {
    title: "4BR Palm Jumeirah Frond Villa",
    description:
      "Luxurious 4-bedroom villa on a private frond with direct beach access and private pool.",
    property_type: "residential",
    intent: "buy",
    area: "Palm Jumeirah",
    bedrooms: 4,
    bathrooms: 5,
    size_sqft: 5200,
    price_aed: 12_500_000,
    amenities: [
      "private beach",
      "private pool",
      "garden",
      "maid's room",
      "sea view",
    ],
    status: "available",
  },
  {
    title: "5BR Signature Villa on Palm Jumeirah",
    description:
      "Ultra-premium 5-bedroom signature villa with 360° sea views, home cinema, and smart home system.",
    property_type: "residential",
    intent: "buy",
    area: "Palm Jumeirah",
    bedrooms: 5,
    bathrooms: 6,
    size_sqft: 8500,
    price_aed: 22_000_000,
    amenities: [
      "private beach",
      "private pool",
      "home cinema",
      "smart home",
      "gym",
      "sea view",
    ],
    status: "available",
  },

  // JVC (Jumeirah Village Circle)
  {
    title: "2BR Apartment in JVC for Rent",
    description:
      "Affordable 2-bedroom apartment in JVC with community garden view, perfect for families.",
    property_type: "residential",
    intent: "rent",
    area: "JVC",
    bedrooms: 2,
    bathrooms: 2,
    size_sqft: 1050,
    price_aed: 85_000,
    amenities: ["garden view", "kids play area", "gym", "parking", "pet-friendly"],
    status: "available",
  },
  {
    title: "2BR for Sale in JVC — High ROI",
    description:
      "Well-priced 2-bedroom in JVC with strong rental yield. Popular with buy-to-let investors.",
    property_type: "residential",
    intent: "buy",
    area: "JVC",
    bedrooms: 2,
    bathrooms: 2,
    size_sqft: 1000,
    price_aed: 800_000,
    amenities: ["pool", "gym", "covered parking", "storage"],
    status: "available",
  },

  // Business Bay
  {
    title: "1BR in Business Bay with Canal View",
    description:
      "Sleek 1-bedroom apartment in Business Bay with Dubai Canal views. Ideal for young professionals.",
    property_type: "residential",
    intent: "buy",
    area: "Business Bay",
    bedrooms: 1,
    bathrooms: 1,
    size_sqft: 800,
    price_aed: 1_400_000,
    amenities: ["canal view", "gym", "pool", "near metro", "balcony"],
    status: "available",
  },
  {
    title: "Studio for Rent in Business Bay",
    description:
      "Fully furnished studio in Business Bay, 5 minutes walk to Business Bay metro station.",
    property_type: "residential",
    intent: "rent",
    area: "Business Bay",
    bedrooms: null,
    bathrooms: 1,
    size_sqft: 420,
    price_aed: 65_000,
    amenities: ["furnished", "near metro", "pool", "gym"],
    status: "available",
  },

  // Commercial — Investment
  {
    title: "Grade A Office Suite in Business Bay",
    description:
      "Fitted grade-A office suite of 2,400 sqft in a premium Business Bay tower. Ideal for corporate HQ.",
    property_type: "commercial",
    intent: "invest",
    area: "Business Bay",
    bedrooms: null,
    bathrooms: 2,
    size_sqft: 2400,
    price_aed: 5_000_000,
    amenities: ["fitted office", "reception", "server room", "parking", "DEWA included"],
    status: "available",
  },
  {
    title: "Retail Unit in Downtown Dubai Mall Vicinity",
    description:
      "Prime retail unit near Dubai Mall with high foot traffic. Established tenant with long-term lease.",
    property_type: "commercial",
    intent: "invest",
    area: "Downtown Dubai",
    bedrooms: null,
    bathrooms: 1,
    size_sqft: 1200,
    price_aed: 8_500_000,
    amenities: ["existing tenant", "high foot traffic", "near Dubai Mall", "storage"],
    status: "available",
  },
  {
    title: "Commercial Unit for Investment in JVC",
    description:
      "Affordable commercial unit in JVC with 7% projected yield. Suited to retail or clinic use.",
    property_type: "commercial",
    intent: "invest",
    area: "JVC",
    bedrooms: null,
    bathrooms: 1,
    size_sqft: 900,
    price_aed: 2_200_000,
    amenities: ["shell and core", "ground floor", "high ceiling", "parking"],
    status: "available",
  },
];

// ─── Lead seed data ────────────────────────────────────────────────────────────

const leads = [
  {
    full_name: "Ahmed Al Mansoori",
    phone: "+971501234001",
    email: "ahmed.mansoori@email.com",
    nationality: "UAE",
    property_type: "residential",
    intent: "buy",
    budget_aed: 2_000_000,
    preferred_areas: ["Dubai Marina", "JBR"],
    source: "referral",
    status: "qualified",
  },
  {
    full_name: "Priya Nair",
    phone: "+971501234002",
    email: "priya.nair@email.com",
    nationality: "Indian",
    property_type: "residential",
    intent: "rent",
    budget_aed: 90_000,
    preferred_areas: ["JVC", "Dubai Silicon Oasis"],
    source: "website",
    status: "contacted",
  },
  {
    full_name: "James Thornton",
    phone: "+971501234003",
    email: "james.thornton@corp.com",
    nationality: "British",
    property_type: "commercial",
    intent: "invest",
    budget_aed: 6_000_000,
    preferred_areas: ["Business Bay", "DIFC"],
    source: "Instagram",
    status: "new",
  },
  {
    full_name: "Fatima Al Rashid",
    phone: "+971501234004",
    email: null,
    nationality: "UAE",
    property_type: "residential",
    intent: "buy",
    budget_aed: 4_000_000,
    preferred_areas: ["Downtown Dubai", "City Walk"],
    source: "referral",
    status: "negotiating",
  },
  {
    full_name: "Ivan Petrov",
    phone: "+971501234005",
    email: "ivan.petrov@email.com",
    nationality: "Russian",
    property_type: "residential",
    intent: "buy",
    budget_aed: 25_000_000,
    preferred_areas: ["Palm Jumeirah", "Emirates Hills"],
    source: "walk-in",
    status: "qualified",
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting seed...\n");

  // Find or create a seed agent to assign leads to
  const { data: existingAgents } = await supabase
    .from("agents")
    .select("id")
    .limit(1);

  let agentId: string;

  if (existingAgents && existingAgents.length > 0) {
    agentId = existingAgents[0].id;
    console.log(`Using existing agent: ${agentId}`);
  } else {
    const { data: newAgent, error: agentError } = await supabase
      .from("agents")
      .insert({
        slack_user_id: "U_SEED",
        full_name: "Seed Agent",
        email: "seed@kaizen.ae",
        role: "agent",
      })
      .select("id")
      .single();
    if (agentError) throw new Error(`Failed to create agent: ${agentError.message}`);
    agentId = newAgent!.id;
    console.log(`Created seed agent: ${agentId}`);
  }

  // ── Seed properties ──────────────────────────────────────────────────────────
  console.log("\nInserting properties and generating embeddings...");
  let propertyCount = 0;

  for (const prop of properties) {
    const embedText = propertyEmbedText(prop);
    const embedding = await embed(embedText);

    const { data: inserted, error } = await supabase
      .from("properties")
      .insert({
        ...prop,
        listed_by: agentId,
        embedding,
      })
      .select("id, title")
      .single();

    if (error) {
      console.error(`  ✗ ${prop.title}: ${error.message}`);
    } else {
      console.log(`  ✓ ${inserted!.title}`);
      propertyCount++;
    }
  }

  // ── Seed leads ───────────────────────────────────────────────────────────────
  console.log("\nInserting leads and generating embeddings...");
  let leadCount = 0;

  for (const lead of leads) {
    const { data: insertedLead, error: leadError } = await supabase
      .from("leads")
      .insert({
        ...lead,
        assigned_to: agentId,
        last_contacted_at: new Date().toISOString(),
      })
      .select("id, full_name")
      .single();

    if (leadError) {
      console.error(`  ✗ ${lead.full_name}: ${leadError.message}`);
      continue;
    }

    const embedText = leadEmbedText({
      full_name: lead.full_name,
      property_type: lead.property_type,
      intent: lead.intent,
      budget_aed: lead.budget_aed,
      preferred_areas: lead.preferred_areas,
      nationality: lead.nationality,
    });
    const embedding = await embed(embedText);

    const { error: embError } = await supabase.from("lead_embeddings").insert({
      lead_id: insertedLead!.id,
      embedding,
    });

    if (embError) {
      console.error(`  ✗ embedding for ${lead.full_name}: ${embError.message}`);
    } else {
      console.log(`  ✓ ${insertedLead!.full_name}`);
      leadCount++;
    }
  }

  console.log(`\n✅ Seed complete: ${propertyCount} properties, ${leadCount} leads\n`);

  // ── Test query ───────────────────────────────────────────────────────────────
  console.log('🔍 Test query: "2 bedroom apartment in Dubai Marina"\n');

  const testEmbedding = await embed("2 bedroom apartment in Dubai Marina");
  const { data: results, error: rpcError } = await supabase.rpc(
    "match_properties",
    {
      query_embedding: testEmbedding,
      match_count: 5,
      filter_status: "available",
      filter_intent: null,
    },
  );

  if (rpcError) {
    console.error("RPC error:", rpcError.message);
    return;
  }

  console.log("Top 5 results:");
  for (const r of results as Array<{
    title: string;
    area: string;
    bedrooms: number | null;
    price_aed: number;
    similarity: number;
  }>) {
    const beds = r.bedrooms != null ? `${r.bedrooms}BR` : "studio";
    const price = `AED ${(r.price_aed / 1_000_000).toFixed(2)}M`;
    console.log(
      `  ${(r.similarity * 100).toFixed(1)}%  ${r.title}  (${beds}, ${r.area}, ${price})`,
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
