import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { customerHandoff, validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const chatSource = readFileSync(fileURLToPath(new URL("../../../components/metrix-tab/MetrixChatTab.tsx", import.meta.url)), "utf8");
const coordinatorSource = readFileSync(fileURLToPath(new URL("../../customers/customer-create-conversation-coordinator.ts", import.meta.url)), "utf8");
const extensionContractSource = readFileSync(fileURLToPath(new URL("../conversation-extension-contract.ts", import.meta.url)), "utf8");
const canonicalChatRouteSource = readFileSync(fileURLToPath(new URL("../../../app/api/ai/chat/route.ts", import.meta.url)), "utf8");

describe("customer canonical conversation authority", () => {
  it("uses a value-free structured handoff contract", () => {
    const handoff = customerHandoff({
      operation: "ENRICH",
      outcomeCode: "CANONICAL_CUSTOMER_EVIDENCE",
      resultStatus: "OBSERVED",
      entityResolution: "PRESENT",
      fieldNames: ["currency"],
      certainty: "PROBABLE_CONTEXT_PRESENT",
      captureOutcome: "FIELDS_CAPTURED",
    });
    expect(validateConversationExtensionHandoff(handoff)).toEqual(handoff);
    expect(validateConversationExtensionHandoff({ ...handoff, fieldNames: ["Atlas"], fieldCount: 1 })).toBeNull();
    expect(JSON.stringify(handoff)).not.toContain("EUR");
  });

  it("always continues extension evidence through the canonical chat stream", () => {
    expect(chatSource).toContain("body.conversationExtensionHandoff = extensionResult.handoff");
    expect(chatSource).toContain('fetch("/api/ai/chat"');
    expect(chatSource).not.toContain("extensionResult.message");
    expect(chatSource).not.toContain("handoffHandledExtensionVoice");
  });

  it("removes natural-language response ownership from the common extension contract and create coordinator", () => {
    expect(extensionContractSource).not.toMatch(/\bmessage\s*:/);
    expect(coordinatorSource).not.toContain("Yeni müşteri ekranını şu anda açamadım");
    expect(coordinatorSource).not.toMatch(/message\s*:/);
  });

  it("never lets business-navigation independently navigate once any REAL extension handoff already produced an outcome for this turn", () => {
    // Single Executive Intelligence, generalized (Büyük Resim Operasyonu
    // Faz 5, A3): the previous guard here only suppressed business-navigation
    // for handoffs that were themselves a completed CREATE-navigation, so
    // any other extension's handoff (a management action, a send, an
    // orchestration run, ...) could still be silently overridden by
    // business-navigation's own, independent classification of the same
    // utterance navigating somewhere else. Any handoff at all was made the
    // turn's sole authority.
    //
    // Narrowed once (Navigation Truth operation, premature-clarification/
    // false-navigation-success production regression): a domain-blind
    // orchestration CLARIFICATION_REQUIRED ("I couldn't map this to a
    // business action") structurally cannot represent a navigation
    // decision — Action Registry has no navigate concept — so it alone is
    // exempted via authoritativeConversationExtensionHandoff /
    // isNavigationBlindHandoff. Every other handoff (a real domain
    // extension's own decision, or any EXECUTED/FAILED/APPROVAL_REQUIRED
    // outcome, or a domain-informed CLARIFICATION_REQUIRED) still vetoes
    // business-navigation exactly as this test originally proved.
    expect(canonicalChatRouteSource).toContain('businessNavigationResolution.status === "RESOLVED" && !authoritativeConversationExtensionHandoff');
    expect(canonicalChatRouteSource).toContain("isNavigationBlindHandoff(conversationExtensionHandoff) ? null : conversationExtensionHandoff");
    expect(canonicalChatRouteSource).not.toContain("extensionNavigationCompleted");
  });
});
