import type {
  ApprovalGrant,
  ApprovalValidationResult,
  ExecutionCandidate as PolicyExecutionCandidate,
  PolicyDecision,
  PolicyEvaluationRequest,
  RuntimeRiskContext,
  TargetEntityRef,
} from "../policy";
import type { ActionDefinition } from "../registry/action-registry.types";
import type { DomainEventDescriptor } from "../events";
import type { SideEffectDescriptor } from "../outbox";

export type ExecutionStatus = "SUCCESS" | "FAILURE";

/** Pipeline sırası sabittir; bu sıralama değiştirilemez. */
export type ExecutionStage =
  | "REGISTRY_LOOKUP"
  | "INPUT_VALIDATION"
  | "POLICY_EVALUATION"
  | "APPROVAL_VERIFICATION"
  | "IDEMPOTENCY_CHECK"
  | "ENVELOPE_CREATION"
  | "HANDLER_INVOCATION"
  | "RESULT_BUILDING"
  | "COMPLETION";

/**
 * PolicyActorContext ile yapısal olarak aynıdır (actorId/organizationId/
 * role/permissions/sessionRef/issuedAt/expiresAt) — böylece doğrudan
 * PolicyEvaluationRequest.actorContext olarak geçirilebilir. Bilinçli
 * olarak ayrı tanımlanır: Execution modülünün kendi sınır tipidir.
 */
export type ExecutionContext = {
  actorId: string;
  organizationId: string;
  role: string;
  permissions: readonly string[];
  sessionRef: string;
  issuedAt: string;
  expiresAt: string;
};

export type ExecutionMetadata = {
  readonly stagesCompleted: readonly ExecutionStage[];
  readonly [key: string]: unknown;
};

export type ActionExecutionRequest = {
  actionName: string;
  input: Record<string, unknown>;
  executionContext: ExecutionContext;
  entityRef?: TargetEntityRef;
  idempotencyKey: string;
  normalizedInputHash: string;
  approvalGrant?: ApprovalGrant;
  runtimeRiskContext?: RuntimeRiskContext;
  /** Bileşik/çok-adımlı işleri tek bir iz altında toplayan paylaşılan kimlik. */
  correlationId: string;
  causationId?: string;
};

/** Handler'a geçirilen, dondurulmuş çalışma zamanı zarfı. */
export interface ActionExecutionEnvelope {
  readonly executionId: string;
  readonly actionName: string;
  readonly input: Record<string, unknown>;
  readonly entityRef?: TargetEntityRef;
  readonly executionContext: ExecutionContext;
  readonly idempotencyKey: string;
  readonly approvalGrant?: ApprovalGrant;
  readonly startedAt: string;
}

/**
 * Handler hiçbir OutboxStore çağırmaz — yalnızca domainEvents/sideEffects
 * descriptor'larını döndürür. Bunları gerçek Outbox girdilerine
 * genişletip enqueue etmek Execution Runtime'ın sorumluluğudur.
 */
export type HandlerResult = {
  status: ExecutionStatus;
  entityRef?: TargetEntityRef;
  resultSummary?: string;
  metadata?: Record<string, unknown>;
  domainEvents?: DomainEventDescriptor[];
  sideEffects?: SideEffectDescriptor[];
  errorMessage?: string;
  /**
   * Başarı durumunda ACTION_RESULT audit outcome'unu geçersiz kılmak için
   * generic, dar bir kaçış noktası — örn. no-op patch gibi "başarılı ama
   * hiçbir şey değişmedi" senaryolarını ayırt etmek için. Belirtilmezse
   * "SUCCEEDED" kullanılır.
   */
  resultOutcome?: "SUCCEEDED" | "NO_CHANGE";
};

/**
 * Handler'lar DI ile enjekte edilir; Execution Runtime hiçbir handler
 * implementasyonu bilmez, yalnızca bu imzayı bilir.
 */
export type ActionHandler = (envelope: ActionExecutionEnvelope) => Promise<HandlerResult> | HandlerResult;

export interface ExecutionResult {
  readonly actionName: string;
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly entityRef?: TargetEntityRef;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly metadata: ExecutionMetadata;
}

/**
 * Registry ile karıştırılmamalıdır: Registry yalnızca metadata tutar.
 * Bu, çalıştırılabilir fonksiyonların DI ile çözüldüğü ayrı bir kayıttır.
 */
export interface ActionHandlerRegistry {
  registerHandler(actionName: string, handler: ActionHandler): void;
  getHandler(actionName: string): ActionHandler;
  hasHandler(actionName: string): boolean;
  listHandlers(): readonly string[];
}

export type IdempotencyRecord = {
  key: string;
  scope: string;
  actionName: string;
  inputHash: string;
  status: "IN_PROGRESS" | "COMPLETED";
  result?: ExecutionResult;
  reservedAt: string;
  completedAt?: string;
};

export type IdempotencyReservationOutcome =
  | { kind: "RESERVED" }
  | { kind: "ALREADY_COMPLETED"; result: ExecutionResult }
  | { kind: "CONFLICT"; reasonCode: "INPUT_MISMATCH" | "IN_PROGRESS" };

/** Framework bağımsız soyutlama; production'da kalıcı bir store ile değiştirilebilir. */
export interface IdempotencyStore {
  reserve(key: string, actionName: string, inputHash: string, scope?: string): IdempotencyReservationOutcome;
  complete(key: string, result: ExecutionResult, scope?: string): void;
  lookup(key: string, scope?: string): IdempotencyRecord | undefined;
}

/** Execution Runtime'ın Registry'yle konuşmak için ihtiyaç duyduğu minimal yüzey. */
export type ExecutionActionRegistry = {
  getActionDefinition(actionName: string): ActionDefinition;
};

/** Execution Runtime'ın Policy Engine'le konuşmak için ihtiyaç duyduğu minimal yüzey. */
export type ExecutionPolicyEngine = {
  evaluatePolicy(request: PolicyEvaluationRequest): PolicyDecision;
  validateApprovalGrant(grant: ApprovalGrant, candidate: PolicyExecutionCandidate): ApprovalValidationResult;
  consumeApproval(approvalId: string): void;
};
