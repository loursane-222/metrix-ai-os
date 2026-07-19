import { randomUUID } from "crypto";

import { deriveFinalState, isValidCoreStatusTransition } from "./operation-transitions";
import { InvalidOperationTransitionError, OperationNotFoundError } from "./operation.errors";
import type {
  CompleteOperationInput,
  CreateOperationInput,
  OperationRecord,
  OperationStore,
  SideEffectStatus,
} from "./operation.types";

export type InMemoryOperationStoreOptions = {
  clock?: () => Date;
  generateId?: () => string;
};

/**
 * Framework bağımsız in-memory implementasyon. Her çağrı izole bir Map
 * yaratır — global mutable test sızıntısı oluşturmaz.
 */
export function createInMemoryOperationStore(options: InMemoryOperationStoreOptions = {}): OperationStore {
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? (() => randomUUID());
  const operations = new Map<string, OperationRecord>();

  function requireOperation(operationId: string): OperationRecord {
    const operation = operations.get(operationId);
    if (!operation) {
      throw new OperationNotFoundError(operationId);
    }
    return operation;
  }

  function effectStatusesOf(operation: OperationRecord): SideEffectStatus[] {
    return [...Object.values(operation.sideEffectStatuses), ...Object.values(operation.eventConsumptionStatuses)];
  }

  function persist(operation: OperationRecord): OperationRecord {
    const frozen: OperationRecord = Object.freeze({
      ...operation,
      sideEffectStatuses: Object.freeze({ ...operation.sideEffectStatuses }),
      eventConsumptionStatuses: Object.freeze({ ...operation.eventConsumptionStatuses }),
    });
    operations.set(operation.operationId, frozen);
    return frozen;
  }

  return {
    create(input: CreateOperationInput) {
      const operationId = input.operationId ?? generateId();

      const record: OperationRecord = {
        operationId,
        executionId: input.executionId,
        actionName: input.actionName,
        actorId: input.actorId,
        organizationId: input.organizationId,
        entityRef: input.entityRef,
        correlationId: input.correlationId,
        causationId: input.causationId,
        coreStatus: "PENDING",
        sideEffectStatuses: {},
        eventConsumptionStatuses: {},
        finalState: "IN_PROGRESS",
        startedAt: clock().toISOString(),
      };

      return persist(record);
    },
    get(operationId) {
      return operations.get(operationId);
    },
    updateCoreStatus(operationId, next) {
      const operation = requireOperation(operationId);

      if (!isValidCoreStatusTransition(operation.coreStatus, next)) {
        throw new InvalidOperationTransitionError(operationId, operation.coreStatus, next);
      }

      const finalState = deriveFinalState(next, effectStatusesOf(operation));
      return persist({ ...operation, coreStatus: next, finalState });
    },
    updateSideEffectStatus(operationId, key, status) {
      const operation = requireOperation(operationId);
      const sideEffectStatuses = { ...operation.sideEffectStatuses, [key]: status };
      const finalState = deriveFinalState(operation.coreStatus, [
        ...Object.values(sideEffectStatuses),
        ...Object.values(operation.eventConsumptionStatuses),
      ]);
      return persist({ ...operation, sideEffectStatuses, finalState });
    },
    updateEventConsumptionStatus(operationId, key, status) {
      const operation = requireOperation(operationId);
      const eventConsumptionStatuses = { ...operation.eventConsumptionStatuses, [key]: status };
      const finalState = deriveFinalState(operation.coreStatus, [
        ...Object.values(operation.sideEffectStatuses),
        ...Object.values(eventConsumptionStatuses),
      ]);
      return persist({ ...operation, eventConsumptionStatuses, finalState });
    },
    complete(operationId, outcome: CompleteOperationInput = {}) {
      const operation = requireOperation(operationId);

      if (operation.completedAt !== undefined) {
        throw new InvalidOperationTransitionError(operationId, operation.coreStatus, "COMPLETE");
      }

      if (operation.coreStatus !== "SUCCEEDED" && operation.coreStatus !== "FAILED") {
        throw new InvalidOperationTransitionError(operationId, operation.coreStatus, "COMPLETE");
      }

      const finalState = deriveFinalState(operation.coreStatus, effectStatusesOf(operation));

      return persist({
        ...operation,
        finalState,
        completedAt: clock().toISOString(),
        failureCode: outcome.failureCode ?? operation.failureCode,
        failureSummary: outcome.failureSummary ?? operation.failureSummary,
      });
    },
    listByOrganization(organizationId) {
      return [...operations.values()].filter((operation) => operation.organizationId === organizationId);
    },
    listByCorrelationId(correlationId) {
      return [...operations.values()].filter((operation) => operation.correlationId === correlationId);
    },
  };
}
