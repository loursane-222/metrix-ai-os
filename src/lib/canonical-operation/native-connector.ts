import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "@/lib/action-runtime/composition/production-execution-runtime";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import { buildActionExecutionRequest } from "@/lib/action-runtime/gateway/execution-request";
import type { ActionExecutionRequest, ExecutionContext, ExecutionResult } from "@/lib/action-runtime/execution";
import {
  ApprovalRequiredError,
  ExecutionFailedError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "@/lib/action-runtime/execution";
import { ApprovalRequestNotFoundError, InvalidApprovalStateError, policyEngine, type ApprovalGrant } from "@/lib/action-runtime/policy";
import { executeApprovedAction } from "@/lib/action-runtime/gateway/approved-action-execution";
import { CalendarConflictError } from "@/lib/action-runtime/domains/calendar";
import { bootstrapCapabilityRegistry } from "./capabilities";
import { getCapability, type CapabilityDescriptor } from "./capability-registry";
import type {
  CanonicalFailureClassification,
  CanonicalOperationResultV1,
  CanonicalOperationV1,
} from "./types";

export type ExecuteCanonicalOperationDeps = {
  readonly authContext: AuthContext;
  readonly approvalGrant?: ApprovalGrant;
  /**
   * The "confirm" leg of an already-approved EXPLICIT/CONDITIONAL action —
   * mirrors exactly what customer-archive-gateway.ts / payment-apply-
   * gateway.ts already do via executeApprovedAction: context-hash match
   * against the approval, idempotent-replay short-circuit, then execute
   * with the grant attached. Real approval security, not re-implemented.
   */
  readonly approvalContext?: { readonly approvalId: string; readonly grantedBy: string };
  /**
   * Pre-built ExecutionContext override — for the rare, already-existing
   * trusted server flow that legitimately grants a narrower/wider
   * permission set than the actor's own role for one scoped call (e.g.
   * field-visit-report-orchestrator.service.ts's documented orders.write/
   * payments.write escalation for its own two sub-calls only). When
   * omitted (the default for every caller), buildExecutionContext(authContext)
   * is used — this is transport plumbing, not a new authority: the caller
   * must already have decided the permission set; the canonical layer
   * never computes or grants one itself.
   */
  readonly executionContext?: ExecutionContext;
  /** Injectable for tests; defaults to the real production execution runtime. */
  readonly executeAction?: (request: ActionExecutionRequest) => Promise<ExecutionResult>;
};

const nowIso = () => new Date().toISOString();

function unsupported(operation: CanonicalOperationV1, message: string): CanonicalOperationResultV1 {
  return {
    operationId: operation.operationId,
    correlationId: operation.correlationId,
    capability: operation.capability,
    status: "UNSUPPORTED",
    entityResolution: "NOT_REQUIRED",
    mutationPerformed: false,
    readback: { status: "NOT_APPLICABLE", source: "NONE" },
    failureClassification: "UNSUPPORTED_CAPABILITY",
    failureMessage: message,
    completedAt: nowIso(),
  };
}

/**
 * Routes a CanonicalOperationV1 to the real, existing subsystem behind its
 * capability: action-runtime's ExecutionRuntime for WRITE, a direct
 * src/lib/core read for QUERY, or a reveal-intent decision for NAVIGATE.
 * This function owns no business logic of its own — every branch below
 * delegates to code that already exists and is already exercised by other
 * callers (gateways, routes, orchestration).
 */
export async function executeCanonicalOperation(
  operation: CanonicalOperationV1,
  deps: ExecuteCanonicalOperationDeps,
): Promise<CanonicalOperationResultV1> {
  bootstrapCapabilityRegistry();
  const descriptor = getCapability(operation.capability);
  if (!descriptor) return unsupported(operation, `Capability "${operation.capability}" is not registered.`);

  if (operation.type === "NAVIGATE") {
    if (descriptor.classification !== "NAVIGATION") return unsupported(operation, `Capability "${operation.capability}" is not a navigation capability.`);
    return handleNavigate(operation, descriptor);
  }

  if (operation.type === "QUERY") {
    if (descriptor.classification !== "READ") return unsupported(operation, `Capability "${operation.capability}" is not a read capability.`);
    return handleQuery(operation, descriptor);
  }

  if (descriptor.classification !== "WRITE") return unsupported(operation, `Capability "${operation.capability}" is not a write capability.`);
  return handleWrite(operation, descriptor, deps);
}

async function handleNavigate(operation: CanonicalOperationV1, descriptor: CapabilityDescriptor): Promise<CanonicalOperationResultV1> {
  if (descriptor.implementation.kind !== "NAVIGATION") {
    return unsupported(operation, `Capability "${operation.capability}" has no navigation implementation.`);
  }
  return {
    operationId: operation.operationId,
    correlationId: operation.correlationId,
    capability: operation.capability,
    status: "READ_COMPLETED",
    entityResolution: operation.entity.entityId ? "RESOLVED" : "NOT_REQUIRED",
    entity: operation.entity,
    mutationPerformed: false,
    readback: { status: "NOT_APPLICABLE", source: "NONE" },
    data: { route: descriptor.implementation.route },
    revealDirective: { shouldReveal: operation.revealIntent.explicit, reason: operation.revealIntent.reason },
    completedAt: nowIso(),
  };
}

async function handleQuery(operation: CanonicalOperationV1, descriptor: CapabilityDescriptor): Promise<CanonicalOperationResultV1> {
  if (descriptor.implementation.kind !== "READ") {
    return unsupported(operation, `Capability "${operation.capability}" has no read implementation.`);
  }
  const { read, search } = descriptor.implementation;

  if (operation.entity.entityId) {
    const entity = await read(operation.organizationId, operation.entity.entityId);
    return {
      operationId: operation.operationId,
      correlationId: operation.correlationId,
      capability: operation.capability,
      status: "READ_COMPLETED",
      entityResolution: entity ? "RESOLVED" : "NOT_FOUND",
      entity: operation.entity,
      mutationPerformed: false,
      readback: { status: "NOT_APPLICABLE", source: "NONE" },
      data: entity,
      completedAt: nowIso(),
    };
  }

  if (!search) return unsupported(operation, `Capability "${operation.capability}" has no search implementation.`);
  const data = await search(operation.organizationId, operation.payload);
  return {
    operationId: operation.operationId,
    correlationId: operation.correlationId,
    capability: operation.capability,
    status: "READ_COMPLETED",
    entityResolution: "NOT_REQUIRED",
    mutationPerformed: false,
    readback: { status: "NOT_APPLICABLE", source: "NONE" },
    data,
    completedAt: nowIso(),
  };
}

async function handleWrite(
  operation: CanonicalOperationV1,
  descriptor: CapabilityDescriptor,
  deps: ExecuteCanonicalOperationDeps,
): Promise<CanonicalOperationResultV1> {
  if (descriptor.implementation.kind !== "WRITE") {
    return unsupported(operation, `Capability "${operation.capability}" has no write implementation.`);
  }
  const implementation = descriptor.implementation;
  const approvalContext = deps.approvalContext;
  const executeAction =
    deps.executeAction ??
    (approvalContext
      ? (request) =>
          executeApprovedAction(
            { request, approvalId: approvalContext.approvalId, grantedBy: approvalContext.grantedBy },
            { policy: policyEngine, runtime: productionExecutionRuntime },
          )
      : (request) => productionExecutionRuntime.executeAction(request));

  const resolvedEntityRef =
    (operation.entity.entityId ? { entityType: operation.entity.entityType, entityId: operation.entity.entityId } : undefined) ??
    implementation.resolveEntityRef?.(operation.payload);

  const executionContext = deps.executionContext ?? buildExecutionContext(deps.authContext);
  const runtimeRiskContext =
    implementation.resolveRuntimeRiskContext?.(operation.payload) ??
    implementation.runtimeRiskContext ??
    operation.riskContext?.runtimeRiskContext;
  const request = buildActionExecutionRequest({
    actionName: implementation.nativeActionName,
    input: operation.payload,
    executionContext,
    entityRef: resolvedEntityRef,
    idempotencyKey: operation.operationId,
    correlationId: operation.correlationId,
    approvalGrant: deps.approvalGrant,
    runtimeRiskContext,
  });

  let executionResult: ExecutionResult;
  try {
    executionResult = await executeAction(request);
  } catch (error) {
    return mapExecutionErrorToResult(operation, error);
  }

  // A resolved (non-thrown) FAILURE is a real, documented ExecutionResult
  // shape (not just a thrown-error path) — the Action Runtime can return it
  // directly rather than throw. Treating it as EXECUTED would fabricate a
  // success narration for a step that did not actually run.
  if (executionResult.status !== "SUCCESS") {
    return {
      operationId: operation.operationId,
      correlationId: operation.correlationId,
      capability: operation.capability,
      status: "FAILED",
      entityResolution: executionResult.entityRef ? "RESOLVED" : "UNKNOWN",
      entity: executionResult.entityRef
        ? { entityType: executionResult.entityRef.entityType, entityId: executionResult.entityRef.entityId }
        : operation.entity,
      mutationPerformed: false,
      readback: { status: "NOT_APPLICABLE", source: "NONE" },
      failureClassification: "EXECUTION_FAILED",
      failureMessage: executionResult.metadata?.errorMessage as string | undefined ?? executionResult.outcome,
      nativeExecutionId: executionResult.executionId,
      nativeOperationId: executionResult.operationId,
      completedAt: nowIso(),
    };
  }

  const mutationPerformed = executionResult.outcome === "SUCCEEDED" || executionResult.outcome === "REPLAYED";
  const readback = await verifyReadback(operation, descriptor, implementation, executionResult);

  if (readback.status === "MISMATCH") {
    return {
      operationId: operation.operationId,
      correlationId: operation.correlationId,
      capability: operation.capability,
      status: "CONFLICT",
      entityResolution: executionResult.entityRef ? "RESOLVED" : "UNKNOWN",
      entity: executionResult.entityRef
        ? { entityType: executionResult.entityRef.entityType, entityId: executionResult.entityRef.entityId }
        : operation.entity,
      mutationPerformed,
      readback,
      failureClassification: "READBACK_MISMATCH",
      failureMessage: readback.summary,
      nativeExecutionId: executionResult.executionId,
      nativeOperationId: executionResult.operationId,
      completedAt: nowIso(),
    };
  }

  return {
    operationId: operation.operationId,
    correlationId: operation.correlationId,
    capability: operation.capability,
    status: "EXECUTED",
    entityResolution: executionResult.entityRef ? "RESOLVED" : "NOT_REQUIRED",
    entity: executionResult.entityRef
      ? { entityType: executionResult.entityRef.entityType, entityId: executionResult.entityRef.entityId }
      : operation.entity,
    mutationPerformed,
    readback,
    data: executionResult.metadata,
    revealDirective: { shouldReveal: operation.revealIntent.explicit, reason: operation.revealIntent.reason },
    nativeExecutionId: executionResult.executionId,
    nativeOperationId: executionResult.operationId,
    compensationSnapshot: executionResult.compensationSnapshot ?? null,
    completedAt: nowIso(),
  };
}

/**
 * Durable readback: HandlerResult.metadata.verification (the opt-in
 * per-handler convention documented in customer/quote update handlers) is
 * trusted when present. Otherwise, when the capability has a paired read
 * capability, the connector performs its own structural (and, where
 * verifyExpectedState is provided, field-level) re-read before this
 * operation is allowed to report EXECUTED — see CanonicalOperationResultV1.
 * A capability with no read pairing yet reports UNAVAILABLE, never a false
 * PASSED: durable readback is proven, not assumed.
 */
async function verifyReadback(
  operation: CanonicalOperationV1,
  descriptor: CapabilityDescriptor,
  implementation: Extract<CapabilityDescriptor["implementation"], { kind: "WRITE" }>,
  executionResult: ExecutionResult,
): Promise<CanonicalOperationResultV1["readback"]> {
  if (executionResult.status !== "SUCCESS") {
    return { status: "NOT_APPLICABLE", source: "NONE" };
  }
  const handlerVerification = executionResult.metadata?.verification;
  if (typeof handlerVerification === "string" && handlerVerification.length > 0) {
    return { status: "PASSED", source: "HANDLER_METADATA", summary: handlerVerification };
  }

  const readbackCapabilityId = implementation.readbackCapability;
  const entityId = executionResult.entityRef?.entityId;
  if (!readbackCapabilityId || !entityId) {
    return { status: "UNAVAILABLE", source: "NONE" };
  }
  const readCapability = getCapability(readbackCapabilityId);
  if (!readCapability || readCapability.implementation.kind !== "READ") {
    return { status: "UNAVAILABLE", source: "NONE" };
  }

  const readEntity = await readCapability.implementation.read(operation.organizationId, entityId);
  if (!readEntity) {
    return { status: "MISMATCH", source: "CONNECTOR_READBACK", summary: `${entityId} not found on readback.` };
  }
  if (implementation.verifyExpectedState) {
    const mismatch = implementation.verifyExpectedState(operation.payload, readEntity);
    if (mismatch) return { status: "MISMATCH", source: "CONNECTOR_READBACK", summary: mismatch };
  }
  return { status: "PASSED", source: "CONNECTOR_READBACK" };
}

function mapExecutionErrorToResult(operation: CanonicalOperationV1, error: unknown): CanonicalOperationResultV1 {
  const base = {
    operationId: operation.operationId,
    correlationId: operation.correlationId,
    capability: operation.capability,
    entityResolution: "UNKNOWN" as const,
    entity: operation.entity,
    mutationPerformed: false,
    readback: { status: "NOT_APPLICABLE" as const, source: "NONE" as const },
    completedAt: nowIso(),
  };

  const cause = error instanceof ExecutionFailedError ? error.cause : error;

  if (cause instanceof CalendarConflictError) {
    return {
      ...base,
      status: "CONFLICT",
      failureClassification: "SCHEDULING_CONFLICT",
      failureMessage: cause.message,
      data: { conflicts: cause.conflicts },
    };
  }
  if (cause instanceof ApprovalRequiredError) {
    return { ...base, status: "APPROVAL_REQUIRED", failureClassification: "APPROVAL_REQUIRED", failureMessage: "Bu islem onay gerektiriyor." };
  }
  if (cause instanceof ApprovalRequestNotFoundError || cause instanceof InvalidApprovalStateError) {
    return { ...base, status: "APPROVAL_REQUIRED", failureClassification: "APPROVAL_INVALID", failureMessage: "Onay gecersiz veya suresi dolmus." };
  }
  if (cause instanceof PolicyDeniedError) {
    return { ...base, status: "FAILED", failureClassification: "AUTHORIZATION_DENIED", failureMessage: "Bu islemi gerceklestirme yetkiniz yok." };
  }
  if (cause instanceof IdempotencyConflictError) {
    return {
      ...base,
      status: "CONFLICT",
      failureClassification: "IDEMPOTENCY_CONFLICT",
      failureMessage: cause.reasonCode === "IN_PROGRESS" ? "Bu islem zaten devam ediyor." : "Bu istek anahtari farkli bir icerikle daha once kullanildi.",
    };
  }
  if (cause instanceof ExecutionRejectedError || cause instanceof InputValidationError) {
    return { ...base, status: "FAILED", failureClassification: "VALIDATION_FAILED", failureMessage: (cause as Error).message };
  }
  if (cause instanceof RegistryLookupFailedError || cause instanceof HandlerNotFoundError) {
    return { ...base, status: "UNSUPPORTED", failureClassification: "UNSUPPORTED_CAPABILITY", failureMessage: (cause as Error).message };
  }
  const failureClassification: CanonicalFailureClassification = /version|conflict/i.test((cause as Error)?.name ?? "") ? "VERSION_CONFLICT" : "EXECUTION_FAILED";
  const status = failureClassification === "VERSION_CONFLICT" ? "CONFLICT" : "FAILED";
  return { ...base, status, failureClassification, failureMessage: cause instanceof Error ? cause.message : "Unexpected execution failure." };
}
