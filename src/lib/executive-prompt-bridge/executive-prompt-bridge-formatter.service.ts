import type { ExecutiveManagerContext } from "./executive-prompt-bridge.types";
import type { ExecutivePrioritizationResult } from "@/lib/executive-prioritization";
import type { ExecutiveOperatingRhythm } from "@/lib/executive-operating-rhythm";
import type { ExecutiveAwarenessWatchArea, ExecutiveAwarenessDirection } from "@/lib/executive-awareness/executive-awareness.types";
import type { ExecutiveScorecardArea, ExecutiveScorecardLevel } from "@/lib/executive-scorecard/executive-scorecard.types";
import type { ExecutiveFocusArea, ExecutiveFocusLevel } from "@/lib/executive-focus/executive-focus.types";
import type { ExecutiveNarrativePosture, ExecutiveNarrativeTone } from "@/lib/executive-narrative/executive-narrative.types";
import type { ExecutiveCouncilPosition } from "@/lib/executive-council/executive-council.types";

export function formatExecutiveManagerContext(ctx: ExecutiveManagerContext): string {
  const lines: string[] = ["Yönetim durumu:"];

  const prioritySection = formatExecutivePriority(ctx.executivePriority);
  if (prioritySection) {
    lines.push("", prioritySection);
  }

  const rhythmSection = formatOperatingRhythm(ctx.executiveOperatingRhythm);
  if (rhythmSection) {
    lines.push("", rhythmSection);
  }

  lines.push(`- ${ctx.situationalRead}`);
  lines.push(`- Gündem: ${formatFocusInstruction(ctx.focusInstruction)}`);
  lines.push(`- İlk adım: ${ctx.primaryFirstMove}`);

  if (ctx.firstAttention && ctx.firstAttention !== ctx.primaryFirstMove) {
    lines.push(`- Kritik takip: ${ctx.firstAttention}`);
  }

  const watchLabel = formatWatchAreas(ctx.watchAreas, ctx.weakestArea);
  if (watchLabel) {
    lines.push(`- İzleme alanları: ${watchLabel}`);
  }

  if (ctx.secondaryFocusArea && ctx.secondaryFocusArea !== ctx.primaryFocusArea) {
    lines.push(`- İkincil baskı: ${translateFocusArea(ctx.secondaryFocusArea)}`);
  }

  if (ctx.dataQualityNote) {
    lines.push(`- Veri notu: ${ctx.dataQualityNote}`);
  }

  if (ctx.goalSummary) {
    lines.push(`- Hedef durumu: ${ctx.goalSummary}`);
  }

  const goalAchievementSection = formatGoalAchievement(ctx);
  if (goalAchievementSection) {
    lines.push("", goalAchievementSection);
  }

  const decisionSection = formatExecutiveDecision(ctx);
  if (decisionSection) {
    lines.push("", decisionSection);
  }

  const followUpSection = formatExecutiveDecisionFollowUp(ctx);
  if (followUpSection) {
    lines.push("", followUpSection);
  }

  const accountabilitySection = formatExecutiveAccountability(ctx);
  if (accountabilitySection) {
    lines.push("", accountabilitySection);
  }

  const delegationSection = formatExecutiveDelegation(ctx);
  if (delegationSection) {
    lines.push("", delegationSection);
  }

  const responsibilityMatrixSection = formatExecutiveResponsibilityMatrix(ctx);
  if (responsibilityMatrixSection) {
    lines.push("", responsibilityMatrixSection);
  }

  const performanceSignalSection = formatExecutivePerformanceSignal(ctx);
  if (performanceSignalSection) {
    lines.push("", performanceSignalSection);
  }

  const managementReviewSection = formatExecutiveManagementReview(ctx);
  if (managementReviewSection) {
    lines.push("", managementReviewSection);
  }

  const customerPortfolioSection = formatCustomerPortfolio(ctx);
  if (customerPortfolioSection) {
    lines.push("", customerPortfolioSection);
  }

  const customerHealthSection = formatCustomerHealth(ctx);
  if (customerHealthSection) {
    lines.push("", customerHealthSection);
  }

  lines.push("", formatExpense(ctx));

  const financialHealthSection = formatFinancialHealth(ctx);
  if (financialHealthSection) {
    lines.push("", financialHealthSection);
  }

  const companyPerformanceSection = formatCompanyPerformance(ctx);
  if (companyPerformanceSection) {
    lines.push("", companyPerformanceSection);
  }

  const followUpIntelligenceSection = formatExecutiveFollowUpIntelligence(ctx);
  if (followUpIntelligenceSection) {
    lines.push("", followUpIntelligenceSection);
  }

  const behaviorHint = formatBehaviorHint(ctx);
  if (behaviorHint) {
    lines.push("", behaviorHint);
  }

  const managementReadSection = formatManagementRead(ctx);
  if (managementReadSection) {
    lines.push("", managementReadSection);
  }

  lines.push(
    "",
    "Bu bölüm nasıl kullanılacak:",
    "- Bugünkü genel yönetim sezgini şekillendir; kullanıcıya teknik terim aktarma.",
    "- Odak ve ilk adım bilgisini kullanıcı sormadan zorla gündeme getirme.",
    "- Kullanıcı öncelik veya ne yapayım sorarsa bu bilgiden yararlan.",
    "- Delegasyon bilgisini görev atama sistemi gibi sunma; yalnızca yönetici delegasyon önerisi olarak doğal cevapta kullan.",
    "- Sorumluluk matrisini kullanıcıya RACI tablosu gibi mekanik sunma. Doğal yönetici diliyle, sadece gerekli olduğunda görünür kıl. Görev atama sistemi gibi davranma.",
    "- Teknik sinyal adlarını kullanıcıya söyleme. Puanlama, KPI veya personel değerlendirmesi dili kullanma. Gerekliyse doğal yönetici diliyle darboğazı ve sahiplik sorununu belirt.",
    "- Review type veya teknik alan adlarını kullanıcıya söyleme. Karar motorunun ilk adımını yeniden üretme. Bu bölümü doğal yönetici kanaati ve ton ayarı olarak kullan.",
    "- Dahili kaynak adı, sistem etiketi veya teknik alan adı söyleme.",
  );

  return lines.join("\n");
}

