export const EXECUTIVE_MIND_RUNTIME_STATE_VERSION =
  "executive-mind-runtime-state.v1" as const;

export type ExecutiveMindValidationLevel =
  | "UNVERIFIED"
  | "SUPPORTED"
  | "VERIFIED"
  | "REJECTED";

export type ExecutiveMindWorkingMemoryItem = Readonly<{
  key: string;
  value: string;
  loadedAt: string;
}>;

export type ExecutiveMindProposition = Readonly<{
  id: string;
  summary: string;
  validationLevel: ExecutiveMindValidationLevel;
  observedAt: string;
  updatedAt: string;
}>;

/**
 * Organization-scoped, conversation-independent passive carrier.
 * It records no decisions and has no prompt/behavior ownership.
 */
export type ExecutiveMindRuntimeState = Readonly<{
  stateVersion: typeof EXECUTIVE_MIND_RUNTIME_STATE_VERSION;
  organizationId: string;
  attentionFocus: string | null;
  workingMemory: readonly ExecutiveMindWorkingMemoryItem[];
  hypotheses: readonly ExecutiveMindProposition[];
  beliefs: readonly ExecutiveMindProposition[];
  createdAt: string;
  updatedAt: string;
}>;

export type PutExecutiveMindRuntimeStateInput = Readonly<{
  organizationId: string;
  attentionFocus: string | null;
  workingMemory: readonly ExecutiveMindWorkingMemoryItem[];
  hypotheses: readonly ExecutiveMindProposition[];
  beliefs: readonly ExecutiveMindProposition[];
}>;
