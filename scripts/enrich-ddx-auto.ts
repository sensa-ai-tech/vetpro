/**
 * enrich-ddx-auto.ts
 *
 * Phase 2c: 為 VetPro-only 疾病自動生成 DDX 欄位
 *  - 用 KEYWORD_TO_SYMPTOM 掃描 clinicalSigns 產生 associatedSymptoms
 *  - 用模板生成 diagnosticAlgorithm
 *  - 標記 ddxSource: "auto-generated"
 *
 * Usage: pnpm tsx scripts/enrich-ddx-auto.ts [--dry-run]
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const DISEASES_DIR = path.join(__dirname, "..", "data", "diseases");
const DDX_DIR = path.join(__dirname, "..", "data", "ddx");

const dryRun = process.argv.includes("--dry-run");

console.log("=== Phase 2c: Auto-generate DDX for VetPro-only diseases ===");
if (dryRun) console.log("DRY RUN\n");

// ── Load keyword mapping ──
const KEYWORD_TO_SYMPTOM: Record<string, string> = yaml.load(
  fs.readFileSync(path.join(DDX_DIR, "keyword-to-symptom.yaml"), "utf8")
) as Record<string, string>;

const keywords = Object.entries(KEYWORD_TO_SYMPTOM)
  // Sort by keyword length descending (match longer phrases first)
  .sort((a, b) => b[0].length - a[0].length);

console.log("Loaded", keywords.length, "keyword mappings\n");

// ── Process each YAML ──

const files = fs.readdirSync(DISEASES_DIR).filter((f) => f.endsWith(".yaml"));
let enrichedCount = 0;
let alreadyHasCount = 0;
let noMatchCount = 0;

for (const file of files) {
  const filePath = path.join(DISEASES_DIR, file);
  let data: Record<string, unknown>;
  try {
    data = yaml.load(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    continue;
  }

  if (!data?.slug) continue;

  // Skip if already has DDX fields
  if (data.ddxSource || data.associatedSymptoms) {
    alreadyHasCount++;
    continue;
  }

  // Collect all text to scan for keywords
  const textsToScan: string[] = [];

  // clinicalSigns
  const cs = data.clinicalSigns as Record<string, unknown> | undefined;
  if (cs) {
    for (const key of ["early", "progressive", "late", "common"]) {
      const arr = cs[key] as string[] | undefined;
      if (Array.isArray(arr)) {
        textsToScan.push(...arr.filter((s) => typeof s === "string"));
      }
    }
  }

  // description
  if (typeof data.description === "string") {
    textsToScan.push(data.description);
  }

  // nameZh
  if (typeof data.nameZh === "string") {
    textsToScan.push(data.nameZh);
  }

  // diagnosis.differentialDiagnoses (may have strings inside)
  const diag = data.diagnosis as Record<string, unknown> | undefined;
  if (diag) {
    const tests = diag.primaryTests as string[] | undefined;
    if (Array.isArray(tests)) {
      textsToScan.push(...tests.filter((s) => typeof s === "string"));
    }
  }

  // treatment info
  const treatment = data.treatment as Record<string, unknown> | undefined;
  if (treatment) {
    const principles = treatment.principles as string[] | undefined;
    if (Array.isArray(principles)) {
      textsToScan.push(...principles.filter((s) => typeof s === "string"));
    }
  }

  const fullText = textsToScan.join(" ");

  // Match symptoms
  const matchedSymptoms = new Map<string, string>(); // symptomId → frequency estimate

  for (const [keyword, symptomId] of keywords) {
    if (matchedSymptoms.has(symptomId)) continue; // Already matched
    if (fullText.includes(keyword)) {
      // Estimate frequency based on where found
      const inEarly = cs?.early && Array.isArray(cs.early) &&
        cs.early.some((s: string) => typeof s === "string" && s.includes(keyword));
      const freq = inEarly ? "common" : "uncommon";
      matchedSymptoms.set(symptomId, freq);
    }
  }

  if (matchedSymptoms.size === 0) {
    noMatchCount++;
    continue;
  }

  // Build associatedSymptoms
  data.associatedSymptoms = Array.from(matchedSymptoms.entries()).map(
    ([symptomId, frequency]) => ({
      symptomId,
      frequency,
    })
  );

  // Generate template diagnosticAlgorithm
  if (!data.diagnosticAlgorithm) {
    const nameEn = (data.nameEn as string) || (data.slug as string);
    const nameZh = (data.nameZh as string) || "";
    const title = nameZh ? `${nameZh} 診斷流程` : `${nameEn} Diagnostic Algorithm`;

    const primaryTests = (diag?.primaryTests as string[]) || [];
    const additionalTests = (diag?.additional as string[]) || [];
    const treatments = (treatment?.principles as string[]) || [];

    data.diagnosticAlgorithm = {
      title,
      steps: [
        {
          step: 1,
          action: "病史與理學檢查",
          details: "詳細問診包括發病經過、用藥史、環境暴露史",
          findings: Array.from(matchedSymptoms.keys())
            .slice(0, 3)
            .map((id) => `${id} 相關症狀`),
        },
        {
          step: 2,
          action: "基本檢驗",
          details: "CBC、生化全套、尿液分析",
          findings: primaryTests.slice(0, 3),
        },
        {
          step: 3,
          action: "進階影像與特殊檢查",
          details: "根據初步結果進一步確認",
          findings: additionalTests.slice(0, 3),
        },
        {
          step: 4,
          action: "確診與治療",
          details: "根據檢查結果啟動特異性治療",
          findings: treatments.slice(0, 3),
        },
      ].filter((s) => s.findings.length > 0),
    };
  }

  data.ddxSource = "auto-generated";

  if (!dryRun) {
    fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120, noRefs: true }));
  }
  enrichedCount++;
}

console.log("\n=== Phase 2c Complete ===");
console.log("Enriched (auto-generated DDX):", enrichedCount);
console.log("Already had DDX:", alreadyHasCount);
console.log("No keyword match:", noMatchCount);
console.log("Total:", enrichedCount + alreadyHasCount + noMatchCount);
