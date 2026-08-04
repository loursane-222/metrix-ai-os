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
});
