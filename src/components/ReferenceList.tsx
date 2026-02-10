interface Reference {
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
}

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  consensus: {
    label: "Consensus",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
  guideline: {
    label: "Guideline",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  pubmed: {
    label: "PubMed",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
};

export default function ReferenceList({ references }: { references: Reference[] }) {
  if (!references || references.length === 0) {
    return <p className="text-sm text-muted">尚無關聯文獻。</p>;
  }

  return (
    <ul className="space-y-3">
      {references.map((ref) => {
        const badge = TYPE_BADGES[ref.sourceType || ""] || TYPE_BADGES.pubmed;
        return (
          <li
            key={ref.id}
            className="rounded-lg border border-border/50 bg-card p-3 text-sm"
          >
            <div className="flex flex-wrap items-start gap-2">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {ref.sourceOrg || badge.label}
              </span>
              {ref.relevance && (
                <span className="rounded bg-border/50 px-1.5 py-0.5 text-xs text-muted">
                  {ref.relevance}
                </span>
              )}
            </div>
            <div className="mt-1.5">
              {ref.url ? (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {ref.title}
                </a>
              ) : (
                <span className="font-medium">{ref.title}</span>
              )}
            </div>
            {(ref.authors || ref.journal || ref.year) && (
              <p className="mt-1 text-xs text-muted">
                {ref.authors && ref.authors.length > 0 && (
                  <span>
                    {ref.authors.slice(0, 3).join(", ")}
                    {ref.authors.length > 3 && " et al."}
                  </span>
                )}
                {ref.journal && <span> — {ref.journal}</span>}
                {ref.year && <span> ({ref.year})</span>}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
