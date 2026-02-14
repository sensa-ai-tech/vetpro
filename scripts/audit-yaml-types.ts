/**
 * audit-yaml-types.ts
 *
 * Scans ALL disease YAML files and checks every field rendered by the page
 * component for type correctness. Reports mismatches with file, field path,
 * actual type, and truncated value.
 *
 * Usage: cd C:/project/vetpro && npx tsx scripts/audit-yaml-types.ts
 */

import fs from "fs";
import path from "path";
import yamlLib from "js-yaml";

interface Issue {
  file: string;
  fieldPath: string;
  expectedType: string;
  actualType: string;
  actualValue: string;
}

const DISEASES_DIR = path.resolve(__dirname, "../data/diseases");

function truncate(val: unknown, maxLen = 100): string {
  const s = JSON.stringify(val) ?? String(val);
  return s.length > maxLen ? s.slice(0, maxLen) + "\u2026" : s;
}

function actualType(val: unknown): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (Array.isArray(val)) return "array";
  return typeof val;
}

const issues: Issue[] = [];

function report(file: string, fieldPath: string, expectedType: string, val: unknown) {
  issues.push({ file, fieldPath, expectedType, actualType: actualType(val), actualValue: truncate(val) });
}

function expectString(file: string, fieldPath: string, val: unknown, required = false) {
  if (val === undefined || val === null) { if (required) report(file, fieldPath, "string (required)", val); return; }
  if (typeof val !== "string") report(file, fieldPath, "string", val);
}

function expectNumber(file: string, fieldPath: string, val: unknown, required = false) {
  if (val === undefined || val === null) { if (required) report(file, fieldPath, "number (required)", val); return; }
  if (typeof val !== "number") report(file, fieldPath, "number", val);
}

function expectStringArray(file: string, fieldPath: string, val: unknown, required = false) {
  if (val === undefined || val === null) { if (required) report(file, fieldPath, "string[] (required)", val); return; }
  if (!Array.isArray(val)) { report(file, fieldPath, "string[]", val); return; }
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "string") report(file, fieldPath + "[" + i + "]", "string (element of string[])", val[i]);
  }
}

