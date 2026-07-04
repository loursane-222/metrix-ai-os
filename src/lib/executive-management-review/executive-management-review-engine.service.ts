import type {
  ExecutiveManagementReviewConfidence,
  ExecutiveManagementReviewEngineInput,
  ExecutiveManagementReviewResult,
} from "./executive-management-review.types";

type ReviewDraft = Pick<
  ExecutiveManagementReviewResult,
  | "reviewType"
  | "executiveRead"
  | "mainManagementConcern"
  | "nonNegotiableFocus"
  | "leadershipTone"
  | "userDirection"
  | "clarificationNeeded"
  | "shouldChallengeUser"
  | "shouldProtectUser"
  | "shouldSurfaceToUser"
  | "sourceSignals"
> & {
  primarySource: string;
};

export function buildExecutiveManagementReviewResult(
  input: ExecutiveManagementReviewEngineInput,
): ExecutiveManagementReviewResult {
  const sourceCount = countSources(input);
  const hasLowData = resolveHasLowData(input);
  const confidence = resolveConfidence(input, hasLowData, sourceCount);
  const draft =
    buildOwnerClarificationReview(input) ??
    buildCompanyPerformanceCriticalReview(input) ??
    buildDecisionDisciplineRiskReview(input) ??
    buildWaitingOnCustomerReview(input) ??
    buildUserOverloadReview(input) ??
    buildAccountabilityFollowUpReview(input) ??
    buildExecutionControlReview(input) ??
    buildStrategicDecisionReview(input, confidence) ??
    buildClearActionReview(input) ??
    buildTopPositiveSignalReview(input) ??
    buildDataInsufficientReview(input) ??
    buildLowRiskMonitorReview(input);

  return {
    organizationId: input.operatingContext.organizationId ?? null,
    generatedAt: new Date().toISOString(),
    reviewType: draft.reviewType,
    executiveRead: draft.executiveRead,
    mainManagementConcern: draft.mainManagementConcern,
    nonNegotiableFocus: draft.nonNegotiableFocus,
    leadershipTone: draft.leadershipTone,
    userDirection: draft.userDirection,
    clarificationNeeded: draft.clarificationNeeded,
    shouldChallengeUser: confidence === "LOW" ? false : draft.shouldChallengeUser,
    shouldProtectUser: draft.shouldProtectUser,
    shouldSurfaceToUser: confidence === "LOW" ? false : draft.shouldSurfaceToUser,
    confidence,
    sourceSignals: draft.sourceSignals,
    diagnostics: {
      sourceCount,
      hasLowData,
      primarySource: draft.primarySource,
    },
  };
}

function buildOwnerClarificationReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const matrix = input.executiveResponsibilityMatrixResult;
  const performance = input.executivePerformanceSignalResult;
  const primarySignal = performance?.primarySignal ?? null;
  const requiresOwnerClarification =
    matrix?.requiresOwnerClarification === true ||
    primarySignal?.type === "OWNER_UNCLEAR";

  if (!requiresOwnerClarification) return null;

  return {
    reviewType: "OWNER_CLARIFICATION_REQUIRED",
    executiveRead: "Burada işin ilerlemesini durduran ana konu karar değil, sahipliğin netleşmemiş olması.",
    mainManagementConcern: performance?.managementConcern ?? "Sahiplik netleşmeden konu aksiyona dönüşmeyebilir.",
    nonNegotiableFocus: "Sorumluyu ve beklenen çıktıyı netleştirme.",
    leadershipTone: "DIRECT",
    userDirection: matrix?.managementInstruction ?? "Önce kimin neyi netleştireceğini sade biçimde ayır.",
    clarificationNeeded: matrix?.responsibleParty.reason ?? "Bu konuda fiili sorumlu netleştirilmeli.",
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals([
      "executiveResponsibilityMatrix.requiresOwnerClarification",
      primarySignal?.type ?? null,
    ]),
    primarySource: "executiveResponsibilityMatrix",
  };
}

function buildCompanyPerformanceCriticalReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const cps = input.companyPerformanceSignal;
  if (!cps) return null;

  const isCritical = cps.performanceLevel === "CRITICAL" || cps.performanceLevel === "PRESSURED";
  if (!isCritical) return null;

  const isCriticalLevel = cps.performanceLevel === "CRITICAL";
  const shouldSurface = cps.confidence !== "LOW";

  return {
    reviewType: "COMPANY_PERFORMANCE_CRITICAL",
    executiveRead: isCriticalLevel
      ? "Şirket bu dönemde kritik baskı altında; genel performans acil yönetim odağı istiyor."
      : "Şirket performansı bu dönemde baskı altında görünüyor.",
    mainManagementConcern: cps.primaryRisk ?? cps.executiveSummary,
    nonNegotiableFocus: "En zayıf alanı netleştirip kısa vadeli düzeltme planı oluşturmak.",
    leadershipTone: isCriticalLevel ? "FIRM" : "DIRECT",
    userDirection: cps.primaryRisk
      ? `Öncelikli odak: ${cps.primaryRisk}. Kısa vadeli düzeltme adımını netleştir.`
      : "Öncelikli alanı netleştirip kısa vadeli düzeltme planı oluştur.",
    clarificationNeeded: cps.dataGaps.length > 0
      ? `Eksik veri: ${cps.dataGaps[0]}`
      : null,
    shouldChallengeUser: isCriticalLevel && shouldSurface,
    shouldProtectUser: false,
    shouldSurfaceToUser: shouldSurface,
    sourceSignals: buildSourceSignals([
      cps.performanceLevel,
      cps.primaryRisk ?? null,
      "companyPerformanceSignal",
    ]),
    primarySource: "companyPerformanceSignal",
  };
}

function buildDecisionDisciplineRiskReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const agg = input.outcomeAggregate;
  if (!agg?.riskTier?.hasBaseRisk) return null;

  const isRepeatedPattern = agg.riskTier.hasRepeatedPattern;
  const failureLine = agg.failureRate !== null
    ? `Son ${agg.windowDays} günde ${agg.failureCount} başarısız karar (${Math.round(agg.failureRate * 100)}%).`
    : null;
  const repeatedLine = isRepeatedPattern
    ? `${agg.repeatedFailureCount} karar aynı başarısızlık paterni ile tekrar etti.`
    : null;
  const reagendaLine = agg.reAgendaCount >= 2
    ? `${agg.reAgendaCount} karar yeniden gündeme alındı.`
    : null;

  const concern = [failureLine, repeatedLine, reagendaLine].filter(Boolean).join(" ") ||
    "Karar kalitesinde tekrar eden disiplin riski görünüyor.";

  return {
    reviewType: "DECISION_DISCIPLINE_RISK",
    executiveRead: isRepeatedPattern
      ? "Aynı kararlar tekrar başarısız oluyor; bu karar kalitesinden çok uygulama takibi problemi olabilir."
      : "Kararların sonuca taşınmasında tekrar eden bir disiplin riski görünüyor.",
    mainManagementConcern: concern,
    nonNegotiableFocus: "Aynı başarısızlık örüntüsünü kırmak için uygulama takibini netleştirme.",
    leadershipTone: isRepeatedPattern ? "FIRM" : "DIRECT",
    userDirection: isRepeatedPattern
      ? "Bu kararın neden tekrar gündemde olduğunu ve hangi uygulama adımının atlandığını netleştir."
      : "Karar takip ritmini ve sonuç sorumlusunu netleştir.",
    clarificationNeeded: null,
    shouldChallengeUser: agg.riskTier.shouldChallenge,
    shouldProtectUser: false,
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals([
      agg.qualitySignal,
      repeatedLine ? "outcomeAggregate.repeatedFailure" : null,
      reagendaLine ? "outcomeAggregate.reAgenda" : null,
      "outcomeAggregate",
    ]),
    primarySource: "outcomeAggregate",
  };
}

function buildTopPositiveSignalReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const cps = input.companyPerformanceSignal;
  if (!cps) return null;

  const hasStrength =
    cps.primaryStrength !== null &&
    (cps.performanceLevel === "STRONG" || cps.performanceLevel === "STABLE");

  if (!hasStrength || !cps.primaryStrength) return null;

  return {
    reviewType: "TOP_POSITIVE_SIGNAL",
    executiveRead: "Bu dönemde güçlü bir performans sinyali var; bu alan korunmalı ve diğer zayıf alanları desteklemek için kullanılmalı.",
    mainManagementConcern: null,
    nonNegotiableFocus: cps.primaryStrength,
    leadershipTone: "CALM",
    userDirection: `Güçlü alan: ${cps.primaryStrength}. Bu momentumu koruyarak zayıf alanlara taşı.`,
    clarificationNeeded: null,
    shouldChallengeUser: false,
    shouldProtectUser: false,
    shouldSurfaceToUser: cps.confidence !== "LOW",
    sourceSignals: buildSourceSignals([
      cps.performanceLevel,
      cps.primaryStrength,
      "companyPerformanceSignal.primaryStrength",
    ]),
    primarySource: "companyPerformanceSignal",
  };
}

function buildWaitingOnCustomerReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const performance = input.executivePerformanceSignalResult;
  const primarySignal = performance?.primarySignal ?? null;
  const text = buildReviewText(input);
  const waitsOnCustomer =
    primarySignal?.type === "CUSTOMER_BOTTLENECK" ||
    hasAny(text, ["musteri", "müşteri", "odeme", "ödeme", "onay", "evrak", "bilgi", "teklif cevabi", "teklif cevabı"]);

  if (!waitsOnCustomer) return null;

  return {
    reviewType: "WAITING_ON_CUSTOMER",
    executiveRead: "Burada bekleme müşteride; riski büyütmeden takip ritmini korumamız gerekiyor.",
    mainManagementConcern: performance?.managementConcern ?? "İlerleme müşteri cevabı veya onayında bekliyor.",
    nonNegotiableFocus: "Müşteri cevabının içeride takip ritminden düşmemesi.",
    leadershipTone: "DIRECT",
    userDirection: performance?.recommendedManagementMove ?? "Müşteri beklemesini doğal biçimde görünür kıl ve içeride takibin kimde olduğunu net tut.",
    clarificationNeeded: input.executiveResponsibilityMatrixResult?.followUpOwner.ownerName
      ? null
      : "Müşteri beklemesini içeride kimin takip ettiği netleşmeli.",
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals([
      primarySignal?.type ?? null,
      "customerWaitingContext",
    ]),
    primarySource: "executivePerformanceSignal",
  };
}

function buildUserOverloadReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const performance = input.executivePerformanceSignalResult;
  const hasUserOverload =
    performance?.primarySignal?.type === "USER_OVERLOADED" ||
    performance?.diagnostics.hasUserOverloadSignal === true;

  if (!hasUserOverload) return null;

  return {
    reviewType: "USER_OVERLOAD_RISK",
    executiveRead: "Burada kullanıcının üstünde gereksiz yönetim yükü birikiyor; yükü sahipliklere ayırmak gerekiyor.",
    mainManagementConcern: performance?.managementConcern ?? "Kullanıcı üzerinde gereksiz yönetim yükü birikiyor.",
    nonNegotiableFocus: "Kullanıcının üstündeki takip ve sahiplik yükünü ayrıştırma.",
    leadershipTone: "CALM",
    userDirection: performance?.userProtectionInstruction ?? "Kullanıcıya yeni yük bindirme; önce ekip, müşteri veya sistem takip ayrımını sadeleştir.",
    clarificationNeeded: null,
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals(["USER_OVERLOADED"]),
    primarySource: "executivePerformanceSignal",
  };
}

function buildAccountabilityFollowUpReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const accountability = input.operatingContext.executiveAccountability;
  const performance = input.executivePerformanceSignalResult;
  const hasAccountabilityGap =
    performance?.primarySignal?.type === "ACCOUNTABILITY_GAP" ||
    (accountability?.overdueCommitments.length ?? 0) > 0 ||
    (accountability?.missingOwners.length ?? 0) > 0 ||
    (accountability?.accountabilityAlerts.length ?? 0) > 0;

  if (!hasAccountabilityGap) return null;

  return {
    reviewType: "ACCOUNTABILITY_FOLLOW_UP_REQUIRED",
    executiveRead: "Burada ana mesele yeni karar almak değil, mevcut taahhüdün sonucunu görünür hale getirmek.",
    mainManagementConcern: performance?.managementConcern ?? accountability?.summaryLine ?? "Taahhüt veya sorumluluk takibinde boşluk oluşuyor.",
    nonNegotiableFocus: "Bekleyen taahhüdün sonucunu ve sorumlusunu netleştirme.",
    leadershipTone: "DIRECT",
    userDirection: accountability?.promptSummary.clarifyingQuestion ?? performance?.recommendedManagementMove ?? "Sonucu, sorumluyu veya beklenen netliği suçlayıcı olmayan bir dille sor.",
    clarificationNeeded: accountability?.promptSummary.clarifyingQuestion ?? null,
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals([
      performance?.primarySignal?.type ?? null,
      "executiveAccountability",
    ]),
    primarySource: "executiveAccountability",
  };
}

function buildExecutionControlReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const performance = input.executivePerformanceSignalResult;
  const text = buildReviewText(input);
  const hasExecutionRisk =
    performance?.primarySignal?.type === "EXECUTION_RISK" ||
    decision?.category === "EXECUTION" ||
    hasAny(text, ["operasyon", "stok", "teslimat", "uygulama", "program", "uretim", "üretim"]);

  if (!hasExecutionRisk) return null;

  return {
    reviewType: "EXECUTION_CONTROL_REQUIRED",
    executiveRead: "Burada risk tahminden çok uygulama kontrolünde; sahiplik ve takip net tutulmalı.",
    mainManagementConcern: performance?.managementConcern ?? "İcra tarafında sahiplik ve takip netliği gerekiyor.",
    nonNegotiableFocus: "Uygulama kontrolü.",
    leadershipTone: "DIRECT",
    userDirection: performance?.recommendedManagementMove ?? "Uygulama tarafında kimin hangi sonucu takip ettiğini sade biçimde netleştir.",
    clarificationNeeded: input.executiveResponsibilityMatrixResult?.requiresOwnerClarification
      ? "Uygulama kontrolünün kimde olduğu netleşmeli."
      : null,
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: performance?.shouldSurfaceToUser ?? true,
    sourceSignals: buildSourceSignals([
      performance?.primarySignal?.type ?? null,
      decision?.category ?? null,
    ]),
    primarySource: "executivePerformanceSignal",
  };
}

function buildStrategicDecisionReview(
  input: ExecutiveManagementReviewEngineInput,
  confidence: ExecutiveManagementReviewConfidence,
): ReviewDraft | null {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const text = buildReviewText(input);
  const isStrategicDecision =
    decision?.category === "STRATEGY" ||
    decision?.category === "CASH" ||
    decision?.category === "MARKET" ||
    hasAny(text, ["hedef", "strateji", "fiyat politikasi", "fiyat politikası", "onay", "oncelik", "öncelik"]);

  if (!isStrategicDecision || !decision) return null;

  return {
    reviewType: "STRATEGIC_DECISION_REQUIRED",
    executiveRead: "Burada ilerleme için operasyonel takipten önce yönetim tercihi netleşmeli.",
    mainManagementConcern: decision.risks[0] ?? decision.rationale,
    nonNegotiableFocus: "Yönetim tercihini ve karar yönünü netleştirme.",
    leadershipTone: confidence === "HIGH" ? "FIRM" : "DIRECT",
    userDirection: "Kullanıcının karar vermesi gereken alanı net söyle; mevcut karar motorunun ilk adımını yeniden üretme.",
    clarificationNeeded: decision.confidence === "LOW" ? "Karar kriteri ve kabul edilebilir yön netleşmeli." : null,
    shouldChallengeUser: confidence !== "LOW",
    shouldProtectUser: false,
    shouldSurfaceToUser: confidence !== "LOW",
    sourceSignals: buildSourceSignals([decision.category, "executiveDecisionResult"]),
    primarySource: "executiveDecisionResult",
  };
}

function buildClearActionReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const decision = input.executiveDecisionResult;
  const performance = input.executivePerformanceSignalResult;
  const hasClearSignal =
    decision?.overallConfidence !== "LOW" &&
    performance?.primarySignal !== null &&
    performance?.primarySignal !== undefined &&
    performance.confidence !== "LOW" &&
    (performance.primarySignal.priority === "HIGH" || performance.primarySignal.priority === "CRITICAL") &&
    Boolean(performance.recommendedManagementMove);

  if (!hasClearSignal || !decision || !performance) return null;

  return {
    reviewType: "CLEAR_ACTION_REQUIRED",
    executiveRead: "Burada yönetim odağı net; mevcut kararın yönünü dağıtmadan ilerletmek gerekiyor.",
    mainManagementConcern: performance.managementConcern ?? decision.promptSummary.riskLine,
    nonNegotiableFocus: performance.managementConcern ?? decision.promptSummary.decisionLine,
    leadershipTone: performance.primarySignal?.priority === "CRITICAL" ? "FIRM" : "DIRECT",
    userDirection: performance.recommendedManagementMove ?? "Mevcut karar yönünü doğal yönetici diliyle destekle.",
    clarificationNeeded: null,
    shouldChallengeUser: performance.primarySignal?.priority === "CRITICAL",
    shouldProtectUser: Boolean(performance.userProtectionInstruction),
    shouldSurfaceToUser: true,
    sourceSignals: buildSourceSignals([
      performance.primarySignal?.type ?? null,
      "executiveDecisionResult",
    ]),
    primarySource: "executivePerformanceSignal",
  };
}

function buildDataInsufficientReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft | null {
  const decision = input.executiveDecisionResult;
  const performance = input.executivePerformanceSignalResult;
  const hasLowData =
    decision?.overallConfidence === "LOW" ||
    performance === null ||
    performance === undefined ||
    performance.confidence === "LOW" ||
    input.operatingContext.diagnostics.failedSteps.length > 0;

  if (!hasLowData) return null;

  return {
    reviewType: "DATA_INSUFFICIENT",
    executiveRead: "Burada kesin konuşmak yerine önce eksik veriyi veya sorumluyu netleştirmek gerekiyor.",
    mainManagementConcern: decision?.dataQualityNote ?? "Yönetim kanaati için veri veya sahiplik netliği sınırlı.",
    nonNegotiableFocus: null,
    leadershipTone: "CAUTIOUS",
    userDirection: "Kesin hüküm kurma; önce tek netleştirme ihtiyacını sor.",
    clarificationNeeded: buildClarificationNeeded(input),
    shouldChallengeUser: false,
    shouldProtectUser: true,
    shouldSurfaceToUser: false,
    sourceSignals: buildSourceSignals([
      decision?.overallConfidence === "LOW" ? "executiveDecisionResult.lowConfidence" : null,
      performance?.confidence === "LOW" ? "executivePerformanceSignal.lowConfidence" : null,
      input.operatingContext.diagnostics.failedSteps.length > 0 ? "operatingContext.failedSteps" : null,
    ]),
    primarySource: "dataQuality",
  };
}

