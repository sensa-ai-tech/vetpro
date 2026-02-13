/**
 * extract-book-data.ts
 *
 * Phase 1a: 從 BOOK HTML 提取所有 DDX 資料結構
 * 輸出：scripts/book-data/ 下的 JSON 檔案
 *
 * Usage: pnpm tsx scripts/extract-book-data.ts
 */

import fs from "fs";
import path from "path";

const HTML_PATH = path.join(
  __dirname,
  "book-data",
  "book-ddx",
  "BOOK",
  "vet-differential-diagnosis-v2.html"
);

const OUT_DIR = path.join(__dirname, "book-data", "extracted");

// ── Step 1: 讀取 HTML 並提取 <script> 區塊 ──

console.log("=== BOOK Data Extraction ===\n");

const html = fs.readFileSync(HTML_PATH, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error("No <script> block found in HTML");
}
const script = scriptMatch[1];

console.log("HTML file loaded:", (html.length / 1024 / 1024).toFixed(1), "MB");
console.log("Script block length:", script.length, "chars");

// ── Step 2: 定位各資料結構的起始位置 ──

const diStart = script.indexOf("const DISEASE_INFO = {");
const relSympStart = script.indexOf("const RELATED_SYMPTOMS = {");
const labDbStart = script.indexOf("const LAB_DB = { abnormalities:");
const symptomLabStart = script.indexOf("const SYMPTOM_LAB_LINKS");
const dbStart = script.indexOf("const DB = { symptoms:");
const ageBiasStart = script.indexOf("const AGE_BIAS = {");
const appStateStart = script.indexOf("const state = {");

console.log("\nData structure positions:");
console.log("  DISEASE_INFO:", diStart);
console.log("  RELATED_SYMPTOMS:", relSympStart);
console.log("  LAB_DB:", labDbStart);
console.log("  SYMPTOM_LAB_LINKS:", symptomLabStart);
console.log("  DB:", dbStart);
console.log("  AGE_BIAS:", ageBiasStart);
console.log("  App state (end marker):", appStateStart);

if (
  diStart < 0 ||
  relSympStart < 0 ||
  labDbStart < 0 ||
  dbStart < 0 ||
  ageBiasStart < 0
) {
  throw new Error("Failed to locate one or more data structures");
}

// ── Step 3: 用 new Function() 提取各物件 ──

console.log("\nExtracting data structures...");

// DISEASE_INFO
const DISEASE_INFO = new Function(
  script.substring(diStart, relSympStart) + "\nreturn DISEASE_INFO;"
)() as Record<string, DiseaseInfo>;
console.log("  DISEASE_INFO:", Object.keys(DISEASE_INFO).length, "diseases");

// RELATED_SYMPTOMS
const RELATED_SYMPTOMS = new Function(
  script.substring(relSympStart, labDbStart) + "\nreturn RELATED_SYMPTOMS;"
)() as Record<string, string[]>;
console.log(
  "  RELATED_SYMPTOMS:",
  Object.keys(RELATED_SYMPTOMS).length,
  "symptoms"
);

// LAB_DB
const LAB_DB = new Function(
  script.substring(labDbStart, symptomLabStart) + "\nreturn LAB_DB;"
)() as { abnormalities: LabFinding[] };
console.log("  LAB_DB:", LAB_DB.abnormalities.length, "lab findings");

// SYMPTOM_LAB_LINKS
const SYMPTOM_LAB_LINKS = new Function(
  script.substring(symptomLabStart, dbStart) + "\nreturn SYMPTOM_LAB_LINKS;"
)() as Record<string, string[]>;
console.log(
  "  SYMPTOM_LAB_LINKS:",
  Object.keys(SYMPTOM_LAB_LINKS).length,
  "mappings"
);

// DB (symptoms)
const DB = new Function(
  script.substring(dbStart, ageBiasStart) + "\nreturn DB;"
)() as { symptoms: Symptom[] };
console.log("  DB.symptoms:", DB.symptoms.length, "symptoms");

// AGE_BIAS
const AGE_BIAS = new Function(
  script.substring(ageBiasStart, appStateStart) + "\nreturn AGE_BIAS;"
)() as Record<string, string>;
console.log("  AGE_BIAS:", Object.keys(AGE_BIAS).length, "entries");

// ── Step 4: 建立反向索引 ──

console.log("\nBuilding reverse indexes...");

// disease → [symptomId] 反向索引
const diseaseToSymptoms: Record<
  string,
  Array<{
    symptomId: string;
    species: string;
    frequency: string;
    category: string;
    urgency: string;
    detail: string;
  }>
> = {};

