import { describe, expect, it } from "vitest";

import { createInMemoryOutboxStore } from "../outbox-store";
import { DuplicateOutboxEventError, InvalidOutboxTransitionError, OutboxEventNotFoundError } from "../outbox.errors";
import type { EnqueueOutboxEventInput } from "../outbox.types";

function buildInput(overrides: Partial<EnqueueOutboxEventInput> = {}): EnqueueOutboxEventInput {
  return {
    operationId: "op_1",
    executionId: "exec_1",
    organizationId: "org_1",
    eventType: "CustomerUpdated",
    effectType: "DOMAIN_EVENT",
    payload: { customerId: "cust_1" },
    schemaVersion: "1",
    correlationId: "corr_1",
    ...overrides,
  };
}

describe("createInMemoryOutboxStore — enqueue", () => {
  it("enqueues a new event at PENDING", () => {
    const store = createInMemoryOutboxStore();

    const event = store.enqueue(buildInput());

    expect(event.deliveryStatus).toBe("PENDING");
    expect(event.retryCount).toBe(0);
  });

  it("rejects a duplicate eventId", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1" }));

    expect(() => store.enqueue(buildInput({ eventId: "evt_1" }))).toThrow(DuplicateOutboxEventError);
  });

  it("rejects a duplicate deduplicationKey even with a different eventId", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1", deduplicationKey: "dedup_1" }));

    expect(() => store.enqueue(buildInput({ eventId: "evt_2", deduplicationKey: "dedup_1" }))).toThrow(
      DuplicateOutboxEventError,
    );
  });
});

describe("createInMemoryOutboxStore — claim pending", () => {
  it("claims eligible PENDING events and transitions them to PROCESSING", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1" }));
    store.enqueue(buildInput({ eventId: "evt_2" }));

    const claimed = store.claimPending(10);

    expect(claimed.map((event) => event.eventId).sort()).toEqual(["evt_1", "evt_2"]);
    expect(claimed.every((event) => event.deliveryStatus === "PROCESSING")).toBe(true);
  });

  it("respects the claim limit", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1" }));
    store.enqueue(buildInput({ eventId: "evt_2" }));

    expect(store.claimPending(1)).toHaveLength(1);
  });
});

describe("createInMemoryOutboxStore — processing -> success", () => {
  it("marks a processing event as succeeded", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1" }));
    store.markProcessing(event.eventId);

    const succeeded = store.markSucceeded(event.eventId);

    expect(succeeded.deliveryStatus).toBe("SUCCEEDED");
    expect(succeeded.processedAt).toBeDefined();
  });
});

describe("createInMemoryOutboxStore — processing -> retry -> dead-letter", () => {
  it("marks a processing event for retry", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1", maxRetries: 2 }));
    store.markProcessing(event.eventId);

    const retried = store.markRetry(event.eventId, { nextAttemptAt: "2026-01-01T00:05:00.000Z", errorCode: "TIMEOUT" });

    expect(retried.deliveryStatus).toBe("RETRYING");
    expect(retried.retryCount).toBe(1);
    expect(retried.lastErrorCode).toBe("TIMEOUT");
  });

  it("dead-letters an event once retries are exhausted", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1", maxRetries: 1 }));

    store.markProcessing(event.eventId);
    store.markRetry(event.eventId, { nextAttemptAt: "2026-01-01T00:05:00.000Z" }); // retryCount 1, still RETRYING
    store.markProcessing(event.eventId);
    const deadLettered = store.markRetry(event.eventId, { nextAttemptAt: "2026-01-01T00:10:00.000Z", errorCode: "TIMEOUT" });

    expect(deadLettered.deliveryStatus).toBe("DEAD_LETTERED");
    expect(deadLettered.retryCount).toBe(2);
  });

  it("supports marking an event dead-lettered directly", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1" }));
    store.markProcessing(event.eventId);

    const deadLettered = store.markDeadLettered(event.eventId, "PERMANENT_FAILURE");

    expect(deadLettered.deliveryStatus).toBe("DEAD_LETTERED");
    expect(deadLettered.lastErrorCode).toBe("PERMANENT_FAILURE");
  });
});

describe("createInMemoryOutboxStore — invalid transitions", () => {
  it("rejects marking a still-PENDING event as succeeded", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1" }));

    expect(() => store.markSucceeded(event.eventId)).toThrow(InvalidOutboxTransitionError);
  });

  it("rejects transitioning out of a terminal SUCCEEDED state", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1" }));
    store.markProcessing(event.eventId);
    store.markSucceeded(event.eventId);

    expect(() => store.markProcessing(event.eventId)).toThrow(InvalidOutboxTransitionError);
  });

  it("throws OutboxEventNotFoundError for an unknown eventId", () => {
    const store = createInMemoryOutboxStore();

    expect(() => store.markProcessing("missing")).toThrow(OutboxEventNotFoundError);
  });
});

describe("createInMemoryOutboxStore — tenant isolation and listing", () => {
  it("scopes listPendingByOrganization to a single organization", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1", organizationId: "org_1" }));
    store.enqueue(buildInput({ eventId: "evt_2", organizationId: "org_2" }));

    expect(store.listPendingByOrganization("org_1")).toHaveLength(1);
  });

  it("excludes non-pending events from listPendingByOrganization", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1", organizationId: "org_1" }));
    store.markProcessing(event.eventId);

    expect(store.listPendingByOrganization("org_1")).toHaveLength(0);
  });

  it("lists events scoped to a single operation", () => {
    const store = createInMemoryOutboxStore();
    store.enqueue(buildInput({ eventId: "evt_1", operationId: "op_1" }));
    store.enqueue(buildInput({ eventId: "evt_2", operationId: "op_2" }));

    expect(store.listByOperation("op_1")).toHaveLength(1);
  });
});

describe("createInMemoryOutboxStore — immutability", () => {
  it("freezes the returned event and its payload", () => {
    const store = createInMemoryOutboxStore();
    const event = store.enqueue(buildInput({ eventId: "evt_1" }));

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it("does not leak state between separate store instances", () => {
    const storeA = createInMemoryOutboxStore();
    const storeB = createInMemoryOutboxStore();
    storeA.enqueue(buildInput({ eventId: "evt_1" }));

    expect(storeB.get("evt_1")).toBeUndefined();
  });
});
