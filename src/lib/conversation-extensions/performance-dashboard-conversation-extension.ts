import type { ConversationExtension, ConversationExtensionSource } from "./conversation-extension-contract";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";
import { goalHandoff } from "./conversation-extension-handoff";

// Diacritic-tolerant — "performans", "hedef" + "pano/panel/dashboard".
const PERFORMANCE_DASHBOARD_TRIGGER = /performans\s+(pano|panel|dashboard)|(pano|panel|dashboard)\s*[ıi]?n[ıi]?\s*g[oö]ster|hedef\s+gerçekle[sş]me\s+(pano|panel)/iu;

function navigate(source: ConversationExtensionSource, correlationId: string) {
  if (typeof window !== "undefined") {
    void dispatchConversationNavigation({ route: "/metrix/performance", source, correlationId, expectedSurfaceAuthorityKey: "goals.performance.page" });
  }
}

export const performanceDashboardConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `performance-dashboard:${window.location.pathname}`; },
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!PERFORMANCE_DASHBOARD_TRIGGER.test(text)) return { status: "NOT_HANDLED", handoff: null };
    navigate(source, correlationId);
    return {
      status: "HANDOFF",
      handoff: goalHandoff({
        operation: "NAVIGATE",
        outcomeCode: "PERFORMANCE_DASHBOARD_OPENED",
        resultStatus: "EXECUTED",
        entityResolution: "NOT_REQUIRED",
        navigationRequested: true,
        navigationStatus: "COMPLETED",
      }),
    };
  },
};