function formatExecutivePriority(priority: ExecutivePrioritizationResult | null): string | null {
  if (!priority || priority.overallPriorityLevel === "IGNORE_FOR_NOW") return null;
  if (!priority.topExecutivePriority && priority.topExecutiveMoves.length === 0) return null;

  const lines: string[] = ["YÖNETICI ÖNCELİĞİ:"];

  const top = priority.topExecutivePriority;
  if (top) {
    lines.push(`- Bugünkü öncelik: ${top.headline}`);
    lines.push(`- Neden şimdi: ${top.whyNow}`);
    lines.push(`- Hareketsiz kalmanın bedeli: ${top.costOfInaction}`);
  }

  if (priority.topExecutiveMoves.length > 0) {
    lines.push("- Önerilen yönetici hamleleri:");
    for (const move of priority.topExecutiveMoves) {
      const urgencyLabel = move.urgency === "TODAY" ? "bugün" : "bu hafta";
      lines.push(`  ${move.rank}. [${move.area} — ${urgencyLabel}] ${move.action}`);
      if (move.specificTarget) {
        lines.push(`     Hedef: ${move.specificTarget}`);
      }
      if (move.concreteNextStep && move.concreteNextStep !== move.action) {
        lines.push(`     Sonraki adım: ${move.concreteNextStep}`);
      }
      if (move.riskIfIgnored) {
        lines.push(`     İhmal riski: ${move.riskIfIgnored}`);
      }
    }
  }

  if (priority.ignoreForNow.length > 0) {
    const ignoreLabels = priority.ignoreForNow.map((i) => i.area).join(", ");
    lines.push(`- Şimdilik görmezden gelebilirsin: ${ignoreLabels}`);
  }

  lines.push("- Bu bölümü yönetici kanaati olarak kullan; listeyi mekanik biçimde okuma.");

  return lines.join("\n");
}

function formatExecutiveDelegation(ctx: ExecutiveManagerContext): string | null {
  const delegation = ctx.executiveDelegation;
  if (!delegation) return null;

  const lines = [
    "Delegasyon değerlendirmesi:",
    `- Sorumlu tipi: ${translateDelegationOwnerType(delegation.ownerType)}`,
    `- Önerilen sahip: ${delegation.ownerName ?? "Net değil"}`,
    `- Neden: ${delegation.responsibilityReason}`,
    `- Sahibinden beklenen aksiyon: ${delegation.requiredActionByOwner}`,
    `- Kullanıcının şimdi yapacağı şey: ${delegation.userShouldDoNow}`,
    `- Atanmazsa risk: ${delegation.riskIfNotAssigned}`,
    `- Güven: ${translateDelegationConfidence(delegation.confidence)}`,
    "- Görev oluşturma: Hayır; sadece yönetici önerisi.",
  ];

  if (delegation.delegationAdvice) {
    lines.splice(4, 0, `- Öneri: ${delegation.delegationAdvice}`);
  }

  return lines.join("\n");
}

