/**
 * CanonicalOperationV1 / CanonicalOperationResultV1 — the single typed
 * envelope every semantic-layer-produced business operation (query or
 * mutation) is expressed as before it reaches a capability implementation.
 *
 * This does NOT replace src/lib/action-runtime's ActionExecutionRequest/
 * ExecutionResult (the write pipeline) or company-query-authority's
 * CompanyQueryPlan/CompanyQueryResult (the read pipeline) — those remain
 * the authoritative execution contracts for their own subsystems. This is
 * the narrower, capability-level decision object that sits one layer above
 * them: "what does the user want done, to what, via which capability" —
 * see native-connector.ts for how it maps onto the existing pipelines.
 */

export type CanonicalOperationSource = "written" | "voice" | "system";

export type CanonicalOperationType =
  | "QUERY"
  | "CREATE"
  | "UPDATE"
  | "ARCHIVE"
  | "RESTORE"
  | "EXECUTE"
  | "NAVIGATE";

export type CanonicalEntityReference = {
  readonly entityType: string;
  readonly entityId?: string;
  /** Free-text reference ("Atlas") not yet resolved to an entityId. */
  readonly rawReference?: string;
};

export type CanonicalRevealIntent = {
  readonly explicit: boolean;
  readonly reason?: string;
};

export type CanonicalRiskContext = {
  readonly approvalGrantId?: string;
  readonly runtimeRiskContext?: Record<string, unknown>;
};

export type CanonicalProvenance = {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly extensionOwner?: string;
};

export type CanonicalOperationV1 = {
  readonly operationId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly source: CanonicalOperationSource;
  readonly type: CanonicalOperationType;
  /** Business domain the capability belongs to, e.g. "customer", "quote". */
  readonly domain: string;
  readonly entity: CanonicalEntityReference;
  /** Capability id in the registry, e.g. "customer.update". */
  readonly capability: string;
  /** Capability-specific payload; shape is owned by the capability, not this envelope. */
  readonly payload: Record<string, unknown>;
  readonly revealIntent: CanonicalRevealIntent;
  readonly riskContext?: CanonicalRiskContext;
  readonly continuityKey?: string;
  readonly provenance?: CanonicalProvenance;
};

export type CanonicalOperationResultStatus =
  | "EXECUTED"
  | "READ_COMPLETED"
  | "CLARIFICATION_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "CONFLICT"
  | "UNSUPPORTED"
  | "FAILED";

export type CanonicalEntityResolution =
  | "RESOLVED"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NOT_REQUIRED"
  | "UNKNOWN";

export type CanonicalReadbackStatus = {
  readonly status: "PASSED" | "MISMATCH" | "UNAVAILABLE" | "NOT_APPLICABLE";
  readonly source: "HANDLER_METADATA" | "CONNECTOR_READBACK" | "NONE";
  readonly summary?: string;
};

export type CanonicalFailureClassification =
  | "UNSUPPORTED_CAPABILITY"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_INVALID"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "SCHEDULING_CONFLICT"
  | "READBACK_MISMATCH"
  | "ENTITY_NOT_FOUND"
  | "ENTITY_AMBIGUOUS"
  | "AUTHORIZATION_DENIED"
  | "VALIDATION_FAILED"
  | "EXECUTION_FAILED";

export type CanonicalOperationResultV1 = {
  readonly operationId: string;
  readonly correlationId: string;
  readonly capability: string;
  readonly status: CanonicalOperationResultStatus;
  readonly entityResolution: CanonicalEntityResolution;
  readonly entity?: CanonicalEntityReference;
  readonly mutationPerformed: boolean;
  readonly readback: CanonicalReadbackStatus;
  /** Capability-specific result payload (read rows, updated entity, etc). */
  readonly data?: unknown;
  readonly revealDirective?: { readonly shouldReveal: boolean; readonly reason?: string };
  readonly failureClassification?: CanonicalFailureClassification;
  readonly failureMessage?: string;
  readonly nativeExecutionId?: string;
  readonly nativeOperationId?: string;
  /**
   * Opaque pre-mutation snapshot passed through unchanged from the Action
   * Runtime's own ActionDefinition.compensationRef contract (see
   * HandlerResult.compensationSnapshot) — present only on EXECUTED with
   * mutationPerformed true. The canonical layer never interprets or builds
   * this; it only carries it so a caller that already owns compensation
   * decisions (e.g. Executive Orchestration) doesn't need a second,
   * lower-level execution call to obtain it.
   */
  readonly compensationSnapshot?: Record<string, unknown> | null;
  readonly completedAt: string;
};
