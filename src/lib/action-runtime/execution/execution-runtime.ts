import { randomUUID } from "crypto";

import {
  ApprovalRequiredError,
  ExecutionFailedError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "./execution.errors";
import type {
  ActionExecutionEnvelope,
  ActionExecutionRequest,
  ActionHandler,
  ActionHandlerRegistry,
  ExecutionActionRegistry,
  ExecutionMetadata,
  ExecutionPolicyEngine,
  ExecutionResult,
  ExecutionStage,
  HandlerResult,
  IdempotencyStore,
} from "./execution.types";
import { createInMemoryHandlerRegistry } from "./handler-registry";
import { createInMemoryIdempotencyStore } from "./idempotency-store";
import { validateInputAgainstSchema } from "./input-validator";
import { auditStore as defaultAuditStore } from "../audit";
import type { AuditStore } from "../audit";
import { operationStore as defaultOperationStore } from "../operation";
import type { OperationRecord, OperationStore } from "../operation";
import { outboxStore as defaultOutboxStore } from "../outbox";
import type { OutboxStore } from "../outbox";
import { actionRegistry as defaultActionRegistry } from "../registry";
import type { ActionDefinition } from "../registry/action-registry.types";
import { policyEngine as defaultPolicyEngine } from "../policy";

export type ExecutionRuntimeOptions = {
  registry?: ExecutionActionRegistry;
  policyEngine?: ExecutionPolicyEngine;
  handlerRegistry?: ActionHandlerRegistry;
  idempotencyStore?: IdempotencyStore;
  operationStore?: OperationStore;
  auditStore?: AuditStore;
  outboxStore?: OutboxStore;
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
  /** Test edilebilirlik için enjekte edilebilir id üretici; executionId için kullanılır. */
  generateId?: () => string;
};

/**
 * Executive Domain Action Execution Runtime.
 *
 * executeAction() tek public giriş noktasıdır. Pipeline sırası sabittir
 * ve değiştirilemez:
 *   Registry lookup -> input validation -> policy evaluation (+ audit)
 *   -> approval verification (+ audit) -> idempotency check
 *   -> operation create -> execution envelope -> handler (+ audit)
 *   -> outbox enqueue -> ActionResult (+ audit) -> operation completion
 *   -> idempotency completion.
 *
 * Hiçbir repository/service/Prisma çağırmaz, hiçbir handler
 * implementasyonu bilmez — handler'lar ActionHandlerRegistry üzerinden
 * DI ile çözülür. Handler hiçbir OutboxStore çağırmaz; yalnızca
 * domainEvents/sideEffects descriptor'ları döndürür, enqueue Execution
 * Runtime'ın sorumluluğudur. Gerçek worker/consumer/external adapter bu
 * fazda çalıştırılmaz.
 */
export class ExecutionRuntime {
  private readonly registry: ExecutionActionRegistry;
  private readonly policyEngine: ExecutionPolicyEngine;
  private readonly handlerRegistry: ActionHandlerRegistry;
  private readonly idempotencyStore: IdempotencyStore;
  private readonly operationStore: OperationStore;
  private readonly auditStore: AuditStore;
  private readonly outboxStore: OutboxStore;
  private readonly clock: () => Date;
  private readonly generateId: () => string;

  constructor(options: ExecutionRuntimeOptions = {}) {
    this.registry = options.registry ?? defaultActionRegistry;
    this.policyEngine = options.policyEngine ?? defaultPolicyEngine;
    this.handlerRegistry = options.handlerRegistry ?? createInMemoryHandlerRegistry();
    this.idempotencyStore = options.idempotencyStore ?? createInMemoryIdempotencyStore();
    this.operationStore = options.operationStore ?? defaultOperationStore;
    this.auditStore = options.auditStore ?? defaultAuditStore;
    this.outboxStore = options.outboxStore ?? defaultOutboxStore;
    this.clock = options.clock ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  async executeAction(request: ActionExecutionRequest): Promise<ExecutionResult> {
    const executionId = this.generateId();
    const startedAt = this.clock().toISOString();
    const stagesCompleted: ExecutionStage[] = [];
    const actorId = request.executionContext.actorId;
    const organizationId = request.executionContext.organizationId;
    const idempotencyScope = JSON.stringify([organizationId, actorId]);

    // 1. Registry lookup
    let definition: ActionDefinition;
    try {
      definition = this.registry.getActionDefinition(request.actionName);
    } catch {
      throw new RegistryLookupFailedError(request.actionName);
    }

    if (definition.actionClass !== "DOMAIN") {
      throw new ExecutionRejectedError(
        request.actionName,
        `Only DOMAIN actions can be executed by the Domain Action Execution Runtime; "${request.actionName}" is ${definition.actionClass}.`,
      );
    }
    stagesCompleted.push("REGISTRY_LOOKUP");

    // 2. Input schema validation
    const validationErrors = validateInputAgainstSchema(definition.inputSchema, request.input);
    if (validationErrors.length > 0) {
      throw new InputValidationError(request.actionName, validationErrors);
    }
    stagesCompleted.push("INPUT_VALIDATION");

    // 3. Policy evaluation — karar, sonucu ne olursa olsun audit'e yazılır.
    const policyDecision = this.policyEngine.evaluatePolicy({
      actionName: request.actionName,
      actorContext: request.executionContext,
      targetEntityRef: request.entityRef,
      normalizedInputHash: request.normalizedInputHash,
      runtimeRiskContext: request.runtimeRiskContext,
    });

    this.auditStore.append({
      recordType: "POLICY_DECISION",
      actionName: request.actionName,
      actorId,
      organizationId,
      entityRef: request.entityRef,
      executionId,
      policyDecisionRef: policyDecision.decisionId,
      outcome: policyDecision.outcome,
      reasonCode: policyDecision.reasonCode,
      inputHash: request.normalizedInputHash,
      metadata: { riskLevelComputed: policyDecision.riskLevelComputed },
    });

    if (policyDecision.outcome === "DENY") {
      throw new PolicyDeniedError(request.actionName, policyDecision.reasonCode);
    }
    stagesCompleted.push("POLICY_EVALUATION");

    // 4. Approval verification (gerekiyorsa) — doğrulama sonucu her zaman
    // audit'e yazılır; bu henüz "tüketim" değildir.
    if (policyDecision.outcome === "REQUIRES_APPROVAL") {
      if (!request.approvalGrant) {
        this.auditStore.append({
          recordType: "APPROVAL_EVENT",
          actionName: request.actionName,
          actorId,
          organizationId,
          entityRef: request.entityRef,
          executionId,
          outcome: "VALIDATION_FAILED",
          reasonCode: "APPROVAL_GRANT_MISSING",
          inputHash: request.normalizedInputHash,
          metadata: {},
        });
        throw new ApprovalRequiredError(request.actionName);
      }

      const validation = this.policyEngine.validateApprovalGrant(request.approvalGrant, {
        actionName: request.actionName,
        actorId,
        organizationId,
        targetEntityRef: request.entityRef,
        normalizedInputHash: request.normalizedInputHash,
      });

      this.auditStore.append({
        recordType: "APPROVAL_EVENT",
        actionName: request.actionName,
        actorId,
        organizationId,
        entityRef: request.entityRef,
        executionId,
        approvalRef: request.approvalGrant.approvalId,
        outcome: validation.valid ? "GRANTED" : "VALIDATION_FAILED",
        reasonCode: validation.reasonCode,
        inputHash: request.normalizedInputHash,
        metadata: {},
      });

      if (!validation.valid) {
        throw new ApprovalRequiredError(request.actionName, validation.reasonCode);
      }
    }
    stagesCompleted.push("APPROVAL_VERIFICATION");

    // 5. Idempotency check
    const reservation = this.idempotencyStore.reserve(
      request.idempotencyKey,
      request.actionName,
      request.normalizedInputHash,
      idempotencyScope,
    );

    if (reservation.kind === "CONFLICT") {
      throw new IdempotencyConflictError(request.idempotencyKey);
    }

    if (reservation.kind === "ALREADY_COMPLETED") {
      return reservation.result;
    }
    stagesCompleted.push("IDEMPOTENCY_CHECK");

    // Approval yalnızca bu execution'a fiilen commit olununca tüketilir;
    // böylece idempotent bir replay, zaten tüketilmiş bir grant'e takılmaz.
    // Tüketim "işlem başarıyla tamamlandı" anlamına gelmez — yalnızca bu
    // execution denemesi için kullanıldığı anlamına gelir; bu ayrım
    // audit'te ayrı bir APPROVAL_EVENT (CONSUMED) olarak görünür.
    if (policyDecision.outcome === "REQUIRES_APPROVAL" && request.approvalGrant) {
      this.policyEngine.consumeApproval(request.approvalGrant.approvalId);
      this.auditStore.append({
        recordType: "APPROVAL_EVENT",
        actionName: request.actionName,
        actorId,
        organizationId,
        entityRef: request.entityRef,
        executionId,
        approvalRef: request.approvalGrant.approvalId,
        outcome: "CONSUMED",
        inputHash: request.normalizedInputHash,
        metadata: { note: "Consumed for this execution attempt only; not an indicator of business success." },
      });
    }

    // Operation create — yalnızca gerçekten yeni bir execution için.
    const operation = this.operationStore.create({
      executionId,
      actionName: request.actionName,
      actorId,
      organizationId,
      entityRef: request.entityRef,
      correlationId: request.correlationId,
      causationId: request.causationId,
    });
    this.operationStore.updateCoreStatus(operation.operationId, "EXECUTING");

    // 6. Execution envelope oluştur
    const envelope: ActionExecutionEnvelope = Object.freeze({
      executionId,
      actionName: request.actionName,
      input: Object.freeze({ ...request.input }),
      entityRef: request.entityRef,
      executionContext: request.executionContext,
      idempotencyKey: request.idempotencyKey,
      approvalGrant: request.approvalGrant,
      startedAt,
    });
    stagesCompleted.push("ENVELOPE_CREATION");

    // 7. Registered handler çağır
    let handler: ActionHandler;
    try {
      handler = this.handlerRegistry.getHandler(request.actionName);
    } catch {
      this.failOperation(operation, "HANDLER_NOT_FOUND", `No handler registered for "${request.actionName}".`);
      this.auditStore.append({
        recordType: "ACTION_RESULT",
        actionName: request.actionName,
        actorId,
        organizationId,
        entityRef: request.entityRef,
        executionId,
        operationId: operation.operationId,
        outcome: "FAILED",
        reasonCode: "HANDLER_NOT_FOUND",
        inputHash: request.normalizedInputHash,
        metadata: {},
      });
      throw new HandlerNotFoundError(request.actionName);
    }

    this.auditStore.append({
      recordType: "EXECUTION_ATTEMPT",
      actionName: request.actionName,
      actorId,
      organizationId,
      entityRef: request.entityRef,
      executionId,
      operationId: operation.operationId,
      outcome: "ATTEMPTED",
      inputHash: request.normalizedInputHash,
      metadata: { idempotencyKey: request.idempotencyKey },
    });

    let handlerResult: HandlerResult;
    try {
      handlerResult = await handler(envelope);
    } catch (cause) {
      const failureSummary = cause instanceof Error ? cause.message : "Handler threw a non-Error value.";
      this.failOperation(operation, "HANDLER_THREW", failureSummary);
      this.auditStore.append({
        recordType: "ACTION_RESULT",
        actionName: request.actionName,
        actorId,
        organizationId,
        entityRef: request.entityRef,
        executionId,
        operationId: operation.operationId,
        outcome: "FAILED",
        reasonCode: "HANDLER_THREW",
        inputHash: request.normalizedInputHash,
        resultSummary: failureSummary,
        metadata: {},
      });
      throw new ExecutionFailedError(request.actionName, executionId, cause);
    }
    stagesCompleted.push("HANDLER_INVOCATION");

    if (handlerResult.status === "FAILURE") {
      this.failOperation(operation, "HANDLER_REPORTED_FAILURE", handlerResult.errorMessage);

      const result = this.buildResult(request, executionId, startedAt, stagesCompleted, handlerResult);

      this.auditStore.append({
        recordType: "ACTION_RESULT",
        actionName: request.actionName,
        actorId,
        organizationId,
        entityRef: request.entityRef,
        executionId,
        operationId: operation.operationId,
        outcome: "FAILED",
        inputHash: request.normalizedInputHash,
        resultSummary: handlerResult.resultSummary ?? handlerResult.errorMessage,
        metadata: {},
      });

      this.idempotencyStore.complete(request.idempotencyKey, result, idempotencyScope);
      return result;
    }

    // 8. Outbox enqueue (domain events + genel yan etkiler)
    const enqueuedEventIds: string[] = [];

    for (const descriptor of handlerResult.domainEvents ?? []) {
      const enqueued = this.outboxStore.enqueue({
        operationId: operation.operationId,
        executionId,
        organizationId,
        eventType: descriptor.eventType,
        effectType: "DOMAIN_EVENT",
        payload: { ...descriptor.payload, aggregateType: descriptor.aggregateType, aggregateId: descriptor.aggregateId },
        schemaVersion: descriptor.schemaVersion,
        correlationId: request.correlationId,
        causationId: request.causationId,
        deduplicationKey: descriptor.deduplicationKey,
      });
      enqueuedEventIds.push(enqueued.eventId);
    }

    for (const descriptor of handlerResult.sideEffects ?? []) {
      const enqueued = this.outboxStore.enqueue({
        operationId: operation.operationId,
        executionId,
        organizationId,
        eventType: descriptor.effectType,
        effectType: descriptor.effectType,
        payload: descriptor.payload,
        schemaVersion: descriptor.schemaVersion,
        correlationId: request.correlationId,
        causationId: request.causationId,
        deduplicationKey: descriptor.deduplicationKey,
      });
      enqueuedEventIds.push(enqueued.eventId);
    }

    for (const eventId of enqueuedEventIds) {
      this.operationStore.updateSideEffectStatus(operation.operationId, eventId, "PENDING");
    }

    // ActionResult
    const result = this.buildResult(request, executionId, startedAt, stagesCompleted, handlerResult);

    // audit
    this.auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: request.actionName,
      actorId,
      organizationId,
      entityRef: request.entityRef,
      executionId,
      operationId: operation.operationId,
      outcome: handlerResult.resultOutcome ?? "SUCCEEDED",
      inputHash: request.normalizedInputHash,
      resultSummary: handlerResult.resultSummary,
      metadata: { outboxEventCount: enqueuedEventIds.length },
    });

    // operation completion
    this.operationStore.updateCoreStatus(operation.operationId, "SUCCEEDED");
    this.operationStore.complete(operation.operationId);

    // idempotency completion
    this.idempotencyStore.complete(request.idempotencyKey, result, idempotencyScope);
    stagesCompleted.push("COMPLETION");

    return result;
  }

  getHandlerRegistry(): ActionHandlerRegistry {
    return this.handlerRegistry;
  }

  private failOperation(operation: OperationRecord, failureCode: string, failureSummary?: string): void {
    this.operationStore.updateCoreStatus(operation.operationId, "FAILED");
    this.operationStore.complete(operation.operationId, { failureCode, failureSummary });
  }

  private buildResult(
    request: ActionExecutionRequest,
    executionId: string,
    startedAt: string,
    stagesCompleted: ExecutionStage[],
    handlerResult: HandlerResult,
  ): ExecutionResult {
    const completedAt = this.clock().toISOString();
    const finalStages: ExecutionStage[] = [...stagesCompleted, "RESULT_BUILDING"];
    const metadata: ExecutionMetadata = Object.freeze({
      ...handlerResult.metadata,
      stagesCompleted: Object.freeze(finalStages),
    });

    return Object.freeze({
      actionName: request.actionName,
      executionId,
      status: handlerResult.status,
      entityRef: handlerResult.entityRef ?? request.entityRef,
      startedAt,
      completedAt,
      metadata,
    });
  }
}

export function createExecutionRuntime(options?: ExecutionRuntimeOptions): ExecutionRuntime {
  return new ExecutionRuntime(options);
}
