import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { supplierHandoff } from "./conversation-extension-handoff";
import { matchesDomainImportTrigger } from "./import-trigger-match";

const DOMAIN_STEM = /tedarikçi/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/suppliers/import", source, correlationId, expectedSurfaceAuthorityKey: "suppliers.import.page" });
  }
}

export const supplierImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `supplier-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!matchesDomainImportTrigger(text, DOMAIN_STEM)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: supplierHandoff({
        operation: "NAVIGATE",
        outcomeCode: "SUPPLIER_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
