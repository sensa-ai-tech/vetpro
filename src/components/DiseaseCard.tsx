import Link from "next/link";

const BODY_SYSTEM_LABELS: Record<string, string> = {
  renal: "腎臟",
  cardiac: "心臟",
  endocrine: "內分泌",
  gastrointestinal: "腸胃",
  hematology: "血液",
  dermatology: "皮膚",
  neurology: "神經",
  respiratory: "呼吸",
  orthopedic: "骨科",
  ophthalmology: "眼科",
  infectious: "傳染病",
  oncology: "腫瘤",
};

const BODY_SYSTEM_COLORS: Record<string, string> = {
  renal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cardiac: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  endocrine: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  gastrointestinal: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  hematology: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  dermatology: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  neurology: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  respiratory: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  orthopedic: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  ophthalmology: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  infectious: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  oncology: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐕",
  cat: "🐈",
  horse: "🐴",
  rabbit: "🐰",
};

interface DiseaseCardProps {
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  species: string[];
}

export default function DiseaseCard({
  slug,
  nameEn,
  nameZh,
  bodySystem,
  description,
  species,
}: DiseaseCardProps) {
  return (
    <Link
      href={`/disease/${slug}`}
      className="group block rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${BODY_SYSTEM_COLORS[bodySystem] || "bg-gray-100 text-gray-800"}`}
        >
          {BODY_SYSTEM_LABELS[bodySystem] || bodySystem}
        </span>
        <span className="text-sm">
          {species.map((s) => SPECIES_EMOJI[s] || s).join(" ")}
        </span>
      </div>

      <h3 className="font-semibold leading-tight group-hover:text-primary">
        {nameZh && <span>{nameZh}</span>}
        <span className="ml-1 text-sm font-normal text-muted">{nameEn}</span>
      </h3>

      {description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
    </Link>
  );
}
