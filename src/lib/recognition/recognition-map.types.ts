import type { JsonInputRootValue } from "@/lib/api/validation";

export type RecognitionMapSource = "onboarding" | "memory" | "inference";

export type RecognitionMapItem = {
  label: string;
  value: string;
  source: RecognitionMapSource;
  confidence: number;
  isAssumption: boolean;
};

export type RecognitionMapResult = {
  learnedFromUser: RecognitionMapItem[];
  inferredAboutBusiness: RecognitionMapItem[];
  assumptions: RecognitionMapItem[];
  priorities: RecognitionMapItem[];
  riskSignals: RecognitionMapItem[];
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

export type RecognitionMapResultJson = RecognitionMapResult & JsonInputRootValue;
