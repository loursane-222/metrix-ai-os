import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { goalHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

const LIST_GOALS = /^(?:hedeflerimizi\s+g[oö]ster|hedef\s+listesini\s+g[oö]ster)[.!]?$/iu;

function navigate(source: ConversationExtensionSource, correlationId: string): void {
  if (typeof window !== "undefined") void dispatchConversationNavigation({ route: "/metrix/goals", source, correlationId, expectedSurfaceAuthorityKey: "workspace.goal.page" });
}

export const goalManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `goal-management:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    if (!LIST_GOALS.test(utterance.trim())) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return { status: "HANDOFF", handoff: goalHandoff({ operation: "NAVIGATE", outcomeCode: "GOAL_LIST_OPENED", resultStatus: "EXECUTED", entityResolution: "NOT_REQUIRED", navigationRequested: true, navigationStatus: "COMPLETED" }) };
  },
};
