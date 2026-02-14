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

// ─── 安全型別轉換工具 ────────────────────────────────────────

function parseJson(val: string | null) {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/** 任何值 → 可渲染字串（防止物件進入 JSX） */
function toStr(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    // {name, notes} pattern
    if (obj.name) {
      return obj.notes ? `${obj.name} — ${obj.notes}` : String(obj.name);
    }
    // {general: "..."} pattern (prognosis)
    if (obj.general && typeof obj.general === "string") return obj.general;
    // key-value single entry like {"low dose": "sedation"}
    const keys = Object.keys(obj);
    if (keys.length === 1) return `${keys[0]}: ${obj[keys[0]]}`;
    return JSON.stringify(val);
  }
  return String(val);
}

/** 確保值是陣列；單一字串 → 包成陣列；null → [] */
function toArray(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") return val.split(/[。；;]\s*/).filter(Boolean);
  return [val];
}

/** 確保 diagnosis test 是 {name, notes?} 格式 */
function toTestObj(val: unknown): { name: string; notes?: string } {
  if (typeof val === "string") return { name: val };
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    return {
      name: String(obj.name ?? ""),
      notes: obj.notes ? String(obj.notes) : undefined,
    };
  }
  return { name: String(val ?? "") };
}

// ─── 資料查詢 ────────────────────────────────────────────────

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

// ─── Metadata ────────────────────────────────────────────────

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

