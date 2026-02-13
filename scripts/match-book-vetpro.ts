/**
 * match-book-vetpro.ts
 *
 * Phase 1b: 建立 BOOK → VetPro 疾病匹配表
 * 三層匹配策略：slug 精確匹配 → 名稱模糊匹配 → Dice coefficient 匹配
 *
 * Usage: pnpm tsx scripts/match-book-vetpro.ts
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const EXTRACTED_DIR = path.join(__dirname, "book-data", "extracted");
const DISEASES_DIR = path.join(__dirname, "..", "data", "diseases");
const OUT_FILE = path.join(EXTRACTED_DIR, "book-vetpro-matches.json");

// ── Load data ──

console.log("=== BOOK → VetPro Disease Matching ===\n");

const diseaseInfo: Record<string, { zh: string; en: string; synonyms?: string[] }> =
  JSON.parse(fs.readFileSync(path.join(EXTRACTED_DIR, "disease-info.json"), "utf8"));

const bookSlugs = Object.keys(diseaseInfo);
console.log("BOOK diseases:", bookSlugs.length);

// Load all VetPro YAML slugs and names
interface VetProDisease {
  slug: string;
  nameEn: string;
  nameZh: string;
  aliases?: string[];
}

const vetproFiles = fs.readdirSync(DISEASES_DIR).filter((f) => f.endsWith(".yaml"));
const vetproDiseases: VetProDisease[] = [];

for (const file of vetproFiles) {
  try {
    const d = yaml.load(fs.readFileSync(path.join(DISEASES_DIR, file), "utf8")) as Record<string, unknown>;
    if (!d?.slug) continue;
    vetproDiseases.push({
      slug: d.slug as string,
      nameEn: (d.nameEn as string) || "",
      nameZh: (d.nameZh as string) || "",
      aliases: (d.aliases as string[]) || [],
    });
  } catch {
    // skip
  }
}
console.log("VetPro diseases:", vetproDiseases.length);

// Build lookup maps
const vetproBySlug = new Map(vetproDiseases.map((d) => [d.slug, d]));
const vetproByEnLower = new Map<string, VetProDisease>();
const vetproByZh = new Map<string, VetProDisease>();

for (const d of vetproDiseases) {
  if (d.nameEn) vetproByEnLower.set(d.nameEn.toLowerCase(), d);
  if (d.nameZh) vetproByZh.set(d.nameZh, d);
  for (const alias of d.aliases || []) {
    if (typeof alias === "string") {
      vetproByEnLower.set(alias.toLowerCase(), d);
    }
  }
}

// ── Matching ──

interface MatchResult {
  bookSlug: string;
  bookNameEn: string;
  bookNameZh: string;
  vetproSlug: string | null;
  vetproNameEn: string | null;
  matchMethod: "slug" | "name-exact" | "name-zh" | "synonym" | "dice" | "none";
  diceScore: number;
}

const results: MatchResult[] = [];
const matched = new Set<string>();

for (const bookSlug of bookSlugs) {
  const info = diseaseInfo[bookSlug];
  let result: MatchResult = {
    bookSlug,
    bookNameEn: info.en,
    bookNameZh: info.zh,
    vetproSlug: null,
    vetproNameEn: null,
    matchMethod: "none",
    diceScore: 0,
  };

  // Layer 1: Exact slug match
  if (vetproBySlug.has(bookSlug)) {
    const vp = vetproBySlug.get(bookSlug)!;
    result = {
      ...result,
      vetproSlug: vp.slug,
      vetproNameEn: vp.nameEn,
      matchMethod: "slug",
      diceScore: 1.0,
    };
    matched.add(vp.slug);
    results.push(result);
    continue;
  }

  // Layer 2: Exact English name (case insensitive)
  const bookEnLower = info.en.toLowerCase();
  if (vetproByEnLower.has(bookEnLower)) {
    const vp = vetproByEnLower.get(bookEnLower)!;
    result = {
      ...result,
      vetproSlug: vp.slug,
      vetproNameEn: vp.nameEn,
      matchMethod: "name-exact",
      diceScore: 1.0,
    };
    matched.add(vp.slug);
    results.push(result);
    continue;
  }

  // Layer 2b: Exact Chinese name
  if (info.zh && vetproByZh.has(info.zh)) {
    const vp = vetproByZh.get(info.zh)!;
    result = {
      ...result,
      vetproSlug: vp.slug,
      vetproNameEn: vp.nameEn,
      matchMethod: "name-zh",
      diceScore: 1.0,
    };
    matched.add(vp.slug);
    results.push(result);
    continue;
  }

  // Layer 2c: Synonym match
  if (info.synonyms) {
    let found = false;
    for (const syn of info.synonyms) {
      const synLower = syn.toLowerCase();
      if (vetproByEnLower.has(synLower)) {
        const vp = vetproByEnLower.get(synLower)!;
        result = {
          ...result,
          vetproSlug: vp.slug,
          vetproNameEn: vp.nameEn,
          matchMethod: "synonym",
          diceScore: 0.95,
        };
        matched.add(vp.slug);
        found = true;
        break;
      }
      // Also try slugified synonym
      const synSlug = slugify(syn);
      if (vetproBySlug.has(synSlug)) {
        const vp = vetproBySlug.get(synSlug)!;
        result = {
          ...result,
          vetproSlug: vp.slug,
          vetproNameEn: vp.nameEn,
          matchMethod: "synonym",
          diceScore: 0.95,
        };
        matched.add(vp.slug);
        found = true;
        break;
      }
    }
    if (found) {
      results.push(result);
      continue;
    }
  }

  // Layer 3: Dice coefficient fuzzy matching
  let bestScore = 0;
  let bestMatch: VetProDisease | null = null;

  const bookBigrams = getBigrams(bookSlug);

  for (const vp of vetproDiseases) {
    if (matched.has(vp.slug)) continue;

    // Compare slugs
    const vpBigrams = getBigrams(vp.slug);
    const score = diceCoefficient(bookBigrams, vpBigrams);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = vp;
    }

    // Also compare English names
    const nameScore = diceCoefficient(
      getBigrams(info.en.toLowerCase()),
      getBigrams(vp.nameEn.toLowerCase())
    );
    if (nameScore > bestScore) {
      bestScore = nameScore;
      bestMatch = vp;
    }
  }

  if (bestScore >= 0.7 && bestMatch) {
    result = {
      ...result,
      vetproSlug: bestMatch.slug,
      vetproNameEn: bestMatch.nameEn,
      matchMethod: "dice",
      diceScore: parseFloat(bestScore.toFixed(3)),
    };
    matched.add(bestMatch.slug);
  }

  results.push(result);
}

// ── Output ──

fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

// Statistics
const stats = {
  total: results.length,
  matched: results.filter((r) => r.vetproSlug).length,
  unmatched: results.filter((r) => !r.vetproSlug).length,
  byMethod: {
    slug: results.filter((r) => r.matchMethod === "slug").length,
    nameExact: results.filter((r) => r.matchMethod === "name-exact").length,
    nameZh: results.filter((r) => r.matchMethod === "name-zh").length,
    synonym: results.filter((r) => r.matchMethod === "synonym").length,
    dice: results.filter((r) => r.matchMethod === "dice").length,
    none: results.filter((r) => r.matchMethod === "none").length,
  },
  vetproOnly: vetproDiseases.filter((d) => !matched.has(d.slug)).length,
};

console.log("\n=== Match Results ===");
console.log("Total BOOK diseases:", stats.total);
console.log("Matched:", stats.matched, `(${Math.round((stats.matched / stats.total) * 100)}%)`);
console.log("Unmatched (BOOK-only):", stats.unmatched);
console.log("\nBy method:");
console.log("  Slug exact:", stats.byMethod.slug);
console.log("  Name exact:", stats.byMethod.nameExact);
console.log("  Name ZH:", stats.byMethod.nameZh);
console.log("  Synonym:", stats.byMethod.synonym);
console.log("  Dice (≥0.7):", stats.byMethod.dice);
console.log("  No match:", stats.byMethod.none);
console.log("\nVetPro-only (no BOOK counterpart):", stats.vetproOnly);

// Show unmatched for inspection
if (stats.unmatched > 0) {
  console.log("\n--- Unmatched BOOK diseases ---");
  const unmatched = results.filter((r) => !r.vetproSlug);
  for (const u of unmatched.slice(0, 30)) {
    console.log(`  ${u.bookSlug}: ${u.bookNameEn} / ${u.bookNameZh}`);
  }
  if (unmatched.length > 30) {
    console.log(`  ... and ${unmatched.length - 30} more`);
  }
}

// Save stats
fs.writeFileSync(
  path.join(EXTRACTED_DIR, "match-stats.json"),
  JSON.stringify(stats, null, 2)
);

// ═══════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[()'']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getBigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.substring(i, i + 2));
  }
  return bigrams;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const bigram of a) {
    if (b.has(bigram)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}
