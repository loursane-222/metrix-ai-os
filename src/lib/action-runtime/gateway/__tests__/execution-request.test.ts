import { describe, expect, it } from "vitest";

import type { ExecutionContext } from "../../execution";
import {
  buildActionExecutionRequest,
  computeNormalizedInputHash,
  stableSerialize,
} from "../execution-request";

function buildExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    actorId: "actor_1",
    organizationId: "org_1",
    role: "EMPLOYEE",
    permissions: ["customers.write"],
    sessionRef: "session_1",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

describe("stableSerialize", () => {
  it("produces the same string regardless of object key order", () => {
    const a = stableSerialize({ a: 1, b: 2, c: { x: 1, y: 2 } });
    const b = stableSerialize({ c: { y: 2, x: 1 }, b: 2, a: 1 });

    expect(a).toBe(b);
  });

  it("is deterministic for nested arrays of objects regardless of key order within each element", () => {
    const a = stableSerialize({ list: [{ p: 1, q: 2 }, { m: 3, n: 4 }] });
    const b = stableSerialize({ list: [{ q: 2, p: 1 }, { n: 4, m: 3 }] });

    expect(a).toBe(b);
  });

  it("omits keys whose value is undefined, so present-but-undefined and absent are identical", () => {
    const a = stableSerialize({ a: 1, b: undefined });
    const b = stableSerialize({ a: 1 });

    expect(a).toBe(b);
  });

  it("still distinguishes different values", () => {
    expect(stableSerialize({ a: 1 })).not.toBe(stableSerialize({ a: 2 }));
  });
});

describe("computeNormalizedInputHash", () => {
  it("is unaffected by input object key order", () => {
    const hashA = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "New Name", phone: "111" } },
    });
    const hashB = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { patch: { phone: "111", displayName: "New Name" }, expectedVersion: "v1", customerId: "cust_1" },
    });

    expect(hashA).toBe(hashB);
  });

  it("produces a different hash for different input", () => {
    const base = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "New Name" } },
    });
    const changed = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "Different Name" } },
    });

    expect(base).not.toBe(changed);
  });

  it("changes when actionName changes, input held constant", () => {
    const input = { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "New Name" } };
    const a = computeNormalizedInputHash({ actionName: "customer.update", input });
    const b = computeNormalizedInputHash({ actionName: "customer.archive", input });

    expect(a).not.toBe(b);
  });

  it("changes when entityRef changes, input and actionName held constant", () => {
    const input = { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "New Name" } };
    const a = computeNormalizedInputHash({
      actionName: "customer.update",
      input,
      entityRef: { entityType: "customer", entityId: "cust_1" },
    });
    const b = computeNormalizedInputHash({
      actionName: "customer.update",
      input,
      entityRef: { entityType: "customer", entityId: "cust_2" },
    });

    expect(a).not.toBe(b);
  });

  it("is deterministic across repeated calls with identical input", () => {
    const input = { customerId: "cust_1", expectedVersion: "v1", patch: { billingAddress: { city: "Istanbul" } } };
    const a = computeNormalizedInputHash({ actionName: "customer.update", input });
    const b = computeNormalizedInputHash({ actionName: "customer.update", input });

    expect(a).toBe(b);
  });

  it("handles undefined patch values deterministically (same as omitting the key)", () => {
    const withUndefined = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch: { legalName: undefined, displayName: "X" } },
    });
    const withoutKey = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "X" } },
    });

    expect(withUndefined).toBe(withoutKey);
  });
});

describe("buildActionExecutionRequest", () => {
  it("computes normalizedInputHash consistently with computeNormalizedInputHash over the same fields", () => {
    const executionContext = buildExecutionContext();
    const entityRef = { entityType: "customer", entityId: "cust_1" };
    const input = { customerId: "cust_1", expectedVersion: "v1", patch: { displayName: "New Name" } };

    const request = buildActionExecutionRequest({
      actionName: "customer.update",
      input,
      executionContext,
      entityRef,
      idempotencyKey: "idem_1",
      correlationId: "corr_1",
    });

    expect(request.normalizedInputHash).toBe(
      computeNormalizedInputHash({ actionName: "customer.update", input, entityRef }),
    );
    expect(request.actionName).toBe("customer.update");
    expect(request.entityRef).toEqual(entityRef);
    expect(request.idempotencyKey).toBe("idem_1");
    expect(request.correlationId).toBe("corr_1");
    expect(request.executionContext).toBe(executionContext);
  });
});
