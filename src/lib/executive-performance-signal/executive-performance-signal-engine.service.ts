import type { ExecutiveDelegationOwnerType } from "@/lib/executive-delegation";
import type {
  ExecutivePerformanceSignal,
  ExecutivePerformanceSignalConfidence,
  ExecutivePerformanceSignalEngineInput,
  ExecutivePerformanceSignalPriority,
  ExecutivePerformanceSignalResult,
  ExecutivePerformanceSignalSubject,
  ExecutivePerformanceSignalType,
} from "./executive-performance-signal.types";

const SIGNAL_ORDER: Record<ExecutivePerformanceSignalType, number> = {
  OWNER_UNCLEAR: 0,
  DECISION_STALL: 1,
  CUSTOMER_BOTTLENECK: 2,
  FOLLOW_UP_MISSING: 3,
  ACCOUNTABILITY_GAP: 4,
  USER_OVERLOADED: 5,
  EXECUTION_RISK: 6,
  TEAM_BOTTLENECK: 7,
  SUPPLIER_BOTTLENECK: 8,
  REPEATED_DELAY_RISK: 9,
  OUTCOME_QUALITY_RISK: 10,
  TREND_PRESSURE_RISK: 11,
};

const PRIORITY_RANK: Record<ExecutivePerformanceSignalPriority, number> = {
  WATCH: 0,
  HIGH: 1,
  CRITICAL: 2,
};

export function buildExecutivePerformanceSignalResult(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignalResult {
  const signals = dedupeSignals([
    buildOwnerUnclearSignal(input),
    buildFollowUpMissingSignal(input),
    buildRepeatedDelayRiskSignal(input),
    buildTrendPressureRiskSignal(input),
    buildOutcomeQualityRiskSignal(input),
    buildUserOverloadedSignal(input),
    buildCustomerBottleneckSignal(input),
    buildTeamBottleneckSignal(input),
    buildSupplierBottleneckSignal(input),
    buildExecutionRiskSignal(input),
    buildDecisionStallSignal(input),
    buildAccountabilityGapSignal(input),
  ]);
  const primarySignal = selectPrimarySignal(signals);
  const confidence = resolveConfidence(input, signals);

  return {
    organizationId: input.operatingContext.organizationId ?? null,
    generatedAt: new Date().toISOString(),
    signals,
    primarySignal,
    managementConcern: buildManagementConcern(primarySignal),
    recommendedManagementMove: buildRecommendedManagementMove(primarySignal),
    userProtectionInstruction: buildUserProtectionInstruction(primarySignal),
    shouldSurfaceToUser: shouldSurfaceToUser(primarySignal, signals, confidence),
    confidence,
    diagnostics: {
      signalCount: signals.length,
      hasCriticalSignal: signals.some((signal) => signal.priority === "CRITICAL"),
      hasOwnerUnclearSignal: signals.some((signal) => signal.type === "OWNER_UNCLEAR"),
      hasUserOverloadSignal: signals.some((signal) => signal.type === "USER_OVERLOADED"),
      sourceCount: countSources(input),
    },
  };
}

function buildOwnerUnclearSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  if (!matrix?.requiresOwnerClarification) return null;

  const subject = mapOwnerTypeToSubject(matrix.responsibleParty.ownerType);
  const priority = matrix.responsibleParty.ownerType === "UNASSIGNED" ? "CRITICAL" : "HIGH";

  return {
    type: "OWNER_UNCLEAR",
    priority,
    subject,
    ownerName: matrix.responsibleParty.ownerName ?? null,
    title: "Sahiplik netleşmeden konu ilerleyemez.",
    reason: matrix.managementInstruction,
    suggestedResponseBehavior: "Önce sorumluyu ve beklenen çıktıyı tek cümleyle netleştir; görev ataması yapma.",
    evidenceRefs: ["executiveResponsibilityMatrix.requiresOwnerClarification"],
  };
}

function buildFollowUpMissingSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const followUp = input.operatingContext.executiveDecisionFollowUp;
  const accountability = input.operatingContext.executiveAccountability;
  const matrix = input.executiveResponsibilityMatrixResult;
  const hasFollowUpGap =
    matrix?.followUpOwner.ownerType === "UNASSIGNED" ||
    followUp?.agendaRecommendation.shouldRaise === true ||
    followUp?.primaryFollowUp?.status === "OVERDUE" ||
    followUp?.primaryFollowUp?.status === "REAGENDA_REQUIRED" ||
    (accountability?.promptSummary.missingOwnerCount ?? 0) > 0;

  if (!hasFollowUpGap) return null;

  return {
    type: "FOLLOW_UP_MISSING",
    priority: "HIGH",
    subject: matrix?.followUpOwner.ownerType === "USER" ? "USER" : "SYSTEM",
    ownerName: matrix?.followUpOwner.ownerName ?? null,
    title: "Takip ritmi veya takip sahibi net değil.",
    reason: followUp?.summaryLine ?? accountability?.summaryLine ?? "Kararın sonucu takip bağlamında net görünmüyor.",
    suggestedResponseBehavior: "Kararın sonucunu kimin izleyeceğini ve neyin netleşmesi gerektiğini kısa biçimde ayır.",
    evidenceRefs: buildEvidenceRefs([
      followUp ? "executiveDecisionFollowUp" : null,
      accountability ? "executiveAccountability" : null,
      matrix ? "executiveResponsibilityMatrix.followUpOwner" : null,
    ]),
  };
}

function buildRepeatedDelayRiskSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const followUp = input.operatingContext.executiveDecisionFollowUp;
  const accountability = input.operatingContext.executiveAccountability;

  const overdueCount =
    (followUp?.overdueItems.length ?? 0) +
    (accountability?.overdueCommitments.length ?? 0);

  if (overdueCount < 2) return null;

  const priority: ExecutivePerformanceSignalPriority = overdueCount >= 4 ? "CRITICAL" : "HIGH";

  return {
    type: "REPEATED_DELAY_RISK",
    priority,
    subject: "SYSTEM",
    ownerName: null,
    title: "Gecikmiş takip ve taahhüt birikimi artıyor.",
    reason: `${overdueCount} gecikmiş takip veya taahhüt kaydı tespit edildi; takip ritmi baskı altında.`,
    suggestedResponseBehavior: "Gecikmiş kalemleri sırala ve en kritik olanı öne al; genel değerlendirme yapma.",
    evidenceRefs: buildEvidenceRefs([
      followUp ? "overdueItems" : null,
      accountability ? "overdueCommitments" : null,
    ]),
  };
}

function buildTrendPressureRiskSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const trend = input.operatingContext.signal.trendContext;

  if (!trend?.hasData) return null;
  if (trend.trendDirection !== "RISING" && (trend.daysAtCurrentLevel ?? 0) < 3) return null;

  const priority: ExecutivePerformanceSignalPriority =
    trend.trendDirection === "RISING" ? "HIGH" : "WATCH";

  return {
    type: "TREND_PRESSURE_RISK",
    priority,
    subject: "SYSTEM",
    ownerName: null,
    title: "Risk sinyali momentum baskısı taşıyor.",
    reason: trend.formattedSummary ?? "Risk seviyesi kısa süre içinde yükseliyor veya mevcut baskı sürüyor.",
    suggestedResponseBehavior: "Trendi kesin yargı olarak sunma; sadece risk ivmesini görünür kıl ve takip sıklığını artır.",
    evidenceRefs: ["signalTrendContext"],
  };
}

function buildOutcomeQualityRiskSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const agg = input.outcomeAggregate ?? null;

  if (!agg?.riskTier?.hasBaseRisk) return null;

  const isCriticalPattern = agg.riskTier.isCriticalPattern;
  const priority: ExecutivePerformanceSignalPriority = isCriticalPattern ? "CRITICAL" : "HIGH";

  const reason =
    `Son ${agg.windowDays} günde karar başarı kalitesi düşük` +
    ` (başarısız: ${agg.failureCount}/${agg.totalClosed}` +
    `${agg.repeatedFailureCount >= 1 ? `, tekrar eden başarısızlık: ${agg.repeatedFailureCount}` : ""}).`;

  return {
    type: "OUTCOME_QUALITY_RISK",
    priority,
    subject: "SYSTEM",
    ownerName: null,
    title: "Karar çıktı kalitesi risk seviyesinde.",
    reason,
    suggestedResponseBehavior: "Bunu kesin performans yargısı gibi sunma; karar kalite paternini görünür kıl ve liderlik dikkatine sun.",
    evidenceRefs: ["outcomeAggregate.failurePattern"],
  };
}

function buildUserOverloadedSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const delegation = input.executiveDelegationResult;
  const accountability = input.operatingContext.executiveAccountability;
  const userOwnedCount = [
    matrix?.responsibleParty.ownerType,
    matrix?.decisionOwner.ownerType,
    matrix?.followUpOwner.ownerType,
    matrix?.riskOwner.ownerType,
    delegation?.ownerType,
    accountability?.primaryAccountabilityIssue?.actor === "USER" ? "USER" : null,
  ].filter((ownerType) => ownerType === "USER").length;

  if (userOwnedCount < 3) return null;

  return {
    type: "USER_OVERLOADED",
    priority: "HIGH",
    subject: "USER",
    ownerName: delegation?.ownerType === "USER" ? delegation.ownerName ?? null : null,
    title: "Kullanıcı üzerinde gereksiz yönetim yükü birikiyor.",
    reason: "Karar, takip veya risk sahipliğinin birden fazlası kullanıcı tarafında toplanmış görünüyor.",
    suggestedResponseBehavior: "Kullanıcıya yeni yük bindirme; önce ekip, müşteri veya sistem takip ayrımını sadeleştir.",
    evidenceRefs: ["executiveResponsibilityMatrix.userOwnedCount"],
  };
}

function buildCustomerBottleneckSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const delegation = input.executiveDelegationResult;
  const text = buildDecisionText(input);
  const hasCustomerWait =
    delegation?.ownerType === "CUSTOMER" ||
    matrix?.responsibleParty.ownerType === "CUSTOMER" ||
    matrix?.decisionOwner.ownerType === "CUSTOMER" ||
    hasAny(text, ["musteri", "müşteri", "odeme", "ödeme", "onay", "evrak", "bilgi", "teklif cevabi", "teklif cevabı"]);

  if (!hasCustomerWait) return null;

  return {
    type: "CUSTOMER_BOTTLENECK",
    priority: "HIGH",
    subject: "CUSTOMER",
    ownerName: delegation?.ownerType === "CUSTOMER" ? delegation.ownerName ?? null : matrix?.responsibleParty.ownerName ?? null,
    title: "İlerleme müşteri cevabı veya müşteri onayında bekliyor.",
    reason: delegation?.responsibilityReason ?? "Ödeme, onay, evrak, bilgi veya teklif cevabı müşteri tarafında görünüyor.",
    suggestedResponseBehavior: "Müşteri beklemesini suçlayıcı olmadan belirt; içeride takip ritmini koruyacak kişiyi netleştir.",
    evidenceRefs: buildEvidenceRefs([
      delegation?.ownerType === "CUSTOMER" ? "executiveDelegation.ownerType" : null,
      matrix ? "executiveResponsibilityMatrix" : null,
    ]),
  };
}

function buildTeamBottleneckSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const delegation = input.executiveDelegationResult;
  const hasUnnamedTeamOwner =
    (delegation?.ownerType === "TEAM_MEMBER" && !delegation.ownerName) ||
    matrix?.responsibleParty.ownerType === "TEAM_MEMBER" && !matrix.responsibleParty.ownerName ||
    matrix?.followUpOwner.ownerType === "TEAM_MEMBER" && !matrix.followUpOwner.ownerName ||
    matrix?.riskOwner.ownerType === "TEAM_MEMBER" && !matrix.riskOwner.ownerName;

  if (!hasUnnamedTeamOwner) return null;

  return {
    type: "TEAM_BOTTLENECK",
    priority: matrix?.requiresOwnerClarification ? "HIGH" : "WATCH",
    subject: "TEAM",
    ownerName: null,
    title: "Ekip sahipliği net isimle ayrışmıyor.",
    reason: "Ekip sorumluluğu var ancak takip edecek kişi adı net değil.",
    suggestedResponseBehavior: "Ekibi değerlendirme; yalnızca sahipliği ve beklenen çıktıyı netleştir.",
    evidenceRefs: ["executiveResponsibilityMatrix.teamOwner"],
  };
}

function buildSupplierBottleneckSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const delegation = input.executiveDelegationResult;
  const text = buildDecisionText(input);
  const hasSupplierWait =
    delegation?.ownerType === "SUPPLIER" ||
    matrix?.responsibleParty.ownerType === "SUPPLIER" ||
    matrix?.riskOwner.ownerType === "SUPPLIER" ||
    hasAny(text, ["tedarik", "tedarikci", "tedarikçi", "termin", "stok", "sevkiyat"]);

  if (!hasSupplierWait) return null;

  return {
    type: "SUPPLIER_BOTTLENECK",
    priority: "WATCH",
    subject: "SUPPLIER",
    ownerName: delegation?.ownerType === "SUPPLIER" ? delegation.ownerName ?? null : null,
    title: "Tedarikçi teyidi yönetim akışını yavaşlatabilir.",
    reason: delegation?.responsibilityReason ?? "Fiyat, termin, stok veya sevkiyat netliği tedarikçi tarafına bağlı olabilir.",
    suggestedResponseBehavior: "Tedarikçi adını uydurma; sadece gereken teyidi ve içerideki takip ihtiyacını belirt.",
    evidenceRefs: ["supplierWaitSignal"],
  };
}

function buildExecutionRiskSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const matrix = input.executiveResponsibilityMatrixResult;
  const text = buildDecisionText(input);
  const hasExecutionRisk =
    decision?.category === "EXECUTION" ||
    hasAny(text, ["operasyon", "stok", "teslimat", "uygulama", "program", "uretim", "üretim"]);

  if (!hasExecutionRisk) return null;

  return {
    type: "EXECUTION_RISK",
    priority: matrix?.requiresOwnerClarification ? "HIGH" : "WATCH",
    subject: matrix?.riskOwner.ownerType === "TEAM_MEMBER" ? "TEAM" : "SYSTEM",
    ownerName: matrix?.riskOwner.ownerName ?? null,
    title: "İcra riski sahiplik ve takip netliği istiyor.",
    reason: matrix?.escalationRisk ?? "Operasyon, stok, teslimat veya uygulama tarafında takip ayrımı gerekiyor.",
    suggestedResponseBehavior: "Forecast tekrarına girme; riski sadece sahiplik ve takip ihtiyacı olarak çerçevele.",
    evidenceRefs: ["executionOwnershipSignal"],
  };
}

function buildDecisionStallSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const followUp = input.operatingContext.executiveDecisionFollowUp;
  const text = buildDecisionText(input);
  const decisionOwnerType = matrix?.decisionOwner.ownerType ?? null;
  const hasWaitingDecision =
    followUp?.primaryFollowUp?.status === "OPEN_PROPOSED" ||
    followUp?.primaryFollowUp?.status === "AWAITING_RESULT" ||
    followUp?.primaryFollowUp?.status === "OVERDUE" ||
    hasAny(text, ["onay", "bekliyor", "cevap", "karar", "netles", "netleş"]);

  if ((decisionOwnerType !== "USER" && decisionOwnerType !== "CUSTOMER") || !hasWaitingDecision) {
    return null;
  }

  return {
    type: "DECISION_STALL",
    priority: "HIGH",
    subject: mapOwnerTypeToSubject(decisionOwnerType),
    ownerName: matrix?.decisionOwner.ownerName ?? null,
    title: "Karar veya onay beklediği için ilerleme duruyor.",
    reason: matrix?.decisionOwner.reason ?? "Karar sahibi netleşmeden uygulama akışı ilerlemiyor.",
    suggestedResponseBehavior: "Kararı hızlandıracak tek yönetim hamlesini söyle; görev, deadline veya puanlama dili kullanma.",
    evidenceRefs: ["executiveResponsibilityMatrix.decisionOwner"],
  };
}

