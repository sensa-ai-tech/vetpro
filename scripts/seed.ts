/**
 * 初始化資料庫 + 載入 YAML seed 資料
 *
 * Usage: pnpm run seed
 *
 * 注意：先刪除舊 DB 再動態 import，確保乾淨狀態
 */
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import { nanoid } from "nanoid";

// 刪除舊的 DB 檔案（避免 Vercel build cache 的 readonly 問題）
const DB_PATH = path.join(process.cwd(), "vetpro.db");
for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) {
  if (fs.existsSync(f)) {
    try {
      fs.unlinkSync(f);
      console.log(`Removed old DB file: ${path.basename(f)}`);
    } catch (err) {
      console.warn(`Warning: Could not remove ${path.basename(f)}:`, err);
    }
  }
}

async function main() {
  // 動態 import：此時 DB 已被刪除，src/db/index.ts 會建立新的
  const { sqlite } = await import("../src/db");
  const { seedDiseases } = await import("../src/lib/seed");

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
      diagnostic_algorithm TEXT,
      clinical_pearls TEXT,
      monitoring_items TEXT,
      ddx_source TEXT,
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

    -- DDX tables
    CREATE TABLE IF NOT EXISTS symptoms (
      id TEXT PRIMARY KEY,
      zh_name TEXT NOT NULL,
      en_name TEXT NOT NULL,
      section TEXT,
      section_name TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS symptom_diseases (
      id TEXT PRIMARY KEY,
      symptom_id TEXT NOT NULL REFERENCES symptoms(id),
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      species TEXT DEFAULT 'both',
      frequency TEXT DEFAULT 'uncommon',
      category TEXT,
      urgency TEXT DEFAULT 'semi-urgent',
      detail TEXT
    );

    CREATE TABLE IF NOT EXISTS lab_findings (
      id TEXT PRIMARY KEY,
      zh_name TEXT NOT NULL,
      en_name TEXT NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS lab_diseases (
      id TEXT PRIMARY KEY,
      lab_id TEXT NOT NULL REFERENCES lab_findings(id),
      disease_id TEXT NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
      species TEXT DEFAULT 'both',
      frequency TEXT DEFAULT 'uncommon',
      category TEXT,
      urgency TEXT DEFAULT 'semi-urgent',
      detail TEXT
    );

    CREATE TABLE IF NOT EXISTS symptom_labs (
      id TEXT PRIMARY KEY,
      symptom_id TEXT NOT NULL REFERENCES symptoms(id),
      lab_id TEXT NOT NULL REFERENCES lab_findings(id)
    );

    CREATE TABLE IF NOT EXISTS related_symptoms (
      id TEXT PRIMARY KEY,
      symptom_id TEXT NOT NULL REFERENCES symptoms(id),
      related_symptom_id TEXT NOT NULL REFERENCES symptoms(id)
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
  rebuildFtsIndex(sqlite);
  console.log("FTS index rebuilt.");

  // Seed DDX data (symptoms, lab findings, links)
  console.log("\nSeeding DDX data...");
  seedDdxData(sqlite, dataDir);
  console.log("DDX data seeded.");

  // 切換到 DELETE journal mode（非 WAL）
  // WAL mode 的 DB 在 readonly filesystem 上無法打開（需要 -wal/-shm 檔案）
  // DELETE mode 則不需要額外檔案，適合 Vercel serverless 的唯讀環境
  sqlite.pragma("journal_mode = DELETE");
  console.log("Switched to DELETE journal mode for serverless compatibility.");

  sqlite.close();
  console.log("\n=== Done ===");
}

function rebuildFtsIndex(sqlite: import("better-sqlite3").Database) {
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

function seedDdxData(sqlite: import("better-sqlite3").Database, dataDir: string) {
  const ddxDir = path.join(dataDir, "ddx");
  if (!fs.existsSync(ddxDir)) {
    console.log("  No DDX data directory found, skipping.");
    return;
  }

  // 1. Load and insert symptoms
  const symptomsFile = path.join(ddxDir, "symptoms.yaml");
  if (fs.existsSync(symptomsFile)) {
    const symptoms = yaml.load(fs.readFileSync(symptomsFile, "utf8")) as Array<{
      id: string;
      zhName: string;
      enName: string;
      section?: string;
      sectionName?: string;
      description?: string;
    }>;

    const insertSymptom = sqlite.prepare(
      `INSERT OR REPLACE INTO symptoms (id, zh_name, en_name, section, section_name, description) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const s of symptoms) {
      insertSymptom.run(s.id, s.zhName, s.enName, s.section || null, s.sectionName || null, s.description || null);
    }
    console.log(`  Symptoms: ${symptoms.length}`);
  }

  // 2. Load and insert lab findings
  const labFile = path.join(ddxDir, "lab-findings.yaml");
  if (fs.existsSync(labFile)) {
    const labs = yaml.load(fs.readFileSync(labFile, "utf8")) as Array<{
      id: string;
      zhName: string;
      enName: string;
      category?: string;
    }>;

    const insertLab = sqlite.prepare(
      `INSERT OR REPLACE INTO lab_findings (id, zh_name, en_name, category) VALUES (?, ?, ?, ?)`
    );
    for (const l of labs) {
      insertLab.run(l.id, l.zhName, l.enName, l.category || null);
    }
    console.log(`  Lab findings: ${labs.length}`);
  }

  // 3. Load and insert related symptoms (with FK validation)
  const relFile = path.join(ddxDir, "related-symptoms.yaml");
  if (fs.existsSync(relFile)) {
    const validSymIds = new Set<string>(
      (sqlite.prepare("SELECT id FROM symptoms").all() as Array<{ id: string }>).map((r) => r.id)
    );
    const relatedSymptoms = yaml.load(fs.readFileSync(relFile, "utf8")) as Record<string, string[]>;
    const insertRel = sqlite.prepare(
      `INSERT OR REPLACE INTO related_symptoms (id, symptom_id, related_symptom_id) VALUES (?, ?, ?)`
    );
    let relCount = 0;
    for (const [symptomId, relatedIds] of Object.entries(relatedSymptoms)) {
      if (!validSymIds.has(symptomId)) continue;
      for (const relId of relatedIds) {
        if (!validSymIds.has(relId)) continue;
        insertRel.run(`${symptomId}:${relId}`, symptomId, relId);
        relCount++;
      }
    }
    console.log(`  Related symptoms: ${relCount} pairs`);
  }

  // 4. Load and insert symptom-lab links (with FK validation)
  const slFile = path.join(ddxDir, "symptom-lab-links.yaml");
  if (fs.existsSync(slFile)) {
    // Get valid IDs for FK validation
    const validSymptomIds = new Set<string>(
      (sqlite.prepare("SELECT id FROM symptoms").all() as Array<{ id: string }>).map((r) => r.id)
    );
    const validLabIds = new Set<string>(
      (sqlite.prepare("SELECT id FROM lab_findings").all() as Array<{ id: string }>).map((r) => r.id)
    );

    const symptomLabs = yaml.load(fs.readFileSync(slFile, "utf8")) as Record<string, string[]>;
    const insertSL = sqlite.prepare(
      `INSERT OR REPLACE INTO symptom_labs (id, symptom_id, lab_id) VALUES (?, ?, ?)`
    );
    let slCount = 0;
    let skipped = 0;
    for (const [symptomId, labIds] of Object.entries(symptomLabs)) {
      if (!validSymptomIds.has(symptomId)) { skipped++; continue; }
      for (const labId of labIds) {
        if (!validLabIds.has(labId)) { skipped++; continue; }
        insertSL.run(`${symptomId}:${labId}`, symptomId, labId);
        slCount++;
      }
    }
    console.log(`  Symptom-lab links: ${slCount} (${skipped} skipped — FK mismatch)`);
  }

  // 5. Build symptom_diseases from BOOK extracted data
  const symptomLinksFile = path.join(process.cwd(), "scripts", "book-data", "extracted", "symptom-disease-links.json");
  if (fs.existsSync(symptomLinksFile)) {
    const links = JSON.parse(fs.readFileSync(symptomLinksFile, "utf8")) as Array<{
      symptomId: string;
      diseaseSlug: string;
      species: string;
      frequency: string;
      category: string;
      urgency: string;
      detail: string;
    }>;

    // Get disease slug→id map
    const slugToId = new Map<string, string>();
    const allDiseases = sqlite.prepare("SELECT id, slug FROM diseases").all() as Array<{ id: string; slug: string }>;
    for (const d of allDiseases) slugToId.set(d.slug, d.id);

    // Get valid symptom ids
    const symptomIds = new Set<string>();
    const allSymptoms = sqlite.prepare("SELECT id FROM symptoms").all() as Array<{ id: string }>;
    for (const s of allSymptoms) symptomIds.add(s.id);

    const insertSD = sqlite.prepare(
      `INSERT OR REPLACE INTO symptom_diseases (id, symptom_id, disease_id, species, frequency, category, urgency, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let sdCount = 0;
    const seen = new Set<string>();
    for (const link of links) {
      const diseaseId = slugToId.get(link.diseaseSlug);
      if (!diseaseId || !symptomIds.has(link.symptomId)) continue;
      const key = `${link.symptomId}:${link.diseaseSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      insertSD.run(
        nanoid(),
        link.symptomId,
        diseaseId,
        link.species || "both",
        link.frequency || "uncommon",
        link.category || null,
        link.urgency || "semi-urgent",
        link.detail || null
      );
      sdCount++;
    }

    // Also add from YAML associatedSymptoms (auto-generated + book-merged)
    const yamlFiles = fs.readdirSync(path.join(dataDir, "diseases")).filter((f) => f.endsWith(".yaml"));
    for (const file of yamlFiles) {
      try {
        const data = yaml.load(
          fs.readFileSync(path.join(dataDir, "diseases", file), "utf8")
        ) as Record<string, unknown>;
        if (!data?.slug) continue;

        const assoc = data.associatedSymptoms as Array<{
          symptomId: string;
          frequency?: string;
        }> | undefined;
        if (!assoc?.length) continue;

        const diseaseId = slugToId.get(data.slug as string);
        if (!diseaseId) continue;

        for (const a of assoc) {
          if (!symptomIds.has(a.symptomId)) continue;
          const key = `${a.symptomId}:${data.slug}`;
          if (seen.has(key)) continue;
          seen.add(key);

          insertSD.run(
            nanoid(),
            a.symptomId,
            diseaseId,
            "both",
            a.frequency || "uncommon",
            null,
            "semi-urgent",
            null
          );
          sdCount++;
        }
      } catch {
        // skip
      }
    }

    console.log(`  Symptom-disease links: ${sdCount}`);
  }

  // 6. Build lab_diseases from BOOK extracted data
  const labLinksFile = path.join(process.cwd(), "scripts", "book-data", "extracted", "lab-disease-links.json");
  if (fs.existsSync(labLinksFile)) {
    const links = JSON.parse(fs.readFileSync(labLinksFile, "utf8")) as Array<{
      labId: string;
      diseaseSlug: string;
      species: string;
      frequency: string;
      category: string;
      urgency: string;
      detail: string;
    }>;

    const slugToId = new Map<string, string>();
    const allDiseases = sqlite.prepare("SELECT id, slug FROM diseases").all() as Array<{ id: string; slug: string }>;
    for (const d of allDiseases) slugToId.set(d.slug, d.id);

    const labIds = new Set<string>();
    const allLabs = sqlite.prepare("SELECT id FROM lab_findings").all() as Array<{ id: string }>;
    for (const l of allLabs) labIds.add(l.id);

    const insertLD = sqlite.prepare(
      `INSERT OR REPLACE INTO lab_diseases (id, lab_id, disease_id, species, frequency, category, urgency, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let ldCount = 0;
    const seen = new Set<string>();
    for (const link of links) {
      const diseaseId = slugToId.get(link.diseaseSlug);
      if (!diseaseId || !labIds.has(link.labId)) continue;
      const key = `${link.labId}:${link.diseaseSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      insertLD.run(
        nanoid(),
        link.labId,
        diseaseId,
        link.species || "both",
        link.frequency || "uncommon",
        link.category || null,
        link.urgency || "semi-urgent",
        link.detail || null
      );
      ldCount++;
    }
    console.log(`  Lab-disease links: ${ldCount}`);
  }

  // 7. Create symptom FTS index
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS symptom_fts USING fts5(
      id, zh_name, en_name, description
    );
    DELETE FROM symptom_fts;
  `);

  const allSymptoms = sqlite.prepare("SELECT id, zh_name, en_name, description FROM symptoms").all() as Array<{
    id: string;
    zh_name: string;
    en_name: string;
    description: string | null;
  }>;

  const insertSymFts = sqlite.prepare(
    "INSERT INTO symptom_fts (id, zh_name, en_name, description) VALUES (?, ?, ?, ?)"
  );
  for (const s of allSymptoms) {
    insertSymFts.run(s.id, s.zh_name, s.en_name, s.description || "");
  }
  console.log(`  Symptom FTS: ${allSymptoms.length} entries`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
