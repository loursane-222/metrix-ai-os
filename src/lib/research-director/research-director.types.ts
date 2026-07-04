export type ResearchTier =
  | "TIER_1_DAILY"
  | "TIER_2_DAILY"
  | "TIER_3_WEEKLY"
  | "TIER_4_ON_DEMAND";

export type ResearchSourceCategory =
  | "TR_ECONOMY"
  | "GLOBAL_ECONOMY"
  | "OFFICIAL_INSTITUTION"
  | "MANAGEMENT_STRATEGY"
  | "RESEARCH_DATA"
  | "GENERAL_NEWS";

export type ResearchConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ResearchSourceDefinition = {
  domain: string;
  name: string;
  category: ResearchSourceCategory;
  tier: ResearchTier;
  language: "tr" | "en";
};

export type ResearchUsedSource = {
  domain: string;
  name: string;
  url?: string | null;
  title?: string | null;
};

export type ResearchResultItem = {
  headline: string;
  summary: string;
  category: ResearchSourceCategory;
  publishedAt?: string | null;
  primarySource: ResearchUsedSource;
};

export type ResearchBatchResult = {
  tier: ResearchTier;
  query: string;
  items: ResearchResultItem[];
  usedSources: ResearchUsedSource[];
  sourceCount: number;
  confidenceLevel: ResearchConfidenceLevel;
  confidenceScore: number;
  researchedAt: string;
  rawContent?: string | null;
};

export type BriefingRawPackage = {
  organizationId: string;
  generatedAt: string;
  batches: ResearchBatchResult[];
  totalItems: number;
  totalSourcesUsed: ResearchUsedSource[];
  totalSourceCount: number;
  overallConfidenceLevel: ResearchConfidenceLevel;
  overallConfidenceScore: number;
};

export type RunDailyResearchInput = {
  organizationId: string;
  isWeeklyDay?: boolean;
  companyContext?: string | null;
};
