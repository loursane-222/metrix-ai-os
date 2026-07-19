import { describe, expect, it } from "vitest";
import { CustomerCreateConversationStateStore } from "../customer-create-conversation-state";
describe("CustomerCreateConversationStateStore", () => {
  it("tracks, cancels, resets and expires bounded browser state", () => {
    let now = 1_000; const store = new CustomerCreateConversationStateStore(() => now, 100);
    store.patch({ lifecycle: "READY", fields: { displayName: "Arda Yapı" }, missingFields: [] });
    expect(store.get().fields.displayName).toBe("Arda Yapı");
    store.cancel(); expect(store.get()).toMatchObject({ lifecycle: "CANCELLED", fields: {} });
    store.reset(); expect(store.get().lifecycle).toBe("IDLE");
    store.patch({ lifecycle: "COLLECTING" }); now += 101; expect(store.get().lifecycle).toBe("IDLE");
  });
});
