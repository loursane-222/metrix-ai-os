import type { TargetEntityRef } from "../policy";

export type CoreStatus = "PENDING" | "EXECUTING" | "SUCCEEDED" | "FAILED";

export type SideEffectStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "RETRYING" | "DEAD_LETTERED";

export type FinalState =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "COMPLETED_WITH_PENDING_SIDE_EFFECT"
  | "FAILED"
  | "FAILED_WITH_PARTIAL_SIDE_EFFECT";

/**
 * Her Domain Action execution denemesinin gerçek yaşam döngüsünü temsil
 * eden immutable snapshot. Hiçbir business mutation içermez — yalnızca
 * durumu sorgulanabilir biçimde tutar.
 */
export interface OperationRecord {
  readonly operationId: string;
  readonly executionId: string;
  readonly actionName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly entityRef?: TargetEntityRef;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly coreStatus: CoreStatus;
  readonly sideEffectStatuses: Readonly<Record<string, SideEffectStatus>>;
  readonly eventConsumptionStatuses: Readonly<Record<string, SideEffectStatus>>;
  readonly finalState: FinalState;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly failureSummary?: string;
}

export type CreateOperationInput = {
  operationId?: string;
  executionId: string;
  actionName: string;
  actorId: string;
  organizationId: string;
  entityRef?: TargetEntityRef;
  correlationId: string;
  causationId?: string;
};

export type CompleteOperationInput = {
  failureCode?: string;
  failureSummary?: string;
};

/**
 * Framework bağımsız soyutlama. Production'da kalıcı bir store ile
 * değiştirilebilir.
 */
export interface OperationStore {
  create(input: CreateOperationInput): OperationRecord;
  get(operationId: string): OperationRecord | undefined;
  updateCoreStatus(operationId: string, next: CoreStatus): OperationRecord;
  updateSideEffectStatus(operationId: string, key: string, status: SideEffectStatus): OperationRecord;
  updateEventConsumptionStatus(operationId: string, key: string, status: SideEffectStatus): OperationRecord;
  complete(operationId: string, outcome?: CompleteOperationInput): OperationRecord;
  listByOrganization(organizationId: string): OperationRecord[];
  listByCorrelationId(correlationId: string): OperationRecord[];
}
