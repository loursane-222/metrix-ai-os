import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { stockHandoff } from "./conversation-extension-handoff";

const IMPORT = /^(?:excel|csv)(['’]?[dt]en)?\s+stok\s+(?:aktar|içe\s+aktar|yükle)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/stock/import", source, correlationId, expectedSurfaceAuthorityKey: "stock.import.page" });
  }
}

export const stockImportConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `stock-import:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!IMPORT.test(text)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: stockHandoff({
        operation: "NAVIGATE",
        outcomeCode: "STOCK_IMPORT_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
