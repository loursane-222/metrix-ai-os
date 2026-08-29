import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ proposeRepRequestMessage: vi.fn() }));
vi.mock("@/lib/rep-requests/rep-requests-client", () => ({ proposeRepRequestMessage: mocks.proposeRepRequestMessage }));

const { repQuoteRequestConversationExtension } = await import("../rep-quote-request-conversation-extension");

function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("rep-quote-request-conversation-extension", () => {
  it("does not handle an utterance with no quote-request keyword", async () => {
    const result = await repQuoteRequestConversationExtension.execute("tekliflerimi göster");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.proposeRepRequestMessage).not.toHaveBeenCalled();
  });

  it("does not handle a manager's later decision message", async () => {
    const result = await repQuoteRequestConversationExtension.execute("Ayşe'nin teklifini onayla");
    expect(result.status).toBe("NOT_HANDLED");
  });

  it("proposes and reports APPROVAL_REQUIRED", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "PROPOSED", domain: "QUOTE", customerNameRaw: "Beta Lojistik" } } });

    const result = await repQuoteRequestConversationExtension.execute("Beta Lojistik'e 50.000 TL'lik teklif hazırla, onayına sun.");

    expect(mocks.proposeRepRequestMessage).toHaveBeenCalledWith("QUOTE", "Beta Lojistik'e 50.000 TL'lik teklif hazırla, onayına sun.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_QUOTE_REQUEST_PROPOSED", resultStatus: "APPROVAL_REQUIRED" });
    expectValidHandoff(result.handoff);
  });

  it("asks for clarification when the customer name is ambiguous", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "CUSTOMER_AMBIGUOUS", customerNameRaw: "Beta", options: ["Beta Lojistik", "Beta Yapı"] } } });
    const result = await repQuoteRequestConversationExtension.execute("Beta'ya teklif, onay iste");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_QUOTE_REQUEST_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", candidateNames: ["Beta Lojistik", "Beta Yapı"] });
    expectValidHandoff(result.handoff);
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await repQuoteRequestConversationExtension.execute("teklif için onay iste");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_QUOTE_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
