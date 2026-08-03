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

    const result = await coordinator.execute("Yeni musteri olustur: Clean State Kanit Testi, telefon 5559998877", "written");

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
