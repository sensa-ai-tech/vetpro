import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  diseases,
  diseaseAliases,
  speciesAffected,
  diseaseReferences,
  references,
  ontologyMappings,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const disease = db
    .select()
    .from(diseases)
    .where(eq(diseases.slug, slug))
    .get();

  if (!disease) {
    return NextResponse.json({ error: "Disease not found" }, { status: 404 });
  }

  // Get related data
  const aliases = db
    .select()
    .from(diseaseAliases)
    .where(eq(diseaseAliases.diseaseId, disease.id))
    .all();

  const species = db
    .select()
    .from(speciesAffected)
    .where(eq(speciesAffected.diseaseId, disease.id))
    .all();

  const refLinks = db
    .select()
    .from(diseaseReferences)
    .where(eq(diseaseReferences.diseaseId, disease.id))
    .all();

  const refs = refLinks.map((link) => {
    const ref = db
      .select()
      .from(references)
      .where(eq(references.id, link.referenceId))
      .get();
    return ref
      ? {
          id: ref.id,
          title: ref.title,
          authors: ref.authors ? JSON.parse(ref.authors) : null,
          journal: ref.journal,
          year: ref.year,
          url: ref.url,
          sourceType: ref.sourceType,
          sourceOrg: ref.sourceOrg,
          relevance: link.relevance,
          section: link.section,
        }
      : null;
  }).filter(Boolean);

  const mappings = db
    .select()
    .from(ontologyMappings)
    .where(eq(ontologyMappings.diseaseId, disease.id))
    .all();

  // Parse JSON fields
  const parseJson = (val: string | null) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  return NextResponse.json({
    id: disease.id,
    slug: disease.slug,
    nameEn: disease.nameEn,
    nameZh: disease.nameZh,
    bodySystem: disease.bodySystem,
    description: disease.description,
    etiology: parseJson(disease.etiology),
    pathophysiology: disease.pathophysiology,
    clinicalSigns: parseJson(disease.clinicalSigns),
    diagnosis: parseJson(disease.diagnosis),
    treatment: parseJson(disease.treatment),
    prognosis: disease.prognosis,
    stagingSystem: parseJson(disease.stagingSystem),
    emergencyNotes: disease.emergencyNotes,
    aliases: aliases.map((a) => ({ alias: a.alias, language: a.language })),
    species: species.map((s) => ({
      speciesCommon: s.speciesCommon,
      speciesScientific: s.speciesScientific,
      prevalence: s.prevalence,
      notes: s.notes,
    })),
    references: refs,
    ontologyMappings: mappings.map((m) => ({
      ontologySource: m.ontologySource,
      ontologyCode: m.ontologyCode,
      ontologyLabel: m.ontologyLabel,
      confidence: m.confidence,
    })),
  });
}
