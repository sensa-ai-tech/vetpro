"""
Merck Veterinary Manual Section Extractor

Extracts disease-specific sections from the Merck Manual by:
1. Building a page-number mapping (book page → PDF page)
2. Finding dedicated disease sections via header pattern matching
3. Outputting structured text for each disease section
"""

import re
import json
import os
from pypdf import PdfReader
from pathlib import Path

PDF_PATH = "C:/project/The-Merck-Veterinary-Manual-11th-Edition.pdf"
OUTPUT_DIR = Path("C:/project/merck-sections")
INDEX_FILE = Path("C:/project/merck-sections/index.json")

def extract_all_text(reader, start_page, end_page):
    """Extract text from a range of PDF pages."""
    text_parts = []
    for i in range(start_page, min(end_page, len(reader.pages))):
        page_text = reader.pages[i].extract_text()
        if page_text:
            text_parts.append((i + 1, page_text))  # 1-indexed PDF page
    return text_parts

def find_section_headers(page_texts):
    """
    Find disease section headers in Merck Manual text.
    Headers are typically ALL CAPS or Title Case lines at the start of sections.
    """
    sections = []
    current_section = None

    for pdf_page, text in page_texts:
        lines = text.split("\n")
        for line in lines:
            stripped = line.strip()
            if not stripped or len(stripped) < 3:
                continue

            # Detect section headers: ALL CAPS lines of reasonable length
            # that look like disease names (not page numbers or short labels)
            is_header = False

            # Pattern 1: ALL CAPS header (e.g., "HEARTWORM DISEASE")
            if (stripped.isupper() and
                5 < len(stripped) < 80 and
                not stripped.startswith("---") and
                not re.match(r'^\d+\s', stripped) and
                re.search(r'[A-Z]{3,}', stripped)):
                is_header = True

            # Pattern 2: Title with parenthetical synonym
            # e.g., "Dilated Cardiomyopathy (DCM)"
            if (not is_header and
                re.match(r'^[A-Z][a-z]', stripped) and
                10 < len(stripped) < 100 and
                not stripped.startswith("---")):
                # Check if it looks like a subsection header
                words = stripped.split()
                if len(words) >= 2 and len(words) <= 10:
                    cap_words = sum(1 for w in words if w[0].isupper())
                    if cap_words >= len(words) * 0.5:
                        is_header = True

            if is_header:
                if current_section:
                    sections.append(current_section)
                current_section = {
                    "title": stripped,
                    "pdf_page": pdf_page,
                    "text": ""
                }
            elif current_section:
                current_section["text"] += stripped + "\n"

    if current_section:
        sections.append(current_section)

    return sections

def main():
    print("Loading PDF...")
    reader = PdfReader(PDF_PATH)
    total_pages = len(reader.pages)
    print(f"  Total pages: {total_pages}")

    # Chapter definitions (PDF page 0-indexed start, end)
    chapters = {
        "CIR": ("Circulatory System", 41, 146),
        "DIG": ("Digestive System", 146, 527),
        "EE": ("Eye and Ear", 527, 577),
        "END": ("Endocrine System", 577, 625),
        "GEN": ("Generalized Conditions", 625, 851),
        "IMM": ("Immune System", 851, 873),
        "ITG": ("Integumentary System", 873, 1023),
        "MET": ("Metabolic Disorders", 1023, 1071),
        "MUS": ("Musculoskeletal System", 1071, 1247),
        "NER": ("Nervous System", 1247, 1361),
        "REP": ("Reproductive System", 1361, 1449),
        "RES": ("Respiratory System", 1449, 1533),
        "URN": ("Urinary System", 1533, 1573),
        "BEH": ("Behavior", 1573, 1623),
        "EMG": ("Emergency Medicine", 1697, 1771),
        "EXL": ("Exotic and Lab Animals", 1771, 2101),
        "TOX": ("Toxicology", 2985, 3213),
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_sections = {}

    for code, (name, start, end) in chapters.items():
        print(f"\nProcessing {code}: {name} (PDF pages {start+1}-{end})...")
        page_texts = extract_all_text(reader, start, end)
        sections = find_section_headers(page_texts)

        # Save sections for this chapter
        chapter_sections = []
        for s in sections:
            chapter_sections.append({
                "title": s["title"],
                "pdf_page": s["pdf_page"],
                "text_length": len(s["text"]),
                "text_preview": s["text"][:200]
            })

        all_sections[code] = {
            "name": name,
            "section_count": len(sections),
            "sections": chapter_sections
        }

        # Save full text for each chapter's sections
        chapter_file = OUTPUT_DIR / f"{code}-sections.json"
        full_sections = []
        for s in sections:
            if len(s["text"]) > 100:  # Skip very short sections
                full_sections.append({
                    "title": s["title"],
                    "pdf_page": s["pdf_page"],
                    "text": s["text"]
                })

        with open(chapter_file, "w", encoding="utf-8") as f:
            json.dump(full_sections, f, ensure_ascii=False, indent=2)

        print(f"  Found {len(sections)} sections ({len(full_sections)} with content)")

    # Save index
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(all_sections, f, ensure_ascii=False, indent=2)

    print(f"\n=== Summary ===")
    total_sections = sum(ch["section_count"] for ch in all_sections.values())
    print(f"Total sections found: {total_sections}")
    print(f"Index saved to: {INDEX_FILE}")

if __name__ == "__main__":
    main()