function auditFile(filePath: string) {
  const fileName = path.basename(filePath);
  let raw: string;
  try { raw = fs.readFileSync(filePath, "utf-8"); } catch { console.error("  [ERROR] Cannot read " + fileName); return; }

  let data: Record<string, unknown>;
  try { data = yamlLib.load(raw) as Record<string, unknown>; } catch (e) { console.error("  [ERROR] YAML parse failed for " + fileName + ": " + e); return; }
  if (!data || typeof data !== "object") { console.error("  [ERROR] " + fileName + " did not parse to an object"); return; }

  expectString(fileName, "description", data.description);
  expectString(fileName, "prognosis", data.prognosis);
  expectString(fileName, "emergencyNotes", data.emergencyNotes);
  expectStringArray(fileName, "clinicalPearls", data.clinicalPearls);
  expectStringArray(fileName, "monitoringItems", data.monitoringItems);

  // etiology.categories
  const etiology = data.etiology as Record<string, unknown> | undefined;
  if (etiology && typeof etiology === "object") {
    const categories = etiology.categories;
    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        report(fileName, "etiology.categories", "array", categories);
      } else {
        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i] as Record<string, unknown>;
          if (cat && typeof cat === "object") {
            expectString(fileName, "etiology.categories[" + i + "].name", cat.name);
            expectStringArray(fileName, "etiology.categories[" + i + "].examples", cat.examples);
          } else {
            report(fileName, "etiology.categories[" + i + "]", "object", cat);
          }
        }
      }
    }
  }

  // clinicalSigns
  const cs = data.clinicalSigns as Record<string, unknown> | undefined;
  if (cs && typeof cs === "object") {
    expectStringArray(fileName, "clinicalSigns.early", cs.early);
    expectStringArray(fileName, "clinicalSigns.progressive", cs.progressive);
    expectStringArray(fileName, "clinicalSigns.late", cs.late);
  }

  // diagnosis
  const dx = data.diagnosis as Record<string, unknown> | undefined;
  if (dx && typeof dx === "object") {
    const pt = dx.primaryTests;
    if (pt !== undefined) {
      if (!Array.isArray(pt)) {
        report(fileName, "diagnosis.primaryTests", "array", pt);
      } else {
        for (let i = 0; i < pt.length; i++) {
          const item = pt[i] as Record<string, unknown>;
          if (item && typeof item === "object") {
            expectString(fileName, "diagnosis.primaryTests[" + i + "].name", item.name);
            expectString(fileName, "diagnosis.primaryTests[" + i + "].notes", item.notes);
          } else {
            report(fileName, "diagnosis.primaryTests[" + i + "]", "object", item);
          }
        }
      }
    }

    const img = dx.imaging;
    if (img !== undefined) {
      if (!Array.isArray(img)) {
        report(fileName, "diagnosis.imaging", "array", img);
      } else {
        for (let i = 0; i < img.length; i++) {
          const item = img[i] as Record<string, unknown>;
          if (item && typeof item === "object") {
            expectString(fileName, "diagnosis.imaging[" + i + "].name", item.name);
            expectString(fileName, "diagnosis.imaging[" + i + "].notes", item.notes);
          } else {
            report(fileName, "diagnosis.imaging[" + i + "]", "object", item);
          }
        }
      }
    }

    expectStringArray(fileName, "diagnosis.additional", dx.additional);
  }

  // treatment
  const tx = data.treatment as Record<string, unknown> | undefined;
  if (tx && typeof tx === "object") {
    expectStringArray(fileName, "treatment.principles", tx.principles);
    expectStringArray(fileName, "treatment.general", tx.general);

    const meds = tx.medications;
    if (meds !== undefined) {
      if (!Array.isArray(meds)) {
        report(fileName, "treatment.medications", "array", meds);
      } else {
        for (let i = 0; i < meds.length; i++) {
          const med = meds[i] as Record<string, unknown>;
          if (med && typeof med === "object") {
            expectString(fileName, "treatment.medications[" + i + "].name", med.name);
            expectString(fileName, "treatment.medications[" + i + "].dose", med.dose);
            expectString(fileName, "treatment.medications[" + i + "].notes", med.notes);
          } else {
            report(fileName, "treatment.medications[" + i + "]", "object", med);
          }
        }
      }
    }

    const byStage = tx.byStage;
    if (byStage !== undefined) {
      if (byStage === null || typeof byStage !== "object") {
        report(fileName, "treatment.byStage", "object", byStage);
      } else {
        const stageObj = byStage as Record<string, unknown>;
        for (const [stageKey, stageVal] of Object.entries(stageObj)) {
          expectStringArray(fileName, "treatment.byStage." + stageKey, stageVal);
        }
      }
    }
  }

  // diagnosticAlgorithm
  const algo = data.diagnosticAlgorithm as Record<string, unknown> | undefined;
  if (algo && typeof algo === "object") {
    expectString(fileName, "diagnosticAlgorithm.title", algo.title);

    const steps = algo.steps;
    if (steps !== undefined) {
      if (!Array.isArray(steps)) {
        report(fileName, "diagnosticAlgorithm.steps", "array", steps);
      } else {
        for (let i = 0; i < steps.length; i++) {
          const st = steps[i] as Record<string, unknown>;
          if (st && typeof st === "object") {
            expectNumber(fileName, "diagnosticAlgorithm.steps[" + i + "].step", st.step);
            expectString(fileName, "diagnosticAlgorithm.steps[" + i + "].action", st.action);
            expectString(fileName, "diagnosticAlgorithm.steps[" + i + "].details", st.details);
            expectStringArray(fileName, "diagnosticAlgorithm.steps[" + i + "].findings", st.findings);
          } else {
            report(fileName, "diagnosticAlgorithm.steps[" + i + "]", "object", st);
          }
        }
      }
    }
  }

  // stagingSystem -- just check it is an object if present
  const staging = data.stagingSystem;
  if (staging !== undefined && staging !== null) {
    if (typeof staging !== "object") {
      report(fileName, "stagingSystem", "object", staging);
    }
  }
}

function main() {
  const files = fs
    .readdirSync(DISEASES_DIR)
    .filter((f: string) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  console.log("Scanning " + files.length + " YAML files in " + DISEASES_DIR + "\n");

  for (const f of files) {
    auditFile(path.join(DISEASES_DIR, f));
  }

  if (issues.length === 0) {
    console.log("\nNo type issues found. All fields match expected types.");
    return;
  }

  console.log("\n" + "=".repeat(100));
  console.log("FOUND " + issues.length + " TYPE ISSUE(S)");
  console.log("=".repeat(100) + "\n");

  for (const iss of issues) {
    console.log("  FILE:     " + iss.file);
    console.log("  FIELD:    " + iss.fieldPath);
    console.log("  EXPECTED: " + iss.expectedType);
    console.log("  ACTUAL:   " + iss.actualType);
    console.log("  VALUE:    " + iss.actualValue);
    console.log();
  }

  // Summary grouped by field path (normalized: strip [N] indices)
  console.log("=".repeat(100));
  console.log("SUMMARY BY FIELD PATH");
  console.log("=".repeat(100) + "\n");

  const byField = new Map<string, number>();
  for (const iss of issues) {
    const normalized = iss.fieldPath.replace(/\[\d+\]/g, "[]");
    byField.set(normalized, (byField.get(normalized) ?? 0) + 1);
  }

  const sorted = [...byField.entries()].sort((a: [string, number], b: [string, number]) => b[1] - a[1]);
  for (const [fieldPath, count] of sorted) {
    console.log("  " + String(count).padStart(5) + "  " + fieldPath);
  }

  console.log("\n  TOTAL: " + issues.length + " issue(s) across " + byField.size + " distinct field path(s)");
  console.log("  FILES WITH ISSUES: " + new Set(issues.map((i: Issue) => i.file)).size);
}

main();
