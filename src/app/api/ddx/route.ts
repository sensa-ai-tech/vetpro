import { NextResponse } from "next/server";
import { sqlite } from "@/db";

/**
 * GET /api/ddx — 症狀鑑別診斷查詢
 * Query: ?symptoms=vomiting,diarrhoea&species=dog
 *
 * 依據選取的症狀，回傳符合的疾病列表（依匹配症狀數量排序）
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symptomsParam = url.searchParams.get("symptoms");
  const species = url.searchParams.get("species"); // dog | cat | both

  if (!symptomsParam) {
    return NextResponse.json(
      { error: "Missing 'symptoms' query parameter" },
      { status: 400 }
    );
  }

  const symptomIds = symptomsParam.split(",").filter(Boolean);

  if (symptomIds.length === 0) {
    return NextResponse.json(
      { error: "At least one symptom ID is required" },
      { status: 400 }
    );
  }

  // Build SQL query: find diseases matching ANY of the given symptoms
  // Score = number of matched symptoms
  // 物種篩選使用 species_affected 表（不是 symptom_diseases.species，因為後者 97% 都是 'both'）
  const placeholders = symptomIds.map(() => "?").join(",");
  const speciesJoin = species && species !== "both"
    ? `JOIN species_affected sa ON sa.disease_id = d.id AND sa.species_common = ?`
    : "";

  // 參數順序必須與 SQL 中 ? 出現順序一致：先 JOIN 裡的 species，再 WHERE IN 的 symptomIds
  const params: (string | number)[] = [];
  if (species && species !== "both") params.push(species);
  params.push(...symptomIds);

  const results = sqlite
    .prepare(
      `SELECT
        d.slug,
        d.name_en,
        d.name_zh,
        d.body_system,
        d.description,
        d.ddx_source,
        COUNT(DISTINCT sd.symptom_id) as match_count,
        GROUP_CONCAT(DISTINCT sd.symptom_id) as matched_symptoms,
        MAX(CASE WHEN sd.urgency = 'emergency' THEN 4
                 WHEN sd.urgency = 'urgent' THEN 3
                 WHEN sd.urgency = 'semi-urgent' THEN 2
                 ELSE 1 END) as max_urgency_score,
        MAX(CASE WHEN sd.frequency = 'common' THEN 3
                 WHEN sd.frequency = 'uncommon' THEN 2
                 ELSE 1 END) as max_freq_score
       FROM symptom_diseases sd
       JOIN diseases d ON d.id = sd.disease_id
       ${speciesJoin}
       WHERE sd.symptom_id IN (${placeholders})
       GROUP BY d.id
       ORDER BY match_count DESC, max_freq_score DESC, max_urgency_score DESC
       LIMIT 50`
    )
    .all(...params) as DdxResultRow[];

  // Get species info for each disease
  const enriched = results.map((r) => {
    const speciesList = sqlite
      .prepare(
        `SELECT species_common FROM species_affected WHERE disease_id = (SELECT id FROM diseases WHERE slug = ?)`
      )
      .all(r.slug) as Array<{ species_common: string }>;

    return {
      slug: r.slug,
      nameEn: r.name_en,
      nameZh: r.name_zh,
      bodySystem: r.body_system,
      description: r.description?.substring(0, 200) || null,
      ddxSource: r.ddx_source,
      matchCount: r.match_count,
      totalSymptoms: symptomIds.length,
      matchedSymptoms: r.matched_symptoms?.split(",") || [],
      urgencyScore: r.max_urgency_score,
      frequencyScore: r.max_freq_score,
      species: speciesList.map((s) => s.species_common),
    };
  });

  return NextResponse.json({
    query: { symptoms: symptomIds, species: species || "both" },
    resultCount: enriched.length,
    results: enriched,
  });
}

interface DdxResultRow {
  slug: string;
  name_en: string;
  name_zh: string | null;
  body_system: string;
  description: string | null;
  ddx_source: string | null;
  match_count: number;
  matched_symptoms: string | null;
  max_urgency_score: number;
  max_freq_score: number;
}
