// === Body System Definitions ===

export const BODY_SYSTEMS = [
  { id: "all", label: "全部", icon: "📋" },
  { id: "cardiac", label: "心臟", icon: "❤️" },
  { id: "respiratory", label: "呼吸", icon: "💨" },
  { id: "gastrointestinal", label: "腸胃", icon: "🫁" },
  { id: "hepatic", label: "肝膽", icon: "🫀" },
  { id: "renal", label: "腎臟/泌尿", icon: "🫘" },
  { id: "endocrine", label: "內分泌", icon: "🧬" },
  { id: "neurology", label: "神經", icon: "🧠" },
  { id: "ophthalmology", label: "眼科", icon: "👁️" },
  { id: "orthopedic", label: "骨科", icon: "🦴" },
  { id: "dermatology", label: "皮膚", icon: "🧴" },
  { id: "oncology", label: "腫瘤", icon: "🔬" },
  { id: "hematology", label: "血液", icon: "🩸" },
  { id: "infectious", label: "傳染病", icon: "🦠" },
  { id: "toxicology", label: "毒物", icon: "☠️" },
  { id: "dental", label: "牙科", icon: "🦷" },
  { id: "behavioral", label: "行為", icon: "🧩" },
  { id: "reproductive", label: "生殖", icon: "🍼" },
  { id: "emergency", label: "急診", icon: "🚨" },
  { id: "immunology", label: "免疫", icon: "🛡️" },
  { id: "metabolic", label: "代謝", icon: "⚗️" },
  { id: "ear", label: "耳科", icon: "👂" },
  { id: "electrolyte", label: "電解質", icon: "⚡" },
  { id: "vascular", label: "血管", icon: "🩻" },
  { id: "exotic", label: "特殊寵物", icon: "🐾" },
  { id: "other", label: "其他", icon: "📁" },
] as const;

export const BODY_SYSTEM_LABELS: Record<string, string> = Object.fromEntries(
  BODY_SYSTEMS.filter((s) => s.id !== "all").map((s) => [s.id, s.label]),
);

export const BODY_SYSTEM_COLORS: Record<string, string> = {
  renal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cardiac: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  endocrine:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  gastrointestinal:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  hematology:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  dermatology:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  neurology:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  respiratory:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  orthopedic:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  ophthalmology:
    "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  infectious:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  oncology:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  hepatic:
    "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  toxicology:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  dental: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  behavioral:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  reproductive:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  emergency:
    "bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  immunology:
    "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  metabolic:
    "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  exotic:
    "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
  ear: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300",
  electrolyte:
    "bg-blue-200 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  vascular:
    "bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  other:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

// === Species Definitions ===

export const SPECIES_OPTIONS = [
  { id: "all", label: "全部物種", icon: "🐾" },
  { id: "dog", label: "犬", icon: "🐕" },
  { id: "cat", label: "貓", icon: "🐈" },
  { id: "rabbit", label: "兔", icon: "🐰" },
  { id: "ferret", label: "雪貂", icon: "🦡" },
  { id: "guinea pig", label: "天竺鼠", icon: "🐹" },
  { id: "hamster", label: "倉鼠", icon: "🐀" },
  { id: "chinchilla", label: "絨鼠", icon: "🐿️" },
  { id: "rat", label: "大鼠", icon: "🐁" },
  { id: "bird", label: "鳥", icon: "🐦" },
] as const;

export const SPECIES_EMOJI: Record<string, string> = Object.fromEntries(
  SPECIES_OPTIONS.filter((s) => s.id !== "all").map((s) => [s.id, s.icon]),
);

export const SPECIES_LABELS: Record<string, string> = Object.fromEntries(
  SPECIES_OPTIONS.filter((s) => s.id !== "all").map((s) => [
    s.id,
    `${s.icon} ${s.label}`,
  ]),
);

// === Schema.org Specialty Mappings ===

export const BODY_SYSTEM_SPECIALTY: Record<string, string> = {
  renal: "https://schema.org/Renal",
  cardiac: "https://schema.org/Cardiovascular",
  endocrine: "https://schema.org/Endocrine",
  gastrointestinal: "https://schema.org/Gastroenterologic",
  hematology: "https://schema.org/Hematologic",
  dermatology: "https://schema.org/Dermatologic",
  neurology: "https://schema.org/Neurologic",
  respiratory: "https://schema.org/Pulmonary",
  orthopedic: "https://schema.org/Musculoskeletal",
  ophthalmology: "https://schema.org/Optometric",
  infectious: "https://schema.org/InfectiousDisease",
  oncology: "https://schema.org/Oncologic",
  hepatic: "https://schema.org/Gastroenterologic",
  toxicology: "https://schema.org/Toxicologic",
  dental: "https://schema.org/Dentistry",
  reproductive: "https://schema.org/Gynecologic",
  emergency: "https://schema.org/Emergency",
};
