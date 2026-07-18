import { describe, expect, it, vi } from "vitest";

import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";
import { createCustomerUpdateActionProducer } from "@/lib/executive-presence/producers/customer-update-action-producer";

function setup(ids = ["generated-correlation", "start-event", "terminal-event"]) {
  const events: ExecutivePresenceEvent[] = [];
  const createId = vi.fn(() => ids.shift() ?? "unexpected-id");
  const producer = createCustomerUpdateActionProducer({
    publish: (event) => events.push(event),
    createId,
    now: () => 123,
  });
  return { createId, events, producer };
}

describe("customer.update Executive Presence producer", () => {
  it("publishes STARTED then SUCCEEDED with the supplied correlation", async () => {
    const { events, producer } = setup(["start-event", "terminal-event"]);

    await producer.execute({
      correlationId: "correlation-1",
      operationId: "operation-1",
      invoke: async (correlationId) => ({ ok: true as const, correlationId }),
      isFailure: (result) => !result.ok,
      failureMessage: () => "failed",
    });

    expect(events.map((event) => event.type)).toEqual([
      "ACTION_EXECUTION_STARTED",
      "ACTION_EXECUTION_SUCCEEDED",
    ]);
    expect(events.map((event) => ("correlationId" in event ? event.correlationId : undefined))).toEqual([
      "correlation-1",
      "correlation-1",
    ]);
  });

  it("publishes STARTED then FAILED once for a failed result", async () => {
    const { events, producer } = setup(["start-event", "terminal-event"]);

    await producer.execute({
      correlationId: "correlation-2",
      operationId: "operation-2",
      invoke: async () => ({ ok: false as const, error: "request failed" }),
      isFailure: (result) => !result.ok,
      failureMessage: (result) => result.error,
    });

    expect(events.map((event) => event.type)).toEqual([
      "ACTION_EXECUTION_STARTED",
      "ACTION_EXECUTION_FAILED",
    ]);
    expect(events.filter((event) => event.type === "ACTION_EXECUTION_FAILED")).toHaveLength(1);
  });

  it("creates one correlation when none is supplied and preserves it", async () => {
    const { createId, events, producer } = setup();
    const invoke = vi.fn(async () => ({ ok: true as const }));

    await producer.execute({
      operationId: "operation-3",
      invoke,
      isFailure: (result) => !result.ok,
      failureMessage: () => "failed",
    });

    expect(createId).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledWith("generated-correlation");
    expect(events.map((event) => ("correlationId" in event ? event.correlationId : undefined))).toEqual([
      "generated-correlation",
      "generated-correlation",
    ]);
  });

  it("does not publish a terminal failure for an abort", async () => {
    const { events, producer } = setup(["start-event"]);

    await expect(
      producer.execute({
        correlationId: "correlation-abort",
        operationId: "operation-abort",
        invoke: async () => {
          throw new DOMException("aborted", "AbortError");
        },
        isFailure: () => false,
        failureMessage: () => "failed",
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(events.map((event) => event.type)).toEqual(["ACTION_EXECUTION_STARTED"]);
  });
});
