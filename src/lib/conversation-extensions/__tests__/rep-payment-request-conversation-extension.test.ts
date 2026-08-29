import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ proposeRepRequestMessage: vi.fn() }));
vi.mock("@/lib/rep-requests/rep-requests-client", () => ({ proposeRepRequestMessage: mocks.proposeRepRequestMessage }));

const { repPaymentRequestConversationExtension } = await import("../rep-payment-request-conversation-extension");

function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("rep-payment-request-conversation-extension", () => {
  it("does not handle an utterance with no payment-request keyword", async () => {
    const result = await repPaymentRequestConversationExtension.execute("tahsilatlarımı göster");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.proposeRepRequestMessage).not.toHaveBeenCalled();
  });

  it("does not handle a manager's later decision message", async () => {
    const result = await repPaymentRequestConversationExtension.execute("kendi tahsilat talebimi onayla");
    expect(result.status).toBe("NOT_HANDLED");
  });

  it("proposes and reports APPROVAL_REQUIRED", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "PROPOSED", domain: "PAYMENT", customerNameRaw: "Arde Yapı" } } });

    const result = await repPaymentRequestConversationExtension.execute("Arde Yapı'dan 10.000 TL tahsilat için onay istiyorum.");

    expect(mocks.proposeRepRequestMessage).toHaveBeenCalledWith("PAYMENT", "Arde Yapı'dan 10.000 TL tahsilat için onay istiyorum.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_PAYMENT_REQUEST_PROPOSED", resultStatus: "APPROVAL_REQUIRED" });
    expectValidHandoff(result.handoff);
  });

  it("falls through as NOT_HANDLED when nothing could be extracted", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "PARSE_FAILED" } } });
    const result = await repPaymentRequestConversationExtension.execute("tahsilat için onay bekliyorum");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await repPaymentRequestConversationExtension.execute("tahsilat için onay iste");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_PAYMENT_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
