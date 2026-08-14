import { describe, expect, it } from "vitest";
import { buildOrderEditCommandSystemPrompt, resolveOrderEditCommand, type OrderEditCommandContext } from "../order-edit-command-resolver";

const context: OrderEditCommandContext = { orderNumber: "SIP-0042", status: "APPROVED", allowedTransitions: ["PLANNED", "CANCELLED"], deadlineAt: "2026-09-10T12:00:00.000Z", items: [{ id: "item_real", name: "Pompa", quantity: "4" }] };
describe("resolveOrderEditCommand", () => {
  it("resolves a strict executable command", async () => {
    const outcome = await resolveOrderEditCommand({ utterance: "Pompa miktarını 8 yap", activeTab: "actions", context, generateText: async () => JSON.stringify({ result: "executable", action: "revise_quantity", orderItemId: "item_real", quantity: 8 }) });
    expect(outcome).toEqual({ kind: "resolved", resolution: { kind: "executable", command: { type: "revise_quantity", orderItemId: "item_real", quantity: 8 } } });
  });
  it("returns invalid_output for invalid JSON or schema", async () => {
    expect((await resolveOrderEditCommand({ utterance: "x", activeTab: "actions", context, generateText: async () => "tamam" })).kind).toBe("invalid_output");
    expect((await resolveOrderEditCommand({ utterance: "x", activeTab: "actions", context, generateText: async () => JSON.stringify({ result: "executable", action: "transition_status", toStatus: "DELETED" }) })).kind).toBe("invalid_output");
  });
  it("puts real items, status, deadline and permitted targets in the prompt", () => {
    const prompt = buildOrderEditCommandSystemPrompt(context);
    expect(prompt).toContain("item_real | Pompa | miktar 4"); expect(prompt).toContain("Mevcut durum: APPROVED"); expect(prompt).toContain("PLANNED, CANCELLED"); expect(prompt).toContain(context.deadlineAt!);
  });
});
