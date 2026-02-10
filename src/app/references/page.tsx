"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ReferenceItem {
  id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: string[] | null;
  journal: string | null;
  year: number | null;
  sourceType: string | null;
  sourceOrg: string | null;
  url: string | null;
  isOpenAccess: boolean;
  diseases: {
    slug: string;
    nameEn: string;
    nameZh: string | null;
    bodySystem: string;
    relevance: string | null;
  }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const SOURCE_ORG_COLORS: Record<string, string> = {
  ACVIM:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  WSAVA:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IRIS: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  AAHA: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ISFM: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  ACVD: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const SORT_OPTIONS = [
  { value: "recent", label: "最近匯入" },
  { value: "year_desc", label: "年份（新→舊）" },
  { value: "year_asc", label: "年份（舊→新）" },
];

export default function ReferencesPage() {
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [sourceOrgs, setSourceOrgs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    params.set("sort", sort);
    if (query) params.set("q", query);
    if (selectedOrg !== "all") params.set("sourceOrg", selectedOrg);
    if (openAccessOnly) params.set("openAccess", "1");

    const res = await fetch(`/api/references?${params}`);
    const data = await res.json();
    setRefs(data.items);
    setPagination(data.pagination);
    setSourceOrgs(data.filters.sourceOrgs);
    setLoading(false);
  }, [page, sort, query, selectedOrg, openAccessOnly]);

  useEffect(() => {
    fetchRefs();
  }, [fetchRefs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [query, selectedOrg, openAccessOnly, sort]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">文獻庫</h1>
        <p className="mt-1 text-sm text-muted">
          自動從 PubMed 匯入的獸醫文獻，含 ACVIM、WSAVA、IRIS 等 guidelines。
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="搜尋文獻標題..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Source org filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedOrg("all")}
              className={`rounded-full border px-3 py-1 text-xs transition-all ${
                selectedOrg === "all"
                  ? "border-primary bg-primary-light font-medium text-primary"
                  : "border-border hover:border-primary/30"
              }`}
            >
              全部來源
            </button>
            {sourceOrgs.map((org) => (
              <button
                key={org}
                onClick={() => setSelectedOrg(org)}
                className={`rounded-full border px-3 py-1 text-xs transition-all ${
                  selectedOrg === org
                    ? "border-primary bg-primary-light font-medium text-primary"
                    : "border-border hover:border-primary/30"
                }`}
              >
                {org}
              </button>
            ))}
          </div>

          {/* Open access toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={openAccessOnly}
              onChange={(e) => setOpenAccessOnly(e.target.checked)}
              className="rounded border-border"
            />
            <span>僅 Open Access</span>
          </label>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <p className="text-sm text-muted">
        共{" "}
        <strong className="text-foreground">{pagination.total}</strong>{" "}
        篇文獻
        {pagination.totalPages > 1 && (
          <span>
            ，第 {pagination.page}/{pagination.totalPages} 頁
          </span>
        )}
      </p>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : refs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center text-muted">
          <p>沒有符合條件的文獻。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {refs.map((ref) => (
            <ReferenceCard key={ref.id} reference={ref} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-border px-3 py-1.5 text-sm transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← 上一頁
          </button>

          {/* Page numbers */}
          {generatePageNumbers(page, pagination.totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-muted">
                ⋯
              </span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p as number)}
                className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                  page === p
                    ? "border-primary bg-primary-light font-medium text-primary"
                    : "border-border hover:bg-card"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="rounded border border-border px-3 py-1.5 text-sm transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一頁 →
          </button>
        </div>
      )}
    </div>
  );
}

function ReferenceCard({ reference }: { reference: ReferenceItem }) {
  const orgColor =
    SOURCE_ORG_COLORS[reference.sourceOrg || ""] ||
    "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-300";

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/20">
      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {reference.sourceOrg && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${orgColor}`}
          >
            {reference.sourceOrg}
          </span>
        )}
        {reference.isOpenAccess && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
            🔓 Open Access
          </span>
        )}
        {reference.year && (
          <span className="text-xs text-muted">{reference.year}</span>
        )}
        {reference.pmid && (
          <span className="font-mono text-xs text-muted">
            PMID: {reference.pmid}
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        {reference.url ? (
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium leading-snug text-primary hover:underline"
          >
            {reference.title}
          </a>
        ) : (
          <span className="font-medium leading-snug">{reference.title}</span>
        )}
      </div>

      {/* Authors & Journal */}
      {(reference.authors || reference.journal) && (
        <p className="mt-1.5 text-xs text-muted">
          {reference.authors && reference.authors.length > 0 && (
            <span>
              {reference.authors.slice(0, 4).join(", ")}
              {reference.authors.length > 4 && " et al."}
            </span>
          )}
          {reference.journal && <span> — {reference.journal}</span>}
        </p>
      )}

      {/* DOI */}
      {reference.doi && (
        <p className="mt-1 text-xs text-muted">
          DOI:{" "}
          <a
            href={`https://doi.org/${reference.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {reference.doi}
          </a>
        </p>
      )}

      {/* Linked diseases */}
      {reference.diseases.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reference.diseases.map((d) => (
            <Link
              key={d.slug}
              href={`/disease/${d.slug}`}
              className="rounded-full border border-border px-2 py-0.5 text-xs transition-colors hover:border-primary/30 hover:text-primary"
            >
              {d.nameZh || d.nameEn}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
}
