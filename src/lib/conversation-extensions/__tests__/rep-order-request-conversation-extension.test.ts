import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ proposeRepRequestMessage: vi.fn() }));
vi.mock("@/lib/rep-requests/rep-requests-client", () => ({ proposeRepRequestMessage: mocks.proposeRepRequestMessage }));

const { repOrderRequestConversationExtension } = await import("../rep-order-request-conversation-extension");

function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("rep-order-request-conversation-extension", () => {
  it("does not handle an utterance with no order-request keyword", async () => {
    const result = await repOrderRequestConversationExtension.execute("siparişlerimi göster");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.proposeRepRequestMessage).not.toHaveBeenCalled();
  });

  it("does not handle a manager's later decision message (no 'onaya gönder' phrase, contains 'onayla')", async () => {
    const result = await repOrderRequestConversationExtension.execute("Ahmet'in siparişini onayla");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.proposeRepRequestMessage).not.toHaveBeenCalled();
  });

  it("proposes and reports APPROVAL_REQUIRED", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "PROPOSED", domain: "ORDER", customerNameRaw: "Atlas İnşaat" } } });

    const result = await repOrderRequestConversationExtension.execute("Atlas İnşaat için sipariş açmak istiyorum, onaya gönder.");

    expect(mocks.proposeRepRequestMessage).toHaveBeenCalledWith("ORDER", "Atlas İnşaat için sipariş açmak istiyorum, onaya gönder.");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_ORDER_REQUEST_PROPOSED", resultStatus: "APPROVAL_REQUIRED", approvalRequired: true });
    expectValidHandoff(result.handoff);
  });

  it("falls through as NOT_HANDLED when nothing could be extracted", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "PARSE_FAILED" } } });
    const result = await repOrderRequestConversationExtension.execute("sipariş konusunda onay iste");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("asks for clarification when the customer can't be resolved", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: true, data: { report: { status: "CUSTOMER_NOT_FOUND", customerNameRaw: "Bilinmeyen Firma" } } });
    const result = await repOrderRequestConversationExtension.execute("Bilinmeyen Firma için sipariş, onay iste");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_ORDER_REQUEST_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "NOT_FOUND" });
    expectValidHandoff(result.handoff);
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.proposeRepRequestMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await repOrderRequestConversationExtension.execute("sipariş için onay iste");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_ORDER_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
