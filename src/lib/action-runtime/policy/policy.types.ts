import type { ActionDefinition, ApprovalTtlClass } from "../registry/action-registry.types";

/**
 * Registry'nin riskLevelBase'i (LOW/MEDIUM/HIGH) yalnızca statik bir
 * taban değerdir. CRITICAL yalnızca çalışma zamanı yükseltmesiyle
 * ulaşılabilir bir seviyedir; bu yüzden Policy modülü kendi risk
 * enum'unu tanımlar (Registry'nin RiskLevel'ından bağımsız, onu içerir).
 */
export type PolicyRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReversibilityClass = "REVERSIBLE" | "COMPENSATABLE" | "CORRECTABLE" | "IRREVERSIBLE";

export type PolicyActorContext = {
  actorId: string;
  organizationId: string;
  role: string;
  permissions: readonly string[];
  sessionRef: string;
  issuedAt: string;
  expiresAt: string;
};

export type TargetEntityRef = {
  entityType: string;
  entityId: string;
};

export type OrganizationPolicyOverrides = {
  minimumRiskLevel?: PolicyRiskLevel;
};

/**
 * Generic çalışma zamanı risk sözleşmesi. Hiçbir Customers'a özgü alan
 * veya tutar kuralı içermez — bu tür kararlar organizationPolicyOverrides
 * veya changedFields/targetState üzerinden çağıran tarafından beslenir.
 */
export type RuntimeRiskContext = {
  changedFields?: readonly string[];
  targetState?: Record<string, unknown>;
  externalSideEffect?: boolean;
  reversibilityClass?: ReversibilityClass;
  organizationPolicyOverrides?: OrganizationPolicyOverrides;
};

export type PolicyEvaluationRequest = {
  actionName: string;
  actorContext: PolicyActorContext;
  targetEntityRef?: TargetEntityRef;
  normalizedInputHash?: string;
  runtimeRiskContext?: RuntimeRiskContext;
};

export type PolicyOutcome = "ALLOW" | "DENY" | "REQUIRES_APPROVAL";

export type ApprovalStatus = "PENDING" | "GRANTED" | "EXPIRED" | "REVOKED" | "CONSUMED";

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly actionName: string;
  readonly targetEntityRef?: TargetEntityRef;
  readonly normalizedInputHash: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly approvalTtlClass: ApprovalTtlClass;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: ApprovalStatus;
}

export interface PolicyDecision {
  readonly decisionId: string;
  readonly actionName: string;
  readonly outcome: PolicyOutcome;
  readonly reasonCode: string;
  readonly riskLevelComputed: PolicyRiskLevel;
  readonly requiredPermissions: readonly string[];
  readonly missingPermissions: readonly string[];
  readonly approvalRequest?: ApprovalRequest;
}

export interface ApprovalGrant {
  readonly approvalId: string;
  readonly actionName: string;
  readonly targetEntityRef?: TargetEntityRef;
  readonly boundInputHash: string;
  readonly boundActorId: string;
  readonly boundOrganizationId: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly singleUse: boolean;
}

export interface ApprovalValidationResult {
  readonly valid: boolean;
  readonly reasonCode: string;
  readonly approvalId?: string;
}

/** validateApprovalGrant()'ın karşılaştırıldığı somut yürütme adayı. */
export type ExecutionCandidate = {
  actionName: string;
  actorId: string;
  organizationId: string;
  targetEntityRef?: TargetEntityRef;
  normalizedInputHash: string;
};

export type CreateApprovalRequestInput = {
  approvalId?: string;
  actionName: string;
  targetEntityRef?: TargetEntityRef;
  normalizedInputHash: string;
  actorId: string;
  organizationId: string;
  approvalTtlClass: ApprovalTtlClass;
};

/**
 * Policy Engine'in Registry'yle konuşmak için ihtiyaç duyduğu minimal
 * yüzey. Gerçek actionRegistry singleton'ı bu sözleşmeyi sağlar; testler
 * için enjekte edilebilir.
 */
export type PolicyActionRegistry = {
  getActionDefinition(actionName: string): ActionDefinition;
};
