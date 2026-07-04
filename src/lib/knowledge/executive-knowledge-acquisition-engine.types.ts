import type { KnowledgeLevel } from "./executive-knowledge-registry.types";

export type KnowledgeAcquisitionInput = {
  message: string;
};

export type KnowledgeDetectionConfidence = {
  score: number;
  basis: "EXPLICIT";
};

export type KnowledgeDetectionResult = {
  canonicalKey: string;
  detectedValue: string;
  resolvedFromAlias: string | null;
  knowledgeLevel: KnowledgeLevel;
  confidence: number;
  isAssumption: boolean;
};

export type KnowledgeCandidateMappingInput = {
  detections: KnowledgeDetectionResult[];
  organizationId: string;
  createdByUserId: string;
  sourceMessageId: string;
};
