/**
 * Applies supabase/migrations/003_pgvector_properties.sql via direct pg connection.
 * Run: npx tsx scripts/migrate.ts
 */
import { config } from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/003_pgvector_properties.sql"),
    "utf8",
  );

  // DATABASE_URL uses transaction pooler (port 6543) which doesn't support DDL well.
  // Supabase also exposes a session pooler on port 5432 and direct on port 5432.
  // We swap the pooler port to the direct connection if needed.
  let connString = process.env.DATABASE_URL!;
  // Transaction pooler (port 6543) → session mode port 5432 for DDL
  connString = connString.replace(/:6543\//, ":5432/");

  console.log("Connecting to Supabase Postgres...");
  const client = new Client({ connectionString: connString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected. Running migration...\n");

  await client.query(sql);
  console.log("✅ Migration 003 applied successfully.\n");

  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
