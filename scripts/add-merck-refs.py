"""
Add Merck Manual reference page numbers to all matched disease YAML files.
Adds a merckManualRef field with the 11th edition page number.
"""

import json
import re
from pathlib import Path

MATCH_FILE = Path("C:/project/vetpro/scripts/merck-disease-content.json")
DISEASES_DIR = Path("C:/project/vetpro/data/diseases")

def main():
    with open(MATCH_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)

    updated = 0
    skipped = 0

    for slug, data in matches.items():
        yaml_file = DISEASES_DIR / f"{slug}.yaml"
        if not yaml_file.exists():
            continue

        # Get the best match page number
        best_match = data["matches"][0]
        pdf_page = best_match["pdf_page"]
        # Calculate approximate book page (PDF page - ~41 offset for front matter)
        # The offset varies; we'll store the PDF page as-is with a note
        merck_chapter = best_match["chapter"]
        merck_title = best_match["title"]

        with open(yaml_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Skip if already has merckManualRef
        if "merckManualRef:" in content:
            skipped += 1
            continue

        # Add merckManualRef at the end of the file
        ref_block = f"""
merckManualRef:
  edition: 11
  chapter: "{merck_chapter}"
  sectionTitle: "{merck_title}"
  pdfPage: {pdf_page}
"""
        # Ensure file ends with newline, then add ref
        content = content.rstrip() + "\n" + ref_block.strip() + "\n"

        with open(yaml_file, "w", encoding="utf-8") as f:
            f.write(content)

        updated += 1

    print(f"Updated: {updated}")
    print(f"Skipped (already has ref): {skipped}")
    print(f"Total matched: {len(matches)}")

if __name__ == "__main__":
    main()
