import { describe, expect, it } from "vitest";

import { buildManagementIntentUnderstanding, recognizeManagementIntent } from "../management-intent";
import { resolveBusinessNavigation } from "@/lib/executive-request-resolution";

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
      businessNavigation: null,
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
      expect(recognizeManagementIntent(message)).toEqual({ intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" });
    });
  });

  it("cannot become Payment-list navigation even when a Payment Workspace is already active", async () => {
    const intent = recognizeManagementIntent("Bu ay tahsilat performansımız nasıl?")!;
    const understanding = buildManagementIntentUnderstanding(intent);
    await expect(resolveBusinessNavigation({
      understanding,
      activeWorkspaceContext: { domain: "payment", businessSurface: "payment-list", entityType: "Payment", entityId: null, title: "Tahsilatlar" },
      listCustomers: async () => [],
      listDomainRecords: async () => ({ recordCount: 3, recordNames: ["PAID", "PENDING", "OVERDUE"] }),
    })).resolves.toEqual({ status: "NOT_NAVIGATION" });
  });
});
