// ─── Executive Learning Value Engine V1 ──────────────────────────────────────
//
// Curiosity + Question + Opportunity → öğrenmenin iş değerini hesaplar.
// Kullanıcıya soru sormaz. Sadece ExecutiveLearningValue objesi üretir.
// Prisma import yok. DB çağrısı yok. async yok. Saf hesaplama.

import type { CuriosityReadinessGrade, GapTier } from "@/lib/executive-curiosity";
import type { ConversationOpportunity } from "@/lib/executive-conversation-opportunity";

import type {
  BuildExecutiveLearningValueInput,
  ExecutiveLearningValue,
  LearningBusinessImpact,
  LearningValueRecommendation,
} from "./executive-learning-value.types";

export function buildExecutiveLearningValue(
  input: BuildExecutiveLearningValueInput,
): ExecutiveLearningValue {
  const { curiosity, question, opportunity } = input;

  const tier = question.tier;
  const grade = question.readinessGrade;
  const completionRatio = curiosity.completionRatio;

  const valueScore = computeValueScore(tier, grade, completionRatio);
  const businessImpact = computeBusinessImpact(tier, grade);
  const decisionBlocking = computeDecisionBlocking(tier, businessImpact);
  const recommendation = computeRecommendation(opportunity, valueScore, businessImpact);
  const reason = buildReason(recommendation, tier, grade, valueScore, opportunity);

  return {
    generatedAt: new Date().toISOString(),
    targetKey: question.targetKey,
    targetLabel: question.targetLabel,
    valueScore,
    businessImpact,
    decisionBlocking,
    recommendation,
    finalQuestion: opportunity.selectedQuestion,
    reason,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeValueScore(
  tier: GapTier,
  grade: CuriosityReadinessGrade,
  completionRatio: number,
): number {
  const tierWeight = tierToWeight(tier);
  const gradeWeight = gradeToWeight(grade);
  const gapWeight = 1 - completionRatio;

  const raw = tierWeight * 0.5 + gradeWeight * 0.3 + gapWeight * 0.2;
  return Math.min(1.0, Math.max(0.0, parseFloat(raw.toFixed(3))));
}

function tierToWeight(tier: GapTier): number {
  switch (tier) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.75;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.25;
  }
}

function gradeToWeight(grade: CuriosityReadinessGrade): number {
  switch (grade) {
    case "F": return 1.0;
    case "D": return 0.8;
    case "C": return 0.6;
    case "B": return 0.4;
    case "A": return 0.0;
  }
}

function computeBusinessImpact(
  tier: GapTier,
  grade: CuriosityReadinessGrade,
): LearningBusinessImpact {
  if (tier === "CRITICAL") {
    if (grade === "F" || grade === "D") return "CRITICAL";
    if (grade === "C") return "HIGH";
    return "MEDIUM";
  }
  if (tier === "HIGH") {
    if (grade === "F" || grade === "D") return "HIGH";
    return "MEDIUM";
  }
  if (tier === "MEDIUM") {
    if (grade === "F" || grade === "D") return "MEDIUM";
    return "LOW";
  }
  return "LOW";
}

function computeDecisionBlocking(
  tier: GapTier,
  businessImpact: LearningBusinessImpact,
): boolean {
  return tier === "CRITICAL" || tier === "HIGH" || businessImpact === "CRITICAL";
}

function computeRecommendation(
  opportunity: ConversationOpportunity,
  valueScore: number,
  businessImpact: LearningBusinessImpact,
): LearningValueRecommendation {
  if (opportunity.timing === "SKIP") return "IGNORE";
  if (valueScore < 0.3) return "IGNORE";
  if (businessImpact === "LOW" && opportunity.timing === "NEXT_TURN") return "IGNORE";

  if (opportunity.shouldAskNow) {
    return valueScore >= 0.5 ? "ASK_NOW" : "ASK_LATER";
  }

  if (opportunity.timing === "NEXT_TURN" && valueScore >= 0.5) return "ASK_LATER";

  return "IGNORE";
}

function buildReason(
  recommendation: LearningValueRecommendation,
  tier: GapTier,
  grade: CuriosityReadinessGrade,
  valueScore: number,
  opportunity: ConversationOpportunity,
): string {
  const score = `Değer skoru: ${(valueScore * 100).toFixed(0)}%`;

  if (recommendation === "ASK_NOW") {
    return `${score} — ${tierLabel(tier)} öncelikli (${grade} notu), şimdi sorulacak. ${opportunity.reason}`;
  }
  if (recommendation === "ASK_LATER") {
    return `${score} — değeri yüksek ama şu an optimal pencere değil. ${opportunity.reason}`;
  }
  return `${score} — öğrenme değeri bu aşamada yetersiz. ${opportunity.reason}`;
}

function tierLabel(tier: GapTier): string {
  switch (tier) {
    case "CRITICAL": return "Kritik";
    case "HIGH":     return "Yüksek";
    case "MEDIUM":   return "Orta";
    case "LOW":      return "Düşük";
  }
}
