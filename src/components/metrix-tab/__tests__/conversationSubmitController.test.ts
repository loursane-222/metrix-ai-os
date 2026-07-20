import { describe, expect, it } from "vitest";
import { ConversationSubmitController } from "../conversationSubmitController";

describe("ConversationSubmitController", () => {
  it("claims synchronously and rejects rapid Enter/double-click until completion", () => {
    const controller = new ConversationSubmitController(() => 100, () => "turn-1");
    const first = controller.claim(" Yeni müşteri kaydet. ", "written");
    expect(first).toMatchObject({ turnId: "turn-1", generation: 1, text: "Yeni müşteri kaydet.", phase: "RESOLVING_EXTENSION" });
    expect(controller.claim("Yeni müşteri kaydet.", "written")).toBeNull();
    expect(controller.claim("Yeni müşteri kaydet.", "written")).toBeNull();
    expect(controller.transition(first!, "COMPLETED")).toBe(true);
    expect(controller.getActive()).toBeNull();
  });

  it("rejects stale extension completion after cancel and permits the next submit", () => {
    let id = 0;
    const controller = new ConversationSubmitController(() => 100, () => `turn-${++id}`);
    const stale = controller.claim("İlk", "written")!;
    expect(controller.cancel()).toMatchObject({ phase: "CANCELLED" });
    expect(controller.transition(stale, "COMPLETED")).toBe(false);
    expect(controller.claim("İkinci", "written")).toMatchObject({ turnId: "turn-2", generation: 3 });
  });

  it("keeps one generation through extension and AI phases", () => {
    const controller = new ConversationSubmitController(() => 100, () => "turn-1");
    const turn = controller.claim("Raporu göster", "voice")!;
    expect(controller.transition(turn, "RUNNING_AI")).toBe(true);
    expect(controller.getActive()).toMatchObject({ generation: turn.generation, phase: "RUNNING_AI" });
  });
});
