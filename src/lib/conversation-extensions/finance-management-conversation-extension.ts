import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { financeHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

const SHOW = /^(?:finansal\s+durumu|finans[ıi])\s+g[oö]ster[?!.]?$/iu;
function navigate(source: ConversationExtensionSource, correlationId: string): void { if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/finance", source, correlationId, expectedSurfaceAuthorityKey: "workspace.finance.page" }); }
export const financeManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `finance-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    if (!SHOW.test(utterance.trim())) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: financeHandoff({ operation: "NAVIGATE", outcomeCode: "FINANCE_SUMMARY_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
  },
};
