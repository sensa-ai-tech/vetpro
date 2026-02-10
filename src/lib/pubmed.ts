import { XMLParser } from "fast-xml-parser";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

interface ESearchResult {
  idlist: string[];
  count: number;
  webenv?: string;
  querykey?: string;
}

interface PubMedArticle {
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
    rettype: "json",
    retmax: String(options.maxResults || 50),
    usehistory: "y",
  });

  if (options.apiKey) params.set("api_key", options.apiKey);
  if (options.email) params.set("email", options.email);
  if (options.minDate) params.set("mindate", options.minDate);

  const url = `${EUTILS_BASE}/esearch.fcgi?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  const result = data.esearchresult;
  return {
    idlist: result.idlist || [],
    count: parseInt(result.count) || 0,
    webenv: result.webenv,
    querykey: result.querykey,
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

  // Batch in groups of 100
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
    const res = await fetch(url);
    const xml = await res.text();

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

    // Rate limit: wait 100ms between batches (10 rps with key)
    if (i + 100 < pmids.length) {
      await sleep(100);
    }
  }

  return articles;
}

function parseArticle(article: Record<string, unknown>): PubMedArticle {
  const medline = article.MedlineCitation as Record<string, unknown>;
  const pmid = String(
    (medline?.PMID as Record<string, unknown>)?.["#text"] || medline?.PMID || ""
  );
  const articleData = medline?.Article as Record<string, unknown>;

  // Title
  const title = String(
    (articleData?.ArticleTitle as Record<string, unknown>)?.["#text"] ||
      articleData?.ArticleTitle ||
      ""
  );

  // Authors
  const authorList = (articleData?.AuthorList as Record<string, unknown>)
    ?.Author as Record<string, unknown>[] | undefined;
  const authors = (authorList || []).map((a) => {
    const lastName = String(a.LastName || "");
    const initials = String(a.Initials || "");
    return `${lastName} ${initials}`.trim();
  });

  // Journal
  const journalData = articleData?.Journal as Record<string, unknown>;
  const journal = String(journalData?.Title || journalData?.ISOAbbreviation || "");

  // Year
  const journalIssue = journalData?.JournalIssue as Record<string, unknown>;
  const pubDate = journalIssue?.PubDate as Record<string, unknown>;
  const year = parseInt(String(pubDate?.Year || "0"));

  // DOI
  const articleIdList = (
    (article.PubmedData as Record<string, unknown>)
      ?.ArticleIdList as Record<string, unknown>
  )?.ArticleId as Record<string, unknown>[] | undefined;

  const doiEntry = (articleIdList || []).find(
    (id) => id["@_IdType"] === "doi"
  );
  const doi = doiEntry ? String(doiEntry["#text"] || "") : null;

  // Open access check (simplified)
  const isOpenAccess = articleIdList?.some(
    (id) => id["@_IdType"] === "pmc"
  ) || false;

  return { pmid, title, authors, journal, year, doi, isOpenAccess };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
