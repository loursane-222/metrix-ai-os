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
  private readonly grants = new Map<string, ApprovalGrant>();

  constructor(options: ApprovalServiceOptions = {}) {
    this.store = options.store ?? createInMemoryApprovalStore();
    this.config = options.config ?? DEFAULT_POLICY_CONFIG;
    this.clock = options.clock ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequest {
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
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "PENDING",
    });

    this.store.save(request);
    return request;
  }

  grantApproval(approvalId: string, grantedBy: string): ApprovalGrant {
    // grantedBy şu an yalnızca arayüz bütünlüğü için kabul edilir;
    // audit persistence bu fazın kapsamı dışındadır.
    void grantedBy;

    const request = this.requireRequest(approvalId);

    if (this.isExpired(request) && request.status === "PENDING") {
      this.store.update(Object.freeze({ ...request, status: "EXPIRED" }));
      throw new InvalidApprovalStateError(approvalId, "EXPIRED", "grantApproval");
    }

    if (request.status !== "PENDING") {
      throw new InvalidApprovalStateError(approvalId, request.status, "grantApproval");
    }

    const granted: ApprovalRequest = Object.freeze({ ...request, status: "GRANTED" });
    this.store.update(granted);

    const grant: ApprovalGrant = Object.freeze({
      approvalId: request.approvalId,
      actionName: request.actionName,
      targetEntityRef: request.targetEntityRef,
      boundInputHash: request.normalizedInputHash,
      boundActorId: request.actorId,
      boundOrganizationId: request.organizationId,
      grantedAt: this.clock().toISOString(),
      expiresAt: request.expiresAt,
      singleUse: true,
    });
    this.grants.set(request.approvalId, grant);
    return grant;
  }

  getApprovalGrant(approvalId: string): ApprovalGrant {
    const request = this.requireRequest(approvalId);
    if (request.status !== "GRANTED") {
      throw new InvalidApprovalStateError(approvalId, request.status, "getApprovalGrant");
    }
    const grant = this.grants.get(approvalId);
    if (!grant) throw new InvalidApprovalStateError(approvalId, request.status, "getApprovalGrant");
    return grant;
  }

  validateApprovalGrant(grant: ApprovalGrant, executionCandidate: ExecutionCandidate): ApprovalValidationResult {
    const request = this.store.find(grant.approvalId);

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
      this.store.update(Object.freeze({ ...request, status: "EXPIRED" }));
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

  consumeApproval(approvalId: string): void {
    const request = this.requireRequest(approvalId);

    if (request.status !== "GRANTED") {
      throw new InvalidApprovalStateError(approvalId, request.status, "consumeApproval");
    }

    this.store.update(Object.freeze({ ...request, status: "CONSUMED" }));
  }

  revokeApproval(approvalId: string): void {
    const request = this.requireRequest(approvalId);
    this.store.update(Object.freeze({ ...request, status: "REVOKED" }));
  }

  getApprovalRequest(approvalId: string): ApprovalRequest {
    return this.requireRequest(approvalId);
  }

  listPendingApprovals(actorId: string, organizationId: string): ApprovalRequest[] {
    return this.store
      .listByActorAndOrganization(actorId, organizationId)
      .filter((request) => request.status === "PENDING" && !this.isExpired(request));
  }

  listApprovalRequests(actorId: string, organizationId: string): ApprovalRequest[] {
    return this.store.listByActorAndOrganization(actorId, organizationId).map((request) => {
      if (request.status !== "PENDING" || !this.isExpired(request)) return request;
      const expired = Object.freeze({ ...request, status: "EXPIRED" as const });
      this.store.update(expired);
      return expired;
    });
  }

  private requireRequest(approvalId: string): ApprovalRequest {
    const request = this.store.find(approvalId);

    if (!request) {
      throw new ApprovalRequestNotFoundError(approvalId);
    }

    return request;
  }

  private isExpired(request: ApprovalRequest): boolean {
    return this.clock().getTime() > new Date(request.expiresAt).getTime();
  }
}

export function createApprovalService(options?: ApprovalServiceOptions): ApprovalService {
  return new ApprovalService(options);
}
