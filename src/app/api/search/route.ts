import { NextResponse } from "next/server";
import { sqlite } from "@/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q || q.trim().length === 0) {
    return NextResponse.json([]);
  }

  // Prepare FTS5 query: add * for prefix matching
  const ftsQuery = q
    .trim()
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(" ");

  try {
    const results = sqlite
      .prepare(
        `SELECT
          d.slug,
          d.name_en as nameEn,
          d.name_zh as nameZh,
          d.body_system as bodySystem,
          d.description,
          highlight(disease_fts, 1, '<mark>', '</mark>') as matchHighlight
        FROM disease_fts
        JOIN diseases d ON d.slug = disease_fts.slug
        WHERE disease_fts MATCH ?
        ORDER BY rank
        LIMIT 20`
      )
      .all(ftsQuery);

    return NextResponse.json(results);
  } catch {
    // Fallback to LIKE search if FTS query fails
    const likeQuery = `%${q.trim()}%`;
    const results = sqlite
      .prepare(
        `SELECT
          slug,
          name_en as nameEn,
          name_zh as nameZh,
          body_system as bodySystem,
          description
        FROM diseases
        WHERE name_en LIKE ? OR name_zh LIKE ? OR slug LIKE ?
        LIMIT 20`
      )
      .all(likeQuery, likeQuery, likeQuery);

    return NextResponse.json(results);
  }
}