for (const symptom of DB.symptoms) {
  for (const diff of symptom.differentials) {
    // 嘗試匹配到 DISEASE_INFO 的 key
    const matchKey = findDiseaseKey(diff.en, diff.zh);
    if (matchKey) {
      if (!diseaseToSymptoms[matchKey]) diseaseToSymptoms[matchKey] = [];
      diseaseToSymptoms[matchKey].push({
        symptomId: symptom.id,
        species: diff.species || "both",
        frequency: diff.freq || "uncommon",
        category: diff.category || "",
        urgency: diff.urgency || "semi-urgent",
        detail: diff.detail || "",
      });
    }
  }
}
console.log(
  "  Disease→Symptoms reverse index:",
  Object.keys(diseaseToSymptoms).length,
  "diseases with symptom links"
);

// disease → [labId] 反向索引
const diseaseToLabs: Record<
  string,
  Array<{
    labId: string;
    species: string;
    frequency: string;
    category: string;
    urgency: string;
    detail: string;
  }>
> = {};

for (const lab of LAB_DB.abnormalities) {
  for (const diff of lab.differentials) {
    const matchKey = findDiseaseKey(diff.en, diff.zh);
    if (matchKey) {
      if (!diseaseToLabs[matchKey]) diseaseToLabs[matchKey] = [];
      diseaseToLabs[matchKey].push({
        labId: lab.id,
        species: diff.species || "both",
        frequency: diff.freq || "uncommon",
        category: diff.category || "",
        urgency: diff.urgency || "semi-urgent",
        detail: diff.detail || "",
      });
    }
  }
}
console.log(
  "  Disease→Labs reverse index:",
  Object.keys(diseaseToLabs).length,
  "diseases with lab links"
);

// ── Step 5: 統計與輸出 ──

fs.mkdirSync(OUT_DIR, { recursive: true });

// 5a. 症狀定義 (symptoms.json)
const symptoms = DB.symptoms.map((s) => ({
  id: s.id,
  zhName: s.zhName,
  enName: s.enName,
  section: s.section,
  sectionName: s.sectionName,
  description: s.description,
  differentialCount: s.differentials.length,
}));
fs.writeFileSync(
  path.join(OUT_DIR, "symptoms.json"),
  JSON.stringify(symptoms, null, 2)
);
console.log("\n  → symptoms.json:", symptoms.length, "symptoms");

// 5b. 實驗室指標定義 (lab-findings.json)
const labFindings = LAB_DB.abnormalities.map((l) => ({
  id: l.id,
  zhName: l.zhName,
  enName: l.enName,
  category: l.category,
  differentialCount: l.differentials.length,
}));
fs.writeFileSync(
  path.join(OUT_DIR, "lab-findings.json"),
  JSON.stringify(labFindings, null, 2)
);
console.log("  → lab-findings.json:", labFindings.length, "lab findings");

// 5c. 疾病完整資料 (disease-info.json)
fs.writeFileSync(
  path.join(OUT_DIR, "disease-info.json"),
  JSON.stringify(DISEASE_INFO, null, 2)
);
console.log(
  "  → disease-info.json:",
  Object.keys(DISEASE_INFO).length,
  "diseases"
);

// 5d. 症狀-疾病關聯表 (symptom-disease-links.json)
// 扁平化：每筆 = { symptomId, diseaseSlug, ... }
const symptomDiseaseLinks: Array<{
  symptomId: string;
  diseaseSlug: string;
  species: string;
  frequency: string;
  category: string;
  urgency: string;
  detail: string;
  workup: string[];
}> = [];

for (const symptom of DB.symptoms) {
  for (const diff of symptom.differentials) {
    const matchKey = findDiseaseKey(diff.en, diff.zh);
    symptomDiseaseLinks.push({
      symptomId: symptom.id,
      diseaseSlug: matchKey || slugify(diff.en),
      species: diff.species || "both",
      frequency: diff.freq || "uncommon",
      category: diff.category || "",
      urgency: diff.urgency || "semi-urgent",
      detail: diff.detail || "",
      workup: diff.workup || [],
    });
  }
}
fs.writeFileSync(
  path.join(OUT_DIR, "symptom-disease-links.json"),
  JSON.stringify(symptomDiseaseLinks, null, 2)
);
console.log(
  "  → symptom-disease-links.json:",
  symptomDiseaseLinks.length,
  "links"
);

// 5e. 實驗室-疾病關聯表 (lab-disease-links.json)
const labDiseaseLinks: Array<{
  labId: string;
  diseaseSlug: string;
  species: string;
  frequency: string;
  category: string;
  urgency: string;
  detail: string;
  workup: string[];
}> = [];

