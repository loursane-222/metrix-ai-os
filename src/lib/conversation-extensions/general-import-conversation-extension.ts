import type { ConversationExtension } from "./conversation-extension-contract";
import { customerHandoff } from "./conversation-extension-handoff";
import { matchesDomainlessImportTrigger } from "./import-trigger-match";

// Matches "excel'den içe aktar" / "excelden aktar" / "csv yükle" etc. — the
// same source+verb signal the 9 domain-specific import extensions
// (customer-import-conversation-extension.ts and its siblings) already
// match, but WITHOUT a domain word. Those 9 extensions are tried first (see
// active-conversation-extension.ts's array order) and win whenever the
// domain is named, so this only ever fires on the genuinely ambiguous case.
//
// Root cause this closes: with no extension matching a domain-less phrase,
// the turn fell through to free-form generation with zero structured
// evidence attached, and the model fabricated "Excel/CSV import isn't
// connected" — a real capability that had just shipped — and steered the
// user toward the unrelated (and already-broken-for-.xlsx) document-upload
// flow. Returning a CLARIFICATION_REQUIRED handoff here, the same pattern
// already used for ambiguous-entity turns, gives the model real evidence to
// narrate instead of a blank slate to guess from.

export const generalImportConversationExtension: ConversationExtension = {
  // Must be non-null: executeActiveConversationExtension only tries
  // extensions whose getActiveScopeKey() !== null (see
  // active-conversation-extension.ts). Unconditional null silently
  // excluded this extension from ever running — found while auditing the
  // same pattern for payment-reminder/orchestration's new extensions,
  // fixed here since it's the exact same bug in the same subsystem.
  getActiveScopeKey() { return typeof window === "undefined" ? null : "general-import"; },
  async execute(utterance) {
    const text = utterance.trim();
    if (!matchesDomainlessImportTrigger(text)) return { status: "NOT_HANDLED", handoff: null };
    return {
      status: "HANDOFF",
      handoff: customerHandoff({
        operation: "NAVIGATE",
        outcomeCode: "IMPORT_DOMAIN_CLARIFICATION_REQUIRED",
        resultStatus: "CLARIFICATION_REQUIRED",
        entityResolution: "AMBIGUOUS",
        navigationRequested: false,
        navigationStatus: "NOT_REQUESTED",
      }),
    };
  },
};
