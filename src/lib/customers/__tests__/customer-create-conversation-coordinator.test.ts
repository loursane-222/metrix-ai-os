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

// Production regression, two stages:
// 1) "Atlas'ın telefonunu 0532 444 55 66 yap." opened the "Yeni Müşteri"
//    Workspace instead of a background update — the real planner had no
//    independent check the referenced entity exists and classified this as
//    CREATE. Fixed by cross-checking against the deterministic classifier
//    (customer-create-semantic-intent.ts's explicitUpdateClause rule),
//    which confidently disagrees for this exact shape.
// 2) That fix alone caused a second regression: the corrected UPDATE
//    classification was then claimed here as OBSERVED evidence — which
//    used to be a final HANDOFF at the shared dispatch loop, stopping it
//    before it ever reached the generic orchestration fallback (no
//    mutation happened at all). This coordinator does NOT special-case
//    UPDATE anymore — it still reports OBSERVED (this class's own contract:
//    "I recognized this, I have no execution path for it"), and the SHARED
//    active-conversation-extension.ts dispatch loop is what now treats an
//    OBSERVED+actionable-operation+no-mutation handoff as provisional, not
//    final (isProvisionalConversationHandoff, conversation-extension-
//    handoff.ts) — see active-conversation-extension.arbitration.test.ts
//    for the end-to-end proof that the generic fallback gets the turn.
describe("CustomerCreateConversationCoordinator — deterministic cross-check overrides a wrong CREATE classification", () => {
  it("claims a deterministically-UPDATE turn as OBSERVED evidence, not CREATE, when the planner says CREATE but the deterministic classifier confidently disagrees", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "OPEN", fields: { phone: "0532 444 55 66" }, unsupportedFields: [], explicitCommit: false } as never),
      navigate: () => { throw new Error("navigate() must not be called for a deterministically-UPDATE turn"); },
      deliver: async () => { throw new Error("deliver() must not be called for a deterministically-UPDATE turn"); },
    });

    const result = await coordinator.execute("Atlas'ın telefonunu 0532 444 55 66 yap.", "written");

    expect(result.handled).toBe(true);
    expect(result.status).toBe("OBSERVED");
    expect(result.operation).toBe("UPDATE");
    expect(result.navigationRequested).toBe(false);
    expect(result.mutationPerformed).toBe(false);
  });

  it("also claims a native (non-cross-checked) planner UPDATE classification as OBSERVED, not just the CREATE-override case", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "UPDATE", intent: "PROVIDE_FIELDS", fields: { phone: "0532 444 55 66" }, unsupportedFields: [], explicitCommit: false, entityReference: "Atlas" } as never),
      navigate: () => { throw new Error("navigate() must not be called for an UPDATE turn"); },
      deliver: async () => { throw new Error("deliver() must not be called for an UPDATE turn"); },
    });

    const result = await coordinator.execute("Atlas'ın telefonunu 0532 444 55 66 yap.", "written");

    expect(result.handled).toBe(true);
    expect(result.status).toBe("OBSERVED");
    expect(result.operation).toBe("UPDATE");
    expect(result.mutationPerformed).toBe(false);
  });

  // ENRICH (a fact stated in passing, not a command) is unaffected — still
  // claimed as passive evidence with no mutation and no navigation.
  it("still claims an ENRICH-classified turn as passive evidence (unchanged)", async () => {
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "ENRICH", intent: "PROVIDE_FIELDS", fields: { currency: "EUR" }, unsupportedFields: [], explicitCommit: false } as never),
      navigate: () => { throw new Error("navigate() must not be called for an ENRICH turn"); },
      deliver: async () => { throw new Error("deliver() must not be called for an ENRICH turn"); },
    });

    const result = await coordinator.execute("Atlas artık euro ile çalışıyor.", "written");

    expect(result.handled).toBe(true);
    expect(result.status).toBe("OBSERVED");
    expect(result.operation).toBe("ENRICH");
    expect(result.outcomeCode).toBe("CANONICAL_CUSTOMER_EVIDENCE");
  });

  it("still opens the create surface when the planner and deterministic classifier agree it's a CREATE", async () => {
    let deliverCalled = false;
    const coordinator = new CustomerCreateConversationCoordinator({
      planner: async () => ({ kind: "CREATE_PLAN", operation: "CREATE", intent: "OPEN", fields: { displayName: "Yeni Firma A.Ş." }, unsupportedFields: [], explicitCommit: false } as never),
      navigate: () => true,
      deliver: async () => { deliverCalled = true; return { status: "COMPLETED", changedExecutiveTargetIds: [] }; },
    });

    await coordinator.execute("Yeni müşteri: Yeni Firma A.Ş. ekle.", "written");

    expect(deliverCalled).toBe(true);
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
