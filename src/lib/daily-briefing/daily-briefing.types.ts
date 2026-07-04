import type {
  BriefingRawPackage,
  ResearchUsedSource,
} from "@/lib/research-director/research-director.types";

export type ImpactDirection = "POZITIF" | "NEGATIF" | "NOTR";

export type ImpactMagnitude = "YUKSEK" | "ORTA" | "DUSUK";

export type BriefingPriority = "KRITIK" | "DIKKAT" | "BILGI";

export type ImpactAxis = {
  yon: ImpactDirection;
  buyukluk: ImpactMagnitude;
  aciklama: string;
};

export type NewsImpact = {
  headline: string;
  summary: string;
  publishedAt?: string | null;
  primarySource: ResearchUsedSource;
  ekonomik_etki: ImpactAxis;
  operasyonel_etki: ImpactAxis;
  satis_etkisi: ImpactAxis;
  finansal_etki: ImpactAxis;
  yonetim_onerisi: string;
  impact_score: number;
  strategic_relevance: number;
  priority: BriefingPriority;
};

export type BriefingPackage = {
  organizationId: string;
  generatedAt: string;
  briefingDate: string;
  kritikItems: NewsImpact[];
  dikkatItems: NewsImpact[];
  bilgiItems: NewsImpact[];
  totalItems: number;
  usedSources: ResearchUsedSource[];
  sourceCount: number;
  overallConfidenceLevel: BriefingRawPackage["overallConfidenceLevel"];
  overallConfidenceScore: number;
  memoryWriteCount: number;
};

export type BuildBriefingPackageInput = {
  rawPackage: BriefingRawPackage;
  organizationId: string;
  companyContext?: string | null;
};