function buildLowRiskMonitorReview(
  input: ExecutiveManagementReviewEngineInput,
): ReviewDraft {
  const focusInstruction = input.operatingContext.executiveFocus?.managementInstruction ?? null;

  return {
    reviewType: "LOW_RISK_MONITOR_ONLY",
    executiveRead: "Burada acil yönetim baskısı yok; ana mesele ritmi bozmadan izlemek.",
    mainManagementConcern: null,
    nonNegotiableFocus: null,
    leadershipTone: "CALM",
    userDirection: focusInstruction ?? "Kullanıcıyı gereksiz uyarmadan mevcut gündemi sakin biçimde izle.",
    clarificationNeeded: null,
    shouldChallengeUser: false,
    shouldProtectUser: false,
    shouldSurfaceToUser: false,
    sourceSignals: buildSourceSignals(["lowRiskMonitor"]),
    primarySource: "executiveOperatingContext",
  };
}

function resolveConfidence(
  input: ExecutiveManagementReviewEngineInput,
  hasLowData: boolean,
  sourceCount: number,
): ExecutiveManagementReviewConfidence {
  if (hasLowData) return "LOW";
  if (input.executivePerformanceSignalResult?.confidence === "HIGH" && sourceCount >= 3) return "HIGH";
  if (input.executiveDecisionResult?.overallConfidence === "HIGH" && sourceCount >= 3) return "HIGH";
  return "MEDIUM";
}

function resolveHasLowData(input: ExecutiveManagementReviewEngineInput): boolean {
  return (
    input.executiveDecisionResult?.overallConfidence === "LOW" ||
    input.executivePerformanceSignalResult?.confidence === "LOW" ||
    input.operatingContext.diagnostics.failedSteps.length > 0
  );
}

function countSources(input: ExecutiveManagementReviewEngineInput): number {
  return [
    input.operatingContext.executiveDecisionFollowUp,
    input.operatingContext.executiveAccountability,
    input.operatingContext.executiveAwareness,
    input.operatingContext.executiveForecast,
    input.operatingContext.executiveFocus,
    input.operatingContext.executiveAlerts,
    input.executiveDecisionResult,
    input.executivePerformanceSignalResult,
    input.executiveResponsibilityMatrixResult,
  ].filter(Boolean).length;
}

function buildClarificationNeeded(
  input: ExecutiveManagementReviewEngineInput,
): string {
  const matrix = input.executiveResponsibilityMatrixResult;
  if (matrix?.requiresOwnerClarification) {
    return "Sorumlu taraf ve beklenen çıktı netleşmeli.";
  }

  const accountabilityQuestion =
    input.operatingContext.executiveAccountability?.promptSummary.clarifyingQuestion;
  if (accountabilityQuestion) return accountabilityQuestion;

  if (input.operatingContext.diagnostics.failedSteps.length > 0) {
    return "Eksik veri kaynağı tamamlanmadan kesin yönetim kanaati kurulmamalı.";
  }

  return "Karar için eksik bilgi veya karar kriteri netleşmeli.";
}

function buildReviewText(input: ExecutiveManagementReviewEngineInput): string {
  const decision = input.executiveDecisionResult?.primaryDecision ?? null;
  const followUp = input.operatingContext.executiveDecisionFollowUp?.primaryFollowUp ?? null;
  const accountability = input.operatingContext.executiveAccountability?.primaryAccountabilityIssue ?? null;
  const matrix = input.executiveResponsibilityMatrixResult;
  const performance = input.executivePerformanceSignalResult;

  return normalizeText(
    [
      decision?.category,
      decision?.title,
      decision?.rationale,
      decision?.firstAction,
      ...(decision?.risks ?? []),
      followUp?.title,
      followUp?.reason,
      accountability?.title,
      accountability?.expectedAction,
      matrix?.expectedOutput,
      matrix?.managementInstruction,
      matrix?.escalationRisk,
      performance?.managementConcern,
      performance?.recommendedManagementMove,
    ].filter(Boolean).join(" "),
  );
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

function buildSourceSignals(values: Array<string | null>): string[] {
  return values.filter((value): value is string => value !== null);
}
