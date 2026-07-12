import type {
  ExecutiveAccountabilityActor,
  ExecutiveAccountabilityItem,
} from "@/lib/executive-accountability";
import type { ExecutiveDecisionCategory } from "@/lib/executive-decision-engine";
import type {
  ExecutiveDelegationConfidence,
  ExecutiveDelegationEngineInput,
  ExecutiveDelegationOwnerSource,
  ExecutiveDelegationOwnerType,
  ExecutiveDelegationResult,
} from "./executive-delegation.types";

type DelegationRuleResult = {
  ownerType: ExecutiveDelegationOwnerType;
  ownerSource: ExecutiveDelegationOwnerSource;
  ownerName: string | null;
  responsibilityReason: string;
  requiredActionByOwner: string;
  userShouldDoNow: string;
  riskIfNotAssigned: string;
  confidence: ExecutiveDelegationConfidence;
};

const CONFIDENCE_RANK: Record<ExecutiveDelegationConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

/**
 * Delegasyon guveni, dayandigi primary decision'in guveninden asla yuksek
 * olamaz; yalnizca asagi sinirlanir. Decision yoksa (primaryDecision null)
 * karsilastirilacak bir zemin olmadigindan resolver'in ürettigi deger aynen kalir.
 */
function capDelegationConfidence(
  delegationConfidence: ExecutiveDelegationConfidence,
  decisionConfidence: ExecutiveDelegationConfidence | null,
): ExecutiveDelegationConfidence {
  if (!decisionConfidence) return delegationConfidence;
  return CONFIDENCE_RANK[decisionConfidence] < CONFIDENCE_RANK[delegationConfidence]
    ? decisionConfidence
    : delegationConfidence;
}

