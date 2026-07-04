import type { JsonInputRootValue } from "@/lib/api/validation";

export type ActionExplanation = {
  actionId: string;
  summary: string;
  whyNow: string;
  evidence: string[];
  expectedOutcome: string;
  confidence: number;
  generatedBy: "deterministic";
  version: string;
};

export type GuidedActionResult = {
  topActionExplanation: ActionExplanation;
  recommendedActionExplanations: ActionExplanation[];
  generatedBy: "deterministic";
  version: string;
};

export type GuidedActionResultJson = GuidedActionResult & JsonInputRootValue;