function formatExecutiveResponsibilityMatrix(ctx: ExecutiveManagerContext): string | null {
  const matrix = ctx.executiveResponsibilityMatrix;
  if (!matrix) return null;

  return [
    "Sorumluluk matrisi:",
    `- Fiili sorumlu: ${formatMatrixOwner(matrix.responsibleParty)}`,
    `- Karar sahibi: ${formatMatrixOwner(matrix.decisionOwner)}`,
    `- Takip sahibi: ${formatMatrixOwner(matrix.followUpOwner)}`,
    `- Risk sahibi: ${formatMatrixOwner(matrix.riskOwner)}`,
    `- Beklenen çıktı: ${matrix.expectedOutput}`,
    `- Kullanıcının rolü: ${matrix.userRoleInThisMatter}`,
    `- Yönetim talimatı: ${matrix.managementInstruction}`,
    `- Sorumlu netleştirme gerekli mi: ${matrix.requiresOwnerClarification ? "Evet" : "Hayır"}`,
    `- Görev oluşturma: ${matrix.shouldCreateTask ? "Evet" : "Hayır"}`,
  ].join("\n");
}

function formatExecutivePerformanceSignal(ctx: ExecutiveManagerContext): string | null {
  const signal = ctx.executivePerformanceSignal;
  if (!signal?.primarySignal) return null;
  if (!signal.shouldSurfaceToUser) return null;

  return [
    "Yönetim performans sinyali:",
    `- Ana kaygı: ${signal.managementConcern ?? signal.primarySignal.title}`,
    `- Önerilen yönetim hamlesi: ${signal.recommendedManagementMove ?? signal.primarySignal.suggestedResponseBehavior}`,
    `- Kullanıcıyı koruma talimatı: ${signal.userProtectionInstruction ?? "Görev, puan veya değerlendirme dili kullanma."}`,
    `- Güven: ${translatePerformanceSignalConfidence(signal.confidence)}`,
  ].join("\n");
}

function formatCustomerPortfolio(ctx: ExecutiveManagerContext): string | null {
  const p = ctx.customerPortfolio;
  if (!p) return null;

  const lines = [
    "Müşteri portföyü:",
    `- Özet: ${p.portfolioSummary}`,
    `- Konsantrasyon riski: ${translateConcentrationRisk(p.concentrationRiskLevel)}`,
  ];

  if (p.atRiskCount > 0) lines.push(`- Tahsilat riski olan müşteri: ${p.atRiskCount}`);
  if (p.strategicCount > 0) lines.push(`- Stratejik müşteri: ${p.strategicCount}`);
  if (p.churnRiskCount > 0) lines.push(`- Churn riski: ${p.churnRiskCount} müşteri hareketsiz`);

  for (const signal of p.executiveSignals.slice(0, 3)) {
    lines.push(`- Sinyal: ${signal}`);
  }

  if (p.confidence === "LOW") {
    lines.push("- Veri güveni: Düşük — müşteri bağlantısı eksik; bu verileri kesin olarak sunma.");
  }

  return lines.join("\n");
}

function formatCustomerHealth(ctx: ExecutiveManagerContext): string | null {
  const h = ctx.customerHealth;
  if (!h) return null;
  if (h.criticalCount === 0 && h.atRiskCount === 0 && h.watchCount === 0) return null;

  const lines = ["Müşteri sağlık özeti:"];
  const { distribution } = h;

  const parts: string[] = [];
  if (h.criticalCount > 0) parts.push(`${h.criticalCount} kritik`);
  if (h.atRiskCount > 0) parts.push(`${h.atRiskCount} riskli`);
  if (h.watchCount > 0) parts.push(`${h.watchCount} izlemede`);
  if (distribution.healthyCount > 0) parts.push(`${distribution.healthyCount} sağlıklı`);
  lines.push(`- Dağılım: ${parts.join(", ")}`);

  if (h.topCriticalName) lines.push(`- En kritik müşteri: ${h.topCriticalName}`);
  if (h.topAtRiskName && h.topAtRiskName !== h.topCriticalName) {
    lines.push(`- Öne çıkan risk: ${h.topAtRiskName}`);
  }

  for (const insight of h.topInsights.slice(0, 2)) {
    lines.push(`- ${insight}`);
  }

  if (h.topUpsellOpportunities.length > 0 || h.topRepurchaseCandidates.length > 0) {
    lines.push("Müşteri gelir fırsatı:");
    if (h.topUpsellOpportunities.length > 0) {
      lines.push(`- Upsell adayları: ${h.topUpsellOpportunities.join(", ")}`);
    }
    if (h.topRepurchaseCandidates.length > 0) {
      lines.push(`- Yeniden satış adayları: ${h.topRepurchaseCandidates.join(", ")}`);
    }
  }

  if (h.topRecommendedActions.length > 0) {
    lines.push("Müşteri aksiyon önerileri:");
    for (const action of h.topRecommendedActions) {
      lines.push(`- ${action}`);
    }
  }

  if (h.confidence === "LOW") {
    lines.push("- Veri güveni: Düşük — müşteri bağlantısı eksik; kesin olarak sunma.");
  }

  return lines.join("\n");
}