export function buildExecutiveDelegationResult(
  input: ExecutiveDelegationEngineInput,
): ExecutiveDelegationResult {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const decisionText = normalizeText(
    [
      decision?.title,
      decision?.rationale,
      decision?.firstAction,
      ...(decision?.supportingActions ?? []),
      ...(decision?.risks ?? []),
      input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp?.title,
      input.operatingContext.executiveAccountability?.primaryAccountabilityIssue?.title,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const accountabilityOwner = resolveAccountabilityOwner(
    input.operatingContext.executiveAccountability?.primaryAccountabilityIssue ?? null,
  );
  const ruleResult =
    resolveDataQualityDelegation(input, decisionText) ??
    resolveSupplierDelegation(decisionText) ??
    resolveCollectionDelegation(input, decisionText) ??
    resolveSalesDelegation(input, decisionText) ??
    resolveExecutionDelegation(input, decisionText) ??
    resolveStrategyDelegation(input, decisionText) ??
    resolveSystemDelegation(decision?.category ?? null, decisionText) ??
    resolveFallbackDelegation(input, decisionText);

  const reinforced = reinforceWithAccountability(ruleResult, accountabilityOwner);

  return {
    ...reinforced,
    confidence: capDelegationConfidence(reinforced.confidence, decision?.confidence ?? null),
    delegationAdvice: buildDelegationAdvice(reinforced),
    shouldCreateTask: false,
  };
}

function resolveDataQualityDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult | null {
  const category = input.executiveDecisionResult?.primaryDecision.category ?? null;
  const hasDataQualityPressure =
    category === "DATA_QUALITY" ||
    input.operatingContext.diagnostics.failedSteps.length > 0 ||
    hasAny(decisionText, ["eksik veri", "veri eksik", "netlesmeden", "belirsiz", "bilgi eksik"]);

  if (!hasDataQualityPressure) return null;

  return {
    ownerType: "UNASSIGNED",
    ownerSource: "DECISION_CATEGORY",
    ownerName: null,
    responsibilityReason: "Karar kalitesi eksik veya belirsiz bilgiye bağlı.",
    requiredActionByOwner: "Sorumlu belirlenmeden önce eksik bilgi ve veri kaynağı netleşmeli.",
    userShouldDoNow: "Bu konuyu kimin netleştireceğini ve hangi bilginin eksik olduğunu belirle.",
    riskIfNotAssigned: "Sahiplik netleşmezse karar varsayımla ilerler ve takip edilebilir sonuç üretmez.",
    confidence: "HIGH",
  };
}

function resolveSupplierDelegation(decisionText: string): DelegationRuleResult | null {
  if (
    !hasAny(decisionText, [
      "tedarikci",
      "tedarikçi",
      "termin",
      "sevkiyat",
      "stok teyidi",
      "tedarik",
      "fiyat bekleniyor",
    ])
  ) {
    return null;
  }

  return {
    ownerType: "SUPPLIER",
    ownerSource: "RULE",
    ownerName: null,
    responsibilityReason: "Karar tedarikçi kaynaklı fiyat, termin, stok veya sevkiyat sinyaline bağlı.",
    requiredActionByOwner: "Tedarikçi fiyat, termin, stok veya sevkiyat bilgisini netleştirmeli.",
    userShouldDoNow: "Tedarikçiden yazılı teyit alınacak kişiyi ve beklenen bilgiyi netleştir.",
    riskIfNotAssigned: "Tedarikçi cevabı netleşmezse teklif, teslimat veya operasyon kararı gecikir.",
    confidence: "MEDIUM",
  };
}

function resolveCollectionDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult | null {
  const category = input.executiveDecisionResult?.primaryDecision.category ?? null;
  if (
    category !== "COLLECTION" &&
    !hasAny(decisionText, ["odeme", "ödeme", "tahsilat", "evrak", "dekont", "vade", "net tarih"])
  ) {
    return null;
  }

  const collectionOwner = findCollectionOwner(input, decisionText);

  return {
    ownerType: "CUSTOMER",
    ownerSource: collectionOwner.source,
    ownerName: collectionOwner.name,
    responsibilityReason: "Karar müşteri ödeme, evrak veya tahsilat cevabına bağlı.",
    requiredActionByOwner: "Müşteri ödeme tarihi, evrak veya beklenen bilgiyi netleştirmeli.",
    userShouldDoNow: collectionOwner.name
      ? `${collectionOwner.name} için net ödeme/evrak cevabını iste.`
      : "Müşteriden beklenen ödeme, evrak veya bilgi cevabını kimin takip edeceğini netleştir.",
    riskIfNotAssigned: "Müşteri tarafındaki bekleme sahiplenilmezse tahsilat ve nakit görünürlüğü zayıflar.",
    confidence: collectionOwner.name ? "HIGH" : "MEDIUM",
  };
}

function resolveSalesDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult | null {
  const category = input.executiveDecisionResult?.primaryDecision.category ?? null;
  if (
    category !== "SALES" &&
    !hasAny(decisionText, ["teklif", "satis", "satış", "pipeline", "musteri", "müşteri"])
  ) {
    return null;
  }

  const quoteOwner = findQuoteOwner(input, decisionText);
  const waitsForCustomer =
    quoteOwner.name !== null &&
    hasAny(decisionText, ["cevap", "onay", "görüntüledi", "goruntuledi", "müzakere", "muzakere"]);

  if (waitsForCustomer) {
    return {
      ownerType: "CUSTOMER",
      ownerSource: quoteOwner.source,
      ownerName: quoteOwner.name,
      responsibilityReason: "Satış kararı müşteri cevabı veya onayına bağlı.",
      requiredActionByOwner: "Müşteri teklif cevabını, onayını veya itirazını netleştirmeli.",
      userShouldDoNow: `${quoteOwner.name} tarafındaki teklif cevabını netleştir.`,
      riskIfNotAssigned: "Müşteri cevabı takip edilmezse teklif fırsatı soğur ve kapanış tarihi belirsiz kalır.",
      confidence: "HIGH",
    };
  }

  return {
    ownerType: "TEAM_MEMBER",
    ownerSource: quoteOwner.name ? quoteOwner.source : "DECISION_CATEGORY",
    ownerName: findTeamOwner(input, decisionText),
    responsibilityReason: "Satış kararı teklif hazırlama veya takip aksiyonu gerektiriyor.",
    requiredActionByOwner: "Ekip teklifin hazırlanması, gönderimi veya takip aksiyonunu tamamlamalı.",
    userShouldDoNow: "Teklif tarafında aksiyonu kimin üstleneceğini netleştir.",
    riskIfNotAssigned: "Sahiplik netleşmezse teklif takibi dağılır ve satış fırsatı gecikir.",
    confidence: "MEDIUM",
  };
}

function resolveExecutionDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult | null {
  const category = input.executiveDecisionResult?.primaryDecision.category ?? null;
  if (
    category !== "EXECUTION" &&
    category !== "PEOPLE" &&
    !hasAny(decisionText, ["stok", "operasyon", "teslimat", "program", "uretim", "üretim", "ekip"])
  ) {
    return null;
  }

  const ownerName = findTeamOwner(input, decisionText);

  return {
    ownerType: "TEAM_MEMBER",
    ownerSource: ownerName ? "PERSON_CONTEXT" : "DECISION_CATEGORY",
    ownerName,
    responsibilityReason: "Karar ekip, operasyon, stok, teslimat veya iş programı aksiyonuna bağlı.",
    requiredActionByOwner: "Ekip sahibi beklenen çıktıyı ve mevcut engeli netleştirmeli.",
    userShouldDoNow: ownerName
      ? `${ownerName} için beklenen çıktıyı netleştir.`
      : "Bu işi ekipte kimin üstleneceğini netleştir.",
    riskIfNotAssigned: "Operasyonel sahiplik netleşmezse karar takip edilemez ve gecikme görünmez kalır.",
    confidence: ownerName ? "HIGH" : "MEDIUM",
  };
}

function resolveStrategyDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult | null {
  const category = input.executiveDecisionResult?.primaryDecision.category ?? null;
  if (
    category !== "STRATEGY" &&
    category !== "CASH" &&
    category !== "MARKET" &&
    !hasAny(decisionText, ["hedef", "strateji", "onay", "karar kriteri", "fiyat politikasi", "fiyat politikası", "oncelik", "öncelik"])
  ) {
    return null;
  }

  return {
    ownerType: "USER",
    ownerSource: "DECISION_CATEGORY",
    ownerName: input.currentUserName?.trim() || "Kullanıcı",
    responsibilityReason: "Karar yönetimsel hedef, onay, fiyat politikası veya öncelik seçimi gerektiriyor.",
    requiredActionByOwner: "Kullanıcı karar kriterini ve kabul edilebilir yönü netleştirmeli.",
    userShouldDoNow: "Yönetim tercihini ve karar kriterini tek cümleyle netleştir.",
    riskIfNotAssigned: "Yönetim kararı sahiplenilmezse ekip yanlış önceliğe göre hareket edebilir.",
    confidence: "HIGH",
  };
}

function resolveSystemDelegation(
  category: ExecutiveDecisionCategory | null,
  decisionText: string,
): DelegationRuleResult | null {
  if (category !== "DECISION_FOLLOW_UP" && !hasAny(decisionText, ["karar takibi", "takip penceresi"])) {
    return null;
  }

  return {
    ownerType: "SYSTEM",
    ownerSource: "DECISION_CATEGORY",
    ownerName: null,
    responsibilityReason: "Karar takip ritmi ve sonuç görünürlüğü gerektiriyor.",
    requiredActionByOwner: "Sistem mevcut karar takibini prompt bağlamında görünür tutmalı.",
    userShouldDoNow: "Sonucu kimin bildireceğini ve kararın kapanış ölçütünü netleştir.",
    riskIfNotAssigned: "Takip sahipliği netleşmezse karar açık kalır ve sonuç öğrenimi oluşmaz.",
    confidence: "MEDIUM",
  };
}

function resolveFallbackDelegation(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): DelegationRuleResult {
  const isManagementDecision = hasAny(decisionText, ["karar", "onay", "hedef", "risk", "nakit", "fiyat"]);

  if (isManagementDecision) {
    return {
      ownerType: "USER",
      ownerSource: "RULE",
      ownerName: input.currentUserName?.trim() || "Kullanıcı",
      responsibilityReason: "Karar yönetimsel sahiplik gerektiriyor ancak daha net bir operasyon sahibi bulunamadı.",
      requiredActionByOwner: "Kullanıcı karar yönünü ve kimin uygulayacağını netleştirmeli.",
      userShouldDoNow: "Önce kararın sahibini, sonra uygulayacak kişiyi netleştir.",
      riskIfNotAssigned: "Sorumlu ayrımı yapılmazsa öneri aksiyona dönüşmez.",
      confidence: "LOW",
    };
  }

  return {
    ownerType: "UNASSIGNED",
    ownerSource: "UNKNOWN",
    ownerName: null,
    responsibilityReason: "Karar için yeterince net sahiplik sinyali bulunamadı.",
    requiredActionByOwner: "Sorumlu kişi veya taraf netleştirilmeli.",
    userShouldDoNow: "Bu konuyu kimin üstleneceğini tek soruyla netleştir.",
    riskIfNotAssigned: "Sahiplik belirsiz kalırsa takip ve performans değerlendirmesi yapılamaz.",
    confidence: "LOW",
  };
}

function resolveAccountabilityOwner(
  item: ExecutiveAccountabilityItem | null,
): {
  ownerType: ExecutiveDelegationOwnerType;
  ownerName: string | null;
} | null {
  if (!item || item.ownerSource === "UNKNOWN") return null;

  return {
    ownerType: mapAccountabilityActor(item.actor),
    ownerName: item.ownerName ?? null,
  };
}

function reinforceWithAccountability(
  result: DelegationRuleResult,
  accountabilityOwner: { ownerType: ExecutiveDelegationOwnerType; ownerName: string | null } | null,
): DelegationRuleResult {
  if (!accountabilityOwner) return result;

  if (
    accountabilityOwner.ownerType === result.ownerType ||
    result.ownerType === "UNASSIGNED" ||
    result.confidence === "LOW"
  ) {
    return {
      ...result,
      ownerType: accountabilityOwner.ownerType,
      ownerSource: "ACCOUNTABILITY",
      ownerName: accountabilityOwner.ownerName ?? result.ownerName,
      confidence: result.confidence === "LOW" ? "MEDIUM" : result.confidence,
    };
  }

  return result;
}

function mapAccountabilityActor(
  actor: ExecutiveAccountabilityActor,
): ExecutiveDelegationOwnerType {
  if (actor === "USER") return "USER";
  if (actor === "CUSTOMER") return "CUSTOMER";
  if (actor === "TEAM_MEMBER" || actor === "ORGANIZATION") return "TEAM_MEMBER";
  return "UNASSIGNED";
}

function findCollectionOwner(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): { name: string | null; source: ExecutiveDelegationOwnerSource } {
  const collectionNames = input.operatingContext.collectionActionContext?.items.map((item) => item.customerName) ?? [];
  const collectionMatch = findMentionedName(decisionText, collectionNames);
  if (collectionMatch) return { name: collectionMatch, source: "COLLECTION_CONTEXT" };

  const paymentNames = [
    ...(input.operatingContext.paymentContext?.overdueItems ?? []).map((item) => item.customerName),
    ...(input.operatingContext.paymentContext?.partialItems ?? []).map((item) => item.customerName),
    ...(input.operatingContext.paymentIntelligence?.prioritizedItems ?? []).map((item) => item.customerName),
  ];
  const paymentMatch = findMentionedName(decisionText, paymentNames);
  if (paymentMatch) return { name: paymentMatch, source: "PAYMENT_CONTEXT" };

  const firstCollection = collectionNames[0] ?? null;
  if (firstCollection) return { name: firstCollection, source: "COLLECTION_CONTEXT" };

  const firstPayment = paymentNames[0] ?? null;
  if (firstPayment) return { name: firstPayment, source: "PAYMENT_CONTEXT" };

  return { name: null, source: "DECISION_CATEGORY" };
}

function findQuoteOwner(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): { name: string | null; source: ExecutiveDelegationOwnerSource } {
  const quoteNames = input.operatingContext.quoteContext?.activeItems.map((item) => item.customerName) ?? [];
  const quoteMatch = findMentionedName(decisionText, quoteNames);
  if (quoteMatch) return { name: quoteMatch, source: "QUOTE_CONTEXT" };

  const topQuote = input.operatingContext.quoteIntelligence?.topQuotePriority?.customerName ?? quoteNames[0] ?? null;
  if (topQuote) return { name: topQuote, source: "QUOTE_CONTEXT" };

  return { name: null, source: "DECISION_CATEGORY" };
}

function findTeamOwner(
  input: ExecutiveDelegationEngineInput,
  decisionText: string,
): string | null {
  return findMentionedName(
    decisionText,
    input.operatingContext.personContext.map((person) => person.fullName),
  );
}

function buildDelegationAdvice(result: DelegationRuleResult): string {
  if (result.ownerType === "UNASSIGNED") {
    return "Bu aşamada görev oluşturma; önce sorumluyu ve beklenen çıktıyı netleştir.";
  }

  if (result.ownerType === "USER") {
    return "Bu karar kullanıcıda kalmalı; ekip aksiyonu ancak karar kriteri netleşince ayrılmalı.";
  }

  if (result.ownerType === "CUSTOMER") {
    return "Müşteri tarafındaki cevabı yönetici takibiyle netleştir; bunu otomatik görev ataması gibi sunma.";
  }

  if (result.ownerType === "SUPPLIER") {
    return "Tedarikçi cevabı yazılı teyide bağlanmalı; içeride sadece takip sahibi netleşmeli.";
  }

  if (result.ownerType === "SYSTEM") {
    return "Bu konu sistem bağlamında izlenmeli; kullanıcıdan sadece kapanış ölçütü istenmeli.";
  }

  return "Ekip içinde tek sahip belirlenmeli; beklenen çıktı açık yazılmalı ama görev kaydı oluşturulmamalı.";
}

function findMentionedName(text: string, names: string[]): string | null {
  const normalizedText = normalizeText(text);
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  return (
    uniqueNames.find((name) => {
      const normalizedName = normalizeText(name);
      return normalizedName.length >= 3 && normalizedText.includes(normalizedName);
    }) ?? null
  );
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .trim();
}
