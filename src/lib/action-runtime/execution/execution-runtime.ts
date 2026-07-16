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
import { actionRegistry as defaultActionRegistry } from "../registry";
import type { ActionDefinition } from "../registry/action-registry.types";
import { policyEngine as defaultPolicyEngine } from "../policy";

export type ExecutionRuntimeOptions = {
  registry?: ExecutionActionRegistry;
  policyEngine?: ExecutionPolicyEngine;
  handlerRegistry?: ActionHandlerRegistry;
  idempotencyStore?: IdempotencyStore;
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
  /** Test edilebilirlik için enjekte edilebilir id üretici; executionId için kullanılır. */
  generateId?: () => string;
};

/**
 * Executive Domain Action Execution Runtime — Foundation.
 *
 * executeAction() tek public giriş noktasıdır. Pipeline sırası sabittir
 * ve değiştirilemez:
 *   1. Registry lookup
 *   2. Input schema validation
 *   3. Policy evaluation
 *   4. Approval verification (gerekiyorsa)
 *   5. Idempotency check
 *   6. Execution envelope oluştur
 *   7. Registered handler çağır
 *   8. ExecutionResult üret
 *   9. Execution tamamla
 *
 * Hiçbir repository/service/Prisma çağırmaz, hiçbir handler
 * implementasyonu bilmez — handler'lar ActionHandlerRegistry üzerinden
 * DI ile çözülür. Domain Event/Outbox/Audit persistence bu fazda henüz
 * çalıştırılmaz (placeholder kapsam dışıdır, sonraki fazların işidir).
 */
export class ExecutionRuntime {
  private readonly registry: ExecutionActionRegistry;
  private readonly policyEngine: ExecutionPolicyEngine;
  private readonly handlerRegistry: ActionHandlerRegistry;
  private readonly idempotencyStore: IdempotencyStore;
  private readonly clock: () => Date;
  private readonly generateId: () => string;

  constructor(options: ExecutionRuntimeOptions = {}) {
    this.registry = options.registry ?? defaultActionRegistry;
    this.policyEngine = options.policyEngine ?? defaultPolicyEngine;
    this.handlerRegistry = options.handlerRegistry ?? createInMemoryHandlerRegistry();
    this.idempotencyStore = options.idempotencyStore ?? createInMemoryIdempotencyStore();
    this.clock = options.clock ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  async executeAction(request: ActionExecutionRequest): Promise<ExecutionResult> {
    const executionId = this.generateId();
    const startedAt = this.clock().toISOString();
    const stagesCompleted: ExecutionStage[] = [];

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

    // 3. Policy evaluation
    const policyDecision = this.policyEngine.evaluatePolicy({
      actionName: request.actionName,
      actorContext: request.executionContext,
      targetEntityRef: request.entityRef,
      normalizedInputHash: request.normalizedInputHash,
      runtimeRiskContext: request.runtimeRiskContext,
    });

    if (policyDecision.outcome === "DENY") {
      throw new PolicyDeniedError(request.actionName, policyDecision.reasonCode);
    }
    stagesCompleted.push("POLICY_EVALUATION");

    // 4. Approval verification (gerekiyorsa)
    if (policyDecision.outcome === "REQUIRES_APPROVAL") {
      if (!request.approvalGrant) {
        throw new ApprovalRequiredError(request.actionName);
      }

      const validation = this.policyEngine.validateApprovalGrant(request.approvalGrant, {
        actionName: request.actionName,
        actorId: request.executionContext.actorId,
        organizationId: request.executionContext.organizationId,
        targetEntityRef: request.entityRef,
        normalizedInputHash: request.normalizedInputHash,
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
    if (policyDecision.outcome === "REQUIRES_APPROVAL" && request.approvalGrant) {
      this.policyEngine.consumeApproval(request.approvalGrant.approvalId);
    }

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
      throw new HandlerNotFoundError(request.actionName);
    }

    let handlerResult: HandlerResult;
    try {
      handlerResult = await handler(envelope);
    } catch (cause) {
      throw new ExecutionFailedError(request.actionName, executionId, cause);
    }
    stagesCompleted.push("HANDLER_INVOCATION");

    // 8. ExecutionResult üret
    const completedAt = this.clock().toISOString();
    const finalStages: ExecutionStage[] = [...stagesCompleted, "RESULT_BUILDING"];
    const metadata: ExecutionMetadata = Object.freeze({
      ...handlerResult.metadata,
      stagesCompleted: Object.freeze(finalStages),
    });

    const result: ExecutionResult = Object.freeze({
      actionName: request.actionName,
      executionId,
      status: handlerResult.status,
      entityRef: handlerResult.entityRef ?? request.entityRef,
      startedAt,
      completedAt,
      metadata,
    });

    // 9. Execution tamamla
    this.idempotencyStore.complete(request.idempotencyKey, result);

    return result;
  }

  getHandlerRegistry(): ActionHandlerRegistry {
    return this.handlerRegistry;
  }
}

export function createExecutionRuntime(options?: ExecutionRuntimeOptions): ExecutionRuntime {
  return new ExecutionRuntime(options);
}
