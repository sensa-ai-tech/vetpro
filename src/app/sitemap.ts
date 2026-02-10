import type { MetadataRoute } from "next";
import { db, sqlite } from "@/db";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://vetpro.example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const rows = sqlite
    .prepare("SELECT slug, updated_at FROM diseases")
    .all() as { slug: string; updated_at: string }[];

  const diseaseEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${BASE_URL}/disease/${row.slug}`,
    lastModified: row.updated_at,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/browse`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/references`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    ...diseaseEntries,
  ];
}
