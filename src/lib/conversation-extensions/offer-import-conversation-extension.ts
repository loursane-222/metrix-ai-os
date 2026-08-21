import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { quoteHandoff } from "./conversation-extension-handoff";

const IMPORT = /^(?:excel|csv)('?[dt]en)?\s+teklif\s+(?:aktar|içe\s+aktar|yükle)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/offers/import", source, correlationId, expectedSurfaceAuthorityKey: "offers.import.page" });
  }
}

export const offerImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `offer-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!IMPORT.test(text)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: quoteHandoff({
        operation: "NAVIGATE",
        outcomeCode: "OFFER_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
