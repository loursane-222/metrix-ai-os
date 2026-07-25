import type { ActionApproval } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createApprovalService } from "../approval-service";
import { createPrismaApprovalStore } from "../approval-store";

type StoreClient = Parameters<typeof createPrismaApprovalStore>[0];

function createPersistentFakeClient() {
  const rows = new Map<string, ActionApproval>();
  const actionApproval = {
    async upsert(args: {
      where: { organizationId_actorUserId_idempotencyKey: { organizationId: string; actorUserId: string; idempotencyKey: string } };
      create: Omit<ActionApproval, "createdAt" | "updatedAt" | "decidedAt" | "decidedByUserId" | "decision" | "decisionReason" | "consumedAt">;
    }) {
      const key = args.where.organizationId_actorUserId_idempotencyKey;
      const existing = [...rows.values()].find((row) =>
        row.organizationId === key.organizationId
        && row.actorUserId === key.actorUserId
        && row.idempotencyKey === key.idempotencyKey);
      if (existing) return existing;
      const now = new Date();
      const row: ActionApproval = {
        ...args.create,
        decidedAt: null,
        decidedByUserId: null,
        decision: null,
        decisionReason: null,
        consumedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    async findUnique(args: { where: { id: string } }) {
      return rows.get(args.where.id) ?? null;
    },
    async updateMany(args: {
      where: { id: string; status?: ActionApproval["status"] };
      data: Partial<ActionApproval>;
    }) {
      const row = rows.get(args.where.id);
      if (!row || (args.where.status && row.status !== args.where.status)) return { count: 0 };
      rows.set(row.id, { ...row, ...args.data, updatedAt: new Date() });
      return { count: 1 };
    },
    async findMany(args: { where: { actorUserId: string; organizationId: string } }) {
      return [...rows.values()].filter((row) =>
        row.actorUserId === args.where.actorUserId
        && row.organizationId === args.where.organizationId);
    },
  };
  return { actionApproval } as unknown as StoreClient;
}

describe("Prisma approval persistence", () => {
  it("survives service/repository reconstruction and remains single-use", async () => {
    const client = createPersistentFakeClient();
    const serviceA = createApprovalService({
      store: createPrismaApprovalStore(client),
      generateId: (() => {
        let sequence = 0;
        return () => `id-${++sequence}`;
      })(),
    });
    const request = await serviceA.createApprovalRequest({
      actionName: "quote.set_outcome",
      targetEntityRef: { entityType: "quote", entityId: "quote-1" },
      normalizedInputHash: "hash-1",
      actorId: "user-1",
      organizationId: "org-1",
      approvalTtlClass: "STANDARD",
      riskLevel: "HIGH",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
    });
    const replay = await serviceA.createApprovalRequest({
      actionName: "quote.set_outcome",
      targetEntityRef: { entityType: "quote", entityId: "quote-1" },
      normalizedInputHash: "hash-1",
      actorId: "user-1",
      organizationId: "org-1",
      approvalTtlClass: "STANDARD",
      riskLevel: "HIGH",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
    });
    expect(replay.approvalId).toBe(request.approvalId);

    const serviceB = createApprovalService({ store: createPrismaApprovalStore(client) });
    expect(await serviceB.getApprovalRequest(request.approvalId)).toMatchObject({
      organizationId: "org-1",
      actorId: "user-1",
      normalizedInputHash: "hash-1",
    });

    const grant = await serviceB.grantApproval(request.approvalId, "user-1");
    expect((await serviceB.validateApprovalGrant(grant, {
      actionName: "quote.set_outcome",
      targetEntityRef: { entityType: "quote", entityId: "quote-1" },
      normalizedInputHash: "hash-1",
      actorId: "user-1",
      organizationId: "org-1",
    })).valid).toBe(true);
    await serviceB.consumeApproval(request.approvalId);
    await expect(serviceB.consumeApproval(request.approvalId)).rejects.toThrow();
  });
});
