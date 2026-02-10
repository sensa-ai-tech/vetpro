"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SearchResult {
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  matchHighlight?: string;
}

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

export default function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && results.length > 0) {
      router.push(`/disease/${results[0].slug}`);
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="搜尋疾病名稱、別名、臨床症狀...（支援中英文）"
          autoFocus={autoFocus}
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-base shadow-sm transition-shadow placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-border bg-card shadow-lg">
          {results.map((r) => (
            <Link
              key={r.slug}
              href={`/disease/${r.slug}`}
              onClick={() => setIsOpen(false)}
              className="flex items-start gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-primary-light/50"
            >
              <span className="mt-0.5 shrink-0 rounded bg-primary-light px-1.5 py-0.5 text-xs font-medium text-primary">
                {BODY_SYSTEM_LABELS[r.bodySystem] || r.bodySystem}
              </span>
              <div className="min-w-0">
                <div className="font-medium">
                  {r.nameZh && <span>{r.nameZh} </span>}
                  <span className="text-muted">{r.nameEn}</span>
                </div>
                {r.description && (
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {r.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
