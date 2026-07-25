import { randomUUID } from "crypto";

import { createInMemoryApprovalStore } from "./approval-store";
import type { ApprovalStore } from "./approval-store";
import { DEFAULT_POLICY_CONFIG } from "./policy-config";
import type { PolicyConfig } from "./policy-config";
import { ApprovalRequestNotFoundError, InvalidApprovalStateError } from "./policy.errors";
import type {
  ApprovalGrant,
  ApprovalRequest,
  ApprovalValidationResult,
  CreateApprovalRequestInput,
  ExecutionCandidate,
  TargetEntityRef,
} from "./policy.types";

export type ApprovalServiceOptions = {
  store?: ApprovalStore;
  config?: PolicyConfig;
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
  /** Test edilebilirlik için enjekte edilebilir id üretici; varsayılan crypto.randomUUID. */
  generateId?: () => string;
};

function targetRefsEqual(a?: TargetEntityRef, b?: TargetEntityRef): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.entityType === b.entityType && a.entityId === b.entityId;
}

/**
 * Approval Request/Grant yaşam döngüsünü yönetir. Hiçbir handler,
 * repository veya Prisma bilmez; yalnızca ApprovalStore soyutlamasıyla
 * konuşur.
 */
export class ApprovalService {
  private readonly store: ApprovalStore;
  private readonly config: PolicyConfig;
  private readonly clock: () => Date;
  private readonly generateId: () => string;

