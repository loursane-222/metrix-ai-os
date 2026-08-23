import type { ConversationExtension } from "./conversation-extension-contract";
import { companyHandoff } from "./conversation-extension-handoff";

// Whole-business assessment requests only — a single-domain question
// ("hedeflerim ne durumda", "gelir gider nasıl") already has its own,
// more specific extension (goalManagementConversationExtension,
// financeManagementConversationExtension, ...) earlier in the array; this
// one is for "işletmem nasıl gidiyor" style requests spanning all of them.
//
// Unlike other extensions, this one does no client-side fetch: it only
// detects the trigger and hands off. The real computation
// (buildBusinessOverview) runs server-side in route.ts under outcomeCode
// BUSINESS_OVERVIEW_READY — the same "compute at narration time, inject as
// evidence" pattern business-navigation already uses for CUSTOMER_LOOKUP's
// detailSnapshot — because the handoff contract itself has no field for an
// arbitrary evidence payload.
const WHOLE_BUSINESS_STEM = /işletme(m|miz)?(in)?\s+(genel\s+)?(durum|sağlığ)|genel\s+(görünüm|değerlendirme|rapor)|işimiz\s+nas[ıi]l\s+gidiyor|işletme\s+sağlığ/iu;

export const businessOverviewConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `business-overview:${window.location.pathname}`; },
  async execute(utterance) {
    if (!WHOLE_BUSINESS_STEM.test(utterance.trim())) return { status: "NOT_HANDLED", handoff: null };

    return {
      status: "HANDOFF",
      handoff: companyHandoff({
        operation: "QUERY",
        outcomeCode: "BUSINESS_OVERVIEW_READY",
        resultStatus: "OBSERVED",
        entityResolution: "NOT_REQUIRED",
      }),
    };
  },
};
