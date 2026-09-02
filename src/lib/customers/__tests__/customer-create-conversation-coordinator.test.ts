import { describe, expect, it } from "vitest";
import { CustomerCreateConversationCoordinator } from "../customer-create-conversation-coordinator";

// Regression for the production incident: customer-create planner call
// failed (401, session expiry mid-conversation), the bare try/catch fell
// back to a zero-field deterministic plan, and the coordinator reported it
// as a normal successful draft — Customer Create Surface opened empty with
// no signal anything had gone wrong. This must now be an honest
// CLARIFICATION with no navigation attempted at all.
describe("CustomerCreateConversationCoordinator — planner-failure honesty contract", () => {
  it("never opens the surface or reports EXECUTED when the planner fails and nothing reliable was extracted", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => { throw new Error("PLANNER_FAILED"); },
      navigate: () => { throw new Error("navigate() must not be called when nothing reliable was extracted"); },
      deliver: async () => { throw new Error("deliver() must not be called when nothing reliable was extracted"); },
    });

    const result = await coordinator.execute("Yeni musteri olustur: Clean State Kanit Testi", "written");

    expect(result.status).toBe("CLARIFICATION");
    expect(result.status).not.toBe("EXECUTED");
    expect(result.navigationRequested).toBe(false);
    expect(result.navigationStatus).toBe("NOT_REQUESTED");
    expect(result.outcomeCode).toBe("CREATE_PLANNER_DEGRADED");
    expect(result.failureCode).toBe("PLANNER_UNAVAILABLE_NO_RELIABLE_FIELDS");
  });

  it("still proceeds when the planner fails but the deterministic fallback extracted a real field", async () => {
    let deliverCalled = false;
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => { throw new Error("PLANNER_FAILED"); },
      navigate: () => true,
      deliver: async () => {
        deliverCalled = true;
        return { status: "COMPLETED", changedExecutiveTargetIds: [] };
      },
    });

    // Matches the deterministic named-entity onboarding pattern, extracting displayName.
    const result = await coordinator.execute("Atlas Yapı'yı sisteme ekle.", "written");

    // Delivery was actually attempted with the extracted field (unlike the
    // zero-field case above, where deliver()/navigate() must never run) —
    // this is what distinguishes FALLBACK_USABLE from FALLBACK_EMPTY. The
    // eventual outcome here depends on the fake surface registry (not under
    // test), but it must never be the planner-degraded short-circuit.
    expect(deliverCalled).toBe(true);
    expect(result.outcomeCode).not.toBe("CREATE_PLANNER_DEGRADED");
  });
});

// Living Workspace Determinism Operation — the coordinator's own internal
// gate: mutation (dispatchCustomerCreateCommand("commit")) must never be
// reachable unless the navigation command's own completion reports
// COMPLETED (Surface Ready + field batch applied). These prove the existing
// gate for the two ways it can fail short of that: the Surface never mounts
// (test class C) and the field batch fails to apply (test class D) — both
// surface as the identical navigation-completion signal the coordinator
// already checks before ever considering commit.
describe("CustomerCreateConversationCoordinator — Surface/Projection failure never reaches mutation", () => {
  it("never attempts commit when the Surface never mounts (navigation FAILED)", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "CREATE", fields: { displayName: "Surface Yok Test" }, unsupportedFields: [], explicitCommit: true } as never),
      navigate: () => { throw new Error("navigate() must not be called on the deliver-based path"); },
      deliver: async () => ({ status: "FAILED", changedExecutiveTargetIds: [] }),
    });

    const result = await coordinator.execute("Yeni musteri olustur: Surface Yok Test, kaydet", "written");

    expect(result.status).toBe("FAILED");
    expect(result.outcomeCode).toBe("CREATE_NAVIGATION_FAILED");
    expect(result.mutationPerformed).toBe(false);
  });

  it("never attempts commit when the Surface mounts but the field batch (projection) cannot be applied (navigation EXPIRED/TARGET_NOT_READY)", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "CREATE", fields: { displayName: "Projection Yok Test" }, unsupportedFields: [], explicitCommit: true } as never),
      navigate: () => true,
      deliver: async () => ({ status: "EXPIRED", changedExecutiveTargetIds: [] }),
    });

    const result = await coordinator.execute("Yeni musteri olustur: Projection Yok Test, kaydet", "written");

    expect(result.status).toBe("FAILED");
    expect(result.outcomeCode).toBe("CREATE_NAVIGATION_FAILED");
    expect(result.mutationPerformed).toBe(false);
  });
});

// User-directed revision to the canonical-operation-lifecycle fix: operationId
// must be a real runtime identity, not just a telemetry field — the same
// value the coordinator mints must be reused as the navigation command's
// correlationId (which the Surface mount and commit-dispatch gate are bound
// to downstream), across every turn of the same pending operation, and only
// a genuinely new operation gets a fresh one.
describe("CustomerCreateConversationCoordinator — canonical operation identity (operationId)", () => {
  it("reuses the pending operation's existing operationId as the navigation correlationId on a continuation turn, instead of minting a fresh one", async () => {
    let capturedCorrelationId: string | undefined;
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "PROVIDE_FIELDS", fields: {}, unsupportedFields: [], explicitCommit: false } as never),
      navigate: () => true,
      deliver: async (input) => { capturedCorrelationId = input.correlationId; return { status: "FAILED", changedExecutiveTargetIds: [] }; },
    });
    coordinator.store.patch({ lifecycle: "COLLECTING", fields: { displayName: "Mevcut Operasyon" }, missingFields: [], operationId: "existing-operation-id" });

    // deliver() returning FAILED aborts the turn (navigationFail() resets the
    // store, correctly clearing operationId along with the rest of the
    // pending state — a failed navigation abandons the operation) — the
    // proof this test needs is what correlationId was actually dispatched
    // to the navigation layer *during* the turn, captured above.
    await coordinator.execute("evet var", "written");

    expect(capturedCorrelationId).toBe("existing-operation-id");
  });

  it("mints a fresh operationId for a brand-new operation with no pending state", async () => {
    let capturedCorrelationId: string | undefined;
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "OPEN", fields: { displayName: "Yeni Operasyon" }, unsupportedFields: [], explicitCommit: false } as never),
      navigate: () => true,
      deliver: async (input) => { capturedCorrelationId = input.correlationId; return { status: "FAILED", changedExecutiveTargetIds: [] }; },
    });

    await coordinator.execute("Yeni musteri olustur: Yeni Operasyon", "written");

    expect(capturedCorrelationId).toBeTruthy();
    expect(capturedCorrelationId).not.toBe("existing-operation-id");
  });
});
