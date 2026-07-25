import type { ActionApproval, PrismaClient } from "@prisma/client";
import type { ApprovalRequest, ApprovalStatus } from "./policy.types";

export interface ApprovalStore {
  save(request: ApprovalRequest): Promise<ApprovalRequest>;
  find(approvalId: string): Promise<ApprovalRequest | undefined>;
  update(request: ApprovalRequest, audit?: ApprovalStoreAuditUpdate, expectedStatus?: ApprovalStatus): Promise<boolean>;
  listByActorAndOrganization(actorId: string, organizationId: string): Promise<ApprovalRequest[]>;
}

export type ApprovalStoreAuditUpdate = Readonly<{
  decidedAt?: string;
  decidedByUserId?: string;
  decision?: "APPROVED" | "REJECTED" | "CANCELLED";
  decisionReason?: string;
  consumedAt?: string;
}>;

export function createInMemoryApprovalStore(): ApprovalStore {
  const requests = new Map<string, ApprovalRequest>();
  return {
    async save(request) {
      const existing = [...requests.values()].find((item) =>
        item.organizationId === request.organizationId
        && item.actorId === request.actorId
        && item.idempotencyKey === request.idempotencyKey);
      if (existing) {
        assertIdempotentApprovalContext(existing, request);
        return existing;
      }
      requests.set(request.approvalId, request);
      return request;
    },
    async find(approvalId) { return requests.get(approvalId); },
    async update(request, _audit, expectedStatus) {
      const current = requests.get(request.approvalId);
      if (expectedStatus && current?.status !== expectedStatus) return false;
      requests.set(request.approvalId, request);
      return true;
    },
    async listByActorAndOrganization(actorId, organizationId) {
      return [...requests.values()].filter(
        (request) => request.actorId === actorId && request.organizationId === organizationId,
      );
    },
  };
}

type ApprovalPrismaClient = Pick<PrismaClient, "actionApproval">;
type ApprovalPrismaClientSource = ApprovalPrismaClient | (() => Promise<ApprovalPrismaClient>);

export function createPrismaApprovalStore(source: ApprovalPrismaClientSource): ApprovalStore {
  const getClient = async () => typeof source === "function" ? source() : source;
  return {
    async save(request) {
      const client = await getClient();
      const row = await client.actionApproval.upsert({
        where: {
          organizationId_actorUserId_idempotencyKey: {
            organizationId: request.organizationId,
            actorUserId: request.actorId,
            idempotencyKey: request.idempotencyKey,
          },
        },
        create: {
          id: request.approvalId,
          organizationId: request.organizationId,
          actorUserId: request.actorId,
          actionName: request.actionName,
          targetEntityType: request.targetEntityRef?.entityType,
          targetEntityId: request.targetEntityRef?.entityId,
          normalizedInputHash: request.normalizedInputHash,
          riskLevel: request.riskLevel,
          status: toPersistenceStatus(request.status),
          requestedAt: new Date(request.createdAt),
          expiresAt: new Date(request.expiresAt),
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
        },
        update: {},
      });
      const persisted = mapRow(row);
      assertIdempotentApprovalContext(persisted, request);
      return persisted;
    },
    async find(approvalId) {
      const client = await getClient();
      const row = await client.actionApproval.findUnique({ where: { id: approvalId } });
      return row ? mapRow(row) : undefined;
    },
    async update(request, audit, expectedStatus) {
      const client = await getClient();
      const result = await client.actionApproval.updateMany({
        where: {
          id: request.approvalId,
          ...(expectedStatus ? { status: toPersistenceStatus(expectedStatus) } : {}),
        },
        data: {
          status: audit?.decision === "CANCELLED"
            ? "CANCELLED"
            : toPersistenceStatus(request.status),
          expiresAt: new Date(request.expiresAt),
          decidedAt: audit?.decidedAt ? new Date(audit.decidedAt) : undefined,
          decidedByUserId: audit?.decidedByUserId,
          decision: audit?.decision,
          decisionReason: audit?.decisionReason,
          consumedAt: audit?.consumedAt ? new Date(audit.consumedAt) : undefined,
        },
      });
      return result.count === 1;
    },
    async listByActorAndOrganization(actorId, organizationId) {
      const client = await getClient();
      const rows = await client.actionApproval.findMany({
        where: { actorUserId: actorId, organizationId },
        orderBy: { requestedAt: "desc" },
      });
      return rows.map(mapRow);
    },
  };
}

function mapRow(row: ActionApproval): ApprovalRequest {
  return Object.freeze({
    approvalId: row.id,
    actionName: row.actionName,
    targetEntityRef: row.targetEntityType && row.targetEntityId
      ? { entityType: row.targetEntityType, entityId: row.targetEntityId }
      : undefined,
    normalizedInputHash: row.normalizedInputHash,
    actorId: row.actorUserId,
    organizationId: row.organizationId,
    approvalTtlClass: "STANDARD",
    riskLevel: row.riskLevel as ApprovalRequest["riskLevel"],
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: fromPersistenceStatus(row.status),
  });
}

function toPersistenceStatus(status: ApprovalStatus): ActionApproval["status"] {
  if (status === "GRANTED") return "APPROVED";
  if (status === "REVOKED") return "REJECTED";
  return status;
}

function fromPersistenceStatus(status: ActionApproval["status"]): ApprovalStatus {
  if (status === "APPROVED") return "GRANTED";
  if (status === "REJECTED" || status === "CANCELLED") return "REVOKED";
  return status;
}

function assertIdempotentApprovalContext(existing: ApprovalRequest, requested: ApprovalRequest): void {
  const sameTarget =
    existing.targetEntityRef?.entityType === requested.targetEntityRef?.entityType
    && existing.targetEntityRef?.entityId === requested.targetEntityRef?.entityId;
  if (
    existing.actionName !== requested.actionName
    || existing.normalizedInputHash !== requested.normalizedInputHash
    || !sameTarget
  ) {
    throw new Error("APPROVAL_IDEMPOTENCY_CONTEXT_MISMATCH");
  }
}
