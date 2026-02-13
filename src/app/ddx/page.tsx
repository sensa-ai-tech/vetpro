"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Symptom {
  id: string;
  zhName: string;
  enName: string;
  section: string | null;
  sectionName: string | null;
  differentialCount: number;
}

interface DdxResult {
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  ddxSource: string | null;
  matchCount: number;
  totalSymptoms: number;
  matchedSymptoms: string[];
  urgencyScore: number;
  frequencyScore: number;
  species: string[];
}

export default function DdxPage() {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [species, setSpecies] = useState<string>("both");
  const [results, setResults] = useState<DdxResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Load all symptoms
  useEffect(() => {
    fetch("/api/symptoms")
      .then((r) => r.json())
      .then((data) => {
        setSymptoms(data);
        setSymptomsLoading(false);
      })
      .catch(() => setSymptomsLoading(false));
  }, []);

  // Search DDX when symptoms change
  const fetchDdx = useCallback(async () => {
    if (selectedSymptoms.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        symptoms: selectedSymptoms.join(","),
        species,
      });
      const res = await fetch(`/api/ddx?${params}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [selectedSymptoms, species]);

  useEffect(() => {
    fetchDdx();
  }, [fetchDdx]);

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const filteredSymptoms = searchTerm
    ? symptoms.filter(
        (s) =>
          s.zhName.includes(searchTerm) ||
          s.enName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.id.includes(searchTerm.toLowerCase())
      )
    : symptoms;

  // Group symptoms by section
  const groupedSymptoms = filteredSymptoms.reduce<
    Record<string, Symptom[]>
  >((acc, s) => {
    const key = s.sectionName || "其他";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const urgencyLabel = (score: number) => {
    switch (score) {
      case 4:
        return { text: "急診", color: "bg-red-100 text-red-800" };
      case 3:
        return { text: "緊急", color: "bg-orange-100 text-orange-800" };
      case 2:
        return { text: "半緊急", color: "bg-yellow-100 text-yellow-800" };
      default:
        return { text: "非緊急", color: "bg-green-100 text-green-800" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">🔍 鑑別診斷 (DDX)</h1>
        <p className="mt-1 text-sm text-muted">
          選擇臨床症狀，系統自動排列可能的鑑別診斷。涵蓋 69 個症狀、2,500+ 個疾病。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left: Symptom Selector */}
        <div className="space-y-4">
          {/* Species filter */}
          <div className="rounded-lg border border-border bg-card p-3">
            <label className="block text-sm font-medium mb-2">物種篩選</label>
            <div className="flex gap-2">
              {[
                { value: "both", label: "犬貓皆可" },
                { value: "dog", label: "犬" },
                { value: "cat", label: "貓" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSpecies(opt.value)}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${
                    species === opt.value
                      ? "bg-primary text-white"
                      : "bg-muted/20 text-muted hover:bg-muted/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selected symptoms */}
          {selectedSymptoms.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  已選 {selectedSymptoms.length} 個症狀
                </span>
                <button
                  onClick={() => setSelectedSymptoms([])}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  全部清除
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedSymptoms.map((id) => {
                  const sym = symptoms.find((s) => s.id === id);
                  return (
                    <button
                      key={id}
                      onClick={() => toggleSymptom(id)}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/30"
                    >
                      {sym?.zhName || id}
                      <span className="ml-0.5">×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Symptom search */}
          <div className="rounded-lg border border-border bg-card p-3">
            <input
              type="text"
              placeholder="搜尋症狀（中文或英文）..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Symptom list */}
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card">
            {symptomsLoading ? (
              <div className="p-4 text-center text-sm text-muted">載入症狀中...</div>
            ) : (
              Object.entries(groupedSymptoms).map(([section, syms]) => (
                <div key={section}>
                  <div className="sticky top-0 bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted border-b border-border">
                    {section}
                  </div>
                  {syms.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleSymptom(s.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted/10 ${
                        selectedSymptoms.includes(s.id)
                          ? "bg-primary/10 font-medium"
                          : ""
                      }`}
                    >
                      <span>
                        <span className="font-medium">{s.zhName}</span>
                        <span className="ml-1.5 text-xs text-muted">
                          {s.enName}
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        {s.differentialCount}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div>
          {selectedSymptoms.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
              <span className="text-4xl mb-3">🩻</span>
              <p className="font-medium">選擇症狀開始鑑別診斷</p>
              <p className="mt-1 text-sm text-muted">
                從左側列表選取一個或多個臨床症狀，系統將自動排列可能的疾病。
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
              <span className="text-4xl mb-3">🔎</span>
              <p className="font-medium">無匹配結果</p>
              <p className="mt-1 text-sm text-muted">
                嘗試選擇不同的症狀組合或調整物種篩選。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                找到 {results.length} 個可能的鑑別診斷
                {results.length >= 50 && "（顯示前 50 名）"}
              </p>

              {results.map((r, i) => {
                const urgency = urgencyLabel(r.urgencyScore);
                return (
                  <Link
                    key={r.slug}
                    href={`/disease/${r.slug}`}
                    className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-card/80"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-muted">
                            #{i + 1}
                          </span>
                          <h3 className="font-medium leading-snug">
                            {r.nameZh && (
                              <span className="mr-1.5">{r.nameZh}</span>
                            )}
                            <span className="text-sm text-muted">
                              {r.nameEn}
                            </span>
                          </h3>
                        </div>
                        {r.description && (
                          <p className="mt-1 text-xs text-muted line-clamp-2">
                            {r.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${urgency.color}`}
                          >
                            {urgency.text}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {r.matchCount}/{r.totalSymptoms} 症狀
                          </span>
                          {r.species.slice(0, 3).map((sp) => (
                            <span
                              key={sp}
                              className="rounded-full bg-muted/20 px-2 py-0.5 text-xs text-muted"
                            >
                              {sp}
                            </span>
                          ))}
                          {r.ddxSource === "book" && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              專家審閱
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Match strength indicator */}
                      <div className="flex-shrink-0 text-right">
                        <div className="text-lg font-bold text-primary">
                          {Math.round((r.matchCount / r.totalSymptoms) * 100)}%
                        </div>
                        <div className="text-xs text-muted">匹配度</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
