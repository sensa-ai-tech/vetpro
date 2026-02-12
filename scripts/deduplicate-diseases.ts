/**
 * deduplicate-diseases.ts
 *
 * Compare curated disease candidates against existing 416 YAML files.
 * Uses fuzzy string matching to detect duplicates.
 * Output: scripts/new-diseases-to-create.json
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const CANDIDATES_FILE = path.join(process.cwd(), "scripts", "disease-candidates.json");
const DISEASES_DIR = path.join(process.cwd(), "data", "diseases");
const OUTPUT_FILE = path.join(process.cwd(), "scripts", "new-diseases-to-create.json");

// ─── Simple string similarity (Dice coefficient) ─────
function bigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.substring(i, i + 2));
  }
  return result;
}

function similarity(a: string, b: string): number {
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;
  let matches = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) matches++;
  }
  return (2 * matches) / (aGrams.size + bGrams.size);
}

// ─── Normalize disease name for comparison ────────────
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-+/g, "-");
}

// ─── Load existing diseases ───────────────────────────
interface ExistingDisease {
  slug: string;
  nameEn: string;
  nameEnNorm: string;
  aliases: string[];
}

function loadExistingDiseases(): ExistingDisease[] {
  const files = fs.readdirSync(DISEASES_DIR).filter(f => f.endsWith(".yaml"));
  const diseases: ExistingDisease[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(DISEASES_DIR, file), "utf-8");
    const data = yaml.load(content) as Record<string, any>;
    const aliases = (data.aliases || []).map((a: any) =>
      normalize(typeof a === "string" ? a : a.alias || "")
    );
    diseases.push({
      slug: data.slug || file.replace(".yaml", ""),
      nameEn: data.nameEn || "",
      nameEnNorm: normalize(data.nameEn || ""),
      aliases,
    });
  }

  return diseases;
}

// ─── Check if candidate is duplicate ──────────────────
function isDuplicate(
  candidateName: string,
  existing: ExistingDisease[],
  slugSet: Set<string>
): { isDup: boolean; matchedSlug?: string; matchScore?: number } {
  const norm = normalize(candidateName);
  const slug = nameToSlug(candidateName);

  // Exact slug match
  if (slugSet.has(slug)) {
    return { isDup: true, matchedSlug: slug, matchScore: 1.0 };
  }

  // Check against all existing names and aliases
  for (const e of existing) {
    // Exact name match
    if (norm === e.nameEnNorm) {
      return { isDup: true, matchedSlug: e.slug, matchScore: 1.0 };
    }

    // Alias match
    if (e.aliases.includes(norm)) {
      return { isDup: true, matchedSlug: e.slug, matchScore: 1.0 };
    }

    // Fuzzy match
    const score = similarity(norm, e.nameEnNorm);
    if (score > 0.85) {
      return { isDup: true, matchedSlug: e.slug, matchScore: score };
    }

    // Check if one contains the other (for cases like "Lymphoma" vs "Multicentric Lymphoma")
    // Only flag as dup if the shorter is very close to the longer
    if (norm.length > 5 && e.nameEnNorm.length > 5) {
      if (norm === e.nameEnNorm || e.nameEnNorm.includes(norm) || norm.includes(e.nameEnNorm)) {
        // Only consider as duplicate if very similar length (within 50%)
        const lenRatio = Math.min(norm.length, e.nameEnNorm.length) / Math.max(norm.length, e.nameEnNorm.length);
        if (lenRatio > 0.7) {
          return { isDup: true, matchedSlug: e.slug, matchScore: lenRatio };
        }
      }
    }
  }

  return { isDup: false };
}

// ─── Assign bodySystem ────────────────────────────────
const CATEGORY_TO_BODY_SYSTEM: Record<string, string> = {
  cardiac: "cardiac",
  hematology: "hematology",
  respiratory: "respiratory",
  gastrointestinal: "gastrointestinal",
  hepatic: "hepatic",
  urinary: "urinary",
  endocrine: "endocrine",
  neurology: "neurology",
  ophthalmology: "ophthalmology",
  ear: "ear",
  dermatology: "dermatology",
  orthopedic: "orthopedic",
  dental: "dental",
  oncology: "oncology",
  infectious: "infectious",
  toxicology: "toxicology",
  immunology: "immunology",
  reproductive: "reproductive",
  emergency: "emergency",
  metabolic: "metabolic",
  behavioral: "behavioral",
  rabbit: "gastrointestinal", // will be refined per disease
  guinea_pig: "gastrointestinal",
  hamster: "gastrointestinal",
  ferret: "endocrine",
  chinchilla: "gastrointestinal",
  rat: "respiratory",
  avian: "respiratory",
  breed_specific: "other",
  congenital: "other",
  surgery: "other",
  pain_rehab: "other",
};

// Refine exotic bodySystem based on disease name keywords
function refineBodySystem(name: string, category: string): string {
  const n = name.toLowerCase();
  if (n.includes("dental") || n.includes("malocclusion") || n.includes("teeth")) return "dental";
  if (n.includes("respiratory") || n.includes("pneumonia") || n.includes("rhinitis")) return "respiratory";
  if (n.includes("gi ") || n.includes("gastric") || n.includes("intestin") || n.includes("stasis") || n.includes("enterit") || n.includes("bloat") || n.includes("colon") || n.includes("crop") || n.includes("cecal")) return "gastrointestinal";
  if (n.includes("dermat") || n.includes("skin") || n.includes("alopecia") || n.includes("mange") || n.includes("mite") || n.includes("bumblefoot") || n.includes("pododermatitis") || n.includes("fur ") || n.includes("lice")) return "dermatology";
  if (n.includes("tumor") || n.includes("lymphoma") || n.includes("carcinoma") || n.includes("sarcoma") || n.includes("adenoma") || n.includes("neoplasia") || n.includes("mass")) return "oncology";
  if (n.includes("urolith") || n.includes("cystit") || n.includes("renal") || n.includes("kidney") || n.includes("urinary")) return "urinary";
  if (n.includes("cardiac") || n.includes("heart") || n.includes("cardiomyopathy") || n.includes("thrombosis")) return "cardiac";
  if (n.includes("adrenal") || n.includes("insulin") || n.includes("diabetes") || n.includes("thyroid") || n.includes("cushing")) return "endocrine";
  if (n.includes("eye") || n.includes("corneal") || n.includes("glaucoma") || n.includes("uveitis") || n.includes("conjunctiv") || n.includes("proptosis") || n.includes("dacryocyst")) return "ophthalmology";
  if (n.includes("otitis") || n.includes("ear ")) return "ear";
  if (n.includes("infect") || n.includes("virus") || n.includes("bacterial") || n.includes("distemper") || n.includes("coccidi") || n.includes("myxomatosis") || n.includes("pasteurell") || n.includes("encephalitozoon") || n.includes("treponematosis") || n.includes("syphilis") || n.includes("vhd") || n.includes("calicivirus") || n.includes("herpesvirus") || n.includes("aspergillosis") || n.includes("pox") || n.includes("bordetella") || n.includes("streptococcal") || n.includes("aleutian") || n.includes("tyzzer") || n.includes("mycoplasma") || n.includes("coronavirus") || n.includes("psittacosis") || n.includes("borna")) return "infectious";
  if (n.includes("poison") || n.includes("toxic") || n.includes("heavy metal") || n.includes("teflon")) return "toxicology";
  if (n.includes("pyometra") || n.includes("dystocia") || n.includes("egg bind") || n.includes("egg perit") || n.includes("ovarian") || n.includes("orchit") || n.includes("pregnancy") || n.includes("mammary") || n.includes("uterine") || n.includes("mast")) return "reproductive";
  if (n.includes("scurvy") || n.includes("vitamin") || n.includes("obesity") || n.includes("heat") || n.includes("hibernat") || n.includes("amyloid")) return "metabolic";
  if (n.includes("seizure") || n.includes("paralysis") || n.includes("head tilt") || n.includes("posterior para") || n.includes("hind limb") || n.includes("stroke") || n.includes("spinal")) return "neurology";
  if (n.includes("abscess")) return "infectious";
  if (n.includes("foreign body")) return "gastrointestinal";
  if (n.includes("feather") || n.includes("self mutilat") || n.includes("barbering") || n.includes("behav")) return "behavioral";
  if (n.includes("flystrike") || n.includes("myiasis")) return "dermatology";
  if (n.includes("gout")) return "metabolic";
  if (n.includes("atherosclerosis")) return "cardiac";
  if (n.includes("liver") || n.includes("hepat")) return "hepatic";

  return CATEGORY_TO_BODY_SYSTEM[category] || "other";
}

// Determine species from category
function getSpecies(category: string, name: string): string[] {
  const n = name.toLowerCase();
  switch (category) {
    case "rabbit": return ["rabbit"];
    case "guinea_pig": return ["guinea pig"];
    case "hamster": return ["hamster"];
    case "ferret": return ["ferret"];
    case "chinchilla": return ["chinchilla"];
    case "rat": return ["rat"];
    case "avian": return ["bird"];
    default: {
      // Check name for species hints
      if (n.includes("feline") || n.includes("cat ") || n.includes("cat)") || n.includes("in cats")) return ["cat"];
      if (n.includes("canine") || n.includes("dog ") || n.includes("dog)")) return ["dog"];
      // Default: both dog and cat for general diseases
      return ["dog", "cat"];
    }
  }
}

// ─── Main ─────────────────────────────────────────────
function main() {
  console.log("=== VetPro Disease Deduplication ===\n");

  // 1. Load existing diseases
  const existing = loadExistingDiseases();
  const existingSlugs = new Set(existing.map(e => e.slug));
  console.log(`Existing diseases: ${existing.length}`);

  // 2. Load candidates
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, "utf-8"));
  const curatedByCategory = candidates.curatedByCategory as Record<string, string[]>;

  // 3. Deduplicate
  let totalCandidates = 0;
  let totalDuplicates = 0;
  let totalNew = 0;
  const newDiseases: {
    nameEn: string;
    slug: string;
    category: string;
    bodySystem: string;
    species: string[];
  }[] = [];
  const duplicates: { name: string; matchedSlug: string; score: number }[] = [];
  const newSlugs = new Set<string>(); // Track new slugs to prevent internal duplicates

  for (const [category, diseases] of Object.entries(curatedByCategory)) {
    for (const name of diseases) {
      totalCandidates++;
      const slug = nameToSlug(name);

      // Skip if we already added this slug in this run
      if (newSlugs.has(slug)) {
        totalDuplicates++;
        continue;
      }

      const result = isDuplicate(name, existing, existingSlugs);
      if (result.isDup) {
        totalDuplicates++;
        duplicates.push({
          name,
          matchedSlug: result.matchedSlug!,
          score: result.matchScore!,
        });
      } else {
        totalNew++;
        const bodySystem = refineBodySystem(name, category);
        const species = getSpecies(category, name);
        newDiseases.push({
          nameEn: name,
          slug,
          category,
          bodySystem,
          species,
        });
        newSlugs.add(slug);
      }
    }
  }

  // 4. Output stats
  console.log(`\nTotal candidates: ${totalCandidates}`);
  console.log(`Duplicates found: ${totalDuplicates}`);
  console.log(`New diseases to create: ${totalNew}`);

  // Category breakdown
  const byCat: Record<string, number> = {};
  const bySystem: Record<string, number> = {};
  for (const d of newDiseases) {
    byCat[d.category] = (byCat[d.category] || 0) + 1;
    bySystem[d.bodySystem] = (bySystem[d.bodySystem] || 0) + 1;
  }

  console.log("\nBy category:");
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log("\nBy bodySystem:");
  for (const [sys, count] of Object.entries(bySystem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sys}: ${count}`);
  }

  // 5. Write output
  const output = {
    totalNew: newDiseases.length,
    totalDuplicates: duplicates.length,
    generatedAt: new Date().toISOString(),
    diseases: newDiseases,
    duplicatesFound: duplicates.slice(0, 50), // Sample of duplicates for review
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nOutput written to: ${OUTPUT_FILE}`);
}

main();
