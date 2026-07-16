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
  it("appends a record and returns it with a generated id and timestamp", () => {
    const store = createInMemoryAuditStore();

    const record = store.append(buildInput());

    expect(record.auditId).toBeTruthy();
    expect(record.timestamp).toBeTruthy();
    expect(record.outcome).toBe("ALLOW");
  });

  it("rejects overwriting an existing auditId", () => {
    const store = createInMemoryAuditStore();
    store.append(buildInput({ auditId: "audit_1" }));

    expect(() => store.append(buildInput({ auditId: "audit_1" }))).toThrow(AuditMutationNotAllowedError);
  });

  it("never stores a raw input field — only inputHash and minimized metadata", () => {
    const store = createInMemoryAuditStore();

    const record = store.append(
      buildInput({ inputHash: "hash_1", metadata: { riskLevelComputed: "LOW" } }),
    );

    expect(record.inputHash).toBe("hash_1");
    expect(record.metadata).toEqual({ riskLevelComputed: "LOW" });
    expect(Object.keys(record)).not.toContain("input");
    expect(Object.keys(record)).not.toContain("rawInput");
  });
});

describe("createInMemoryAuditStore — organization isolation", () => {
  it("scopes listByOrganization to a single organization", () => {
    const store = createInMemoryAuditStore();
    store.append(buildInput({ organizationId: "org_1" }));
    store.append(buildInput({ organizationId: "org_2" }));

    expect(store.listByOrganization("org_1")).toHaveLength(1);
  });
});

describe("createInMemoryAuditStore — targeted queries", () => {
  it("lists records by entity within an organization", () => {
    const store = createInMemoryAuditStore();
    const entityRef = { entityType: "customer", entityId: "cust_1" };
    store.append(buildInput({ organizationId: "org_1", entityRef }));
    store.append(buildInput({ organizationId: "org_1", entityRef: { entityType: "customer", entityId: "cust_2" } }));
    store.append(buildInput({ organizationId: "org_2", entityRef }));

    expect(store.listByEntity("org_1", entityRef)).toHaveLength(1);
  });

  it("lists records by executionId", () => {
    const store = createInMemoryAuditStore();
    store.append(buildInput({ executionId: "exec_1" }));
    store.append(buildInput({ executionId: "exec_2" }));

    expect(store.listByExecution("exec_1")).toHaveLength(1);
  });

  it("lists records by operationId", () => {
    const store = createInMemoryAuditStore();
    store.append(buildInput({ operationId: "op_1" }));
    store.append(buildInput({ operationId: "op_2" }));

    expect(store.listByOperation("op_1")).toHaveLength(1);
  });
});

describe("createInMemoryAuditStore — correction", () => {
  it("produces a new record for a correction without mutating the original", () => {
    const store = createInMemoryAuditStore();
    const original = store.append(buildInput({ auditId: "audit_original", outcome: "ALLOW" }));

    const correction = store.append(
      buildInput({
        auditId: "audit_correction",
        recordType: "CORRECTION",
        outcome: "CORRECTED",
        correctsAuditId: original.auditId,
      }),
    );

    expect(store.get("audit_original")?.outcome).toBe("ALLOW");
    expect(correction.correctsAuditId).toBe("audit_original");
  });

  it("preserves the original record and links correctedByAuditId only via linkCorrection", () => {
    const store = createInMemoryAuditStore();
    const original = store.append(buildInput({ auditId: "audit_original" }));
    const correction = store.append(
      buildInput({ auditId: "audit_correction", recordType: "CORRECTION", correctsAuditId: original.auditId }),
    );

    expect(store.get("audit_original")?.correctedByAuditId).toBeUndefined();

    store.linkCorrection(original.auditId, correction.auditId);

    expect(store.get("audit_original")?.correctedByAuditId).toBe("audit_correction");
    expect(store.get("audit_correction")?.correctsAuditId).toBe("audit_original");
  });

  it("throws AuditRecordNotFoundError when linking an unknown original or correction", () => {
    const store = createInMemoryAuditStore();
    const correction = store.append(buildInput({ auditId: "audit_correction" }));

    expect(() => store.linkCorrection("missing_original", correction.auditId)).toThrow(AuditRecordNotFoundError);
    expect(() => store.linkCorrection(correction.auditId, "missing_correction")).toThrow(AuditRecordNotFoundError);
  });
});

describe("createInMemoryAuditStore — immutability", () => {
  it("freezes appended records", () => {
    const store = createInMemoryAuditStore();
    const record = store.append(buildInput());

    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.metadata)).toBe(true);
  });

  it("does not leak state between separate store instances", () => {
    const storeA = createInMemoryAuditStore();
    const storeB = createInMemoryAuditStore();
    const record = storeA.append(buildInput());

    expect(storeB.get(record.auditId)).toBeUndefined();
  });
});
