import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { KnowledgeProjection } from "@/lib/executive-knowledge-authority";

export type BuildExecutiveIntelligenceInput = {
  message: string;
  memoryContext: import("@/lib/memory/memory-context.types").MemoryContext | null;
  generatedAt: string;
  /** Authoritative upstream result; Executive Intelligence never reclassifies. */
  understanding: ConversationUnderstanding;
  authorityProjections?: readonly KnowledgeProjection[];
  organizationId?: string;
  onStageTiming?: (timing: {
    stage: "executive_reasoning" | "recommended_next_move" | "eos_learning_loop";
    segmentMs: number;
  }) => void;
};

export type StepDiagnostic = {
  status: "success" | "skipped" | "error";
  errorMessage?: string;
};

export type ExecutiveIntelligenceDiagnostics = {
  requiresExecutiveReasoning: boolean;
  skippedReason: string | null;
  understanding: StepDiagnostic;
  context: StepDiagnostic;
  companyModel: StepDiagnostic;
  eos: StepDiagnostic;
};

export type ExecutiveIntelligenceResult = {
  understanding: ConversationUnderstanding;
  executiveOperatingSystem: ExecutiveOperatingSystem | null;
  diagnostics: ExecutiveIntelligenceDiagnostics;
};
