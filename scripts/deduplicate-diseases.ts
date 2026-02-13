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
  // Wave 2 categories
  breed_specific_dog_w2: "other",
  breed_specific_cat_w2: "other",
  cardiac_w2: "cardiac",
  respiratory_w2: "respiratory",
  gastrointestinal_w2: "gastrointestinal",
  hepatic_w2: "hepatic",
  renal_w2: "renal",
  endocrine_w2: "endocrine",
  neurology_w2: "neurology",
  ophthalmology_w2: "ophthalmology",
  orthopedic_w2: "orthopedic",
  dermatology_w2: "dermatology",
  oncology_w2: "oncology",
  infectious_w2: "infectious",
  toxicology_w2: "toxicology",
  emergency_w2: "emergency",
  immunology_w2: "immunology",
  reproductive_w2: "reproductive",
  behavioral_w2: "behavioral",
  ear_w2: "ear",
  vascular_w2: "vascular",
  electrolyte_w2: "electrolyte",
  rabbit_w2: "gastrointestinal",
  guinea_pig_w2: "gastrointestinal",
  hamster_w2: "gastrointestinal",
  ferret_w2: "endocrine",
  chinchilla_w2: "gastrointestinal",
  rat_w2: "respiratory",
  avian_w2: "respiratory",
  dental_w2: "dental",
  surgery_w2: "other",
  preventive_w2: "other",
  diagnostic_w2: "other",
  neonatal_w2: "other",
  nutrition_w2: "metabolic",
};

// Refine exotic bodySystem based on disease name keywords
function refineBodySystem(name: string, category: string): string {
  const n = name.toLowerCase();
  // Breed-specific refinement: orthopedic keywords
  if (n.includes("dysplasia") && (n.includes("hip") || n.includes("elbow"))) return "orthopedic";
  if (n.includes("patellar luxation") || n.includes("legg calve") || n.includes("osteochondri") || n.includes("cruciate")) return "orthopedic";
  if (n.includes("myopathy") || n.includes("myositis") || n.includes("muscular dystrophy") || n.includes("myasthenia")) return "neurology";
  if (n.includes("portosystemic shunt")) return "hepatic";
  if (n.includes("tracheal collapse") || n.includes("brachycephalic")) return "respiratory";
  if (n.includes("hydrocephalus") || n.includes("encephalitis") || n.includes("meningitis") || n.includes("epilepsy") || n.includes("ataxia") || n.includes("neuropathy") || n.includes("neuronal ceroid") || n.includes("ivdd") || n.includes("hemivertebra") || n.includes("spondyl") || n.includes("intervertebral disc") || n.includes("shaker syndrome") || n.includes("cramp") || n.includes("collapse") || n.includes("rage syndrome") || n.includes("spinal") || n.includes("degenerative myelopathy")) return "neurology";
  if (n.includes("cherry eye") || n.includes("entropion") || n.includes("ectropion") || n.includes("keratitis") || n.includes("keratoconjunctivitis") || n.includes("retinal") || n.includes("cataracts") || n.includes("corneal dystrophy") || n.includes("pigmentary keratopathy") || n.includes("strabismus") || n.includes("nystagmus")) return "ophthalmology";
  if (n.includes("hemolytic anemia") || n.includes("hemophilia") || n.includes("von willebrand") || n.includes("thrombocytopenia") || n.includes("coagulopathy") || n.includes("pk deficiency") || n.includes("pyruvate kinase") || n.includes("phosphofructokinase") || n.includes("neutropenia") || n.includes("neutrophil")) return "hematology";
  if (n.includes("ichthyosis") || n.includes("sebaceous adenitis") || n.includes("dermatomyositis") || n.includes("furunculosis") || n.includes("acne") || n.includes("acanthosis") || n.includes("pattern baldness") || n.includes("alopecia x") || n.includes("cutaneous mucinosis") || n.includes("lethal acrodermatitis") || n.includes("zinc responsive dermatosis")) return "dermatology";
  if (n.includes("hyperuricosuria") || n.includes("stone disease") || n.includes("cystinuria") || n.includes("fanconi") || n.includes("renal dysplasia") || n.includes("familial nephropathy") || n.includes("polycystic kidney") || n.includes("pkd")) return "urinary";
  if (n.includes("deafness")) return "ear";
  if (n.includes("uveodermatologic") || n.includes("immunodeficiency") || n.includes("autoimmune") || n.includes("immunoproliferative")) return "immunology";
  if (n.includes("hypertrophic cardiomyopathy") || n.includes("dilated cardiomyopathy") || n.includes("subaortic") || n.includes("subvalvular") || n.includes("tricuspid valve") || n.includes("heart disease")) return "cardiac";
  if (n.includes("osteosarcoma") || n.includes("histiocytic sarcoma") || n.includes("hemangiosarcoma") || n.includes("mast cell tumor") || n.includes("bladder cancer")) return "oncology";
  if (n.includes("ivermectin sensit") || n.includes("mdr1") || n.includes("hepatotoxicity")) return "toxicology";
  if (n.includes("hypoglycemia")) return "metabolic";
  if (n.includes("glycogen storage") || n.includes("amyloidosis") || n.includes("hyperlipidemia") || n.includes("obesity") || n.includes("hypokalemic polymyopathy")) return "metabolic";
  if (n.includes("exocrine pancreatic") || n.includes("gluten sensitive") || n.includes("enteropathy")) return "gastrointestinal";
  if (n.includes("ear disease") || n.includes("ear infection")) return "ear";
  if (n.includes("dental") || n.includes("malocclusion") || n.includes("teeth") || n.includes("stomatitis") || n.includes("gingivitis")) return "dental";
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

  // Additional keywords for Wave 2 categories
  if (n.includes("anesthesia") || n.includes("sedation") || n.includes("analgesia") || n.includes("nerve block")) return "emergency";
  if (n.includes("vaccination") || n.includes("vaccine") || n.includes("wellness") || n.includes("prevention") || n.includes("deworming") || n.includes("microchip")) return "other";
  if (n.includes("radiograph") || n.includes("ultrasound") || n.includes("ct scan") || n.includes("mri ") || n.includes("cytology") || n.includes("histopath") || n.includes("blood gas") || n.includes("urinalysis") || n.includes("cbc ") || n.includes("chemistry panel") || n.includes("snap test") || n.includes("pcr test") || n.includes("titer") || n.includes("cortisol") || n.includes("acth ") || n.includes("dexamethasone") || n.includes("fructosamine") || n.includes("glucose curve") || n.includes("coombs") || n.includes("ana test") || n.includes("serology") || n.includes("scintigraphy") || n.includes("fluoroscopy") || n.includes("endoscopy") || n.includes("bronchoscopy") || n.includes("rhinoscopy") || n.includes("cystoscopy") || n.includes("arthroscopy") || n.includes("laparoscopy") || n.includes("thoracoscopy")) return "other";
  if (n.includes("neonatal") || n.includes("neonat") || n.includes("orphan puppy") || n.includes("orphan kitten") || n.includes("fading puppy") || n.includes("fading kitten") || n.includes("swimmer puppy") || n.includes("flat chested kitten") || n.includes("puppy strangles") || n.includes("bottle feeding")) return "other";
  if (n.includes("diet") || n.includes("nutrition") || n.includes("feeding tube") || n.includes("parenteral nutrition") || n.includes("enteral feeding") || n.includes("caloric") || n.includes("supplementation") || n.includes("probiotics") || n.includes("prebiotics") || n.includes("omega 3") || n.includes("glucosamine")) return "metabolic";
  if (n.includes("ovariohysterectomy") || n.includes("ovariectomy") || n.includes("castration") || n.includes("cryptorchid surg") || n.includes("cesarean") || n.includes("mastectomy") || n.includes("splenectomy") || n.includes("biopsy") || n.includes("aspirate") || n.includes("wound debride") || n.includes("wound vacuum") || n.includes("wound healing") || n.includes("surgical site") || n.includes("surgical drain") || n.includes("chest tube")) return "other";

  return CATEGORY_TO_BODY_SYSTEM[category] || "other";
}

