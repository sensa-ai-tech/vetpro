import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// === 疾病主表 ===
export const diseases = sqliteTable("diseases", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh"),
  bodySystem: text("body_system").notNull(),
  description: text("description"),
  etiology: text("etiology"), // JSON string
  pathophysiology: text("pathophysiology"),
  clinicalSigns: text("clinical_signs"), // JSON string
  diagnosis: text("diagnosis"), // JSON string
  treatment: text("treatment"), // JSON string
  prognosis: text("prognosis"),
  stagingSystem: text("staging_system"), // JSON string
  emergencyNotes: text("emergency_notes"),
  reviewStatus: text("review_status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

// === 疾病別名 ===
export const diseaseAliases = sqliteTable("disease_aliases", {
  id: text("id").primaryKey(),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  language: text("language").notNull().default("en"),
});

// === 受影響物種 ===
export const speciesAffected = sqliteTable("species_affected", {
  id: text("id").primaryKey(),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  speciesCommon: text("species_common").notNull(),
  speciesScientific: text("species_scientific"),
  prevalence: text("prevalence"),
  notes: text("notes"),
});

// === 文獻參考 ===
export const references = sqliteTable("references", {
  id: text("id").primaryKey(),
  pmid: text("pmid").unique(),
  doi: text("doi"),
  title: text("title").notNull(),
  authors: text("authors"), // JSON string
  journal: text("journal"),
  year: integer("year"),
  sourceType: text("source_type"), // pubmed | guideline | consensus
  sourceOrg: text("source_org"), // ACVIM | WSAVA | IRIS | ...
  url: text("url"),
  isOpenAccess: integer("is_open_access").notNull().default(0),
  fetchedAt: text("fetched_at"),
});

// === 疾病-文獻關聯 ===
export const diseaseReferences = sqliteTable("disease_references", {
  id: text("id").primaryKey(),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  referenceId: text("reference_id")
    .notNull()
    .references(() => references.id, { onDelete: "cascade" }),
  relevance: text("relevance"), // primary | supporting | background
  section: text("section"), // etiology | diagnosis | treatment | ...
});

// === Ontology 映射 ===
export const ontologyMappings = sqliteTable("ontology_mappings", {
  id: text("id").primaryKey(),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  ontologySource: text("ontology_source").notNull(), // MONDO | SNOMED_VET | DOID
  ontologyCode: text("ontology_code").notNull(),
  ontologyLabel: text("ontology_label"),
  confidence: text("confidence"), // exact | broad | narrow
});

// === 更新日誌 ===
export const updateLogs = sqliteTable("update_logs", {
  id: text("id").primaryKey(),
  pipeline: text("pipeline").notNull(), // pubmed | ontology | links
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  recordsAdded: integer("records_added").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  status: text("status").notNull(), // success | partial | failed
  details: text("details"), // JSON string
});
