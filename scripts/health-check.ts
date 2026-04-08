/**
 * Local DB/vector health check for Kaizen Bot.
 * Run: npx tsx scripts/health-check.ts
 */
import { config } from "dotenv";
import path from "path";
import { Client } from "pg";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

function asInt(value: unknown): number {
  if (typeof value === "number") return value;
  return Number.parseInt(String(value), 10) || 0;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL");
  }

  const parsed = new URL(databaseUrl);
  console.log("DB host:", parsed.hostname);
  console.log("DB port:", parsed.port || "(default)");

  if (!/:6543(?:\/|$)/.test(databaseUrl)) {
    console.warn(
      "WARN: DATABASE_URL is not using Supabase transaction pooler port 6543. Chat SDK state may be unstable.",
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to Postgres.\n");

  const vectorExt = await client.query<{ enabled: boolean }>(
    "select exists(select 1 from pg_extension where extname = 'vector') as enabled",
  );
  const tables = await client.query<{ table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name in ('properties', 'lead_embeddings', 'thread_state')`,
  );
  const functions = await client.query<{ proname: string }>(
    `select proname
     from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('match_properties', 'match_leads')`,
  );

  const propertyCounts = await client.query<{
    total_properties: string;
    embedded_properties: string;
  }>(
    `select
       count(*) as total_properties,
       count(*) filter (where embedding is not null) as embedded_properties
     from properties`,
  );

  const leadCounts = await client.query<{
    total_leads: string;
    embedded_leads: string;
  }>(
    `select
       count(*) as total_leads,
       count(le.lead_id) as embedded_leads
     from leads l
     left join lead_embeddings le on le.lead_id = l.id`,
  );

  const hasVector = Boolean(vectorExt.rows[0]?.enabled);
  const tableSet = new Set(tables.rows.map((row) => row.table_name));
  const functionSet = new Set(functions.rows.map((row) => row.proname));
  const totalProperties = asInt(propertyCounts.rows[0]?.total_properties);
  const embeddedProperties = asInt(
    propertyCounts.rows[0]?.embedded_properties,
  );
  const totalLeads = asInt(leadCounts.rows[0]?.total_leads);
  const embeddedLeads = asInt(leadCounts.rows[0]?.embedded_leads);

  console.log("Checks:");
  console.log("- vector extension:", hasVector ? "OK" : "MISSING");
  console.log(
    "- tables:",
    tableSet.has("properties") &&
      tableSet.has("lead_embeddings") &&
      tableSet.has("thread_state")
      ? "OK"
      : `MISSING (${["properties", "lead_embeddings", "thread_state"].filter((t) => !tableSet.has(t)).join(", ")})`,
  );
  console.log(
    "- RPCs:",
    functionSet.has("match_properties") && functionSet.has("match_leads")
      ? "OK"
      : `MISSING (${["match_properties", "match_leads"].filter((f) => !functionSet.has(f)).join(", ")})`,
  );
  console.log(
    "- properties embeddings:",
    `${embeddedProperties}/${totalProperties}`,
  );
  console.log("- leads embeddings:", `${embeddedLeads}/${totalLeads}`);

  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  if (!hasVector) criticalIssues.push("pgvector extension is not enabled.");
  if (!tableSet.has("properties")) {
    criticalIssues.push("properties table is missing.");
  }
  if (!tableSet.has("lead_embeddings")) {
    criticalIssues.push("lead_embeddings table is missing.");
  }
  if (!functionSet.has("match_properties")) {
    criticalIssues.push("match_properties RPC is missing.");
  }
  if (!functionSet.has("match_leads")) {
    criticalIssues.push("match_leads RPC is missing.");
  }

  if (totalProperties === 0) {
    warnings.push("No properties found. Run the seed script.");
  }
  if (totalProperties > 0 && embeddedProperties === 0) {
    warnings.push(
      "Properties exist but none are embedded. Semantic search will return empty results.",
    );
  }
  if (totalLeads > 0 && embeddedLeads < totalLeads) {
    warnings.push(
      "Some leads are missing embeddings. Lead semantic search can be incomplete.",
    );
  }

  if (criticalIssues.length > 0) {
    console.error("\nCritical issues:");
    for (const issue of criticalIssues) {
      console.error(`- ${issue}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("\nWarnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  await client.end();

  if (criticalIssues.length > 0) {
    process.exit(1);
  }

  console.log("\nHealth check passed.");
}

main().catch((error) => {
  console.error("Health check failed:", error.message);
  process.exit(1);
});