function buildAccountabilityGapSignal(
  input: ExecutivePerformanceSignalEngineInput,
): ExecutivePerformanceSignal | null {
  const accountability = input.operatingContext.executiveAccountability;
  if (!accountability) return null;

  const hasGap =
    accountability.missingOwners.length > 0 ||
    accountability.overdueCommitments.length > 0 ||
    accountability.accountabilityAlerts.length > 0;

  if (!hasGap) return null;

  return {
    type: "ACCOUNTABILITY_GAP",
    priority: "HIGH",
    subject: mapAccountabilityActor(accountability.primaryAccountabilityIssue?.actor ?? "UNKNOWN"),
    ownerName: accountability.primaryAccountabilityIssue?.ownerName ?? null,
    title: "Taahhüt veya sorumluluk takibinde boşluk var.",
    reason: accountability.summaryLine,
    suggestedResponseBehavior: "Kimseyi suçlama; sonucu, sorumluyu veya beklenen netliği yönetici diliyle sor.",
    evidenceRefs: ["executiveAccountability"],
  };
}

function selectPrimarySignal(
  signals: ExecutivePerformanceSignal[],
): ExecutivePerformanceSignal | null {
  return [...signals].sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return SIGNAL_ORDER[a.type] - SIGNAL_ORDER[b.type];
  })[0] ?? null;
}

function dedupeSignals(
  signals: Array<ExecutivePerformanceSignal | null>,
): ExecutivePerformanceSignal[] {
  const seen = new Set<ExecutivePerformanceSignalType>();
  const result: ExecutivePerformanceSignal[] = [];

  for (const signal of signals) {
    if (!signal || seen.has(signal.type)) continue;
    seen.add(signal.type);
    result.push(signal);
  }

  return result;
}

function resolveConfidence(
  input: ExecutivePerformanceSignalEngineInput,
  signals: ExecutivePerformanceSignal[],
): ExecutivePerformanceSignalConfidence {
  if (signals.length === 0) return "LOW";
  if (signals.some((s) => s.type === "OUTCOME_QUALITY_RISK" && s.priority === "CRITICAL")) return "HIGH";
  if (signals.some((s) => s.type === "REPEATED_DELAY_RISK")) return "MEDIUM";
  if (signals.every((s) => s.type === "TREND_PRESSURE_RISK")) return "LOW";
  if (input.executiveResponsibilityMatrixResult?.confidence === "LOW") return "MEDIUM";
  if (signals.some((s) => s.priority === "CRITICAL")) return "HIGH";
  if (countSources(input) >= 3) return "HIGH";
  return "MEDIUM";
}

function shouldSurfaceToUser(
  primarySignal: ExecutivePerformanceSignal | null,
  signals: ExecutivePerformanceSignal[],
  confidence: ExecutivePerformanceSignalConfidence,
): boolean {
  if (!primarySignal || confidence === "LOW") return false;
  if (primarySignal.priority === "CRITICAL") return true;
  if (signals.some((signal) => signal.type === "OWNER_UNCLEAR")) return true;
  if (signals.some((signal) => signal.type === "DECISION_STALL")) return true;
  if (signals.some((signal) => signal.type === "USER_OVERLOADED")) return true;
  if (signals.some((signal) => signal.type === "CUSTOMER_BOTTLENECK")) return true;
  return !signals.every((signal) => signal.priority === "WATCH");
}

function buildManagementConcern(
  primarySignal: ExecutivePerformanceSignal | null,
): string | null {
  if (!primarySignal) return null;

  const map: Record<ExecutivePerformanceSignalType, string> = {
    OWNER_UNCLEAR: "Sahiplik netleşmeden konu aksiyona dönüşmeyebilir.",
    FOLLOW_UP_MISSING: "Takip ritmi net değilse kararın sonucu görünmez kalabilir.",
    REPEATED_DELAY_RISK: "Gecikmiş takip ve taahhüt birikimi takip ritmini baskılıyor.",
    TREND_PRESSURE_RISK: "Risk sinyali ivme kazanıyor; momentum baskısı artabilir.",
    OUTCOME_QUALITY_RISK: "Karar çıktı kalitesi risk seviyesinde; yönetim dikkat gerektiriyor.",
    USER_OVERLOADED: "Kullanıcı üzerinde gereksiz yönetim yükü birikiyor.",
    CUSTOMER_BOTTLENECK: "İlerleme müşteri cevabı veya onayında bekliyor.",
    TEAM_BOTTLENECK: "Ekip tarafında sahiplik netliği zayıf görünüyor.",
    SUPPLIER_BOTTLENECK: "Tedarikçi teyidi gecikirse karar akışı yavaşlayabilir.",
    EXECUTION_RISK: "İcra tarafında sahiplik ve takip netliği gerekiyor.",
    DECISION_STALL: "Karar veya onay beklediği için ilerleme duruyor.",
    ACCOUNTABILITY_GAP: "Taahhüt veya sorumluluk takibinde boşluk oluşuyor.",
  };

  return map[primarySignal.type];
}