function formatExpense(ctx: ExecutiveManagerContext): string {
  const expCtx = ctx.expenseContext;
  const intel = ctx.expenseIntelligence;

  if (!expCtx?.hasExpenseData) {
    return [
      "Gider durumu:",
      "- Gider verisi henüz yok; gider, burn rate ve finansal sağlık yorumu üretme.",
    ].join("\n");
  }

  const lines = ["Gider durumu:"];
  lines.push(`- Toplam gider: ₺${formatExpenseAmount(expCtx.totalExpenseAmount)}`);
  lines.push(`- Tekrar eden aylık gider tabanı: ₺${formatExpenseAmount(expCtx.monthlyBurnRate)}`);

  if (expCtx.overdueCount > 0) {
    lines.push(`- Gecikmiş gider: ₺${formatExpenseAmount(expCtx.totalOverdueAmount)} / ${expCtx.overdueCount} kalem`);
  }

  if (intel) {
    lines.push(`- Gider riski: ${translateBurnRisk(intel.burnRiskLevel)}`);
    lines.push(`- Güven: ${translateExpenseConfidence(intel.confidence)}`);
    lines.push(`- Yönetici özeti: ${intel.executiveSummary}`);

    const actions = intel.recommendedActions.slice(0, 2);
    if (actions.length > 0) {
      lines.push(`- Öncelikli aksiyonlar: ${actions.join("; ")}`);
    }
  }

  lines.push("- Kâr/net nakit yorumu üretme; burada yalnızca gider tarafı görülüyor.");

  return lines.join("\n");
}

function formatFinancialHealth(ctx: ExecutiveManagerContext): string | null {
  const fh = ctx.financialHealth;

  if (!fh) {
    return [
      "Finansal sağlık:",
      "- Finansal sağlık sentezi için tahsilat ve gider verisi birlikte gerekli; eksik veri varsa kesin finansal sağlık yorumu üretme.",
    ].join("\n");
  }

  const lines = ["Finansal sağlık:"];
  lines.push(`- Finansal sağlık seviyesi: ${translateFinancialHealthLevel(fh.financialHealthLevel)}`);
  lines.push(`- Nakit baskısı: ${translateFinancialHealthLevel(fh.cashPressureLevel)}`);

  if (fh.collectionCoverageRatio !== null) {
    lines.push(`- Tahsilat karşılama oranı: ${fh.collectionCoverageRatio.toFixed(2)}`);
  } else {
    lines.push("- Tahsilat karşılama oranı: Hesaplanamadı (tahsilat veya gider verisi eksik)");
  }

  if (fh.monthlyBurnRate > 0) {
    lines.push(`- Aylık gider tabanı: ₺${fh.monthlyBurnRate.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`);
  }

  lines.push(`- Güven: ${translateFinancialHealthConfidence(fh.confidence)}`);
  lines.push(`- Yönetici özeti: ${fh.executiveSummary}`);

  if (fh.topRiskWarnings.length > 0) {
    lines.push(`- Öncelikli riskler: ${fh.topRiskWarnings.join("; ")}`);
  }

  if (fh.topRecommendedActions.length > 0) {
    lines.push(`- Öncelikli aksiyonlar: ${fh.topRecommendedActions.join("; ")}`);
  }

  lines.push(
    "- Yasak: \"Şirket kârda\" veya \"net nakit pozisyonu iyi/kötü\" gibi muhasebe yorumu yapma. Runway veya kâr hesaplama. Banka/kasa bakiyesi varmış gibi konuşma.",
  );

  return lines.join("\n");
}

