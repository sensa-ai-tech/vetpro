// === YAML Seed 資料型別 ===

export interface DiseaseYaml {
  slug: string;
  nameEn: string;
  nameZh?: string;
  bodySystem: string;
  description?: string;

  aliases?: {
    alias: string;
    language: string;
  }[];

  species?: {
    speciesCommon: string;
    speciesScientific?: string;
    prevalence?: "common" | "uncommon" | "rare";
    notes?: string;
  }[];

  etiology?: {
    categories: {
      name: string;
      examples: string[];
    }[];
  };

  pathophysiology?: string;

  clinicalSigns?: {
    early?: string[];
    progressive?: string[];
    late?: string[];
  };

  diagnosis?: {
    primaryTests?: { name: string; notes?: string }[];
    imaging?: { name: string; notes?: string }[];
    additional?: string[];
  };

  treatment?: {
    principles?: string[];
    byStage?: Record<string, string[]>;
    medications?: { name: string; dose?: string; notes?: string }[];
    general?: string[];
  };

  prognosis?: string;

  stagingSystem?: {
    name: string;
    sourceUrl?: string;
    stages: Record<string, unknown>[];
    substaging?: Record<string, unknown>;
  };

  emergencyNotes?: string;

  ontologyMappings?: {
    source: string;
    code: string;
    label: string;
    confidence: string;
  }[];

  guidelineRefs?: {
    sourceOrg: string;
    title: string;
    url: string;
    type?: string;
    pmid?: string;
  }[];

  pubmedQueries?: {
    query: string;
    frequency: string;
  }[];
}

// === API Response 型別 ===

export interface DiseaseListItem {
  id: string;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  species: string[];
}

export interface DiseaseDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  etiology: unknown;
  pathophysiology: string | null;
  clinicalSigns: unknown;
  diagnosis: unknown;
  treatment: unknown;
  prognosis: string | null;
  stagingSystem: unknown;
  emergencyNotes: string | null;
  aliases: { alias: string; language: string }[];
  species: {
    speciesCommon: string;
    speciesScientific: string | null;
    prevalence: string | null;
    notes: string | null;
  }[];
  references: {
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
  }[];
  ontologyMappings: {
    ontologySource: string;
    ontologyCode: string;
    ontologyLabel: string | null;
    confidence: string | null;
  }[];
}

export interface SearchResult {
  slug: string;
  nameEn: string;
  nameZh: string | null;
  bodySystem: string;
  description: string | null;
  matchedField: string;
}
