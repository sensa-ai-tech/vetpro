import { XMLParser } from "fast-xml-parser";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface ESearchResult {
  idlist: string[];
  count: number;
  webenv?: string;
  querykey?: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi: string | null;
  isOpenAccess: boolean;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName) =>
    ["PubmedArticle", "Author", "ArticleId"].includes(tagName),
  processEntities: true,
  htmlEntities: true,
});

/**
 * 搜尋 PubMed 並回傳 PMID 列表
 */
export async function searchPubMed(
  query: string,
  options: {
    apiKey?: string;
    email?: string;
    minDate?: string; // YYYY/MM/DD
    maxResults?: number;
  } = {}
): Promise<ESearchResult> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: String(options.maxResults || 50),
    usehistory: "y",
  });

  if (options.apiKey) params.set("api_key", options.apiKey);
  if (options.email) params.set("email", options.email);
  if (options.minDate) params.set("mindate", options.minDate);

  const url = `${EUTILS_BASE}/esearch.fcgi?${params}`;
  const data = (await fetchWithRetry(url, "json")) as Record<string, unknown>;

  const result = data.esearchresult as Record<string, unknown> | undefined;
  if (result?.ERROR) {
    throw new Error(`PubMed search error: ${result.ERROR}`);
  }

  return {
    idlist: (result?.idlist as string[]) || [],
    count: parseInt(String(result?.count || "0")) || 0,
    webenv: result?.webenv as string | undefined,
    querykey: result?.querykey as string | undefined,
  };
}

/**
 * 批次取得 PubMed 文章 metadata
 */
export async function fetchArticles(
  pmids: string[],
  options: { apiKey?: string; email?: string } = {}
): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  const articles: PubMedArticle[] = [];
  for (let i = 0; i < pmids.length; i += 100) {
    const batch = pmids.slice(i, i + 100);
    const params = new URLSearchParams({
      db: "pubmed",
      id: batch.join(","),
      rettype: "xml",
      retmode: "xml",
    });

    if (options.apiKey) params.set("api_key", options.apiKey);
    if (options.email) params.set("email", options.email);

    const url = `${EUTILS_BASE}/efetch.fcgi?${params}`;
    const xml = (await fetchWithRetry(url, "text")) as string;

    const parsed = xmlParser.parse(xml);
    const pubmedArticles =
      parsed?.PubmedArticleSet?.PubmedArticle || [];

    for (const article of pubmedArticles) {
      try {
        articles.push(parseArticle(article));
      } catch (err) {
        console.warn(`Failed to parse article:`, err);
      }
    }

    // Rate limit: wait between batches
    // Without API key: 3 rps → 350ms; With key: 10 rps → 100ms
    const delay = options.apiKey ? 100 : 350;
    if (i + 100 < pmids.length) {
      await sleep(delay);
    }
  }

  return articles;
}

/**
 * Fetch with automatic retry on transient errors
 */
async function fetchWithRetry(
  url: string,
  responseType: "json" | "text",
  retries = MAX_RETRIES
): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        // Rate limited — wait and retry
        const waitMs = RETRY_DELAY_MS * attempt;
        console.warn(`Rate limited (429). Waiting ${waitMs}ms before retry ${attempt}/${retries}...`);
        await sleep(waitMs);
        continue;
      }

      if (res.status >= 500) {
        // Server error — retry
        const waitMs = RETRY_DELAY_MS * attempt;
        console.warn(`Server error (${res.status}). Waiting ${waitMs}ms before retry ${attempt}/${retries}...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return responseType === "json" ? await res.json() : await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      const waitMs = RETRY_DELAY_MS * attempt;
      console.warn(`Fetch error (attempt ${attempt}/${retries}): ${err}. Retrying in ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }

  throw new Error("Max retries exceeded");
}

function parseArticle(article: Record<string, unknown>): PubMedArticle {
  const medline = article.MedlineCitation as Record<string, unknown>;
  const pmid = String(
    (medline?.PMID as Record<string, unknown>)?.["#text"] || medline?.PMID || ""
  );
  const articleData = medline?.Article as Record<string, unknown>;

  // Title — handle mixed content (text with inline HTML tags)
  const rawTitle = articleData?.ArticleTitle;
  const title = extractText(rawTitle);

  // Authors
  const authorList = (articleData?.AuthorList as Record<string, unknown>)
    ?.Author as Record<string, unknown>[] | undefined;
  const authors = (authorList || [])
    .map((a) => {
      const lastName = String(a.LastName || "");
      const initials = String(a.Initials || "");
      return `${lastName} ${initials}`.trim();
    })
    .filter((a) => a.length > 0);

  // Journal
  const journalData = articleData?.Journal as Record<string, unknown>;
  const journal = String(journalData?.Title || journalData?.ISOAbbreviation || "");

  // Year — try multiple locations
  const journalIssue = journalData?.JournalIssue as Record<string, unknown>;
  const pubDate = journalIssue?.PubDate as Record<string, unknown>;
  let year = parseInt(String(pubDate?.Year || "0"));

  // Fallback: MedlineDate "YYYY Mon-Mon" format
  if (!year && pubDate?.MedlineDate) {
    const match = String(pubDate.MedlineDate).match(/^(\d{4})/);
    if (match) year = parseInt(match[1]);
  }

  // DOI
  const articleIdList = (
    (article.PubmedData as Record<string, unknown>)
      ?.ArticleIdList as Record<string, unknown>
  )?.ArticleId as Record<string, unknown>[] | undefined;

  const doiEntry = (articleIdList || []).find(
    (id) => id["@_IdType"] === "doi"
  );
  const doi = doiEntry ? String(doiEntry["#text"] || "") : null;

  // Open access check (has PMC ID)
  const isOpenAccess = articleIdList?.some(
    (id) => id["@_IdType"] === "pmc"
  ) || false;

  return { pmid, title, authors, journal, year, doi, isOpenAccess };
}

/**
 * Extract text from XML mixed content (handles inline tags like <i>, <sub>, etc.)
 */
function extractText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);

  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    // If it has #text, that's the main content
    if ("#text" in obj) {
      return String(obj["#text"]);
    }
    // Otherwise concatenate all text values
    return Object.values(obj)
      .map((v) => extractText(v))
      .join("");
  }

  return String(node);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
