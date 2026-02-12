/**
 * rare-knowledge-rescue.ts
 *
 * Specialized literature search for rare/uncommon diseases.
 * Broader search criteria (includes case reports, 16-year range).
 * Preserves knowledge that might otherwise be lost.
 *
 * Usage:
 *   pnpm tsx scripts/rare-knowledge-rescue.ts                  # Auto-batch 20
 *   pnpm tsx scripts/rare-knowledge-rescue.ts --batch auto     # Next batch
 *   pnpm tsx scripts/rare-knowledge-rescue.ts --max 30         # Process 30
 *   pnpm tsx scripts/rare-knowledge-rescue.ts --slug chinchilla-heatstroke
 *   pnpm tsx scripts/rare-knowledge-rescue.ts --dry-run
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY || "";
const EMAIL = process.env.NCBI_EMAIL || "vetpro@example.com";
const DELAY_MS = API_KEY ? 110 : 350;
const MAX_RETRIES = 3;
const DISEASES_DIR = path.join(process.cwd(), "data", "diseases");
const STATE_FILE = path.join(process.cwd(), "data", "pipeline-state.json");
const DEFAULT_MAX = 20;
const MIN_YEAR = 2010; // 16 years — broader for rare diseases

// Exotic/rare species keywords
const EXOTIC_SPECIES = ["rabbit", "ferret", "guinea pig", "hamster", "chinchilla", "rat", "bird", "avian"];

// ─── CLI Args ────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slugArg = args.indexOf("--slug") !== -1 ? args[args.indexOf("--slug") + 1] : null;
const maxArg = args.indexOf("--max") !== -1 ? parseInt(args[args.indexOf("--max") + 1]) : DEFAULT_MAX;
const batchAuto = args.includes("--batch") && args[args.indexOf("--batch") + 1] === "auto";

interface GuidelineRef {
  sourceOrg: string;
  title: string;
  url: string;
  type: string;
  pmid?: string;
}

async function main() {
  console.log("=== VetPro Rare Knowledge Rescue ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Date range: ${MIN_YEAR}-2026 (extended for rare diseases)`);
  console.log();

  const files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith(".yaml")).sort();

  // Find rare/exotic diseases with few references
  const candidates: { file: string; slug: string; nameEn: string; refCount: number; isExotic: boolean; isRare: boolean }[] = [];

  for (const file of files) {
    if (slugArg && file !== `${slugArg}.yaml`) continue;
    const content = fs.readFileSync(path.join(DISEASES_DIR, file), "utf-8");
    const data = yaml.load(content) as Record<string, any>;
    const refs = data.guidelineRefs || [];
    const species = (data.species || []).map((s: any) => s.speciesCommon?.toLowerCase());
    const isExotic = species.some((s: string) => EXOTIC_SPECIES.includes(s));
    const isRare = (data.species || []).some((s: any) => s.prevalence === "rare" || s.prevalence === "uncommon");

    // Prioritize: exotic species OR rare prevalence OR few refs
    if (isExotic || isRare || refs.length < 1 || slugArg) {
      candidates.push({
        file,
        slug: data.slug || file.replace(".yaml", ""),
        nameEn: data.nameEn || "",
        refCount: refs.length,
        isExotic,
        isRare,
      });
    }
  }

  // Sort: most needy first (fewer refs, exotic, rare)
  candidates.sort((a, b) => {
    if (a.refCount !== b.refCount) return a.refCount - b.refCount;
    if (a.isExotic !== b.isExotic) return a.isExotic ? -1 : 1;
    if (a.isRare !== b.isRare) return a.isRare ? -1 : 1;
    return 0;
  });

  // Auto-batch: resume from last position
  let startIdx = 0;
  if (batchAuto) {
    const state = loadState();
    const lastSlug = state.lastRareRescueSlug;
    if (lastSlug) {
      const idx = candidates.findIndex(d => d.slug === lastSlug);
      if (idx !== -1) startIdx = idx + 1;
    }
  }

  const toProcess = candidates.slice(startIdx, startIdx + maxArg);
  console.log(`Rare/exotic candidates: ${candidates.length}`);
  console.log(`Processing: ${toProcess.length}\n`);

  let totalAdded = 0;
  for (const disease of toProcess) {
    try {
      const added = await processRareDisease(disease);
      totalAdded += added;
    } catch (err) {
      console.error(`  ERROR [${disease.slug}]: ${err}`);
    }
  }

  if (!dryRun && toProcess.length > 0) {
    const state = loadState();
    state.lastRareRescueSlug = toProcess[toProcess.length - 1].slug;
    state.totalRefsAdded = (state.totalRefsAdded || 0) + totalAdded;
    state.lastRunDate = new Date().toISOString().split("T")[0];
    saveState(state);
  }

  console.log(`\n=== Done: ${totalAdded} refs rescued for ${toProcess.length} rare diseases ===`);
}

async function processRareDisease(disease: { file: string; slug: string; nameEn: string; refCount: number; isExotic: boolean; isRare: boolean }): Promise<number> {
  const tag = disease.isExotic ? "🐾 exotic" : disease.isRare ? "💎 rare" : "📋";
  console.log(`${tag} ${disease.nameEn} (${disease.slug}) — ${disease.refCount} refs`);

  const filePath = path.join(DISEASES_DIR, disease.file);
  const content = fs.readFileSync(filePath, "utf-8");
  const data = yaml.load(content) as Record<string, any>;

  const existingPmids = new Set<string>();
  for (const ref of (data.guidelineRefs || [])) {
    if (ref.pmid) existingPmids.add(String(ref.pmid));
    const m = ref.url?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    if (m) existingPmids.add(m[1]);
  }

  // Build rescue queries — broader than standard search
  const queries = buildRescueQueries(disease.nameEn, disease.isExotic);
  const candidatePmids: string[] = [];

  for (const q of queries) {
    if (candidatePmids.length >= 15) break;
    try {
      const result = await searchPubMed(q);
      for (const pmid of result) {
        if (!existingPmids.has(pmid) && !candidatePmids.includes(pmid)) {
          candidatePmids.push(pmid);
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Search error: ${err}`);
    }
    await sleep(DELAY_MS);
  }

  if (candidatePmids.length === 0) {
    console.log("  ℹ️ No articles found (even with extended search)");
    return 0;
  }

  // Fetch details
  let articles = await fetchArticleDetails(candidatePmids.slice(0, 15));

  // For rare diseases, keep case reports — they may be the only literature
  articles.sort((a, b) => {
    if (a.isPmc !== b.isPmc) return a.isPmc ? -1 : 1;
    const order: Record<string, number> = { consensus: 0, guideline: 1, review: 2, "case-report": 3, research: 4 };
    if (a.articleType !== b.articleType) return (order[a.articleType] ?? 9) - (order[b.articleType] ?? 9);
    return b.year - a.year;
  });

  const maxToAdd = Math.max(1, 3 - disease.refCount);
  const toAdd = articles.slice(0, maxToAdd);

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
    console.log(`  🔬 +${article.articleType}: "${truncate(article.title, 50)}" (${article.year})`);
  }

  if (added > 0 && !dryRun) {
    surgicalUpdateGuidelineRefs(filePath, data.guidelineRefs);
    console.log(`  💾 Saved (${data.guidelineRefs.length} total refs)`);
  }

  return added;
}

function buildRescueQueries(nameEn: string, isExotic: boolean): string[] {
  const base = nameEn.replace(/'/g, "").replace(/[()]/g, "");
  const queries = [
    // Q1: Broad veterinary search with case reports allowed
    `"${base}" AND (veterinary OR "companion animal") AND ("open access"[filter] OR "free full text"[filter]) AND ${MIN_YEAR}:2026[dp]`,
    // Q2: Any publication type in PMC (for rare diseases, case reports are valuable)
    `"${base}" AND (canine OR feline OR veterinary) AND "loattrfree full text"[sb] AND ${MIN_YEAR}:2026[dp]`,
    // Q3: Specific for case reports (preserve rare knowledge)
    `"${base}" AND ("case report"[pt] OR "case series") AND (veterinary OR "small animal") AND ${MIN_YEAR}:2026[dp]`,
  ];

  if (isExotic) {
    // Q4: Exotic-specific search
    queries.push(
      `"${base}" AND (rabbit OR ferret OR "guinea pig" OR hamster OR chinchilla OR rat) AND ${MIN_YEAR}:2026[dp]`
    );
    queries.push(
      `"${base}" AND ("exotic animal" OR "pocket pet" OR "small mammal") AND ${MIN_YEAR}:2026[dp]`
    );
  }

  return queries;
}

// ─── PubMed inline helpers ───────────────────────────
async function searchPubMed(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed", term: query, retmode: "json", retmax: "15", sort: "relevance",
  });
  if (API_KEY) params.set("api_key", API_KEY);
  if (EMAIL) params.set("email", EMAIL);
  const resp = await fetchWithRetry(`${EUTILS_BASE}/esearch.fcgi?${params}`);
  const data = JSON.parse(resp);
  return data?.esearchresult?.idlist || [];
}

interface ArticleInfo {
  pmid: string; title: string; journal: string; year: number;
  doi: string | null; isPmc: boolean; pmcId: string | null; articleType: string;
}

async function fetchArticleDetails(pmids: string[]): Promise<ArticleInfo[]> {
  if (pmids.length === 0) return [];
  const params = new URLSearchParams({
    db: "pubmed", id: pmids.join(","), rettype: "xml", retmode: "xml",
  });
  if (API_KEY) params.set("api_key", API_KEY);
  if (EMAIL) params.set("email", EMAIL);
  await sleep(DELAY_MS);
  const xml = await fetchWithRetry(`${EUTILS_BASE}/efetch.fcgi?${params}`);
  const articles: ArticleInfo[] = [];
  const re = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    try {
      const b = m[1];
      const pmid = tag(b, "PMID") || "";
      const title = clean(tag(b, "ArticleTitle") || "");
      const journal = tag(b, "Title") || tag(b, "ISOAbbreviation") || "";
      const year = parseInt(tag(b, "Year") || "0") || 0;
      const doiM = b.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
      const pmcM = b.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/);
      const pts: string[] = [];
      const ptRe = /<PublicationType[^>]*>([^<]+)<\/PublicationType>/g;
      let ptM;
      while ((ptM = ptRe.exec(b)) !== null) pts.push(ptM[1].toLowerCase());
      let at = "research";
      if (pts.some(t => t.includes("guideline"))) at = "guideline";
      else if (pts.some(t => t.includes("consensus"))) at = "consensus";
      else if (pts.some(t => t.includes("review"))) at = "review";
      else if (pts.some(t => t.includes("case reports"))) at = "case-report";
      if (pmid) articles.push({ pmid, title, journal, year, doi: doiM?.[1] || null, isPmc: !!pmcM, pmcId: pmcM?.[1] || null, articleType: at });
    } catch { /* skip */ }
  }
  return articles;
}

