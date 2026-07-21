import { describe, expect, it } from "vitest";
import { ConversationSubmitController } from "../conversationSubmitController";

describe("conversation submit turn ownership", () => {
  it("lets only the active incomplete turn mutate lifecycle state", () => {
    let id = 0;
    const controller = new ConversationSubmitController(() => id, () => `turn-${++id}`);
    const first = controller.claim("ilk mesaj", "written")!;
    expect(controller.transition(first, "RUNNING_AI")).toBe(true);
    expect(controller.cancel()?.turnId).toBe(first.turnId);

    const current = controller.claim("yeni ses turnü", "voice")!;
    expect(controller.transition(first, "COMPLETED")).toBe(false);
    expect(controller.getActive()?.turnId).toBe(current.turnId);
    expect(controller.transition(current, "COMPLETED")).toBe(true);
    expect(controller.getActive()).toBeNull();
  });

  it("never reopens a completed turn", () => {
    const controller = new ConversationSubmitController(() => 1, () => "turn-complete");
    const turn = controller.claim("tamamla", "written")!;
    expect(controller.transition(turn, "COMPLETED")).toBe(true);
    expect(controller.transition(turn, "RUNNING_AI")).toBe(false);
  });
});
