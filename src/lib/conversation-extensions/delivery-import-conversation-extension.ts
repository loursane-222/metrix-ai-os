import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { deliveryHandoff } from "./conversation-extension-handoff";
import { matchesDomainImportTrigger } from "./import-trigger-match";

const DOMAIN_STEM = /irsaliye/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/deliveries/import", source, correlationId, expectedSurfaceAuthorityKey: "deliveries.import.page" });
  }
}

export const deliveryImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `delivery-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!matchesDomainImportTrigger(text, DOMAIN_STEM)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: deliveryHandoff({
        operation: "NAVIGATE",
        outcomeCode: "DELIVERY_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