// Determine species from category
function getSpecies(category: string, name: string): string[] {
  const n = name.toLowerCase();
  switch (category) {
    case "rabbit": case "rabbit_w2": return ["rabbit"];
    case "guinea_pig": case "guinea_pig_w2": return ["guinea pig"];
    case "hamster": case "hamster_w2": return ["hamster"];
    case "ferret": case "ferret_w2": return ["ferret"];
    case "chinchilla": case "chinchilla_w2": return ["chinchilla"];
    case "rat": case "rat_w2": return ["rat"];
    case "avian": case "avian_w2": return ["bird"];
    default: {
      // Check name for species hints
      if (n.includes("feline") || n.includes("cat ") || n.includes("cat)") || n.includes("in cats")) return ["cat"];
      if (n.includes("canine") || n.includes("dog ") || n.includes("dog)")) return ["dog"];
      // Cat breed names
      const catBreeds = ["persian", "siamese", "maine coon", "ragdoll", "bengal", "abyssinian",
        "burmese", "scottish fold", "sphynx", "devon rex", "cornish rex", "norwegian forest",
        "british shorthair", "birman", "manx", "somali", "oriental shorthair", "tonkinese",
        "russian blue", "chartreux", "himalayan", "exotic shorthair"];
      if (catBreeds.some(b => n.includes(b))) return ["cat"];
      // Dog breed names
      const dogBreeds = ["labrador", "golden retriever", "german shepherd", "bulldog", "pug",
        "boston terrier", "yorkshire", "maltese", "chihuahua", "pomeranian", "poodle",
        "dachshund", "jack russell", "shih tzu", "cavalier", "beagle", "border collie",
        "australian shepherd", "cocker spaniel", "springer spaniel", "staffordshire",
        "bull terrier", "basenji", "shar-pei", "shar pei", "dalmatian", "great dane",
        "newfoundland", "saint bernard", "irish wolfhound", "bernese", "weimaraner",
        "rottweiler", "doberman", "westie", "west highland", "cairn terrier",
        "scottish terrier", "airedale", "kerry blue", "greyhound", "whippet",
        "siberian husky", "akita", "collie", "shetland", "belgian malinois", "belgian tervuren",
        "schnauzer", "irish setter", "shiba inu", "bichon", "havanese", "papillon",
        "chinese crested", "lhasa apso", "rhodesian ridgeback"];
      if (dogBreeds.some(b => n.includes(b))) return ["dog"];
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
