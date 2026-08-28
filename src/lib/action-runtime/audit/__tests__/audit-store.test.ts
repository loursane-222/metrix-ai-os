import { describe, expect, it } from "vitest";

import { createInMemoryAuditStore } from "../audit-store";
import { AuditMutationNotAllowedError, AuditRecordNotFoundError } from "../audit.errors";
import type { AppendAuditRecordInput } from "../audit.types";

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

describe("createInMemoryAuditStore — append", () => {
  it("appends a record and returns it with a generated id and timestamp", async () => {
    const store = createInMemoryAuditStore();

    const record = await store.append(buildInput());

    expect(record.auditId).toBeTruthy();
    expect(record.timestamp).toBeTruthy();
    expect(record.outcome).toBe("ALLOW");
  });

  it("rejects overwriting an existing auditId", async () => {
    const store = createInMemoryAuditStore();
    await store.append(buildInput({ auditId: "audit_1" }));

    await expect(store.append(buildInput({ auditId: "audit_1" }))).rejects.toThrow(AuditMutationNotAllowedError);
  });

  it("never stores a raw input field — only inputHash and minimized metadata", async () => {
    const store = createInMemoryAuditStore();

    const record = await store.append(
      buildInput({ inputHash: "hash_1", metadata: { riskLevelComputed: "LOW" } }),
    );

    expect(record.inputHash).toBe("hash_1");
    expect(record.metadata).toEqual({ riskLevelComputed: "LOW" });
    expect(Object.keys(record)).not.toContain("input");
    expect(Object.keys(record)).not.toContain("rawInput");
  });
});

describe("createInMemoryAuditStore — organization isolation", () => {
  it("scopes listByOrganization to a single organization", async () => {
    const store = createInMemoryAuditStore();
    await store.append(buildInput({ organizationId: "org_1" }));
    await store.append(buildInput({ organizationId: "org_2" }));

    expect(await store.listByOrganization("org_1")).toHaveLength(1);
  });
});

describe("createInMemoryAuditStore — targeted queries", () => {
  it("lists records by entity within an organization", async () => {
    const store = createInMemoryAuditStore();
    const entityRef = { entityType: "customer", entityId: "cust_1" };
    await store.append(buildInput({ organizationId: "org_1", entityRef }));
    await store.append(buildInput({ organizationId: "org_1", entityRef: { entityType: "customer", entityId: "cust_2" } }));
    await store.append(buildInput({ organizationId: "org_2", entityRef }));

    expect(await store.listByEntity("org_1", entityRef)).toHaveLength(1);
  });

  it("lists records by executionId", async () => {
    const store = createInMemoryAuditStore();
    await store.append(buildInput({ executionId: "exec_1" }));
    await store.append(buildInput({ executionId: "exec_2" }));

    expect(await store.listByExecution("exec_1")).toHaveLength(1);
  });

  it("lists records by operationId", async () => {
    const store = createInMemoryAuditStore();
    await store.append(buildInput({ operationId: "op_1" }));
    await store.append(buildInput({ operationId: "op_2" }));

    expect(await store.listByOperation("op_1")).toHaveLength(1);
  });
});

describe("createInMemoryAuditStore — correction", () => {
  it("produces a new record for a correction without mutating the original", async () => {
    const store = createInMemoryAuditStore();
    const original = await store.append(buildInput({ auditId: "audit_original", outcome: "ALLOW" }));

    const correction = await store.append(
      buildInput({
        auditId: "audit_correction",
        recordType: "CORRECTION",
        outcome: "CORRECTED",
        correctsAuditId: original.auditId,
      }),
    );

    expect((await store.get("audit_original"))?.outcome).toBe("ALLOW");
    expect(correction.correctsAuditId).toBe("audit_original");
  });

  it("preserves the original record and links correctedByAuditId only via linkCorrection", async () => {
    const store = createInMemoryAuditStore();
    const original = await store.append(buildInput({ auditId: "audit_original" }));
    const correction = await store.append(
      buildInput({ auditId: "audit_correction", recordType: "CORRECTION", correctsAuditId: original.auditId }),
    );

    expect((await store.get("audit_original"))?.correctedByAuditId).toBeUndefined();

    await store.linkCorrection(original.auditId, correction.auditId);

    expect((await store.get("audit_original"))?.correctedByAuditId).toBe("audit_correction");
    expect((await store.get("audit_correction"))?.correctsAuditId).toBe("audit_original");
  });

  it("throws AuditRecordNotFoundError when linking an unknown original or correction", async () => {
    const store = createInMemoryAuditStore();
    const correction = await store.append(buildInput({ auditId: "audit_correction" }));

    await expect(store.linkCorrection("missing_original", correction.auditId)).rejects.toThrow(AuditRecordNotFoundError);
    await expect(store.linkCorrection(correction.auditId, "missing_correction")).rejects.toThrow(AuditRecordNotFoundError);
  });
});

describe("createInMemoryAuditStore — immutability", () => {
  it("freezes appended records", async () => {
    const store = createInMemoryAuditStore();
    const record = await store.append(buildInput());

    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.metadata)).toBe(true);
  });

  it("does not leak state between separate store instances", async () => {
    const storeA = createInMemoryAuditStore();
    const storeB = createInMemoryAuditStore();
    const record = await storeA.append(buildInput());

    expect(await storeB.get(record.auditId)).toBeUndefined();
  });
});
