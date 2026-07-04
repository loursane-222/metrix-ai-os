import type { ExecutiveDecisionCategory } from "@/lib/executive-decision-engine";
import type { ExecutiveDelegationResult } from "@/lib/executive-delegation";
import type {
  ExecutiveResponsibilityMatrixEngineInput,
  ExecutiveResponsibilityMatrixOwner,
  ExecutiveResponsibilityMatrixResult,
} from "./executive-responsibility-matrix.types";

export function buildExecutiveResponsibilityMatrix(
  input: ExecutiveResponsibilityMatrixEngineInput,
): ExecutiveResponsibilityMatrixResult {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const delegation = input.executiveDelegationResult;
  const decisionText = normalizeText(
    [
      decision?.title,
      decision?.rationale,
      decision?.firstAction,
      ...(decision?.supportingActions ?? []),
      ...(decision?.risks ?? []),
      input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp?.title,
      input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp?.reason,
      input.operatingContext.executiveAccountability?.primaryAccountabilityIssue?.title,
      input.operatingContext.executiveAccountability?.primaryAccountabilityIssue?.expectedAction,
      delegation?.responsibilityReason,
      delegation?.requiredActionByOwner,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const responsibleParty = buildResponsibleParty(delegation);
  const decisionOwner = buildDecisionOwner(input, decision?.category ?? null, decisionText);
  const followUpOwner = buildFollowUpOwner(input, decision?.category ?? null, decisionText, responsibleParty);
  const riskOwner = buildRiskOwner(input, decision?.category ?? null, decisionText, responsibleParty);
  const requiresOwnerClarification = shouldRequireOwnerClarification(
    responsibleParty,
    followUpOwner,
    riskOwner,
    delegation,
  );
  const sourceSignals = buildSourceSignals(input, responsibleParty, decisionOwner, followUpOwner, riskOwner);
  const confidence = resolveConfidence(input, requiresOwnerClarification, sourceSignals.length);

  return {
    responsibleParty,
    decisionOwner,
    followUpOwner,
    riskOwner,
    expectedOutput: buildExpectedOutput(decision?.category ?? null, decisionText, responsibleParty),
    userRoleInThisMatter: buildUserRole(decisionOwner, followUpOwner, responsibleParty),
    executiveManagementStance: buildExecutiveManagementStance(responsibleParty, followUpOwner, requiresOwnerClarification),
    managementInstruction: buildManagementInstruction(responsibleParty, requiresOwnerClarification),
    escalationRisk: buildEscalationRisk(riskOwner, responsibleParty),
    requiresOwnerClarification,
    sourceSignals,
    shouldCreateTask: false,
    confidence,
  };
}

function buildResponsibleParty(
  delegation: ExecutiveDelegationResult | null,
): ExecutiveResponsibilityMatrixOwner {
  if (!delegation) {
    return {
      ownerType: "UNASSIGNED",
      ownerName: null,
      reason: "Delegasyon sonucu yok; fiili sorumlu netleşmedi.",
    };
  }

  return {
    ownerType: delegation.ownerType,
    ownerName: delegation.ownerName ?? null,
    reason: delegation.responsibilityReason,
  };
}

function buildDecisionOwner(
  input: ExecutiveResponsibilityMatrixEngineInput,
  category: ExecutiveDecisionCategory | null,
  decisionText: string,
): ExecutiveResponsibilityMatrixOwner {
  if (
    category === "STRATEGY" ||
    category === "CASH" ||
    category === "MARKET" ||
    hasAny(decisionText, ["hedef", "fiyat politikasi", "fiyat politikası", "onay", "oncelik", "öncelik", "karar kriteri"])
  ) {
    return userOwner(input, "Karar yönetim tercihi, onay veya öncelik seçimi gerektiriyor.");
  }

  if (
    (category === "SALES" || category === "COLLECTION" || category === "CUSTOMER") &&
    hasAny(decisionText, ["musteri onayi", "müşteri onayı", "cevap", "odeme", "ödeme", "evrak", "bilgi bekleme"])
  ) {
    return {
      ownerType: "CUSTOMER",
      ownerName: input.executiveDelegationResult?.ownerType === "CUSTOMER"
        ? input.executiveDelegationResult.ownerName ?? null
        : null,
      reason: "Kararın ilerlemesi müşteri cevabı veya onayına bağlı.",
    };
  }

  return userOwner(input, "Karar sahibi belirsizse yönetim sorumluluğu kullanıcıda kalmalı.");
}

function buildFollowUpOwner(
  input: ExecutiveResponsibilityMatrixEngineInput,
  category: ExecutiveDecisionCategory | null,
  decisionText: string,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
): ExecutiveResponsibilityMatrixOwner {
  if (
    responsibleParty.ownerType === "CUSTOMER" ||
    category === "COLLECTION" ||
    hasAny(decisionText, ["odeme", "ödeme", "evrak", "bilgi", "onay"])
  ) {
    const teamOwner = findTeamOwner(input, decisionText);
    if (teamOwner) {
      return {
        ownerType: "TEAM_MEMBER",
        ownerName: teamOwner,
        reason: "Müşteri beklemesini içeride bir ekip sahibi takip etmeli.",
      };
    }

    return userOwner(input, "Müşteri beklemesini takip edecek ekip sahibi yok; takip kullanıcıda kalmalı.");
  }

  if (
    responsibleParty.ownerType === "TEAM_MEMBER" ||
    category === "EXECUTION" ||
    category === "SALES" ||
    hasAny(decisionText, ["teklif", "stok", "operasyon", "teslimat", "takip"])
  ) {
    return {
      ownerType: "TEAM_MEMBER",
      ownerName: responsibleParty.ownerType === "TEAM_MEMBER"
        ? responsibleParty.ownerName ?? findTeamOwner(input, decisionText)
        : findTeamOwner(input, decisionText),
      reason: "Operasyon, teklif veya ekip aksiyonunda takip içeride tek sahipte kalmalı.",
    };
  }

  return userOwner(input, "Belirsiz takiplerde yönetim ritmini kullanıcı tutmalı.");
}

function buildRiskOwner(
  input: ExecutiveResponsibilityMatrixEngineInput,
  category: ExecutiveDecisionCategory | null,
  decisionText: string,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
): ExecutiveResponsibilityMatrixOwner {
  if (responsibleParty.ownerType === "SUPPLIER" || hasAny(decisionText, ["tedarik", "termin", "sevkiyat"])) {
    return {
      ownerType: "SUPPLIER",
      ownerName: responsibleParty.ownerType === "SUPPLIER" ? responsibleParty.ownerName ?? null : null,
      reason: "Tedarik, termin veya sevkiyat riski dış tedarikçi cevabına bağlı.",
    };
  }

  if (category === "COLLECTION" || hasAny(decisionText, ["tahsilat", "odeme", "ödeme", "vade"])) {
    return userOwner(input, "Ödeme riski müşteri kaynaklı olsa da yönetim riski kullanıcı tarafında izlenmeli.");
  }

  if (
    category === "EXECUTION" ||
    category === "PEOPLE" ||
    hasAny(decisionText, ["operasyon", "stok", "teslimat", "program", "ekip"])
  ) {
    return {
      ownerType: "TEAM_MEMBER",
      ownerName: responsibleParty.ownerType === "TEAM_MEMBER"
        ? responsibleParty.ownerName ?? findTeamOwner(input, decisionText)
        : findTeamOwner(input, decisionText),
      reason: "Operasyonel risk ekip uygulamasında yönetilmeli.",
    };
  }

  if (category === "DATA_QUALITY" || hasAny(decisionText, ["eksik veri", "belirsiz", "veri eksik"])) {
    return userOwner(input, "Veri eksikliği riski yönetim netliği gerektiriyor.");
  }

  return userOwner(input, "Risk sahibi net değilse yönetim riski kullanıcı tarafında izlenmeli.");
}

function buildExpectedOutput(
  category: ExecutiveDecisionCategory | null,
  decisionText: string,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
): string {
  if (responsibleParty.ownerType === "UNASSIGNED") {
    return "Sorumlu tarafın ve beklenen çıktının netleşmesi";
  }

  if (responsibleParty.ownerType === "SUPPLIER") {
    return "Tedarikçiden fiyat, termin, stok veya sevkiyat teyidinin alınması";
  }

  if (category === "COLLECTION" || responsibleParty.ownerType === "CUSTOMER") {
    return "Müşteriden ödeme, onay, evrak veya bilgi cevabının alınması";
  }

  if (category === "SALES" || hasAny(decisionText, ["teklif", "pipeline"])) {
    return "Teklif takip sorumlusunun ve müşteri sonraki adımının netleşmesi";
  }

  if (category === "EXECUTION" || category === "PEOPLE") {
    return "Operasyon tarafında uygulanacak adımın sahiplenilmesi";
  }

  if (category === "DATA_QUALITY") {
    return "Eksik bilginin ve veri kaynağı sahibinin netleşmesi";
  }

  return "Kararın sahibi, takip sahibi ve beklenen sonucun netleşmesi";
}

function buildUserRole(
  decisionOwner: ExecutiveResponsibilityMatrixOwner,
  followUpOwner: ExecutiveResponsibilityMatrixOwner,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
): string {
  if (responsibleParty.ownerType === "UNASSIGNED") {
    return "sorumluyu belirleyen ve eksik veriyi netleştiren";
  }

  if (decisionOwner.ownerType === "USER") {
    return "karar verici";
  }

  if (followUpOwner.ownerType === "USER") {
    return "takip eden";
  }

  return "sonucu kontrol eden";
}

function buildExecutiveManagementStance(
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
  followUpOwner: ExecutiveResponsibilityMatrixOwner,
  requiresOwnerClarification: boolean,
): string {
  if (requiresOwnerClarification) {
    return "Görev açma; önce sorumlu tarafı ve beklenen çıktıyı ayır.";
  }

  if (responsibleParty.ownerType === "CUSTOMER") {
    return "Müşteride bekleyen konuda takip ritmini kaçırma.";
  }

  if (responsibleParty.ownerType === "TEAM_MEMBER") {
    return "Bu işi kullanıcıya yıkmadan ekip sahipliğini net tut.";
  }

  if (followUpOwner.ownerType === "USER") {
    return "Ekip yoksa kullanıcıdan sorumluyu netleştirmesini iste.";
  }

  return "Sahipliği doğal yönetici diliyle ayır; görev sistemi gibi davranma.";
}

function buildManagementInstruction(
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
  requiresOwnerClarification: boolean,
): string {
  if (requiresOwnerClarification) {
    return "Tek cümleyle sorumluyu netleştir, görev ataması yapma.";
  }

  if (responsibleParty.ownerType === "CUSTOMER") {
    return "Müşteri cevabını takip odağına al, içeride takip sahibini sade tut.";
  }

  if (responsibleParty.ownerType === "TEAM_MEMBER") {
    return "Ekip sahibini ve beklenen çıktıyı doğal biçimde vurgula.";
  }

  if (responsibleParty.ownerType === "SUPPLIER") {
    return "Tedarikçi teyidini şart koş, içeride sadece takip sorumlusunu netleştir.";
  }

  return "Karar sahibini ve beklenen sonucu kısa yönetici diliyle ayır.";
}

function buildEscalationRisk(
  riskOwner: ExecutiveResponsibilityMatrixOwner,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
): string {
  if (responsibleParty.ownerType === "UNASSIGNED") {
    return "Sorumlu netleşmezse konu takip edilemez ve karar aksiyona dönüşmez.";
  }

  if (riskOwner.ownerType === "SUPPLIER") {
    return "Tedarikçi teyidi alınmazsa teslimat, fiyat veya operasyon kararı gecikebilir.";
  }

  if (responsibleParty.ownerType === "CUSTOMER") {
    return "Müşteri cevabı takip edilmezse nakit, teklif veya kapanış görünürlüğü zayıflar.";
  }

  if (riskOwner.ownerType === "TEAM_MEMBER") {
    return "Ekip sahibi net davranmazsa operasyonel gecikme ve sorumluluk boşluğu oluşur.";
  }

  return "Yönetim sahipliği net kalmazsa karar belirsizleşir ve takip kalitesi düşer.";
}

function shouldRequireOwnerClarification(
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
  followUpOwner: ExecutiveResponsibilityMatrixOwner,
  riskOwner: ExecutiveResponsibilityMatrixOwner,
  delegation: ExecutiveDelegationResult | null,
): boolean {
  if (responsibleParty.ownerType === "UNASSIGNED") return true;
  if (responsibleParty.ownerType === "TEAM_MEMBER" && !responsibleParty.ownerName) return true;
  if (followUpOwner.ownerType === "TEAM_MEMBER" && !followUpOwner.ownerName) return true;
  if (riskOwner.ownerType === "TEAM_MEMBER" && !riskOwner.ownerName) return true;
  if ((responsibleParty.ownerType === "CUSTOMER" || responsibleParty.ownerType === "SUPPLIER") && !responsibleParty.ownerName) {
    return true;
  }
  return delegation?.confidence === "LOW";
}

function buildSourceSignals(
  input: ExecutiveResponsibilityMatrixEngineInput,
  responsibleParty: ExecutiveResponsibilityMatrixOwner,
  decisionOwner: ExecutiveResponsibilityMatrixOwner,
  followUpOwner: ExecutiveResponsibilityMatrixOwner,
  riskOwner: ExecutiveResponsibilityMatrixOwner,
): string[] {
  const signals = [
    input.executiveDecisionResult
      ? `decision:${input.executiveDecisionResult.primaryDecision.category}:${input.executiveDecisionResult.primaryDecision.priority}`
      : null,
    input.executiveDelegationResult
      ? `delegation:${input.executiveDelegationResult.ownerType}:${input.executiveDelegationResult.confidence}`
      : null,
    input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp
      ? `followUp:${input.operatingContext.executiveDecisionFollowUp.primaryFollowUp.status}`
      : null,
    input.operatingContext.executiveAccountability?.primaryAccountabilityIssue
      ? `accountability:${input.operatingContext.executiveAccountability.primaryAccountabilityIssue.actor}`
      : null,
    `responsible:${responsibleParty.ownerType}`,
    `decisionOwner:${decisionOwner.ownerType}`,
    `followUpOwner:${followUpOwner.ownerType}`,
    `riskOwner:${riskOwner.ownerType}`,
  ];

  return signals.filter((signal): signal is string => signal !== null);
}

function resolveConfidence(
  input: ExecutiveResponsibilityMatrixEngineInput,
  requiresOwnerClarification: boolean,
  signalCount: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (requiresOwnerClarification) return "LOW";
  if (input.executiveDelegationResult?.confidence === "HIGH" && signalCount >= 4) return "HIGH";
  if (input.executiveDelegationResult?.confidence === "LOW") return "LOW";
  return "MEDIUM";
}

function userOwner(
  input: ExecutiveResponsibilityMatrixEngineInput,
  reason: string,
): ExecutiveResponsibilityMatrixOwner {
  return {
    ownerType: "USER",
    ownerName: input.executiveDelegationResult?.ownerType === "USER"
      ? input.executiveDelegationResult.ownerName ?? "Kullanıcı"
      : "Kullanıcı",
    reason,
  };
}

function findTeamOwner(
  input: ExecutiveResponsibilityMatrixEngineInput,
  decisionText: string,
): string | null {
  const normalizedText = normalizeText(decisionText);
  const names = input.operatingContext.personContext
    .map((person) => person.fullName.trim())
    .filter(Boolean);

  return (
    [...new Set(names)].find((name) => {
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
