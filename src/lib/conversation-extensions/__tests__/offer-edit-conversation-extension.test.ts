import { afterEach, describe, expect, it, vi } from "vitest";

const { descriptorMock, resolveAndDispatchMock } = vi.hoisted(() => ({
  descriptorMock: vi.fn(),
  resolveAndDispatchMock: vi.fn(),
}));

vi.mock("@/lib/offers/offer-edit-command-integration", () => ({
  resolveAndDispatchOfferEditSurfaceCommand: resolveAndDispatchMock,
}));
vi.mock("@/lib/offers/offer-edit-surface-command-channel", () => ({
  getActiveOfferEditSurfaceDescriptor: descriptorMock,
}));

import { offerEditConversationExtension } from "../offer-edit-conversation-extension";

// Customer Mutation Ownership Closure, second domain proof (Görev 5): the
// SAME draft-vs-commit split (and the same bug) exists in offer-edit as in
// customer-edit — set_field only stages the open offer draft, only "commit"
// persists. Not a customer/phone-specific patch; this proves the invariant
// generalizes.
describe("offerEditConversationExtension — mutation ownership", () => {
  afterEach(() => vi.clearAllMocks());

  it("a bare set_field never claims mutationPerformed — only commit persists", async () => {
    resolveAndDispatchMock.mockResolvedValue({
      status: "EXECUTED",
      command: { type: "set_field", field: "amount", value: "5000" },
    });

    await expect(offerEditConversationExtension.execute("Tutarı 5000 yap.")).resolves.toMatchObject({
      status: "HANDOFF",
      handoff: { operation: "UPDATE", outcomeCode: "OFFER_EDIT_EXECUTED", resultStatus: "EXECUTED", mutationPerformed: false },
    });
  });

  it("a real commit claims mutationPerformed", async () => {
    resolveAndDispatchMock.mockResolvedValue({ status: "EXECUTED", command: { type: "commit" } });

    await expect(offerEditConversationExtension.execute("Kaydet")).resolves.toMatchObject({
      status: "HANDOFF",
      handoff: { operation: "UPDATE", outcomeCode: "OFFER_EDIT_COMMITTED", resultStatus: "EXECUTED", mutationPerformed: true },
    });
  });
});