for (const lab of LAB_DB.abnormalities) {
  for (const diff of lab.differentials) {
    const matchKey = findDiseaseKey(diff.en, diff.zh);
    labDiseaseLinks.push({
      labId: lab.id,
      diseaseSlug: matchKey || slugify(diff.en),
      species: diff.species || "both",
      frequency: diff.freq || "uncommon",
      category: diff.category || "",
      urgency: diff.urgency || "semi-urgent",
      detail: diff.detail || "",
      workup: diff.workup || [],
    });
  }
}
fs.writeFileSync(
  path.join(OUT_DIR, "lab-disease-links.json"),
  JSON.stringify(labDiseaseLinks, null, 2)
);
console.log("  → lab-disease-links.json:", labDiseaseLinks.length, "links");

// 5f. 關聯症狀 (related-symptoms.json)
fs.writeFileSync(
  path.join(OUT_DIR, "related-symptoms.json"),
  JSON.stringify(RELATED_SYMPTOMS, null, 2)
);
console.log(
  "  → related-symptoms.json:",
  Object.keys(RELATED_SYMPTOMS).length,
  "entries"
);

// 5g. 症狀-實驗室連結 (symptom-lab-links.json)
fs.writeFileSync(
  path.join(OUT_DIR, "symptom-lab-links.json"),
  JSON.stringify(SYMPTOM_LAB_LINKS, null, 2)
);
console.log(
  "  → symptom-lab-links.json:",
  Object.keys(SYMPTOM_LAB_LINKS).length,
  "entries"
);

// 5h. 年齡偏向 (age-bias.json)
fs.writeFileSync(
  path.join(OUT_DIR, "age-bias.json"),
  JSON.stringify(AGE_BIAS, null, 2)
);
console.log("  → age-bias.json:", Object.keys(AGE_BIAS).length, "entries");

// 5i. 反向索引 (disease-to-symptoms.json, disease-to-labs.json)
fs.writeFileSync(
  path.join(OUT_DIR, "disease-to-symptoms.json"),
  JSON.stringify(diseaseToSymptoms, null, 2)
);
fs.writeFileSync(
  path.join(OUT_DIR, "disease-to-labs.json"),
  JSON.stringify(diseaseToLabs, null, 2)
);

// ── Final stats ──
console.log("\n=== Extraction Complete ===");
console.log("Diseases:", Object.keys(DISEASE_INFO).length);
console.log("Symptoms:", DB.symptoms.length);
console.log("Lab findings:", LAB_DB.abnormalities.length);
console.log("Symptom-disease links:", symptomDiseaseLinks.length);
console.log("Lab-disease links:", labDiseaseLinks.length);
console.log("Output directory:", OUT_DIR);

// ═══════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// 在 DISEASE_INFO 中查找匹配的 key
function findDiseaseKey(
  enName: string,
  zhName: string
): string | undefined {
  // 1. 精確 slug 匹配
  const slug = slugify(enName);
  if (DISEASE_INFO[slug]) return slug;

  // 2. 在 synonyms 中尋找
  for (const [key, info] of Object.entries(DISEASE_INFO)) {
    if (info.synonyms?.some((s: string) => slugify(s) === slug)) return key;
    if (info.zh === zhName) return key;
    if (info.en === enName) return key;
    // 模糊匹配：核心部分
    const enLower = enName.toLowerCase();
    const keyLower = key.toLowerCase().replace(/-/g, " ");
    if (enLower.includes(keyLower) || keyLower.includes(enLower.replace(/[()]/g, "").trim())) {
      return key;
    }
  }

  return undefined;
}

// ═══════════════════════════════════════
// Type definitions
// ═══════════════════════════════════════

interface DiseaseInfo {
  zh: string;
  en: string;
  definition: string;
  synonyms?: string[];
  epidemiology?: {
    species: string;
    age?: string;
    sex?: string;
    riskFactors?: string[];
  };
  clinicalPresentation?: {
    history?: string[];
    physicalExam?: string[];
  };
  pathophysiology?: string;
  diagnosis?: {
    overview?: string;
    differentials?: string[];
    initialDB?: string[];
    advanced?: string[];
  };
  treatment?: {
    overview?: string;
    acute?: string[];
    chronic?: string[];
  };
  prognosis?: string;
  pearls?: string[];
  diagnosticAlgorithm?: {
    title: string;
    steps: Array<{
      step: number;
      action: string;
      details: string;
      findings: string[];
    }>;
  };
  monitoring?: string[];
  reference?: string;
}

interface Symptom {
  id: string;
  zhName: string;
  enName: string;
  section: string;
  sectionName: string;
  description: string;
  differentials: Differential[];
}

interface Differential {
  zh: string;
  en: string;
  species?: string;
  freq?: string;
  category?: string;
  urgency?: string;
  detail?: string;
  workup?: string[];
}

interface LabFinding {
  id: string;
  zhName: string;
  enName: string;
  category: string;
  differentials: Differential[];
}