function translateFinancialHealthLevel(level: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateFinancialHealthConfidence(confidence: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function formatExpenseAmount(amount: number): string {
  return amount.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function translateBurnRisk(level: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateExpenseConfidence(confidence: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function translateConcentrationRisk(level: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function formatExecutiveManagementReview(ctx: ExecutiveManagerContext): string | null {
  const review = ctx.executiveManagementReview;
  if (!review) return null;

  return [
    "Yönetim kanaati:",
    `- Genel müdürün okuması: ${review.executiveRead}`,
    `- Ana yönetim kaygısı: ${review.mainManagementConcern ?? "Yok"}`,
    `- Bekletilmeyecek odak: ${review.nonNegotiableFocus ?? "Yok"}`,
    `- Liderlik tonu: ${translateManagementReviewLeadershipTone(review.leadershipTone)}`,
    `- Kullanıcı yönlendirmesi: ${review.userDirection}`,
    `- Netleştirme ihtiyacı: ${review.clarificationNeeded ?? "Yok"}`,
    `- Kullanıcıyı zorlamalı mı: ${review.shouldChallengeUser ? "Evet" : "Hayır"}`,
    `- Kullanıcıyı korumalı mı: ${review.shouldProtectUser ? "Evet" : "Hayır"}`,
    `- Kullanıcıya görünür olmalı mı: ${review.shouldSurfaceToUser ? "Evet" : "Hayır"}`,
    `- Güven: ${translateManagementReviewConfidence(review.confidence)}`,
  ].join("\n");
}

function formatExecutiveAccountability(ctx: ExecutiveManagerContext): string | null {
  const accountability = ctx.executiveAccountability;
  if (!accountability) return null;

  const lines = [
    "Sorumluluk takibi:",
    `- Özet: ${accountability.summaryLine}`,
    `- Hatırlatma dozu: ${translateReminderPolicy(accountability.reminderPolicy)}`,
    `- Sayılar: gecikmiş ${accountability.overdueCount}, sorumlusu belirsiz ${accountability.missingOwnerCount}, yaklaşan ${accountability.upcomingDeadlineCount}`,
  ];

  if (accountability.primaryIssueLine) {
    lines.push(`- Ana konu: ${accountability.primaryIssueLine}`);
  }

  for (const alertLine of accountability.alertLines.slice(0, 3)) {
    lines.push(`- Uyarı: ${alertLine}`);
  }

  if (accountability.clarifyingQuestion) {
    lines.push(`- Netleştirme: ${accountability.clarifyingQuestion}`);
  }

  return lines.join("\n");
}

function formatExecutiveDecisionFollowUp(ctx: ExecutiveManagerContext): string | null {
  const followUp = ctx.executiveDecisionFollowUp;
  if (!followUp || !followUp.primaryStatus) return null;

  const lines = [
    "Karar takibi:",
    `- Özet: ${followUp.summaryLine}`,
    `- Durum: ${translateFollowUpStatus(followUp.primaryStatus)}`,
  ];

  if (followUp.primaryTitle) {
    lines.push(`- Başlık: ${followUp.primaryTitle}`);
  }

  if (followUp.primaryActionHint) {
    lines.push(`- Takip: ${followUp.primaryActionHint}`);
  }

  return lines.join("\n");
}

function formatBehaviorHint(ctx: ExecutiveManagerContext): string | null {
  const hints: string[] = [];

  const urgencyNote = postureToUrgencyNote(ctx.posture);
  if (urgencyNote) hints.push(urgencyNote);

  if (hints.length < 2) {
    const stateNote = resolveStateNote(ctx.direction, ctx.health, ctx.tone, ctx.primaryFocusLevel);
    if (stateNote) hints.push(stateNote);
  }

  if (hints.length === 0) return null;
  return hints.map((h) => `- ${h}`).join("\n");
}

function resolveStateNote(
  direction: ExecutiveAwarenessDirection,
  health: ExecutiveScorecardLevel,
  tone: ExecutiveNarrativeTone,
  focusLevel: ExecutiveFocusLevel,
): string | null {
  if (focusLevel === "BLOCKED") return "Odak alanında blokaj var; doğrudan çözüm üret.";
  if (focusLevel === "URGENT") return "Odak acil; doğrudan ve uygulanabilir ol.";
  if (direction === "CRITICAL" || (direction === "DETERIORATING" && health === "AT_RISK")) {
    return "Şirket baskı altında; güçlü ve net kal.";
  }
  if (tone === "CAUTIOUS") return "Risk yüksek; ölçülü öner.";
  return null;
}

function formatFocusInstruction(instruction: string): string {
  return instruction.length > 120 ? `${instruction.slice(0, 120)}…` : instruction;
}

function formatWatchAreas(
  watchAreas: ExecutiveAwarenessWatchArea[],
  weakestArea: ExecutiveScorecardArea | null,
): string | null {
  const labels: string[] = watchAreas.map(translateWatchArea);

  const weakLabel = weakestArea ? translateScorecardArea(weakestArea) : null;
  if (weakLabel && !labels.includes(weakLabel)) {
    labels.unshift(weakLabel);
  }

  const unique = [...new Set(labels)].slice(0, 4);
  return unique.length > 0 ? unique.join(", ") : null;
}

function translateWatchArea(area: ExecutiveAwarenessWatchArea): string {
  const map: Record<ExecutiveAwarenessWatchArea, string> = {
    CASH: "Nakit",
    SALES: "Satış",
    COLLECTION: "Tahsilat",
    MARKET: "Piyasa",
    EXECUTION: "İcra",
    DECISION_FOLLOW_UP: "Karar takibi",
    DATA_QUALITY: "Veri kalitesi",
  };
  return map[area] ?? area;
}

function translateScorecardArea(area: ExecutiveScorecardArea): string {
  const map: Record<ExecutiveScorecardArea, string> = {
    CASH_HEALTH: "Nakit",
    COLLECTION_HEALTH: "Tahsilat",
    SALES_PIPELINE_HEALTH: "Satış",
    EXECUTION_HEALTH: "İcra",
    DECISION_DISCIPLINE: "Karar takibi",
    MARKET_EXPOSURE: "Piyasa",
    SIGNAL_MOMENTUM: "Sinyal trendi",
    DATA_QUALITY: "Veri kalitesi",
  };
  return map[area] ?? area;
}

function translateFocusArea(area: ExecutiveFocusArea): string {
  const map: Record<ExecutiveFocusArea, string> = {
    CASH: "Nakit",
    COLLECTION: "Tahsilat",
    SALES: "Satış",
    EXECUTION: "İcra",
    DECISION_FOLLOW_UP: "Karar takibi",
    MARKET: "Piyasa",
    DATA_QUALITY: "Veri kalitesi",
    GENERAL_CONTROL: "Genel kontrol",
  };
  return map[area] ?? area;
}

function formatManagementRead(ctx: ExecutiveManagerContext): string | null {
  const parts: string[] = [];

  if (ctx.topConcern) {
    parts.push(`- Öne çıkan gündem: ${ctx.topConcern}`);
  }

  if (ctx.councilPosition) {
    const posLabel = translateCouncilPosition(ctx.councilPosition);
    parts.push(`- Genel yönetim pozisyonu: ${posLabel}`);
  }

  if (ctx.councilStanceRationale) {
    parts.push(`- Gerekçe: ${ctx.councilStanceRationale}`);
  }

  if (ctx.topCouncilAction) {
    parts.push(`- Önerilen öncelikli eylem: ${ctx.topCouncilAction}`);
  }

  if (parts.length === 0) return null;

  return ["Ortak yönetim sinyali:", ...parts].join("\n");
}

function formatExecutiveDecision(ctx: ExecutiveManagerContext): string | null {
  const decision = ctx.executiveDecision;
  if (!decision) return null;

  const lines = [
    "Yönetici kararı:",
    `- Öncelik: ${decision.firstAction}`,
    `- Karar: ${decision.decisionLine}`,
    `- Seviye: ${translateDecisionPriority(decision.priority)} / ${translateDecisionCategory(decision.category)}`,
    `- Güven: ${translateConfidence(decision.confidence)}`,
  ];

  if (decision.riskLine) {
    lines.splice(3, 0, `- Risk: ${decision.riskLine}`);
  }

  return lines.join("\n");
}

function formatMatrixOwner(input: {
  ownerType: NonNullable<ExecutiveManagerContext["executiveResponsibilityMatrix"]>["responsibleParty"]["ownerType"];
  ownerName?: string | null;
  reason: string;
}): string {
  const label = translateDelegationOwnerType(input.ownerType);
  const name = input.ownerName ? ` / ${input.ownerName}` : "";
  return `${label}${name} (${input.reason})`;
}

function translateDelegationOwnerType(
  ownerType: NonNullable<ExecutiveManagerContext["executiveDelegation"]>["ownerType"],
): string {
  const map: Record<NonNullable<ExecutiveManagerContext["executiveDelegation"]>["ownerType"], string> = {
    USER: "Kullanıcı / yönetim",
    TEAM_MEMBER: "Ekip üyesi",
    CUSTOMER: "Müşteri",
    SUPPLIER: "Tedarikçi",
    SYSTEM: "Sistem takibi",
    UNASSIGNED: "Belirsiz",
  };

  return map[ownerType] ?? ownerType;
}

function translateDelegationConfidence(
  confidence: NonNullable<ExecutiveManagerContext["executiveDelegation"]>["confidence"],
): string {
  const map: Record<NonNullable<ExecutiveManagerContext["executiveDelegation"]>["confidence"], string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };

  return map[confidence] ?? confidence;
}

function translateDecisionPriority(
  priority: NonNullable<ExecutiveManagerContext["executiveDecision"]>["priority"],
): string {
  const map: Record<NonNullable<ExecutiveManagerContext["executiveDecision"]>["priority"], string> = {
    LOW: "Düşük",
    WATCH: "İzleme",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
  };
  return map[priority] ?? priority;
}

function translateDecisionCategory(
  category: NonNullable<ExecutiveManagerContext["executiveDecision"]>["category"],
): string {
  const map: Record<NonNullable<ExecutiveManagerContext["executiveDecision"]>["category"], string> = {
    CASH: "Nakit",
    COLLECTION: "Tahsilat",
    SALES: "Satış",
    EXECUTION: "İcra",
    DECISION_FOLLOW_UP: "Karar takibi",
    MARKET: "Piyasa",
    DATA_QUALITY: "Veri kalitesi",
    STRATEGY: "Strateji",
    PEOPLE: "Ekip",
    CUSTOMER: "Müşteri",
  };
  return map[category] ?? category;
}

function translateConfidence(
  confidence: NonNullable<ExecutiveManagerContext["executiveDecision"]>["confidence"],
): string {
  const map: Record<NonNullable<ExecutiveManagerContext["executiveDecision"]>["confidence"], string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function translatePerformanceSignalConfidence(
  confidence: NonNullable<ExecutiveManagerContext["executivePerformanceSignal"]>["confidence"],
): string {
  const map: Record<NonNullable<typeof confidence>, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function translateManagementReviewLeadershipTone(
  tone: NonNullable<ExecutiveManagerContext["executiveManagementReview"]>["leadershipTone"],
): string {
  const map: Record<NonNullable<typeof tone>, string> = {
    CALM: "Sakin",
    DIRECT: "Doğrudan",
    FIRM: "Kararlı",
    CAUTIOUS: "Temkinli",
  };
  return map[tone] ?? tone;
}

function translateManagementReviewConfidence(
  confidence: NonNullable<ExecutiveManagerContext["executiveManagementReview"]>["confidence"],
): string {
  const map: Record<NonNullable<typeof confidence>, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function translateFollowUpStatus(
  status: NonNullable<ExecutiveManagerContext["executiveDecisionFollowUp"]>["primaryStatus"],
): string {
  if (!status) return "Takip yok";

  const map: Record<NonNullable<typeof status>, string> = {
    OPEN_PROPOSED: "Acik karar",
    AWAITING_RESULT: "Sonuc bekleniyor",
    OVERDUE: "Gecikmis karar",
    RESOLVED_SUCCESS: "Basarili sonuc",
    RESOLVED_FAILURE: "Basarisiz sonuc",
    ABANDONED: "Vazgecilen karar",
    REAGENDA_REQUIRED: "Yeniden gundem gerekli",
  };

  return map[status] ?? status;
}

function translateReminderPolicy(
  policy: NonNullable<ExecutiveManagerContext["executiveAccountability"]>["reminderPolicy"],
): string {
  const map: Record<NonNullable<typeof policy>, string> = {
    SILENT: "Sessiz izle",
    ASK_SOFTLY: "Yumuşak sor",
    ASK_DIRECTLY: "Doğrudan sor",
    ESCALATE: "Yönetici ciddiyetiyle yükselt",
  };

  return map[policy] ?? policy;
}

function translateCouncilPosition(position: ExecutiveCouncilPosition): string {
  const map: Record<ExecutiveCouncilPosition, string> = {
    STABLE: "Dengeli",
    WATCHFUL: "Dikkatli",
    PRESSURED: "Baskı altında",
    CRITICAL: "Kritik",
    UNCERTAIN: "Belirsiz",
  };
  return map[position] ?? position;
}

function formatCompanyPerformance(ctx: ExecutiveManagerContext): string | null {
  const cp = ctx.companyPerformance;
  if (!cp || cp.confidence === "LOW") return null;

  const lines = ["Şirket performans sinyali:"];
  lines.push(`- Genel durum: ${translateCompanyPerformanceLevel(cp.performanceLevel)}`);
  lines.push(`- İvme: ${translateCompanyPerformanceMomentum(cp.momentum)}`);

  if (cp.primaryRisk) lines.push(`- Öne çıkan risk: ${cp.primaryRisk}`);
  if (cp.primaryStrength) lines.push(`- Öne çıkan güç: ${cp.primaryStrength}`);

  lines.push(`- Genel okuma: ${cp.executiveSummary}`);
  lines.push(`- Güven: ${translateCompanyPerformanceConfidence(cp.confidence)}`);
  lines.push("- Bu bölümü sayısal skor olarak aktarma; kanaat ve yönetim sezgisi olarak kullan.");

  return lines.join("\n");
}

function translateCompanyPerformanceLevel(level: string): string {
  const map: Record<string, string> = {
    STRONG: "Güçlü",
    STABLE: "Dengeli",
    PRESSURED: "Baskı altında",
    CRITICAL: "Kritik",
  };
  return map[level] ?? level;
}

function translateCompanyPerformanceMomentum(momentum: string): string {
  const map: Record<string, string> = {
    ACCELERATING: "İvme artıyor",
    STABLE: "Dengeli seyrediyor",
    DECELERATING: "İvme yavaşlıyor",
    UNKNOWN: "Belirlenemedi",
  };
  return map[momentum] ?? momentum;
}

function translateCompanyPerformanceConfidence(confidence: string): string {
  const map: Record<string, string> = {
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
  };
  return map[confidence] ?? confidence;
}

function formatGoalAchievement(ctx: ExecutiveManagerContext): string | null {
  const g = ctx.goalAchievement;
  if (!g || g.monthlyTarget === null || g.forecastedMonthEndRevenue === null || g.goalAchievementRate === null) {
    return null;
  }

  const ratePct = Math.round(g.goalAchievementRate * 100);
  const lines = [
    "Hedef gerçekleşme görünümü:",
    `- Aylık hedef: ₺${g.monthlyTarget.toLocaleString("tr-TR")}`,
    `- Ay sonu tahmini: ₺${g.forecastedMonthEndRevenue.toLocaleString("tr-TR")}`,
    `- Hedef gerçekleşme oranı: %${ratePct}`,
  ];

  if (g.goalGap !== null && g.goalGap > 0) {
    lines.push(`- Hedef açığı: ₺${g.goalGap.toLocaleString("tr-TR")}`);
  } else {
    lines.push("- Hedef açığı: Yok (hedefe ulaşılıyor)");
  }

  return lines.join("\n");
}

function formatOperatingRhythm(rhythm: ExecutiveOperatingRhythm | null): string | null {
  if (!rhythm) return null;

  const todayItems = rhythm.today.items.slice(0, 3);
  const weekItems  = rhythm.thisWeek.items.slice(0, 3);
  const monthItems = rhythm.thisMonth.items.slice(0, 2);

  if (todayItems.length === 0 && weekItems.length === 0 && monthItems.length === 0) return null;

  const lines: string[] = ["Yönetim ritmi:"];

  if (todayItems.length > 0) {
    lines.push("Bugün:");
    for (const item of todayItems) {
      const detail = item.concreteNextStep ?? item.riskIfIgnored;
      const text   = detail && detail.length <= 100 ? `${item.title} ${detail}` : item.title;
      lines.push(`- ${text}`);
    }
  }

  if (weekItems.length > 0) {
    lines.push("Bu hafta:");
    for (const item of weekItems) {
      lines.push(`- ${item.title}`);
    }
  }

  if (monthItems.length > 0) {
    lines.push("Bu ay:");
    for (const item of monthItems) {
      const detail = item.riskIfIgnored;
      const text   = detail && detail.length <= 100 ? `${item.title} ${detail}` : item.title;
      lines.push(`- ${text}`);
    }
  }

  lines.push("- Bu bölümü zamansal odak sinyali olarak kullan; listeyi mekanik biçimde okuma.");

  return lines.join("\n");
}

function postureToUrgencyNote(posture: ExecutiveNarrativePosture): string | null {
  if (posture === "CRITICAL") return "Bu konuşmada aciliyet yüksek; kısa ve net ol.";
  if (posture === "PRESSURE") return "Sistemde baskı var; gereksiz konuya sapma.";
  return null;
}

function formatExecutiveFollowUpIntelligence(ctx: ExecutiveManagerContext): string | null {
  const fi = ctx.executiveFollowUpIntelligence;
  if (!fi) return null;

  const lines = ["Aksiyon icra takibi:"];
  lines.push(`- Özet: ${fi.summaryLine}`);
  lines.push(`- İcra değerlendirmesi: ${fi.executionScoreLabel}`);

  if (fi.topCriticalFollowUp) {
    lines.push(`- Kritik bekleyen: ${fi.topCriticalFollowUp}`);
  }

  if (fi.hasOverdue) {
    lines.push("- Gecikmiş aksiyon var; kullanıcı sormasa bile doğal bir cümlede hatırlat.");
  }

  lines.push("- Bu bölümü sistem etiketi gibi değil; doğal yönetici diliyle kullan. \"Dün önerdiğim X hâlâ açık görünüyor\" veya \"Son aksiyonlardan Y tamamlandı\" şeklinde konuşmaya entegre et.");

  return lines.join("\n");
}
