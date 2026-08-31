import type { ConversationExtension } from "./conversation-extension-contract";
import { financeHandoff } from "./conversation-extension-handoff";
import { clearActiveDocumentAttachment, getActiveDocumentAttachment } from "@/lib/documents/document-attachment-session";
import type { DocumentDomain } from "@/lib/documents/document-classifier";

// Deliberately minimal — this is NOT a Living Workspace surface owner (no
// mounted draft screen, no reset()-tracked ownership invalidation): it only
// triggers classify+extract for an already-uploaded document and reports
// the outcome. Reviewing/approving the resulting BusinessCandidate happens
// through the existing, unmodified /api/business-candidates/* surface —
// exactly the "reuse existing review mechanism without a UI redesign"
// invariant Phase 14 requires. A UI affordance to attach a *non-customer*
// document from chat does not exist yet (only the customer-document flow
// has a drag-and-drop entry point today) — building one is new UI surface,
// which is explicitly out of scope here; this extension only fires once an
// attachment reference already exists in this browser session (e.g. from a
// direct API caller, or a future upload affordance).
// Real usage isn't one uniform grammatical shape — the roadmap's own three
// examples ("bunu gider olarak kaydet", "bu tedarikçi faturasını işle", "bu
// çeki kaydet") are three different sentence structures, not variations on
// one template. So this gates on three independent, ANDed signals instead
// of one rigid regex: the utterance (1) refers to "this" attached document,
// (2) ends in a save/process verb, and (3) names one of the fixed document
// domains somewhere in it. All three together is narrow enough to avoid
// misfiring on unrelated commands, without forcing every phrasing through
// the same template.
const THIS_DOCUMENT_REFERENCE = /^(?:bunu|bu\s)/iu;
const SAVE_VERB = /\b(?:kaydet|işle)[.!]?$/iu;

// Plain (unanchored) substring matches are fine for the longer, more
// specific phrases below — collision risk is negligible. "çek" is the one
// short enough (3 letters) to collide with unrelated words that merely
// contain it as a substring ("gerçek", "içecek") — JS regex's `\b` doesn't
// treat "ç" as a word character even with the `u` flag, so it can't be used
// here; a real Unicode-aware boundary via lookaround is used instead.
// "senet" (promissory note) softens to "senedi" under the Turkish
// accusative suffix (t→d), so both consonants are matched.
const DOMAIN_PHRASES: ReadonlyArray<{ phrase: RegExp; domain: DocumentDomain }> = [
  { phrase: /gider|masraf|fiş/u, domain: "EXPENSE_RECEIPT" },
  { phrase: /tedarik[çc]i faturas|al[ıi][şs] faturas|sat[ıi]nalma faturas/u, domain: "PURCHASE_INVOICE" },
  { phrase: /sat[ıi][şs] faturas/u, domain: "SALES_INVOICE" },
  { phrase: /(?<![\p{L}\p{N}])[çc]ek(?:i|ini|imi|ler|leri)?(?![\p{L}\p{N}])/u, domain: "CHEQUE" },
  { phrase: /sene[dt]/u, domain: "PROMISSORY_NOTE" },
];

function matchRequestedDomain(utterance: string): DocumentDomain | null {
  const normalized = utterance.trim().toLocaleLowerCase("tr-TR");
  const match = DOMAIN_PHRASES.find((item) => item.phrase.test(normalized));
  return match?.domain ?? null;
}

async function postJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    if (json.ok && json.data !== undefined) return { ok: true, data: json.data };
    return { ok: false, message: json.error?.message ?? "İstek başarısız oldu." };
  } catch { return { ok: false, message: "Bağlantı kurulamadı." }; }
}

export const documentIntelligenceConversationExtension: ConversationExtension = {
  getActiveScopeKey() { return typeof window === "undefined" ? null : `document-intelligence:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();
    if (!THIS_DOCUMENT_REFERENCE.test(text) || !SAVE_VERB.test(text)) return { status: "NOT_HANDLED", handoff: null };
    const requestedDomain = matchRequestedDomain(text);
    if (!requestedDomain) return { status: "NOT_HANDLED", handoff: null };

    const attachment = getActiveDocumentAttachment();
    if (!attachment) {
      return { status: "HANDOFF", handoff: financeHandoff({ operation: "ATTACHMENT", outcomeCode: "DOCUMENT_INTELLIGENCE_NO_ACTIVE_ATTACHMENT", resultStatus: "CLARIFICATION_REQUIRED" }) };
    }

    const classified = await postJson<{ domain: DocumentDomain; confidence: number; needsReview: boolean }>(`/api/documents/attachments/${encodeURIComponent(attachment.attachmentRef)}/classify`);
    if (!classified.ok) {
      return { status: "HANDOFF", handoff: financeHandoff({ operation: "ATTACHMENT", outcomeCode: "DOCUMENT_INTELLIGENCE_CLASSIFICATION_FAILED", resultStatus: "FAILED" }) };
    }
    // Requirement: user text must never silently override document
    // evidence. If what the user asked for doesn't match what the document
    // itself was independently classified as (or the classifier wasn't
    // confident enough to say anything at all), this stops and asks for
    // human review instead of picking either interpretation.
    if (classified.data.needsReview || classified.data.domain !== requestedDomain) {
      return {
        status: "HANDOFF",
        handoff: financeHandoff({
          operation: "ATTACHMENT",
          outcomeCode: "DOCUMENT_INTELLIGENCE_CLASSIFICATION_MISMATCH",
          resultStatus: "CLARIFICATION_REQUIRED",
          entityResolution: "UNKNOWN",
        }),
      };
    }

    const extracted = await postJson<{ build: { status: "CREATED"; candidateId: string } | { status: "NEEDS_REVIEW"; reason: string } }>(`/api/documents/attachments/${encodeURIComponent(attachment.attachmentRef)}/extract`);
    if (!extracted.ok) {
      return { status: "HANDOFF", handoff: financeHandoff({ operation: "ATTACHMENT", outcomeCode: "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED", resultStatus: "FAILED" }) };
    }
    if (extracted.data.build.status === "NEEDS_REVIEW") {
      return { status: "HANDOFF", handoff: financeHandoff({ operation: "ATTACHMENT", outcomeCode: `DOCUMENT_INTELLIGENCE_${extracted.data.build.reason}`, resultStatus: "CLARIFICATION_REQUIRED" }) };
    }
    return {
      status: "HANDOFF",
      handoff: financeHandoff({
        operation: "ATTACHMENT",
        outcomeCode: "DOCUMENT_INTELLIGENCE_CANDIDATE_READY",
        resultStatus: "APPROVAL_REQUIRED",
        entityResolution: "RESOLVED",
        approvalRequired: true,
        mutationPerformed: false,
      }),
    };
  },
  reset() { clearActiveDocumentAttachment(); },
};
