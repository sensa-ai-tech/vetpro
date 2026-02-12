import Link from "next/link";
import {
  BODY_SYSTEM_LABELS,
  BODY_SYSTEM_COLORS,
  SPECIES_EMOJI,
} from "@/lib/constants";

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
