import { describe, expect, it } from "vitest";
import { buildUniversalHandoffMessage, buildUnconfirmedMutationIntentMessage, shouldAppendProgressiveEnrichment } from "../conversation-extension-handoff-message";
import { deliveryHandoff, supplierHandoff, validateConversationExtensionHandoff } from "../conversation-extension-handoff";

describe("supplier handoff field allowlist", () => {
  it.each(["website", "riskNotes", "status"])("accepts the supplier edit field %s", (fieldName) => {
    const handoff = supplierHandoff({
      operation: "UPDATE",
      outcomeCode: "SUPPLIER_EDIT_EXECUTED",
      resultStatus: "EXECUTED",
      fieldNames: [fieldName],
      mutationPerformed: true,
    });

    expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
  });
});

describe("confirmed mutation response authority", () => {
  const mutationAndNavigation = deliveryHandoff({
    operation: "UPDATE",
    outcomeCode: "DELIVERY_EDIT_EXECUTED",
    resultStatus: "EXECUTED",
    mutationPerformed: true,
    navigationRequested: true,
    navigationStatus: "COMPLETED",
  });

  it("confirms the mutation before mentioning completed navigation", () => {
    const message = buildUniversalHandoffMessage(mutationAndNavigation);
    expect(message).toBe("İşlemi tamamladım ve ilgili kaydı çalışma alanında açtım.");
    expect(message).not.toBe("İlgili kaydı çalışma alanında açtım, yukarıda inceleyebilirsiniz.");
  });

  it("prevents independently generated enrichment from following a confirmed mutation", () => {
    expect(shouldAppendProgressiveEnrichment(mutationAndNavigation)).toBe(false);
    expect(shouldAppendProgressiveEnrichment(deliveryHandoff({ operation: "QUERY", outcomeCode: "DELIVERY_LISTED", resultStatus: "OBSERVED" }))).toBe(true);
    expect(shouldAppendProgressiveEnrichment(null)).toBe(true);
  });

  // Live production bug: a completed NAVIGATE-only handoff (e.g. the 9
  // Excel/CSV import extensions — no mutation, just "I opened it for you")
  // still got a second, independently generated enrichment paragraph
  // appended, and that second call — never shown the handoff — reliably
  // contradicted the first sentence ("İlgili kaydı çalışma alanında
  // açtım..." immediately followed by "Excel dosyasının tam adı ve
  // içeriğini... belirtmeniz gerekiyor"). Navigation-only completion must
  // be just as final as a mutation.
  it("prevents independently generated enrichment from following a completed navigation-only handoff", () => {
    const navigationOnly = deliveryHandoff({
      operation: "NAVIGATE",
      outcomeCode: "DELIVERY_IMPORT_OPENED",
      resultStatus: "EXECUTED",
      mutationPerformed: false,
      navigationRequested: true,
      navigationStatus: "COMPLETED",
    });
    expect(shouldAppendProgressiveEnrichment(navigationOnly)).toBe(false);
  });
});

// Living Workspace Determinism Operation — Gap 2: no conversation extension
// claimed this turn (no handoff at all), yet the turn still looks
// record-mutation-shaped. These tests prove the gate is evidence-based
// (real handoff presence, existing conversation-understanding fields) and
// never content-scans the model's own generated text.
describe("buildUnconfirmedMutationIntentMessage", () => {
  it("blocks an unconfirmed mutation claim when business-navigation explicitly resolved a create-with-Surface domain and the Agent is not eligible either (test B: disagreement)", () => {
    const message = buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      shouldInvokeExecutiveBrain: false,
      mutationSurfaceResolved: true,
    });
    expect(message).not.toBeNull();
  });

  // Legacy Conversation Ownership & Dangling Stream Closure: this used to
  // also fire for any "kayit_islem" + shouldInvokeExecutiveBrain utterance
  // with no handoff and no MUTATION_SURFACE_RESOLVED evidence — silently
  // pre-empting the METRIX Executive Agent, which is now exactly the real
  // owner for this case (shouldInvokeExecutiveBrain is what routes the turn
  // to it). No handoff + no Surface resolution must now fall through to the
  // Agent instead of a generic "couldn't verify" message.
  it("no longer fires for a plain natural-language mutation intent with no MUTATION_SURFACE_RESOLVED evidence — the Executive Agent owns this turn instead (test E, Task/Invoice)", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: false,
    })).toBeNull();
  });

  // Second live regression (2026-09-05): "'İkinci görüşmeyi planla' başlıklı
  // bir görev oluştur." resolves task.create -> MUTATION_SURFACE_RESOLVED,
  // which used to still fire this message even though shouldInvokeExecutiveBrain
  // was true and the Agent was about to run — proving the guard must check
  // Agent eligibility directly, as a blanket exit ahead of every clause, not
  // just the userMotivation-specific one.
  it("no longer fires for a create-with-Surface resolution either when the Agent is eligible — a single Agent-eligibility check covers every clause", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      shouldInvokeExecutiveBrain: true,
      mutationSurfaceResolved: true,
    })).toBeNull();
  });

  it("never fires when a real handoff exists, regardless of other signals (test F: real success preserved)", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: true,
      shouldInvokeExecutiveBrain: false,
      mutationSurfaceResolved: true,
    })).toBeNull();
  });

  it("never fires for read-intent turns with no Surface resolution (test G)", () => {
    expect(buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      shouldInvokeExecutiveBrain: false,
      mutationSurfaceResolved: false,
    })).toBeNull();
  });

  it("returns an honest, non-fabricating message for the Surface-resolved case when the Agent is not eligible, not empty content", () => {
    const message = buildUnconfirmedMutationIntentMessage({
      hasHandoff: false,
      shouldInvokeExecutiveBrain: false,
      mutationSurfaceResolved: true,
    });
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/yetkim|erişimim|erisimim/iu);
    expect(message).not.toMatch(/olu[şs]turdum|kaydettim|tamamladım|g[öo]nderdim/iu);
  });
});
