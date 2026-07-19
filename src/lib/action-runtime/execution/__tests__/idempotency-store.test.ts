import { describe, expect, it } from "vitest";

import { createInMemoryIdempotencyStore } from "../idempotency-store";
import type { ExecutionResult } from "../execution.types";

function buildResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    actionName: "customer.update",
    executionId: "exec_1",
    status: "SUCCESS",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    metadata: { stagesCompleted: [] },
    ...overrides,
  };
}

describe("createInMemoryIdempotencyStore — reserve", () => {
  it("reserves a brand new key", () => {
    const store = createInMemoryIdempotencyStore();

    expect(store.reserve("key_1", "customer.update", "hash_1")).toEqual({ kind: "RESERVED" });
  });

  it("returns a conflict for a still in-progress key with the same request shape", () => {
    const store = createInMemoryIdempotencyStore();
    store.reserve("key_1", "customer.update", "hash_1");

    expect(store.reserve("key_1", "customer.update", "hash_1")).toEqual({
      kind: "CONFLICT",
      reasonCode: "IN_PROGRESS",
    });
  });

  it("returns a conflict for a key reused with a different action or input hash", () => {
    const store = createInMemoryIdempotencyStore();
    store.reserve("key_1", "customer.update", "hash_1");

    expect(store.reserve("key_1", "customer.update", "hash_DIFFERENT")).toEqual({
      kind: "CONFLICT",
      reasonCode: "INPUT_MISMATCH",
    });
    expect(store.reserve("key_1", "customer.archive", "hash_1")).toEqual({
      kind: "CONFLICT",
      reasonCode: "INPUT_MISMATCH",
    });
  });

  it("returns ALREADY_COMPLETED with the cached result for a matching completed key", () => {
    const store = createInMemoryIdempotencyStore();
    store.reserve("key_1", "customer.update", "hash_1");
    const result = buildResult();
    store.complete("key_1", result);

    expect(store.reserve("key_1", "customer.update", "hash_1")).toEqual({
      kind: "ALREADY_COMPLETED",
      result,
    });
  });

  it("returns a conflict for a completed key reused with a different request shape", () => {
    const store = createInMemoryIdempotencyStore();
    store.reserve("key_1", "customer.update", "hash_1");
    store.complete("key_1", buildResult());

    expect(store.reserve("key_1", "customer.update", "hash_DIFFERENT")).toEqual({
      kind: "CONFLICT",
      reasonCode: "INPUT_MISMATCH",
    });
  });
});

describe("createInMemoryIdempotencyStore — lookup", () => {
  it("returns undefined for an unknown key", () => {
    expect(createInMemoryIdempotencyStore().lookup("missing")).toBeUndefined();
  });

  it("returns the current record for a known key", () => {
    const store = createInMemoryIdempotencyStore();
    store.reserve("key_1", "customer.update", "hash_1");

    expect(store.lookup("key_1")?.status).toBe("IN_PROGRESS");

    store.complete("key_1", buildResult());
    expect(store.lookup("key_1")?.status).toBe("COMPLETED");
  });
});

describe("createInMemoryIdempotencyStore — injected clock", () => {
  it("stamps reservedAt and completedAt using the injected clock", () => {
    let currentMs = 10_000;
    const store = createInMemoryIdempotencyStore({ clock: () => new Date(currentMs) });

    store.reserve("key_1", "customer.update", "hash_1");
    expect(store.lookup("key_1")?.reservedAt).toBe(new Date(10_000).toISOString());

    currentMs = 20_000;
    store.complete("key_1", buildResult());
    expect(store.lookup("key_1")?.completedAt).toBe(new Date(20_000).toISOString());
  });
});

describe("createInMemoryIdempotencyStore — isolation", () => {
  it("does not leak state between separate store instances", () => {
    const storeA = createInMemoryIdempotencyStore();
    const storeB = createInMemoryIdempotencyStore();

    storeA.reserve("key_1", "customer.update", "hash_1");

    expect(storeB.lookup("key_1")).toBeUndefined();
  });

  it("isolates the same key across trusted execution scopes", () => {
    const store = createInMemoryIdempotencyStore();

    expect(store.reserve("key_1", "customer.update", "hash_1", "org_1:actor_1")).toEqual({ kind: "RESERVED" });
    expect(store.reserve("key_1", "customer.update", "hash_1", "org_2:actor_1")).toEqual({ kind: "RESERVED" });
  });
});
