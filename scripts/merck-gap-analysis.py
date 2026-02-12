"""
Analyze gaps between existing YAML content and Merck Manual content.
For each disease, identify what Merck mentions that the YAML doesn't cover.
Focus on: prognosis, differential diagnosis, epidemiology, key drug doses.
"""

import json
import re
import yaml
from pathlib import Path

MATCH_FILE = Path("C:/project/vetpro/scripts/merck-disease-content.json")
DISEASES_DIR = Path("C:/project/vetpro/data/diseases")
OUTPUT_FILE = Path("C:/project/vetpro/scripts/merck-gaps.json")

# Keywords that indicate important clinical content in Merck text
PROGNOSIS_KEYWORDS = [
    "prognosis", "mortality", "survival", "fatal", "guarded", "poor prognosis",
    "good prognosis", "favorable", "unfavorable", "death rate", "cure rate"
]
DIFF_DX_KEYWORDS = [
    "differential", "differentiate", "distinguish", "rule out", "must be differentiated",
    "should be considered", "confused with"
]
EPIDEMIOLOGY_KEYWORDS = [
    "prevalence", "incidence", "worldwide", "endemic", "sporadic", "outbreak",
    "zoonotic", "reportable", "notifiable", "seasonal"
]
TREATMENT_DRUG_PATTERN = re.compile(
    r'(\w+(?:\s+\w+)?)\s*\(\s*(\d+[\.\d]*)\s*(?:mg|mcg|IU)/kg',
    re.IGNORECASE
)

def extract_info_from_merck(merck_text):
    """Extract structured info categories from Merck text."""
    text_lower = merck_text.lower()
    info = {
        "has_prognosis": any(kw in text_lower for kw in PROGNOSIS_KEYWORDS),
        "has_diff_dx": any(kw in text_lower for kw in DIFF_DX_KEYWORDS),
        "has_epidemiology": any(kw in text_lower for kw in EPIDEMIOLOGY_KEYWORDS),
        "drug_doses": [],
        "text_length": len(merck_text),
    }

    # Extract drug doses
    for m in TREATMENT_DRUG_PATTERN.finditer(merck_text):
        info["drug_doses"].append(f"{m.group(1)} ({m.group(2)} mg/kg)")

    return info

def check_yaml_completeness(yaml_data):
    """Check what fields exist in the YAML."""
    return {
        "has_prognosis": bool(yaml_data.get("prognosis")),
        "has_diff_dx": bool(yaml_data.get("differentialDiagnoses")),
        "has_staging": bool(yaml_data.get("stagingSystem")),
        "has_treatment": bool(yaml_data.get("treatment")),
        "has_epidemiology": "prevalence" in str(yaml_data.get("species", [])),
        "description_length": len(yaml_data.get("description", "")),
    }

def main():
    with open(MATCH_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)

    gaps = {}
    enrichment_candidates = []

    for slug, match_data in matches.items():
        yaml_file = DISEASES_DIR / f"{slug}.yaml"
        if not yaml_file.exists():
            continue

        with open(yaml_file, "r", encoding="utf-8") as f:
            yaml_data = yaml.safe_load(f.read())

        # Combine all Merck text for this disease
        merck_text = "\n".join(m["text"] for m in match_data["matches"])

        yaml_status = check_yaml_completeness(yaml_data)
        merck_info = extract_info_from_merck(merck_text)

        # Identify gaps: Merck has info that YAML doesn't
        gap_items = []
        if merck_info["has_prognosis"] and not yaml_status["has_prognosis"]:
            gap_items.append("prognosis")
        if merck_info["has_diff_dx"] and not yaml_status["has_diff_dx"]:
            gap_items.append("differentialDiagnoses")
        if merck_info["drug_doses"] and not yaml_status["has_treatment"]:
            gap_items.append("treatment_doses")
        if merck_info["has_epidemiology"] and not yaml_status["has_epidemiology"]:
            gap_items.append("epidemiology")

        if gap_items:
            gaps[slug] = {
                "nameEn": match_data["nameEn"],
                "gaps": gap_items,
                "merck_text_length": merck_info["text_length"],
                "drug_doses_found": merck_info["drug_doses"][:5],
                "yaml_description_length": yaml_status["description_length"],
                "bestScore": match_data["bestScore"],
            }

            # High-value enrichment candidates: high-quality match + multiple gaps
            if match_data["bestScore"] >= 0.85 and len(gap_items) >= 2:
                enrichment_candidates.append(slug)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(gaps, f, ensure_ascii=False, indent=2)

    with open("scripts/enrichment-candidates.txt", "w", encoding="utf-8") as f:
        f.write(f"Total gaps found: {len(gaps)}\n")
        f.write(f"High-value enrichment candidates: {len(enrichment_candidates)}\n\n")

        # Gap type distribution
        gap_counts = {}
        for d in gaps.values():
            for g in d["gaps"]:
                gap_counts[g] = gap_counts.get(g, 0) + 1
        f.write("Gap distribution:\n")
        for g, c in sorted(gap_counts.items(), key=lambda x: -x[1]):
            f.write(f"  {g}: {c} diseases\n")

        f.write(f"\nTop enrichment candidates ({len(enrichment_candidates)}):\n")
        for slug in enrichment_candidates[:50]:
            d = gaps[slug]
            f.write(f"  {slug}: gaps={d['gaps']}, merck={d['merck_text_length']}chars\n")

if __name__ == "__main__":
    main()