// ─── Page Component ──────────────────────────────────────────

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

  // 安全取得 prognosis（DB 中可能是純字串或 JSON 如 '{"general":"..."}' ）
  const prognosisRaw = disease.prognosis
    ? parseJson(disease.prognosis) ?? disease.prognosis
    : null;
  const prognosisText = prognosisRaw ? toStr(prognosisRaw) : null;

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
          <p className="mt-1 text-sm">{toStr(disease.emergencyNotes)}</p>
        </div>
      )}

      {/* Content sections */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Etiology */}
          {etiology && etiology.categories?.length > 0 && (
            <Section title="病因 Etiology">
              {etiology.categories.map(
                (cat: { name: unknown; examples: unknown }, i: number) => (
                  <div key={i} className="mb-3">
                    <h4 className="mb-1 text-sm font-semibold">
                      {toStr(cat.name)}
                    </h4>
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-muted">
                      {toArray(cat.examples).map(
                        (ex: unknown, j: number) => (
                          <li key={j}>{toStr(ex)}</li>
                        )
                      )}
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
                {clinicalSigns.early?.length > 0 && (
                  <SignColumn
                    title="早期"
                    signs={toArray(clinicalSigns.early).map(toStr)}
                    color="text-accent"
                  />
                )}
                {clinicalSigns.progressive?.length > 0 && (
                  <SignColumn
                    title="進展期"
                    signs={toArray(clinicalSigns.progressive).map(toStr)}
                    color="text-warning"
                  />
                )}
                {clinicalSigns.late?.length > 0 && (
                  <SignColumn
                    title="晚期"
                    signs={toArray(clinicalSigns.late).map(toStr)}
                    color="text-danger"
                  />
                )}
              </div>
            </Section>
          )}

          {/* Diagnosis */}
          {diagnosis && (
            <Section title="診斷 Diagnosis">
              {diagnosis.primaryTests?.length > 0 && (
                <div className="mb-3">
                  <h4 className="mb-1 text-sm font-semibold">主要檢測</h4>
                  <div className="space-y-2">
                    {toArray(diagnosis.primaryTests).map(
                      (t: unknown, i: number) => {
                        const test = toTestObj(t);
                        return (
                          <div
                            key={i}
                            className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{test.name}</span>
                            {test.notes && (
                              <span className="ml-2 text-muted">
                                — {test.notes}
                              </span>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
              {diagnosis.imaging?.length > 0 && (
                <div className="mb-3">
                  <h4 className="mb-1 text-sm font-semibold">影像學</h4>
                  <div className="space-y-2">
                    {toArray(diagnosis.imaging).map(
                      (t: unknown, i: number) => {
                        const test = toTestObj(t);
                        return (
                          <div
                            key={i}
                            className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{test.name}</span>
                            {test.notes && (
                              <span className="ml-2 text-muted">
                                — {test.notes}
                              </span>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
              {diagnosis.additional?.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold">其他</h4>
                  <ul className="list-inside list-disc text-sm text-muted">
                    {toArray(diagnosis.additional).map(
                      (item: unknown, i: number) => (
                        <li key={i}>{toStr(item)}</li>
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
                    {toArray(treatment.principles).map(
                      (p: unknown, i: number) => (
                        <li key={i}>{toStr(p)}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {treatment.medications && (
                <div className="mb-3">
                  <h4 className="mb-2 text-sm font-semibold">藥物</h4>
                  <div className="space-y-2">
                    {toArray(treatment.medications).map(
                      (med: unknown, i: number) => {
                        const m = toTestObj(med);
                        return (
                          <div
                            key={i}
                            className="rounded border border-border/50 bg-card px-3 py-2 text-sm"
                          >
                            <span className="font-semibold text-primary">
                              {m.name}
                            </span>
                            {(med as Record<string, unknown>)?.dose ? (
                              <span className="ml-2 font-mono text-xs">
                                {String(
                                  (med as Record<string, unknown>).dose
                                )}
                              </span>
                            ) : null}
                            {m.notes && (
                              <p className="mt-0.5 text-xs text-muted">
                                {m.notes}
                              </p>
                            )}
                          </div>
                        );
                      }
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
                        {toArray(items).map(
                          (item: unknown, i: number) => (
                            <li key={i}>{toStr(item)}</li>
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
                    {toArray(treatment.general).map(
                      (item: unknown, i: number) => (
                        <li key={i}>{toStr(item)}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Prognosis */}
          {prognosisText && (
            <Section title="預後 Prognosis">
              <p className="text-sm">{prognosisText}</p>
            </Section>
          )}

          {/* Diagnostic Algorithm */}
          {diagnosticAlgorithm && diagnosticAlgorithm.steps?.length > 0 && (
            <Section title="診斷流程 Diagnostic Algorithm">
              {diagnosticAlgorithm.title ? (
                <p className="mb-3 text-sm font-medium text-muted">
                  {toStr(diagnosticAlgorithm.title)}
                </p>
              ) : null}
              <div className="space-y-3">
                {diagnosticAlgorithm.steps.map(
                  (
                    step: {
                      step: unknown;
                      action: unknown;
                      details: unknown;
                      findings: unknown;
                    },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="relative rounded-lg border border-border bg-card p-3 pl-12"
                    >
                      <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                        {typeof step.step === "number" ? step.step : i + 1}
                      </span>
                      <h4 className="text-sm font-semibold">
                        {toStr(step.action)}
                      </h4>
                      {step.details ? (
                        <p className="mt-1 text-xs text-muted">
                          {toStr(step.details)}
                        </p>
                      ) : null}
                      {toArray(step.findings).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {toArray(step.findings).map(
                            (f: unknown, j: number) => (
                              <span
                                key={j}
                                className="rounded-full bg-accent-light/40 px-2 py-0.5 text-xs text-accent"
                              >
                                {toStr(f)}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
              {disease.ddxSource ? (
                <p className="mt-2 text-xs text-muted">
                  來源：
                  {disease.ddxSource === "book" ||
                  disease.ddxSource === "book-only"
                    ? "專家審閱"
                    : "自動產生"}
                </p>
              ) : null}
            </Section>
          )}

          {/* Clinical Pearls */}
          {clinicalPearls && toArray(clinicalPearls).length > 0 && (
            <Section title="臨床重點 Clinical Pearls">
              <div className="space-y-2">
                {toArray(clinicalPearls).map((pearl: unknown, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm dark:bg-yellow-900/10"
                  >
                    <span className="mt-0.5 shrink-0 text-yellow-500">
                      💡
                    </span>
                    <span>{toStr(pearl)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Monitoring Items */}
          {monitoringItems && toArray(monitoringItems).length > 0 && (
            <Section title="追蹤監控 Monitoring">
              <ul className="space-y-1.5">
                {toArray(monitoringItems).map((item: unknown, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-primary">📋</span>
                    <span>{toStr(item)}</span>
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

// ─── Sub-components ──────────────────────────────────────────

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
