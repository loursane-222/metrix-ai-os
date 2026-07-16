import { describe, expect, it } from "vitest";

import { createInMemoryOperationStore } from "../operation-store";
import { InvalidOperationTransitionError, OperationNotFoundError } from "../operation.errors";
import type { CreateOperationInput } from "../operation.types";

function buildInput(overrides: Partial<CreateOperationInput> = {}): CreateOperationInput {
  return {
    executionId: "exec_1",
    actionName: "customer.update",
    actorId: "actor_1",
    organizationId: "org_1",
    correlationId: "corr_1",
    entityRef: { entityType: "customer", entityId: "cust_1" },
    ...overrides,
  };
}

describe("createInMemoryOperationStore — create", () => {
  it("creates an operation at PENDING / IN_PROGRESS", () => {
    const store = createInMemoryOperationStore();

    const operation = store.create(buildInput());

    expect(operation.coreStatus).toBe("PENDING");
    expect(operation.finalState).toBe("IN_PROGRESS");
    expect(operation.sideEffectStatuses).toEqual({});
    expect(operation.eventConsumptionStatuses).toEqual({});
    expect(operation.completedAt).toBeUndefined();
  });

  it("throws OperationNotFoundError for an unknown id", () => {
    expect(() => createInMemoryOperationStore().get("missing")).not.toThrow();
    expect(createInMemoryOperationStore().get("missing")).toBeUndefined();
    expect(() => createInMemoryOperationStore().updateCoreStatus("missing", "EXECUTING")).toThrow(
      OperationNotFoundError,
    );
  });
});

describe("createInMemoryOperationStore — core status transitions", () => {
  it("allows PENDING -> EXECUTING -> SUCCEEDED", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());

    const executing = store.updateCoreStatus(created.operationId, "EXECUTING");
    expect(executing.coreStatus).toBe("EXECUTING");
    expect(executing.finalState).toBe("IN_PROGRESS");

    const succeeded = store.updateCoreStatus(created.operationId, "SUCCEEDED");
    expect(succeeded.coreStatus).toBe("SUCCEEDED");
    expect(succeeded.finalState).toBe("COMPLETED");
  });

  it("rejects an invalid transition (PENDING -> SUCCEEDED)", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());

    expect(() => store.updateCoreStatus(created.operationId, "SUCCEEDED")).toThrow(InvalidOperationTransitionError);
  });

  it("rejects transitioning out of a terminal state", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    store.updateCoreStatus(created.operationId, "FAILED");

    expect(() => store.updateCoreStatus(created.operationId, "EXECUTING")).toThrow(InvalidOperationTransitionError);
  });
});

describe("createInMemoryOperationStore — side-effect / event-consumption status", () => {
  it("updates a side-effect status and recomputes finalState", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    store.updateCoreStatus(created.operationId, "SUCCEEDED");

    const withPending = store.updateSideEffectStatus(created.operationId, "outbox_1", "PENDING");
    expect(withPending.finalState).toBe("COMPLETED_WITH_PENDING_SIDE_EFFECT");

    const withSucceeded = store.updateSideEffectStatus(created.operationId, "outbox_1", "SUCCEEDED");
    expect(withSucceeded.finalState).toBe("COMPLETED");
  });

  it("updates an event-consumption status and recomputes finalState", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    store.updateCoreStatus(created.operationId, "SUCCEEDED");

    const withPending = store.updateEventConsumptionStatus(created.operationId, "consumer_1", "PROCESSING");
    expect(withPending.finalState).toBe("COMPLETED_WITH_PENDING_SIDE_EFFECT");
  });
});

describe("createInMemoryOperationStore — finalState derivation", () => {
  it("derives FAILED_WITH_PARTIAL_SIDE_EFFECT when core failed but a side effect had already succeeded", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    store.updateSideEffectStatus(created.operationId, "outbox_1", "SUCCEEDED");
    const failed = store.updateCoreStatus(created.operationId, "FAILED");

    expect(failed.finalState).toBe("FAILED_WITH_PARTIAL_SIDE_EFFECT");
  });

  it("derives plain FAILED when core failed with no successful side effects", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    const failed = store.updateCoreStatus(created.operationId, "FAILED");

    expect(failed.finalState).toBe("FAILED");
  });
});

describe("createInMemoryOperationStore — complete", () => {
  it("stamps completedAt and applies failure details", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());
    store.updateCoreStatus(created.operationId, "EXECUTING");
    store.updateCoreStatus(created.operationId, "FAILED");

    const completed = store.complete(created.operationId, {
      failureCode: "HANDLER_THREW",
      failureSummary: "boom",
    });

    expect(completed.completedAt).toBeDefined();
    expect(completed.failureCode).toBe("HANDLER_THREW");
    expect(completed.failureSummary).toBe("boom");
  });

  it("rejects completing an operation still PENDING or EXECUTING", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());

    expect(() => store.complete(created.operationId)).toThrow(InvalidOperationTransitionError);
  });
});

describe("createInMemoryOperationStore — listing", () => {
  it("lists operations scoped to a single organization", () => {
    const store = createInMemoryOperationStore();
    store.create(buildInput({ organizationId: "org_1", correlationId: "corr_a" }));
    store.create(buildInput({ organizationId: "org_2", correlationId: "corr_b" }));

    expect(store.listByOrganization("org_1")).toHaveLength(1);
  });

  it("lists operations scoped to a single correlationId", () => {
    const store = createInMemoryOperationStore();
    store.create(buildInput({ correlationId: "corr_shared" }));
    store.create(buildInput({ correlationId: "corr_shared" }));
    store.create(buildInput({ correlationId: "corr_other" }));

    expect(store.listByCorrelationId("corr_shared")).toHaveLength(2);
  });
});

describe("createInMemoryOperationStore — immutability", () => {
  it("does not mutate a previously returned snapshot", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());

    store.updateCoreStatus(created.operationId, "EXECUTING");

    expect(created.coreStatus).toBe("PENDING");
  });

  it("freezes the returned snapshot", () => {
    const store = createInMemoryOperationStore();
    const created = store.create(buildInput());

    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.sideEffectStatuses)).toBe(true);
  });

  it("does not leak state between separate store instances", () => {
    const storeA = createInMemoryOperationStore();
    const storeB = createInMemoryOperationStore();
    const created = storeA.create(buildInput());

    expect(storeB.get(created.operationId)).toBeUndefined();
  });
});
