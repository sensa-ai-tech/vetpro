/**
 * enrich-guidelinerefs.ts
 *
 * 自動搜尋 PubMed Open Access 獸醫文獻，更新 YAML 的 guidelineRefs
 *
 * 功能：
 *  1. 讀取每個 disease YAML
 *  2. 用 PubMed E-utilities 搜尋 Open Access 的 review/guideline 文獻
 *  3. 驗證 PMID 有效性並取得文章詳細資料
 *  4. 更新 YAML guidelineRefs（不重複、不覆蓋現有）
 *  5. 修復缺少 PMID 或 URL 不完整的現有 refs
 *
 * Usage:
 *   pnpm tsx scripts/enrich-guidelinerefs.ts              # 全部 100 diseases
 *   pnpm tsx scripts/enrich-guidelinerefs.ts --batch 0    # 第 0 批 (0-9)
 *   pnpm tsx scripts/enrich-guidelinerefs.ts --batch 1    # 第 1 批 (10-19)
 *   pnpm tsx scripts/enrich-guidelinerefs.ts --slug pancreatitis  # 單一疾病
 *   pnpm tsx scripts/enrich-guidelinerefs.ts --dry-run    # 預覽不寫入
 *
 * 速率控制：無 API Key 時 3 req/sec (350ms delay)
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

// ─── Config ──────────────────────────────────────────
const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY || "";
const EMAIL = process.env.NCBI_EMAIL || "vetpro@example.com";
const DELAY_MS = API_KEY ? 110 : 350; // respect rate limits
const MAX_NEW_REFS_PER_DISEASE = 3; // 每個疾病最多新增 3 篇
const BATCH_SIZE = 10;
const DISEASES_DIR = path.join(process.cwd(), "data", "diseases");
const MAX_RETRIES = 3;

// ─── Types ───────────────────────────────────────────
interface GuidelineRef {
  sourceOrg: string;
  title: string;
  url: string;
  type: string;
  pmid?: string;
}

interface DiseaseYaml {
  slug: string;
  nameEn: string;
  nameZh: string;
  bodySystem: string;
  guidelineRefs?: GuidelineRef[];
  pubmedQueries?: { query: string; frequency: string }[];
  [key: string]: unknown;
}

interface PubMedSearchResult {
  esearchresult: {
    idlist: string[];
    count: string;
  };
}

interface ArticleInfo {
  pmid: string;
  title: string;
  journal: string;
  year: number;
  doi: string | null;
  isPmc: boolean;
  pmcId: string | null;
  articleType: string; // review, guideline, research, consensus
}

// ─── CLI Args ────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchArg = args.indexOf("--batch") !== -1
  ? parseInt(args[args.indexOf("--batch") + 1])
  : null;
const slugArg = args.indexOf("--slug") !== -1
  ? args[args.indexOf("--slug") + 1]
  : null;

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log("=== VetPro GuidelineRefs Enrichment ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (preview only)" : "LIVE (will write YAML)"}`);
  if (API_KEY) console.log("Using NCBI API Key (10 req/sec)");
  else console.log("No API Key — limited to 3 req/sec");
  console.log();

  // Load all YAML files
  let files = fs.readdirSync(DISEASES_DIR)
    .filter(f => f.endsWith(".yaml"))
    .sort();

  // Apply filters
  if (slugArg) {
    files = files.filter(f => f === `${slugArg}.yaml`);
    if (files.length === 0) {
      console.error(`Disease not found: ${slugArg}`);
      process.exit(1);
    }
  } else if (batchArg !== null) {
    const start = batchArg * BATCH_SIZE;
    files = files.slice(start, start + BATCH_SIZE);
    console.log(`Batch ${batchArg}: processing files ${start}-${start + files.length - 1}`);
  }

  console.log(`Processing ${files.length} disease(s)...\n`);

  let totalNew = 0;
  let totalFixed = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    const filePath = path.join(DISEASES_DIR, file);
    try {
      const result = await processDisease(filePath);
      totalNew += result.added;
      totalFixed += result.fixed;
      if (result.added === 0 && result.fixed === 0) totalSkipped++;
    } catch (err) {
      const msg = `ERROR [${file}]: ${err}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Diseases processed: ${files.length}`);
  console.log(`New refs added:     ${totalNew}`);
  console.log(`Broken refs fixed:  ${totalFixed}`);
  console.log(`Skipped (no change): ${totalSkipped}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ${e}`));
  }
  if (dryRun) console.log("\n⚠️  DRY RUN — no files were modified");
}

// ─── Process one disease ─────────────────────────────
async function processDisease(filePath: string): Promise<{ added: number; fixed: number }> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = yaml.load(raw) as DiseaseYaml;
  const slug = data.slug;
  const nameEn = data.nameEn;

  console.log(`📋 ${nameEn} (${slug})`);

  let modified = false;
  let added = 0;
  let fixed = 0;

  // Ensure guidelineRefs array exists
  if (!data.guidelineRefs) {
    data.guidelineRefs = [];
  }

  // ─── Step 1: Fix broken existing refs ───
  for (const ref of data.guidelineRefs) {
    // Fix missing PMID
    if (!ref.pmid && ref.url) {
      const pmidMatch = ref.url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
      if (pmidMatch) {
        ref.pmid = pmidMatch[1];
        console.log(`  🔧 Fixed missing PMID: ${ref.pmid}`);
        fixed++;
        modified = true;
      }
    }
    // Fix broken URLs (no PMID in URL)
    if (ref.url === "https://pubmed.ncbi.nlm.nih.gov/" && ref.pmid) {
      ref.url = `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`;
      console.log(`  🔧 Fixed broken URL for PMID ${ref.pmid}`);
      fixed++;
      modified = true;
    }
  }

  // ─── Step 2: Collect existing PMIDs ───
  const existingPmids = new Set<string>();
  for (const ref of data.guidelineRefs) {
    if (ref.pmid) existingPmids.add(ref.pmid);
    // Also extract from URL
    const m = ref.url?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    if (m) existingPmids.add(m[1]);
  }

  // ─── Step 3: Search PubMed for Open Access refs ───
  const neededRefs = MAX_NEW_REFS_PER_DISEASE - Math.max(0, 3 - (data.guidelineRefs?.length || 0));
  // Only search if we have fewer than 3 refs, or if disease has 0 refs
  const currentCount = data.guidelineRefs.length;
  const maxToAdd = currentCount < 2 ? MAX_NEW_REFS_PER_DISEASE : (currentCount < 3 ? 2 : 1);

  if (maxToAdd <= 0 && currentCount >= 4) {
    console.log(`  ✅ Already has ${currentCount} refs, skipping search`);
    if (modified && !dryRun) {
      writeYaml(filePath, data);
    }
    return { added, fixed };
  }

  // Build search queries
  const queries = buildSearchQueries(nameEn, data.bodySystem);

  const candidatePmids: string[] = [];

  for (const q of queries) {
    if (candidatePmids.length >= maxToAdd * 3) break; // enough candidates

    try {
      const result = await searchPubMed(q);
      for (const pmid of result) {
        if (!existingPmids.has(pmid) && !candidatePmids.includes(pmid)) {
          candidatePmids.push(pmid);
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Search failed: ${err}`);
    }
    await sleep(DELAY_MS);
  }

  if (candidatePmids.length === 0) {
    console.log(`  ℹ️  No new Open Access articles found`);
    if (modified && !dryRun) {
      writeYaml(filePath, data);
    }
    return { added, fixed };
  }

  // ─── Step 4: Fetch article details & filter ───
  const toFetch = candidatePmids.slice(0, maxToAdd * 3); // fetch extra for filtering
  let articles: ArticleInfo[] = [];
  try {
    articles = await fetchArticleDetails(toFetch);
  } catch (err) {
    console.warn(`  ⚠️  Fetch details failed: ${err}`);
  }

  // Prefer: PMC (open access) > review > recent
  articles.sort((a, b) => {
    if (a.isPmc !== b.isPmc) return a.isPmc ? -1 : 1;
    if (a.articleType !== b.articleType) {
      const order: Record<string, number> = { consensus: 0, guideline: 1, review: 2, research: 3 };
      return (order[a.articleType] ?? 9) - (order[b.articleType] ?? 9);
    }
    return b.year - a.year; // newer first
  });

  // Take top N
  const toAdd = articles.slice(0, maxToAdd);

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
    data.guidelineRefs!.push(newRef);
    added++;
    const oaTag = article.isPmc ? "🟢 OA" : "🔵";
    console.log(`  ${oaTag} +${article.articleType}: "${truncate(article.title, 60)}" (${article.year}) PMID:${article.pmid}`);
    modified = true;
  }

  // ─── Step 5: Write back ───
  if (modified && !dryRun) {
    writeYaml(filePath, data);
    console.log(`  💾 Saved (${data.guidelineRefs!.length} total refs)`);
  } else if (modified && dryRun) {
    console.log(`  📝 Would save (${data.guidelineRefs!.length} total refs) [DRY RUN]`);
  }

  return { added, fixed };
}

// ─── PubMed Search ───────────────────────────────────
function buildSearchQueries(nameEn: string, bodySystem: string): string[] {
  // Targeted queries prioritizing Open Access reviews/guidelines
  const base = nameEn.replace(/'/g, "");
  return [
    // Query 1: Open Access reviews/guidelines for this disease in vet context
    `"${base}" AND (dog OR cat OR canine OR feline) AND (review[pt] OR guideline[pt] OR "systematic review"[pt] OR "practice guideline"[pt]) AND "open access"[filter]`,
    // Query 2: PMC free fulltext, consensus/guidelines
    `"${base}" AND (veterinary OR "small animal") AND ("consensus" OR "guidelines" OR "recommendations") AND "free full text"[filter]`,
    // Query 3: Broader review search with PMC filter
    `"${base}" AND (canine OR feline OR veterinary) AND review[pt] AND "loattrfree full text"[sb]`,
    // Query 4: Specific journal search (top vet journals)
    `"${base}" AND ("Journal of Veterinary Internal Medicine"[journal] OR "Veterinary Surgery"[journal] OR "Journal of the American Veterinary Medical Association"[journal] OR "Journal of Feline Medicine and Surgery"[journal]) AND review[pt]`,
  ];
}

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
  const data = JSON.parse(resp) as PubMedSearchResult;
  return data?.esearchresult?.idlist || [];
}

// ─── Fetch Article Details ───────────────────────────
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

  // Simple XML parsing (avoid heavy dependency)
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

      // DOI
      const doiMatch = block.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1] : null;

      // PMC (open access indicator)
      const pmcMatch = block.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/);
      const isPmc = !!pmcMatch;
      const pmcId = pmcMatch ? pmcMatch[1] : null;

      // Publication type
      const pubTypes: string[] = [];
      const ptRegex = /<PublicationType[^>]*>([^<]+)<\/PublicationType>/g;
      let ptMatch;
      while ((ptMatch = ptRegex.exec(block)) !== null) {
        pubTypes.push(ptMatch[1].toLowerCase());
      }

      let articleType = "research";
      if (pubTypes.some(t => t.includes("practice guideline") || t.includes("guideline"))) {
        articleType = "guideline";
      } else if (pubTypes.some(t => t.includes("consensus"))) {
        articleType = "consensus";
      } else if (pubTypes.some(t => t.includes("review") || t.includes("systematic review"))) {
        articleType = "review";
      }

      // Also check title for hints
      const titleLower = title.toLowerCase();
      if (titleLower.includes("consensus") && articleType === "research") articleType = "consensus";
      if (titleLower.includes("guideline") && articleType === "research") articleType = "guideline";
      if (titleLower.includes("review") && articleType === "research") articleType = "review";

      if (pmid) {
        articles.push({ pmid, title, journal, year, doi, isPmc, pmcId, articleType });
      }
    } catch {
      // Skip unparseable articles
    }
  }

  return articles;
}

// ─── YAML Write ──────────────────────────────────────
function writeYaml(filePath: string, data: DiseaseYaml): void {
  // Read original to preserve structure as much as possible
  const content = yaml.dump(data, {
    lineWidth: 200,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    flowLevel: -1,
  });
  // yaml.dump produces valid YAML but changes formatting.
  // Better approach: surgical edit of guidelineRefs section only.
  surgicalUpdateGuidelineRefs(filePath, data.guidelineRefs || []);
}

function surgicalUpdateGuidelineRefs(filePath: string, refs: GuidelineRef[]): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  // Find guidelineRefs section
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^guidelineRefs:/)) {
      startIdx = i;
      // Find end of section
      for (let j = i + 1; j < lines.length; j++) {
        // Next top-level key or EOF
        if (lines[j].match(/^[a-zA-Z]/) && !lines[j].match(/^\s/)) {
          endIdx = j;
          break;
        }
      }
      if (endIdx === -1) endIdx = lines.length;
      break;
    }
  }

  // Build new guidelineRefs section
  const newSection: string[] = ["guidelineRefs:"];
  for (const ref of refs) {
    newSection.push(`  - sourceOrg: ${yamlSafeString(ref.sourceOrg)}`);
    newSection.push(`    title: ${yamlSafeString(ref.title)}`);
    newSection.push(`    url: ${ref.url}`);
    newSection.push(`    type: ${ref.type}`);
    if (ref.pmid) {
      newSection.push(`    pmid: "${ref.pmid}"`);
    }
  }

  if (startIdx === -1) {
    // No existing section — insert before pubmedQueries or at end
    let insertAt = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^pubmedQueries:/)) {
        insertAt = i;
        break;
      }
    }
    lines.splice(insertAt, 0, "", ...newSection);
  } else {
    // Replace existing section
    lines.splice(startIdx, endIdx - startIdx, ...newSection);
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

function yamlSafeString(s: string): string {
  // If string contains special chars, quote it
  if (s.includes(":") || s.includes("#") || s.includes("'") || s.includes('"') ||
      s.includes("{") || s.includes("}") || s.includes("[") || s.includes("]") ||
      s.includes("&") || s.includes("*") || s.includes("!") || s.includes("|") ||
      s.includes(">") || s.includes("%") || s.includes("@") || s.includes("`")) {
    // Escape internal double quotes and wrap
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

// ─── Utils ───────────────────────────────────────────
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = 2000 * attempt;
        console.warn(`    Rate limited (429). Waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        const wait = 2000 * attempt;
        console.warn(`    Server error (${res.status}). Retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
  throw new Error("Max retries exceeded");
}

function extractXmlTag(xml: string, tag: string): string | null {
  // Gets the FIRST occurrence — handles nested tags by being non-greedy
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function cleanXmlText(text: string): string {
  // Remove XML tags from text content
  return text.replace(/<[^>]+>/g, "").trim();
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "..." : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
