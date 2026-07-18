/** The business operation requested; it does not select or invoke a runtime. */
export const CORE_EXECUTION_STRATEGIES = [
  "ANSWER",
  "READ",
  "RESEARCH",
  "ANALYZE",
  "NAVIGATE",
  "CREATE",
  "UPDATE",
  "DELETE",
  "WORKFLOW",
] as const;

export type CoreExecutionStrategy = (typeof CORE_EXECUTION_STRATEGIES)[number];

/** Namespaced provider strategies may extend the core vocabulary. */
export type ExecutionStrategy = CoreExecutionStrategy | `${string}:${string}`;

/**
 * How a strategy is carried forward. Approval is intentionally absent: it is
 * a later Policy/Approval lifecycle outcome, not a request strategy or mode.
 */
export const CORE_EXECUTION_MODES = [
  "RESPONSE_ONLY",
  "READ_ONLY",
  "DRAFT",
  "EXECUTE",
  "DEFERRED",
  "CLARIFICATION",
] as const;

export type CoreExecutionMode = (typeof CORE_EXECUTION_MODES)[number];
export type ExecutionMode = CoreExecutionMode | `${string}:${string}`;

/**
 * Architecture Note: a strategy is not an ActionExecutionRequest. A future
 * typed adapter may translate a validated resolution into Draft, Policy,
 * Approval, or Execution contracts.
 */
export type ExecutionPlan = Readonly<{
  strategy: ExecutionStrategy;
  mode: ExecutionMode;
}>;