  constructor(options: ApprovalServiceOptions = {}) {
    this.store = options.store ?? createInMemoryApprovalStore();
    this.config = options.config ?? DEFAULT_POLICY_CONFIG;
    this.clock = options.clock ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  async createApprovalRequest(input: CreateApprovalRequestInput): Promise<ApprovalRequest> {
    const now = this.clock();
    const ttlMs = this.config.approvalTtlMsByClass[input.approvalTtlClass];

    const request: ApprovalRequest = Object.freeze({
      approvalId: input.approvalId ?? this.generateId(),
      actionName: input.actionName,
      targetEntityRef: input.targetEntityRef,
      normalizedInputHash: input.normalizedInputHash,
      actorId: input.actorId,
      organizationId: input.organizationId,
      approvalTtlClass: input.approvalTtlClass,
      riskLevel: input.riskLevel ?? "HIGH",
      correlationId: input.correlationId ?? this.generateId(),
      idempotencyKey: input.idempotencyKey ?? this.generateId(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "PENDING",
    });

    return this.store.save(request);
  }

  async grantApproval(approvalId: string, grantedBy: string, reason?: string): Promise<ApprovalGrant> {
    const request = await this.requireRequest(approvalId);

    if (this.isExpired(request) && request.status === "PENDING") {
      await this.store.update(Object.freeze({ ...request, status: "EXPIRED" }));
      throw new InvalidApprovalStateError(approvalId, "EXPIRED", "grantApproval");
    }

    if (request.status !== "PENDING") {
      throw new InvalidApprovalStateError(approvalId, request.status, "grantApproval");
    }

    const decidedAt = this.clock().toISOString();
    const granted: ApprovalRequest = Object.freeze({ ...request, status: "GRANTED" });
    const transitioned = await this.store.update(granted, {
      decidedAt,
      decidedByUserId: grantedBy,
      decision: "APPROVED",
      decisionReason: reason,
    }, "PENDING");
    if (!transitioned) throw new InvalidApprovalStateError(approvalId, request.status, "grantApproval");

    const grant: ApprovalGrant = Object.freeze({
      approvalId: request.approvalId,
      actionName: request.actionName,
      targetEntityRef: request.targetEntityRef,
      boundInputHash: request.normalizedInputHash,
      boundActorId: request.actorId,
      boundOrganizationId: request.organizationId,
      grantedAt: decidedAt,
      expiresAt: request.expiresAt,
      singleUse: true,
    });
    return grant;
  }

  async getApprovalGrant(approvalId: string): Promise<ApprovalGrant> {
    const request = await this.requireRequest(approvalId);
    if (request.status !== "GRANTED") {
      throw new InvalidApprovalStateError(approvalId, request.status, "getApprovalGrant");
    }
    return this.buildGrant(request);
  }

  async validateApprovalGrant(grant: ApprovalGrant, executionCandidate: ExecutionCandidate): Promise<ApprovalValidationResult> {
    const request = await this.store.find(grant.approvalId);

    if (!request) {
      return { valid: false, reasonCode: "APPROVAL_NOT_FOUND" };
    }

    if (request.status === "CONSUMED") {
      return { valid: false, reasonCode: "APPROVAL_ALREADY_CONSUMED", approvalId: grant.approvalId };
    }

    if (request.status === "REVOKED") {
      return { valid: false, reasonCode: "APPROVAL_REVOKED", approvalId: grant.approvalId };
    }

    if (request.status !== "GRANTED") {
      return { valid: false, reasonCode: "APPROVAL_NOT_GRANTED", approvalId: grant.approvalId };
    }

    if (this.isExpired(request)) {
      await this.store.update(Object.freeze({ ...request, status: "EXPIRED" }));
      return { valid: false, reasonCode: "APPROVAL_EXPIRED", approvalId: grant.approvalId };
    }

    if (grant.boundActorId !== executionCandidate.actorId) {
      return { valid: false, reasonCode: "ACTOR_MISMATCH", approvalId: grant.approvalId };
    }

    if (grant.boundOrganizationId !== executionCandidate.organizationId) {
      return { valid: false, reasonCode: "ORGANIZATION_MISMATCH", approvalId: grant.approvalId };
    }

    if (grant.actionName !== executionCandidate.actionName) {
      return { valid: false, reasonCode: "ACTION_MISMATCH", approvalId: grant.approvalId };
    }

    if (!targetRefsEqual(grant.targetEntityRef, executionCandidate.targetEntityRef)) {
      return { valid: false, reasonCode: "TARGET_MISMATCH", approvalId: grant.approvalId };
    }

    if (grant.boundInputHash !== executionCandidate.normalizedInputHash) {
      return { valid: false, reasonCode: "INPUT_HASH_MISMATCH", approvalId: grant.approvalId };
    }

    return { valid: true, reasonCode: "APPROVAL_VALID", approvalId: grant.approvalId };
  }

  async consumeApproval(approvalId: string): Promise<void> {
    const request = await this.requireRequest(approvalId);

    if (request.status !== "GRANTED") {
      throw new InvalidApprovalStateError(approvalId, request.status, "consumeApproval");
    }

    const consumedAt = this.clock().toISOString();
    const consumed = await this.store.update(
      Object.freeze({ ...request, status: "CONSUMED" }),
      { consumedAt },
      "GRANTED",
    );
    if (!consumed) throw new InvalidApprovalStateError(approvalId, request.status, "consumeApproval");
  }

  async revokeApproval(approvalId: string, decidedBy?: string, reason?: string): Promise<void> {
    const request = await this.requireRequest(approvalId);
    if (request.status !== "PENDING" && request.status !== "GRANTED") {
      throw new InvalidApprovalStateError(approvalId, request.status, "revokeApproval");
    }
    const decidedAt = this.clock().toISOString();
    const revoked = await this.store.update(Object.freeze({ ...request, status: "REVOKED" }), {
      decidedAt,
      decidedByUserId: decidedBy,
      decision: request.status === "PENDING" ? "REJECTED" : "CANCELLED",
      decisionReason: reason,
    }, request.status);
    if (!revoked) throw new InvalidApprovalStateError(approvalId, request.status, "revokeApproval");
  }

  async getApprovalRequest(approvalId: string): Promise<ApprovalRequest> {
    return this.requireRequest(approvalId);
  }

  async listPendingApprovals(actorId: string, organizationId: string): Promise<ApprovalRequest[]> {
    return (await this.listApprovalRequests(actorId, organizationId))
      .filter((request) => request.status === "PENDING");
  }

  async listApprovalRequests(actorId: string, organizationId: string): Promise<ApprovalRequest[]> {
    return Promise.all((await this.store.listByActorAndOrganization(actorId, organizationId)).map(async (request) => {
      if (request.status !== "PENDING" || !this.isExpired(request)) return request;
      const expired = Object.freeze({ ...request, status: "EXPIRED" as const });
      await this.store.update(expired);
      return expired;
    }));
  }

  private async requireRequest(approvalId: string): Promise<ApprovalRequest> {
    const request = await this.store.find(approvalId);

    if (!request) {
      throw new ApprovalRequestNotFoundError(approvalId);
    }

    return request;
  }

  private isExpired(request: ApprovalRequest): boolean {
    return this.clock().getTime() > new Date(request.expiresAt).getTime();
  }

  private buildGrant(request: ApprovalRequest): ApprovalGrant {
    return Object.freeze({
      approvalId: request.approvalId,
      actionName: request.actionName,
      targetEntityRef: request.targetEntityRef,
      boundInputHash: request.normalizedInputHash,
      boundActorId: request.actorId,
      boundOrganizationId: request.organizationId,
      grantedAt: request.createdAt,
      expiresAt: request.expiresAt,
      singleUse: true,
    });
  }
}

export function createApprovalService(options?: ApprovalServiceOptions): ApprovalService {
  return new ApprovalService(options);
}
