"""
Merck Veterinary Manual → VetPro YAML Enrichment Script

Reads extracted Merck text chapters, matches them to existing disease YAML files,
and produces a JSON mapping of disease → relevant Merck excerpts for enrichment.
"""

import os
import re
import json
import yaml
from pathlib import Path

MERCK_DIR = Path("C:/project/merck-text")
DISEASES_DIR = Path("C:/project/vetpro/data/diseases")
OUTPUT_FILE = Path("C:/project/vetpro/scripts/merck-matches.json")

def load_diseases():
    """Load all disease YAML files and extract searchable terms."""
    diseases = []
    for f in sorted(DISEASES_DIR.glob("*.yaml")):
        with open(f, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)

        # Collect all searchable English terms for this disease
        search_terms = set()

        # Primary English name
        name_en = data.get("nameEn", "")
        if name_en:
            search_terms.add(name_en.lower())

        # Slug as fallback
        slug = data.get("slug", f.stem)
        search_terms.add(slug.replace("-", " "))

        # Aliases (English only)
        for alias in data.get("aliases", []):
            if isinstance(alias, dict) and alias.get("language") == "en":
                search_terms.add(alias["alias"].lower())
            elif isinstance(alias, str):
                search_terms.add(alias.lower())

        diseases.append({
            "slug": slug,
            "nameEn": name_en,
            "nameZh": data.get("nameZh", ""),
            "bodySystem": data.get("bodySystem", ""),
            "file": str(f),
            "searchTerms": list(search_terms),
        })

    return diseases

def load_merck_chapters():
    """Load all extracted Merck chapter text files."""
    chapters = {}
    for f in sorted(MERCK_DIR.glob("*.txt")):
        with open(f, "r", encoding="utf-8") as fh:
            chapters[f.stem] = fh.read()
    return chapters

def find_merck_sections(text):
    """Split a Merck chapter into sub-sections based on headers."""
    # Merck uses patterns like page breaks and CAPITALIZED HEADERS
    # Split by page markers and then detect section headers
    pages = text.split("--- PAGE ")
    sections = []
    current_section = {"title": "intro", "text": "", "page": 0}

    for page in pages:
        if not page.strip():
            continue
        # Extract page number
        match = re.match(r"(\d+) ---\n(.*)", page, re.DOTALL)
        if not match:
            continue
        page_num = int(match.group(1))
        page_text = match.group(2)

        # Look for section-like headers (lines that are mostly uppercase, short)
        lines = page_text.split("\n")
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            # Detect headers: short lines that are mostly uppercase or title-case
            if (len(stripped) > 3 and len(stripped) < 100 and
                (stripped.isupper() or
                 (stripped[0].isupper() and sum(1 for c in stripped if c.isupper()) > len(stripped) * 0.3))):
                # Save previous section if it has content
                if current_section["text"].strip():
                    sections.append(current_section)
                current_section = {
                    "title": stripped,
                    "text": "",
                    "page": page_num
                }
            else:
                current_section["text"] += stripped + "\n"

    if current_section["text"].strip():
        sections.append(current_section)

    return sections

def search_disease_in_chapters(disease, chapters):
    """Search for a disease across all Merck chapters."""
    matches = []

    for chapter_code, chapter_text in chapters.items():
        chapter_lower = chapter_text.lower()

        for term in disease["searchTerms"]:
            if len(term) < 4:  # Skip very short terms to avoid false positives
                continue

            # Use word boundary matching for longer terms
            pattern = re.escape(term)
            found = list(re.finditer(pattern, chapter_lower))

            if found:
                # Extract context around each match (500 chars before and after)
                for m in found[:3]:  # Max 3 matches per term per chapter
                    start = max(0, m.start() - 300)
                    end = min(len(chapter_text), m.end() + 500)
                    context = chapter_text[start:end].strip()

                    # Find page number
                    page_match = re.findall(r"--- PAGE (\d+) ---", chapter_text[:m.start()])
                    page = int(page_match[-1]) if page_match else 0

                    matches.append({
                        "chapter": chapter_code,
                        "term": term,
                        "page": page,
                        "context": context,
                    })

    # Deduplicate by page
    seen_pages = set()
    unique_matches = []
    for m in matches:
        key = (m["chapter"], m["page"])
        if key not in seen_pages:
            seen_pages.add(key)
            unique_matches.append(m)

    return unique_matches

def main():
    print("Loading diseases...")
    diseases = load_diseases()
    print(f"  Found {len(diseases)} diseases")

    print("Loading Merck chapters...")
    chapters = load_merck_chapters()
    print(f"  Found {len(chapters)} chapters")

    print("Matching diseases to Merck content...")
    results = {}
    matched_count = 0

    for i, disease in enumerate(diseases):
        matches = search_disease_in_chapters(disease, chapters)
        if matches:
            matched_count += 1
            results[disease["slug"]] = {
                "nameEn": disease["nameEn"],
                "nameZh": disease["nameZh"],
                "bodySystem": disease["bodySystem"],
                "matchCount": len(matches),
                "chapters": list(set(m["chapter"] for m in matches)),
                "pages": sorted(set(m["page"] for m in matches)),
                "bestContext": matches[0]["context"][:500] if matches else "",
            }

        if (i + 1) % 50 == 0:
            print(f"  Processed {i+1}/{len(diseases)} ({matched_count} matched)")

    print(f"\nResults: {matched_count}/{len(diseases)} diseases found in Merck Manual")

    # Save results
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Saved to {OUTPUT_FILE}")

    # Print summary by chapter
    chapter_counts = {}
    for slug, data in results.items():
        for ch in data["chapters"]:
            chapter_counts[ch] = chapter_counts.get(ch, 0) + 1

    print("\nMatches by chapter:")
    for ch, count in sorted(chapter_counts.items(), key=lambda x: -x[1]):
        print(f"  {ch}: {count} diseases")

if __name__ == "__main__":
    main()
