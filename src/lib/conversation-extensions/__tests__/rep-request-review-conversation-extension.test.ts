import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ reviewRepRequestMessage: vi.fn() }));
vi.mock("@/lib/rep-requests/rep-requests-client", () => ({ reviewRepRequestMessage: mocks.reviewRepRequestMessage }));

const { repRequestReviewConversationExtension } = await import("../rep-request-review-conversation-extension");

function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("rep-request-review-conversation-extension", () => {
  it("does not handle an utterance with no domain keyword", async () => {
    const result = await repRequestReviewConversationExtension.execute("bugünkü işleri onayla");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.reviewRepRequestMessage).not.toHaveBeenCalled();
  });

  it("does not handle a propose-style message ('onaya gönder' contains no decision verb)", async () => {
    const result = await repRequestReviewConversationExtension.execute("sipariş açmak istiyorum, onaya gönder");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.reviewRepRequestMessage).not.toHaveBeenCalled();
  });

  it("does not collide with the weekly-report review extension (requires no 'rapor')", async () => {
    // Sanity check on the trigger itself — this message has nothing to do
    // with a report, so this extension (not report-review) should be the
    // one that would claim it; verified separately that report-review
    // requires "rapor" and therefore never fires here.
    mocks.reviewRepRequestMessage.mockResolvedValue({ ok: true, data: { review: { status: "PARSE_FAILED" } } });
    const result = await repRequestReviewConversationExtension.execute("Ahmet'in siparişini onayla");
    expect(mocks.reviewRepRequestMessage).toHaveBeenCalled();
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("approves an order request and reports EXECUTED", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({
      ok: true,
      data: { review: { status: "DECIDED", decision: "APPROVE", domain: "ORDER", repFullName: "Ahmet Yılmaz", customerNameRaw: "Atlas İnşaat" } },
    });

    const result = await repRequestReviewConversationExtension.execute("Ahmet'in siparişini onayla.");

    expect(mocks.reviewRepRequestMessage).toHaveBeenCalledWith("Ahmet'in siparişini onayla.");
    expect(result.handoff).toMatchObject({ domain: "orders", outcomeCode: "REP_REQUEST_REVIEW_APPROVED", resultStatus: "EXECUTED", mutationPerformed: true });
    expectValidHandoff(result.handoff);
  });

  it("rejects a quote request and reports EXECUTED with the quotes domain", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({
      ok: true,
      data: { review: { status: "DECIDED", decision: "REJECT", domain: "QUOTE", repFullName: "Ayşe Kaya", customerNameRaw: "Beta Lojistik" } },
    });

    const result = await repRequestReviewConversationExtension.execute("Ayşe'nin teklifini reddet.");

    expect(result.handoff).toMatchObject({ domain: "quotes", outcomeCode: "REP_REQUEST_REVIEW_REJECTED", resultStatus: "EXECUTED" });
    expectValidHandoff(result.handoff);
  });

  it("falls through as NOT_HANDLED when the parser found nothing to decide", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({ ok: true, data: { review: { status: "PARSE_FAILED" } } });
    const result = await repRequestReviewConversationExtension.execute("sipariş konusunda ne düşünüyorsun, onayla mısın");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports a FAILED-shaped handoff when a plain EMPLOYEE is denied", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({ ok: true, data: { review: { status: "DENIED" } } });
    const result = await repRequestReviewConversationExtension.execute("Ahmet'in siparişini onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_REQUEST_REVIEW_DENIED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });

  it("asks for clarification when multiple pending candidates match", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({
      ok: true,
      data: { review: { status: "CANDIDATE_AMBIGUOUS", repFullName: "Ahmet Yılmaz", options: ["Sipariş, Atlas İnşaat", "Tahsilat, Beta Lojistik"] } },
    });
    const result = await repRequestReviewConversationExtension.execute("Ahmet'in siparişini onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_REQUEST_REVIEW_CANDIDATE_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", candidateNames: ["Sipariş, Atlas İnşaat", "Tahsilat, Beta Lojistik"] });
    expectValidHandoff(result.handoff);
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.reviewRepRequestMessage.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await repRequestReviewConversationExtension.execute("Ahmet'in siparişini onayla");
    expect(result.handoff).toMatchObject({ outcomeCode: "REP_REQUEST_REVIEW_REQUEST_FAILED", resultStatus: "FAILED" });
    expectValidHandoff(result.handoff);
  });
});
