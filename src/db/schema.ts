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
  diagnosticAlgorithm: text("diagnostic_algorithm"), // JSON string
  clinicalPearls: text("clinical_pearls"), // JSON string
  monitoringItems: text("monitoring_items"), // JSON string
  ddxSource: text("ddx_source"), // book | auto-generated | book-only
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

// === 症狀定義表 ===
export const symptoms = sqliteTable("symptoms", {
  id: text("id").primaryKey(), // e.g., "vomiting"
  zhName: text("zh_name").notNull(),
  enName: text("en_name").notNull(),
  section: text("section"), // e.g., "1.2"
  sectionName: text("section_name"), // e.g., "消化道／腹腔"
  description: text("description"),
});

// === 症狀-疾病關聯表（DDX 核心） ===
export const symptomDiseases = sqliteTable("symptom_diseases", {
  id: text("id").primaryKey(),
  symptomId: text("symptom_id")
    .notNull()
    .references(() => symptoms.id),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  species: text("species").default("both"), // dog | cat | both
  frequency: text("frequency").default("uncommon"), // common | uncommon | rare
  category: text("category"), // 內分泌 | 感染 | 腫瘤 | ...
  urgency: text("urgency").default("semi-urgent"), // emergency | urgent | semi-urgent | non-urgent
  detail: text("detail"),
});

// === 實驗室指標表 ===
export const labFindings = sqliteTable("lab_findings", {
  id: text("id").primaryKey(), // e.g., "azotaemia"
  zhName: text("zh_name").notNull(),
  enName: text("en_name").notNull(),
  category: text("category"), // 血液學 | 生化 | 凝血 | ...
});

// === 實驗室-疾病關聯表 ===
export const labDiseases = sqliteTable("lab_diseases", {
  id: text("id").primaryKey(),
  labId: text("lab_id")
    .notNull()
    .references(() => labFindings.id),
  diseaseId: text("disease_id")
    .notNull()
    .references(() => diseases.id, { onDelete: "cascade" }),
  species: text("species").default("both"),
  frequency: text("frequency").default("uncommon"),
  category: text("category"),
  urgency: text("urgency").default("semi-urgent"),
  detail: text("detail"),
});

// === 症狀-實驗室交叉連結 ===
export const symptomLabs = sqliteTable("symptom_labs", {
  id: text("id").primaryKey(),
  symptomId: text("symptom_id")
    .notNull()
    .references(() => symptoms.id),
  labId: text("lab_id")
    .notNull()
    .references(() => labFindings.id),
});

// === 症狀間關聯 ===
export const relatedSymptoms = sqliteTable("related_symptoms", {
  id: text("id").primaryKey(),
  symptomId: text("symptom_id")
    .notNull()
    .references(() => symptoms.id),
  relatedSymptomId: text("related_symptom_id")
    .notNull()
    .references(() => symptoms.id),
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
