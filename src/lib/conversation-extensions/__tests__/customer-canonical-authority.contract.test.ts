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

  it("does not stream a duplicate navigation after the extension completed create navigation", () => {
    expect(canonicalChatRouteSource).toContain('conversationExtensionHandoff?.operation === "CREATE"');
    expect(canonicalChatRouteSource).toContain('conversationExtensionHandoff.navigationStatus === "COMPLETED"');
    expect(canonicalChatRouteSource).toContain('businessNavigationResolution.status === "RESOLVED" && !extensionNavigationCompleted');
  });
});
