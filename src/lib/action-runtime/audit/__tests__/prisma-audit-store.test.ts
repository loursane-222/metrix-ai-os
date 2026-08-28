import type { AuditRecord as AuditRecordRow } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { createPrismaAuditStore } from "../audit-store";
import type { AppendAuditRecordInput } from "../audit.types";

type StoreClient = Parameters<typeof createPrismaAuditStore>[0];

// Same shape of fake used by prisma-approval-store.test.ts — a real
// in-memory Map standing in for Postgres, so this test exercises the
// mapping/persistence logic without a live DB.
function createPersistentFakeClient() {
  const rows = new Map<string, AuditRecordRow>();
  let sequence = 0;
  const auditRecord = {
    async create(args: { data: Omit<AuditRecordRow, "id" | "createdAt"> & { id?: string } }) {
      const row: AuditRecordRow = {
        ...args.data,
        id: args.data.id ?? `audit-${++sequence}`,
        createdAt: new Date(),
      } as AuditRecordRow;
      rows.set(row.id, row);
      return row;
    },
    async findUnique(args: { where: { id: string } }) {
      return rows.get(args.where.id) ?? null;
    },
    async findMany(args: { where: Record<string, unknown> }) {
      return [...rows.values()]
        .filter((row) => Object.entries(args.where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async update(args: { where: { id: string }; data: Partial<AuditRecordRow> }) {
      const row = rows.get(args.where.id);
      if (!row) throw new Error("not found");
      const updated = { ...row, ...args.data };
      rows.set(row.id, updated);
      return updated;
    },
  };
  return { actionRecordRows: rows, client: { auditRecord } as unknown as StoreClient };
}

function buildInput(overrides: Partial<AppendAuditRecordInput> = {}): AppendAuditRecordInput {
  return {
    recordType: "POLICY_DECISION",
    actionName: "customer.update",
    actorId: "actor_1",
    organizationId: "org_1",
    entityRef: { entityType: "customer", entityId: "cust_1" },
    outcome: "ALLOW",
    ...overrides,
  };
}

describe("Prisma audit store persistence", () => {
  it("survives store reconstruction — a fresh instance reads what an earlier one wrote", async () => {
    const { client } = createPersistentFakeClient();
    const storeA = createPrismaAuditStore(client);

    const appended = await storeA.append(buildInput({ inputHash: "hash-1", metadata: { riskLevelComputed: "LOW" } }));
    expect(appended.auditId).toBeTruthy();
    expect(appended.outcome).toBe("ALLOW");

    // A fresh store instance — the whole point of moving off the in-memory
    // Map is that the record must be readable after the process/instance
    // that wrote it is gone.
    const storeB = createPrismaAuditStore(client);
    const reread = await storeB.get(appended.auditId);
    expect(reread).toMatchObject({ actionName: "customer.update", inputHash: "hash-1", metadata: { riskLevelComputed: "LOW" } });
  });

  it("scopes listByOrganization and listByEntity correctly", async () => {
    const { client } = createPersistentFakeClient();
    const store = createPrismaAuditStore(client);
    const entityRef = { entityType: "customer", entityId: "cust_1" };
    await store.append(buildInput({ organizationId: "org_1", entityRef }));
    await store.append(buildInput({ organizationId: "org_1", entityRef: { entityType: "customer", entityId: "cust_2" } }));
    await store.append(buildInput({ organizationId: "org_2", entityRef }));

    expect(await store.listByOrganization("org_1")).toHaveLength(2);
    expect(await store.listByEntity("org_1", entityRef)).toHaveLength(1);
  });

  it("scopes listByExecution and listByOperation correctly", async () => {
    const { client } = createPersistentFakeClient();
    const store = createPrismaAuditStore(client);
    await store.append(buildInput({ executionId: "exec_1", operationId: "op_1" }));
    await store.append(buildInput({ executionId: "exec_2", operationId: "op_2" }));

    expect(await store.listByExecution("exec_1")).toHaveLength(1);
    expect(await store.listByOperation("op_2")).toHaveLength(1);
  });

  it("links a correction without altering the original record's substantive fields", async () => {
    const { client } = createPersistentFakeClient();
    const store = createPrismaAuditStore(client);
    const original = await store.append(buildInput({ outcome: "ALLOW" }));
    const correction = await store.append(buildInput({ recordType: "CORRECTION", outcome: "CORRECTED", correctsAuditId: original.auditId }));

    await store.linkCorrection(original.auditId, correction.auditId);

    const reread = await store.get(original.auditId);
    expect(reread?.outcome).toBe("ALLOW");
    expect(reread?.correctedByAuditId).toBe(correction.auditId);
  });

  it("rejects linking an unknown original or correction id", async () => {
    const { client } = createPersistentFakeClient();
    const store = createPrismaAuditStore(client);
    const correction = await store.append(buildInput());

    await expect(store.linkCorrection("missing", correction.auditId)).rejects.toThrow();
    await expect(store.linkCorrection(correction.auditId, "missing")).rejects.toThrow();
  });
});
