import { afterEach, describe, expect, it, vi } from "vitest";
import { taskManagementConversationExtension } from "../task-management-conversation-extension";
import { taskCreateConversationCoordinator } from "@/lib/tasks/task-create-conversation-coordinator";

// Same regression class as customer-management-conversation-extension.test.ts's
// "invokes the coordinator for a pending-operation continuation turn" case
// (METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md §0/§4): the local,
// zero-network gate (extractObviousTaskCreatePlan) must not have veto power
// once a task-create operation is already pending — the coordinator's real
// planner must still be given every continuation turn, even ones the gate's
// hand-maintained TRIGGER regex doesn't recognize.
describe("taskManagementConversationExtension", () => {
  afterEach(() => {
    taskCreateConversationCoordinator.store.reset();
    vi.restoreAllMocks();
  });

  it("invokes the coordinator for a pending-operation continuation turn the local gate doesn't recognize (production regression)", async () => {
    taskCreateConversationCoordinator.store.patch({ lifecycle: "COLLECTING", fields: { title: "Ofis kirasini ode" }, operationId: "op-task-continuation-test" });
    const create = vi.spyOn(taskCreateConversationCoordinator, "execute").mockResolvedValue({
      handled: true, status: "EXECUTED", operation: "CREATE", outcomeCode: "CREATE_COMMITTED",
      fieldNames: ["title"], mutationPerformed: true, navigationRequested: false, navigationStatus: "COMPLETED",
      failureCode: null, operationId: "op-task-continuation-test",
    });

    await taskManagementConversationExtension.execute("tamamla", "written");

    expect(create).toHaveBeenCalledWith("tamamla", "written");
  });

  it("still declines an utterance the gate doesn't recognize when no task-create operation is pending", async () => {
    const create = vi.spyOn(taskCreateConversationCoordinator, "execute");

    await expect(taskManagementConversationExtension.execute("bugünün havası nasıl", "written")).resolves.toEqual({ status: "NOT_HANDLED", handoff: null });

    expect(create).not.toHaveBeenCalled();
  });

  // Production regression: "Yarın bana Ahmet müşterisini aramam için görev
  // oluştur." opened an empty "Yeni Görev" workspace instead of creating the
  // task directly. Root cause proven live: the local ownership gate
  // (extractObviousTaskCreatePlan) anchored its trigger regex to the START
  // of the utterance, but Turkish task-creation requests are routinely
  // verb-final ("... için görev oluştur."), so the gate returned
  // NOT_TASK_CREATE and declined ownership BEFORE the real coordinator/LLM
  // planner ever ran — the turn then fell through to a generic fallback
  // with no structured field data. These cases must reach the coordinator
  // on a FRESH turn (no pending operation), not just on a continuation.
  it.each([
    "Yarın bana Ahmet müşterisini aramam için görev oluştur.",
    "Yarın Ahmete müşteriyi araması için görev oluştur.",
    "Bir takip görevi oluştur.",
  ])("hands a fresh verb-final task-creation utterance to the coordinator instead of declining it: %s", async (utterance) => {
    const create = vi.spyOn(taskCreateConversationCoordinator, "execute").mockResolvedValue({
      handled: true, status: "EXECUTED", operation: "CREATE", outcomeCode: "CREATE_COMMITTED",
      fieldNames: ["title"], mutationPerformed: true, navigationRequested: false, navigationStatus: "COMPLETED",
      failureCode: null, operationId: "op-task-fresh-verb-final-test",
    });

    const result = await taskManagementConversationExtension.execute(utterance, "written");

    expect(create).toHaveBeenCalledWith(utterance, "written");
    expect(result.status).not.toBe("NOT_HANDLED");
  });
});
