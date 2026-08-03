import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCreateConversationCoordinator } from "../task-create-conversation-coordinator";

vi.mock("../task-navigation-runtime", () => ({
  dispatchTaskNavigation: vi.fn(),
  dispatchTaskNavigationCommand: vi.fn(async () => ({ status: "COMPLETED", changedExecutiveTargetIds: [] })),
}));
// Returns null the first time (no surface active yet — this is what makes
// the coordinator treat it as a fresh navigation, the exact condition that
// triggers the lifecycle bug below) and a real descriptor afterward, once
// dispatchTaskNavigationCommand's fake "COMPLETED" response has "mounted" it.
let taskSurfaceCallCount = 0;
vi.mock("../task-create-surface-command-channel", () => ({
  dispatchTaskCreateCommand: vi.fn(async () => ({ status: "EXECUTED" })),
  getActiveTaskCreateSurfaceDescriptor: vi.fn(() => (taskSurfaceCallCount++ === 0 ? null : { token: "fake-token" })),
}));

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

// Regression, discovered during Living Runtime Consistency production
// acceptance: reproduced live twice (real account, metrixgm.com) — the
// Task Create surface opened with title/dueDate/priority all correctly
// populated, yet METRIX said "Devam edebilmem için biraz daha bilgi verir
// misiniz?" (need more info), contradicting what the user was watching
// happen live. Root cause: when this turn triggers a fresh navigation (the
// surface wasn't already open — true for every first task-create message
// in a conversation), the coordinator force-set lifecycle to "OPENING" and
// never re-derived it afterward, so the final EXECUTED/CLARIFICATION
// branch read that stale value instead of the real field state.
describe("TaskCreateConversationCoordinator — lifecycle must reflect real field state after a fresh navigation", () => {
  beforeEach(() => { taskSurfaceCallCount = 0; });

  it("reports EXECUTED (not CLARIFICATION) when a real title was extracted on the first task-create turn", async () => {
    const coordinator = new TaskCreateConversationCoordinator({
      planner: async () => ({
        kind: "CREATE_PLAN",
        intent: "OPEN",
        fields: { title: "Kabul testi raporunu hazirla", dueDate: "2026-08-04", priority: "HIGH" },
        explicitCommit: false,
      }),
    });

    const result = await coordinator.execute("Yeni görev oluştur: Kabul testi raporunu hazirla, yarına kadar, öncelik yüksek olsun", "written");

    expect(result.status).toBe("EXECUTED");
    expect(result.status).not.toBe("CLARIFICATION");
    expect(result.outcomeCode).toBe("CREATE_DRAFT_READY");
    expect(coordinator.store.get().lifecycle).toBe("READY");
  });
});
