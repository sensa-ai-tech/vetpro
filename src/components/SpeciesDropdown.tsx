"use client";

import { useState, useEffect, useRef } from "react";
import { SPECIES_OPTIONS } from "@/lib/constants";

interface SpeciesDropdownProps {
  value: string;
  onSelect: (speciesId: string) => void;
}

export default function SpeciesDropdown({
  value,
  onSelect,
}: SpeciesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = SPECIES_OPTIONS.find((s) => s.id === value) ?? SPECIES_OPTIONS[0];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-all ${
          value !== "all"
            ? "border-primary bg-primary-light font-medium text-primary"
            : "border-border hover:border-primary/30"
        }`}
      >
        <span>{selected.icon}</span>
        <span>{selected.label}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 z-40 mt-1.5 min-w-[180px] rounded-xl border border-border bg-card py-1 shadow-lg">
          {SPECIES_OPTIONS.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => {
                onSelect(sp.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-primary-light/50 ${
                value === sp.id ? "font-medium text-primary" : ""
              }`}
            >
              <span>{sp.icon}</span>
              <span>{sp.label}</span>
              {value === sp.id && (
                <svg
                  className="ml-auto h-4 w-4 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
