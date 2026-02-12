/**
 * deep-literature-scan.ts
 *
 * Deep scan for 10 years of Open Access veterinary literature.
 * Finds diseases with few/no guidelineRefs and enriches them.
 *
 * Usage:
 *   pnpm tsx scripts/deep-literature-scan.ts                    # All diseases with <2 refs
 *   pnpm tsx scripts/deep-literature-scan.ts --batch auto       # Next batch of 50
 *   pnpm tsx scripts/deep-literature-scan.ts --max 100          # Process up to 100
 *   pnpm tsx scripts/deep-literature-scan.ts --slug pancreatitis # Single disease
 *   pnpm tsx scripts/deep-literature-scan.ts --dry-run          # Preview only
 */
import fs from "fs";
import path from "path";
import yamlLib from "js-yaml";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY || "";
const EMAIL = process.env.NCBI_EMAIL || "vetpro@example.com";
const DELAY_MS = API_KEY ? 110 : 350;
const MAX_RETRIES = 3;
const DISEASES_DIR = path.join(process.cwd(), "data", "diseases");
const STATE_FILE = path.join(process.cwd(), "data", "pipeline-state.json");
const DEFAULT_MAX = 50;
const MAX_REFS_PER_DISEASE = 5;
const MIN_YEAR = 2016; // 10 years back from 2026

// ─── CLI Args ────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slugArg = args.indexOf("--slug") !== -1 ? args[args.indexOf("--slug") + 1] : null;
const maxArg = args.indexOf("--max") !== -1 ? parseInt(args[args.indexOf("--max") + 1]) : DEFAULT_MAX;
const batchAuto = args.includes("--batch") && args[args.indexOf("--batch") + 1] === "auto";

// ─── Types ───────────────────────────────────────────
interface GuidelineRef {
  sourceOrg: string;
  title: string;
  url: string;
  type: string;
  pmid?: string;
}

interface ArticleInfo {
  pmid: string;
  title: string;
  journal: string;
  year: number;
  doi: string | null;
  isPmc: boolean;
  pmcId: string | null;
  articleType: string;
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log("=== VetPro Deep Literature Scan ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Date range: ${MIN_YEAR}-2026`);
  if (API_KEY) console.log("Using NCBI API Key (10 req/sec)");
  console.log();

  // Find diseases needing literature
  let files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith(".yaml")).sort();

  if (slugArg) {
    files = files.filter(f => f === `${slugArg}.yaml`);
    if (files.length === 0) {
      console.error(`Disease not found: ${slugArg}`);
      process.exit(1);
    }
  }

  // Filter to diseases with < 2 guidelineRefs
  const needsEnrichment: { file: string; slug: string; nameEn: string; refCount: number }[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DISEASES_DIR, file), "utf-8");
    const data = yamlLib.load(content) as Record<string, any>;
    const refs = data.guidelineRefs || [];
    if (refs.length < 2 || slugArg) {
      needsEnrichment.push({
        file,
        slug: data.slug || file.replace(".yaml", ""),
        nameEn: data.nameEn || "",
        refCount: refs.length,
      });
    }
  }

  // Auto-batch: skip already processed (use state file)
  let startIdx = 0;
  if (batchAuto) {
    const state = loadState();
    const lastSlug = state.lastLiteratureScanSlug;
    if (lastSlug) {
      const idx = needsEnrichment.findIndex(d => d.slug === lastSlug);
      if (idx !== -1) startIdx = idx + 1;
    }
  }

  const toProcess = needsEnrichment.slice(startIdx, startIdx + maxArg);
  console.log(`Diseases needing enrichment: ${needsEnrichment.length}`);
  console.log(`Processing: ${toProcess.length} (from index ${startIdx})\n`);

  let totalAdded = 0;
  for (const disease of toProcess) {
    try {
      const added = await processDisease(disease);
      totalAdded += added;
    } catch (err) {
      console.error(`  ERROR [${disease.slug}]: ${err}`);
    }
  }

  // Update state
  if (!dryRun && toProcess.length > 0) {
    const state = loadState();
    state.lastLiteratureScanSlug = toProcess[toProcess.length - 1].slug;
    state.totalRefsAdded = (state.totalRefsAdded || 0) + totalAdded;
    state.lastRunDate = new Date().toISOString().split("T")[0];
    saveState(state);
  }

  console.log(`\n=== Done: ${totalAdded} new refs added across ${toProcess.length} diseases ===`);
}

