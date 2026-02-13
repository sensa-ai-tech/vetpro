import { NextResponse } from "next/server";
import { sqlite } from "@/db";

/**
 * GET /api/symptoms — 取得所有症狀列表（含鑑別診斷數量）
 * Query: ?q=search_term
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (q) {
    // FTS search
    const results = sqlite
      .prepare(
        `SELECT s.id, s.zh_name, s.en_name, s.section, s.section_name, s.description,
                (SELECT COUNT(*) FROM symptom_diseases sd WHERE sd.symptom_id = s.id) as differential_count
         FROM symptom_fts fts
         JOIN symptoms s ON s.id = fts.id
         WHERE symptom_fts MATCH ?
         ORDER BY rank`
      )
      .all(`${q}*`) as SymptomRow[];

    return NextResponse.json(formatSymptoms(results));
  }

  // Get all symptoms with differential counts
  const symptoms = sqlite
    .prepare(
      `SELECT s.id, s.zh_name, s.en_name, s.section, s.section_name, s.description,
              (SELECT COUNT(*) FROM symptom_diseases sd WHERE sd.symptom_id = s.id) as differential_count
       FROM symptoms s
       ORDER BY s.section, s.en_name`
    )
    .all() as SymptomRow[];

  return NextResponse.json(formatSymptoms(symptoms));
}

interface SymptomRow {
  id: string;
  zh_name: string;
  en_name: string;
  section: string | null;
  section_name: string | null;
  description: string | null;
  differential_count: number;
}

function formatSymptoms(rows: SymptomRow[]) {
  return rows.map((s) => ({
    id: s.id,
    zhName: s.zh_name,
    enName: s.en_name,
    section: s.section,
    sectionName: s.section_name,
    description: s.description,
    differentialCount: s.differential_count,
  }));
}
