import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/db";
import {
  diseases,
  diseaseAliases,
  speciesAffected,
  diseaseReferences,
  references,
  ontologyMappings,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import StagingTable from "@/components/StagingTable";
import ReferenceList from "@/components/ReferenceList";

function parseJson(val: string | null) {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function getDisease(slug: string) {
  const disease = db
    .select()
    .from(diseases)
    .where(eq(diseases.slug, slug))
    .get();
  if (!disease) return null;

  const aliases = db
    .select()
    .from(diseaseAliases)
    .where(eq(diseaseAliases.diseaseId, disease.id))
    .all();
  const species = db
    .select()
    .from(speciesAffected)
    .where(eq(speciesAffected.diseaseId, disease.id))
    .all();
  const refLinks = db
    .select()
    .from(diseaseReferences)
    .where(eq(diseaseReferences.diseaseId, disease.id))
    .all();
  const refs = refLinks
    .map((link) => {
      const ref = db
        .select()
        .from(references)
        .where(eq(references.id, link.referenceId))
        .get();
      return ref
        ? {
            ...ref,
            authors: ref.authors ? JSON.parse(ref.authors) : null,
            relevance: link.relevance,
            section: link.section,
          }
        : null;
    })
    .filter(Boolean);
  const mappings = db
    .select()
    .from(ontologyMappings)
    .where(eq(ontologyMappings.diseaseId, disease.id))
    .all();

  return {
    ...disease,
    aliases,
    species,
    references: refs,
    ontologyMappings: mappings,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const disease = getDisease(slug);
  if (!disease) return { title: "找不到疾病" };
  return {
    title: `${disease.nameZh || disease.nameEn} — ${disease.nameEn}`,
    description: disease.description || undefined,
  };
}

import {
  SPECIES_LABELS,
  BODY_SYSTEM_LABELS,
  BODY_SYSTEM_SPECIALTY,
} from "@/lib/constants";

const PREVALENCE_LABELS: Record<string, { text: string; className: string }> = {
  common: { text: "常見", className: "text-danger" },
  uncommon: { text: "不常見", className: "text-warning" },
  rare: { text: "罕見", className: "text-muted" },
};

export default async function DiseasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const disease = getDisease(slug);
  if (!disease) notFound();

  const etiology = parseJson(disease.etiology);
  const clinicalSigns = parseJson(disease.clinicalSigns);
  const diagnosis = parseJson(disease.diagnosis);
  const treatment = parseJson(disease.treatment);
  const stagingSystem = parseJson(disease.stagingSystem);
  const diagnosticAlgorithm = parseJson(disease.diagnosticAlgorithm);
  const clinicalPearls = parseJson(disease.clinicalPearls);
  const monitoringItems = parseJson(disease.monitoringItems);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://vetpro.example.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalCondition",
    name: disease.nameEn,
    alternateName: disease.nameZh || undefined,
    description: disease.description || undefined,
    url: `${siteUrl}/disease/${slug}`,
    medicalSpecialty: BODY_SYSTEM_SPECIALTY[disease.bodySystem] || undefined,
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Breadcrumb */}
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-primary">
          首頁
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/browse?system=${disease.bodySystem}`}
          className="hover:text-primary"
        >
          {BODY_SYSTEM_LABELS[disease.bodySystem] || disease.bodySystem}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">
          {disease.nameZh || disease.nameEn}
        </span>
      </nav>

      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {disease.nameZh && <span>{disease.nameZh} </span>}
          <span className="text-muted">{disease.nameEn}</span>
        </h1>
        {disease.aliases.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            又稱：{disease.aliases.map((a) => a.alias).join("、")}
          </p>
        )}
        {disease.description && (
          <p className="mt-3 text-muted">{disease.description}</p>
        )}

        {/* Species badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {disease.species.map((s) => {
            const prev = PREVALENCE_LABELS[s.prevalence || ""];
            return (
              <div
                key={s.id}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {SPECIES_LABELS[s.speciesCommon] || s.speciesCommon}
                </span>
                {prev && (
                  <span
                    className={`ml-2 text-xs font-medium ${prev.className}`}
                  >
                    {prev.text}
                  </span>
                )}
                {s.notes && (
                  <p className="mt-1 text-xs text-muted">{s.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </header>

      {/* Emergency notes banner */}
      {disease.emergencyNotes && (
        <div className="rounded-lg border border-danger/30 bg-danger-light p-4">
          <h3 className="flex items-center gap-2 font-semibold text-danger">
            <span>⚠️</span> 急診注意
          </h3>
          <p className="mt-1 text-sm">{disease.emergencyNotes}</p>
        </div>
      )}

      {/* Content sections */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Etiology */}
          {etiology && (
            <Section title="病因 Etiology">
              {etiology.categories?.map(
                (
                  cat: { name: string; examples: string[] },
                  i: number
                ) => (
                  <div key={i} className="mb-3">
                    <h4 className="mb-1 text-sm font-semibold">{cat.name}</h4>
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-muted">
                      {cat.examples.map((ex: string, j: number) => (
                        <li key={j}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </Section>
          )}

          {/* Clinical Signs */}
          {clinicalSigns && (
            <Section title="臨床症狀 Clinical Signs">
              <div className="grid gap-4 sm:grid-cols-3">
                {clinicalSigns.early && (
                  <SignColumn
                    title="早期"
                    signs={clinicalSigns.early}
                    color="text-accent"
                  />
                )}
                {clinicalSigns.progressive && (
                  <SignColumn
                    title="進展期"
                    signs={clinicalSigns.progressive}
                    color="text-warning"
                  />
                )}
                {clinicalSigns.late && (
                  <SignColumn
                    title="晚期"
                    signs={clinicalSigns.late}
                    color="text-danger"
                  />
                )}
              </div>
            </Section>
          )}

          {/* Diagnosis */}
          {diagnosis && (
            <Section title="診斷 Diagnosis">
              {diagnosis.primaryTests && (
                <div className="mb-3">
                  <h4 className="mb-1 text-sm font-semibold">主要檢測</h4>
                  <div className="space-y-2">
                    {diagnosis.primaryTests.map(
                      (
                        t: { name: string; notes?: string },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{t.name}</span>
                          {t.notes && (
                            <span className="ml-2 text-muted">
                              — {t.notes}
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
              {diagnosis.imaging && diagnosis.imaging.length > 0 && (
                <div className="mb-3">
                  <h4 className="mb-1 text-sm font-semibold">影像學</h4>
                  <div className="space-y-2">
                    {diagnosis.imaging.map(
                      (
                        t: { name: string; notes?: string },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{t.name}</span>
                          {t.notes && (
                            <span className="ml-2 text-muted">
                              — {t.notes}
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
              {diagnosis.additional && diagnosis.additional.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">其他</h4>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {diagnosis.additional.map(
                      (item: string, i: number) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Staging System */}
          {stagingSystem && (
            <Section title="分期系統 Staging">
              <StagingTable staging={stagingSystem} />
            </Section>
          )}

          {/* Treatment */}
          {treatment && (
            <Section title="治療 Treatment">
              {treatment.principles && (
                <div className="mb-4 rounded-lg bg-accent-light/30 p-3">
                  <h4 className="mb-1 text-sm font-semibold text-accent">
                    治療原則
                  </h4>
                  <ul className="list-inside list-disc text-sm">
                    {treatment.principles.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {treatment.medications && (
                <div className="mb-3">
                  <h4 className="mb-2 text-sm font-semibold">藥物</h4>
                  <div className="space-y-2">
                    {treatment.medications.map(
                      (
                        med: {
                          name: string;
                          dose?: string;
                          notes?: string;
                        },
                        i: number
                      ) => (
                        <div
                          key={i}
                          className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                        >
                          <span className="font-semibold text-primary">
                            {med.name}
                          </span>
                          {med.dose && (
                            <span className="ml-2 font-mono text-xs">
                              {med.dose}
                            </span>
                          )}
                          {med.notes && (
                            <p className="mt-0.5 text-xs text-muted">
                              {med.notes}
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
              {treatment.byStage &&
                Object.entries(treatment.byStage).map(
                  ([stage, items]) => (
                    <div key={stage} className="mb-3">
                      <h4 className="mb-1 text-sm font-semibold">
                        {formatStageName(stage)}
                      </h4>
                      <ul className="list-inside list-disc text-sm text-muted">
                        {(items as string[]).map(
                          (item: string, i: number) => (
                            <li key={i}>{item}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )
                )}
              {treatment.general && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">一般處理</h4>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {treatment.general.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Prognosis */}
          {disease.prognosis && (
            <Section title="預後 Prognosis">
              <p className="text-sm">{disease.prognosis}</p>
            </Section>
          )}

          {/* Diagnostic Algorithm */}
          {diagnosticAlgorithm && diagnosticAlgorithm.steps?.length > 0 && (
            <Section title="診斷流程 Diagnostic Algorithm">
              {diagnosticAlgorithm.title && (
                <p className="mb-3 text-sm font-medium text-muted">
                  {diagnosticAlgorithm.title}
                </p>
              )}
              <div className="space-y-3">
                {diagnosticAlgorithm.steps.map(
                  (
                    step: {
                      step: number;
                      action: string;
                      details: string;
                      findings: string[];
                    },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="relative rounded-lg border border-border bg-card p-3 pl-12"
                    >
                      <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                        {step.step}
                      </span>
                      <h4 className="text-sm font-semibold">{step.action}</h4>
                      {step.details && (
                        <p className="mt-1 text-xs text-muted">
                          {step.details}
                        </p>
                      )}
                      {step.findings?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {step.findings.map((f: string, j: number) => (
                            <span
                              key={j}
                              className="rounded-full bg-accent-light/40 px-2 py-0.5 text-xs text-accent"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
              {disease.ddxSource && (
                <p className="mt-2 text-xs text-muted">
                  來源：
                  {disease.ddxSource === "book"
                    ? "專家審閱"
                    : disease.ddxSource === "book-only"
                      ? "專家審閱"
                      : "自動產生"}
                </p>
              )}
            </Section>
          )}

          {/* Clinical Pearls */}
          {clinicalPearls && clinicalPearls.length > 0 && (
            <Section title="臨床重點 Clinical Pearls">
              <div className="space-y-2">
                {clinicalPearls.map((pearl: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm dark:bg-yellow-900/10"
                  >
                    <span className="mt-0.5 shrink-0 text-yellow-500">💡</span>
                    <span>{pearl}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Monitoring Items */}
          {monitoringItems && monitoringItems.length > 0 && (
            <Section title="追蹤監控 Monitoring">
              <ul className="space-y-1.5">
                {monitoringItems.map((item: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="mt-0.5 shrink-0 text-primary">📋</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* References */}
          <Section title="文獻參考">
            <ReferenceList
              references={
                disease.references as {
                  id: string;
                  title: string;
                  authors: string[] | null;
                  journal: string | null;
                  year: number | null;
                  url: string | null;
                  sourceType: string | null;
                  sourceOrg: string | null;
                  relevance: string | null;
                  section: string | null;
                }[]
              }
            />
          </Section>

          {/* Ontology mappings */}
          {disease.ontologyMappings.length > 0 && (
            <Section title="標準術語">
              <div className="space-y-1 text-sm">
                {disease.ontologyMappings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded bg-card px-2 py-1"
                  >
                    <span className="font-mono text-xs text-muted">
                      {m.ontologySource}
                    </span>
                    <span className="font-mono text-xs">
                      {m.ontologyCode}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 border-b border-border pb-2 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SignColumn({
  title,
  signs,
  color,
}: {
  title: string;
  signs: string[];
  color: string;
}) {
  return (
    <div>
      <h4 className={`mb-1 text-sm font-semibold ${color}`}>{title}</h4>
      <ul className="space-y-0.5 text-sm">
        {signs.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current ${color}`}
            />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatStageName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/stage/i, "Stage ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
