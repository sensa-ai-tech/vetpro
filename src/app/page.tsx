import Link from "next/link";
import { db, sqlite } from "@/db";
import { diseases, speciesAffected } from "@/db/schema";
import { eq } from "drizzle-orm";
import SearchBar from "@/components/SearchBar";
import DiseaseCard from "@/components/DiseaseCard";
import { BODY_SYSTEMS, SPECIES_OPTIONS } from "@/lib/constants";

function getAllDiseases() {
  const allDiseases = db.select().from(diseases).all();
  return allDiseases.map((d) => {
    const speciesList = db
      .select()
      .from(speciesAffected)
      .where(eq(speciesAffected.diseaseId, d.id))
      .all();
    return {
      ...d,
      species: speciesList.map((s) => s.speciesCommon),
    };
  });
}

function getReferenceCount(): number {
  const result = sqlite.prepare('SELECT COUNT(*) as count FROM "references"').get() as { count: number };
  return result.count;
}

export default function HomePage() {
  const allDiseases = getAllDiseases();
  const refCount = getReferenceCount();

  // Count by body system
  const systemCounts: Record<string, number> = {};
  for (const d of allDiseases) {
    systemCounts[d.bodySystem] = (systemCounts[d.bodySystem] || 0) + 1;
  }

  return (
    <div className="space-y-10">
      {/* Hero section */}
      <section className="py-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-primary">VetPro</span> 獸醫百科
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          結構化獸醫疾病知識庫 — 彙整 PubMed、ACVIM、WSAVA、IRIS
          等開源資源，持續自動追蹤最新文獻與 guidelines。
        </p>

        {/* Search bar */}
        <div className="mx-auto mt-6 flex justify-center">
          <SearchBar autoFocus />
        </div>

        {/* Stats */}
        <div className="mt-4 flex justify-center gap-6 text-sm text-muted">
          <span>
            <strong className="text-foreground">{allDiseases.length}</strong> 個疾病
          </span>
          <span>
            <strong className="text-foreground">
              {Object.keys(systemCounts).length}
            </strong>{" "}
            個專科
          </span>
          <span>
            <strong className="text-foreground">
              {new Set(allDiseases.flatMap((d) => d.species)).size}
            </strong>{" "}
            個物種
          </span>
          <Link href="/references" className="transition-colors hover:text-primary">
            <strong className="text-foreground">{refCount}</strong> 篇文獻
          </Link>
        </div>
      </section>

      {/* Browse by body system */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">依專科瀏覽</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {BODY_SYSTEMS.filter((sys) => sys.id !== "all" && systemCounts[sys.id]).map((sys) => (
            <Link
              key={sys.id}
              href={`/browse?system=${sys.id}`}
              className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-center transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <span className="text-2xl">{sys.icon}</span>
              <span className="text-xs font-medium">{sys.label}</span>
              {systemCounts[sys.id] && (
                <span className="text-xs text-muted">
                  {systemCounts[sys.id]} 疾病
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Quick species filter */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">快速篩選</h2>
          <div className="flex flex-wrap gap-2">
            {SPECIES_OPTIONS.filter((sp) => sp.id !== "all").map((sp) => (
              <Link
                key={sp.id}
                href={`/browse?species=${encodeURIComponent(sp.id)}`}
                className="rounded-full border border-border px-3 py-1 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {sp.icon} {sp.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* All diseases */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">疾病列表</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allDiseases.map((d) => (
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
      </section>
    </div>
  );
}
