import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { paymentHandoff } from "./conversation-extension-handoff";

const IMPORT = /^(?:excel|csv)('?[dt]en)?\s+tahsilat\s+(?:aktar|içe\s+aktar|yükle)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/collections/import", source, correlationId, expectedSurfaceAuthorityKey: "payments.import.page" });
  }
}

export const paymentImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `payment-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!IMPORT.test(text)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: paymentHandoff({
        operation: "NAVIGATE",
        outcomeCode: "PAYMENT_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
