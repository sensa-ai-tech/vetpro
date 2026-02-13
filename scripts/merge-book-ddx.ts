/**
 * merge-book-ddx.ts
 *
 * Phase 2a+2b: 合併 BOOK DDX 欄位到 VetPro YAML
 *  - 505 個匹配疾病：新增 DDX 欄位（不覆蓋已有欄位）
 *  - 53 個 BOOK-only：建立新 YAML 檔案
 *
 * Usage: pnpm tsx scripts/merge-book-ddx.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const EXTRACTED_DIR = path.join(__dirname, "book-data", "extracted");
const DISEASES_DIR = path.join(__dirname, "..", "data", "diseases");
const DDX_DIR = path.join(__dirname, "..", "data", "ddx");

const dryRun = process.argv.includes("--dry-run");

console.log("=== Phase 2a+2b: Merge BOOK DDX into VetPro YAML ===");
if (dryRun) console.log("DRY RUN — no files will be modified\n");

// ── Load data ──

const matches: MatchResult[] = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "book-vetpro-matches.json"), "utf8")
);

const diseaseInfo: Record<string, DiseaseInfo> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "disease-info.json"), "utf8")
);

const diseaseToSymptoms: Record<string, SymptomLink[]> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "disease-to-symptoms.json"), "utf8")
);

const diseaseToLabs: Record<string, LabLink[]> = JSON.parse(
  fs.readFileSync(path.join(EXTRACTED_DIR, "disease-to-labs.json"), "utf8")
);

// Constants mapping
const BODY_SYSTEM_MAP: Record<string, string> = {
  "內分泌": "endocrine",
  "心血管": "cardiovascular",
  "泌尿": "renal",
  "腎臟/泌尿": "renal",
  "腎臟": "renal",
  "肝膽": "hepatobiliary",
  "消化": "gastrointestinal",
  "呼吸": "respiratory",
  "神經": "neurological",
  "皮膚": "dermatological",
  "血液": "hematological",
  "腫瘤": "oncology",
  "骨科": "musculoskeletal",
  "眼科": "ophthalmological",
  "免疫": "immunological",
  "感染": "infectious",
  "中毒": "toxicology",
  "生殖": "reproductive",
  "耳鼻喉": "otolaryngology",
  "口腔": "dental",
  "行為": "behavioral",
  "代謝": "endocrine",
  "多系統": "multisystemic",
  "創傷": "emergency",
  "營養": "nutritional",
  "其他": "other",
};

// ── Phase 2a: Merge matched diseases ──

let mergedCount = 0;
let newCount = 0;
let skippedCount = 0;

const matchedEntries = matches.filter((m) => m.vetproSlug);
const unmatchedEntries = matches.filter((m) => !m.vetproSlug);

console.log("\n--- Phase 2a: Merging", matchedEntries.length, "matched diseases ---");

for (const match of matchedEntries) {
  const bookInfo = diseaseInfo[match.bookSlug];
  if (!bookInfo) continue;

  const yamlPath = path.join(DISEASES_DIR, `${match.vetproSlug}.yaml`);
  if (!fs.existsSync(yamlPath)) {
    skippedCount++;
    continue;
  }

  const content = fs.readFileSync(yamlPath, "utf8");
  let data: Record<string, unknown>;
  try {
    data = yaml.load(content) as Record<string, unknown>;
  } catch {
    skippedCount++;
    continue;
  }

  let modified = false;

  // Add diagnosticAlgorithm (only if not already present)
  if (!data.diagnosticAlgorithm && bookInfo.diagnosticAlgorithm) {
    data.diagnosticAlgorithm = bookInfo.diagnosticAlgorithm;
    modified = true;
  }

  // Add clinicalPearls
  if (!data.clinicalPearls && bookInfo.pearls?.length) {
    data.clinicalPearls = bookInfo.pearls;
    modified = true;
  }

  // Add monitoringItems
  if (!data.monitoringItems && bookInfo.monitoring?.length) {
    data.monitoringItems = bookInfo.monitoring;
    modified = true;
  }

  // Add associatedSymptoms (from reverse index)
  if (!data.associatedSymptoms) {
    const symptoms = diseaseToSymptoms[match.bookSlug];
    if (symptoms?.length) {
      data.associatedSymptoms = symptoms.map((s) => ({
        symptomId: s.symptomId,
        frequency: s.frequency,
      }));
      modified = true;
    }
  }

  // Add associatedLabFindings (from reverse index)
  if (!data.associatedLabFindings) {
    const labs = diseaseToLabs[match.bookSlug];
    if (labs?.length) {
      data.associatedLabFindings = labs.map((l) => ({
        labId: l.labId,
        frequency: l.frequency,
      }));
      modified = true;
    }
  }

  // Add ddxSource marker
  if (modified && !data.ddxSource) {
    data.ddxSource = "book";
    modified = true;
  }

  if (modified) {
    if (!dryRun) {
      fs.writeFileSync(yamlPath, yaml.dump(data, { lineWidth: 120, noRefs: true }));
    }
    mergedCount++;
  }
}

console.log("  Merged:", mergedCount);
console.log("  Skipped:", skippedCount);

// ── Phase 2b: Create BOOK-only diseases ──

console.log("\n--- Phase 2b: Creating", unmatchedEntries.length, "BOOK-only diseases ---");

for (const entry of unmatchedEntries) {
  const bookInfo = diseaseInfo[entry.bookSlug];
  if (!bookInfo) continue;

  const yamlPath = path.join(DISEASES_DIR, `${entry.bookSlug}.yaml`);

  // Skip if YAML already exists
  if (fs.existsSync(yamlPath)) {
    console.log(`  [skip] ${entry.bookSlug} — YAML already exists`);
    continue;
  }

  // Determine bodySystem from epidemiology category or differentials
  let bodySystem = "other";
  const symptoms = diseaseToSymptoms[entry.bookSlug];
  if (symptoms?.length) {
    // Use most common category
    const categories = symptoms.map((s) => s.category).filter(Boolean);
    const freq: Record<string, number> = {};
    for (const c of categories) {
      freq[c] = (freq[c] || 0) + 1;
    }
    const topCat = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topCat && BODY_SYSTEM_MAP[topCat]) {
      bodySystem = BODY_SYSTEM_MAP[topCat];
    }
  }

  // Parse species
  const speciesArr: Array<{ speciesCommon: string }> = [];
  const speciesText = bookInfo.epidemiology?.species?.toLowerCase() || "";
  if (speciesText.includes("犬") || speciesText.includes("dog")) {
    speciesArr.push({ speciesCommon: "dog" });
  }
  if (speciesText.includes("貓") || speciesText.includes("cat")) {
    speciesArr.push({ speciesCommon: "cat" });
  }
  if (speciesArr.length === 0) {
    speciesArr.push({ speciesCommon: "dog" }, { speciesCommon: "cat" });
  }

  const newYaml: Record<string, unknown> = {
    slug: entry.bookSlug,
    nameEn: bookInfo.en,
    nameZh: bookInfo.zh,
    description: bookInfo.definition?.substring(0, 500) || "",
    bodySystem,
    species: speciesArr,
    etiology: {
      categories: bookInfo.epidemiology?.riskFactors?.length
        ? [{ name: "Risk Factors", examples: bookInfo.epidemiology.riskFactors }]
        : [],
    },
    clinicalSigns: {
      early: bookInfo.clinicalPresentation?.history || [],
      progressive: bookInfo.clinicalPresentation?.physicalExam || [],
    },
    diagnosis: {
      primaryTests: bookInfo.diagnosis?.initialDB || [],
      additional: bookInfo.diagnosis?.advanced || [],
    },
    treatment: {
      principles: bookInfo.treatment?.acute || [],
      general: bookInfo.treatment?.chronic || [],
    },
    prognosis: bookInfo.prognosis || "",
  };

  // Add DDX fields
  if (bookInfo.diagnosticAlgorithm) {
    newYaml.diagnosticAlgorithm = bookInfo.diagnosticAlgorithm;
  }
  if (bookInfo.pearls?.length) {
    newYaml.clinicalPearls = bookInfo.pearls;
  }
  if (bookInfo.monitoring?.length) {
    newYaml.monitoringItems = bookInfo.monitoring;
  }

  const sympLinks = diseaseToSymptoms[entry.bookSlug];
  if (sympLinks?.length) {
    newYaml.associatedSymptoms = sympLinks.map((s) => ({
      symptomId: s.symptomId,
      frequency: s.frequency,
    }));
  }

  const labLinks = diseaseToLabs[entry.bookSlug];
  if (labLinks?.length) {
    newYaml.associatedLabFindings = labLinks.map((l) => ({
      labId: l.labId,
      frequency: l.frequency,
    }));
  }

  newYaml.ddxSource = "book-only";

  if (!dryRun) {
    fs.writeFileSync(yamlPath, yaml.dump(newYaml, { lineWidth: 120, noRefs: true }));
  }
  newCount++;
  console.log(`  [new] ${entry.bookSlug}: ${bookInfo.en}`);
}

console.log("\n=== Phase 2a+2b Complete ===");
console.log("Matched diseases merged:", mergedCount);
console.log("New BOOK-only diseases:", newCount);

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface MatchResult {
  bookSlug: string;
  bookNameEn: string;
  bookNameZh: string;
  vetproSlug: string | null;
  vetproNameEn: string | null;
  matchMethod: string;
  diceScore: number;
}

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

interface SymptomLink {
  symptomId: string;
  species: string;
  frequency: string;
  category: string;
  urgency: string;
  detail: string;
}

interface LabLink {
  labId: string;
  species: string;
  frequency: string;
  category: string;
  urgency: string;
  detail: string;
}
