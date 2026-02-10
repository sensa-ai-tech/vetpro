interface Stage {
  stage: number | string;
  label?: string;
  description?: string;
  [key: string]: unknown;
}

interface StagingSystem {
  name: string;
  sourceUrl?: string;
  stages: Stage[];
  substaging?: Record<string, unknown>;
}

export default function StagingTable({ staging }: { staging: StagingSystem }) {
  if (!staging || !staging.stages || staging.stages.length === 0) return null;

  // Determine which columns exist beyond stage/label/description
  const extraKeys = new Set<string>();
  for (const s of staging.stages) {
    for (const key of Object.keys(s)) {
      if (!["stage", "label", "description"].includes(key)) {
        extraKeys.add(key);
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold">{staging.name}</h4>
        {staging.sourceUrl && (
          <a
            href={staging.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            來源 ↗
          </a>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-primary-light/30">
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">Stage</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">分期</th>
              {[...extraKeys].map((key) => (
                <th key={key} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {formatColumnName(key)}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">說明</th>
            </tr>
          </thead>
          <tbody>
            {staging.stages.map((s, i) => (
              <tr
                key={i}
                className="border-b border-border/50 last:border-0 hover:bg-primary-light/10"
              >
                <td className="whitespace-nowrap px-3 py-2 font-bold text-primary">
                  {String(s.stage)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {s.label || "—"}
                </td>
                {[...extraKeys].map((key) => (
                  <td key={key} className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {String(s[key] ?? "—")}
                  </td>
                ))}
                <td className="px-3 py-2 text-muted">{s.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Substaging */}
      {staging.substaging && (
        <div className="space-y-2">
          {Object.entries(staging.substaging).map(([key, value]) => (
            <SubstagingSection key={key} title={key} data={value} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubstagingSection({ title, data }: { title: string; data: unknown }) {
  if (!Array.isArray(data)) return null;

  const items = data as Record<string, unknown>[];
  if (items.length === 0) return null;

  const keys = Object.keys(items[0]).filter((k) => k !== "category");

  return (
    <div>
      <h5 className="mb-1 text-sm font-medium text-muted">
        Sub-staging: {formatColumnName(title)}
      </h5>
      <div className="overflow-x-auto rounded border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-card">
              <th className="px-2 py-1.5 text-left font-medium">分類</th>
              {keys.map((k) => (
                <th key={k} className="px-2 py-1.5 text-left font-medium">
                  {formatColumnName(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-border/30 last:border-0">
                <td className="px-2 py-1.5 font-medium">
                  {String(item.category ?? "—")}
                </td>
                {keys.map((k) => (
                  <td key={k} className="px-2 py-1.5 font-mono">
                    {String(item[k] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatColumnName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
