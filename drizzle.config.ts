import { defineConfig } from "drizzle-kit";
import "dotenv/config";

// Migrations run over the DIRECT (non-pooled) connection — DDL doesn't play
// well with Supabase's pgbouncer transaction pooler. Falls back to
// DATABASE_URL so a plain single Postgres URL still works. `generate` (which
// only reads the schema file, no live connection) works fine without either
// set — only `migrate`/`push`/`studio` actually need real credentials.
const migrationUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
