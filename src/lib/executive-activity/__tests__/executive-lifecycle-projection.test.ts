import { describe, expect, it, vi } from "vitest";
import type { ExecutiveLifecycleEnvelope } from "@/lib/executive-lifecycle";
import { createExecutiveActivityProjection } from "../executive-activity-projection";

function action(id: string, phase: "requested" | "started" | "succeeded" | "progressed", timestamp: number, sessionId = "session-1"): ExecutiveLifecycleEnvelope {
  return { envelopeId: id, source: "action", phase, status: phase === "succeeded" ? "succeeded" : phase === "started" || phase === "progressed" ? "active" : "pending", timestamp, correlationId: sessionId, sessionId, summary: phase, action: {} };
}

describe("lifecycle activity projection", () => {
  it("orders deterministically, deduplicates and merges multiple sources", () => {
    const projection = createExecutiveActivityProjection();
    projection.projectLifecycle(action("b", "requested", 2));
    projection.projectLifecycle({ envelopeId: "a", source: "draft", phase: "created", status: "succeeded", timestamp: 1, correlationId: "session-1", sessionId: "session-1", summary: "draft", draft: { draftId: "d" } });
    projection.projectLifecycle(action("b", "requested", 2));
    expect(projection.getSnapshot().items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("isolates stale sessions and never regresses a terminal outcome", () => {
    const projection = createExecutiveActivityProjection();
    projection.projectLifecycle(action("start", "requested", 1));
    projection.projectLifecycle(action("done", "succeeded", 2));
    projection.projectLifecycle(action("late", "progressed", 3));
    projection.projectLifecycle(action("stale", "succeeded", 4, "old-session"));
    expect(projection.getSnapshot().items.map((item) => item.id)).toEqual(["start", "done"]);
    expect(projection.getSnapshot().outcome).toBe("completed");
  });

  it("bounds retention and stops notifying after unsubscribe/teardown", () => {
    const projection = createExecutiveActivityProjection({ timelineLimit: 2 });
    const listener = vi.fn();
    const unsubscribe = projection.subscribe(listener);
    projection.projectLifecycle(action("one", "requested", 1));
    projection.projectLifecycle(action("two", "started", 2));
    projection.projectLifecycle(action("three", "progressed", 3));
    expect(projection.getSnapshot().items.map((item) => item.id)).toEqual(["two", "three"]);
    unsubscribe();
    projection.projectLifecycle(action("four", "progressed", 4));
    expect(listener).toHaveBeenCalledTimes(3);
    projection.destroy();
    projection.projectLifecycle(action("five", "progressed", 5));
    expect(projection.getSnapshot().items.at(-1)?.id).toBe("four");
  });

  it("merges document through verification into one deterministic session", () => {
    const projection = createExecutiveActivityProjection();
    const common = { correlationId: "flow-1", sessionId: "flow-1" } as const;
    const envelopes: ExecutiveLifecycleEnvelope[] = [
      { ...common, envelopeId: "1", source: "document", phase: "uploaded", status: "succeeded", timestamp: 1, summary: "uploaded", document: { documentId: "doc" } },
      { ...common, envelopeId: "2", source: "extraction", phase: "extracted", status: "succeeded", timestamp: 2, summary: "extracted", document: { documentId: "doc", extractedFieldCount: 2 } },
      { ...common, envelopeId: "3", source: "preview", phase: "preview_ready", status: "succeeded", timestamp: 3, summary: "preview", document: { documentId: "doc" } },
      { ...common, envelopeId: "4", source: "draft", phase: "created", status: "succeeded", timestamp: 4, summary: "draft", draft: { draftId: "draft" } },
      { ...common, envelopeId: "5", source: "approval", phase: "awaiting_decision", status: "waiting", timestamp: 5, summary: "approval", approval: { approvalId: "approval", actionName: "customer.create", expiresAt: "2099-01-01", currentStatus: "PENDING" } },
      { ...common, envelopeId: "6", source: "approval", phase: "approved", status: "succeeded", timestamp: 6, summary: "approved", approval: { approvalId: "approval", actionName: "customer.create", expiresAt: "2099-01-01", currentStatus: "GRANTED" } },
      { ...common, envelopeId: "7", source: "action", phase: "started", status: "active", timestamp: 7, summary: "started", action: { executionId: "execution" } },
      { ...common, envelopeId: "8", source: "action", phase: "succeeded", status: "succeeded", timestamp: 8, summary: "succeeded", action: { executionId: "execution" } },
      { ...common, envelopeId: "9", source: "action", phase: "verified", status: "succeeded", timestamp: 9, summary: "verified", verification: { status: "passed", summary: "verified" }, action: { executionId: "execution" } },
    ];
    for (const envelope of envelopes) projection.projectLifecycle(envelope);
    expect(projection.getSnapshot().items.map((item) => item.id)).toEqual(envelopes.map((item) => item.envelopeId));
    expect(projection.getSnapshot()).toMatchObject({ sessionId: "flow-1", outcome: "completed" });
  });
});