function surgicalUpdateGuidelineRefs(filePath: string, refs: GuidelineRef[]): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  let si = -1, ei = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^guidelineRefs:/)) {
      si = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^[a-zA-Z]/) && !lines[j].match(/^\s/)) { ei = j; break; }
      }
      if (ei === -1) ei = lines.length;
      break;
    }
  }
  const ns: string[] = ["guidelineRefs:"];
  for (const r of refs) {
    ns.push(`  - sourceOrg: ${ys(r.sourceOrg)}`);
    ns.push(`    title: ${ys(r.title)}`);
    ns.push(`    url: ${r.url}`);
    ns.push(`    type: ${r.type}`);
    if (r.pmid) ns.push(`    pmid: "${r.pmid}"`);
  }
  if (si === -1) {
    let at = lines.length;
    for (let i = 0; i < lines.length; i++) { if (lines[i].match(/^pubmedQueries:/)) { at = i; break; } }
    lines.splice(at, 0, "", ...ns);
  } else {
    lines.splice(si, ei - si, ...ns);
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function loadState(): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
  catch { return {}; }
}
function saveState(state: Record<string, any>): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let a = 1; a <= retries; a++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) { await sleep(2000 * a); continue; }
      if (r.status >= 500) { await sleep(2000 * a); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (a === retries) throw e; await sleep(2000 * a); }
  }
  throw new Error("Max retries");
}

function tag(xml: string, t: string): string | null {
  const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`));
  return m ? m[1].trim() : null;
}
function clean(t: string): string { return t.replace(/<[^>]+>/g, "").trim(); }
function truncate(s: string, l: number): string { return s.length > l ? s.slice(0, l) + "..." : s; }
function ys(s: string): string {
  if (/[:#'"{}[\]&*!|>%@`]/.test(s)) return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return s;
}
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
