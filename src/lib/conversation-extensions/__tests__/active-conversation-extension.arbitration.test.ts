import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Demonstrates the shared arbitration rule (a weak/provisional claim from
// an earlier extension in the dispatch array never blocks a later,
// correct extension from claiming the same turn) using two real,
// unmodified modules — offer-management (PRESENTATION_NAVIGATION,
// dispatched early) and customer-document-attachment (CANONICAL_CONTINUATION_APPROVAL,
// dispatched after every PRESENTATION_NAVIGATION entry) — so the test stays
// tied to the actual production ordering in
// conversation-extension-ownership-registry.ts.
//
// Final Residual Parity Closure retired customer-management-conversation-
// extension.ts entirely (the module this test used to mock here) — its one
// sub-stage that couldn't become a stateless tool
// (customerAttachmentConversationCoordinator) now lives in its own
// customer-document-attachment-conversation-extension.ts, still positioned
// after offer-management in the real array, so this test's pairing (offer
// first, a customer-domain extension second) still holds — only the
// specific module changed.
const { customerExecuteMock, customerScopeKeyMock, offerExecuteMock, offerScopeKeyMock } = vi.hoisted(() => ({
  customerExecuteMock: vi.fn(),
  customerScopeKeyMock: vi.fn(),
  offerExecuteMock: vi.fn(),
  offerScopeKeyMock: vi.fn(),
}));

vi.mock("../customer-document-attachment-conversation-extension", () => ({
  customerDocumentAttachmentConversationExtension: {
    execute: customerExecuteMock,
    getActiveScopeKey: customerScopeKeyMock,
  },
}));

vi.mock("../offer-management-conversation-extension", () => ({
  offerManagementConversationExtension: {
    execute: offerExecuteMock,
    getActiveScopeKey: offerScopeKeyMock,
  },
  // whatsappNumber/formatOfferAmount/openWhatsAppComposeTab/
  // navigateWhatsAppComposeTab are re-exported from this module and
  // imported directly by residual-capability-tools.ts/payment-reminder-
  // conversation-extension.ts — provide harmless pass-through stubs so
  // those imports don't break.
  whatsappNumber: vi.fn((phone: string) => phone),
  formatOfferAmount: vi.fn(() => "0"),
  openWhatsAppComposeTab: vi.fn(() => null),
  navigateWhatsAppComposeTab: vi.fn(),
}));

// Second incident this same shared rule fixes (see
// isProvisionalConversationHandoff, conversation-extension-handoff.ts): the
// customer-create coordinator recognizing an actionable UPDATE it has no
// execution path for and reporting OBSERVED. This used to be a final
// HANDOFF blocked only by the generic-orchestration fallback (retired —
// see Legacy Conversation Ownership & Dangling Stream Closure; it is no
// longer registered in the real `extensions` array, so it is not mocked
// here anymore either) getting a chance to execute it for real. Now the
// weak claim always falls through as the provisional final answer — see
// the dedicated test below.
import {
  executeActiveConversationExtension,
  resetConversationExtensionTurnCacheForTests,
} from "../active-conversation-extension";

const customerHandoffShape = {
  domain: "customers", operation: "ATTACHMENT", outcomeCode: "ATTACHMENT_NOTIFY_DELIVERED", resultStatus: "EXECUTED",
  entityResolution: "RESOLVED", fieldNames: [], fieldCount: 0, mutationPerformed: true,
  navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
  certainty: "CERTAIN", captureOutcome: "NONE", entityId: "c-1", entityDisplayName: "Atlas", entityDomain: "customers",
};

describe("executeActiveConversationExtension — shared arbitration", () => {
  beforeEach(() => {
    offerScopeKeyMock.mockReturnValue("offers-management:test");
    customerScopeKeyMock.mockReturnValue("customers-management:test");
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: customerHandoffShape });
  });

  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.clearAllMocks();
  });

  it("lets the correct later owner claim a turn an earlier domain's entity resolution came back NOT_FOUND for", async () => {
    offerExecuteMock.mockResolvedValue({
      status: "HANDOFF",
      handoff: {
        domain: "quotes", operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED",
        entityResolution: "NOT_FOUND", fieldNames: [], fieldCount: 0, mutationPerformed: false,
        navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
        certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "quotes",
      },
    });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonunu güncelle", source: "written", turnKey: "arbitration-1" });

    expect(offerExecuteMock).toHaveBeenCalledTimes(1);
    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "HANDOFF", handoff: customerHandoffShape, duplicate: false });
  });

  it("falls back to the provisional NOT_FOUND clarification when nothing later actually claims the turn", async () => {
    const notFoundHandoff = {
      domain: "quotes", operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_CUSTOMER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED",
      entityResolution: "NOT_FOUND", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "quotes",
    };
    offerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: notFoundHandoff });
    customerExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });

    const result = await executeActiveConversationExtension({ utterance: "Bilinmeyen Firma'nın telefonu 555 olsun", source: "written", turnKey: "arbitration-fallback" });

    expect(result).toEqual({ status: "HANDOFF", handoff: notFoundHandoff, duplicate: false });
  });

  it("does NOT continue past a genuinely ambiguous claim from the correct domain (AMBIGUOUS, not NOT_FOUND)", async () => {
    const ambiguousHandoff = {
      domain: "quotes", operation: "NAVIGATE", outcomeCode: "OFFER_OPEN_CUSTOMER_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED",
      entityResolution: "AMBIGUOUS", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "quotes",
    };
    offerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: ambiguousHandoff });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın teklifini aç", source: "written", turnKey: "arbitration-2" });

    expect(offerExecuteMock).toHaveBeenCalledTimes(1);
    expect(customerExecuteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "HANDOFF", handoff: ambiguousHandoff, duplicate: false });
  });

  it("does NOT treat an OBSERVED query answer as a provisional claim — it wins immediately, the generic fallback never runs", async () => {
    const queryHandoff = {
      domain: "quotes", operation: "QUERY", outcomeCode: "OFFER_LOOKUP_FOUND", resultStatus: "OBSERVED",
      entityResolution: "RESOLVED", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: "quote-atlas", entityDisplayName: "Atlas", entityDomain: "quotes",
    };
    offerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: queryHandoff });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın teklifi ne durumda?", source: "written", turnKey: "arbitration-5" });

    expect(offerExecuteMock).toHaveBeenCalledTimes(1);
    expect(customerExecuteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "HANDOFF", handoff: queryHandoff, duplicate: false });
  });
});
