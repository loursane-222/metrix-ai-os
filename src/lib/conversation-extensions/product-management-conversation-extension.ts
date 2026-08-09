import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { productHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

const LIST_PRODUCTS = /^(?:[uü]r[uü]nleri\s+g[oö]ster|[uü]r[uü]n\s+listesi)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/products", source, correlationId, expectedSurfaceAuthorityKey: "workspace.product.page" });
}

export const productManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `product-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    if (!LIST_PRODUCTS.test(utterance.trim())) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: productHandoff({ operation: "NAVIGATE", outcomeCode: "PRODUCT_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
  },
};
