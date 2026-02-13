import { NextResponse } from "next/server";
import { sqlite } from "@/db";

/**
 * GET /api/ddx/lab — 實驗室異常鑑別查詢
 * Query: ?labs=azotaemia,hyperkalaemia&species=cat
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const labsParam = url.searchParams.get("labs");
  const species = url.searchParams.get("species");

  if (!labsParam) {
    // Return all lab findings
    const labs = sqlite
      .prepare(
        `SELECT lf.id, lf.zh_name, lf.en_name, lf.category,
                (SELECT COUNT(*) FROM lab_diseases ld WHERE ld.lab_id = lf.id) as differential_count
         FROM lab_findings lf
         ORDER BY lf.category, lf.en_name`
      )
      .all() as LabRow[];

    return NextResponse.json(
      labs.map((l) => ({
        id: l.id,
        zhName: l.zh_name,
        enName: l.en_name,
        category: l.category,
        differentialCount: l.differential_count,
      }))
    );
  }

  const labIds = labsParam.split(",").filter(Boolean);
  if (labIds.length === 0) {
    return NextResponse.json(
      { error: "At least one lab finding ID is required" },
      { status: 400 }
    );
  }

  const placeholders = labIds.map(() => "?").join(",");
  const speciesFilter = species && species !== "both"
    ? `AND (ld.species = ? OR ld.species = 'both')`
    : "";
  const params: string[] = [...labIds];
  if (species && species !== "both") params.push(species);

  const results = sqlite
    .prepare(
      `SELECT
        d.slug,
        d.name_en,
        d.name_zh,
        d.body_system,
        d.description,
        COUNT(DISTINCT ld.lab_id) as match_count,
        GROUP_CONCAT(DISTINCT ld.lab_id) as matched_labs,
        MAX(CASE WHEN ld.urgency = 'emergency' THEN 4
                 WHEN ld.urgency = 'urgent' THEN 3
                 WHEN ld.urgency = 'semi-urgent' THEN 2
                 ELSE 1 END) as max_urgency_score
       FROM lab_diseases ld
       JOIN diseases d ON d.id = ld.disease_id
       WHERE ld.lab_id IN (${placeholders})
       ${speciesFilter}
       GROUP BY d.id
       ORDER BY match_count DESC, max_urgency_score DESC
       LIMIT 30`
    )
    .all(...params) as LabDdxRow[];

  return NextResponse.json({
    query: { labs: labIds, species: species || "both" },
    resultCount: results.length,
    results: results.map((r) => ({
      slug: r.slug,
      nameEn: r.name_en,
      nameZh: r.name_zh,
      bodySystem: r.body_system,
      description: r.description?.substring(0, 200) || null,
      matchCount: r.match_count,
      totalLabs: labIds.length,
      matchedLabs: r.matched_labs?.split(",") || [],
      urgencyScore: r.max_urgency_score,
    })),
  });
}

interface LabRow {
  id: string;
  zh_name: string;
  en_name: string;
  category: string | null;
  differential_count: number;
}

interface LabDdxRow {
  slug: string;
  name_en: string;
  name_zh: string | null;
  body_system: string;
  description: string | null;
  match_count: number;
  matched_labs: string | null;
  max_urgency_score: number;
}
