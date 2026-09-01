import { describe, expect, it } from "vitest";

import { buildManagementIntentUnderstanding, recognizeManagementIntent } from "../management-intent";
import { resolveBusinessNavigation } from "@/lib/executive-request-resolution";
import { resolveExecutiveDirective } from "@/lib/ai/executive-directive";
import { adaptExecutiveDirectiveToExecutiveBehaviorPlan, projectExecutiveConversationGuidance } from "@/lib/ai/living-executive-presence";

describe("deterministic collection-performance intent", () => {
  it.each([
    ["Bu ay tahsilat performansımız nasıl?", "CURRENT_MONTH"],
    ["Bu ayki tahsilat performansımız nasıl?", "CURRENT_MONTH"],
    ["Bu ay tahsilatlar nasıl?", "CURRENT_MONTH"],
    ["Geçen ay tahsilat performansımız nasıldı?", "PREVIOUS_MONTH"],
    ["Geçen ayki tahsilat performansı nasıl?", "PREVIOUS_MONTH"],
  ] as const)("recognizes %s", (message, period) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "COLLECTION_PERFORMANCE", period });
    expect(buildManagementIntentUnderstanding(intent!)).toMatchObject({
      managementIntent: { intent: "COLLECTION_PERFORMANCE", period },
      shouldAskClarification: false,
      shouldInvokeExecutiveBrain: false,
      suggestedHandling: "answer_only",
      businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null },
    });
  });

  it.each([
    "Bekleyen tahsilatlarımı göster",
    "Vadesi geçen ödemeleri aç",
    "Ödenmemiş tahsilatlar hangileri?",
    "Atlas'ın ödeme durumu nedir?",
  ])("preserves Payment-state semantics for %s", (message) => {
    expect(recognizeManagementIntent(message)).toBeNull();
  });

  it("is independent of prior Payment and navigation-failure history", () => {
    const message = "Bu ay tahsilat performansımız nasıl?";
    const histories = [
      [],
      ["Sistemde kayıtlı 3 tahsilat var."],
      ["İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?"],
    ];
    histories.forEach(() => {
      const intent = recognizeManagementIntent(message);
      expect(intent).toEqual({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" });
      expect(buildManagementIntentUnderstanding(intent!).businessNavigation).toEqual({ operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null });
    });
  });

  it("projects non-clarifying Executive guidance for the exact production prompt", () => {
    const intent = recognizeManagementIntent("Bu ay tahsilat performansımız nasıl?")!;
    const understanding = buildManagementIntentUnderstanding(intent);
    const directive = resolveExecutiveDirective({ understanding });
    const behavior = adaptExecutiveDirectiveToExecutiveBehaviorPlan(directive);
    expect(directive.authorityMode).toBe("RESPONSE_ONLY");
    expect(behavior.primaryBehavior).toBe("EXPLAIN");
    expect(behavior.questionPolicy).toBe("NONE");
    expect(projectExecutiveConversationGuidance(behavior)).toContain("EXECUTIVE CONVERSATION GUIDANCE");
  });

  it("projects the canonical collections Workspace without changing Settlement answer authority", async () => {
    const intent = recognizeManagementIntent("Bu ay tahsilat performansımız nasıl?")!;
    const understanding = buildManagementIntentUnderstanding(intent);
    await expect(resolveBusinessNavigation({
      understanding,
      activeWorkspaceContext: { domain: "payment", businessSurface: "payment-list", entityType: "Payment", entityId: null, title: "Tahsilatlar" },
      listCustomers: async () => [],
      listDomainRecords: async () => ({ recordCount: 3, recordNames: ["PAID", "PENDING", "OVERDUE"] }),
    })).resolves.toMatchObject({ status: "RESOLVED", descriptor: { domain: "payment", kind: "payment.list" } });
  });
});
