/**
 * Ontology 整合模組
 *
 * 使用 EBI OLS4 API 查詢 Mondo Disease Ontology 及其 cross-references
 * Mondo 授權：CC BY 4.0
 */

const OLS_BASE = "https://www.ebi.ac.uk/ols4/api";

export interface OntologyTerm {
  mondoId: string;
  label: string;
  description: string | null;
  synonyms: string[];
  crossRefs: CrossReference[];
}

export interface CrossReference {
  source: string; // DOID | ICD10CM | SCTID | MESH | NCIT | ...
  code: string;
  label: string | null;
  confidence: "exact" | "broad" | "narrow";
}

// Map from OLS xref description to our confidence level
const CONFIDENCE_MAP: Record<string, "exact" | "broad" | "narrow"> = {
  "MONDO:equivalentTo": "exact",
  "MONDO:relatedTo": "broad",
  "MONDO:narrowMatch": "narrow",
  "MONDO:broadMatch": "broad",
};

// Sources we want to keep from cross-references
const WANTED_SOURCES = new Set([
  "DOID",
  "ICD10CM",
  "ICD10WHO",
  "SCTID",
  "MESH",
  "NCIT",
  "OMIM",
  "UMLS",
  "EFO",
]);

/**
 * 從 OLS API 查詢 Mondo term 及其 cross-references
 */
export async function lookupMondoTerm(
  mondoId: string
): Promise<OntologyTerm | null> {
  // Normalize ID format: "MONDO:0005300" → "MONDO:0005300"
  const normalizedId = mondoId.replace("_", ":");

  const url = `${OLS_BASE}/ontologies/mondo/terms?obo_id=${encodeURIComponent(normalizedId)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`OLS API returned ${res.status} for ${mondoId}`);
      return null;
    }

    const data = await res.json();
    const terms = data?._embedded?.terms;
    if (!terms || terms.length === 0) return null;

    const term = terms[0];

    // Extract cross-references
    const crossRefs: CrossReference[] = [];
    const xrefs = term.obo_xref || [];

    for (const xref of xrefs) {
      const source = xref.database;
      if (!source || !WANTED_SOURCES.has(source)) continue;

      const confidence =
        CONFIDENCE_MAP[xref.description] || "broad";

      crossRefs.push({
        source,
        code: `${source}:${xref.id}`,
        label: null,
        confidence,
      });
    }

    return {
      mondoId: normalizedId,
      label: term.label || "",
      description: term.description?.[0] || null,
      synonyms: term.synonyms || [],
      crossRefs,
    };
  } catch (err) {
    console.error(`Error looking up ${mondoId}:`, err);
    return null;
  }
}

/**
 * 用疾病名稱在 Mondo 中搜尋匹配的 term
 */
export async function searchMondoByName(
  name: string
): Promise<{ mondoId: string; label: string; score: number }[]> {
  const url = `${OLS_BASE}/search?q=${encodeURIComponent(name)}&ontology=mondo&type=class&rows=5`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const docs = data?.response?.docs || [];

    return docs
      .filter((doc: Record<string, unknown>) => {
        const id = String(doc.obo_id || "");
        return id.startsWith("MONDO:");
      })
      .map((doc: Record<string, unknown>) => ({
        mondoId: String(doc.obo_id),
        label: String(doc.label),
        score: Number(doc.score) || 0,
      }));
  } catch (err) {
    console.error(`Error searching Mondo for "${name}":`, err);
    return [];
  }
}

/**
 * Rate-limited sleep for OLS API (no strict limits, but be polite)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
