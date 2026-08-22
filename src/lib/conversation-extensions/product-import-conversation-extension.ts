import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { productHandoff } from "./conversation-extension-handoff";
import { matchesDomainImportTrigger } from "./import-trigger-match";

const DOMAIN_STEM = /ürün|hizmet/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/products/import", source, correlationId, expectedSurfaceAuthorityKey: "products.import.page" });
  }
}

export const productImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `product-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!matchesDomainImportTrigger(text, DOMAIN_STEM)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: productHandoff({
        operation: "NAVIGATE",
        outcomeCode: "PRODUCT_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
