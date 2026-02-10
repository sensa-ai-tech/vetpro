/**
 * 初始化資料庫 + 載入 YAML seed 資料
 *
 * Usage: pnpm run seed
 */
import path from "path";
import { sqlite } from "../src/db";
import { seedDiseases } from "../src/lib/seed";

async function main() {
  console.log("=== VetPro Database Seed ===\n");

  // Create tables (if not exists)
  console.log("Creating tables...");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS diseases (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_en TEXT NOT NULL,
      name_zh TEXT,
      body_system TEXT NOT NULL,
      description TEXT,
      etiology TEXT,
      pathophysiology TEXT,
      clinical_signs TEXT,
      diagnosis TEXT,
      treatment TEXT,
      prognosis TEXT,
      staging_system TEXT,
      emergency_notes TEXT,
      review_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disease_aliases (
      id TEXT PRIMARY KEY,
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en'
    );

    CREATE TABLE IF NOT EXISTS species_affected (
      id TEXT PRIMARY KEY,
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      species_common TEXT NOT NULL,
      species_scientific TEXT,
      prevalence TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS "references" (
      id TEXT PRIMARY KEY,
      pmid TEXT UNIQUE,
      doi TEXT,
      title TEXT NOT NULL,
      authors TEXT,
      journal TEXT,
      year INTEGER,
      source_type TEXT,
      source_org TEXT,
      url TEXT,
      is_open_access INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS disease_references (
      id TEXT PRIMARY KEY,
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      reference_id TEXT NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
      relevance TEXT,
      section TEXT
    );

    CREATE TABLE IF NOT EXISTS ontology_mappings (
      id TEXT PRIMARY KEY,
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      ontology_source TEXT NOT NULL,
      ontology_code TEXT NOT NULL,
      ontology_label TEXT,
      confidence TEXT
    );

    CREATE TABLE IF NOT EXISTS update_logs (
      id TEXT PRIMARY KEY,
      pipeline TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      records_added INTEGER NOT NULL DEFAULT 0,
      records_updated INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      details TEXT
    );
  `);

  // Create FTS5 virtual table for full-text search (standalone, no content table)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS disease_fts USING fts5(
      slug,
      name_en,
      name_zh,
      aliases,
      description,
      clinical_signs
    );
  `);

  console.log("Tables created.\n");

  // Seed diseases from YAML
  const dataDir = path.join(process.cwd(), "data");
  console.log(`Loading disease data from ${dataDir}/diseases/...`);

  const result = await seedDiseases(dataDir);
  console.log(`\nSeed complete: ${result.added} added, ${result.updated} updated`);

  // Rebuild FTS index
  console.log("\nRebuilding full-text search index...");
  rebuildFtsIndex();
  console.log("FTS index rebuilt.");

  console.log("\n=== Done ===");
}

function rebuildFtsIndex() {
  // Clear existing FTS data
  sqlite.exec("DELETE FROM disease_fts;");

  // Re-populate from diseases table + aliases
  const allDiseases = sqlite
    .prepare(
      `SELECT d.slug, d.name_en, d.name_zh, d.description, d.clinical_signs,
              GROUP_CONCAT(da.alias, ', ') as aliases
       FROM diseases d
       LEFT JOIN disease_aliases da ON da.disease_id = d.id
       GROUP BY d.id`
    )
    .all() as Array<{
    slug: string;
    name_en: string;
    name_zh: string | null;
    description: string | null;
    clinical_signs: string | null;
    aliases: string | null;
  }>;

  const insertFts = sqlite.prepare(
    `INSERT INTO disease_fts(slug, name_en, name_zh, aliases, description, clinical_signs)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const d of allDiseases) {
    // Extract text from JSON clinical_signs for FTS
    let clinicalSignsText = "";
    if (d.clinical_signs) {
      try {
        const signs = JSON.parse(d.clinical_signs);
        const allSigns = [
          ...(signs.early || []),
          ...(signs.progressive || []),
          ...(signs.late || []),
        ];
        clinicalSignsText = allSigns.join(", ");
      } catch {
        clinicalSignsText = d.clinical_signs;
      }
    }

    insertFts.run(
      d.slug,
      d.name_en,
      d.name_zh || "",
      d.aliases || "",
      d.description || "",
      clinicalSignsText
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
