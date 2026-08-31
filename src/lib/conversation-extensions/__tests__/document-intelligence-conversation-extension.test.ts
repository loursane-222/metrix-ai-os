import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/documents/document-attachment-session", () => ({
  getActiveDocumentAttachment: vi.fn(),
}));

import { documentIntelligenceConversationExtension } from "../document-intelligence-conversation-extension";
import { getActiveDocumentAttachment } from "@/lib/documents/document-attachment-session";

const activeAttachment = { attachmentRef: "att-1", filename: "f.pdf", mimeType: "application/pdf", size: 100, expiresAt: "2099-01-01T00:00:00.000Z" };

describe("document-intelligence-conversation-extension", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getActiveDocumentAttachment).mockReturnValue(activeAttachment);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("matches the roadmap's other two literal example phrasings, not just the 'X olarak kaydet' shape", async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "PURCHASE_INVOICE", confidence: 0.9, needsReview: false } }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { build: { status: "CREATED", candidateId: "c-1" } } }) });
    const invoiceResult = await documentIntelligenceConversationExtension.execute("bu tedarikçi faturasını işle");
    expect(invoiceResult.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_CANDIDATE_READY");

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "CHEQUE", confidence: 0.9, needsReview: false } }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { build: { status: "CREATED", candidateId: "c-2" } } }) });
    const chequeResult = await documentIntelligenceConversationExtension.execute("bu çeki kaydet");
    expect(chequeResult.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_CANDIDATE_READY");
  });

  it("does not false-positive on an unrelated word that merely contains 'çek' as a substring (gerçek)", async () => {
    const result = await documentIntelligenceConversationExtension.execute("bu gerçek faturayı kaydet");
    expect(result.status).toBe("NOT_HANDLED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores utterances that aren't a document-save trigger", async () => {
    const result = await documentIntelligenceConversationExtension.execute("bugün hava nasıl?");
    expect(result.status).toBe("NOT_HANDLED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the user to attach a document first when no attachment is active", async () => {
    vi.mocked(getActiveDocumentAttachment).mockReturnValue(undefined);
    const result = await documentIntelligenceConversationExtension.execute("bunu gider olarak kaydet");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_NO_ACTIVE_ATTACHMENT");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("REQUIREMENT: never lets the user's stated domain silently override what the document itself classifies as — a mismatch stops for review instead of picking either interpretation", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "SALES_INVOICE", confidence: 0.95, needsReview: false } }) });
    const result = await documentIntelligenceConversationExtension.execute("bunu gider olarak kaydet");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_CLASSIFICATION_MISMATCH");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
    // Extraction must never be attempted once the domains disagree.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a low-confidence (needsReview) classification also stops for review even if it happens to name the requested domain", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "EXPENSE_RECEIPT", confidence: 0.4, needsReview: true } }) });
    const result = await documentIntelligenceConversationExtension.execute("bunu gider olarak kaydet");
    expect(result.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_CLASSIFICATION_MISMATCH");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("proceeds to extraction and reports APPROVAL_REQUIRED once classification agrees and a candidate is created", async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "EXPENSE_RECEIPT", confidence: 0.9, needsReview: false } }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { build: { status: "CREATED", candidateId: "candidate-1" } } }) });
    const result = await documentIntelligenceConversationExtension.execute("bunu gider olarak kaydet");
    expect(result.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_CANDIDATE_READY");
    expect(result.handoff?.resultStatus).toBe("APPROVAL_REQUIRED");
    expect(result.handoff?.mutationPerformed).toBe(false); // never mutates directly — only queues a reviewable candidate
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports CLARIFICATION_REQUIRED with the reason when extraction resolves but needs human review (e.g. ambiguous counterparty)", async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { domain: "EXPENSE_RECEIPT", confidence: 0.9, needsReview: false } }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, data: { build: { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS" } } }) });
    const result = await documentIntelligenceConversationExtension.execute("bunu gider olarak kaydet");
    expect(result.handoff?.outcomeCode).toBe("DOCUMENT_INTELLIGENCE_COUNTERPARTY_AMBIGUOUS");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
  });
});
