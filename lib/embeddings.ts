import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/** Generate a 1536-dim embedding via text-embedding-3-small. */
export async function embed(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

/** Build the embedding input string for a property record. */
export function propertyEmbedText(p: {
  title: string;
  description?: string | null;
  property_type: string;
  intent: string;
  area: string;
  bedrooms?: number | null;
  size_sqft?: number | null;
  price_aed: number;
  amenities?: string[] | null;
}): string {
  return [
    p.title,
    p.description ?? "",
    p.bedrooms != null ? `${p.bedrooms} bedroom` : "studio",
    `${p.property_type} for ${p.intent}`,
    `in ${p.area}`,
    `AED ${p.price_aed.toLocaleString()}`,
    p.size_sqft ? `${p.size_sqft} sqft` : "",
    (p.amenities ?? []).join(", "),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");
}

/** Build the embedding input string for a lead record. */
export function leadEmbedText(l: {
  full_name: string;
  property_type: string;
  intent: string;
  budget_aed: number;
  preferred_areas: string[];
  nationality?: string | null;
}): string {
  return [
    l.full_name,
    l.nationality ?? "",
    `looking to ${l.intent}`,
    l.property_type,
    `budget AED ${l.budget_aed.toLocaleString()}`,
    `preferred areas: ${l.preferred_areas.join(", ")}`,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");
}
