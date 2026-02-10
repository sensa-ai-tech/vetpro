import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  diseases,
  diseaseAliases,
  speciesAffected,
  references,
  diseaseReferences,
  ontologyMappings,
} from "@/db/schema";
import type { DiseaseYaml } from "@/types";

/**
 * 從 data/diseases/ 目錄載入所有 YAML 檔案並 upsert 至資料庫
 */
export async function seedDiseases(dataDir: string) {
  const diseasesDir = path.join(dataDir, "diseases");

  if (!fs.existsSync(diseasesDir)) {
    console.error(`Disease data directory not found: ${diseasesDir}`);
    return { added: 0, updated: 0 };
  }

  const files = fs.readdirSync(diseasesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  let added = 0;
  let updated = 0;

  for (const file of files) {
    const filePath = path.join(diseasesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const data = yaml.load(content) as DiseaseYaml;

    if (!data.slug || !data.nameEn || !data.bodySystem) {
      console.warn(`Skipping ${file}: missing required fields (slug, nameEn, bodySystem)`);
      continue;
    }

    const result = await upsertDisease(data);
    if (result === "added") added++;
    else if (result === "updated") updated++;
  }

  return { added, updated };
}

async function upsertDisease(data: DiseaseYaml): Promise<"added" | "updated" | "skipped"> {
  const now = new Date().toISOString();

  // Check if disease already exists
  const existing = db.select().from(diseases).where(eq(diseases.slug, data.slug)).get();

  const diseaseRecord = {
    slug: data.slug,
    nameEn: data.nameEn,
    nameZh: data.nameZh ?? null,
    bodySystem: data.bodySystem,
    description: data.description ?? null,
    etiology: data.etiology ? JSON.stringify(data.etiology) : null,
    pathophysiology: data.pathophysiology ?? null,
    clinicalSigns: data.clinicalSigns ? JSON.stringify(data.clinicalSigns) : null,
    diagnosis: data.diagnosis ? JSON.stringify(data.diagnosis) : null,
    treatment: data.treatment ? JSON.stringify(data.treatment) : null,
    prognosis: data.prognosis ?? null,
    stagingSystem: data.stagingSystem ? JSON.stringify(data.stagingSystem) : null,
    emergencyNotes: data.emergencyNotes ?? null,
    updatedAt: now,
  };

  let diseaseId: string;
  let action: "added" | "updated";

  if (existing) {
    diseaseId = existing.id;
    db.update(diseases).set(diseaseRecord).where(eq(diseases.id, diseaseId)).run();
    action = "updated";
  } else {
    diseaseId = nanoid();
    db.insert(diseases)
      .values({ ...diseaseRecord, id: diseaseId, createdAt: now })
      .run();
    action = "added";
  }

  // Clear and re-insert related records
  db.delete(diseaseAliases).where(eq(diseaseAliases.diseaseId, diseaseId)).run();
  db.delete(speciesAffected).where(eq(speciesAffected.diseaseId, diseaseId)).run();
  db.delete(ontologyMappings).where(eq(ontologyMappings.diseaseId, diseaseId)).run();

  // Insert aliases
  if (data.aliases) {
    for (const a of data.aliases) {
      db.insert(diseaseAliases)
        .values({
          id: nanoid(),
          diseaseId,
          alias: a.alias,
          language: a.language,
        })
        .run();
    }
  }

  // Insert species
  if (data.species) {
    for (const s of data.species) {
      db.insert(speciesAffected)
        .values({
          id: nanoid(),
          diseaseId,
          speciesCommon: s.speciesCommon,
          speciesScientific: s.speciesScientific ?? null,
          prevalence: s.prevalence ?? null,
          notes: s.notes ?? null,
        })
        .run();
    }
  }

  // Insert ontology mappings
  if (data.ontologyMappings) {
    for (const m of data.ontologyMappings) {
      db.insert(ontologyMappings)
        .values({
          id: nanoid(),
          diseaseId,
          ontologySource: m.source,
          ontologyCode: m.code,
          ontologyLabel: m.label,
          confidence: m.confidence,
        })
        .run();
    }
  }

  // Insert guideline references
  if (data.guidelineRefs) {
    for (const g of data.guidelineRefs) {
      // Check if reference already exists by URL
      const existingRef = db
        .select()
        .from(references)
        .where(eq(references.url, g.url))
        .get();

      let refId: string;
      if (existingRef) {
        refId = existingRef.id;
      } else {
        refId = nanoid();
        db.insert(references)
          .values({
            id: refId,
            pmid: g.pmid ?? null,
            title: g.title,
            sourceType: g.type ?? "guideline",
            sourceOrg: g.sourceOrg,
            url: g.url,
            fetchedAt: new Date().toISOString(),
          })
          .run();
      }

      // Link to disease (check if link already exists)
      const existingLink = db
        .select()
        .from(diseaseReferences)
        .where(eq(diseaseReferences.diseaseId, diseaseId))
        .all()
        .find((r) => r.referenceId === refId);

      if (!existingLink) {
        db.insert(diseaseReferences)
          .values({
            id: nanoid(),
            diseaseId,
            referenceId: refId,
            relevance: "primary",
            section: "guideline",
          })
          .run();
      }
    }
  }

  console.log(`  ${action === "added" ? "+" : "~"} ${data.nameEn} (${data.slug})`);
  return action;
}