function buildRecommendedManagementMove(
  primarySignal: ExecutivePerformanceSignal | null,
): string | null {
  if (!primarySignal) return null;
  return primarySignal.suggestedResponseBehavior;
}

function buildUserProtectionInstruction(
  primarySignal: ExecutivePerformanceSignal | null,
): string | null {
  if (!primarySignal) return null;

  if (primarySignal.type === "USER_OVERLOADED") {
    return "Bunu kullanıcıya yıkma; önce sahipliği ayır.";
  }

  if (primarySignal.subject === "TEAM") {
    return "Ekibi suçlama; sadece sorumluyu ve beklenen çıktıyı netleştir.";
  }

  if (primarySignal.subject === "CUSTOMER") {
    return "Bekleme müşterideyse takip ritmini koru, kullanıcıya gereksiz operasyon yükü bindirme.";
  }

  return "Görev açma veya puanlama yapma; yalnızca yönetim netliği üret.";
}

function countSources(input: ExecutivePerformanceSignalEngineInput): number {
  return [
    input.operatingContext.executiveDecisionFollowUp,
    input.operatingContext.executiveAccountability,
    input.executiveDecisionResult,
    input.executiveDelegationResult,
    input.executiveResponsibilityMatrixResult,
    input.operatingContext.signal.trendContext,
  ].filter(Boolean).length;
}

function buildDecisionText(input: ExecutivePerformanceSignalEngineInput): string {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const followUp = input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp ?? null;
  const accountability = input.operatingContext.executiveAccountability?.primaryAccountabilityIssue ?? null;
  const delegation = input.executiveDelegationResult;
  const matrix = input.executiveResponsibilityMatrixResult;

  return normalizeText(
    [
      decision?.category,
      decision?.title,
      decision?.rationale,
      decision?.firstAction,
      ...(decision?.supportingActions ?? []),
      ...(decision?.risks ?? []),
      followUp?.title,
      followUp?.reason,
      accountability?.title,
      accountability?.expectedAction,
      delegation?.responsibilityReason,
      delegation?.requiredActionByOwner,
      matrix?.expectedOutput,
      matrix?.escalationRisk,
    ].filter(Boolean).join(" "),
  );
}

function mapOwnerTypeToSubject(
  ownerType: ExecutiveDelegationOwnerType,
): ExecutivePerformanceSignalSubject {
  const map: Record<ExecutiveDelegationOwnerType, ExecutivePerformanceSignalSubject> = {
    USER: "USER",
    TEAM_MEMBER: "TEAM",
    CUSTOMER: "CUSTOMER",
    SUPPLIER: "SUPPLIER",
    SYSTEM: "SYSTEM",
    UNASSIGNED: "UNKNOWN",
  };

  return map[ownerType];
}

function mapAccountabilityActor(
  actor: "USER" | "CUSTOMER" | "TEAM_MEMBER" | "ORGANIZATION" | "UNKNOWN",
): ExecutivePerformanceSignalSubject {
  const map: Record<typeof actor, ExecutivePerformanceSignalSubject> = {
    USER: "USER",
    CUSTOMER: "CUSTOMER",
    TEAM_MEMBER: "TEAM",
    ORGANIZATION: "SYSTEM",
    UNKNOWN: "UNKNOWN",
  };

  return map[actor];
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalizeText(needle)));
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function buildEvidenceRefs(values: Array<string | null>): string[] {
  return values.filter((value): value is string => value !== null);
}
