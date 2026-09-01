import { describe, expect, it } from "vitest";

import { buildManagementIntentUnderstanding, recognizeManagementIntent } from "../management-intent";
import { resolveBusinessNavigation } from "@/lib/executive-request-resolution";
import { resolveExecutiveDirective } from "@/lib/ai/executive-directive";
import { adaptExecutiveDirectiveToExecutiveBehaviorPlan, projectExecutiveConversationGuidance } from "@/lib/ai/living-executive-presence";

describe("deterministic collection-performance intent", () => {
  it.each([
    "Tahsilatlar neden düştü?",
    "Bu ay tahsilatlar neden arttı?",
    "Bu ay geçen aya göre düşüşe en çok hangi müşteriler katkıda bulundu?",
    "Tahsilattaki düşüş nereden geliyor?",
  ])("recognizes deterministic collection drivers: %s", (message) => {
    expect(recognizeManagementIntent(message)).toEqual({ intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" });
  });

  it.each([
    "Hedefe göre ne kadar gerideyiz?",
    "Bu ay tahsilat hedefimizin ne kadarını gerçekleştirdik?",
  ])("recognizes deterministic collection target position: %s", (message) => {
    expect(recognizeManagementIntent(message)).toEqual({ intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" });
  });

  it("keeps repeated driver and target turns independent of history", () => {
    const cases = [
      ["Bu ay tahsilatlar neden düştü?", { intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" }],
      ["Hedefe göre ne kadar gerideyiz?", { intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" }],
    ] as const;
    for (const [message, expected] of cases) {
      [[], ["Çalışma alanını açamadım."], ["3 bekleyen tahsilat var."]].forEach(() => expect(recognizeManagementIntent(message)).toEqual(expected));
    }
  });

  it.each([
    ["Bu ay geçen aya göre tahsilatlar nasıl?", "CURRENT_MONTH", "PREVIOUS_MONTH"],
    ["Geçen aya kıyasla tahsilatlar nasıl?", "CURRENT_MONTH", "PREVIOUS_MONTH"],
    ["Bu hafta önceki haftaya göre tahsilat ne durumda?", "CURRENT_WEEK", "PREVIOUS_WEEK"],
  ] as const)("recognizes collection comparison: %s", (message, primaryPeriod, comparablePeriod) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "COLLECTION_COMPARISON", primaryPeriod, comparablePeriod });
    expect(buildManagementIntentUnderstanding(intent!)).toMatchObject({
      shouldAskClarification: false,
      shouldInvokeExecutiveBrain: false,
      suggestedHandling: "answer_only",
      businessNavigation: { operation: "NAVIGATE", domain: "payment", target: "list" },
    });
  });

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

  it("keeps an explicit comparison stable across repeated turns and history", () => {
    const message = "Bu ay geçen aya göre tahsilatlar nasıl?";
    [[], ["3 bekleyen tahsilat var."], ["Çalışma alanını açamadım."]].forEach(() => {
      expect(recognizeManagementIntent(message)).toEqual({
        intent: "COLLECTION_COMPARISON",
        primaryPeriod: "CURRENT_MONTH",
        comparablePeriod: "PREVIOUS_MONTH",
      });
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

  it("projects non-clarifying guidance and canonical navigation for comparison", async () => {
    const understanding = buildManagementIntentUnderstanding(recognizeManagementIntent("Bu ay geçen aya göre tahsilatlar nasıl?")!);
    const directive = resolveExecutiveDirective({ understanding });
    const behavior = adaptExecutiveDirectiveToExecutiveBehaviorPlan(directive);
    expect(directive.authorityMode).toBe("RESPONSE_ONLY");
    expect(behavior.questionPolicy).toBe("NONE");
    expect(projectExecutiveConversationGuidance(behavior)).toContain("EXECUTIVE CONVERSATION GUIDANCE");
    await expect(resolveBusinessNavigation({
      understanding,
      activeWorkspaceContext: null,
      listCustomers: async () => [],
      listDomainRecords: async () => ({ recordCount: 0, recordNames: [] }),
    })).resolves.toMatchObject({ status: "RESOLVED", descriptor: { domain: "payment", kind: "payment.list" } });
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
