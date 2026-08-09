import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { accountingHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

const SHOW_ACCOUNTING = /^(?:muhasebe\s+[oö]zetini\s+g[oö]ster|nakit\s+durumumuz\s+ne|finansal\s+[oö]zetimizi\s+g[oö]ster)[?!.]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/accounting", source, correlationId, expectedSurfaceAuthorityKey: "workspace.accounting.page" });
}

export const accountingManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `accounting-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    if (!SHOW_ACCOUNTING.test(utterance.trim())) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: accountingHandoff({ operation: "NAVIGATE", outcomeCode: "ACCOUNTING_SUMMARY_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
  },
};
