import { randomUUID } from "crypto";

import { ApprovalService } from "./approval-service";
import { evaluatePermissions } from "./permission-evaluator";
import { computeRuntimeRisk as computeRuntimeRiskInternal } from "./risk-evaluator";
import type {
  ApprovalGrant,
  ApprovalRequest,
  ApprovalValidationResult,
  CreateApprovalRequestInput,
  ExecutionCandidate,
  PolicyActionRegistry,
  PolicyDecision,
  PolicyEvaluationRequest,
  PolicyOutcome,
  PolicyRiskLevel,
  RuntimeRiskContext,
} from "./policy.types";
import { actionRegistry } from "../registry";
import type { ActionDefinition } from "../registry/action-registry.types";

export type PolicyEngineOptions = {
  registry?: PolicyActionRegistry;
  approvalService?: ApprovalService;
  /** Test edilebilirlik için enjekte edilebilir id üretici; PolicyDecision.decisionId için kullanılır. */
  generateId?: () => string;
};

type ApprovalNeed = {
  requiresApproval: boolean;
  reasonCode: string;
};

/**
 * Executive Policy, Permission & Approval Engine.
 *
 * Hiçbir action çalıştırmaz, hiçbir handler/service/repository/Prisma
 * çağırmaz. Yalnızca Registry'den ActionDefinition okur (gerçek
 * actionRegistry singleton'ı varsayılan bağımlılıktır); Page Context ve
 * Draft Runtime'a hiçbir referans içermez.
 *
 * evaluatePolicy() her zaman deterministik bir PolicyDecision döndürür;
 * hiçbir zaman "belirsiz tamam" çözümlemesi yapmaz — yalnızca belirli bir
 * ApprovalGrant'in doğrulanması validateApprovalGrant()'ın işidir.
 */
export class PolicyEngine {
  private readonly registry: PolicyActionRegistry;
  private readonly approvalService: ApprovalService;
  private readonly generateId: () => string;

  constructor(options: PolicyEngineOptions = {}) {
    this.registry = options.registry ?? actionRegistry;
    this.approvalService = options.approvalService ?? new ApprovalService();
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  computeRuntimeRisk(actionDefinition: ActionDefinition, runtimeRiskContext?: RuntimeRiskContext): PolicyRiskLevel {
    return computeRuntimeRiskInternal(actionDefinition, runtimeRiskContext);
  }

  evaluatePolicy(request: PolicyEvaluationRequest): PolicyDecision {
    let definition: ActionDefinition;

    try {
      definition = this.registry.getActionDefinition(request.actionName);
    } catch {
      return this.buildDecision(request.actionName, "DENY", "ACTION_NOT_REGISTERED", "CRITICAL", [], []);
    }

    const permissionResult = evaluatePermissions(definition.requiredPermissionSet, request.actorContext.permissions);
    const riskLevelComputed = this.computeRuntimeRisk(definition, request.runtimeRiskContext);

    if (!permissionResult.satisfied) {
      return this.buildDecision(
        request.actionName,
        "DENY",
        "PERMISSION_DENIED",
        riskLevelComputed,
        permissionResult.requiredPermissions,
        permissionResult.missingPermissions,
      );
    }

    const approvalNeed = this.resolveApprovalNeed(definition, riskLevelComputed);

    if (!approvalNeed.requiresApproval) {
      return this.buildDecision(
        request.actionName,
        "ALLOW",
        approvalNeed.reasonCode,
        riskLevelComputed,
        permissionResult.requiredPermissions,
        [],
      );
    }

    let approvalRequest: ApprovalRequest | undefined;

    if (request.normalizedInputHash) {
      approvalRequest = this.approvalService.createApprovalRequest({
        actionName: request.actionName,
        targetEntityRef: request.targetEntityRef,
        normalizedInputHash: request.normalizedInputHash,
        actorId: request.actorContext.actorId,
        organizationId: request.actorContext.organizationId,
        approvalTtlClass: definition.approvalTtlClass,
      });
    }

    return this.buildDecision(
      request.actionName,
      "REQUIRES_APPROVAL",
      approvalNeed.reasonCode,
      riskLevelComputed,
      permissionResult.requiredPermissions,
      [],
      approvalRequest,
    );
  }

  createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
    return this.approvalService.createApprovalRequest(input);
  }

  grantApproval(approvalId: string, grantedBy: string): ApprovalGrant {
    return this.approvalService.grantApproval(approvalId, grantedBy);
  }

  getApprovalGrant(approvalId: string): ApprovalGrant {
    return this.approvalService.getApprovalGrant(approvalId);
  }

  validateApprovalGrant(grant: ApprovalGrant, executionCandidate: ExecutionCandidate): ApprovalValidationResult {
    return this.approvalService.validateApprovalGrant(grant, executionCandidate);
  }

  consumeApproval(approvalId: string): void {
    this.approvalService.consumeApproval(approvalId);
  }

  revokeApproval(approvalId: string): void {
    this.approvalService.revokeApproval(approvalId);
  }

  getApprovalRequest(approvalId: string): ApprovalRequest {
    return this.approvalService.getApprovalRequest(approvalId);
  }

  listPendingApprovals(actorId: string, organizationId: string): ApprovalRequest[] {
    return this.approvalService.listPendingApprovals(actorId, organizationId);
  }

  listApprovalRequests(actorId: string, organizationId: string): ApprovalRequest[] {
    return this.approvalService.listApprovalRequests(actorId, organizationId);
  }

  private resolveApprovalNeed(definition: ActionDefinition, riskLevelComputed: PolicyRiskLevel): ApprovalNeed {
    switch (definition.approvalPolicy) {
      case "NONE":
        return { requiresApproval: false, reasonCode: "ALLOWED" };
      case "EXPLICIT":
        return { requiresApproval: true, reasonCode: "EXPLICIT_APPROVAL_REQUIRED" };
      case "CONDITIONAL": {
        const requiresApproval = riskLevelComputed === "HIGH" || riskLevelComputed === "CRITICAL";
        return {
          requiresApproval,
          reasonCode: requiresApproval ? "CONDITIONAL_RISK_APPROVAL_REQUIRED" : "CONDITIONAL_RISK_ALLOWED",
        };
      }
    }
  }

  private buildDecision(
    actionName: string,
    outcome: PolicyOutcome,
    reasonCode: string,
    riskLevelComputed: PolicyRiskLevel,
    requiredPermissions: readonly string[],
    missingPermissions: readonly string[],
    approvalRequest?: ApprovalRequest,
  ): PolicyDecision {
    return Object.freeze({
      decisionId: this.generateId(),
      actionName,
      outcome,
      reasonCode,
      riskLevelComputed,
      requiredPermissions: Object.freeze([...requiredPermissions]),
      missingPermissions: Object.freeze([...missingPermissions]),
      approvalRequest,
    });
  }
}

export function createPolicyEngine(options?: PolicyEngineOptions): PolicyEngine {
  return new PolicyEngine(options);
}
