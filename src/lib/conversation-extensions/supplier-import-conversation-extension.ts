import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { supplierHandoff } from "./conversation-extension-handoff";

const IMPORT = /^(?:excel|csv)(['’]?[dt]en)?\s+tedarikçi\s+(?:aktar|içe\s+aktar|yükle)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/suppliers/import", source, correlationId, expectedSurfaceAuthorityKey: "suppliers.import.page" });
  }
}

export const supplierImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `supplier-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!IMPORT.test(text)) return { status: "NOT_HANDLED", handoff: null };
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
