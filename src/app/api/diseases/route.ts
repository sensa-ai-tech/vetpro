import { NextResponse } from "next/server";
import { db } from "@/db";
import { diseases, speciesAffected } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bodySystem = url.searchParams.get("bodySystem");
  const species = url.searchParams.get("species");

  // Get all diseases
  let allDiseases = db.select().from(diseases).all();

  // Filter by body system
  if (bodySystem) {
    allDiseases = allDiseases.filter((d) => d.bodySystem === bodySystem);
  }

  // Get species for each disease
  const result = allDiseases.map((d) => {
    const speciesList = db
      .select()
      .from(speciesAffected)
      .where(eq(speciesAffected.diseaseId, d.id))
      .all();

    return {
      id: d.id,
      slug: d.slug,
      nameEn: d.nameEn,
      nameZh: d.nameZh,
      bodySystem: d.bodySystem,
      description: d.description,
      species: speciesList.map((s) => s.speciesCommon),
    };
  });

  // Filter by species (after getting species data)
  const filtered = species
    ? result.filter((d) => d.species.includes(species))
    : result;

  return NextResponse.json(filtered);
}
