/**
 * 連結有效性驗證腳本
 *
 * 對資料庫中所有非 PubMed URL 做 HTTP HEAD 檢查，標記失效連結。
 * PubMed URLs 格式標準化 (pubmed.ncbi.nlm.nih.gov/{PMID}/) 且極少失效，
 * 加上 rate limit 嚴格，因此跳過直接驗證。
 *
 * Usage: pnpm run validate:links
 */
import { nanoid } from "nanoid";
import { db, sqlite } from "../src/db";
import { updateLogs } from "../src/db/schema";

interface LinkCheckResult {
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
  source: string;
  sourceId: string;
}

const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 15000;
const DELAY_BETWEEN_BATCHES_MS = 500;

// Domains to skip (rate-limited or standard format)
const SKIP_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov", // Standard PubMed format, never broken
  "doi.org", // DOI resolver — handled by publishers
];

async function main() {
  console.log("=== Link Validation ===\n");

  const logId = nanoid();
  const startedAt = new Date().toISOString();

  try {
    // Collect all URLs to check
    const allUrls: { url: string; source: string; sourceId: string }[] = [];

    // 1. Reference URLs (non-PubMed)
    const refs = sqlite
      .prepare('SELECT id, url, pmid FROM "references" WHERE url IS NOT NULL')
      .all() as { id: string; url: string; pmid: string | null }[];
    for (const ref of refs) {
      allUrls.push({ url: ref.url, source: "reference", sourceId: ref.id });
    }

    // 2. Disease staging system source URLs
    const diseaseStagings = sqlite
      .prepare(
        "SELECT id, slug, staging_system FROM diseases WHERE staging_system IS NOT NULL"
      )
      .all() as { id: string; slug: string; staging_system: string }[];
    for (const d of diseaseStagings) {
      try {
        const staging = JSON.parse(d.staging_system);
        if (staging.sourceUrl) {
          allUrls.push({
            url: staging.sourceUrl,
            source: "staging",
            sourceId: d.slug,
          });
        }
      } catch {
        // skip invalid JSON
      }
    }

    // 3. Guideline reference URLs from YAML (guidelineRefs)
    const guidelineRefs = sqlite
      .prepare(
        'SELECT id, url FROM "references" WHERE source_type = \'guideline\' AND url IS NOT NULL'
      )
      .all() as { id: string; url: string }[];
    // Already captured above, but ensure uniqueness

    // Filter: skip PubMed and DOI URLs
    const urls = allUrls.filter((entry) => {
      try {
        const hostname = new URL(entry.url).hostname;
        return !SKIP_DOMAINS.some((d) => hostname.includes(d));
      } catch {
        return true; // Check malformed URLs
      }
    });

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueUrls = urls.filter((entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });

    const skippedCount = allUrls.length - urls.length;
    console.log(`Found ${allUrls.length} total URLs`);
    console.log(`Skipped ${skippedCount} (PubMed/DOI — standard format)`);
    console.log(`Checking ${uniqueUrls.length} unique URLs\n`);

    // Check URLs in batches
    const results: LinkCheckResult[] = [];
    let checked = 0;
    let broken = 0;

    for (let i = 0; i < uniqueUrls.length; i += MAX_CONCURRENT) {
      const batch = uniqueUrls.slice(i, i + MAX_CONCURRENT);
      const batchResults = await Promise.all(
        batch.map((entry) =>
          checkUrl(entry.url, entry.source, entry.sourceId)
        )
      );

      for (const result of batchResults) {
        results.push(result);
        checked++;
        if (!result.ok) {
          broken++;
          console.log(
            `  ❌ [${result.source}] ${result.url}\n     → ${result.status || "ERROR"}: ${result.error || ""}`
          );
        }
      }

      // Progress
      if (checked % 20 === 0 || i + MAX_CONCURRENT >= uniqueUrls.length) {
        console.log(
          `  Checked ${checked}/${uniqueUrls.length} (${broken} broken)`
        );
      }

      // Polite delay between batches
      if (i + MAX_CONCURRENT < uniqueUrls.length) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    // Summary
    const brokenResults = results.filter((r) => !r.ok);
    console.log(`\n=== Summary ===`);
    console.log(`Total checked: ${results.length}`);
    console.log(`OK: ${results.length - brokenResults.length}`);
    console.log(`Broken: ${brokenResults.length}`);
    console.log(`Skipped (PubMed/DOI): ${skippedCount}`);

    if (brokenResults.length > 0) {
      console.log(`\n--- Broken Links ---`);
      for (const r of brokenResults) {
        console.log(`  ${r.source} (${r.sourceId}): ${r.url}`);
        console.log(
          `    Status: ${r.status || "N/A"} | Error: ${r.error || "N/A"}`
        );
      }
    }

    // Log the update
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "links",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: 0,
        recordsUpdated: checked,
        status: brokenResults.length === 0 ? "success" : "partial",
        details: JSON.stringify({
          totalUrls: allUrls.length,
          skipped: skippedCount,
          checked: results.length,
          ok: results.length - brokenResults.length,
          broken: brokenResults.length,
          brokenUrls: brokenResults.map((r) => ({
            url: r.url,
            status: r.status,
            source: r.source,
          })),
        }),
      })
      .run();

    console.log(
      `\n=== Done: ${checked} links checked, ${broken} broken ===`
    );

    if (broken > 0) {
      process.exit(1); // Signal failure for CI
    }
  } catch (err) {
    db.insert(updateLogs)
      .values({
        id: logId,
        pipeline: "links",
        startedAt,
        completedAt: new Date().toISOString(),
        recordsAdded: 0,
        recordsUpdated: 0,
        status: "failed",
        details: JSON.stringify({ error: String(err) }),
      })
      .run();

    console.error("Validation failed:", err);
    process.exit(1);
  }
}

async function checkUrl(
  url: string,
  source: string,
  sourceId: string
): Promise<LinkCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "VetPro-LinkChecker/1.0 (https://github.com/sensa-ai-tech/vetpro)",
      },
    });

    clearTimeout(timeout);

    // Some servers don't support HEAD, try GET if we get 405
    if (res.status === 405) {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

      const getRes = await fetch(url, {
        method: "GET",
        signal: controller2.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "VetPro-LinkChecker/1.0",
        },
      });

      clearTimeout(timeout2);

      return {
        url,
        status: getRes.status,
        ok: getRes.ok,
        source,
        sourceId,
      };
    }

    // Treat 429 as OK (site is up, just rate limited)
    const isOk = res.ok || res.status === 429;

    return {
      url,
      status: res.status,
      ok: isOk,
      source,
      sourceId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      url,
      status: null,
      ok: false,
      error: errorMsg.includes("abort") ? "Timeout" : errorMsg,
      source,
      sourceId,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
