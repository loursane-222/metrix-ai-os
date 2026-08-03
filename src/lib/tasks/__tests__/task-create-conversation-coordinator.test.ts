import { describe, expect, it } from "vitest";
import { TaskCreateConversationCoordinator } from "../task-create-conversation-coordinator";

// Same contract as customer-create (src/lib/customers/__tests__/customer-create-conversation-coordinator.test.ts)
// via the shared src/lib/conversation-extensions/create-plan-resolution.ts —
// task-create-conversation-coordinator.ts has the identical bare
// try/catch-around-planner shape and must not repeat the same false-success
// failure mode.
describe("TaskCreateConversationCoordinator — planner-failure honesty contract", () => {
  it("never reports EXECUTED/navigation when the planner fails and nothing reliable was extracted", async () => {
    const coordinator = new TaskCreateConversationCoordinator({
      planner: async () => { throw new Error("PLANNER_FAILED"); },
    });
    // An active workflow (as if a prior turn already opened the draft) so the
    // deterministic fallback doesn't bail to NOT_TASK_CREATE outright — it
    // reaches CREATE_PLAN with genuinely empty fields, the exact case this
    // contract must catch.
    coordinator.store.patch({ lifecycle: "COLLECTING" });

    const result = await coordinator.execute("Yeni görev oluştur:", "written");

    expect(result.status).toBe("CLARIFICATION");
    expect(result.status).not.toBe("EXECUTED");
    expect(result.navigationRequested).toBe(false);
    expect(result.navigationStatus).toBe("NOT_REQUESTED");
    expect(result.outcomeCode).toBe("CREATE_PLANNER_DEGRADED");
    expect(result.failureCode).toBe("PLANNER_UNAVAILABLE_NO_RELIABLE_FIELDS");
  });
});
