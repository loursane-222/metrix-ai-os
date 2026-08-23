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

  it("never lets business-navigation independently navigate once any extension already produced a handoff for this turn", () => {
    // Single Executive Intelligence, generalized (Büyük Resim Operasyonu
    // Faz 5, A3): the previous guard here only suppressed business-navigation
    // for handoffs that were themselves a completed CREATE-navigation, so
    // any other extension's handoff (a management action, a send, an
    // orchestration run, ...) could still be silently overridden by
    // business-navigation's own, independent classification of the same
    // utterance navigating somewhere else. Any handoff at all is now the
    // turn's sole authority.
    expect(canonicalChatRouteSource).toContain('businessNavigationResolution.status === "RESOLVED" && !conversationExtensionHandoff');
    expect(canonicalChatRouteSource).not.toContain("extensionNavigationCompleted");
  });
});
