import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { references, diseaseReferences, diseases } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/**
 * GET /api/references
 *
 * Query params:
 *   - page: page number (default 1)
 *   - limit: items per page (default 20, max 100)
 *   - sourceType: pubmed | guideline | consensus
 *   - sourceOrg: ACVIM | WSAVA | IRIS | ...
 *   - diseaseSlug: filter by linked disease
 *   - openAccess: 1 = only open access
 *   - q: search in title
 *   - year: filter by year
 *   - sort: year_desc | year_asc | recent (default recent = by fetchedAt)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const sourceType = params.get("sourceType");
  const sourceOrg = params.get("sourceOrg");
  const diseaseSlug = params.get("diseaseSlug");
  const openAccess = params.get("openAccess");
  const q = params.get("q");
  const yearFilter = params.get("year");
  const sort = params.get("sort") || "recent";

  // Build WHERE clauses
  const conditions: string[] = [];
  const bindValues: (string | number)[] = [];

  if (sourceType) {
    conditions.push("r.source_type = ?");
    bindValues.push(sourceType);
  }
  if (sourceOrg) {
    conditions.push("r.source_org = ?");
    bindValues.push(sourceOrg);
  }
  if (openAccess === "1") {
    conditions.push("r.is_open_access = 1");
  }
  if (q) {
    conditions.push("r.title LIKE ?");
    bindValues.push(`%${q}%`);
  }
  if (yearFilter) {
    conditions.push("r.year = ?");
    bindValues.push(parseInt(yearFilter));
  }
  if (diseaseSlug) {
    conditions.push(
      "r.id IN (SELECT dr.reference_id FROM disease_references dr JOIN diseases d ON d.id = dr.disease_id WHERE d.slug = ?)"
    );
    bindValues.push(diseaseSlug);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // Sort
  let orderBy = "r.fetched_at DESC NULLS LAST";
  if (sort === "year_desc") orderBy = "r.year DESC NULLS LAST";
  else if (sort === "year_asc") orderBy = "r.year ASC NULLS LAST";

  // Count total
  const countSql = `SELECT COUNT(*) as total FROM "references" r ${whereClause}`;
  const countResult = sqlite.prepare(countSql).get(...bindValues) as { total: number };
  const total = countResult.total;

  // Fetch references
  const dataSql = `
    SELECT r.*
    FROM "references" r
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const rows = sqlite
    .prepare(dataSql)
    .all(...bindValues, limit, offset) as Record<string, unknown>[];

  // Get linked diseases for each reference
  const items = rows.map((row) => {
    const linkedDiseases = sqlite
      .prepare(
        `SELECT d.slug, d.name_en, d.name_zh, d.body_system, dr.relevance, dr.section
         FROM disease_references dr
         JOIN diseases d ON d.id = dr.disease_id
         WHERE dr.reference_id = ?`
      )
      .all(row.id as string) as {
        slug: string;
        name_en: string;
        name_zh: string | null;
        body_system: string;
        relevance: string | null;
        section: string | null;
      }[];

    return {
      id: row.id,
      pmid: row.pmid,
      doi: row.doi,
      title: row.title,
      authors: row.authors ? JSON.parse(row.authors as string) : null,
      journal: row.journal,
      year: row.year,
      sourceType: row.source_type,
      sourceOrg: row.source_org,
      url: row.url,
      isOpenAccess: row.is_open_access === 1,
      fetchedAt: row.fetched_at,
      diseases: linkedDiseases.map((d) => ({
        slug: d.slug,
        nameEn: d.name_en,
        nameZh: d.name_zh,
        bodySystem: d.body_system,
        relevance: d.relevance,
        section: d.section,
      })),
    };
  });

  // Get available source orgs for filter
  const sourceOrgs = sqlite
    .prepare(
      `SELECT DISTINCT source_org FROM "references" WHERE source_org IS NOT NULL ORDER BY source_org`
    )
    .all() as { source_org: string }[];

  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    filters: {
      sourceOrgs: sourceOrgs.map((s) => s.source_org),
    },
  });
}
