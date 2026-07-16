import type { TargetEntityRef } from "../policy";

export type AuditRecordType = "POLICY_DECISION" | "APPROVAL_EVENT" | "EXECUTION_ATTEMPT" | "ACTION_RESULT" | "CORRECTION";

export type AuditOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRES_APPROVAL"
  | "GRANTED"
  | "CONSUMED"
  | "REVOKED"
  | "VALIDATION_FAILED"
  | "ATTEMPTED"
  | "SUCCEEDED"
  | "NO_CHANGE"
  | "FAILED"
  | "CORRECTED";

/**
 * Append-only kayıt. Hassas ham action input'unu asla taşımaz — yalnızca
 * inputHash ve minimize edilmiş metadata kabul edilir. Transient
 * etkileşim logları (öneri denemeleri, iptal edilen draft'lar) bu
 * modele girmez.
 */
export interface AuditRecord {
  readonly auditId: string;
  readonly recordType: AuditRecordType;
  readonly actionName: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly entityRef?: TargetEntityRef;
  readonly executionId?: string;
  readonly operationId?: string;
  readonly policyDecisionRef?: string;
  readonly approvalRef?: string;
  readonly outcome: AuditOutcome;
  readonly reasonCode?: string;
  readonly inputHash?: string;
  readonly resultSummary?: string;
  readonly correctsAuditId?: string;
  readonly correctedByAuditId?: string;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AppendAuditRecordInput = {
  auditId?: string;
  recordType: AuditRecordType;
  actionName: string;
  actorId: string;
  organizationId: string;
  entityRef?: TargetEntityRef;
  executionId?: string;
  operationId?: string;
  policyDecisionRef?: string;
  approvalRef?: string;
  outcome: AuditOutcome;
  reasonCode?: string;
  inputHash?: string;
  resultSummary?: string;
  correctsAuditId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Framework bağımsız append-only soyutlama. Production'da kalıcı bir
 * store ile değiştirilebilir.
 */
export interface AuditStore {
  append(input: AppendAuditRecordInput): AuditRecord;
  get(auditId: string): AuditRecord | undefined;
  listByOrganization(organizationId: string): AuditRecord[];
  listByEntity(organizationId: string, entityRef: TargetEntityRef): AuditRecord[];
  listByExecution(executionId: string): AuditRecord[];
  listByOperation(operationId: string): AuditRecord[];
  linkCorrection(originalAuditId: string, correctionAuditId: string): void;
}