async function processDisease(disease: { file: string; slug: string; nameEn: string; refCount: number }): Promise<number> {
  console.log(`📋 ${disease.nameEn} (${disease.slug}) — ${disease.refCount} existing refs`);

  const filePath = path.join(DISEASES_DIR, disease.file);
  const content = fs.readFileSync(filePath, "utf-8");
  const data = yamlLib.load(content) as Record<string, any>;

  // Collect existing PMIDs
  const existingPmids = new Set<string>();
  for (const ref of (data.guidelineRefs || [])) {
    if (ref.pmid) existingPmids.add(String(ref.pmid));
    const m = ref.url?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    if (m) existingPmids.add(m[1]);
  }

  // Build search queries
  const queries = buildDeepQueries(disease.nameEn, data.bodySystem);
  const candidatePmids: string[] = [];

  for (const q of queries) {
    if (candidatePmids.length >= MAX_REFS_PER_DISEASE * 3) break;
    try {
      const result = await searchPubMed(q);
      for (const pmid of result) {
        if (!existingPmids.has(pmid) && !candidatePmids.includes(pmid)) {
          candidatePmids.push(pmid);
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Search failed: ${err}`);
    }
    await sleep(DELAY_MS);
  }

  if (candidatePmids.length === 0) {
    console.log("  ℹ️ No new articles found");
    return 0;
  }

  // Fetch article details
  const toFetch = candidatePmids.slice(0, MAX_REFS_PER_DISEASE * 3);
  let articles: ArticleInfo[] = [];
  try {
    articles = await fetchArticleDetails(toFetch);
  } catch (err) {
    console.warn(`  ⚠️ Fetch failed: ${err}`);
    return 0;
  }

  // Sort: PMC > review/guideline > recent
  articles.sort((a, b) => {
    if (a.isPmc !== b.isPmc) return a.isPmc ? -1 : 1;
    const order: Record<string, number> = { consensus: 0, guideline: 1, review: 2, "case-report": 3, research: 4 };
    if (a.articleType !== b.articleType) return (order[a.articleType] ?? 9) - (order[b.articleType] ?? 9);
    return b.year - a.year;
  });

  // Take top N
  const maxToAdd = MAX_REFS_PER_DISEASE - disease.refCount;
  const toAdd = articles.slice(0, Math.max(1, maxToAdd));

  if (!data.guidelineRefs) data.guidelineRefs = [];
  let added = 0;

  for (const article of toAdd) {
    const newRef: GuidelineRef = {
      sourceOrg: article.journal,
      title: article.title,
      url: article.isPmc && article.pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${article.pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
      type: article.articleType,
      pmid: article.pmid,
    };
    data.guidelineRefs.push(newRef);
    added++;
    const oaTag = article.isPmc ? "🟢 OA" : "🔵";
    console.log(`  ${oaTag} +${article.articleType}: "${truncate(article.title, 55)}" (${article.year})`);
  }

  if (added > 0 && !dryRun) {
    surgicalUpdateGuidelineRefs(filePath, data.guidelineRefs);
    console.log(`  💾 Saved (${data.guidelineRefs.length} total refs)`);
  }

  return added;
}

function buildDeepQueries(nameEn: string, bodySystem: string): string[] {
  const base = nameEn.replace(/'/g, "").replace(/[()]/g, "");
  return [
    // Q1: Veterinary OA reviews 2016-2026
    `"${base}" AND (veterinary OR "small animal" OR canine OR feline) AND (review[pt] OR "systematic review"[pt]) AND "open access"[filter] AND ${MIN_YEAR}:2026[dp]`,
    // Q2: PMC free fulltext guidelines/consensus
    `"${base}" AND (veterinary OR "companion animal") AND ("consensus" OR "guidelines" OR "recommendations") AND "free full text"[filter] AND ${MIN_YEAR}:2026[dp]`,
    // Q3: Broader — including case series and retrospective studies
    `"${base}" AND (canine OR feline OR veterinary) AND (review[pt] OR "case series" OR "retrospective study") AND "loattrfree full text"[sb] AND ${MIN_YEAR}:2026[dp]`,
    // Q4: Top vet journals
    `"${base}" AND ("Journal of Veterinary Internal Medicine"[journal] OR "Veterinary Surgery"[journal] OR "JAVMA"[journal] OR "Journal of Feline Medicine and Surgery"[journal]) AND review[pt] AND ${MIN_YEAR}:2026[dp]`,
    // Q5: Exotic species specific (if applicable)
    `"${base}" AND (rabbit OR ferret OR "guinea pig" OR hamster OR chinchilla OR rat OR avian OR psittacine) AND ("open access"[filter] OR "free full text"[filter]) AND ${MIN_YEAR}:2026[dp]`,
  ];
}

// ─── PubMed helpers (inline to avoid import issues) ──
async function searchPubMed(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: "15",
    sort: "relevance",
  });
  if (API_KEY) params.set("api_key", API_KEY);
  if (EMAIL) params.set("email", EMAIL);

  const url = `${EUTILS_BASE}/esearch.fcgi?${params}`;
  const resp = await fetchWithRetry(url);
  const data = JSON.parse(resp);
  return data?.esearchresult?.idlist || [];
}

async function fetchArticleDetails(pmids: string[]): Promise<ArticleInfo[]> {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    rettype: "xml",
    retmode: "xml",
  });
  if (API_KEY) params.set("api_key", API_KEY);
  if (EMAIL) params.set("email", EMAIL);

  const url = `${EUTILS_BASE}/efetch.fcgi?${params}`;
  await sleep(DELAY_MS);
  const xml = await fetchWithRetry(url);

  const articles: ArticleInfo[] = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    try {
      const block = match[1];
      const pmid = extractXmlTag(block, "PMID") || "";
      const title = cleanXmlText(extractXmlTag(block, "ArticleTitle") || "No title");
      const journal = extractXmlTag(block, "Title") || extractXmlTag(block, "ISOAbbreviation") || "";
      const yearStr = extractXmlTag(block, "Year") || "0";
      const year = parseInt(yearStr) || 0;
      const doiMatch = block.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1] : null;
      const pmcMatch = block.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/);
      const isPmc = !!pmcMatch;
      const pmcId = pmcMatch ? pmcMatch[1] : null;

      const pubTypes: string[] = [];
      const ptRegex = /<PublicationType[^>]*>([^<]+)<\/PublicationType>/g;
      let ptMatch;
      while ((ptMatch = ptRegex.exec(block)) !== null) {
        pubTypes.push(ptMatch[1].toLowerCase());
      }

      let articleType = "research";
      if (pubTypes.some(t => t.includes("practice guideline") || t.includes("guideline"))) articleType = "guideline";
      else if (pubTypes.some(t => t.includes("consensus"))) articleType = "consensus";
      else if (pubTypes.some(t => t.includes("review") || t.includes("systematic review"))) articleType = "review";
      else if (pubTypes.some(t => t.includes("case reports"))) articleType = "case-report";

      const titleLower = title.toLowerCase();
      if (titleLower.includes("consensus") && articleType === "research") articleType = "consensus";
      if (titleLower.includes("guideline") && articleType === "research") articleType = "guideline";
      if (titleLower.includes("review") && articleType === "research") articleType = "review";

      if (pmid) articles.push({ pmid, title, journal, year, doi, isPmc, pmcId, articleType });
    } catch { /* skip */ }
  }
  return articles;
}

// ─── YAML surgical update ─────────────────────────────
function surgicalUpdateGuidelineRefs(filePath: string, refs: GuidelineRef[]): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^guidelineRefs:/)) {
      startIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^[a-zA-Z]/) && !lines[j].match(/^\s/)) {
          endIdx = j;
          break;
        }
      }
      if (endIdx === -1) endIdx = lines.length;
      break;
    }
  }

  const newSection: string[] = ["guidelineRefs:"];
  for (const ref of refs) {
    newSection.push(`  - sourceOrg: ${yamlSafe(ref.sourceOrg)}`);
    newSection.push(`    title: ${yamlSafe(ref.title)}`);
    newSection.push(`    url: ${ref.url}`);
    newSection.push(`    type: ${ref.type}`);
    if (ref.pmid) newSection.push(`    pmid: "${ref.pmid}"`);
  }

  if (startIdx === -1) {
    let insertAt = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^pubmedQueries:/)) { insertAt = i; break; }
    }
    lines.splice(insertAt, 0, "", ...newSection);
  } else {
    lines.splice(startIdx, endIdx - startIdx, ...newSection);
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

// ─── State management ─────────────────────────────────
function loadState(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state: Record<string, any>): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Utils ───────────────────────────────────────────
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await sleep(2000 * attempt); continue; }
      if (res.status >= 500) { await sleep(2000 * attempt); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
  throw new Error("Max retries exceeded");
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function cleanXmlText(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "..." : s;
}

function yamlSafe(s: string): string {
  if (/[:#'"{}[\]&*!|>%@`]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
