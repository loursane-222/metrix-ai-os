import type { ExecutiveDecisionPackage } from "@/lib/executive-brain/executive-brain.types";
import type { ExecutiveObjectionSignal, ExecutiveRecommendationAlternative, ExecutiveRecommendationPackage } from "./executive-recommendation.types";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { QuoteConversionIntelligence } from "@/lib/core/quotes/quote-conversion-intelligence-builder";
import type { NextMoveConfidence, RecommendedNextMove } from "@/lib/executive-operating-system/recommended-next-move.types";

export type BuildRecommendationInput = {
  decisionPackage: ExecutiveDecisionPackage;
  objection: ExecutiveObjectionSignal | null;
  quoteIntelligence?: QuoteIntelligence | null;
  conversionIntelligence?: QuoteConversionIntelligence | null;
};

export function buildExecutiveRecommendationPackage(
  input: BuildRecommendationInput,
): ExecutiveRecommendationPackage | null {
  const { decisionPackage, objection, quoteIntelligence, conversionIntelligence } = input;
  const { primaryDecision, supportingDecisions } = decisionPackage;

  if (!primaryDecision) return null;

  const primaryConfidenceLabel = resolveConfidenceLabel(primaryDecision.confidence);
  const primaryEvidence = buildPrimaryEvidence(primaryDecision.evidenceRefs, quoteIntelligence, conversionIntelligence);

  const alternatives = supportingDecisions
    .slice(0, 2)
    .map((d): ExecutiveRecommendationAlternative => ({
      title: d.title,
      rationale: d.rationale,
      tradeoff: d.risks.length > 0 ? d.risks[0] : "Daha az kesin sonuç beklenmeli.",
      whenToChoose: buildWhenToChoose(d.title),
      actions: d.recommendedActions.slice(0, 3),
    }));

  const objectionType = objection?.type ?? null;
  const objectionResponse = objection ? buildObjectionResponse(objection, alternatives) : null;
  const nextBestAlternative = objection && alternatives.length > 0 ? alternatives[0].title : null;
  const revisionTrigger = buildRevisionTrigger(primaryDecision.title, objection);
  const hasEnoughContext = primaryDecision.confidence >= 0.5 && primaryEvidence.length > 0;

  return {
    primaryAction: primaryDecision.title,
    primaryRationale: primaryDecision.rationale,
    primaryConfidenceLabel,
    primaryEvidence,
    alternatives,
    objectionType,
    objectionResponse,
    nextBestAlternative,
    revisionTrigger,
    hasEnoughContext,
  };
}

function resolveConfidenceLabel(confidence: number): "GÜÇLÜ" | "ORTA" | "TEMKİNLİ" {
  if (confidence >= 0.80) return "GÜÇLÜ";
  if (confidence >= 0.60) return "ORTA";
  return "TEMKİNLİ";
}

function buildPrimaryEvidence(
  evidenceRefs: string[],
  quoteIntelligence?: QuoteIntelligence | null,
  conversionIntelligence?: QuoteConversionIntelligence | null,
): string[] {
  const evidence: string[] = [...evidenceRefs.slice(0, 2)];

  if (quoteIntelligence?.executiveSummary) {
    evidence.push(quoteIntelligence.executiveSummary);
  }

  if (conversionIntelligence?.hasEnoughData && conversionIntelligence.conversionInsights.length > 0) {
    evidence.push(conversionIntelligence.conversionInsights[0]);
  }

  return evidence.slice(0, 4);
}

function buildWhenToChoose(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("satış") || t.includes("teklif") || t.includes("müşteri")) {
    return "Nakit akışı baskısı azaldığında ve satış kapasitesi hazır olduğunda.";
  }
  if (t.includes("tahsilat") || t.includes("alacak") || t.includes("ödeme")) {
    return "Mevcut alacak yükü kritik seviyeye ulaştığında.";
  }
  if (t.includes("ekip") || t.includes("personel") || t.includes("insan")) {
    return "Operasyonel kapasite büyümeyi kısıtlamaya başladığında.";
  }
  return "Mevcut öncelik tamamlandıktan sonra değerlendirilebilir.";
}

