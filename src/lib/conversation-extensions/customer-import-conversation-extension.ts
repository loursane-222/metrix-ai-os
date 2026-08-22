import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { customerHandoff } from "./conversation-extension-handoff";
import { matchesDomainImportTrigger } from "./import-trigger-match";

const DOMAIN_STEM = /müşteri/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/customers/import", source, correlationId, expectedSurfaceAuthorityKey: "customers.import.page" });
  }
}

export const customerImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `customer-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!matchesDomainImportTrigger(text, DOMAIN_STEM)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: customerHandoff({
        operation: "NAVIGATE",
        outcomeCode: "CUSTOMER_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
