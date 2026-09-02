import { describe, expect, it } from "vitest";

import { buildManagementIntentUnderstanding, recognizeManagementIntent } from "../management-intent";
import { resolveBusinessNavigation } from "@/lib/executive-request-resolution";
import { resolveExecutiveDirective } from "@/lib/ai/executive-directive";
import { adaptExecutiveDirectiveToExecutiveBehaviorPlan, projectExecutiveConversationGuidance } from "@/lib/ai/living-executive-presence";

describe("deterministic collection-performance intent", () => {
  it.each([
    ["Bu ay kaç teklif oluşturduk?", { activity: "CREATED", countMode: "DISTINCT_QUOTES" }],
    ["Bu ay kaç teklif gönderdik?", { activity: "SENT", countMode: "DISTINCT_QUOTES" }],
    ["Bu ay teklifler kaç kez gönderildi?", { activity: "SENT", countMode: "EVENTS" }],
    ["Bu ay kaç teklif kabul edildi?", { activity: "ACCEPTED", countMode: "DISTINCT_QUOTES" }],
    ["Bu ay kaç teklif reddedildi?", { activity: "REJECTED", countMode: "DISTINCT_QUOTES" }],
    ["Bu ay kaç teklif müşteriler tarafından görüntülendi?", { activity: "VIEWED", countMode: "DISTINCT_QUOTES" }],
    ["Bu ay teklifler kaç kez görüntülendi?", { activity: "VIEWED", countMode: "EVENTS" }],
  ])("recognizes canonical quote activity answer-only: %s", (message, expected) => {
    const result = recognizeManagementIntent(message);
    expect(result).toEqual({ intent: "QUOTE_ACTIVITY", period: "CURRENT_MONTH", ...expected });
    expect(buildManagementIntentUnderstanding(result!)).toMatchObject({ suggestedHandling: "answer_only", businessNavigation: null, shouldAskClarification: false, shouldInvokeExecutiveBrain: false });
  });

  it.each(["Bu ay satışlarımız nasıl?", "Satış pipeline'ımız ne durumda?", "Teklif dönüşüm oranımız nedir?", "Bu ay kaç sipariş aldık?", "Bu ay ne kadar fatura kestik?", "Satış hedefimizin ne kadarını gerçekleştirdik?", "Bu ay tahsilat performansımız nasıl?", "Ödemeleri göster."])("does not steal adjacent semantics: %s", (message) => {
    expect(recognizeManagementIntent(message)?.intent).not.toBe("QUOTE_ACTIVITY");
  });
  it.each([
    "Finansal durumumuz nasıl?",
    "Finans tarafında genel durum nedir?",
    "Finansal olarak şu anda neredeyiz?",
    "Finans tarafını özetler misin?",
    "Tahsilat, alacak, borç ve nakit durumumuzu özetle.",
    "Şirketin finans tarafında genel tablo nasıl?",
    "Finansal açıdan bilmem gerekenleri özetle.",
  ])("recognizes deterministic answer-only financial overview: %s", (message) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "FINANCIAL_OVERVIEW" });
    expect(buildManagementIntentUnderstanding(intent!)).toMatchObject({ suggestedHandling: "answer_only", businessNavigation: null, shouldAskClarification: false });
  });

  it.each([
    "Finans tarafında şu anda dikkat etmem gereken bir şey var mı?",
    "Finansal olarak neye dikkat etmeliyim?",
    "Şu anda finans tarafında önemli bir durum var mı?",
    "Tahsilat ve borç tarafında dikkat etmem gereken ne var?",
    "Finansta öncelikli olarak neye bakmalıyım?",
  ])("recognizes deterministic answer-only financial attention: %s", (message) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "FINANCIAL_ATTENTION" });
    expect(buildManagementIntentUnderstanding(intent!)).toMatchObject({ suggestedHandling: "answer_only", businessNavigation: null, shouldAskClarification: false, shouldInvokeExecutiveBrain: false });
  });

  it("keeps financial attention distinct from overview", () => {
    expect(recognizeManagementIntent("Finans tarafında dikkat etmem gereken ne var?")?.intent).toBe("FINANCIAL_ATTENTION");
    expect(recognizeManagementIntent("Finansal durumumuz nasıl?")?.intent).toBe("FINANCIAL_OVERVIEW");
  });

  it.each([
    "Toplam ne kadar alacağımız var?", "Toplam ne kadar borcumuz var?", "Şu anda kasamızda ne kadar para var?",
    "Bu ay net nakit hareketimiz ne?", "Bu ay tahsilatlar neden düştü?",
  ])("does not steal existing financial intent: %s", (message) => {
    expect(recognizeManagementIntent(message)?.intent).not.toBe("FINANCIAL_ATTENTION");
  });

  it.each(["Ödemeleri göster.", "Ne yapmalıyım?"])("does not capture generic or Payment workflow language: %s", (message) => {
    expect(recognizeManagementIntent(message)).toBeNull();
  });
  it.each([
    ["Şu anda kasamızda ne kadar para var?", { intent: "CASH_POSITION" }],
    ["Nakit durumumuz nasıl?", { intent: "CASH_POSITION" }],
    ["Bu ay ne kadar nakit girişi oldu?", { intent: "CASH_FLOW", queryMode: "INFLOW", period: "CURRENT_MONTH" }],
    ["Bu ay ne kadar nakit çıkışı oldu?", { intent: "CASH_FLOW", queryMode: "OUTFLOW", period: "CURRENT_MONTH" }],
    ["Bu ay net nakit hareketimiz ne?", { intent: "CASH_FLOW", queryMode: "NET", period: "CURRENT_MONTH" }],
    ["Bu ay nakit akışımız nasıl?", { intent: "CASH_FLOW", queryMode: "SUMMARY", period: "CURRENT_MONTH" }],
    ["Toplam ne kadar borcumuz var?", { intent: "PAYABLE_POSITION", queryMode: "TOTAL" }],
    ["Ne kadar gecikmiş borcumuz var?", { intent: "PAYABLE_POSITION", queryMode: "OVERDUE" }],
    ["Bugün vadesi gelen borç ne kadar?", { intent: "PAYABLE_POSITION", queryMode: "DUE_TODAY" }],
    ["Önümüzdeki 7 günde ne kadar ödeme yükümlülüğümüz var?", { intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_7_DAYS" }],
    ["Önümüzdeki 14 günde ne kadar borcun vadesi geliyor?", { intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_14_DAYS" }],
    ["Önümüzdeki 30 günde ne kadar borcun vadesi geliyor?", { intent: "PAYABLE_POSITION", queryMode: "DUE_NEXT_30_DAYS" }],
    ["Borçlarımızın yaşlandırması nasıl?", { intent: "PAYABLE_POSITION", queryMode: "AGING" }],
    ["90 günden uzun süredir gecikmiş ne kadar borcumuz var?", { intent: "PAYABLE_POSITION", queryMode: "OVERDUE_90_PLUS" }],
    ["En büyük gecikmiş borçlarımız hangileri?", { intent: "PAYABLE_POSITION", queryMode: "LARGEST_OVERDUE" }],
    ["Hangi tedarikçilere en yüksek gecikmiş borcumuz var?", { intent: "PAYABLE_POSITION", queryMode: "COUNTERPARTY_OVERDUE_RANKING" }],
    ["Geçen ay 90+ gün gecikmiş borcumuz ne kadardı?", { intent: "PAYABLE_POSITION", queryMode: "HISTORICAL_UNSUPPORTED" }],
  ] as const)("recognizes E2.4 answer-only intent: %s", (message, expected) => {
    const intent=recognizeManagementIntent(message); expect(intent).toEqual(expected);
    expect(buildManagementIntentUnderstanding(intent!).businessNavigation).toBeNull();
  });
  it.each([
    ["Toplam ne kadar alacağımız var?", "TOTAL"],
    ["Ne kadar gecikmiş alacağımız var?", "OVERDUE"],
    ["Bugün vadesi gelen alacak ne kadar?", "DUE_TODAY"],
    ["Önümüzdeki 7 günde ne kadar alacak vadesi geliyor?", "DUE_NEXT_7_DAYS"],
    ["Önümüzdeki 14 günde ne kadar alacak vadesi geliyor?", "DUE_NEXT_14_DAYS"],
    ["Önümüzdeki 30 günde ne kadar alacak vadesi geliyor?", "DUE_NEXT_30_DAYS"],
    ["Alacaklarımızın yaşlandırması nasıl?", "AGING"],
    ["90 günden uzun süredir gecikmiş ne kadar alacağımız var?", "OVERDUE_90_PLUS"],
    ["En büyük gecikmiş alacaklar hangileri?", "LARGEST_OVERDUE"],
    ["Hangi müşterilerde gecikmiş alacağımız en yüksek?", "CUSTOMER_OVERDUE_RANKING"],
  ] as const)("recognizes current receivable management query without Payment navigation: %s", async (message, queryMode) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "RECEIVABLE_POSITION", queryMode });
    const understanding = buildManagementIntentUnderstanding(intent!);
    expect(understanding).toMatchObject({ suggestedHandling: "answer_only", businessNavigation: null });
    await expect(resolveBusinessNavigation({
      understanding,
      activeWorkspaceContext: { domain: "customer", businessSurface: "customer-list", entityType: "Customer", entityId: null, title: "Müşteriler" },
      listCustomers: async () => [],
      listDomainRecords: async () => { throw new Error("Payment list must not be queried"); },
    })).resolves.toEqual({ status: "NOT_NAVIGATION" });
  });

  it.each([
    ["Geçen ay 90+ gün gecikmiş alacağımız ne kadardı?", "HISTORICAL_UNSUPPORTED"],
    ["DSO kaç?", "DSO_UNSUPPORTED"],
  ] as const)("keeps unsupported receivable mode answer-only: %s", (message, queryMode) => {
    const intent = recognizeManagementIntent(message);
    expect(intent).toEqual({ intent: "RECEIVABLE_POSITION", queryMode });
    expect(buildManagementIntentUnderstanding(intent!).businessNavigation).toBeNull();
  });

  it.each([
    { intent: "COLLECTION_PERFORMANCE", period: "CURRENT_MONTH" } as const,
    { intent: "COLLECTION_COMPARISON", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" } as const,
    { intent: "COLLECTION_DRIVERS", primaryPeriod: "CURRENT_MONTH", comparablePeriod: "PREVIOUS_MONTH" } as const,
    { intent: "COLLECTION_TARGET_POSITION", period: "CURRENT_MONTH" } as const,
  ])("preserves canonical Collections navigation for $intent", (intent) => {
    expect(buildManagementIntentUnderstanding(intent).businessNavigation).toEqual({ operation: "NAVIGATE", domain: "payment", target: "list", entityReference: null });
  });
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
