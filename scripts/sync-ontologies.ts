/**
 * Ontology 同步腳本
 *
 * 1. 對每個已有 MONDO code 的疾病，用 OLS API 取得完整 cross-references
 * 2. 對沒有 MONDO code 的疾病，用英文名搜尋 Mondo 嘗試匹配
 * 3. 更新 ontology_mappings 表
 *
 * Usage: pnpm run sync:ontologies
 */
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import { diseases, ontologyMappings, updateLogs } from "../src/db/schema";
import {
  lookupMondoTerm,
  searchMondoByName,
  sleep,
} from "../src/lib/ontology";

async function main() {
  console.log("=== Ontology Sync ===\n");

  const logId = nanoid();
  const startedAt = new Date().toISOString();
  let totalAdded = 0;
  let totalUpdated = 0;

  try {
    const allDiseases = db.select().from(diseases).all();
    console.log(`Found ${allDiseases.length} diseases\n`);

    for (const disease of allDiseases) {
      console.log(`--- ${disease.nameEn} (${disease.slug}) ---`);

      // Check if this disease already has a MONDO mapping
      const existingMondo = db
        .select()
        .from(ontologyMappings)
        .where(
          and(
            eq(ontologyMappings.diseaseId, disease.id),
            eq(ontologyMappings.ontologySource, "MONDO")
          )
        )
        .all();

      let mondoCode: string | null = null;

      if (existingMondo.length > 0) {
        mondoCode = existingMondo[0].ontologyCode;
        console.log(`  Existing MONDO: ${mondoCode}`);
      } else {
        // Try to find by name
        console.log(`  No MONDO code. Searching by name: "${disease.nameEn}"`);
        const results = await searchMondoByName(disease.nameEn);
        await sleep(300);

        if (results.length > 0) {
          const best = results[0];
          console.log(
            `  Found candidate: ${best.mondoId} — ${best.label} (score: ${best.score.toFixed(1)})`
          );

          // Only auto-map if very confident (exact label match, case-insensitive)
          if (best.label.toLowerCase() === disease.nameEn.toLowerCase()) {
            mondoCode = best.mondoId;
            console.log(`  ✅ Exact match → auto-mapping`);

            // Insert MONDO mapping
            db.insert(ontologyMappings)
              .values({
                id: nanoid(),
                diseaseId: disease.id,
                ontologySource: "MONDO",
                ontologyCode: mondoCode,
                ontologyLabel: best.label,
                confidence: "exact",
              })
              .run();
            totalAdded++;
          } else {
            console.log(
              `  ⚠️ Fuzzy match — skipping auto-map (manual review needed)`
            );
            console.log(
              `    Candidates: ${results.map((r) => `${r.mondoId}:${r.label}`).join(", ")}`
            );
          }
        } else {
          console.log(`  No Mondo matches found`);
        }
      }

      // If we have a MONDO code, look up cross-references
      if (mondoCode) {
        const term = await lookupMondoTerm(mondoCode);
        await sleep(300);

        if (term) {
          console.log(
            `  Cross-refs: ${term.crossRefs.length} (${term.crossRefs.map((r) => r.source).join(", ")})`
          );

          for (const xref of term.crossRefs) {
            // Check if mapping already exists
            const existing = db
              .select()
              .from(ontologyMappings)
              .where(
                and(
                  eq(ontologyMappings.diseaseId, disease.id),
                  eq(ontologyMappings.ontologySource, xref.source),
                  eq(ontologyMappings.ontologyCode, xref.code)
                )
              )
              .get();

            if (!existing) {
              db.insert(ontologyMappings)
                .values({
                  id: nanoid(),
                  diseaseId: disease.id,
                  ontologySource: xref.source,
                  ontologyCode: xref.code,
                  ontologyLabel: xref.label || term.label,
                  confidence: xref.confidence,
                })
                .run();
              totalAdded++;
            } else {
              totalUpdated++;
            }
          }

          // Also add synonyms to disease aliases if they don't exist
          if (term.synonyms.length > 0) {
            const existingAliases = sqlite
              .prepare(
                "SELECT alias FROM disease_aliases WHERE disease_id = ?"
              )
              .all(disease.id) as { alias: string }[];
            const aliasSet = new Set(
              existingAliases.map((a) => a.alias.toLowerCase())
            );

            let newAliases = 0;
            for (const syn of term.synonyms) {
              if (
                !aliasSet.has(syn.toLowerCase()) &&
                syn.toLowerCase() !== disease.nameEn.toLowerCase()
              ) {
                sqlite
                  .prepare(
                    "INSERT INTO disease_aliases (id, disease_id, alias, language) VALUES (?, ?, ?, 'en')"
                  )
                  .run(nanoid(), disease.id, syn);
                newAliases++;
              }
            }
            if (newAliases > 0) {
              console.log(`  Added ${newAliases} new aliases from Mondo synonyms`);
            }
          }
        }
      }

      console.log("");
    }

    // Log the update
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "ontology",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: totalAdded,
        recordsUpdated: totalUpdated,
        status: "success",
        details: JSON.stringify({
          diseasesProcessed: allDiseases.length,
        }),
      })
      .run();

    console.log(
      `=== Done: ${totalAdded} new mappings added, ${totalUpdated} existing ===`
    );
  } catch (err) {
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "ontology",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: totalAdded,
        recordsUpdated: totalUpdated,
        status: "failed",
        details: JSON.stringify({ error: String(err) }),
      })
      .run();

    console.error("Sync failed:", err);
    process.exit(1);
  }
}

main();
