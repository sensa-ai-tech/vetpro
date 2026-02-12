"""
Match Merck sections to VetPro diseases and extract enrichment content.
Produces a JSON file mapping each disease to its best Merck section(s).
"""

import json
import re
import yaml
from pathlib import Path
from difflib import SequenceMatcher

SECTIONS_DIR = Path("C:/project/merck-sections")
DISEASES_DIR = Path("C:/project/vetpro/data/diseases")
OUTPUT_FILE = Path("C:/project/vetpro/scripts/merck-disease-content.json")

def normalize(s):
    """Normalize a string for matching."""
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\s]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s

def load_diseases():
    """Load all diseases with search terms."""
    diseases = []
    for f in sorted(DISEASES_DIR.glob("*.yaml")):
        with open(f, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)

        terms = set()
        name_en = data.get("nameEn", "")
        if name_en:
            terms.add(normalize(name_en))
        slug = data.get("slug", f.stem)
        terms.add(normalize(slug.replace("-", " ")))

        for alias in data.get("aliases", []):
            if isinstance(alias, dict) and alias.get("language") == "en":
                terms.add(normalize(alias["alias"]))
            elif isinstance(alias, str):
                terms.add(normalize(alias))

        diseases.append({
            "slug": slug,
            "nameEn": name_en,
            "bodySystem": data.get("bodySystem", ""),
            "terms": [t for t in terms if len(t) > 3],
            "file": str(f),
        })
    return diseases

def load_all_sections():
    """Load all extracted Merck sections."""
    all_sections = []
    for f in sorted(SECTIONS_DIR.glob("*-sections.json")):
        chapter = f.stem.replace("-sections", "")
        with open(f, "r", encoding="utf-8") as fh:
            sections = json.load(fh)
        for s in sections:
            s["chapter"] = chapter
            s["title_normalized"] = normalize(s["title"])
            all_sections.append(s)
    return all_sections

def match_disease_to_sections(disease, sections):
    """Find the best matching Merck sections for a disease."""
    matches = []

    for section in sections:
        section_title = section["title_normalized"]
        section_text_lower = section.get("text", "").lower()
        best_score = 0
        best_term = ""

        for term in disease["terms"]:
            # Exact title match (highest priority)
            if term == section_title:
                score = 1.0
            # Title contains term
            elif term in section_title or section_title in term:
                score = 0.9
            # Fuzzy title match
            else:
                ratio = SequenceMatcher(None, term, section_title).ratio()
                if ratio > 0.7:
                    score = ratio * 0.85
                # Term appears prominently in text (first 500 chars)
                elif term in section_text_lower[:500]:
                    score = 0.6
                else:
                    score = 0

            if score > best_score:
                best_score = score
                best_term = term

        if best_score >= 0.6:
            matches.append({
                "title": section["title"],
                "chapter": section["chapter"],
                "pdf_page": section.get("pdf_page", 0),
                "score": round(best_score, 3),
                "matched_term": best_term,
                "text_length": len(section.get("text", "")),
                "text": section.get("text", "")
            })

    # Sort by score (descending) then text length (prefer longer sections)
    matches.sort(key=lambda x: (-x["score"], -x["text_length"]))
    return matches[:5]  # Top 5 matches

def main():
    print("Loading diseases...")
    diseases = load_diseases()
    print(f"  {len(diseases)} diseases loaded")

    print("Loading Merck sections...")
    sections = load_all_sections()
    print(f"  {len(sections)} sections loaded")

    print("Matching diseases to Merck sections...")
    results = {}
    matched_count = 0
    high_quality_count = 0

    for i, disease in enumerate(diseases):
        matches = match_disease_to_sections(disease, sections)
        if matches:
            matched_count += 1
            # Check if we have a high-quality match (score >= 0.85)
            if matches[0]["score"] >= 0.85:
                high_quality_count += 1

            results[disease["slug"]] = {
                "nameEn": disease["nameEn"],
                "bodySystem": disease["bodySystem"],
                "matchCount": len(matches),
                "bestScore": matches[0]["score"],
                "matches": matches,
            }

        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(diseases)} processed ({matched_count} matched, {high_quality_count} high-quality)")

    # Save results
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n=== Results ===")
    print(f"Total matched: {matched_count}/{len(diseases)}")
    print(f"High-quality matches (score >= 0.85): {high_quality_count}")
    print(f"Output: {OUTPUT_FILE}")

    # Score distribution
    score_buckets = {"1.0": 0, "0.9+": 0, "0.8+": 0, "0.7+": 0, "0.6+": 0}
    for d in results.values():
        s = d["bestScore"]
        if s >= 1.0:
            score_buckets["1.0"] += 1
        elif s >= 0.9:
            score_buckets["0.9+"] += 1
        elif s >= 0.8:
            score_buckets["0.8+"] += 1
        elif s >= 0.7:
            score_buckets["0.7+"] += 1
        else:
            score_buckets["0.6+"] += 1

    print("\nScore distribution:")
    for bucket, count in score_buckets.items():
        print(f"  {bucket}: {count}")

    # Show some high-quality examples
    print("\nTop 10 best matches:")
    sorted_results = sorted(results.items(), key=lambda x: (-x[1]["bestScore"], -x[1]["matches"][0]["text_length"]))
    for slug, data in sorted_results[:10]:
        m = data["matches"][0]
        print(f"  {slug}: score={m['score']}, chapter={m['chapter']}, text={m['text_length']}chars, title='{m['title']}'")

if __name__ == "__main__":
    main()
