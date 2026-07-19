import { describe, expect, it } from "vitest";
import { createExecutiveActivityProjection } from "../executive-activity-projection";
import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";

const base = { source: "test", timestamp: 1, correlationId: "turn-1" } as const;

function project(events: ExecutivePresenceEvent[]) {
  const projection = createExecutiveActivityProjection();
  for (const event of events) projection.project(event);
  return projection.getSnapshot();
}

describe("ExecutiveActivityProjection", () => {
  it.each([
    ["CONVERSATION_THINKING_STARTED", "planning"],
    ["ACTION_EXECUTION_STARTED", "executing"],
    ["APPROVAL_REQUESTED", "approval"],
  ] as const)("projects %s from a real event", (type, kind) => {
    const operation = type === "CONVERSATION_THINKING_STARTED" ? {} : { operationId: "op-1" };
    const snapshot = project([{ ...base, ...operation, type, eventId: "one" } as ExecutivePresenceEvent]);
    expect(snapshot.items.at(-1)?.kind).toBe(kind);
    expect(snapshot.items.at(-1)?.status).toBe("active");
  });

  it("shows success only after a successful terminal event", () => {
    const before = project([{
      ...base, type: "ACTION_EXECUTION_STARTED", eventId: "start", operationId: "op-1",
    }]);
    expect(before.outcome).toBeNull();
    const after = project([
      { ...base, type: "ACTION_EXECUTION_STARTED", eventId: "start", operationId: "op-1" },
      { ...base, timestamp: 2, type: "ACTION_EXECUTION_SUCCEEDED", eventId: "done", operationId: "op-1" },
    ]);
    expect(after.outcome).toBe("completed");
  });

  it("projects failure and cancellation", () => {
    const failed = project([
      { ...base, type: "ACTION_EXECUTION_STARTED", eventId: "start", operationId: "op-1" },
      { ...base, type: "ACTION_EXECUTION_FAILED", eventId: "fail", operationId: "op-1", error: "nope" },
    ]);
    expect(failed.outcome).toBe("failed");
    expect(failed.items.at(-1)?.error).toBe("nope");

    const cancelled = project([{
      type: "SOURCE_RELEASED", eventId: "cancel", source: "test", timestamp: 3,
    }]);
    expect(cancelled.outcome).toBe("cancelled");
  });

  it("deduplicates events and rejects stale terminal events from an old session", () => {
    const duplicate = { ...base, type: "CONVERSATION_THINKING_STARTED", eventId: "same" } as const;
    const snapshot = project([
      duplicate,
      duplicate,
      { ...base, timestamp: 2, correlationId: "turn-2", type: "CONVERSATION_THINKING_STARTED", eventId: "new" },
      { ...base, timestamp: 3, type: "FEEDBACK_COMPLETED", eventId: "old-done" },
    ]);
    expect(snapshot.sessionId).toBe("turn-2");
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.outcome).toBeNull();
  });
});
