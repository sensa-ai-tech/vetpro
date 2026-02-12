"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import DiseaseCard from "@/components/DiseaseCard";
import SpeciesDropdown from "@/components/SpeciesDropdown";
import { BODY_SYSTEMS } from "@/lib/constants";

interface DiseaseItem {
  id: string;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  species: string[];
}

function BrowseContent() {
  const searchParams = useSearchParams();
  const initialSystem = searchParams.get("system") || "all";
  const initialSpecies = searchParams.get("species") || "all";

  const [diseases, setDiseases] = useState<DiseaseItem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState(initialSystem);
  const [selectedSpecies, setSelectedSpecies] = useState(initialSpecies);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDiseases() {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedSystem !== "all") params.set("bodySystem", selectedSystem);
      if (selectedSpecies !== "all") params.set("species", selectedSpecies);

      const res = await fetch(`/api/diseases?${params}`);
      const data = await res.json();
      setDiseases(data);
      setLoading(false);
    }
    fetchDiseases();
  }, [selectedSystem, selectedSpecies]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">瀏覽疾病</h1>
        <p className="mt-1 text-sm text-muted">
          依專科系統或物種篩選，快速找到你需要的疾病資料。
        </p>
      </div>

      {/* Search */}
      <SearchBar />

      {/* Filters */}
      <div className="space-y-3">
        {/* Body system filter */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted">
            專科系統
          </label>
          <div className="flex flex-wrap gap-1.5">
            {BODY_SYSTEMS.map((sys) => (
              <button
                key={sys.id}
                onClick={() => setSelectedSystem(sys.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-all ${
                  selectedSystem === sys.id
                    ? "border-primary bg-primary-light font-medium text-primary"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {sys.icon} {sys.label}
              </button>
            ))}
          </div>
        </div>

        {/* Species filter */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted">
            物種
          </label>
          <SpeciesDropdown
            value={selectedSpecies}
            onSelect={setSelectedSpecies}
          />
        </div>
      </div>

      {/* Results */}
      <div>
        <p className="mb-3 text-sm text-muted">
          找到{" "}
          <strong className="text-foreground">{diseases.length}</strong>{" "}
          個疾病
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : diseases.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-12 text-center text-muted">
            <p>目前此篩選條件下沒有疾病資料。</p>
            <Link
              href="/browse"
              className="mt-2 inline-block text-primary hover:underline"
            >
              清除篩選
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {diseases.map((d) => (
              <DiseaseCard
                key={d.slug}
                slug={d.slug}
                nameEn={d.nameEn}
                nameZh={d.nameZh}
                bodySystem={d.bodySystem}
                description={d.description}
                species={d.species}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}
