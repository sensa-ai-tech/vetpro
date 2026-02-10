/**
 * PubMed 自動更新腳本
 *
 * 搜尋最新獸醫文獻並存入資料庫
 * Usage: pnpm run update:pubmed
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { references, diseaseReferences, diseases, updateLogs } from "../src/db/schema";
import { searchPubMed, fetchArticles } from "../src/lib/pubmed";

const API_KEY = process.env.NCBI_API_KEY || "";
const EMAIL = process.env.NCBI_EMAIL || "";

interface PubMedQueryDef {
  name: string;
  query: string;
  frequency: string;
  sourceOrg?: string;
}

interface DiseaseQueryDef {
  query: string;
  frequency: string;
  diseaseSlug: string;
}

async function main() {
  console.log("=== PubMed Update ===\n");

  if (!API_KEY) {
    console.warn("Warning: NCBI_API_KEY not set. Rate limited to 3 req/sec.\n");
  }

  const logId = nanoid();
  const startedAt = new Date().toISOString();
  let totalAdded = 0;
  let totalUpdated = 0;

  try {
    // 1. Load global queries
    const globalQueries = loadGlobalQueries();
    console.log(`Loaded ${globalQueries.length} global queries`);

    // 2. Load per-disease queries
    const diseaseQueries = loadDiseaseQueries();
    console.log(`Loaded ${diseaseQueries.length} per-disease queries\n`);

    // 3. Get last update date
    const lastUpdate = getLastUpdateDate();
    const minDate = lastUpdate || getDefaultMinDate();
    console.log(`Searching for articles since ${minDate}\n`);

    // 4. Run global queries
    for (const q of globalQueries) {
      console.log(`[Global] ${q.name}: ${q.query}`);
      const result = await runQuery(q.query, minDate, q.sourceOrg);
      totalAdded += result.added;
      console.log(`  → Found ${result.total}, added ${result.added} new\n`);
      await sleep(200);
    }

    // 5. Run per-disease queries
    for (const q of diseaseQueries) {
      console.log(`[Disease: ${q.diseaseSlug}] ${q.query}`);
      const result = await runQuery(q.query, minDate);

      // Link to disease
      if (result.newPmids.length > 0) {
        const disease = db
          .select()
          .from(diseases)
          .where(eq(diseases.slug, q.diseaseSlug))
          .get();

        if (disease) {
          for (const pmid of result.newPmids) {
            const ref = db
              .select()
              .from(references)
              .where(eq(references.pmid, pmid))
              .get();
            if (ref) {
              // Check if link already exists
              const existing = db
                .select()
                .from(diseaseReferences)
                .where(eq(diseaseReferences.diseaseId, disease.id))
                .all()
                .find((r) => r.referenceId === ref.id);

              if (!existing) {
                db.insert(diseaseReferences)
                  .values({
                    id: nanoid(),
                    diseaseId: disease.id,
                    referenceId: ref.id,
                    relevance: "supporting",
                    section: "auto-pubmed",
                  })
                  .run();
              }
            }
          }
        }
      }

      totalAdded += result.added;
      console.log(`  → Found ${result.total}, added ${result.added} new\n`);
      await sleep(200);
    }

    // 6. Log the update
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "pubmed",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: totalAdded,
        recordsUpdated: totalUpdated,
        status: "success",
        details: JSON.stringify({
          globalQueries: globalQueries.length,
          diseaseQueries: diseaseQueries.length,
          minDate,
        }),
      })
      .run();

    console.log(`\n=== Done: ${totalAdded} new references added ===`);
  } catch (err) {
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "pubmed",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: totalAdded,
        recordsUpdated: totalUpdated,
        status: "failed",
        details: JSON.stringify({ error: String(err) }),
      })
      .run();

    console.error("Update failed:", err);
    process.exit(1);
  }
}

async function runQuery(
  query: string,
  minDate: string,
  sourceOrg?: string
): Promise<{ total: number; added: number; newPmids: string[] }> {
  const searchResult = await searchPubMed(query, {
    apiKey: API_KEY,
    email: EMAIL,
    minDate,
    maxResults: 100,
  });

  if (searchResult.idlist.length === 0) {
    return { total: 0, added: 0, newPmids: [] };
  }

  // Filter out already existing PMIDs
  const newPmids = searchResult.idlist.filter((pmid) => {
    const existing = db
      .select()
      .from(references)
      .where(eq(references.pmid, pmid))
      .get();
    return !existing;
  });

  if (newPmids.length === 0) {
    return { total: searchResult.idlist.length, added: 0, newPmids: [] };
  }

  // Fetch article details
  const articles = await fetchArticles(newPmids, {
    apiKey: API_KEY,
    email: EMAIL,
  });

  // Insert into database
  for (const article of articles) {
    db.insert(references)
      .values({
        id: nanoid(),
        pmid: article.pmid,
        doi: article.doi,
        title: article.title,
        authors: JSON.stringify(article.authors),
        journal: article.journal,
        year: article.year,
        sourceType: "pubmed",
        sourceOrg: sourceOrg ?? null,
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
        isOpenAccess: article.isOpenAccess ? 1 : 0,
        fetchedAt: new Date().toISOString(),
      })
      .run();
  }

  return {
    total: searchResult.idlist.length,
    added: articles.length,
    newPmids,
  };
}

function loadGlobalQueries(): PubMedQueryDef[] {
  const filePath = path.join(process.cwd(), "data", "pubmed-queries.yaml");
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const data = yaml.load(content) as { globalQueries: PubMedQueryDef[] };
  return data.globalQueries || [];
}

function loadDiseaseQueries(): DiseaseQueryDef[] {
  const diseasesDir = path.join(process.cwd(), "data", "diseases");
  if (!fs.existsSync(diseasesDir)) return [];

  const queries: DiseaseQueryDef[] = [];
  const files = fs
    .readdirSync(diseasesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(diseasesDir, file), "utf-8");
    const data = yaml.load(content) as {
      slug: string;
      pubmedQueries?: { query: string; frequency: string }[];
    };

    if (data.pubmedQueries) {
      for (const q of data.pubmedQueries) {
        queries.push({
          query: q.query,
          frequency: q.frequency,
          diseaseSlug: data.slug,
        });
      }
    }
  }

  return queries;
}

function getLastUpdateDate(): string | null {
  const lastLog = db
    .select()
    .from(updateLogs)
    .where(eq(updateLogs.pipeline, "pubmed"))
    .all()
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
    .at(0);

  if (lastLog?.completedAt) {
    const date = new Date(lastLog.completedAt);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  return null;
}

function getDefaultMinDate(): string {
  // Default: search last 6 months
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