function buildObjectionResponse(
  objection: ExecutiveObjectionSignal,
  alternatives: ExecutiveRecommendationAlternative[],
): string {
  const alt = alternatives.length > 0 ? ` Alternatif olarak: ${alternatives[0].title}.` : "";

  switch (objection.type) {
    case "BUDGET_CONSTRAINT":
      return `Bütçe kısıtı anlaşıldı. Bu adım minimum maliyetle uygulanabilir ya da aşamalı başlanabilir.${alt}`;
    case "TIME_CONSTRAINT":
      return `Zaman sıkışıklığı not edildi. Bu adımın uygulaması kısa tutulabilir ya da ertelenebilir.${alt}`;
    case "TEAM_CONSTRAINT":
      return `Ekip kapasitesi sınırlı. Daha az kaynak gerektiren seçenekten başlanabilir.${alt}`;
    case "ALTERNATIVE_REQUEST":
      return `Alternatif bakış istendi.${alt}`;
    case "REJECTION":
      return `Ret not edildi. Farklı bir çerçeveden değerlendirilebilir.${alt}`;
    case "NEW_INFORMATION":
      return `Yeni bilgi alındı. Değerlendirme güncellendi.${alt}`;
  }
}

// ─── EOS / RecommendedNextMove → RecommendationPackage adapter ───────────────

export type BuildRecommendationFromNextMoveInput = {
  recommendedNextMove: RecommendedNextMove;
  objection: ExecutiveObjectionSignal | null;
  quoteIntelligence?: QuoteIntelligence | null;
  conversionIntelligence?: QuoteConversionIntelligence | null;
};

export function buildRecommendationPackageFromNextMove(
  input: BuildRecommendationFromNextMoveInput,
): ExecutiveRecommendationPackage | null {
  const { recommendedNextMove, objection, quoteIntelligence, conversionIntelligence } = input;

  if (recommendedNextMove.confidence === "low") return null;

  const primaryConfidenceLabel = resolveNextMoveConfidenceLabel(recommendedNextMove.confidence);
  const primaryEvidence = buildNextMovePrimaryEvidence(
    recommendedNextMove.expectedImpact,
    quoteIntelligence,
    conversionIntelligence,
  );

  const alternatives = recommendedNextMove.alternatives
    .slice(0, 2)
    .map((a): ExecutiveRecommendationAlternative => ({
      title: a.title,
      rationale: a.rationale,
      tradeoff: a.tradeOff,
      whenToChoose: buildWhenToChoose(a.title),
      actions: [],
    }));

  const objectionType = objection?.type ?? null;
  const objectionResponse = objection ? buildObjectionResponse(objection, alternatives) : null;
  const nextBestAlternative = objection && alternatives.length > 0 ? alternatives[0].title : null;
  const revisionTrigger =
    recommendedNextMove.followUpTrigger ??
    buildRevisionTrigger(recommendedNextMove.title, objection);

  return {
    primaryAction: recommendedNextMove.title,
    primaryRationale: recommendedNextMove.rationale,
    primaryConfidenceLabel,
    primaryEvidence,
    alternatives,
    objectionType,
    objectionResponse,
    nextBestAlternative,
    revisionTrigger,
    hasEnoughContext: true,
  };
}

function resolveNextMoveConfidenceLabel(confidence: NextMoveConfidence): "GÜÇLÜ" | "ORTA" | "TEMKİNLİ" {
  if (confidence === "high") return "GÜÇLÜ";
  if (confidence === "medium") return "ORTA";
  return "TEMKİNLİ";
}

function buildNextMovePrimaryEvidence(
  expectedImpact: string,
  quoteIntelligence?: QuoteIntelligence | null,
  conversionIntelligence?: QuoteConversionIntelligence | null,
): string[] {
  const evidence: string[] = [expectedImpact];

  if (quoteIntelligence?.executiveSummary) {
    evidence.push(quoteIntelligence.executiveSummary);
  }

  if (conversionIntelligence?.hasEnoughData && conversionIntelligence.conversionInsights.length > 0) {
    evidence.push(conversionIntelligence.conversionInsights[0]);
  }

  return evidence.slice(0, 4);
}

function buildRevisionTrigger(primaryTitle: string, objection: ExecutiveObjectionSignal | null): string {
  if (objection?.type === "NEW_INFORMATION") {
    return "Yeni bilgi paylaşıldığında bu kanaat güncellenir.";
  }
  if (objection?.type === "BUDGET_CONSTRAINT") {
    return "Bütçe durumu değiştiğinde veya yeni veri geldiğinde yeniden değerlendir.";
  }
  const t = primaryTitle.toLowerCase();
  if (t.includes("teklif") || t.includes("satış")) {
    return "Teklif durumu değiştiğinde veya yeni müşteri gelişmesi olduğunda güncelle.";
  }
  return "Koşullar değiştiğinde veya yeni öncelik belirlendiğinde yeniden değerlendir.";
}
