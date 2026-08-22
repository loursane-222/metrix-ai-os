import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { productionHandoff } from "./conversation-extension-handoff";
import { matchesDomainImportTrigger } from "./import-trigger-match";

const DOMAIN_STEM = /üretim/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/production/import", source, correlationId, expectedSurfaceAuthorityKey: "production.import.page" });
  }
}

export const productionImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `production-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!matchesDomainImportTrigger(text, DOMAIN_STEM)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: productionHandoff({
        operation: "NAVIGATE",
        outcomeCode: "PRODUCTION_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
